import { useState } from 'react';
import { AlertTriangle, Ban, DoorOpen, UserX } from 'lucide-react';
import { useDismissTimeout } from '../hooks/useDismissTimeout';

export interface UserMenuTarget {
  userId: string;
  name: string;
  x: number;
  y: number;
}

interface UserContextMenuProps {
  menu: UserMenuTarget;
  /** Kick the target out of their current room (they stay in the Space). */
  showKickRoom: boolean;
  /** Owner only: disconnect the target from the Space (they can rejoin). */
  showKickSpace: boolean;
  /** Owner only: ban the target's userId from the Space (confirmed here). */
  showBan: boolean;
  onKickFromRoom: (userId: string) => void;
  onKickFromSpace: (userId: string) => void;
  onBan: (userId: string) => void;
  onClose: () => void;
}

/**
 * Right-click moderation menu for a user (sidebar USERS row or a participant
 * tile). The parent computes which actions the local user is authorized for
 * (mirroring the server's canModerate matrix) and renders this only when at
 * least one item applies — unauthorized users never see an empty shell.
 */
export function UserContextMenu({
  menu,
  showKickRoom,
  showKickSpace,
  showBan,
  onKickFromRoom,
  onKickFromSpace,
  onBan,
  onClose,
}: UserContextMenuProps): React.JSX.Element {
  const [banArmed, setBanArmed] = useState(false);
  const { arm: armBan, cancel: cancelArmBan } = useDismissTimeout(() => setBanArmed(false));

  // Arm-then-confirm (mirrors the sidebar's Delete/Leave Space button): a
  // first click grows this row into a labeled danger state INSTEAD of
  // closing the menu (unlike every other item here, which acts + closes
  // immediately) — a native window.confirm() would have blocked the app,
  // but a menu that vanished on the first click would give no chance to
  // confirm at all. A second click (or the timeout lapsing) resolves it;
  // clicking away closes the whole menu as normal, discarding the arm.
  function handleBanClick(): void {
    if (banArmed) {
      cancelArmBan();
      onBan(menu.userId);
      onClose();
    } else {
      setBanArmed(true);
      armBan(4000);
    }
  }

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
        {showKickRoom && (
          <button
            className="menu-item"
            onClick={() => {
              onKickFromRoom(menu.userId);
              onClose();
            }}
          >
            <DoorOpen size={13} />
            Kick from room
          </button>
        )}
        {showKickSpace && (
          <button
            className="menu-item menu-item--danger"
            onClick={() => {
              onKickFromSpace(menu.userId);
              onClose();
            }}
          >
            <UserX size={13} />
            Kick from Space
          </button>
        )}
        {showBan && (
          <button
            className={`menu-item menu-item--danger${banArmed ? ' menu-item--armed-danger' : ''}`}
            title={banArmed ? undefined : "They won't be able to rejoin until unbanned (Space Settings)."}
            onClick={handleBanClick}
          >
            {banArmed ? (
              <>
                <AlertTriangle size={13} />
                Confirm ban?
              </>
            ) : (
              <>
                <Ban size={13} />
                Ban from Space
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
