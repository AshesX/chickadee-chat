import {
  DEFAULT_ICE_SERVERS,
  type ClientMessage,
  type PeerId,
  type ServerMessage,
} from '@chickadee/shared';
import type { MeshEncoding, VideoEncoding } from './encodingParams';
import { tuneOpusSdp } from './sdp';

/** Don't fire ICE restarts more often than this (ms) per connection. */
const ICE_RESTART_COOLDOWN_MS = 4000;

/** The subset of relayed signaling messages a peer link consumes. */
export type PeerSignal = Extract<
  ServerMessage,
  { type: 'offer' | 'answer' | 'ice-candidate' }
>;

export interface PeerLinkOptions {
  /** The remote peer this link talks to. */
  peerId: PeerId;
  /**
   * Politeness for perfect negotiation. Must be the opposite value on each
   * end of the connection (we derive it deterministically from peer ids).
   */
  polite: boolean;
  /** Local media to send, or null for a listen-only (receive-only) link. */
  localStream: MediaStream | null;
  /** ICE servers (STUN + TURN) for this connection. */
  iceServers: RTCIceServer[];
  /** Send a directed signaling message up to the server. */
  send: (message: ClientMessage) => void;
  /** Called whenever the remote stream arrives or changes. */
  onRemoteStream: (stream: MediaStream) => void;
  /** Called on every RTCPeerConnection connection-state transition. */
  onConnectionState: (state: RTCPeerConnectionState) => void;
  /**
   * Returns the current outbound encoding config (bitrate/framerate caps + Opus
   * target). Read lazily so a live quality-setting change is picked up on the
   * next apply without recreating the link. Omit to leave senders untuned.
   */
  getEncoding?: () => MeshEncoding;
}

export interface PeerLink {
  readonly pc: RTCPeerConnection;
  /** Feed an inbound offer/answer/ice-candidate from the remote peer. */
  handleSignal: (signal: PeerSignal) => Promise<void>;
  /**
   * Add, swap, or clear the outgoing video track. The first non-null track
   * creates the sender (one renegotiation); later calls use replaceTrack and
   * do not renegotiate. Pass null to stop sending video (keeps the m-line).
   */
  setLocalVideoTrack: (track: MediaStreamTrack | null, stream: MediaStream) => void;
  /**
   * Swap the outgoing mic audio track (used when the user changes input
   * device). Creates the sender on first use, else replaceTrack — no
   * renegotiation when swapping.
   */
  setLocalAudioTrack: (track: MediaStreamTrack | null, stream: MediaStream) => void;
  /**
   * Add, swap, or clear the outgoing screen share (its video + optional system
   * audio track). First call per kind creates the sender (one renegotiation);
   * later calls use replaceTrack. Pass null to stop sharing (keeps the m-lines).
   */
  setLocalScreenStream: (stream: MediaStream | null) => void;
  /**
   * Gate what media this peer receives, without renegotiation (glare-free
   * replaceTrack). `video` controls camera + screen-share *video*; `screenAudio`
   * controls screen-share *system audio*. Mic/voice audio is never gated. Both
   * default to **false** (opt-in): a peer receives our video/screen-audio only
   * once they've joined us (`video`) and aren't docked (also `video`), with
   * screen audio while subscribed (`screenAudio`). Enabling re-applies whatever
   * the current local tracks are; disabling stops that sender (keeps the m-line).
   */
  setMediaActive: (active: { video: boolean; screenAudio: boolean }) => void;
  /**
   * Re-apply the current encoding config (from `getEncoding`) to the live video
   * + screen senders. Call after the quality setting changes; audio is applied
   * via SDP on the next negotiation, so it isn't touched here. No-op without
   * `getEncoding` or before any video sender exists.
   */
  applyEncoding: () => void;
  /** Tear down the connection and detach all handlers. */
  close: () => void;
}

/**
 * Manages one RTCPeerConnection using the perfect-negotiation pattern
 * (https://w3c.github.io/webrtc-pc/#perfect-negotiation-example). This makes
 * the connection resilient to "glare" (both sides offering at once) and lets
 * future phases renegotiate (adding video / screen share) just by calling
 * addTrack/removeTrack — the pattern handles the rest.
 */
