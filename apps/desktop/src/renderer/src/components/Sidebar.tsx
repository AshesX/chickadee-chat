import { useState } from 'react';
import { Pencil, Plus, Settings, Trash2, ChevronDown, Copy, Check } from 'lucide-react';
import type { Room, SpaceInfo } from '@chickadee/shared';

export interface Friend {
  name: string;
  initial: string;
  color: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
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
  selfStatus: 'online' | 'idle' | 'dnd';
  onChangeStatus: (status: 'online' | 'idle' | 'dnd') => void;

  // Space additions
  spaces: SpaceInfo[];
  activeSpaceId: string | null;
  onSelectSpace: (id: string) => void;
  onCreateSpace: () => void;
  onJoinSpace: () => void;
  onDeleteSpace: (id: string, name: string) => void;
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
  selfStatus,
  onChangeStatus,

  spaces,
  activeSpaceId,
  onSelectSpace,
  onCreateSpace,
  onJoinSpace,
  onDeleteSpace,
}: SidebarProps): React.JSX.Element {
  const onlineCount = friends.filter((f) => f.status !== 'offline').length;
  const selfInitial = selfName.trim().charAt(0).toUpperCase() || 'Y';
  const [menu, setMenu] = useState<{ room: Room; x: number; y: number } | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  
  // Space switcher states
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeSpace = spaces.find((s) => s.id === activeSpaceId);

  function copySpaceCode(): void {
    if (!activeSpace) return;
    if (window.chickadee?.writeClipboard) {
      void window.chickadee.writeClipboard(activeSpace.id);
    } else {
      navigator.clipboard.writeText(activeSpace.id);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <nav className="sidebar">
      <div className="sidebar__space-header">
        <div className="space-info-wrap">
          <button className="space-switcher-btn" onClick={() => setSwitcherOpen(!switcherOpen)}>
            <div className="space-switcher-btn__meta">
              <span className="space-switcher-btn__name">{activeSpace?.name || 'Loading...'}</span>
              {activeSpace && <span className="space-switcher-btn__code">#{activeSpace.id}</span>}
            </div>
            <ChevronDown size={12} className={`space-switcher-btn__chevron${switcherOpen ? ' space-switcher-btn__chevron--open' : ''}`} />
          </button>
        </div>
        {activeSpace && (
          <button 
            className="space-copy-btn" 
            onClick={copySpaceCode} 
            title="Copy Space Code"
          >
            {copied ? <Check size={13} style={{ color: '#4ade80' }} /> : <Copy size={13} />}
          </button>
        )}
      </div>

      {switcherOpen && (
        <div className="space-dropdown-backdrop" onClick={() => setSwitcherOpen(false)}>
          <div className="space-dropdown" onClick={(e) => e.stopPropagation()}>
            <div className="space-dropdown__list">
              {spaces.map((s) => {
                const isActive = s.id === activeSpaceId;
                return (
                  <div key={s.id} className={`space-dropdown__row${isActive ? ' space-dropdown__row--active' : ''}`}>
                    <button
                      className="space-dropdown__item-select"
                      onClick={() => {
                        onSelectSpace(s.id);
                        setSwitcherOpen(false);
                      }}
                    >
                      <span className="space-dropdown__item-name">{s.name}</span>
                      {isActive && <span className="space-dropdown__item-dot" />}
                    </button>
                    <button
                      className="space-dropdown__item-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSpace(s.id, s.name);
                      }}
                      title="Delete Space"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="space-dropdown__actions">
              <button
                className="space-dropdown__action-btn"
                onClick={() => {
                  onCreateSpace();
                  setSwitcherOpen(false);
                }}
              >
                <Plus size={12} />
                <span>Create Space</span>
              </button>
              <button
                className="space-dropdown__action-btn"
                onClick={() => {
                  onJoinSpace();
                  setSwitcherOpen(false);
                }}
              >
                <Plus size={12} />
                <span>Join Space</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
        <button
          className="sidebar__self-avatar-btn"
          onClick={() => setStatusMenuOpen(!statusMenuOpen)}
          aria-label="Change status"
        >
          <div className="friend-row__avatar-wrap">
            <div
              className="self__avatar"
              style={{ background: `linear-gradient(135deg, ${selfColor}, ${selfColor}99)` }}
            >
              {selfInitial}
            </div>
            <span className={`presence-dot presence-dot--${online ? selfStatus : 'offline'}`} />
          </div>
        </button>
        <div className="self__meta">
          <div className="self__name">{selfName || 'You'}</div>
          {selfGame && <div className="self__game">🎮 {selfGame}</div>}
        </div>
        <button className="self__settings" onClick={onOpenSettings} aria-label="Settings">
          <Settings size={15} />
        </button>

        {statusMenuOpen && (
          <>
            <div className="status-dropdown-backdrop" onClick={() => setStatusMenuOpen(false)} />
            <div className="status-dropdown" onClick={(e) => e.stopPropagation()}>
              <button
                className={`status-dropdown__item${selfStatus === 'online' ? ' status-dropdown__item--active' : ''}`}
                onClick={() => {
                  onChangeStatus('online');
                  setStatusMenuOpen(false);
                }}
              >
                <span className="presence-dot presence-dot--online presence-dot--static" />
                <span>Online</span>
              </button>
              <button
                className={`status-dropdown__item${selfStatus === 'idle' ? ' status-dropdown__item--active' : ''}`}
                onClick={() => {
                  onChangeStatus('idle');
                  setStatusMenuOpen(false);
                }}
              >
                <span className="presence-dot presence-dot--idle presence-dot--static" />
                <span>Idle</span>
              </button>
              <button
                className={`status-dropdown__item${selfStatus === 'dnd' ? ' status-dropdown__item--active' : ''}`}
                onClick={() => {
                  onChangeStatus('dnd');
                  setStatusMenuOpen(false);
                }}
              >
                <span className="presence-dot presence-dot--dnd presence-dot--static" />
                <span>Do Not Disturb</span>
              </button>
            </div>
          </>
        )}
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
