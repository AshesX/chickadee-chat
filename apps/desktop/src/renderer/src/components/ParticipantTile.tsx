import { useEffect, useRef } from 'react';
import { MicOff } from 'lucide-react';
import { useAudioActivity } from '../hooks/useAudioActivity';

export interface ParticipantTileProps {
  displayName: string;
  isSelf: boolean;
  muted: boolean;
  /** Whether this participant's camera is on (show video vs. avatar). */
  cameraOn: boolean;
  /** Camera+mic stream: local (muted preview) for self, remote otherwise. */
  cameraStream: MediaStream | null;
  /** This participant's assigned accent color. */
  color: string;
  /** Connection state for remote peers; omitted for self. */
  connectionState?: RTCPeerConnectionState;
  /** Abbreviated game name (top-right tag); omitted when none. */
  gameTag?: string;
}

const CONN_LABEL: Partial<Record<RTCPeerConnectionState, string>> = {
  new: 'connecting…',
  connecting: 'connecting…',
  disconnected: 'reconnecting…',
  failed: 'connection lost',
  closed: 'disconnected',
};

export function ParticipantTile({
  displayName,
  isSelf,
  muted,
  cameraOn,
  cameraStream,
  color,
  connectionState,
  gameTag,
}: ParticipantTileProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const speaking = useAudioActivity(muted ? null : cameraStream);

  // The <video> is always mounted so remote audio plays even with camera off.
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.srcObject = cameraStream;
  }, [cameraStream]);

  const connNote = !isSelf && connectionState ? CONN_LABEL[connectionState] : undefined;
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';

  return (
    <li
      className={`tile${isSelf ? ' tile--self' : ''}${speaking ? ' tile--speaking' : ''}`}
      style={{
        // Color-derived speaking ring + glow.
        ...(speaking
          ? {
              borderColor: color,
              boxShadow: `0 0 34px ${color}1e, inset 0 0 70px ${color}06`,
            }
          : null),
      }}
    >
      <div
        className="tile__ambient"
        style={{ background: `radial-gradient(circle at 50% 62%, ${color}0d 0%, transparent 58%)` }}
      />

      <video
        ref={videoRef}
        className="tile__video"
        autoPlay
        playsInline
        muted={isSelf}
        style={{ visibility: cameraOn ? 'visible' : 'hidden' }}
      />

      {!cameraOn && (
        <div className="tile__center">
          {speaking && (
            <>
              <span className="tile__ripple" style={{ borderColor: `${color}55` }} />
              <span
                className="tile__ripple tile__ripple--2"
                style={{ borderColor: `${color}28` }}
              />
            </>
          )}
          <div
            className="tile__avatar"
            style={{
              background: `linear-gradient(145deg, ${color}ee, ${color}66)`,
              boxShadow: speaking ? `0 0 34px ${color}70` : '0 4px 22px rgba(0,0,0,.55)',
            }}
          >
            {initial}
            {muted && (
              <span className="tile__avatar-mute">
                <MicOff size={11} strokeWidth={2.5} />
              </span>
            )}
          </div>
        </div>
      )}

      <div className="tile__badge">
        {speaking && (
          <span
            className="tile__badge-dot"
            style={{ background: color, boxShadow: `0 0 7px ${color}` }}
          />
        )}
        <span className="tile__badge-name">
          {displayName}
          {isSelf && ' (you)'}
        </span>
        {muted && cameraOn && <MicOff size={12} className="tile__badge-mute" />}
      </div>

      {gameTag && <div className="tile__gametag">🎮 {gameTag}</div>}
      {connNote && <div className="tile__conn">{connNote}</div>}
    </li>
  );
}
