import { describe, expect, it } from 'vitest';
import {
  bumpRateWindow,
  canModerate,
  evaluateJoinGate,
  evaluateRoomEntry,
  evaluateSpotlightClaim,
  resolveRoomCap,
  sanitizeJoinRequest,
  shouldAdoptSeed,
  type ModAction,
} from './logic';

describe('evaluateSpotlightClaim', () => {
  it('grants a free slot', () => {
    expect(evaluateSpotlightClaim(undefined, 'a', false)).toEqual({ grant: true });
  });

  it('grants a re-claim by the current holder (kind switch)', () => {
    expect(evaluateSpotlightClaim({ holderId: 'a', kind: 'screen' }, 'a', false)).toEqual({ grant: true });
  });

  it('blocks a non-force claim against another holder, reporting them', () => {
    expect(evaluateSpotlightClaim({ holderId: 'a', kind: 'camera' }, 'b', false)).toEqual({
      grant: false,
      busyHolderId: 'a',
    });
  });

  it('grants a force claim (take-over) against another holder', () => {
    expect(evaluateSpotlightClaim({ holderId: 'a', kind: 'screen' }, 'b', true)).toEqual({ grant: true });
  });
});

describe('bumpRateWindow', () => {
  it('starts a fresh window and counts the message', () => {
    const { window, limited } = bumpRateWindow(undefined, 1_000, 3, 1_000);
    expect(window).toEqual({ count: 1, resetAt: 2_000 });
    expect(limited).toBe(false);
  });

  it('flags the message that exceeds the limit inside one window', () => {
    let w = bumpRateWindow(undefined, 0, 2, 1_000);
    w = bumpRateWindow(w.window, 10, 2, 1_000);
    expect(w.limited).toBe(false);
    w = bumpRateWindow(w.window, 20, 2, 1_000);
    expect(w.limited).toBe(true);
  });

  it('resets the count once the window lapses', () => {
    let w = bumpRateWindow(undefined, 0, 1, 1_000);
    w = bumpRateWindow(w.window, 500, 1, 1_000);
    expect(w.limited).toBe(true);
    w = bumpRateWindow(w.window, 1_500, 1, 1_000);
    expect(w.limited).toBe(false);
    expect(w.window.resetAt).toBe(2_500);
  });
});

describe('sanitizeJoinRequest', () => {
  it('rejects a join without a usable spaceId', () => {
    expect(sanitizeJoinRequest({ spaceId: '', userId: 'u' })).toBeNull();
  });

  it('clamps oversized ids and passes rooms through', () => {
    const rooms = [{ id: 'lounge', label: 'Lounge', icon: 'sofa', type: 'hybrid' as const }];
    const s = sanitizeJoinRequest({ spaceId: 'x'.repeat(500), userId: 'u', room: 'lounge', rooms });
    expect(s).not.toBeNull();
    expect(s!.spaceId.length).toBeLessThanOrEqual(128);
    expect(s!.room).toBe('lounge');
    expect(s!.joinRooms).toEqual(rooms);
  });

  it('treats a missing/empty room as no-room and a missing rooms list as empty', () => {
    const s = sanitizeJoinRequest({ spaceId: 's', userId: 'u' });
    expect(s).toEqual({ spaceId: 's', userId: 'u', room: null, joinRooms: [] });
    expect(sanitizeJoinRequest({ spaceId: 's', userId: 'u', room: '' })!.room).toBeNull();
  });
});

describe('evaluateJoinGate', () => {
  const base = { isBanned: false, spaceLocked: false, isOwner: false, knownToPresence: false };

  it('admits by default', () => {
    expect(evaluateJoinGate(base)).toBe('ok');
  });

  it('rejects banned users, and ban beats lock', () => {
    expect(evaluateJoinGate({ ...base, isBanned: true })).toBe('banned');
    expect(evaluateJoinGate({ ...base, isBanned: true, spaceLocked: true })).toBe('banned');
    // A banned owner/roster member is still banned (unban is the recovery path).
    expect(evaluateJoinGate({ ...base, isBanned: true, isOwner: true, knownToPresence: true })).toBe('banned');
  });

  it('locked space blocks newcomers only', () => {
    expect(evaluateJoinGate({ ...base, spaceLocked: true })).toBe('space-locked');
    expect(evaluateJoinGate({ ...base, spaceLocked: true, isOwner: true })).toBe('ok');
    expect(evaluateJoinGate({ ...base, spaceLocked: true, knownToPresence: true })).toBe('ok');
  });
});

