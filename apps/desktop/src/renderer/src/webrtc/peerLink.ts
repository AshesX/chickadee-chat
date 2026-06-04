import {
  DEFAULT_ICE_SERVERS,
  type ClientMessage,
  type PeerId,
  type ServerMessage,
} from '@chickadee/shared';

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

  const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });

  // Perfect-negotiation bookkeeping.
  let makingOffer = false;
  let ignoreOffer = false;
  let isSettingRemoteAnswerPending = false;

  // The single outgoing video sender, created lazily on the first video track.
  let videoSender: RTCRtpSender | null = null;

  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true;
      await pc.setLocalDescription();
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

  pc.onconnectionstatechange = () => {
    onConnectionState(pc.connectionState);
  };

  // Add only the audio track at creation; video is managed via
  // setLocalVideoTrack so its sender can be tracked for replaceTrack swaps.
  // Adding a track triggers onnegotiationneeded → the initial offer.
  if (localStream) {
    for (const track of localStream.getAudioTracks()) {
      pc.addTrack(track, localStream);
    }
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
        await pc.setLocalDescription();
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

  return { pc, handleSignal, setLocalVideoTrack, close };
}
