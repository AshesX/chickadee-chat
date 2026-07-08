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
