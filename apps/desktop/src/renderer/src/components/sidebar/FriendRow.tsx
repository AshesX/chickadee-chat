import { memo, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { AvatarBadge } from '../AvatarBadge';
import { RoleStar } from '../RoleStar';
import type { SpaceUser } from '../../hooks/useSpacePresence';

interface FriendRowProps {
  user: SpaceUser;
  /** 'owner' (gold star) / 'moderator' (silver star, current room only) / null. Precomputed
   *  by the parent so the memo comparator stays a primitive compare. */
  role?: 'owner' | 'moderator' | null;
  /** Start a P2P file transfer to this user (hover-revealed; hidden for offline users). */
  onSendFile?: (userId: string) => void;
  /** OS files dropped onto this row (multiple files = one batch). Online users only. */
  onDropFiles?: (userId: string, files: File[]) => void;
  /** Open the moderation context menu for this user (right-click). */
  onContextMenu?: (userId: string, name: string, x: number, y: number) => void;
}

/** A single entry in the sidebar USERS list: avatar + presence dot, name, and "in <room>". */
function FriendRowImpl({ user: u, role, onSendFile, onDropFiles, onContextMenu }: FriendRowProps): React.JSX.Element {
  const [dragOver, setDragOver] = useState(false);
  // dragenter/dragleave fire per child element; a depth counter turns them
  // into one enter/leave pair for the whole row.
  const dragDepthRef = useRef(0);

  const droppable = Boolean(onDropFiles) && u.status !== 'offline';
  const hasFiles = (e: React.DragEvent): boolean => e.dataTransfer.types.includes('Files');

  return (
    <div
      className={`friend-row${dragOver ? ' friend-row--drop' : ''}`}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              onContextMenu(u.id, u.name, e.clientX, e.clientY);
            }
          : undefined
      }
      onDragEnter={
        droppable
          ? (e) => {
              if (!hasFiles(e)) return;
              e.preventDefault();
              dragDepthRef.current += 1;
              setDragOver(true);
            }
          : undefined
      }
      onDragOver={
        droppable
          ? (e) => {
              if (!hasFiles(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          : undefined
      }
      onDragLeave={
        droppable
          ? () => {
              dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
              if (dragDepthRef.current === 0) setDragOver(false);
            }
          : undefined
      }
      onDrop={
        droppable
          ? (e) => {
              e.preventDefault();
              dragDepthRef.current = 0;
              setDragOver(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length > 0) onDropFiles?.(u.id, files);
            }
          : undefined
      }
    >
      <AvatarBadge avatarUrl={u.avatarUrl} name={u.name} initial={u.initial} color={u.color} status={u.status} size="sm" />
      <div className="friend-row__meta">
        <div className={`friend-row__name${u.status === 'offline' ? ' friend-row__name--off' : ''}`}>
          {u.name}
          {role && <RoleStar role={role} />}
          {u.where ? <span className="friend-row__where">{u.where}</span> : null}
        </div>
      </div>
      {onSendFile && u.status !== 'offline' && (
        <button
          className="icon-btn icon-btn--sm friend-row__send"
          title={`Send a file to ${u.name}`}
          aria-label={`Send a file to ${u.name}`}
          onClick={() => onSendFile(u.id)}
        >
          <FileUp size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * Memoized so the high-frequency App re-renders (speaking edges, volume drags, chat) don't
 * re-render every USERS-list row. `useSpacePresence` rebuilds fresh `SpaceUser` objects each
 * render, so a default shallow `memo` would never skip — compare the rendered fields by value.
 */
export const FriendRow = memo(FriendRowImpl, (prev, next) => {
  const a = prev.user;
  const b = next.user;
  return (
    a.name === b.name &&
    a.initial === b.initial &&
    a.color === b.color &&
    a.status === b.status &&
    a.where === b.where &&
    a.avatarUrl === b.avatarUrl &&
    prev.role === next.role &&
    prev.onSendFile === next.onSendFile &&
    prev.onDropFiles === next.onDropFiles &&
    prev.onContextMenu === next.onContextMenu
  );
});
