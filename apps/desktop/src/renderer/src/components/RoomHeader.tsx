import { MessageSquare } from 'lucide-react';
import type { Room } from '@chickadee/shared';
import { WindowControls } from './WindowControls';

interface RoomHeaderProps {
  room: Room | null;
  count: number;
  maxCount: number;
  timer: string;
  game?: string;
  chatOpen: boolean;
  onToggleChat: () => void;
}

export function RoomHeader({
  room,
  count,
  maxCount,
  timer,
  game,
  chatOpen,
  onToggleChat,
}: RoomHeaderProps): React.JSX.Element {

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
