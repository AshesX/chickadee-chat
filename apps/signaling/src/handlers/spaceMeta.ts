import { MAX_DISPLAY_NAME_LEN, clampString, sanitizeBannerDataUrl } from '@chickadee/shared';
import { broadcastSpace, send, spaceBanners, spaceOwners, spaces, type Connection } from '../state';
import { evaluateRoomsUpdate } from '../logic';

/**
 * Whole-list room update, validated against the room-governance rules (see
 * evaluateRoomsUpdate): the owner manages every room; a standard member may
 * hold one self-created room (stamped `createdBy` server-side) and can only
 * rename/remove that one. Always keyed on the CONNECTION's space — the wire
 * `spaceId` is ignored, so a client can never rewrite another space's rooms.
 * On deny, the sender alone is resynced with the authoritative list so their
 * optimistic local update reverts (everyone else never sees the attempt).
 */
export function handleUpdateRooms(conn: Connection, roomsList: unknown): void {
  const spaceId = conn.space;
  const current = spaces.get(spaceId) ?? [];
  const isOwner = spaceOwners.get(spaceId) === conn.peer.userId;
  const decision = evaluateRoomsUpdate(current, roomsList, isOwner, conn.peer.userId);
  if (!decision.ok) {
    send(conn.socket, { type: 'rooms-updated', spaceId, rooms: current });
    return;
  }
  spaces.set(spaceId, decision.rooms);
  broadcastSpace(spaceId, { type: 'rooms-updated', spaceId, rooms: decision.rooms });
  console.log(`[rooms-update] space "${spaceId}" rooms updated by ${conn.peer.displayName}; broadcasted to members`);
}

/**
 * Owner-gated (silent no-op like handleSetBanner): renaming propagates to every
 * member. Cosmetic only — the Space id (invite code) never changes, so a
 * rename can't strand offline members or previously-shared invite codes on a
 * stale, diverged copy of the Space. An unowned space stays un-renamable
 * until someone claims ownership.
 */
export function handleRenameSpace(conn: Connection, newSpaceName: string): void {
  const spaceId = conn.space;
  if (spaceOwners.get(spaceId) !== conn.peer.userId) return;
  const clampedName = clampString(newSpaceName, MAX_DISPLAY_NAME_LEN);

  if (!clampedName) return;

  // Broadcast the space-renamed message to everyone in the current space except the sender
  broadcastSpace(spaceId, { type: 'space-renamed', spaceId, newSpaceName: clampedName }, conn);

  console.log(`[space-rename] space "${spaceId}" renamed to "${clampedName}"`);
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
