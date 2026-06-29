import { useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { type Room, type SpaceInfo } from '@chickadee/shared';

import type { SpaceUser } from '../hooks/useSpacePresence';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { SpaceSwitcher } from './sidebar/SpaceSwitcher';
import { RoomRow } from './sidebar/RoomRow';
import { FriendRow } from './sidebar/FriendRow';
import { SidebarSelf } from './sidebar/SidebarSelf';
import { RoomContextMenu } from './sidebar/RoomContextMenu';

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
  /** Current sidebar width scale (1.0–2.0), shared between compact + full view. */
  widthScale: number;
  /** Live sidebar resize from the drag handle; commit=true on pointer release. */
  onResize: (scale: number, commit: boolean) => void;
  micEnabled: boolean;
  hasMic: boolean;
  onToggleMic: () => void;
  deafened: boolean;
  onToggleDeafen: () => void;
  inputMode: 'voice' | 'ptt';
  onCycleInputMode: () => void;
  /** Whether we've joined any peer's video (drives the compact leave-video button). */
  hasVideoSubs: boolean;
  /** Leave all joined video streams (compact-mode control). */
  onLeaveAllVideo: () => void;
  /** Whether our own voice is currently active (greens the compact input-mode icon). */
  selfSpeaking: boolean;
  /** Stable userIds of peers currently speaking (drives compact avatar outlines). */
  speakingUserIds: Set<string>;
  /** Stable userIds of peers we've silenced (drives the compact avatar mute overlay). */
  mutedUserIds: Set<string>;
  /** Toggle silence for a peer by stable userId (compact avatar click). */
  onTogglePeerMute: (userId: string) => void;
  /** Leave the current room (compact Leave mini-button). */
  onLeaveRoom: () => void;
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
  widthScale,
  onResize,
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
  mutedUserIds,
  onTogglePeerMute,
  onLeaveRoom,
}: SidebarProps): React.JSX.Element {
  const selfInitial = selfName.trim().charAt(0).toUpperCase() || 'Y';
  const [menu, setMenu] = useState<{ room: Room; x: number; y: number } | null>(null);
  const [usersCollapsed, setUsersCollapsed] = useState(false);

  const { navRef, handleResizeStart } = useSidebarResize(compact, widthScale, onResize);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId);

  const renderRoomRow = (r: Room): React.JSX.Element => (
    <RoomRow
      key={r.id}
      room={r}
      currentRoomId={currentRoomId}
      users={users}
      selfName={selfName}
      selfInitial={selfInitial}
      selfColor={selfColor}
      selfStatus={selfStatus}
      selfAvatarUrl={selfAvatarUrl}
      selfSpeaking={selfSpeaking}
      speakingUserIds={speakingUserIds}
      mutedUserIds={mutedUserIds}
      onTogglePeerMute={onTogglePeerMute}
      onSelectRoom={onSelectRoom}
      onContextMenu={(room, x, y) => setMenu({ room, x, y })}
      compact={compact}
      micEnabled={micEnabled}
      hasMic={hasMic}
      onToggleMic={onToggleMic}
      deafened={deafened}
      onToggleDeafen={onToggleDeafen}
      inputMode={inputMode}
      onCycleInputMode={onCycleInputMode}
      hasVideoSubs={hasVideoSubs}
      onLeaveAllVideo={onLeaveAllVideo}
      onLeaveRoom={onLeaveRoom}
    />
  );

  const voiceRooms = rooms.filter((r) => (r.type ?? 'video') === 'voice');
  const videoRooms = rooms.filter((r) => (r.type ?? 'video') === 'video');

  return (
    <nav className="sidebar" ref={navRef}>
      <SpaceSwitcher
        spaces={spaces}
        activeSpaceId={activeSpaceId}
        onSelectSpace={onSelectSpace}
        onCreateSpace={onCreateSpace}
        onJoinSpace={onJoinSpace}
        onDeleteSpace={onDeleteSpace}
        onSpaceSettings={onSpaceSettings}
        compact={compact}
        onToggleCompact={onToggleCompact}
      />

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
            {!voiceCollapsed && voiceRooms.map(renderRoomRow)}

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
            {!videoCollapsed && videoRooms.map(renderRoomRow)}



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
            </div>
            {!usersCollapsed && users.map((u) => <FriendRow key={u.id} user={u} />)}
          </>
        )}
      </div>

      <SidebarSelf
        selfName={selfName}
        selfInitial={selfInitial}
        selfColor={selfColor}
        selfAvatarUrl={selfAvatarUrl}
        online={online}
        selfStatus={selfStatus}
        onChangeStatus={onChangeStatus}
        onOpenSettings={onOpenSettings}
      />

      {menu && (
        <RoomContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onRequestRename={onRequestRename}
          onRemoveRoom={onRemoveRoom}
        />
      )}

      {!compact && (
        <div
          className="resize-handle sidebar__resize-handle"
          onPointerDown={handleResizeStart}
          title="Drag to resize sidebar"
          role="separator"
          aria-orientation="vertical"
        />
      )}
    </nav>
  );
}
