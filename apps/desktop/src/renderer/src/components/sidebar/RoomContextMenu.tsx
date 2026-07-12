import { Pencil, Trash2, Lock, LockOpen } from 'lucide-react';
import type { Room } from '@chickadee/shared';

interface RoomContextMenuProps {
  menu: { room: Room; x: number; y: number };
  onClose: () => void;
  onRequestRename: (room: Room) => void;
  onRemoveRoom: (id: string) => void;
  /** Room governance: whether the local user may rename/remove this room
   *  (owner: any room; member: only the one they created). */
  canManage?: boolean;
  /** Whether the local user may lock/unlock this room (owner anywhere; the room's moderator for their own room). */
  canLock?: boolean;
  /** Whether this room is currently locked to new entrants. */
  locked?: boolean;
  onToggleLock?: (roomId: string, locked: boolean) => void;
}

/** Right-click context menu for a room row: Rename / Lock–Unlock / Remove, each shown only when authorized. */
export function RoomContextMenu({
  menu,
  onClose,
  onRequestRename,
  onRemoveRoom,
  canManage = false,
  canLock = false,
  locked = false,
  onToggleLock,
}: RoomContextMenuProps): React.JSX.Element {
  return (
    <div
      className="backdrop backdrop--dropdown"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="ctx-menu menu-surface"
        style={{ left: menu.x, top: menu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {canManage && (
          <button
            className="menu-item"
            onClick={() => {
              onRequestRename(menu.room);
              onClose();
            }}
          >
            <Pencil size={13} />
            Rename
          </button>
        )}
        {canLock && onToggleLock && (
          <button
            className="menu-item"
            onClick={() => {
              onToggleLock(menu.room.id, !locked);
              onClose();
            }}
          >
            {locked ? <LockOpen size={13} /> : <Lock size={13} />}
            {locked ? 'Unlock room' : 'Lock room'}
          </button>
        )}
        {canManage && (
          <button
            className="menu-item menu-item--danger"
            onClick={() => {
              onRemoveRoom(menu.room.id);
              onClose();
            }}
          >
            <Trash2 size={13} />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
