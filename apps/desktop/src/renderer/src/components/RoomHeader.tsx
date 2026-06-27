import { MessageSquare } from 'lucide-react';
import type { Room } from '@chickadee/shared';
import { WindowControls } from './WindowControls';
import { RoomIcon } from './RoomIcon';

interface RoomHeaderProps {
  room: Room | null;
  chatOpen: boolean;
  onToggleChat: () => void;
  hasSpace: boolean;
}

export function RoomHeader({
  room,
  chatOpen,
  onToggleChat,
  hasSpace,
}: RoomHeaderProps): React.JSX.Element {

  return (
    <header className="room-header">
      <div className="room-header__title-wrap">
        {room ? (
          <>
            <div className="room-header__title">
              <span><RoomIcon name={room.icon} size={36} /></span>
              {room.label}
            </div>
          </>
        ) : hasSpace ? (
          <div className="room-header__title room-header__title--idle">
            Select a room to start
          </div>
        ) : null}
      </div>

      <div className="room-header__spacer" />

      {room && (
        <>
          <button
            className={`pill pill--chat${chatOpen ? ' pill--chat-on' : ''}`}
            onClick={onToggleChat}
          >
            <MessageSquare size={14} />
            Chat
          </button>
        </>
      )}

      <WindowControls />
    </header>
  );
}
