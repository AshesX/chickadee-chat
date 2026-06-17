import {
  DEFAULT_ICE_SERVERS,
  type ClientMessage,
  type PeerId,
  type ServerMessage,
} from '@chickadee/shared';

/** Don't fire ICE restarts more often than this (ms) per connection. */
const ICE_RESTART_COOLDOWN_MS = 4000;

/**
 * Enable Opus DTX (discontinuous transmission) on every Opus m-line of a local
 * SDP by adding `usedtx=1` to its fmtp params. With DTX the encoder stops
 * sending full frames during silence (its built-in comfort noise covers the
 * gap), which cuts upstream bandwidth in a voice-first app where peers are often
 * quiet. There's no `setParameters()` equivalent for DTX, so this munges the SDP.
 * Existing fmtp params (minptime, useinbandfec, …) are preserved; bitrate is
 * untouched. Returns the SDP unchanged if no Opus payload is found.
 */
export function enableOpusDtx(sdp: string): string {
  const lines = sdp.split(/\r\n|\n/);
  // Map every Opus payload type from its rtpmap line.
  const opusPts = new Set<string>();
  for (const line of lines) {
    const m = /^a=rtpmap:(\d+) opus\/48000/i.exec(line);
    if (m) opusPts.add(m[1]);
  }
  if (opusPts.size === 0) return sdp;

  const out: string[] = [];
  for (const line of lines) {
    const fmtp = /^a=fmtp:(\d+) (.*)$/.exec(line);
    if (fmtp && opusPts.has(fmtp[1])) {
      out.push(/\busedtx=/.test(fmtp[2]) ? line : `${line};usedtx=1`);
      continue;
    }
    out.push(line);
    // If an Opus payload has an rtpmap but no fmtp line, add one right after it.
    const rtpmap = /^a=rtpmap:(\d+) opus\/48000/i.exec(line);
    if (rtpmap && !sdp.includes(`a=fmtp:${rtpmap[1]} `)) {
      out.push(`a=fmtp:${rtpmap[1]} usedtx=1`);
    }
  }
  return out.join('\r\n');
}

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

  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true;
      const offer = await pc.createOffer();
      offer.sdp = enableOpusDtx(offer.sdp ?? '');
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
    if (pc.connectionState === 'failed') maybeRestartIce();
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
    if (track) {
      if (videoSender) {
        void videoSender.replaceTrack(track); // swap, no renegotiation
      } else {
        videoSender = pc.addTrack(track, stream); // first time → renegotiates
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
    screenVideoSender = applyTrack(screenVideoSender, videoTrack, stream);
    screenAudioSender = applyTrack(screenAudioSender, audioTrack, stream);
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
        answer.sdp = enableOpusDtx(answer.sdp ?? '');
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

  return { pc, handleSignal, setLocalAudioTrack, setLocalVideoTrack, setLocalScreenStream, close };
}
