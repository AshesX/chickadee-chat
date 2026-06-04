import { useCallback, useEffect, useRef, useState } from 'react';
import type { PeerId } from '@chickadee/shared';
import { createPeerLink, type PeerLink } from '../webrtc/peerLink';
import type { MessageListener, Signaling } from './useSignaling';

export interface RemoteMedia {
  /** The remote peer's incoming MediaStream, once tracks arrive. */
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
}

export interface PeerMesh {
  localStream: MediaStream | null;
  /** True when the mic is live (not muted). False in listen-only mode. */
  micEnabled: boolean;
  /** Set when we couldn't get a mic (listen-only fallback). */
  micError: string | null;
  /** True when the local camera is on and sending video. */
  cameraEnabled: boolean;
  /** Set when the camera couldn't be turned on. */
  cameraError: string | null;
  /** Per-peer media keyed by peer id. */
  remote: Record<PeerId, RemoteMedia>;
  /** Start acquiring the mic early (called on Join so the prompt shows promptly). */
  prepareMedia: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
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
  const [micEnabled, setMicEnabled] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [remote, setRemote] = useState<Record<PeerId, RemoteMedia>>({});

  const linksRef = useRef<Map<PeerId, PeerLink>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const localStreamPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const selfIdRef = useRef<PeerId | null>(null);
  const micEnabledRef = useRef(true);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraEnabledRef = useRef(false);
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
      const current = prev[peerId] ?? { stream: null, connectionState: 'new' as const };
      return { ...prev, [peerId]: { ...current, ...patch } };
    });
  }, []);

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
        onRemoteStream: (stream) => patchRemote(peerId, { stream }),
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
      return link;
    },
    [send, patchRemote],
  );

  const closeLink = useCallback((peerId: PeerId) => {
    const link = linksRef.current.get(peerId);
    if (link) {
      link.close();
      linksRef.current.delete(peerId);
    }
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
    localStreamRef.current = null;
    localStreamPromiseRef.current = null;
    selfIdRef.current = null;
    micEnabledRef.current = true;
    videoTrackRef.current = null;
    cameraEnabledRef.current = false;
    setRemote({});
    setLocalStream(null);
    setMicEnabled(true);
    setMicError(null);
    setCameraEnabled(false);
    setCameraError(null);
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

  // React to signaling messages: set up / tear down links and route negotiation.
  useEffect(() => {
    const handle: MessageListener = (msg) => {
      switch (msg.type) {
        case 'welcome':
          selfIdRef.current = msg.selfId;
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
      }
    };
    return subscribe(handle);
  }, [subscribe, ensureLocalStream, ensureLink, closeLink]);

  // Tear everything down when the call ends (leave / disconnect / error).
  useEffect(() => {
    if (TERMINAL_STATUSES.has(status)) teardown();
  }, [status, teardown]);

  // Final cleanup on unmount.
  useEffect(() => teardown, [teardown]);

  return {
    localStream,
    micEnabled,
    micError,
    cameraEnabled,
    cameraError,
    remote,
    prepareMedia,
    toggleMic,
    toggleCamera,
  };
}
