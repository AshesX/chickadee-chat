import { useCallback, useEffect, useRef, useState } from 'react';
import type { PeerId } from '@chickadee/shared';
import { createPeerLink, type PeerLink } from '../webrtc/peerLink';
import type { MessageListener, Signaling } from './useSignaling';

export interface RemoteMedia {
  /** The peer's camera+mic stream (mic audio + optional camera video). */
  cameraStream: MediaStream | null;
  /** The peer's screen-share stream (screen video + optional system audio). */
  screenStream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
}

export interface PeerMesh {
  localStream: MediaStream | null;
  /** The local screen-share stream while sharing (for self-preview), else null. */
  localScreenStream: MediaStream | null;
  /** True when the mic is live (not muted). False in listen-only mode. */
  micEnabled: boolean;
  /** Set when we couldn't get a mic (listen-only fallback). */
  micError: string | null;
  /** True when the local camera is on and sending video. */
  cameraEnabled: boolean;
  /** Set when the camera couldn't be turned on. */
  cameraError: string | null;
  /** True while this client is sharing its screen. */
  sharingScreen: boolean;
  /** Set when screen sharing couldn't be started. */
  screenError: string | null;
  /** Per-peer media keyed by peer id. */
  remote: Record<PeerId, RemoteMedia>;
  /** Start acquiring the mic early (called on Join so the prompt shows promptly). */
  prepareMedia: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  /** Begin sharing the chosen desktop source (optionally with system audio). */
  startScreenShare: (sourceId: string, withAudio: boolean) => void;
  stopScreenShare: () => void;
}

const TERMINAL_STATUSES = new Set(['idle', 'closed', 'error', 'room-full']);

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};

/**
 * Owns the local mic stream and one RTCPeerConnection (peerLink) per remote
 * peer, driven entirely by signaling messages. The imperative WebRTC objects
 * live in refs; only render-relevant snapshots live in React state.
 */
