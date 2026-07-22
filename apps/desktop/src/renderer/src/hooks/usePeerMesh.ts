import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioQuality, PeerId, VideoQuality } from '@chickadee/shared';
import { createPeerLink, type PeerLink } from '../webrtc/peerLink';
import type { MessageListener, Signaling } from './useSignaling';
import { getSharedAudioContext } from '../lib/audioContext';
import { buildMicAudioConstraints, buildVideoCaptureConstraints, createMicProcessingGraph } from '../webrtc/mediaConstraints';
import { deriveWants, classifyPeerStreams } from '../webrtc/meshLogic';
import { computeMeshEncoding, type MeshEncoding } from '../webrtc/encodingParams';
import {
  HEALTH_TICK_MS,
  deriveHealthUi,
  evaluateHealth,
  initialHealth,
  reconcileMesh,
  sumInboundAudioPackets,
  type HealthPhase,
  type HealthUi,
  type LinkHealth,
} from '../webrtc/connectionHealthPolicy';
import { useAutoClearError } from './useAutoClearError';

export interface RemoteMedia {
  /** The peer's camera+mic stream (mic audio + optional camera video). */
  cameraStream: MediaStream | null;
  /**
   * The id of the camera video track on `cameraStream`, or null when there's no
   * video yet. Camera video shares the mic stream's msid, so a gated video track
   * arriving after "Watch" lands in the *same* MediaStream object — `cameraStream`
   * keeps a stable reference (the audio graph must not rebuild) while this scalar
   * flips null → trackId so the tile knows to re-bind its <video>.
   */
  cameraVideoId: string | null;
  /** The peer's screen-share stream (screen video + optional system audio). */
  screenStream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  /**
   * Stats-derived link health from the monitor (connectionState can claim
   * 'connected' while RTP is dead): 'recovering' while a restart/relink is in
   * flight, 'failed' after the escalation ladder gives up.
   */
  health: HealthUi;
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
  teardown: () => void;
  setCameraError: (error: string | null) => void;
}

