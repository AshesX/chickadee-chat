import { MAX_DISPLAY_NAME_LEN, MAX_ID_LEN, clampString, sanitizeBannerDataUrl, type Room } from '@chickadee/shared';
import { broadcastSpace, send, spaceBanners, spaceConnections, spaceOwners, spaces, type Connection } from '../state';

export function handleUpdateRooms(spaceId: string, roomsList: Room[]): void {
  if (!Array.isArray(roomsList)) return;
  spaces.set(spaceId, roomsList);
  // Broadcast to space members directly (spaceConnections already indexes them,
  // avoiding an O(all peers) sweep of every room map).
  const conns = spaceConnections.get(spaceId);
  if (conns) {
    for (const conn of conns.values()) {
      send(conn.socket, { type: 'rooms-updated', spaceId, rooms: roomsList });
    }
  }
  console.log(`[rooms-update] space "${spaceId}" rooms updated; broadcasted to members`);
}

export function handleRenameSpace(conn: Connection, newSpaceId: string, newSpaceName: string): void {
  const spaceId = conn.space;
  const clampedId = clampString(newSpaceId, MAX_ID_LEN);
  const clampedName = clampString(newSpaceName, MAX_DISPLAY_NAME_LEN);

  if (!clampedId || !clampedName) return;

  // Broadcast the space-renamed message to everyone in the current space except the sender
  broadcastSpace(spaceId, { type: 'space-renamed', spaceId, newSpaceId: clampedId, newSpaceName: clampedName }, conn);

  console.log(`[space-rename] space "${spaceId}" renamed to "${clampedName}" with new ID "${clampedId}"`);
}

/**
 * First-claim-wins ownership for this connection's Space. No force/take-over —
 * unlike the stage spotlight, ownership isn't meant to be disputed once set (no
 * transfer feature exists yet). Always broadcasts the resulting authoritative
 * ownerId to the whole Space (including the claimant), so a losing claim (a
 * benign two-client race) still resolves everyone's UI to the truth.
 */
export function handleClaimOwnership(conn: Connection): void {
  const spaceId = conn.space;
  if (!spaceOwners.has(spaceId)) {
    spaceOwners.set(spaceId, conn.peer.userId);
  }
  broadcastSpace(spaceId, { type: 'owner-state', spaceId, ownerId: spaceOwners.get(spaceId)! });
}

/**
 * Set/clear this connection's Space banner. Owner-gated — the first
 * server-side authorization check in this codebase; kept as simple as the rest
 * of the app's soft/no-auth trust model (silent no-op on rejection, not a
 * security boundary). Sanitizes before storing/broadcasting, exactly like
 * handleAvatarState — this is the primary amplification-DoS guard since the
 * banner fans out space-wide.
 */
export function handleSetBanner(conn: Connection, bannerDataUrl: unknown): void {
  const spaceId = conn.space;
  if (spaceOwners.get(spaceId) !== conn.peer.userId) return;
  const safe = sanitizeBannerDataUrl(bannerDataUrl);
  spaceBanners.set(spaceId, { dataUrl: safe, setBy: conn.peer.userId });
  broadcastSpace(spaceId, { type: 'banner-state', spaceId, bannerDataUrl: safe, updatedBy: conn.peer.userId });
}
