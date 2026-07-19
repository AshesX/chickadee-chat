import {
  MAX_DISPLAY_NAME_LEN,
  MAX_ID_LEN,
  capacityForType,
  clampString,
  normalizeRoomType,
  type PeerId,
  type Room,
} from '@chickadee/shared';

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
  // The joiner's local room list may seed the space (incl. `createdBy` stamps,
  // which is how governance survives a server restart) — sanitize it like any
  // other client field.
  const joinRooms = sanitizeRoomList(msg.rooms);
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

// --- Room-list governance -------------------------------------------------

/** Cap on a space's room list — an anti-nonsense bound for an 8-person hangout app. */
export const MAX_ROOMS = 64;

/**
 * Validate/clamp an untrusted room list (`update-rooms` payload and the `join`
 * room-list seed): array guard, per-entry id/label/icon clamps, legacy-type
 * normalization, de-dupe by id, list cap. `createdBy` is clamped but otherwise
 * passed through — `evaluateRoomsUpdate` decides whether to trust it.
 */
export function sanitizeRoomList(value: unknown): Room[] {
  if (!Array.isArray(value)) return [];
  const out: Room[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (out.length >= MAX_ROOMS) break;
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Partial<Room>;
    const id = clampString(e.id, MAX_ID_LEN);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const createdBy = clampString(e.createdBy, MAX_ID_LEN);
    out.push({
      id,
      label: clampString(e.label, MAX_DISPLAY_NAME_LEN) || id,
      icon: clampString(e.icon, MAX_ID_LEN),
      type: normalizeRoomType(e.type),
      ...(createdBy ? { createdBy } : {}),
    });
  }
  return out;
}

export type RoomsUpdateDecision = { ok: true; rooms: Room[] } | { ok: false };

/**
 * Authorize a whole-list `update-rooms` against the room-governance rules by
 * diffing proposed vs current on the stable room id:
 * - Surviving rooms keep their CURRENT `createdBy` (a sender can never
 *   re-stamp someone else's — or a legacy — room); added rooms are stamped
 *   with the sender's userId.
 * - Owner: everything goes. Non-owner: may rename/remove only rooms they
 *   created (`createdBy === userId`; legacy unstamped rooms are owner-managed),
 *   and after the update may hold at most ONE created room — which permits a
 *   delete-then-recreate in a single update but blocks a second room.
 * Deny returns `{ok:false}`; the caller resyncs the sender with the current
 * authoritative list (their optimistic local update reverts).
 */
export function evaluateRoomsUpdate(
  current: readonly Room[],
  proposedRaw: unknown,
  isOwner: boolean,
  userId: string,
): RoomsUpdateDecision {
  const proposed = sanitizeRoomList(proposedRaw);
  const currentById = new Map(current.map((r) => [r.id, r]));

  const rooms: Room[] = proposed.map((p) => {
    const existing = currentById.get(p.id);
    const createdBy = existing ? existing.createdBy : userId || undefined;
    const { createdBy: _claimed, ...rest } = p;
    return createdBy ? { ...rest, createdBy } : rest;
  });

  if (!isOwner) {
    const ownsRoom = (r: Room | undefined): boolean => !!userId && r?.createdBy === userId;
    for (const cur of current) {
      const next = rooms.find((r) => r.id === cur.id);
      if (!next) {
        if (!ownsRoom(cur)) return { ok: false };
      } else if (next.label !== cur.label || next.icon !== cur.icon) {
        if (!ownsRoom(cur)) return { ok: false };
      }
    }
    if (rooms.some((r) => !currentById.has(r.id))) {
      if (!userId) return { ok: false };
      if (rooms.filter((r) => r.createdBy === userId).length > 1) return { ok: false };
    }
  }
  return { ok: true, rooms };
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
