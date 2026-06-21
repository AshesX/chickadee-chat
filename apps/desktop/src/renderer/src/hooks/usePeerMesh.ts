import { useCallback, useEffect, useRef, useState } from 'react';
import type { PeerId } from '@chickadee/shared';
import { createPeerLink, type PeerLink } from '../webrtc/peerLink';
import type { MessageListener, Signaling } from './useSignaling';
import { getSharedAudioContext } from '../lib/audioContext';

/**
 * `restrictOwnAudio` (Chromium 141+) tells the display-capture pipeline to drop
 * audio that originates from our own document — i.e. the incoming peer voices we
 * play through the Web Audio graph — from the captured system audio, so screen
 * sharing no longer echoes everyone's voice back to them. It's experimental and
 * not yet in the lib.dom typings, so we extend the constraint type locally.
 */
type ScreenAudioConstraints = MediaTrackConstraints & { restrictOwnAudio?: ConstrainBoolean };

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
  /** Explicitly set mic transmit state (used by push-to-talk). */
  setMicEnabled: (on: boolean) => void;
  /** Apply Chromium's noise-suppression constraint to the local mic. */
  setNoiseSuppression: (on: boolean) => void;
  /** Apply Chromium's echo-cancellation constraint to the local mic. */
  setEchoCancellation: (on: boolean) => void;
  /** Apply Chromium's automatic-gain-control constraint to the local mic. */
  setAutoGainControl: (on: boolean) => void;
  /** Switch the mic input device, re-acquiring the stream and swapping senders. */
  setInputDevice: (deviceId: string) => void;
  toggleCamera: () => void;
  /** Begin sharing the chosen desktop source (optionally with system audio). */
  startScreenShare: (sourceId: string, withAudio: boolean) => void;
  stopScreenShare: () => void;
  analyserNode: AnalyserNode | null;
  expanderGainNode: GainNode | null;
  teardown: () => void;
}

const TERMINAL_STATUSES = new Set(['idle', 'closed', 'error', 'room-full']);

const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4K': { width: 3840, height: 2160 },
};

const MIC_ANALYSER_FFT_SIZE = 256;

function createMicProcessingGraph(
  ctx: AudioContext,
  rawStream: MediaStream,
  volume: number,
): { gainNode: GainNode; analyserNode: AnalyserNode; expanderGainNode: GainNode; processedStream: MediaStream } {
  const source = ctx.createMediaStreamSource(rawStream);
  const gainNode = ctx.createGain();
  gainNode.gain.value = volume;
  const analyserNode = ctx.createAnalyser();
  analyserNode.fftSize = MIC_ANALYSER_FFT_SIZE;
  // Downward-expander gain, driven by useNoiseExpander in open-mic mode.
  // Starts transparent (0 dB); the analyser taps the signal *before* it so
  // detection always sees the true pre-attenuation level.
  const expanderGainNode = ctx.createGain();
  expanderGainNode.gain.value = 1;
  const destination = ctx.createMediaStreamDestination();

  source.connect(gainNode);
  gainNode.connect(analyserNode);
  gainNode.connect(expanderGainNode);
  expanderGainNode.connect(destination);

  return { gainNode, analyserNode, expanderGainNode, processedStream: destination.stream };
}

/**
 * Owns the local mic stream and one RTCPeerConnection (peerLink) per remote
 * peer, driven entirely by signaling messages. The imperative WebRTC objects
 * live in refs; only render-relevant snapshots live in React state.
 */
