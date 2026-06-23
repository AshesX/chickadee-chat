import { useState, useRef, useEffect } from 'react';
import {
  Pencil,
  Plus,
  Settings,
  Trash2,
  ChevronDown,
  ChevronsLeft,
  Copy,
  Check,
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  VideoOff,
} from 'lucide-react';
import { capacityForType, sanitizeAvatarDataUrl, type Room, type SpaceInfo } from '@chickadee/shared';

import type { SpaceUser } from '../hooks/useSpacePresence';
import { INPUT_MODE_ICONS } from '../lib/inputModeIcons';
import { RoomIcon } from './RoomIcon';
import { WindowControls } from './WindowControls';

interface SidebarProps {
  rooms: Room[];
  currentRoomId: string | null;
  onSelectRoom: (id: string) => void;
  onCreateRoom: () => void;
  onRequestRename: (room: Room) => void;
  onRemoveRoom: (id: string) => void;
  users: SpaceUser[];
  selfName: string;
  selfColor: string;
  selfAvatarUrl?: string | null;
  online: boolean;
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
  onSpaceSettings: (id: string) => void;

  // Collapsible room category sections (VOICE / VIDEO)
  voiceCollapsed: boolean;
  videoCollapsed: boolean;
  onToggleVoiceSection: () => void;
  onToggleVideoSection: () => void;

  // Compact (sidebar-only dock) mode
  compact: boolean;
  onToggleCompact: () => void;
  micEnabled: boolean;
  hasMic: boolean;
  onToggleMic: () => void;
  deafened: boolean;
  onToggleDeafen: () => void;
  inputMode: 'open' | 'voice' | 'ptt';
  onCycleInputMode: () => void;
  /** Whether we've joined any peer's video (drives the compact leave-video button). */
  hasVideoSubs: boolean;
  /** Leave all joined video streams (compact-mode control). */
  onLeaveAllVideo: () => void;
  /** Whether our own voice is currently active (greens the compact input-mode icon). */
  selfSpeaking: boolean;
  /** Stable userIds of peers currently speaking (drives compact avatar outlines). */
  speakingUserIds: Set<string>;
}

