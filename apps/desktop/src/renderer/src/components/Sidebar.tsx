import { useState } from 'react';
import { Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import type { Room } from '@chickadee/shared';
import { Logo } from './Logo';

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
  onRequestRename: (room: Room) => void;
  onRemoveRoom: (id: string) => void;
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
  onRequestRename,
  onRemoveRoom,
  friends,
  selfName,
  selfColor,
  online,
  selfGame,
  onOpenSettings,
}: SidebarProps): React.JSX.Element {
  const onlineCount = friends.filter((f) => f.status !== 'offline').length;
  const selfInitial = selfName.trim().charAt(0).toUpperCase() || 'Y';
  const [menu, setMenu] = useState<{ room: Room; x: number; y: number } | null>(null);

  return (
    <nav className="sidebar">
      <div className="sidebar__logo">
        <Logo size={24} className="sidebar__bird" />
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
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ room: r, x: e.clientX, y: e.clientY });
              }}
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

      {menu && (
        <div
          className="ctx-backdrop"
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        >
          <div
            className="ctx-menu"
            style={{ left: menu.x, top: menu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="ctx-menu__item"
              onClick={() => {
                onRequestRename(menu.room);
                setMenu(null);
              }}
            >
              <Pencil size={13} />
              Rename
            </button>
            <button
              className="ctx-menu__item ctx-menu__item--danger"
              onClick={() => {
                onRemoveRoom(menu.room.id);
                setMenu(null);
              }}
            >
              <Trash2 size={13} />
              Remove
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