export function usePeerMesh(
  signaling: Signaling,
  iceServers: RTCIceServer[],
  noiseSuppression: boolean,
  micVolume: number,
  cameraResolution: string,
  cameraFramerate: string,
  screenResolution: string,
  screenFramerate: string,
  echoCancellation: boolean,
  autoGainControl: boolean,
  inputDeviceId: string,
  localAvatarUrl: string | null,
  localVoicePreference: string,
  localAccentColor: string,
): PeerMesh {
  const { subscribe, send, status } = signaling;

  // Kept in a ref so the stable ensureLink callback always sees the latest set.
  const iceServersRef = useRef(iceServers);
  iceServersRef.current = iceServers;
  const nsRef = useRef(noiseSuppression);
  nsRef.current = noiseSuppression;
  const ecRef = useRef(echoCancellation);
  ecRef.current = echoCancellation;
  const agcRef = useRef(autoGainControl);
  agcRef.current = autoGainControl;
  const inputDeviceIdRef = useRef(inputDeviceId);
  inputDeviceIdRef.current = inputDeviceId;
  const micVolumeRef = useRef(micVolume);
  micVolumeRef.current = micVolume;

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const expanderGainNodeRef = useRef<GainNode | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);

  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [expanderGainNode, setExpanderGainNode] = useState<GainNode | null>(null);

  const localAvatarUrlRef = useRef<string | null>(localAvatarUrl);
  localAvatarUrlRef.current = localAvatarUrl;
  const localVoicePreferenceRef = useRef<string>(localVoicePreference);
  localVoicePreferenceRef.current = localVoicePreference;
  const localAccentColorRef = useRef<string>(localAccentColor);
  localAccentColorRef.current = localAccentColor;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [micError, setMicErrorState] = useState<string | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraErrorState] = useState<string | null>(null);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [screenError, setScreenErrorState] = useState<string | null>(null);

  const cameraErrorTimeoutRef = useRef<any>(null);
  const screenErrorTimeoutRef = useRef<any>(null);
  const micErrorTimeoutRef = useRef<any>(null);

  const setCameraError = useCallback((msg: string | null) => {
    if (cameraErrorTimeoutRef.current) {
      clearTimeout(cameraErrorTimeoutRef.current);
      cameraErrorTimeoutRef.current = null;
    }
    setCameraErrorState(msg);
    if (msg) {
      cameraErrorTimeoutRef.current = setTimeout(() => {
        setCameraErrorState(null);
        cameraErrorTimeoutRef.current = null;
      }, 3000);
    }
  }, []);

  const setScreenError = useCallback((msg: string | null) => {
    if (screenErrorTimeoutRef.current) {
      clearTimeout(screenErrorTimeoutRef.current);
      screenErrorTimeoutRef.current = null;
    }
    setScreenErrorState(msg);
    if (msg) {
      screenErrorTimeoutRef.current = setTimeout(() => {
        setScreenErrorState(null);
        screenErrorTimeoutRef.current = null;
      }, 3000);
    }
  }, []);

  const setMicError = useCallback((msg: string | null) => {
    if (micErrorTimeoutRef.current) {
      clearTimeout(micErrorTimeoutRef.current);
      micErrorTimeoutRef.current = null;
    }
    setMicErrorState(msg);
    if (msg) {
      micErrorTimeoutRef.current = setTimeout(() => {
        setMicErrorState(null);
        micErrorTimeoutRef.current = null;
      }, 3000);
    }
  }, []);
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
  /** Peers who don't want incoming video (docked/compact) — we pause video to them. */
  const peersNoVideoRef = useRef<Set<PeerId>>(new Set());
  /** peerId -> (streamId -> received MediaStream), to (re)classify on demand. */
  const remoteStreamsRef = useRef<Map<PeerId, Map<string, MediaStream>>>(new Map());
  const disposedRef = useRef(false);

  const ensureLocalStream = useCallback((): Promise<MediaStream | null> => {
    if (localStreamPromiseRef.current) return localStreamPromiseRef.current;
    disposedRef.current = false;

    const promise = navigator.mediaDevices
      .getUserMedia({
        audio: {
          deviceId: inputDeviceIdRef.current ? { exact: inputDeviceIdRef.current } : undefined,
          echoCancellation: ecRef.current,
          autoGainControl: agcRef.current,
          noiseSuppression: nsRef.current,
        },
        video: false,
      })
      .then((stream) => {
        // The call may have ended while the permission prompt was open; if so,
        // stop the freshly-acquired mic instead of leaving it live.
        if (disposedRef.current) {
          for (const track of stream.getTracks()) track.stop();
          return null;
        }

        rawStreamRef.current = stream;

        const ctx = getSharedAudioContext();
        if (!ctx) {
          // AudioContext unavailable; fall back to raw stream (no volume control or analysis).
          localStreamRef.current = stream;
          setAnalyserNode(null);
          setExpanderGainNode(null);
          setLocalStream(stream);
          return stream;
        }

        const { gainNode, analyserNode: analyserNodeObj, expanderGainNode: expanderGainNodeObj, processedStream } =
          createMicProcessingGraph(ctx, stream, micVolumeRef.current);

        audioContextRef.current = ctx;
        gainNodeRef.current = gainNode;
        analyserNodeRef.current = analyserNodeObj;
        expanderGainNodeRef.current = expanderGainNodeObj;
        localStreamRef.current = processedStream;

        // The processed track is a synthetic Web Audio (MediaStreamDestination) output,
        // so it carries none of Chromium's mic DSP (AEC/NS/AGC) — those are applied (or
        // not) on the raw device track per the user's settings. Only the mute state
        // applies here; calling applyConstraints to "disable" that DSP throws
        // OverconstrainedError on a synthetic track and is a no-op regardless.
        for (const track of processedStream.getAudioTracks()) {
          track.enabled = micEnabledRef.current;
        }
        // Upgrade links created before the mic was ready (listen-only → sending).
        // Audio only — video is managed separately via setLocalVideoTrack.
        for (const link of linksRef.current.values()) {
          if (link.pc.getSenders().length === 0) {
            for (const track of processedStream.getAudioTracks()) link.pc.addTrack(track, processedStream);
          }
        }
        
        setAnalyserNode(analyserNodeObj);
        setExpanderGainNode(expanderGainNodeObj);
        setLocalStream(processedStream);
        return processedStream;
      })
      .catch((err) => {
        console.error('getUserMedia failed', err);
        setMicError('No microphone available — you are in listen-only mode.');
        setMicEnabled(false);
        micEnabledRef.current = false;
        localStreamRef.current = null;
        setAnalyserNode(null);
        setExpanderGainNode(null);
        return null;
      });

    localStreamPromiseRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = micVolume;
    }
  }, [micVolume]);

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
        iceServers: iceServersRef.current,
        send,
        onRemoteStream: (stream) => recordRemoteStream(peerId, stream),
        onConnectionState: (connectionState) => patchRemote(peerId, { connectionState }),
      });

      linksRef.current.set(peerId, link);
      patchRemote(peerId, { connectionState: link.pc.connectionState });

      // If this peer is docked (doesn't want video), pause before applying tracks
      // so the camera/screen video is held (audio still flows) from the first frame.
      if (peersNoVideoRef.current.has(peerId)) link.setVideoPaused(true);

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
    const rawStream = rawStreamRef.current;
    if (rawStream) for (const track of rawStream.getTracks()) track.stop();
    const stream = localStreamRef.current;
    if (stream) for (const track of stream.getTracks()) track.stop();
    const screen = screenStreamRef.current;
    if (screen) for (const track of screen.getTracks()) track.stop();
    
    // Disconnect mic processing nodes but do not close the shared AudioContext —
    // it is owned by lib/audioContext.ts and shared with sfx.ts across join/leave cycles.
    if (gainNodeRef.current) { gainNodeRef.current.disconnect(); gainNodeRef.current = null; }
    if (analyserNodeRef.current) { analyserNodeRef.current.disconnect(); analyserNodeRef.current = null; }
    if (expanderGainNodeRef.current) { expanderGainNodeRef.current.disconnect(); expanderGainNodeRef.current = null; }
    audioContextRef.current = null;
    rawStreamRef.current = null;
    setAnalyserNode(null);
    setExpanderGainNode(null);

    localStreamRef.current = null;
    localStreamPromiseRef.current = null;
    selfIdRef.current = null;
    micEnabledRef.current = true;
    videoTrackRef.current = null;
    cameraEnabledRef.current = false;
    screenStreamRef.current = null;
    sharingScreenRef.current = false;
    screenIdsRef.current.clear();
    peersNoVideoRef.current.clear();
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

  const setMicEnabledExt = useCallback(
    (on: boolean) => {
      const stream = localStreamRef.current;
      if (!stream) return; // listen-only: nothing to toggle
      if (micEnabledRef.current === on) return;
      micEnabledRef.current = on;
      for (const track of stream.getAudioTracks()) track.enabled = on;
      setMicEnabled(on);
      // NOTE: mic-state (mute intent) is broadcast from App.tsx, not here — the
      // VAD/PTT transmit gate calls this on every edge, which would spam the room
      // and flicker remote mute icons. The transmit gate only toggles track.enabled.
    },
    [],
  );

  const toggleMic = useCallback(() => {
    setMicEnabledExt(!micEnabledRef.current);
  }, [setMicEnabledExt]);

  // Apply a device-level audio constraint live to the raw mic track (the
  // processed/destination track ignores these); best-effort, fully applies on
  // the next mic acquisition.
  const applyMicConstraint = useCallback((constraint: MediaTrackConstraints) => {
    const raw = rawStreamRef.current;
    if (!raw) return;
    for (const track of raw.getAudioTracks()) {
      void track.applyConstraints(constraint).catch(() => {
        /* best-effort */
      });
    }
  }, []);

  const setNoiseSuppression = useCallback((on: boolean) => {
    nsRef.current = on;
    applyMicConstraint({ noiseSuppression: on });
  }, [applyMicConstraint]);

  const setEchoCancellation = useCallback((on: boolean) => {
    ecRef.current = on;
    applyMicConstraint({ echoCancellation: on });
  }, [applyMicConstraint]);

  const setAutoGainControl = useCallback((on: boolean) => {
    agcRef.current = on;
    applyMicConstraint({ autoGainControl: on });
  }, [applyMicConstraint]);

  // Switch the mic input device: acquire a new device stream, rebuild the
  // processing graph, carry over any camera video track, swap the audio track
  // on every live link, then dispose the old device + graph.
  const setInputDevice = useCallback((deviceId: string) => {
    inputDeviceIdRef.current = deviceId;
    const oldRaw = rawStreamRef.current;
    if (!oldRaw) return; // not yet acquired — applies on next ensureLocalStream
    void (async () => {
      try {
        const newRaw = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            echoCancellation: ecRef.current,
            autoGainControl: agcRef.current,
            noiseSuppression: nsRef.current,
          },
          video: false,
        });
        if (disposedRef.current) {
          for (const t of newRaw.getTracks()) t.stop();
          return;
        }

        const ctx = getSharedAudioContext();
        const videoTrack = videoTrackRef.current;
        const oldProcessed = localStreamRef.current;

        let nextStream: MediaStream;
        if (ctx) {
          const { gainNode, analyserNode: newAnalyser, processedStream } =
            createMicProcessingGraph(ctx, newRaw, micVolumeRef.current);
          if (gainNodeRef.current) gainNodeRef.current.disconnect();
          if (analyserNodeRef.current) analyserNodeRef.current.disconnect();
          gainNodeRef.current = gainNode;
          analyserNodeRef.current = newAnalyser;
          setAnalyserNode(newAnalyser);
          nextStream = processedStream;
          // (Synthetic MediaStreamDestination track — no Chromium mic DSP to disable;
          // mute state is applied to nextStream below.)
        } else {
          setAnalyserNode(null);
          nextStream = newRaw;
        }

        if (videoTrack) nextStream.addTrack(videoTrack);
        for (const track of nextStream.getAudioTracks()) track.enabled = micEnabledRef.current;

        for (const link of linksRef.current.values()) {
          if (link.pc.getSenders().length === 0) {
            for (const track of nextStream.getAudioTracks()) link.pc.addTrack(track, nextStream);
          } else {
            for (const track of nextStream.getAudioTracks()) link.setLocalAudioTrack(track, nextStream);
          }
        }

        for (const t of oldRaw.getTracks()) t.stop();
        if (oldProcessed && oldProcessed !== newRaw) {
          for (const t of oldProcessed.getAudioTracks()) t.stop();
        }

        rawStreamRef.current = newRaw;
        localStreamRef.current = nextStream;
        localStreamPromiseRef.current = Promise.resolve(nextStream);
        setLocalStream(nextStream);
      } catch (err) {
        console.error('input device switch failed', err);
      }
    })();
  }, []);

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
        const res = RESOLUTION_MAP[cameraResolution] || RESOLUTION_MAP['720p'];
        const fps = parseInt(cameraFramerate, 10) || 30;
        const camStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: res.width }, 
            height: { ideal: res.height }, 
            frameRate: { ideal: fps } 
          } 
        });
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

          // When capturing system audio, ask Chromium to exclude our own document's
          // audio (the peer voices we play locally) so peers don't hear themselves.
          // Feature-detect — on builds without restrictOwnAudio, fall back to plain
          // loopback audio (the pre-existing, echo-prone behavior).
          const restrictOwnAudioSupported =
            'restrictOwnAudio' in navigator.mediaDevices.getSupportedConstraints();
          const audioConstraints: boolean | ScreenAudioConstraints = withAudio
            ? restrictOwnAudioSupported
              ? { restrictOwnAudio: true }
              : true
            : false;

          let screen: MediaStream;
          try {
            const res = RESOLUTION_MAP[screenResolution] || RESOLUTION_MAP['1080p'];
            const fps = parseInt(screenFramerate, 10) || 30;
            const videoConstraints = {
              width: { ideal: res.width },
              height: { ideal: res.height },
              frameRate: { ideal: fps }
            };
            screen = await navigator.mediaDevices.getDisplayMedia({
              video: videoConstraints,
              audio: audioConstraints,
            });
          } catch (audioErr) {
            if (!withAudio) throw audioErr;
            // System-audio capture can fail (e.g. some window shares); retry video-only.
            console.warn('screen audio capture failed, retrying video-only', audioErr);
            await window.chickadee.setShareSource(sourceId, false);
            const res = RESOLUTION_MAP[screenResolution] || RESOLUTION_MAP['1080p'];
            const fps = parseInt(screenFramerate, 10) || 30;
            screen = await navigator.mediaDevices.getDisplayMedia({ 
              video: {
                width: { ideal: res.width },
                height: { ideal: res.height },
                frameRate: { ideal: fps }
              }, 
              audio: false 
            });
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

  // After a reconnect the server reset our peer to defaults; re-broadcast any
  // non-default local state so others' tiles reflect reality.
  const reannounceLocalState = useCallback(() => {
    // mic-state (mute intent) is re-announced by App.tsx's broadcast effect (keyed
    // on signaling.status), so it isn't sent here.
    if (cameraEnabledRef.current) send({ type: 'cam-state', on: true });
    if (sharingScreenRef.current && screenStreamRef.current) {
      send({ type: 'screen-state', streamId: screenStreamRef.current.id });
    }
    // Re-broadcast avatar so the server's fresh peer record reflects the current avatar.
    send({ type: 'avatar-state', avatarDataUrl: localAvatarUrlRef.current });
    // Re-broadcast voice preference so peers read our chat aloud in the right voice after reconnect.
    send({ type: 'voice-state', voicePreference: localVoicePreferenceRef.current });
    // Re-broadcast accent color so the server's fresh peer record reflects the chosen color.
    send({ type: 'accent-state', accentColor: localAccentColorRef.current });
  }, [send]);

  // React to signaling messages: set up / tear down links and route negotiation.
  useEffect(() => {
    const handle: MessageListener = (msg) => {
      switch (msg.type) {
        case 'welcome': {
          // A second welcome means we reconnected with a fresh identity: peers
          // tore down their links to our old id when our socket dropped, so
          // rebuild every link from scratch (local media streams are kept).
          const isReconnect = selfIdRef.current !== null;
          selfIdRef.current = msg.selfId;
          for (const link of linksRef.current.values()) link.close();
          linksRef.current.clear();
          remoteStreamsRef.current.clear();
          screenIdsRef.current.clear();
          setRemote({});
          peersNoVideoRef.current.clear();
          for (const peer of msg.peers) {
            if (peer.screenStreamId) screenIdsRef.current.set(peer.id, peer.screenStreamId);
            // Seed before ensureLink so we never send the first video frame to a docked peer.
            if (peer.wantsVideo === false) peersNoVideoRef.current.add(peer.id);
          }
          void (async () => {
            await ensureLocalStream();
            for (const peer of msg.peers) ensureLink(peer.id);
            // The server reset our peer to defaults; re-tell the room our state.
            if (isReconnect) reannounceLocalState();
          })();
          break;
        }
        case 'peer-joined':
          // Seed before ensureLink so a peer that joined while docked never gets the first video frame.
          if (msg.peer.wantsVideo === false) peersNoVideoRef.current.add(msg.peer.id);
          ensureLink(msg.peer.id);
          break;
        case 'peer-left':
          peersNoVideoRef.current.delete(msg.peerId);
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
        case 'sink-state':
          // A peer docked/undocked: pause or resume the video we send to just them
          // (their screen-share audio keeps flowing either way).
          if (msg.wantsVideo) peersNoVideoRef.current.delete(msg.from);
          else peersNoVideoRef.current.add(msg.from);
          linksRef.current.get(msg.from)?.setVideoPaused(!msg.wantsVideo);
          break;
      }
    };
    return subscribe(handle);
  }, [subscribe, ensureLocalStream, ensureLink, closeLink, recomputeRemote, reannounceLocalState]);

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
    setMicEnabled: setMicEnabledExt,
    setNoiseSuppression,
    setEchoCancellation,
    setAutoGainControl,
    setInputDevice,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    analyserNode,
    expanderGainNode,
    teardown,
  };
}