const TERMINAL_STATUSES = new Set(['idle', 'closed', 'error', 'room-full']);

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
  videoQuality: VideoQuality,
  audioQuality: AudioQuality,
  echoCancellation: boolean,
  autoGainControl: boolean,
  inputDeviceId: string,
  localAvatarUrl: string | null,
  localVoicePreference: string,
  localAccentColor: string,
  localUserId: string,
  /** Which of our streams (if any) currently holds the room stage — its encoding
   *  becomes high-quality (budget-clamped); everything else is a thumbnail. */
  stageKind: 'screen' | 'camera' | null,
  /** How many peers are subscribed to our stage stream (drives the adaptive budget). */
  stageWatcherCount: number,
  /** Total outbound budget (bits/sec) for the stage stream across all viewers; 0 = unlimited. */
  uploadBudgetBps: number,
  /** Notified on every per-link health transition (for the connection SFX cue). */
  onHealthChange?: (peerId: PeerId, health: HealthUi) => void,
): PeerMesh {
  const { subscribe, send, status, peers } = signaling;

  const onHealthChangeRef = useRef(onHealthChange);
  onHealthChangeRef.current = onHealthChange;

  // Presence mirror for the health monitor's reconciliation backstop (the
  // stable tick callback must read the latest roster without re-subscribing).
  const peersRef = useRef(peers);
  peersRef.current = peers;

  // Our stable userId, used to decide whether a viewer's subscription set
  // includes us (so we should send them video/screen-audio). In a ref so the
  // stable message handler/ensureLink always read the latest value.
  const localUserIdRef = useRef(localUserId);
  localUserIdRef.current = localUserId;

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

  // Current outbound encoding config (bitrate/framerate caps + Opus target),
  // derived from the video settings + quality tier. Kept in a ref so each
  // peerLink reads the latest via getEncoding without being recreated, and so a
  // live quality change is picked up on the next apply/negotiation.
  const encodingRef = useRef<MeshEncoding>(
    computeMeshEncoding(cameraResolution, cameraFramerate, screenResolution, screenFramerate, videoQuality, audioQuality),
  );
  encodingRef.current = computeMeshEncoding(
    cameraResolution,
    cameraFramerate,
    screenResolution,
    screenFramerate,
    videoQuality,
    audioQuality,
    stageKind,
    stageWatcherCount,
    uploadBudgetBps,
  );

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);

  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const localAvatarUrlRef = useRef<string | null>(localAvatarUrl);
  localAvatarUrlRef.current = localAvatarUrl;
  const localVoicePreferenceRef = useRef<string>(localVoicePreference);
  localVoicePreferenceRef.current = localVoicePreference;
  const localAccentColorRef = useRef<string>(localAccentColor);
  localAccentColorRef.current = localAccentColor;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [micError, setMicError] = useAutoClearError();
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useAutoClearError();
  const [sharingScreen, setSharingScreen] = useState(false);
  const [screenError, setScreenError] = useAutoClearError();
  const [remote, setRemote] = useState<Record<PeerId, RemoteMedia>>({});

  const linksRef = useRef<Map<PeerId, PeerLink>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const localStreamPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const selfIdRef = useRef<PeerId | null>(null);
  const micEnabledRef = useRef(true);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraEnabledRef = useRef(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  // Persistent wire stream for the screen share: capture tracks are swapped into
  // this single MediaStream so its id (the SDP msid) stays stable across
  // stop/restart. Receivers match the announced screen-state id against the
  // received stream id; replaceTrack keeps the original msid, so without a stable
  // wire id a restart would announce a new id that never matches what's on the wire.
  const screenWireStreamRef = useRef<MediaStream | null>(null);
  const sharingScreenRef = useRef(false);
  // Native per-process screen audio (see startScreenShare): a MediaStreamTrackGenerator
  // fed from main-process PCM frames, plus the writer + IPC unsubscribe needed to tear it down.
  const screenAudioGeneratorRef = useRef<MediaStreamTrackGenerator<AudioData> | null>(null);
  const screenAudioWriterRef = useRef<WritableStreamDefaultWriter<AudioData> | null>(null);
  const screenAudioUnsubscribeRef = useRef<(() => void) | null>(null);
  const screenAudioTimestampUsRef = useRef(0);
  /** peerId -> the MediaStream id that peer is using for its screen share. */
  const screenIdsRef = useRef<Map<PeerId, string>>(new Map());
  /**
   * peerId -> every stream id that peer has EVER announced as its screen
   * share (kept even after they stop). Once a sender stops sharing,
   * `setLocalScreenStream(null)` only replaceTrack(null)s the sender — it
   * never renegotiates — so the receiver's `ontrack` never refires and the
   * now-frozen screen MediaStream just sits in `remoteStreamsRef` forever.
   * Without this, `classifyPeerStreams` (called with `screenId: undefined`
   * once sharing stops) falls back to "last non-screen id wins" and can
   * mistake that stale, silent stream for the peer's camera/mic stream —
   * cutting off their voice for everyone until they reconnect or reshare.
   */
  const knownScreenIdsRef = useRef<Map<PeerId, Set<string>>>(new Map());
  /**
   * peerId -> what media that peer wants from us, derived from their opt-in
   * state (videoSubscriptions + wantsVideo) against our own userId. Defaults to
   * nothing until they join us (opt-in). Consulted at link creation + on change.
   */
  const peerMediaWantsRef = useRef<Map<PeerId, { video: boolean; screenAudio: boolean }>>(new Map());
  /** peerId -> (streamId -> received MediaStream), to (re)classify on demand. */
  const remoteStreamsRef = useRef<Map<PeerId, Map<string, MediaStream>>>(new Map());
  /** peerId -> health-reducer state for the monitor tick (survives relinks so
   * the escalation ladder's attempt count can't reset by relinking). */
  const healthRef = useRef<Map<PeerId, LinkHealth>>(new Map());
  /** Last UI signal published per peer, so the 2s tick only patches React state
   * on actual transitions. */
  const lastHealthUiRef = useRef<Map<PeerId, HealthUi>>(new Map());
  /** Pending link↔presence mismatches for reconcileMesh (first-seen stamps). */
  const reconcilePendingRef = useRef<Record<string, number>>({});
  const disposedRef = useRef(false);

  const ensureLocalStream = useCallback((): Promise<MediaStream | null> => {
    if (localStreamPromiseRef.current) return localStreamPromiseRef.current;
    disposedRef.current = false;

    const promise = navigator.mediaDevices
      .getUserMedia({
        audio: buildMicAudioConstraints(inputDeviceIdRef.current, ecRef.current, agcRef.current, nsRef.current),
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
          setLocalStream(stream);
          return stream;
        }

        const { gainNode, analyserNode: analyserNodeObj, processedStream } =
          createMicProcessingGraph(ctx, stream, micVolumeRef.current);

        audioContextRef.current = ctx;
        gainNodeRef.current = gainNode;
        analyserNodeRef.current = analyserNodeObj;
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

  // Re-apply video bitrate/framerate caps to every live sender when the quality
  // tier / capture resolution/framerate changes, OR when our stage role or the
  // number of stage watchers changes (both shift the effective caps: stage vs
  // thumbnail role, and the adaptive per-viewer budget). encodingRef already holds
  // the fresh config; this pushes it to existing senders without renegotiation.
  useEffect(() => {
    for (const link of linksRef.current.values()) link.applyEncoding();
  }, [videoQuality, audioQuality, cameraResolution, cameraFramerate, screenResolution, screenFramerate, stageKind, stageWatcherCount, uploadBudgetBps]);

  const prepareMedia = useCallback(() => {
    void ensureLocalStream();
  }, [ensureLocalStream]);

  const patchRemote = useCallback((peerId: PeerId, patch: Partial<RemoteMedia>) => {
    setRemote((prev) => {
      const current = prev[peerId] ?? {
        cameraStream: null,
        cameraVideoId: null,
        screenStream: null,
        connectionState: 'new' as const,
        health: 'ok' as const,
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
      const knownScreenIds = knownScreenIdsRef.current.get(peerId);
      // Exclude any id that was ever this peer's screen share but isn't the
      // CURRENT one — a stopped share's now-silent stream must never be
      // eligible for the camera/voice slot (see knownScreenIdsRef above).
      const candidateIds = streams
        ? [...streams.keys()].filter((id) => id === screenId || !knownScreenIds?.has(id))
        : [];
      // Classify by id (pure, unit-tested), then look the MediaStream objects back
      // up. Keep the raw MediaStream reference stable: the per-peer audio graph
      // (ParticipantTile) sources from cameraStream and must not rebuild when a
      // gated video track is later added to the same object. The video tile re-binds
      // off the cameraVideoId scalar below instead of a new ref.
      const { cameraStreamId, screenStreamId } = classifyPeerStreams(candidateIds, screenId);
      const cameraStream = (cameraStreamId && streams?.get(cameraStreamId)) || null;
      const screenStream = (screenStreamId && streams?.get(screenStreamId)) || null;
      const cameraVideoId = cameraStream?.getVideoTracks()[0]?.id ?? null;
      patchRemote(peerId, { cameraStream, cameraVideoId, screenStream });
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

  // What a viewer wants from us, derived from their opt-in state against our
  // own userId: screen audio while they're subscribed to us; video while
  // subscribed AND rendering (not docked). Camera + screen video move together.
  const computeWants = useCallback(
    (subscriptions: string[] | undefined, wantsVideo: boolean): { video: boolean; screenAudio: boolean } =>
      deriveWants(subscriptions, wantsVideo, localUserIdRef.current),
    [],
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
        getEncoding: () => encodingRef.current,
      });

      linksRef.current.set(peerId, link);
      patchRemote(peerId, { connectionState: link.pc.connectionState });
      // Seed the health entry only when absent: a relink carries the previous
      // entry (and its attempt count) forward so the ladder can't loop forever.
      if (!healthRef.current.has(peerId)) healthRef.current.set(peerId, initialHealth(Date.now()));

      // Apply this peer's current media wants (what they've opted into) before
      // applying tracks, so a peer already subscribed to us gets the first frame
      // while everyone else stays held by the opt-in (false) defaults.
      const wants = peerMediaWantsRef.current.get(peerId);
      if (wants) link.setMediaActive(wants);

      // A peer joining while our camera is already on should receive video.
      const videoTrack = videoTrackRef.current;
      const stream = localStreamRef.current;
      if (cameraEnabledRef.current && videoTrack && stream) {
        link.setLocalVideoTrack(videoTrack, stream);
      }
      // ...and our ongoing screen share, if any (the stable wire stream).
      if (sharingScreenRef.current && screenWireStreamRef.current) {
        link.setLocalScreenStream(screenWireStreamRef.current);
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
    knownScreenIdsRef.current.delete(peerId);
    healthRef.current.delete(peerId);
    lastHealthUiRef.current.delete(peerId);
    setRemote((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  /**
   * Scoped teardown of ONE link for a rebuild, keeping the peer's announced
   * state (screenIdsRef — their share is still live; peerMediaWantsRef — their
   * opt-ins still hold; healthRef — the ladder's attempt count must survive).
   * The old pc's streams are dead, so the remote snapshot resets to let the
   * fresh pc's ontrack repopulate it.
   */
  const dropLinkForRebuild = useCallback(
    (peerId: PeerId) => {
      const link = linksRef.current.get(peerId);
      if (link) {
        link.close();
        linksRef.current.delete(peerId);
      }
      remoteStreamsRef.current.delete(peerId);
      patchRemote(peerId, {
        cameraStream: null,
        cameraVideoId: null,
        screenStream: null,
        connectionState: 'new',
      });
    },
    [patchRemote],
  );

  /**
   * Initiator side of a relink: tear down our link, tell the peer to do the
   * same (a fresh pc mints a new DTLS certificate, so its offer can never be
   * accepted by the peer's OLD pc — both sides must rebuild), then recreate.
   * The relink message goes out before ensureLink so it precedes our fresh
   * offer in the socket's FIFO order.
   */
  const relinkPeer = useCallback(
    (peerId: PeerId) => {
      // No health/baseline reset here: the reducer's relink transition already
      // returned the reset state (packets 0, fresh lastAdvanceAt) and the tick
      // stored it in healthRef BEFORE dispatching this action. Only the
      // RECEIVER's `case 'relink'` handler resets manually — it never runs the
      // reducer transition.
      dropLinkForRebuild(peerId);
      send({ type: 'relink', to: peerId });
      ensureLink(peerId);
    },
    [dropLinkForRebuild, send, ensureLink],
  );

  /** Push a health transition into the remote snapshot (only on change — the
   * monitor ticks every 2s and must not re-render tiles per tick). */
  const publishHealth = useCallback(
    (peerId: PeerId, phase: HealthPhase) => {
      const ui = deriveHealthUi(phase);
      if ((lastHealthUiRef.current.get(peerId) ?? 'ok') === ui) return;
      lastHealthUiRef.current.set(peerId, ui);
      patchRemote(peerId, { health: ui });
      onHealthChangeRef.current?.(peerId, ui);
    },
    [patchRemote],
  );

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
    screenAudioUnsubscribeRef.current?.();
    screenAudioUnsubscribeRef.current = null;
    screenAudioWriterRef.current?.close().catch(() => {});
    screenAudioWriterRef.current = null;
    screenAudioGeneratorRef.current?.stop();
    screenAudioGeneratorRef.current = null;
    void window.chickadee?.stopScreenAudioCapture?.();

    // Disconnect mic processing nodes but do not close the shared AudioContext —
    // it is owned by lib/audioContext.ts and shared with sfx.ts across join/leave cycles.
    if (gainNodeRef.current) { gainNodeRef.current.disconnect(); gainNodeRef.current = null; }
    if (analyserNodeRef.current) { analyserNodeRef.current.disconnect(); analyserNodeRef.current = null; }
    audioContextRef.current = null;
    rawStreamRef.current = null;
    setAnalyserNode(null);

    localStreamRef.current = null;
    localStreamPromiseRef.current = null;
    selfIdRef.current = null;
    micEnabledRef.current = true;
    videoTrackRef.current = null;
    cameraEnabledRef.current = false;
    screenStreamRef.current = null;
    // A fresh session rebuilds links/senders, so a fresh wire id is fine.
    screenWireStreamRef.current = null;
    sharingScreenRef.current = false;
    screenIdsRef.current.clear();
    knownScreenIdsRef.current.clear();
    peerMediaWantsRef.current.clear();
    remoteStreamsRef.current.clear();
    healthRef.current.clear();
    lastHealthUiRef.current.clear();
    reconcilePendingRef.current = {};
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
          audio: buildMicAudioConstraints(deviceId, ecRef.current, agcRef.current, nsRef.current),
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
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: buildVideoCaptureConstraints(cameraResolution, cameraFramerate, '720p'),
        });
        const videoTrack = camStream.getVideoTracks()[0];
        if (!videoTrack) return;
        // Hint the encoder this is camera motion (favor smooth frame rate /
        // motion compensation over per-frame detail).
        videoTrack.contentHint = 'motion';

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

  // Tears down the native-process-audio track built in startScreenShare (see
  // there for why it exists): stop listening for PCM frames, close the
  // generator's writer/track, and tell main to stop the WASAPI capture.
  const stopScreenAudioGenerator = useCallback(() => {
    screenAudioUnsubscribeRef.current?.();
    screenAudioUnsubscribeRef.current = null;
    const writer = screenAudioWriterRef.current;
    screenAudioWriterRef.current = null;
    if (writer) writer.close().catch(() => {});
    const generator = screenAudioGeneratorRef.current;
    screenAudioGeneratorRef.current = null;
    if (generator) generator.stop();
    void window.chickadee?.stopScreenAudioCapture?.();
  }, []);

  const stopScreenShare = useCallback(() => {
    for (const link of linksRef.current.values()) link.setLocalScreenStream(null);
    const screen = screenStreamRef.current;
    if (screen) for (const track of screen.getTracks()) track.stop();
    // Empty the wire stream but keep the wrapper so the next share reuses its id
    // (stable msid across stop/restart). Tracks are the same objects stopped above
    // (except the process-audio generator track, stopped by stopScreenAudioGenerator).
    const wire = screenWireStreamRef.current;
    if (wire) for (const track of wire.getTracks()) wire.removeTrack(track);
    stopScreenAudioGenerator();
    screenStreamRef.current = null;
    sharingScreenRef.current = false;
    setSharingScreen(false);
    setLocalScreenStream(null);
    send({ type: 'screen-state', streamId: null });
  }, [send, stopScreenAudioGenerator]);

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
          // Tell main which source the picker chose; for a window share with audio
          // this also starts native per-process WASAPI capture (main resolves the
          // window's owning process and captures only ITS audio — architecturally
          // excluding our own locally-played peer voices, unlike whole-system
          // loopback, which bakes them back in and echoes everyone to everyone).
          // audioMode reports which path actually won: 'process' (audio arrives
          // separately as PCM frames, built into a track below), 'system' (the
          // getDisplayMedia() stream below carries a normal loopback audio track —
          // the only option for a full-display share, or if process capture failed),
          // or 'none'.
          const audioMode = await window.chickadee.setShareSource(sourceId, withAudio);

          const videoConstraints = buildVideoCaptureConstraints(screenResolution, screenFramerate, '1080p');
          let screen: MediaStream;
          try {
            screen = await navigator.mediaDevices.getDisplayMedia({
              video: videoConstraints,
              audio: audioMode === 'system',
            });
          } catch (audioErr) {
            if (audioMode !== 'system') throw audioErr;
            // System-audio capture can fail (e.g. some window shares); retry video-only.
            console.warn('screen audio capture failed, retrying video-only', audioErr);
            await window.chickadee.setShareSource(sourceId, false);
            screen = await navigator.mediaDevices.getDisplayMedia({
              video: videoConstraints,
              audio: false,
            });
          }

          if (disposedRef.current) {
            for (const track of screen.getTracks()) track.stop();
            return;
          }

          // Hint the encoder this is detailed/static content (text, UI, game) so
          // it preserves sharpness over frame rate — pairs with the screen
          // sender's 'maintain-resolution' degradation preference.
          const screenVideoTrack = screen.getVideoTracks()[0];
          if (screenVideoTrack) screenVideoTrack.contentHint = 'detail';

          screenStreamRef.current = screen;
          sharingScreenRef.current = true;
          // Swap the fresh capture tracks into the persistent wire stream so its
          // id stays stable across stop/restart, and send/announce that wire id.
          const wire = (screenWireStreamRef.current ??= new MediaStream());
          for (const track of wire.getTracks()) wire.removeTrack(track);
          for (const track of screen.getTracks()) wire.addTrack(track);

          if (audioMode === 'process') {
            // Synthesize a real MediaStreamTrack from the raw PCM frames main pushes
            // over IPC (WebCodecs Insertable Streams) — sample-accurate timestamps
            // derived from cumulative frame count, not wall clock, so IPC delivery
            // jitter can't cause glitches.
            const generator = new MediaStreamTrackGenerator<AudioData>({ kind: 'audio' });
            const writer = generator.writable.getWriter();
            screenAudioGeneratorRef.current = generator;
            screenAudioWriterRef.current = writer;
            screenAudioTimestampUsRef.current = 0;
            screenAudioUnsubscribeRef.current = window.chickadee.onScreenAudioFrame((chunk) => {
              const BYTES_PER_FRAME = 4; // 16-bit stereo
              const numberOfFrames = Math.floor(chunk.byteLength / BYTES_PER_FRAME);
              if (numberOfFrames === 0) return;
              try {
                const audioData = new AudioData({
                  format: 's16',
                  sampleRate: 48000,
                  numberOfFrames,
                  numberOfChannels: 2,
                  timestamp: screenAudioTimestampUsRef.current,
                  // IPC delivers a plain ArrayBuffer-backed Uint8Array; TS's stricter
                  // typed-array generics just don't know that statically.
                  data: chunk as unknown as BufferSource,
                });
                screenAudioTimestampUsRef.current += Math.round((numberOfFrames / 48000) * 1e6);
                void writer.write(audioData).catch(() => {});
              } catch {
                // Writer/generator already torn down (stop() raced an in-flight frame).
              }
            });
            wire.addTrack(generator);
          }

          for (const link of linksRef.current.values()) link.setLocalScreenStream(wire);
          // The OS "Stop sharing" affordance / closing the source ends the track.
          const videoTrack = screen.getVideoTracks()[0];
          if (videoTrack) videoTrack.onended = () => stopScreenShare();

          setSharingScreen(true);
          setLocalScreenStream(screen);
          send({ type: 'screen-state', streamId: wire.id });
        } catch (err) {
          console.error('screen share failed', err);
          setScreenError('Could not start screen share.');
        }
      })();
    },
    [send, stopScreenShare],
  );

  // The native capture can self-stop mid-share (e.g. the shared window's
  // process crashed) without ever calling stopScreenShare() — see
  // packages/process-loopback's onStopped callback. Video may still be fine,
  // so only drop the audio side and surface it, rather than the track just
  // going quiet with no explanation.
  useEffect(() => {
    return window.chickadee?.onScreenAudioCaptureEnded?.(() => {
      if (!screenAudioGeneratorRef.current) return;
      stopScreenAudioGenerator();
      setScreenError('Screen audio capture ended unexpectedly (the shared window may have closed).');
    });
  }, [stopScreenAudioGenerator, setScreenError]);

  // After a reconnect the server reset our peer to defaults; re-broadcast any
  // non-default local state so others' tiles reflect reality.
  const reannounceLocalState = useCallback(() => {
    // mic-state (mute intent) is re-announced by App.tsx's broadcast effect (keyed
    // on signaling.status), so it isn't sent here.
    if (cameraEnabledRef.current) send({ type: 'cam-state', on: true });
    if (sharingScreenRef.current && screenWireStreamRef.current) {
      send({ type: 'screen-state', streamId: screenWireStreamRef.current.id });
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
          knownScreenIdsRef.current.clear();
          healthRef.current.clear();
          lastHealthUiRef.current.clear();
          reconcilePendingRef.current = {};
          setRemote({});
          peerMediaWantsRef.current.clear();
          for (const peer of msg.peers) {
            if (peer.screenStreamId) {
              screenIdsRef.current.set(peer.id, peer.screenStreamId);
              knownScreenIdsRef.current.set(peer.id, new Set([peer.screenStreamId]));
            }
            // Seed before ensureLink so a peer already subscribed to us (e.g. across
            // our own reconnect) receives the first frame, and nobody else does.
            peerMediaWantsRef.current.set(peer.id, computeWants(peer.videoSubscriptions, peer.wantsVideo));
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
          // Seed before ensureLink with whatever this peer has already opted into.
          peerMediaWantsRef.current.set(
            msg.peer.id,
            computeWants(msg.peer.videoSubscriptions, msg.peer.wantsVideo),
          );
          ensureLink(msg.peer.id);
          break;
        case 'peer-left':
          peerMediaWantsRef.current.delete(msg.peerId);
          closeLink(msg.peerId);
          break;
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          void ensureLink(msg.from).handleSignal(msg);
          break;
        case 'relink': {
          // The peer is rebuilding our pair: drop our side and wait — its fresh
          // offer follows on this socket (FIFO) and the offer case above
          // recreates the link. Reset the packet baseline: the fresh pc's
          // counters restart at zero, and against the old baseline the monitor
          // would misread flowing packets as a stall. If the offer got lost
          // too, the reconcile backstop recreates the link from our side.
          dropLinkForRebuild(msg.from);
          const h = healthRef.current.get(msg.from);
          if (h) {
            // createdAt resets too: the pair build starts anew, so the
            // connect-timeout clock must not count the old link's lifetime.
            healthRef.current.set(msg.from, {
              ...h,
              packets: 0,
              lastAdvanceAt: Date.now(),
              degradedAt: null,
              createdAt: Date.now(),
            });
          }
          break;
        }
        case 'screen-state':
          if (msg.streamId) {
            screenIdsRef.current.set(msg.from, msg.streamId);
            let known = knownScreenIdsRef.current.get(msg.from);
            if (!known) {
              known = new Set();
              knownScreenIdsRef.current.set(msg.from, known);
            }
            known.add(msg.streamId);
          } else {
            screenIdsRef.current.delete(msg.from);
          }
          recomputeRemote(msg.from);
          break;
        case 'sink-state': {
          // A peer changed who they've joined and/or their dock state: recompute
          // what they want from us and apply it to just their link. Mic/voice is
          // never affected (separate sender).
          const wants = computeWants(msg.subscriptions, msg.wantsVideo);
          peerMediaWantsRef.current.set(msg.from, wants);
          linksRef.current.get(msg.from)?.setMediaActive(wants);
          break;
        }
      }
    };
    return subscribe(handle);
  }, [subscribe, ensureLocalStream, ensureLink, closeLink, dropLinkForRebuild, recomputeRemote, reannounceLocalState, computeWants]);

  // Health monitor: the one interval in this hook (setInterval, never rAF — it
  // must keep firing while minimized; backgroundThrottling:false protects it).
  // Each tick polls every link's getStats() for inbound-audio packet counts and
  // runs the pure escalation ladder (evaluateHealth): silent stalls the ICE
  // layer never reports → restartIce → relink → give up. Gated on 'connected':
  // during a signaling drop the mesh idles by design (restart/relink need the
  // relay anyway; P2P media itself survives the blip), and the re-welcome
  // rebuilds everything fresh.
  useEffect(() => {
    if (status !== 'connected') return;
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        const sampled = await Promise.all(
          [...linksRef.current.entries()].map(async ([peerId, link]) => {
            try {
              const report = await link.pc.getStats();
              return [peerId, link, sumInboundAudioPackets([...report.values()])] as const;
            } catch {
              // Stats unavailable (pc closing): report the old count = "frozen".
              return [peerId, link, healthRef.current.get(peerId)?.packets ?? 0] as const;
            }
          }),
        );
        if (cancelled) return;
        const now = Date.now();
        for (const [peerId, link, packetsNow] of sampled) {
          // The link may have been torn down while getStats was in flight.
          if (linksRef.current.get(peerId) !== link) continue;
          const h = healthRef.current.get(peerId) ?? initialHealth(now);
          const { next, action } = evaluateHealth(h, link.pc.connectionState, packetsNow, now);
          healthRef.current.set(peerId, next);
          publishHealth(peerId, next.phase);
          if (action === 'restart-ice') link.restartIce();
          else if (action === 'relink') relinkPeer(peerId);
        }
        // Reconciliation backstop: a link whose peer is gone (missed peer-left)
        // closes; a peer left linkless (lost relink offer) gets a fresh link.
        const { close, create, nextPending } = reconcileMesh(
          [...linksRef.current.keys()],
          peersRef.current.map((p) => p.id),
          reconcilePendingRef.current,
          now,
        );
        reconcilePendingRef.current = nextPending;
        for (const id of close) closeLink(id);
        for (const id of create) {
          const peer = peersRef.current.find((p) => p.id === id);
          if (!peer) continue;
          peerMediaWantsRef.current.set(id, computeWants(peer.videoSubscriptions, peer.wantsVideo));
          ensureLink(id);
        }
      })();
    }, HEALTH_TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status, publishHealth, relinkPeer, closeLink, ensureLink, computeWants]);

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
    teardown,
    setCameraError,
  };
}
