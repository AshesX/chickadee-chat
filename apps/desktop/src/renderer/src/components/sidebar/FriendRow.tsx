import { sanitizeAvatarDataUrl } from '@chickadee/shared';
import type { SpaceUser } from '../../hooks/useSpacePresence';

/** A single entry in the sidebar USERS list: avatar + presence dot, name, and "in <room>". */
export function FriendRow({ user: u }: { user: SpaceUser }): React.JSX.Element {
  // Validate peer-supplied avatar before rendering (defense in depth).
  const uAvatar = sanitizeAvatarDataUrl(u.avatarUrl);
  return (
    <div className="friend-row">
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
}