export function createPeerLink(opts: PeerLinkOptions): PeerLink {
  const { peerId, polite, localStream, send, onRemoteStream, onConnectionState } = opts;

  const pc = new RTCPeerConnection({ iceServers: opts.iceServers ?? DEFAULT_ICE_SERVERS });

  // Perfect-negotiation bookkeeping.
  let makingOffer = false;
  let ignoreOffer = false;
  let isSettingRemoteAnswerPending = false;

  // Outgoing senders, created lazily on first use so toggles can replaceTrack.
  let audioSender: RTCRtpSender | null = null;
  let videoSender: RTCRtpSender | null = null;
  let screenVideoSender: RTCRtpSender | null = null;
  let screenAudioSender: RTCRtpSender | null = null;

  // Per-viewer media gating (see setMediaActive). Default false = opt-in: we send
  // this peer no video/screen-audio until they join us. When inactive, tracks are
  // held (replaceTrack(null)) but remembered here so re-enabling re-applies the
  // current ones. Mic/voice audio is independent and never gated.
  let videoActive = false;
  let screenAudioActive = false;
  let lastVideoTrack: MediaStreamTrack | null = null;
  let lastVideoStream: MediaStream | null = null;
  let lastScreenVideoTrack: MediaStreamTrack | null = null;
  let lastScreenStream: MediaStream | null = null;

  /**
   * Apply bitrate/framerate/degradation caps to one video sender. Mutates the
   * existing `getParameters()` object in place (WebRTC forbids changing the
   * encoding count), so it's a no-op until the sender has an encoding — which it
   * does once negotiation is under way; we also re-apply on `connected`. Async
   * `setParameters` is fire-and-forget; failures (e.g. params not ready yet) are
   * swallowed and corrected by the next apply.
   */
  function applyVideoEncoding(sender: RTCRtpSender | null, enc: VideoEncoding): void {
    if (!sender) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) return; // not tunable yet
      const e = params.encodings[0];
      e.maxBitrate = enc.maxBitrate; // undefined clears any prior cap
      e.maxFramerate = enc.maxFramerate;
      if (enc.scaleResolutionDownBy != null) e.scaleResolutionDownBy = enc.scaleResolutionDownBy;
      params.degradationPreference = enc.degradationPreference;
      void sender.setParameters(params);
    } catch (err) {
      console.error(`[peerLink ${peerId}] setParameters failed`, err);
    }
  }

  /** Re-apply the current encoding to both video senders (camera + screen). */
  function reapplyAllEncodings(): void {
    const enc = opts.getEncoding?.();
    if (!enc) return;
    applyVideoEncoding(videoSender, enc.camera);
    applyVideoEncoding(screenVideoSender, enc.screen);
  }

  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true;
      const offer = await pc.createOffer();
      offer.sdp = tuneOpusSdp(offer.sdp ?? '', opts.getEncoding?.().audio ?? {});
      await pc.setLocalDescription(offer);
      if (pc.localDescription) {
        send({ type: 'offer', to: peerId, sdp: pc.localDescription });
      }
    } catch (err) {
      console.error(`[peerLink ${peerId}] negotiation failed`, err);
    } finally {
      makingOffer = false;
    }
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      send({ type: 'ice-candidate', to: peerId, candidate: candidate.toJSON() });
    }
  };

  pc.ontrack = ({ streams }) => {
    if (streams[0]) onRemoteStream(streams[0]);
  };

  let lastIceRestart = 0;

  // Re-gather ICE when a connection fails (e.g. network path changed). The
  // restart flag is consumed by the next negotiation, which the existing
  // perfect-negotiation offer path drives; both ends may restart (glare-safe).
  // Only works while signaling is up; full signaling loss is handled by the
  // mesh rebuild on reconnect.
  function maybeRestartIce(): void {
    const now = Date.now();
    if (now - lastIceRestart < ICE_RESTART_COOLDOWN_MS) return;
    lastIceRestart = now;
    try {
      pc.restartIce();
    } catch (err) {
      console.error(`[peerLink ${peerId}] restartIce failed`, err);
    }
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') maybeRestartIce();
    // Once connected, the senders have real RTP params — (re)apply the bitrate
    // caps now in case the post-addTrack attempt ran before they were tunable.
    if (pc.connectionState === 'connected') reapplyAllEncodings();
    onConnectionState(pc.connectionState);
  };

  // Add only the audio track at creation; video is managed via
  // setLocalVideoTrack so its sender can be tracked for replaceTrack swaps.
  // Adding a track triggers onnegotiationneeded → the initial offer.
  if (localStream) {
    for (const track of localStream.getAudioTracks()) {
      audioSender = pc.addTrack(track, localStream);
    }
  }

  function setLocalAudioTrack(track: MediaStreamTrack | null, stream: MediaStream): void {
    audioSender = applyTrack(audioSender, track, stream);
  }

  function setLocalVideoTrack(track: MediaStreamTrack | null, stream: MediaStream): void {
    lastVideoTrack = track;
    lastVideoStream = stream;
    if (!videoActive) return; // hold; re-applied when the viewer joins
    if (track) {
      if (videoSender) {
        void videoSender.replaceTrack(track); // swap, no renegotiation
      } else {
        videoSender = pc.addTrack(track, stream); // first time → renegotiates
        const enc = opts.getEncoding?.();
        if (enc) applyVideoEncoding(videoSender, enc.camera);
      }
    } else if (videoSender) {
      void videoSender.replaceTrack(null); // stop sending, keep the m-line
    }
  }

  /** Apply a track via its sender: create on first use, else replaceTrack. */
  function applyTrack(
    sender: RTCRtpSender | null,
    track: MediaStreamTrack | null,
    stream: MediaStream | null,
  ): RTCRtpSender | null {
    if (track && stream) {
      if (sender) void sender.replaceTrack(track);
      else return pc.addTrack(track, stream);
    } else if (sender) {
      void sender.replaceTrack(null);
    }
    return sender;
  }

  function setLocalScreenStream(stream: MediaStream | null): void {
    const videoTrack = stream?.getVideoTracks()[0] ?? null;
    const audioTrack = stream?.getAudioTracks()[0] ?? null;
    lastScreenVideoTrack = videoTrack;
    lastScreenStream = stream;
    // Both gated per-viewer: screen audio flows only while subscribed; screen
    // video only while subscribed AND not docked. Held (not applied) otherwise.
    if (screenAudioActive) {
      screenAudioSender = applyTrack(screenAudioSender, audioTrack, stream);
    }
    if (videoActive) {
      screenVideoSender = applyTrack(screenVideoSender, videoTrack, stream);
      const enc = opts.getEncoding?.();
      if (enc) applyVideoEncoding(screenVideoSender, enc.screen);
    }
  }

  function setMediaActive(active: { video: boolean; screenAudio: boolean }): void {
    if (active.screenAudio !== screenAudioActive) {
      screenAudioActive = active.screenAudio;
      if (screenAudioActive) {
        // Re-apply the current screen audio track (if sharing).
        screenAudioSender = applyTrack(screenAudioSender, lastScreenStream?.getAudioTracks()[0] ?? null, lastScreenStream);
      } else if (screenAudioSender) {
        void screenAudioSender.replaceTrack(null);
      }
    }
    if (active.video !== videoActive) {
      videoActive = active.video;
      if (videoActive) {
        // Re-apply whatever the current camera + screen video tracks are.
        setLocalVideoTrack(lastVideoTrack, lastVideoStream ?? new MediaStream());
        screenVideoSender = applyTrack(screenVideoSender, lastScreenVideoTrack, lastScreenStream);
        const enc = opts.getEncoding?.();
        if (enc) applyVideoEncoding(screenVideoSender, enc.screen);
      } else {
        // Stop sending video without renegotiation; the m-lines stay.
        if (videoSender) void videoSender.replaceTrack(null);
        if (screenVideoSender) void screenVideoSender.replaceTrack(null);
      }
    }
  }

  async function handleSignal(signal: PeerSignal): Promise<void> {
    try {
      if (signal.type === 'ice-candidate') {
        try {
          await pc.addIceCandidate(signal.candidate);
        } catch (err) {
          // Candidates that arrive while we're ignoring an offer are expected.
          if (!ignoreOffer) throw err;
        }
        return;
      }

      const description = signal.sdp;
      const readyForOffer =
        !makingOffer && (pc.signalingState === 'stable' || isSettingRemoteAnswerPending);
      const offerCollision = description.type === 'offer' && !readyForOffer;

      ignoreOffer = !polite && offerCollision;
      if (ignoreOffer) return; // impolite peer keeps its own offer

      isSettingRemoteAnswerPending = description.type === 'answer';
      await pc.setRemoteDescription(description);
      isSettingRemoteAnswerPending = false;

      if (description.type === 'offer') {
        const answer = await pc.createAnswer();
        answer.sdp = tuneOpusSdp(answer.sdp ?? '', opts.getEncoding?.().audio ?? {});
        await pc.setLocalDescription(answer);
        if (pc.localDescription) {
          send({ type: 'answer', to: peerId, sdp: pc.localDescription });
        }
      }
    } catch (err) {
      console.error(`[peerLink ${peerId}] handleSignal failed`, err);
    }
  }

  function close(): void {
    pc.onnegotiationneeded = null;
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
  }

  return { pc, handleSignal, setLocalAudioTrack, setLocalVideoTrack, setLocalScreenStream, setMediaActive, applyEncoding: reapplyAllEncodings, close };
}
