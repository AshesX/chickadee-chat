import { memo, useMemo } from 'react';
import { MicOff, VolumeX, Play, EyeOff } from 'lucide-react';
import { sanitizeAvatarDataUrl } from '@chickadee/shared';
import { usePeerAudioGraph } from '../hooks/usePeerAudioGraph';
import { withAlpha } from '../lib/userColors';
import { TileVolumeControl } from './TileVolumeControl';

export interface ParticipantTileProps {
  displayName: string;
  isSelf: boolean;
  muted: boolean;
  /** If provided, controls the mute icon independently of the audio-gate `muted` prop. */
  intentionallyMuted?: boolean;
  /** Whether this participant's camera is on (show video vs. avatar). */
  cameraOn: boolean;
  /** Camera+mic stream: local (muted preview) for self, remote otherwise. */
  cameraStream: MediaStream | null;
  /**
   * Remote only: id of the camera video track on `cameraStream` (null when none).
   * Flips null → trackId when a gated video track arrives on the existing stream
   * object (same msid as the mic), so the <video> re-binds without changing
   * `cameraStream`'s reference (keeping the per-peer audio graph stable).
   */
  cameraVideoId?: string | null;
  /** This participant's assigned accent color. */
  color: string;
  /** Connection state for remote peers; omitted for self. */
  connectionState?: RTCPeerConnectionState;
  /** Whether this participant is currently speaking (drives the ripple); synced from the wire. */
  speaking?: boolean;
  /** Remote only: output volume 0–2 (default 1, where 2 = 200% boost). */
  volume?: number;
  /** Remote only: this peer's raw per-listener volume factor 0–2 (drives the hover slider). */
  peerVolume?: number;
  /** Remote only: the peer's session id, passed back to the id-keyed callbacks. */
  peerId?: string;
  /** Remote only: the peer's stable userId, passed back to the video join/leave callbacks. */
  userId?: string;
  /**
   * Remote only: set this peer's per-listener volume. Takes `peerId` so the
   * handler can stay identity-stable in the parent (no per-tile closure) — that's
   * what lets this tile's React.memo skip re-renders on other peers' updates.
   */
  onVolumeChange?: (peerId: string, v: number) => void;
  /** Remote only: toggle silence for this peer (click the volume icon). */
  onToggleMute?: (peerId: string) => void;
  /** Whether this participant is currently deafened. */
  deafened?: boolean;
  /** Remote only: auto-level incoming audio (compressor + makeup gain) to even out quiet/loud talkers. */
  normalize?: boolean;
  /** Custom avatar data URL; shown instead of the letter initial when set. */
  avatarUrl?: string | null;
  /** Whether this participant is currently sharing their screen (drives the frame cue). */
  screenSharing?: boolean;
  /** False while the window is minimized/hidden; detaches video to stop decode. */
  windowVisible?: boolean;
  /** Remote only: whether we've opted into ("joined") this peer's video/screen. */
  subscribed?: boolean;
  /** Remote only: join this peer's video (Watch). Takes `userId` so the handler stays stable. */
  onJoinVideo?: (userId: string) => void;
  /** Remote only: leave this peer's video (stop watching). Takes `userId` so the handler stays stable. */
  onLeaveVideo?: (userId: string) => void;
}

const CONN_LABEL: Partial<Record<RTCPeerConnectionState, string>> = {
  new: 'connecting…',
  connecting: 'connecting…',
  disconnected: 'reconnecting…',
  failed: 'connection lost',
  closed: 'disconnected',
};

