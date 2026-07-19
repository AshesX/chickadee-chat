import { MAX_ID_LEN, clampString, sanitizeBannedUsers, type BannedUser } from '@chickadee/shared';
import {
  broadcastSpace,
  roomLocks,
  roomModeratorId,
  rooms,
  send,
  spaceBans,
  spaceConnections,
  spaceLocks,
  spaceOwners,
  spacePresence,
  spaceTimeouts,
  type Connection,
} from '../state';
import { canModerate, shouldAdoptSeed, type ModAction } from '../logic';
import { handleJoinRoom } from './room';

/**
 * Moderation handlers. Every entry point opens with the pure `canModerate`
 * authority matrix (extending the handleSetBanner precedent): silent no-op on
 * deny, consistent with the app's soft/no-auth trust model — a deterrent for a
 * friends app, not a security boundary. Room-scoped authority (moderator) is
 * derived on demand from the room Map's insertion order, never stored.
 */

/** The single live connection for `userId` in `spaceId` (ghost cleanup guarantees ≤1), or null. */
function findConnByUserId(spaceId: string, userId: string): Connection | null {
  const conns = spaceConnections.get(spaceId);
  if (!conns) return null;
  for (const conn of conns.values()) {
    if (conn.peer.userId === userId) return conn;
  }
  return null;
}

/** Build the `canModerate` context for `conn` acting on `targetUserId` (target may be offline). */
function authorityCtx(conn: Connection, targetUserId: string) {
  const target = targetUserId ? findConnByUserId(conn.space, targetUserId) : null;
  return {
    target,
    ctx: {
      isOwner: spaceOwners.get(conn.space) === conn.peer.userId,
      isModerator: conn.room != null && roomModeratorId(conn.room) === conn.peer.id,
      targetInActorRoom: target != null && target.room != null && target.room === conn.room,
      targetIsOwner: targetUserId !== '' && spaceOwners.get(conn.space) === targetUserId,
      targetIsSelf: targetUserId === conn.peer.userId,
    },
  };
}

function allowed(conn: Connection, action: ModAction, targetUserId: string): { target: Connection | null } | null {
  const { target, ctx } = authorityCtx(conn, targetUserId);
  return canModerate(action, ctx) ? { target } : null;
}

/** The bare room id of a composite `spaceId:room` key belonging to `spaceId`. */
function bareRoomId(spaceId: string, fullRoomId: string): string {
  return fullRoomId.slice(spaceId.length + 1);
}

/** The full current ban list of a space in wire shape. */
function banListOf(spaceId: string): BannedUser[] {
  const bans = spaceBans.get(spaceId);
  if (!bans) return [];
  return [...bans.entries()].map(([userId, displayName]) => ({ userId, displayName }));
}

/**
 * Drop `userId` from the space's presence roster (entry + pending offline
 * eviction timer) and tell everyone. Used on ban so the banned user neither
 * lingers in the USERS list nor stays on the locked-space presence allowlist.
 */
function evictPresence(spaceId: string, userId: string): void {
  const presenceMap = spacePresence.get(spaceId);
  if (presenceMap?.delete(userId)) {
    broadcastSpace(spaceId, { type: 'space-peer-remove', userId });
  }
  const timeouts = spaceTimeouts.get(spaceId);
  const timer = timeouts?.get(userId);
  if (timer) {
    clearTimeout(timer);
    timeouts!.delete(userId);
  }
}

/** Close a moderated user's socket. A normal close (no listener stripping, unlike
 *  ghost cleanup) so the 'close' event runs handleDisconnect's full cleanup. */
function closeModerated(target: Connection, reason: 'kicked' | 'banned'): void {
  send(target.socket, { type: 'kicked', scope: 'space', reason });
  target.socket.close(4000, reason);
}

export function handleKickUser(conn: Connection, targetUserId: unknown, scope: 'room' | 'space'): void {
  const userId = clampString(targetUserId, MAX_ID_LEN);
  if (!userId) return;
  const grant = allowed(conn, scope === 'room' ? 'kick-room' : 'kick-space', userId);
  if (!grant || !grant.target) return;
  const target = grant.target;

  if (scope === 'room') {
    if (!target.room) return;
    send(target.socket, { type: 'kicked', scope: 'room', room: bareRoomId(conn.space, target.room), reason: 'kicked' });
    // Existing lobby-return path: frees spotlight, broadcasts peer-left, sends
    // an empty-peers welcome, updates presence — and the leave runs the
    // moderator re-derivation like any other departure.
    handleJoinRoom(target, null);
    console.log(`[kick-room] ${conn.peer.displayName} kicked ${target.peer.displayName} from their room`);
  } else {
    closeModerated(target, 'kicked');
    console.log(`[kick-space] ${conn.peer.displayName} kicked ${target.peer.displayName} from space "${conn.space}"`);
  }
}

