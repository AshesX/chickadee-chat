import { MAX_ID_LEN, capacityForType, clampString, type PeerId, type Room } from '@chickadee/shared';

// Pure decision logic, kept free of sockets and the in-memory maps so it can be
// unit tested (the handlers own the side effects).

export interface SpotlightSlot {
  holderId: PeerId;
  kind: 'screen' | 'camera';
}

export type SpotlightDecision = { grant: true } | { grant: false; busyHolderId: PeerId };

/**
 * Stage-slot arbitration: grant if the slot is free, already held by the
 * claimant, or `force` (take-over); otherwise report who holds it.
 */
export function evaluateSpotlightClaim(
  current: SpotlightSlot | undefined,
  claimantId: PeerId,
  force: boolean,
): SpotlightDecision {
  if (current && current.holderId !== claimantId && !force) {
    return { grant: false, busyHolderId: current.holderId };
  }
  return { grant: true };
}

export interface RateWindow {
  count: number;
  resetAt: number;
}

/** Sliding-window rate limiter step: counts one message, resetting the window when it lapses. */
export function bumpRateWindow(
  r: RateWindow | undefined,
  now: number,
  limit: number,
  windowMs: number,
): { window: RateWindow; limited: boolean } {
  const window = !r || now > r.resetAt ? { count: 0, resetAt: now + windowMs } : r;
  window.count += 1;
  return { window, limited: window.count > limit };
}

export interface SanitizedJoin {
  spaceId: string;
  userId: string;
  room: string | null;
  joinRooms: Room[];
}

/**
 * Validate/clamp the identifying fields of a `join`. spaceId is used as an
 * in-memory map key, so a join without a sane one is rejected outright (null).
 */
export function sanitizeJoinRequest(msg: {
  spaceId: string;
  userId: string;
  room?: string | null;
  rooms?: Room[];
}): SanitizedJoin | null {
  const spaceId = clampString(msg.spaceId, MAX_ID_LEN);
  if (!spaceId) return null;
  const userId = clampString(msg.userId, MAX_ID_LEN);
  const room = msg.room == null ? null : clampString(msg.room, MAX_ID_LEN) || null;
  const joinRooms = Array.isArray(msg.rooms) ? msg.rooms : [];
  return { spaceId, userId, room, joinRooms };
}

/** The capacity of `roomId` per the space's known room list (8 for every hybrid room). */
export function resolveRoomCap(knownRooms: readonly Room[], roomId: string | null): number {
  return capacityForType(knownRooms.find((r) => r.id === roomId)?.type);
}

// --- Moderation decisions -------------------------------------------------

export type JoinGateDecision = 'ok' | 'banned' | 'space-locked';

/**
 * Space-level admission gate for a `join`. Ban beats lock (a banned user gets
 * the honest reason even when the space is also locked). A locked space still
 * admits the owner and anyone the presence roster knows (current members and
 * <10-min-offline reconnects) — Lock Space blocks newcomers, not blips.
 */
export function evaluateJoinGate(p: {
  isBanned: boolean;
  spaceLocked: boolean;
  isOwner: boolean;
  knownToPresence: boolean;
}): JoinGateDecision {
  if (p.isBanned) return 'banned';
  if (p.spaceLocked && !p.isOwner && !p.knownToPresence) return 'space-locked';
  return 'ok';
}

export type RoomEntryDecision = 'ok' | 'room-locked' | 'full';

/**
 * Room-level admission gate. Lock beats full (the lock is the intended
 * signal); the owner bypasses the lock but never the capacity cap — the 8-cap
 * is a mesh-safety bound, not a policy.
 */
export function evaluateRoomEntry(p: {
  locked: boolean;
  isOwner: boolean;
  memberCount: number;
  cap: number;
}): RoomEntryDecision {
  if (p.locked && !p.isOwner) return 'room-locked';
  if (p.memberCount >= p.cap) return 'full';
  return 'ok';
}

export type ModAction = 'kick-room' | 'kick-space' | 'ban' | 'unban' | 'lock-room' | 'lock-space' | 'transfer';

/** Actions that only ever make sense for the Space owner. */
const OWNER_ONLY_ACTIONS: ReadonlySet<ModAction> = new Set(['kick-space', 'ban', 'unban', 'lock-space', 'transfer']);
/** Actions aimed at a specific user (vs. a room/space toggle). */
const TARGETED_ACTIONS: ReadonlySet<ModAction> = new Set(['kick-room', 'kick-space', 'ban']);

/**
 * The single authority matrix for every moderation message (the server-side
 * gate every handler opens with — extends the handleSetBanner precedent).
 * Owner: everything, but never against themselves. Moderator: kick-room +
 * lock-room only, confined to their own room, never against the owner or
 * themselves. `unban`/`transfer`/locks are untargeted (no in-room/self rules
 * beyond owner-only); handlers enforce operand validity separately.
 */
export function canModerate(
  action: ModAction,
  ctx: {
    isOwner: boolean;
    isModerator: boolean;
    targetInActorRoom: boolean;
    targetIsOwner: boolean;
    targetIsSelf: boolean;
  },
): boolean {
  if (!ctx.isOwner && !ctx.isModerator) return false;
  if (OWNER_ONLY_ACTIONS.has(action) && !ctx.isOwner) return false;
  if (TARGETED_ACTIONS.has(action)) {
    if (ctx.targetIsSelf) return false;
    if (!ctx.isOwner) {
      // Moderator-grade action: room-confined, and the owner is untouchable.
      if (!ctx.targetInActorRoom || ctx.targetIsOwner) return false;
    }
  }
  return true;
}

/**
 * Whether to adopt each part of an owner's `seed-moderation`. Apply-if-absent:
 * owners/bans/locks are all sticky and only vanish together on a full server
 * restart, so "no record" precisely identifies the restart case and late or
 * duplicate seeds become no-ops.
 */
export function shouldAdoptSeed(p: { hasBanRecord: boolean; hasLockRecord: boolean }): {
  adoptBans: boolean;
  adoptLock: boolean;
} {
  return { adoptBans: !p.hasBanRecord, adoptLock: !p.hasLockRecord };
}
