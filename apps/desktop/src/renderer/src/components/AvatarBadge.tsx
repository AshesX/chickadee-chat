import { sanitizeAvatarDataUrl } from '@chickadee/shared';
import { contrastInk } from '../lib/userColors';

/**
 * Avatar (image or initial fallback) with a presence dot in the corner — the
 * identical block previously inlined in `SidebarSelf` and `FriendRow`. Re-validates
 * the (possibly peer-supplied) avatar before rendering it as an `<img src>`.
 */
export function AvatarBadge({
  avatarUrl,
  name,
  initial,
  color,
  status,
  size,
}: {
  avatarUrl: string | null | undefined;
  name: string;
  initial: string;
  color: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  size?: 'sm' | 'lg';
}): React.JSX.Element {
  const safe = sanitizeAvatarDataUrl(avatarUrl);
  return (
    <div className="friend-row__avatar-wrap">
      <div className={`avatar${size ? ` avatar--${size}` : ''}`} style={safe ? undefined : { background: color, color: contrastInk(color) }}>
        {safe ? <img src={safe} alt={name} /> : initial}
      </div>
      <span className={`presence-dot presence-dot--${status}`} />
    </div>
  );
}
