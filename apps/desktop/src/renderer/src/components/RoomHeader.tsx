import { MessageSquare, Mic } from 'lucide-react';
import type { Room } from '../lib/localStore';
import type { ConnectionStatus } from '../hooks/useSignaling';
import { WindowControls } from './WindowControls';

interface RoomHeaderProps {
  room: Room | null;
  count: number;
  maxCount: number;
  status: ConnectionStatus;
  timer: string;
  game?: string;
  noiseSuppressed: boolean;
  onToggleNoise: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
}

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  'room-full': 'Room full',
  error: 'Connection error',
  closed: 'Disconnected',
};

export function RoomHeader({
  room,
  count,
  maxCount,
  status,
  timer,
  game,
  noiseSuppressed,
  onToggleNoise,
  chatOpen,
  onToggleChat,
}: RoomHeaderProps): React.JSX.Element {
  const connected = status === 'connected';

  return (
    <header className="room-header">
      <div className="room-header__title-wrap">
        {room ? (
          <>
            <div className="room-header__title">
              <span>{room.icon}</span>
              {room.label}
              <span className="room-header__count">
                {count} / {maxCount}
              </span>
            </div>
            <div className="room-header__sub">
              {game ? `${game} · ` : ''}⏱ {timer}
            </div>
          </>
        ) : (
          <div className="room-header__title room-header__title--idle">
            Select a room to start
          </div>
        )}
      </div>

      <div className="room-header__spacer" />

      {room && (
        <>
          <button
            className={`pill${noiseSuppressed ? ' pill--on' : ''}`}
            onClick={onToggleNoise}
            title="Noise suppression (coming soon)"
          >
            <Mic size={12} />
            {noiseSuppressed ? 'Noise Suppressed' : 'Noise Off'}
          </button>

          <div className={`pill pill--status pill--status-${status}`}>
            <span className={`status-dot${connected ? ' status-dot--pulse' : ''}`} />
            {STATUS_TEXT[status]}
          </div>

          <button
            className={`pill pill--chat${chatOpen ? ' pill--chat-on' : ''}`}
            onClick={onToggleChat}
          >
            <MessageSquare size={13} />
            Chat
          </button>
        </>
      )}

      <WindowControls />
    </header>
  );
}