export function handleBanUser(conn: Connection, targetUserId: unknown): void {
  const userId = clampString(targetUserId, MAX_ID_LEN);
  if (!userId) return;
  const grant = allowed(conn, 'ban', userId);
  if (!grant) return;
  const spaceId = conn.space;

  // Capture the best display name we have before the target vanishes.
  const displayName =
    grant.target?.peer.displayName ?? spacePresence.get(spaceId)?.get(userId)?.peer.displayName ?? '';

  const bans = spaceBans.get(spaceId) ?? new Map<string, string>();
  bans.set(userId, displayName);
  spaceBans.set(spaceId, bans);

  // Evict presence BEFORE closing the socket so handleDisconnect (fired by the
  // close) finds no roster entry and doesn't re-broadcast them as "offline".
  evictPresence(spaceId, userId);
  if (grant.target) closeModerated(grant.target, 'banned');

  broadcastSpace(spaceId, { type: 'ban-state', spaceId, bannedUsers: banListOf(spaceId) });
  console.log(`[ban] ${conn.peer.displayName} banned userId ${userId} from space "${spaceId}"`);
}

export function handleUnbanUser(conn: Connection, targetUserId: unknown): void {
  const userId = clampString(targetUserId, MAX_ID_LEN);
  if (!userId) return;
  if (!allowed(conn, 'unban', userId)) return;
  const bans = spaceBans.get(conn.space);
  if (!bans?.delete(userId)) return;
  broadcastSpace(conn.space, { type: 'ban-state', spaceId: conn.space, bannedUsers: banListOf(conn.space) });
  console.log(`[unban] ${conn.peer.displayName} unbanned userId ${userId} in space "${conn.space}"`);
}

export function handleSetRoomLock(conn: Connection, room: unknown, locked: boolean): void {
  const bare = clampString(room, MAX_ID_LEN);
  if (!bare) return;
  const grant = allowed(conn, 'lock-room', '');
  if (!grant) return;
  const fullRoomId = `${conn.space}:${bare}`;
  const isOwner = spaceOwners.get(conn.space) === conn.peer.userId;
  // Operand rules beyond the authority matrix: a moderator may only lock their
  // own room; and only an ACTIVE room session can be locked — room locks are
  // ephemeral (cleared when the room empties), so locking an empty room would
  // create a lock nothing ever clears.
  if (!isOwner && fullRoomId !== conn.room) return;
  if (!rooms.has(fullRoomId)) return;

  const changed = locked ? !roomLocks.has(fullRoomId) : roomLocks.delete(fullRoomId);
  if (locked) roomLocks.add(fullRoomId);
  if (!changed) return;
  broadcastSpace(conn.space, { type: 'room-lock-state', spaceId: conn.space, room: bare, locked });
  console.log(`[room-lock] ${conn.peer.displayName} ${locked ? 'locked' : 'unlocked'} room "${fullRoomId}"`);
}

export function handleSetSpaceLock(conn: Connection, locked: boolean): void {
  if (!allowed(conn, 'lock-space', '')) return;
  if (spaceLocks.get(conn.space) === locked) return;
  spaceLocks.set(conn.space, locked);
  broadcastSpace(conn.space, { type: 'space-lock-state', spaceId: conn.space, locked });
  console.log(`[space-lock] ${conn.peer.displayName} ${locked ? 'locked' : 'unlocked'} space "${conn.space}"`);
}

export function handleTransferOwnership(conn: Connection, toUserId: unknown): void {
  const userId = clampString(toUserId, MAX_ID_LEN);
  if (!userId || userId === conn.peer.userId) return;
  if (!allowed(conn, 'transfer', '')) return;
  // Hand over only to someone currently connected — transferring to an absent
  // (or mistyped) userId would strand the Space with an unreachable owner.
  if (!findConnByUserId(conn.space, userId)) return;
  spaceOwners.set(conn.space, userId);
  broadcastSpace(conn.space, { type: 'owner-state', spaceId: conn.space, ownerId: userId });
  console.log(`[transfer-ownership] space "${conn.space}" owner -> userId ${userId}`);
}

/**
 * Post-restart restore: the confirmed owner re-seeds the ban list + space-lock
 * flag from its persisted copy. Apply-if-absent (see shouldAdoptSeed) makes
 * duplicate or late seeds harmless no-ops, so the client needs no careful
 * ordering against the ownership re-claim flow.
 */
export function handleSeedModeration(conn: Connection, bannedUsers: unknown, locked: unknown): void {
  const spaceId = conn.space;
  if (spaceOwners.get(spaceId) !== conn.peer.userId) return;
  const { adoptBans, adoptLock } = shouldAdoptSeed({
    hasBanRecord: spaceBans.has(spaceId),
    hasLockRecord: spaceLocks.has(spaceId),
  });
  if (adoptBans) {
    const seed = sanitizeBannedUsers(bannedUsers);
    spaceBans.set(spaceId, new Map(seed.map((b) => [b.userId, b.displayName])));
    if (seed.length > 0) {
      broadcastSpace(spaceId, { type: 'ban-state', spaceId, bannedUsers: seed });
    }
  }
  if (adoptLock) {
    const flag = locked === true;
    spaceLocks.set(spaceId, flag);
    if (flag) {
      broadcastSpace(spaceId, { type: 'space-lock-state', spaceId, locked: flag });
    }
  }
  if (adoptBans || adoptLock) {
    console.log(`[seed-moderation] space "${spaceId}" restored from owner's persisted copy`);
  }
}
