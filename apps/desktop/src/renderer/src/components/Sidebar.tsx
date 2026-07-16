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
  /** Room governance: whether the local user may rename/remove this room
   *  (owner: all rooms; member: only the one they created). */
  canManageRoom: (room: Room) => boolean;
  /** Local stable userId — drives per-space owner checks in the switcher
   *  ("Leave Space" vs "Delete Space" labels). */
  myUserId: string;
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

  // Collapsible ROOMS section (rooms are unified hybrid — one list).
  roomsCollapsed: boolean;
  onToggleRoomsSection: () => void;

  /** Hide the space banner image and show a shorter, text-only header instead. */
  hideSpaceBanner: boolean;

  // Compact (sidebar-only dock) mode
  compact: boolean;
  /** Compact + chat sub-mode (dock also showing the room chat panel): shows the
   *  sidebar/chat splitter handle instead of the (redundant, window-edge-only) plain-compact resize. */
  compactChat: boolean;
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
  /** Start a P2P file transfer to a space member (USERS-row hover button). */
  onSendFile?: (userId: string) => void;
  /** OS files dropped onto a USERS row (multiple files = one batch). */
  onDropFiles?: (userId: string, files: File[]) => void;

  // Moderation (Space Owner / Room Moderator)
  /** Stable userId of the Space Owner (gold star), or null when unowned. */
  ownerUserId?: string | null;
  /** Stable userId of the current room's moderator (silver star), or null. Room-scoped —
   *  the client only knows the moderator of its own room. */
  moderatorUserId?: string | null;
  /** Whether the local user owns the active Space. */
  amOwner?: boolean;
  /** Whether the local user is the current room's moderator. */
  amModerator?: boolean;
  /** Bare ids of rooms currently locked to new entrants. */
  lockedRoomIds?: string[];
  /** Lock/unlock a room (owner any active room; moderator their own). */
  onToggleRoomLock?: (roomId: string, locked: boolean) => void;
  /** Whether the active Space is locked to newcomers. */
  spaceLocked?: boolean;
  /** Owner-only: lock/unlock the active Space. */
  onToggleSpaceLock?: (locked: boolean) => void;
  /** Open the moderation context menu for a USERS-list entry (right-click). */
  onUserContextMenu?: (userId: string, name: string, x: number, y: number) => void;
}

export function Sidebar({
  rooms,
  currentRoomId,
  onSelectRoom,
  onCreateRoom,
  onRequestRename,
  onRemoveRoom,
  canManageRoom,
  myUserId,
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

  roomsCollapsed,
  onToggleRoomsSection,

  hideSpaceBanner,

  compact,
  compactChat,
  widthScale,
  onResize,
  micEnabled,
  hasMic,
  onToggleMic,
  deafened,
  onToggleDeafen,
  inputMode,
  onCycleInputMode,
  selfSpeaking,
  speakingUserIds,
  mutedUserIds,
  onTogglePeerMute,
  onLeaveRoom,
  onSendFile,
  onDropFiles,
  ownerUserId,
  moderatorUserId,
  amOwner = false,
  amModerator = false,
  lockedRoomIds,
  onToggleRoomLock,
  spaceLocked = false,
  onToggleSpaceLock,
  onUserContextMenu,
}: SidebarProps): React.JSX.Element {
  const selfInitial = selfName.trim().charAt(0).toUpperCase() || 'Y';
  const [menu, setMenu] = useState<{ room: Room; x: number; y: number } | null>(null);
  const [usersCollapsed, setUsersCollapsed] = useState(false);

  const { navRef, handleResizeStart } = useSidebarResize(widthScale, onResize);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId);

  // Owner may lock any ACTIVE room (the server no-ops empty ones — an
  // ephemeral lock on an empty room would never clear); a mod only their own.
  const roomLockable = (roomId: string): boolean =>
    onToggleRoomLock != null &&
    (amOwner
      ? roomId === currentRoomId || users.some((u) => u.roomId === roomId)
      : amModerator && roomId === currentRoomId);

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
      onContextMenu={(room, x, y) => {
        // Open only when at least one item would show (mirrors UserContextMenu:
        // unauthorized users never see an empty menu shell).
        if (canManageRoom(room) || roomLockable(room.id)) setMenu({ room, x, y });
      }}
      compact={compact}
      onLeaveRoom={onLeaveRoom}
      locked={lockedRoomIds?.includes(r.id) ?? false}
    />
  );

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
        hideSpaceBanner={hideSpaceBanner}
        canLockSpace={amOwner}
        spaceLocked={spaceLocked}
        onToggleSpaceLock={onToggleSpaceLock}
        myUserId={myUserId}
      />

      <div className="sidebar__scroll">
        {activeSpace && (
          <>
            <div
              className="sidebar__section-header"
              onClick={onToggleRoomsSection}
              title={roomsCollapsed ? 'Expand rooms' : 'Collapse rooms'}
              role="button"
              tabIndex={0}
            >
              <ChevronDown
                size={12}
                className={`sidebar__section-chevron${roomsCollapsed ? ' sidebar__section-chevron--collapsed' : ''}`}
              />
              <span>ROOMS</span>
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
            {!roomsCollapsed && rooms.map(renderRoomRow)}

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
            {!usersCollapsed &&
              users.map((u) => (
                <FriendRow
                  key={u.id}
                  user={u}
                  role={u.id === ownerUserId ? 'owner' : u.id === moderatorUserId ? 'moderator' : null}
                  onSendFile={onSendFile}
                  onDropFiles={onDropFiles}
                  onContextMenu={onUserContextMenu}
                />
              ))}
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
        compact={compact}
        micEnabled={micEnabled}
        hasMic={hasMic}
        onToggleMic={onToggleMic}
        deafened={deafened}
        onToggleDeafen={onToggleDeafen}
        inputMode={inputMode}
        onCycleInputMode={onCycleInputMode}
        selfSpeaking={selfSpeaking}
      />

      {menu && (
        <RoomContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onRequestRename={onRequestRename}
          onRemoveRoom={onRemoveRoom}
          canManage={canManageRoom(menu.room)}
          canLock={roomLockable(menu.room.id)}
          locked={lockedRoomIds?.includes(menu.room.id) ?? false}
          onToggleLock={onToggleRoomLock}
        />
      )}

      {(!compact || compactChat) && (
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
