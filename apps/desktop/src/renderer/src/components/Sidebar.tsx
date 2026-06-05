import { Plus, Settings } from 'lucide-react';
import type { Room } from '@chickadee/shared';

export interface Friend {
  name: string;
  initial: string;
  color: string;
  status: 'online' | 'idle' | 'offline';
  where: string;
}

interface SidebarProps {
  rooms: Room[];
  currentRoomId: string | null;
  /** Participant count for the current room (peers + self); 0 if not in one. */
  currentRoomCount: number;
  onSelectRoom: (id: string) => void;
  onCreateRoom: () => void;
  friends: Friend[];
  selfName: string;
  selfColor: string;
  online: boolean;
  selfGame?: string;
  onOpenSettings: () => void;
}

export function Sidebar({
  rooms,
  currentRoomId,
  currentRoomCount,
  onSelectRoom,
  onCreateRoom,
  friends,
  selfName,
  selfColor,
  online,
  selfGame,
  onOpenSettings,
}: SidebarProps): React.JSX.Element {
  const onlineCount = friends.filter((f) => f.status !== 'offline').length;
  const selfInitial = selfName.trim().charAt(0).toUpperCase() || 'Y';

  return (
    <nav className="sidebar">
      <div className="sidebar__logo">
        <span className="sidebar__bird">🐦</span>
        <span className="sidebar__wordmark">
          Chickadee <span className="sidebar__wordmark-accent">CHAT</span>
        </span>
      </div>

      <div className="sidebar__scroll">
        <p className="sidebar__label">ROOMS</p>
        {rooms.map((r) => {
          const active = r.id === currentRoomId;
          return (
            <button
              key={r.id}
              className={`room-row${active ? ' room-row--active' : ''}`}
              onClick={() => onSelectRoom(r.id)}
            >
              <span className="room-row__icon">{r.icon}</span>
              <span className="room-row__name">{r.label}</span>
              {active && currentRoomCount > 0 && (
                <span className="room-row__count">{currentRoomCount}</span>
              )}
            </button>
          );
        })}
        <button className="room-row room-row--create" onClick={onCreateRoom}>
          <Plus size={14} />
          <span>Create Room</span>
        </button>

        <p className="sidebar__label">
          FRIENDS{friends.length > 0 ? ` — ${onlineCount} online` : ''}
        </p>
        {friends.length === 0 && <p className="sidebar__hint">No friends yet</p>}
        {friends.map((f) => (
          <div key={f.name} className="friend-row">
            <div className="friend-row__avatar-wrap">
              <div
                className="friend-row__avatar"
                style={{ background: `linear-gradient(135deg, ${f.color}, ${f.color}66)` }}
              >
                {f.initial}
              </div>
              <span className={`presence-dot presence-dot--${f.status}`} />
            </div>
            <div className="friend-row__meta">
              <div className={`friend-row__name${f.status === 'offline' ? ' friend-row__name--off' : ''}`}>
                {f.name}
              </div>
              <div className="friend-row__where">{f.where}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="sidebar__self">
        <div className="friend-row__avatar-wrap">
          <div
            className="self__avatar"
            style={{ background: `linear-gradient(135deg, ${selfColor}, ${selfColor}99)` }}
          >
            {selfInitial}
          </div>
          <span className={`presence-dot presence-dot--${online ? 'online' : 'offline'}`} />
        </div>
        <div className="self__meta">
          <div className="self__name">{selfName || 'You'}</div>
          {selfGame && <div className="self__game">🎮 {selfGame}</div>}
        </div>
        <button className="self__settings" onClick={onOpenSettings} aria-label="Settings">
          <Settings size={15} />
        </button>
      </div>
    </nav>
  );
}
