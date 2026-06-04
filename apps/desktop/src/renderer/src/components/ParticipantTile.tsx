import { useEffect, useRef } from 'react';
import { useAudioActivity } from '../hooks/useAudioActivity';

export interface ParticipantTileProps {
  displayName: string;
  isSelf: boolean;
  muted: boolean;
  /** Whether this participant's camera is on (show video vs. avatar). */
  cameraOn: boolean;
  /** Camera+mic stream: local (muted preview) for self, remote otherwise. */
  cameraStream: MediaStream | null;
  /** Connection state for remote peers; omitted for self. */
  connectionState?: RTCPeerConnectionState;
}

const CONN_LABEL: Partial<Record<RTCPeerConnectionState, string>> = {
  new: 'connecting…',
  connecting: 'connecting…',
  disconnected: 'reconnecting…',
  failed: 'connection failed',
  closed: 'disconnected',
};

export function ParticipantTile({
  displayName,
  isSelf,
  muted,
  cameraOn,
  cameraStream,
  connectionState,
}: ParticipantTileProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const speaking = useAudioActivity(muted ? null : cameraStream);

  // The <video> element plays remote audio+video; for self it's a muted
  // preview. It is always mounted so remote audio plays even with camera off.
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.srcObject = cameraStream;
  }, [cameraStream]);

  const connNote = !isSelf && connectionState ? CONN_LABEL[connectionState] : undefined;

  return (
    <li
      className={`tile${isSelf ? ' tile--self' : ''}${speaking ? ' tile--speaking' : ''}`}
    >
      <video
        ref={videoRef}
        className="tile__video"
        autoPlay
        playsInline
        muted={isSelf}
        style={{ visibility: cameraOn ? 'visible' : 'hidden' }}
      />

      {!cameraOn && (
        <div className="tile__placeholder">
          <span className="tile__avatar">{avatarFor(displayName)}</span>
        </div>
      )}

      <div className="tile__bar">
        <span className={`tile__mic${muted ? ' tile__mic--muted' : ''}`} aria-hidden>
          {muted ? '🔇' : '🎙️'}
        </span>
        <span className="tile__name">
          {displayName}
          {isSelf && ' (you)'}
        </span>
        {connNote && <span className="tile__conn">{connNote}</span>}
      </div>
    </li>
  );
}

function avatarFor(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