export function usePeerMesh(signaling: Signaling): PeerMesh {
  const { subscribe, send, status } = signaling;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [remote, setRemote] = useState<Record<PeerId, RemoteMedia>>({});

  const linksRef = useRef<Map<PeerId, PeerLink>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const localStreamPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const selfIdRef = useRef<PeerId | null>(null);
  const micEnabledRef = useRef(true);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraEnabledRef = useRef(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const sharingScreenRef = useRef(false);
  /** peerId -> the MediaStream id that peer is using for its screen share. */
  const screenIdsRef = useRef<Map<PeerId, string>>(new Map());
  /** peerId -> (streamId -> received MediaStream), to (re)classify on demand. */
  const remoteStreamsRef = useRef<Map<PeerId, Map<string, MediaStream>>>(new Map());
  const disposedRef = useRef(false);

  const ensureLocalStream = useCallback((): Promise<MediaStream | null> => {
    if (localStreamPromiseRef.current) return localStreamPromiseRef.current;
    disposedRef.current = false;

    const promise = navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        // The call may have ended while the permission prompt was open; if so,
        // stop the freshly-acquired mic instead of leaving it live.
        if (disposedRef.current) {
          for (const track of stream.getTracks()) track.stop();
          return null;
        }
        localStreamRef.current = stream;
        for (const track of stream.getAudioTracks()) track.enabled = micEnabledRef.current;
        // Upgrade links created before the mic was ready (listen-only → sending).
        // Audio only — video is managed separately via setLocalVideoTrack.
        for (const link of linksRef.current.values()) {
          if (link.pc.getSenders().length === 0) {
            for (const track of stream.getAudioTracks()) link.pc.addTrack(track, stream);
          }
        }
        setLocalStream(stream);
        return stream;
      })
      .catch((err) => {
        console.error('getUserMedia failed', err);
        setMicError('No microphone available — you are in listen-only mode.');
        setMicEnabled(false);
        micEnabledRef.current = false;
        localStreamRef.current = null;
        return null;
      });

    localStreamPromiseRef.current = promise;
    return promise;
  }, []);

  const prepareMedia = useCallback(() => {
    void ensureLocalStream();
  }, [ensureLocalStream]);

  const patchRemote = useCallback((peerId: PeerId, patch: Partial<RemoteMedia>) => {
    setRemote((prev) => {
      const current = prev[peerId] ?? {
        cameraStream: null,
        screenStream: null,
        connectionState: 'new' as const,
      };
      return { ...prev, [peerId]: { ...current, ...patch } };
    });
  }, []);

  // Sort a peer's received streams into camera vs screen slots, matching the
  // screen by the id the peer announced (via screen-state / welcome). Recomputed
  // whenever a stream arrives or the announced screen id changes, so it is
  // robust to either ordering.
  const recomputeRemote = useCallback(
    (peerId: PeerId) => {
      const streams = remoteStreamsRef.current.get(peerId);
      const screenId = screenIdsRef.current.get(peerId);
      let cameraStream: MediaStream | null = null;
      let screenStream: MediaStream | null = null;
      if (streams) {
        for (const [id, stream] of streams) {
          if (screenId && id === screenId) screenStream = stream;
          else cameraStream = stream;
        }
      }
      patchRemote(peerId, { cameraStream, screenStream });
    },
    [patchRemote],
  );

  const recordRemoteStream = useCallback(
    (peerId: PeerId, stream: MediaStream) => {
      let byId = remoteStreamsRef.current.get(peerId);
      if (!byId) {
        byId = new Map();
        remoteStreamsRef.current.set(peerId, byId);
      }
      byId.set(stream.id, stream);
      recomputeRemote(peerId);
    },
    [recomputeRemote],
  );

  const ensureLink = useCallback(
    (peerId: PeerId): PeerLink => {
      const existing = linksRef.current.get(peerId);
      if (existing) return existing;

      // Deterministic, symmetric-opposite politeness so both ends agree.
      const selfId = selfIdRef.current;
      const polite = selfId != null ? selfId < peerId : true;

      const link = createPeerLink({
        peerId,
        polite,
        localStream: localStreamRef.current,
        send,
        onRemoteStream: (stream) => recordRemoteStream(peerId, stream),
        onConnectionState: (connectionState) => patchRemote(peerId, { connectionState }),
      });

      linksRef.current.set(peerId, link);
      patchRemote(peerId, { connectionState: link.pc.connectionState });

      // A peer joining while our camera is already on should receive video.
      const videoTrack = videoTrackRef.current;
      const stream = localStreamRef.current;
      if (cameraEnabledRef.current && videoTrack && stream) {
        link.setLocalVideoTrack(videoTrack, stream);
      }
      // ...and our ongoing screen share, if any.
      if (sharingScreenRef.current && screenStreamRef.current) {
        link.setLocalScreenStream(screenStreamRef.current);
      }
      return link;
    },
    [send, patchRemote, recordRemoteStream],
  );

  const closeLink = useCallback((peerId: PeerId) => {
    const link = linksRef.current.get(peerId);
    if (link) {
      link.close();
      linksRef.current.delete(peerId);
    }
    remoteStreamsRef.current.delete(peerId);
    screenIdsRef.current.delete(peerId);
    setRemote((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const teardown = useCallback(() => {
    disposedRef.current = true;
    for (const link of linksRef.current.values()) link.close();
    linksRef.current.clear();
    const stream = localStreamRef.current;
    if (stream) for (const track of stream.getTracks()) track.stop();
    const screen = screenStreamRef.current;
    if (screen) for (const track of screen.getTracks()) track.stop();
    localStreamRef.current = null;
    localStreamPromiseRef.current = null;
    selfIdRef.current = null;
    micEnabledRef.current = true;
    videoTrackRef.current = null;
    cameraEnabledRef.current = false;
    screenStreamRef.current = null;
    sharingScreenRef.current = false;
    screenIdsRef.current.clear();
    remoteStreamsRef.current.clear();
    setRemote({});
    setLocalStream(null);
    setLocalScreenStream(null);
    setMicEnabled(true);
    setMicError(null);
    setCameraEnabled(false);
    setCameraError(null);
    setSharingScreen(false);
    setScreenError(null);
  }, []);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return; // listen-only: nothing to toggle
    const next = !micEnabledRef.current;
    micEnabledRef.current = next;
    for (const track of stream.getAudioTracks()) track.enabled = next;
    setMicEnabled(next);
    send({ type: 'mic-state', muted: !next });
  }, [send]);

  const stopCamera = useCallback(() => {
    const videoTrack = videoTrackRef.current;
    for (const link of linksRef.current.values()) {
      if (localStreamRef.current) link.setLocalVideoTrack(null, localStreamRef.current);
    }
    if (videoTrack) {
      videoTrack.stop();
      localStreamRef.current?.removeTrack(videoTrack);
    }
    videoTrackRef.current = null;
    cameraEnabledRef.current = false;
    setCameraEnabled(false);
    send({ type: 'cam-state', on: false });
  }, [send]);

  const toggleCamera = useCallback(() => {
    if (cameraEnabledRef.current) {
      stopCamera();
      return;
    }
    setCameraError(null);
    void (async () => {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS });
        const videoTrack = camStream.getVideoTracks()[0];
        if (!videoTrack) return;

        // Need the audio stream to group the track onto; ensure it exists.
        const base = (await ensureLocalStream()) ?? localStreamRef.current;
        if (disposedRef.current || !base) {
          videoTrack.stop();
          return;
        }

        videoTrackRef.current = videoTrack;
        cameraEnabledRef.current = true;
        base.addTrack(videoTrack);
        for (const link of linksRef.current.values()) link.setLocalVideoTrack(videoTrack, base);
        // Auto-disable if the camera is unplugged or revoked.
        videoTrack.onended = () => stopCamera();

        setCameraEnabled(true);
        send({ type: 'cam-state', on: true });
      } catch (err) {
        console.error('camera getUserMedia failed', err);
        setCameraError('Could not start the camera.');
      }
    })();
  }, [send, ensureLocalStream, stopCamera]);

  const stopScreenShare = useCallback(() => {
    for (const link of linksRef.current.values()) link.setLocalScreenStream(null);
    const screen = screenStreamRef.current;
    if (screen) for (const track of screen.getTracks()) track.stop();
    screenStreamRef.current = null;
    sharingScreenRef.current = false;
    setSharingScreen(false);
    setLocalScreenStream(null);
    send({ type: 'screen-state', streamId: null });
  }, [send]);

  const startScreenShare = useCallback(
    (sourceId: string, withAudio: boolean) => {
      if (sharingScreenRef.current) return;
      setScreenError(null);

      if (!window.chickadee?.setShareSource) {
        setScreenError('Screen sharing is unavailable (preload bridge not loaded).');
        return;
      }

      void (async () => {
        try {
          // Tell main which source the picker chose; the main process's
          // setDisplayMediaRequestHandler fulfils the getDisplayMedia request
          // with it (and Windows loopback audio when requested).
          await window.chickadee.setShareSource(sourceId, withAudio);

          let screen: MediaStream;
          try {
            screen = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: withAudio,
            });
          } catch (audioErr) {
            if (!withAudio) throw audioErr;
            // System-audio capture can fail (e.g. some window shares); retry video-only.
            console.warn('screen audio capture failed, retrying video-only', audioErr);
            await window.chickadee.setShareSource(sourceId, false);
            screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          }

          if (disposedRef.current) {
            for (const track of screen.getTracks()) track.stop();
            return;
          }

          screenStreamRef.current = screen;
          sharingScreenRef.current = true;
          for (const link of linksRef.current.values()) link.setLocalScreenStream(screen);
          // The OS "Stop sharing" affordance / closing the source ends the track.
          const videoTrack = screen.getVideoTracks()[0];
          if (videoTrack) videoTrack.onended = () => stopScreenShare();

          setSharingScreen(true);
          setLocalScreenStream(screen);
          send({ type: 'screen-state', streamId: screen.id });
        } catch (err) {
          console.error('screen share failed', err);
          setScreenError('Could not start screen share.');
        }
      })();
    },
    [send, stopScreenShare],
  );

  // React to signaling messages: set up / tear down links and route negotiation.
  useEffect(() => {
    const handle: MessageListener = (msg) => {
      switch (msg.type) {
        case 'welcome':
          selfIdRef.current = msg.selfId;
          for (const peer of msg.peers) {
            if (peer.screenStreamId) screenIdsRef.current.set(peer.id, peer.screenStreamId);
          }
          void (async () => {
            await ensureLocalStream();
            for (const peer of msg.peers) ensureLink(peer.id);
          })();
          break;
        case 'peer-joined':
          ensureLink(msg.peer.id);
          break;
        case 'peer-left':
          closeLink(msg.peerId);
          break;
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          void ensureLink(msg.from).handleSignal(msg);
          break;
        case 'screen-state':
          if (msg.streamId) screenIdsRef.current.set(msg.from, msg.streamId);
          else screenIdsRef.current.delete(msg.from);
          recomputeRemote(msg.from);
          break;
      }
    };
    return subscribe(handle);
  }, [subscribe, ensureLocalStream, ensureLink, closeLink, recomputeRemote]);

  // Tear everything down when the call ends (leave / disconnect / error).
  useEffect(() => {
    if (TERMINAL_STATUSES.has(status)) teardown();
  }, [status, teardown]);

  // Final cleanup on unmount.
  useEffect(() => teardown, [teardown]);

  return {
    localStream,
    localScreenStream,
    micEnabled,
    micError,
    cameraEnabled,
    cameraError,
    sharingScreen,
    screenError,
    remote,
    prepareMedia,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
  };
}
