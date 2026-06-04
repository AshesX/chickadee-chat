import { useEffect, useRef } from 'react';
import { useAudioActivity } from '../hooks/useAudioActivity';

export interface ParticipantTileProps {
  displayName: string;
  isSelf: boolean;
  muted: boolean;
  /** Local stream for self (analysed, never played); remote stream otherwise. */
  stream: MediaStream | null;
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
  stream,
  connectionState,
}: ParticipantTileProps): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null);
  const speaking = useAudioActivity(muted ? null : stream);

  // Attach the remote stream for playback. Self audio is never played (echo).
  useEffect(() => {
    const el = audioRef.current;
    if (el && !isSelf) el.srcObject = stream;
  }, [stream, isSelf]);

  const connNote = connectionState ? CONN_LABEL[connectionState] : undefined;

  return (
    <li className={`peer${isSelf ? ' peer--self' : ''}${speaking ? ' peer--speaking' : ''}`}>
      <span className="peer__avatar">{avatarFor(displayName)}</span>
      <span className="peer__name">{displayName}</span>

      {isSelf && <span className="peer__tag">you</span>}
      {connNote && <span className="peer__conn">{connNote}</span>}
      <span className={`peer__mic${muted ? ' peer__mic--muted' : ''}`} aria-hidden>
        {muted ? '🔇' : '🎙️'}
      </span>

      {!isSelf && <audio ref={audioRef} autoPlay />}
    </li>
  );
}

function avatarFor(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
