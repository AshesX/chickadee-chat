import { useState, useRef, useEffect } from 'react';
import { Pencil, Plus, Settings, Trash2, ChevronDown, Copy, Check } from 'lucide-react';
import type { Room, SpaceInfo } from '@chickadee/shared';

import type { SpaceUser } from '../hooks/useSpacePresence';

interface SidebarProps {
  rooms: Room[];
  currentRoomId: string | null;
  /** Participant count for the current room (peers + self); 0 if not in one. */
  currentRoomCount: number;
  onSelectRoom: (id: string) => void;
  onCreateRoom: () => void;
  onRequestRename: (room: Room) => void;
  onRemoveRoom: (id: string) => void;
  users: SpaceUser[];
  selfName: string;
  selfColor: string;
  selfAvatarUrl?: string | null;
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
  users,
  selfName,
  selfColor,
  selfAvatarUrl,
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
  const onlineCount = users.filter((u) => u.status !== 'offline').length;
  const selfInitial = selfName.trim().charAt(0).toUpperCase() || 'Y';
  const [menu, setMenu] = useState<{ room: Room; x: number; y: number } | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  
  // Space switcher states
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeSpace = spaces.find((s) => s.id === activeSpaceId);

  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startCloseTimeout(): void {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = setTimeout(() => {
      setSwitcherOpen(false);
    }, 1000);
  }

  function cancelCloseTimeout(): void {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Close when clicking outside of the switcher container
  useEffect(() => {
    if (!switcherOpen) return;

    function handleOutsideClick(e: MouseEvent): void {
      const container = document.getElementById('sidebar-space-header-container');
      if (container && !container.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [switcherOpen]);

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
      <div 
        id="sidebar-space-header-container"
        className="sidebar__space-header-container"
        onMouseLeave={startCloseTimeout}
        onMouseEnter={cancelCloseTimeout}
      >
        <div className="sidebar__space-header">
          <div className="space-info-wrap">
            <button className="space-switcher-btn" onClick={() => setSwitcherOpen(!switcherOpen)}>
              <div className="space-switcher-btn__meta">
                <span className={`space-switcher-btn__name${!activeSpace ? ' space-switcher-btn__name--empty' : ''}`}>
                  {activeSpace?.name ?? 'Create / Join Space'}
                </span>
              </div>
              <ChevronDown size={12} className={`space-switcher-btn__chevron${switcherOpen ? ' space-switcher-btn__chevron--open' : ''}`} />
            </button>
          </div>
          {activeSpace && (
            <button 
              className="space-copy-btn" 
              onClick={copySpaceCode} 
            >
              {copied ? <Check size={13} style={{ color: '#4ade80' }} /> : <Copy size={13} />}
              <span className="space-copy-btn__tooltip">
                {copied ? (
                  'Copied!'
                ) : (
                  <>
                    <span className="space-copy-btn__tooltip-action">Copy Space Code</span>
                    <span className="space-copy-btn__tooltip-code">#{activeSpace.id}</span>
                  </>
                )}
              </span>
            </button>
          )}
        </div>

        {switcherOpen && (
          <div className="space-dropdown" onClick={(e) => e.stopPropagation()}>
            {spaces.length > 0 && (
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
            )}
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
        )}
      </div>

      <div className="sidebar__scroll">
        {activeSpace && (
          <>
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
              USERS{users.length > 0 ? ` — ${onlineCount} online` : ''}
            </p>
            {users.length === 0 && <p className="sidebar__hint">No users yet</p>}
            {users.map((u) => (
              <div key={u.id} className="friend-row">
                <div className="friend-row__avatar-wrap">
                  <div
                    className="friend-row__avatar"
                    style={u.avatarUrl ? undefined : { background: `linear-gradient(135deg, ${u.color}, ${u.color}66)` }}
                  >
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt={u.name} className="friend-avatar-img" />
                    ) : (
                      u.initial
                    )}
                  </div>
                  <span className={`presence-dot presence-dot--${u.status}`} />
                </div>
                <div className="friend-row__meta">
                  <div className={`friend-row__name${u.status === 'offline' ? ' friend-row__name--off' : ''}`}>
                    {u.name}
                  </div>
                  <div className="friend-row__where">{u.where}</div>
                </div>
              </div>
            ))}
          </>
        )}
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
              style={selfAvatarUrl ? undefined : { background: `linear-gradient(135deg, ${selfColor}, ${selfColor}99)` }}
            >
              {selfAvatarUrl ? (
                <img src={selfAvatarUrl} alt={selfName} className="friend-avatar-img" />
              ) : (
                selfInitial
              )}
            </div>
            <span className={`presence-dot presence-dot--${online ? selfStatus : 'offline'}`} />
          </div>
        </button>
        <div className="self__meta">
          <div className="self__name">{selfName || 'You'}</div>
          {selfGame && <div className="self__game">🎮 {selfGame}</div>}
        </div>
        <button className="self__settings" onClick={onOpenSettings} aria-label="Settings">
          <Settings size={18} />
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
