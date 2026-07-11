import { memo } from 'react';
import { FileUp } from 'lucide-react';
import { AvatarBadge } from '../AvatarBadge';
import type { SpaceUser } from '../../hooks/useSpacePresence';

interface FriendRowProps {
  user: SpaceUser;
  /** Start a P2P file transfer to this user (hover-revealed; hidden for offline users). */
  onSendFile?: (userId: string) => void;
}

/** A single entry in the sidebar USERS list: avatar + presence dot, name, and "in <room>". */
function FriendRowImpl({ user: u, onSendFile }: FriendRowProps): React.JSX.Element {
  return (
    <div className="friend-row">
      <AvatarBadge avatarUrl={u.avatarUrl} name={u.name} initial={u.initial} color={u.color} status={u.status} size="sm" />
      <div className="friend-row__meta">
        <div className={`friend-row__name${u.status === 'offline' ? ' friend-row__name--off' : ''}`}>
          {u.name}
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
    prev.onSendFile === next.onSendFile
  );
});