describe('evaluateRoomEntry', () => {
  const base = { locked: false, isOwner: false, memberCount: 0, cap: 8 };

  it('admits into an open, non-full room', () => {
    expect(evaluateRoomEntry(base)).toBe('ok');
    expect(evaluateRoomEntry({ ...base, memberCount: 7 })).toBe('ok');
  });

  it('locked room blocks non-owners; lock beats full', () => {
    expect(evaluateRoomEntry({ ...base, locked: true })).toBe('room-locked');
    expect(evaluateRoomEntry({ ...base, locked: true, memberCount: 8 })).toBe('room-locked');
  });

  it('owner bypasses the lock but never the capacity cap', () => {
    expect(evaluateRoomEntry({ ...base, locked: true, isOwner: true })).toBe('ok');
    expect(evaluateRoomEntry({ ...base, locked: true, isOwner: true, memberCount: 8 })).toBe('full');
    expect(evaluateRoomEntry({ ...base, isOwner: true, memberCount: 8 })).toBe('full');
  });
});

describe('canModerate', () => {
  const ALL_ACTIONS: ModAction[] = ['kick-room', 'kick-space', 'ban', 'unban', 'lock-room', 'lock-space', 'transfer'];
  const nobody = { isOwner: false, isModerator: false, targetInActorRoom: true, targetIsOwner: false, targetIsSelf: false };
  const owner = { ...nobody, isOwner: true };
  const mod = { ...nobody, isModerator: true };

  it('denies every action to a plain member', () => {
    for (const action of ALL_ACTIONS) {
      expect(canModerate(action, nobody)).toBe(false);
    }
  });

  it('grants the owner everything (targets included), except acting on self', () => {
    for (const action of ALL_ACTIONS) {
      expect(canModerate(action, owner)).toBe(true);
    }
    expect(canModerate('kick-room', { ...owner, targetIsSelf: true })).toBe(false);
    expect(canModerate('kick-space', { ...owner, targetIsSelf: true })).toBe(false);
    expect(canModerate('ban', { ...owner, targetIsSelf: true })).toBe(false);
  });

  it('lets the owner act across rooms', () => {
    expect(canModerate('kick-room', { ...owner, targetInActorRoom: false })).toBe(true);
    expect(canModerate('kick-space', { ...owner, targetInActorRoom: false })).toBe(true);
    expect(canModerate('ban', { ...owner, targetInActorRoom: false })).toBe(true);
  });

  it('limits a moderator to kick-room + lock-room', () => {
    expect(canModerate('kick-room', mod)).toBe(true);
    expect(canModerate('lock-room', mod)).toBe(true);
    expect(canModerate('kick-space', mod)).toBe(false);
    expect(canModerate('ban', mod)).toBe(false);
    expect(canModerate('unban', mod)).toBe(false);
    expect(canModerate('lock-space', mod)).toBe(false);
    expect(canModerate('transfer', mod)).toBe(false);
  });

  it('confines a moderator kick to their own room and shields the owner', () => {
    expect(canModerate('kick-room', { ...mod, targetInActorRoom: false })).toBe(false);
    expect(canModerate('kick-room', { ...mod, targetIsOwner: true })).toBe(false);
    expect(canModerate('kick-room', { ...mod, targetIsSelf: true })).toBe(false);
  });

  it('an owner who is also the derived moderator keeps full owner power', () => {
    const both = { ...owner, isModerator: true };
    expect(canModerate('ban', both)).toBe(true);
    expect(canModerate('kick-room', { ...both, targetInActorRoom: false })).toBe(true);
  });
});

describe('shouldAdoptSeed', () => {
  it('adopts only the parts the server has no record of', () => {
    expect(shouldAdoptSeed({ hasBanRecord: false, hasLockRecord: false })).toEqual({ adoptBans: true, adoptLock: true });
    expect(shouldAdoptSeed({ hasBanRecord: true, hasLockRecord: false })).toEqual({ adoptBans: false, adoptLock: true });
    expect(shouldAdoptSeed({ hasBanRecord: false, hasLockRecord: true })).toEqual({ adoptBans: true, adoptLock: false });
    expect(shouldAdoptSeed({ hasBanRecord: true, hasLockRecord: true })).toEqual({ adoptBans: false, adoptLock: false });
  });
});

describe('resolveRoomCap', () => {
  it('returns the unified 8-cap regardless of legacy room type', () => {
    const rooms = [
      { id: 'a', label: 'A', icon: 'i', type: 'voice' as const },
      { id: 'b', label: 'B', icon: 'i', type: 'video' as const },
    ];
    expect(resolveRoomCap(rooms, 'a')).toBe(8);
    expect(resolveRoomCap(rooms, 'b')).toBe(8);
    expect(resolveRoomCap(rooms, 'missing')).toBe(8);
    expect(resolveRoomCap([], null)).toBe(8);
  });
});
