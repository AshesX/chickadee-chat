import { Settings, Copy, Trash2, Lock, LockOpen } from 'lucide-react';
import type { SpaceInfo } from '@chickadee/shared';

interface SpaceContextMenuProps {
  menu: { space: SpaceInfo; x: number; y: number };
  onClose: () => void;
  onSpaceSettings: (id: string) => void;
  onCopyCode: (id: string) => void;
  onDeleteSpace: (id: string, name: string) => void;
  /** Owner-only Lock Space shortcut (shown when the local user owns this space and it's the active connection). */
  canLockSpace?: boolean;
  spaceLocked?: boolean;
  onToggleSpaceLock?: (locked: boolean) => void;
}

/** Right-click context menu for the space header: Space Settings / Copy Space Code / Lock (owner) / Delete. */
export function SpaceContextMenu({
  menu,
  onClose,
  onSpaceSettings,
  onCopyCode,
  onDeleteSpace,
  canLockSpace = false,
  spaceLocked = false,
  onToggleSpaceLock,
}: SpaceContextMenuProps): React.JSX.Element {
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
        <button
          className="menu-item"
          onClick={() => {
            onSpaceSettings(menu.space.id);
            onClose();
          }}
        >
          <Settings size={13} />
          Space Settings
        </button>
        <button
          className="menu-item"
          onClick={() => {
            onCopyCode(menu.space.id);
            onClose();
          }}
        >
          <Copy size={13} />
          Copy Space Code
        </button>
        {canLockSpace && onToggleSpaceLock && (
          <button
            className="menu-item"
            onClick={() => {
              onToggleSpaceLock(!spaceLocked);
              onClose();
            }}
          >
            {spaceLocked ? <LockOpen size={13} /> : <Lock size={13} />}
            {spaceLocked ? 'Unlock Space' : 'Lock Space'}
          </button>
        )}
        <button
          className="menu-item menu-item--danger"
          onClick={() => {
            onDeleteSpace(menu.space.id, menu.space.name);
            onClose();
          }}
        >
          <Trash2 size={13} />
          Delete Space
        </button>
      </div>
    </div>
  );
}
