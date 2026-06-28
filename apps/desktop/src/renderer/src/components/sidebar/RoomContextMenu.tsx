import { Pencil, Trash2 } from 'lucide-react';
import type { Room } from '@chickadee/shared';

interface RoomContextMenuProps {
  menu: { room: Room; x: number; y: number };
  onClose: () => void;
  onRequestRename: (room: Room) => void;
  onRemoveRoom: (id: string) => void;
}

/** Right-click context menu for a room row: Rename / Remove. */
export function RoomContextMenu({
  menu,
  onClose,
  onRequestRename,
  onRemoveRoom,
}: RoomContextMenuProps): React.JSX.Element {
  return (
    <div
      className="backdrop"
      style={{ zIndex: 'var(--z-dropdown)' }}
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
        <button
          className="ctx-menu__item"
          onClick={() => {
            onRequestRename(menu.room);
            onClose();
          }}
        >
          <Pencil size={13} />
          Rename
        </button>
        <button
          className="ctx-menu__item ctx-menu__item--danger"
          onClick={() => {
            onRemoveRoom(menu.room.id);
            onClose();
          }}
        >
          <Trash2 size={13} />
          Remove
        </button>
      </div>
    </div>
  );
}