export function Sidebar({
  rooms,
  currentRoomId,
  onSelectRoom,
  onCreateRoom,
  onRequestRename,
  onRemoveRoom,
  users,
  selfName,
  selfColor,
  selfAvatarUrl,
  online,
  onOpenSettings,
  selfStatus,
  onChangeStatus,

  spaces,
  activeSpaceId,
  onSelectSpace,
  onCreateSpace,
  onJoinSpace,
  onDeleteSpace,
  onSpaceSettings,

  voiceCollapsed,
  videoCollapsed,
  onToggleVoiceSection,
  onToggleVideoSection,

  compact,
  onToggleCompact,
  micEnabled,
  hasMic,
  onToggleMic,
  deafened,
  onToggleDeafen,
  inputMode,
  onCycleInputMode,
  hasVideoSubs,
  onLeaveAllVideo,
  selfSpeaking,
  speakingUserIds,
}: SidebarProps): React.JSX.Element {
  const onlineCount = users.filter((u) => u.status !== 'offline').length;
  const selfInitial = selfName.trim().charAt(0).toUpperCase() || 'Y';
  const InputModeIcon = INPUT_MODE_ICONS[inputMode];
  const [menu, setMenu] = useState<{ room: Room; x: number; y: number } | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  // Space switcher states
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeSpace = spaces.find((s) => s.id === activeSpaceId);

  // Typewriter state for copy hover effect
  const [hoveredSpaceId, setHoveredSpaceId] = useState<string | null>(null);
  const [typedCode, setTypedCode] = useState('');

  const [usersCollapsed, setUsersCollapsed] = useState(false);

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

  // Typewriter effect for Copy Space Code hover
  useEffect(() => {
    const hoveredSpace = spaces.find((s) => s.id === hoveredSpaceId);
    if (!hoveredSpace) {
      setTypedCode('');
      return;
    }

    if (!copied) {
      const fullText = hoveredSpace.id;
      let index = 1;
      setTypedCode(fullText.substring(0, index));
      const interval = setInterval(() => {
        index++;
        setTypedCode(fullText.substring(0, index));
        if (index >= fullText.length) {
          clearInterval(interval);
        }
      }, 15);
      return () => clearInterval(interval);
    } else {
      setTypedCode('');
    }
  }, [hoveredSpaceId, copied, spaces]);

  function copySpaceCode(spaceId: string): void {
    if (window.chickadee?.writeClipboard) {
      void window.chickadee.writeClipboard(spaceId);
    } else {
      navigator.clipboard.writeText(spaceId);
    }
    setCopied(true);
    setTypedCode('');
    setTimeout(() => setCopied(false), 1500);
  }

  function renderRoom(r: Room): React.JSX.Element {
    const active = r.id === currentRoomId;

    const roomUsers = users.filter((u) => u.roomId === r.id);
    if (active) {
      roomUsers.unshift({
        id: 'self',
        name: selfName,
        initial: selfInitial,
        color: selfColor,
        status: selfStatus,
        where: '',
        roomId: r.id,
        avatarUrl: selfAvatarUrl || undefined,
      });
    }

    const cap = capacityForType(r.type);
    const occupancy = roomUsers.length;
    const full = occupancy >= cap;

    return (
      <div
        key={r.id}
        className={`room-row${active ? ' room-row--active' : ''}${full && !active ? ' room-row--full' : ''}`}
      >
        <button
          className="room-row__main"
          onClick={() => onSelectRoom(r.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ room: r, x: e.clientX, y: e.clientY });
          }}
        >
          <span className="room-row__icon"><RoomIcon name={r.icon} size={15} /></span>
          <span className="room-row__name">{r.label}</span>
          {roomUsers.length > 0 && (
            <div className="room-row__avatars">
              {roomUsers.slice(0, 4).map((u) => {
                const uAvatar = sanitizeAvatarDataUrl(u.avatarUrl);
                const isSpeaking = u.id === 'self' ? selfSpeaking : speakingUserIds.has(u.id);
                return (
                  <div
                    key={u.id}
                    className={`room-row__avatar${isSpeaking ? ' room-row__avatar--speaking' : ''}`}
                    style={{
                      ...(uAvatar ? {} : { background: u.color }),
                      '--avatar-accent': u.color,
                    } as React.CSSProperties}
                  >
                    {uAvatar ? (
                      <img src={uAvatar} alt={u.name} />
                    ) : (
                      u.initial
                    )}
                  </div>
                );
              })}
              {roomUsers.length > 4 && (
                <div className="room-row__avatar" style={{ background: 'var(--border)' }}>
                  +{roomUsers.length - 4}
                </div>
              )}
            </div>
          )}
          <span className={`room-row__count${full ? ' room-row__count--full' : ''}`}>
            {occupancy}/{cap}
          </span>
        </button>
        {compact && active && (
          <div className="room-row__mini-controls">
            <button
              className={`room-row__mini-btn${micEnabled ? '' : ' room-row__mini-btn--danger'}`}
              onClick={onToggleMic}
              disabled={!hasMic}
              title={micEnabled ? 'Mute' : 'Unmute'}
              aria-label={micEnabled ? 'Mute' : 'Unmute'}
            >
              {micEnabled ? <Mic size={14} /> : <MicOff size={14} />}
            </button>
            <button
              className={`room-row__mini-btn${deafened ? ' room-row__mini-btn--danger' : ''}`}
              onClick={onToggleDeafen}
              title={deafened ? 'Undeafen' : 'Deafen'}
              aria-label={deafened ? 'Undeafen' : 'Deafen'}
            >
              {deafened ? <HeadphoneOff size={14} /> : <Headphones size={14} />}
            </button>
            <button
              className={`room-row__mini-btn${selfSpeaking ? ' room-row__mini-btn--speaking' : ''}`}
              onClick={onCycleInputMode}
              title={inputMode === 'ptt' ? 'Push-Talk' : inputMode === 'voice' ? 'Voice' : 'Open Mic'}
              aria-label="Cycle input mode"
            >
              <InputModeIcon size={14} />
            </button>
            {hasVideoSubs && (
              <button
                className="room-row__mini-btn room-row__mini-btn--end room-row__mini-btn--danger"
                onClick={onLeaveAllVideo}
                title="Leave video"
                aria-label="Leave video"
              >
                <VideoOff size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const voiceRooms = rooms.filter((r) => (r.type ?? 'video') === 'voice');
  const videoRooms = rooms.filter((r) => (r.type ?? 'video') === 'video');

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
            </button>
          </div>
          <button
            className="sidebar__collapse-btn"
            onClick={onToggleCompact}
            title={compact ? 'Expand' : 'Collapse to sidebar'}
            aria-label={compact ? 'Expand' : 'Collapse to sidebar'}
          >
            <ChevronsLeft
              size={14}
              className={`sidebar__collapse-icon${compact ? ' sidebar__collapse-icon--flipped' : ''}`}
            />
          </button>
          {compact && <WindowControls showMaximize={false} />}
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
                        <span className="space-dropdown__item-name">
                          {copied && hoveredSpaceId === s.id ? (
                            <span
                              className="space-switcher-btn__name--code"
                              style={{
                                background: 'none',
                                WebkitTextFillColor: 'var(--green)',
                                color: 'var(--green)'
                              }}
                            >
                              copied
                            </span>
                          ) : hoveredSpaceId === s.id ? (
                            <span className="space-switcher-btn__name--code">
                              {typedCode}
                            </span>
                          ) : (
                            s.name
                          )}
                        </span>
                      </button>
                      <button
                        className="space-dropdown__item-settings"
                        onClick={(e) => {
                          e.stopPropagation();
                          copySpaceCode(s.id);
                        }}
                        onMouseEnter={() => setHoveredSpaceId(s.id)}
                        onMouseLeave={() => setHoveredSpaceId(null)}
                        title="Copy Space Code"
                      >
                        {copied && hoveredSpaceId === s.id ? <Check size={12} style={{ color: '#4ade80' }} /> : <Copy size={12} />}
                      </button>
                      <button
                        className="space-dropdown__item-settings"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSpaceSettings(s.id);
                          setSwitcherOpen(false);
                        }}
                        title="Space Settings"
                      >
                        <Settings size={12} />
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
            <div
              className="sidebar__section-header"
              onClick={onToggleVoiceSection}
              title={voiceCollapsed ? 'Expand voice rooms' : 'Collapse voice rooms'}
              role="button"
              tabIndex={0}
            >
              <ChevronDown
                size={12}
                className={`sidebar__section-chevron${voiceCollapsed ? ' sidebar__section-chevron--collapsed' : ''}`}
              />
              <span>VOICE</span>
              <span className="sidebar__section-count">{voiceRooms.length}</span>
              <div style={{ flex: 1 }} />
              <button
                className="sidebar__section-create-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateRoom();
                }}
                title="Create Room"
              >
                <Plus size={14} />
              </button>
            </div>
            {!voiceCollapsed && voiceRooms.map(renderRoom)}

            <div
              className="sidebar__section-header sidebar__section-header--spaced"
              onClick={onToggleVideoSection}
              title={videoCollapsed ? 'Expand video rooms' : 'Collapse video rooms'}
              role="button"
              tabIndex={0}
            >
              <ChevronDown
                size={12}
                className={`sidebar__section-chevron${videoCollapsed ? ' sidebar__section-chevron--collapsed' : ''}`}
              />
              <span>VIDEO</span>
              <span className="sidebar__section-count">{videoRooms.length}</span>
              <div style={{ flex: 1 }} />
              <button
                className="sidebar__section-create-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateRoom();
                }}
                title="Create Room"
              >
                <Plus size={14} />
              </button>
            </div>
            {!videoCollapsed && videoRooms.map(renderRoom)}



            <div
              className="sidebar__section-header sidebar__section-header--spaced"
              onClick={() => setUsersCollapsed(!usersCollapsed)}
              title={usersCollapsed ? 'Expand users' : 'Collapse users'}
              role="button"
              tabIndex={0}
            >
              <ChevronDown
                size={12}
                className={`sidebar__section-chevron${usersCollapsed ? ' sidebar__section-chevron--collapsed' : ''}`}
              />
              <span>USERS</span>
              {users.length > 0 && <span className="sidebar__section-count">— {onlineCount} online</span>}
            </div>
            {!usersCollapsed && users.map((u) => {
              // Validate peer-supplied avatar before rendering (defense in depth).
              const uAvatar = sanitizeAvatarDataUrl(u.avatarUrl);
              return (
                <div key={u.id} className="friend-row">
                  <div className="friend-row__avatar-wrap">
                    <div
                      className="friend-row__avatar"
                      style={uAvatar ? undefined : { background: u.color }}
                    >
                      {uAvatar ? (
                        <img src={uAvatar} alt={u.name} className="friend-avatar-img" />
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
              );
            })}
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
              style={selfAvatarUrl ? undefined : { background: selfColor }}
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
