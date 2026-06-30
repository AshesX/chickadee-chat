import { memo } from 'react';
import { AvatarBadge } from '../AvatarBadge';
import type { SpaceUser } from '../../hooks/useSpacePresence';

/** A single entry in the sidebar USERS list: avatar + presence dot, name, and "in <room>". */
function FriendRowImpl({ user: u }: { user: SpaceUser }): React.JSX.Element {
  return (
    <div className="friend-row">
      <AvatarBadge avatarUrl={u.avatarUrl} name={u.name} initial={u.initial} color={u.color} status={u.status} />
      <div className="friend-row__meta">
        <div className={`friend-row__name${u.status === 'offline' ? ' friend-row__name--off' : ''}`}>
          {u.name}
        </div>
        <div className="friend-row__where">{u.where}</div>
      </div>
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
    a.avatarUrl === b.avatarUrl
  );
});