function ParticipantTileImpl({
  displayName,
  isSelf,
  muted,
  intentionallyMuted,
  cameraOn,
  cameraStream,
  cameraVideoId,
  color,
  connectionState,
  speaking = false,
  volume,
  peerVolume,
  peerId,
  userId,
  onVolumeChange,
  onToggleMute,
  deafened,
  avatarUrl,
  normalize,
  screenSharing = false,
  windowVisible = true,
  subscribed = false,
  onJoinVideo,
  onLeaveVideo,
}: ParticipantTileProps): React.JSX.Element {
  // Validate peer-supplied avatar data URLs before rendering (defense in depth;
  // the server already sanitizes, but never trust an <img src> from the wire).
  // Memoized so the base64 validation doesn't re-run on unrelated re-renders
  // (speaking edges, chat messages, volume drags all re-render the tile).
  const safeAvatarUrl = useMemo(() => sanitizeAvatarDataUrl(avatarUrl), [avatarUrl]);

  // Incoming-audio plumbing (remote only): <video> binding, per-peer Web Audio
  // graph, live gain, and the no-AudioContext fallback. See usePeerAudioGraph.
  const { videoRef, audioRouted } = usePeerAudioGraph({
    cameraStream,
    cameraVideoId,
    isSelf,
    volume,
    normalize,
    windowVisible,
  });

  // `speaking` is computed by the owner (App.tsx) and synced over the signaling
  // relay (Peer.speaking) so every client renders an identical cue. Gate on
  // windowVisible so the speaking ring/glow never renders while minimized.
  const showMuteIcon = intentionallyMuted ?? muted;
  const showSpeaking = speaking && windowVisible;
  // Opt-in video: we only render a peer's camera/screen once we've joined them
  // (self always sees its own). Un-joined peers show their avatar + a Watch button.
  const showVideo = cameraOn && (isSelf || subscribed);
  const mediaShown = showVideo || (screenSharing && (isSelf || subscribed));
  // Two mutually-exclusive cues: tiles actually showing video/screen get the
  // rectangular frame outline; avatar (voice-only / un-joined) tiles get the ring.
  const showFrame = showSpeaking && mediaShown;
  const showAvatarRing = showSpeaking && !mediaShown;
  // Watch (join) appears when this peer has video available but we haven't joined.
  const showWatch = !isSelf && !subscribed && (cameraOn || screenSharing);

  const connNote = !isSelf && connectionState ? CONN_LABEL[connectionState] : undefined;
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';

  // Per-listener volume control (remote peers only): a corner icon that reveals a
  // slider on hover. Edits this peer's raw volume factor; master/deafen apply separately.
  const showVolumeControl = !isSelf && onVolumeChange != null && peerId != null;

  return (
    <li
      className={`tile${isSelf ? ' tile--self' : ''}${showFrame ? ' tile--speaking' : ''}`}
      style={{ '--accent': color, '--accent-glow': withAlpha(color, 44) } as React.CSSProperties}
    >


      <video
        ref={videoRef}
        className="tile__video"
        autoPlay
        playsInline
        muted={isSelf || audioRouted}
        style={{ visibility: showVideo ? 'visible' : 'hidden' }}
      />

      {!showVideo && (
        <div className="tile__center">
          <div
            className={`avatar avatar--lg tile__avatar${showAvatarRing ? ' tile__avatar--speaking' : ''}`}
            style={{
              background: safeAvatarUrl ? undefined : color,
            }}
          >
            {safeAvatarUrl ? (
              <img src={safeAvatarUrl} alt={displayName} />
            ) : (
              initial
            )}
            {(deafened || showMuteIcon) && (
              <span className="tile__avatar-mute">
                {deafened && <VolumeX size={14} strokeWidth={2.5} />}
                {showMuteIcon && <MicOff size={14} strokeWidth={2.5} />}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="tile__badge">
        <span className="tile__badge-name">
          {displayName}
          {isSelf && ' (you)'}
        </span>
        {deafened && showVideo && <VolumeX size={14} className="tile__badge-mute" />}
        {showMuteIcon && showVideo && <MicOff size={14} className="tile__badge-mute" />}
      </div>

      {connNote && <div className="tile__conn">{connNote}</div>}

      {showVolumeControl && peerId != null && (
        <TileVolumeControl
          displayName={displayName}
          peerVolume={peerVolume ?? 1}
          onVolumeChange={(v) => onVolumeChange?.(peerId, v)}
          onToggleMute={onToggleMute ? () => onToggleMute(peerId) : undefined}
        />
      )}

      {showWatch && userId != null && (
        <button type="button" className="tile__watch" onClick={() => onJoinVideo?.(userId)}>
          <Play size={15} strokeWidth={2.5} fill="currentColor" />
          Watch
        </button>
      )}

      {!isSelf && subscribed && showVideo && userId != null && (
        <button
          type="button"
          className="tile__leave"
          onClick={() => onLeaveVideo?.(userId)}
          title={`Stop watching ${displayName}`}
          aria-label={`Stop watching ${displayName}`}
        >
          <EyeOff size={14} strokeWidth={2.5} />
        </button>
      )}
    </li>
  );
}

/**
 * Memoized so a high-frequency update to one peer (speaking edge, volume drag,
 * mute) re-renders only that peer's tile rather than every tile in the grid.
 * Effective only because the parent passes identity-stable, id-keyed callbacks
 * (see App.tsx) and otherwise-primitive props.
 */
export const ParticipantTile = memo(ParticipantTileImpl);
