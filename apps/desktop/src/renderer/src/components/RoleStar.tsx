import { Crown } from 'lucide-react';
import { SELF_COLOR } from '../lib/userColors';

interface RoleStarProps {
  /** 'owner' = permanent Space Owner (gold), 'moderator' = temporary room mod (silver). */
  role: 'owner' | 'moderator';
}

/**
 * The authority badge shown beside a user's name: a gold crown for the Space
 * Owner, a silver one for the current room's temporary moderator. Gold reuses
 * the SELF_COLOR amber (no new hex); silver is a dimmed-ink class in styles.css.
 * Purely presentational — authority is enforced server-side.
 */
export function RoleStar({ role }: RoleStarProps): React.JSX.Element {
  const owner = role === 'owner';
  return (
    <span
      className={`role-star${owner ? '' : ' role-star--mod'}`}
      title={owner ? 'Space Owner' : 'Room Moderator'}
      aria-label={owner ? 'Space Owner' : 'Room Moderator'}
      style={owner ? { color: SELF_COLOR } : undefined}
    >
      <Crown size={11} strokeWidth={2.5} fill="currentColor" />
    </span>
  );
}
