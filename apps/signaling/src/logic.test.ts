import { describe, expect, it } from 'vitest';
import {
  MAX_ROOMS,
  bumpRateWindow,
  canModerate,
  evaluateJoinGate,
  evaluateRoomEntry,
  evaluateRoomsUpdate,
  evaluateSpotlightClaim,
  resolveRoomCap,
  sanitizeJoinRequest,
  sanitizeRoomList,
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

describe('sanitizeRoomList', () => {
  it('passes a normal list through, normalizing legacy types', () => {
    expect(sanitizeRoomList([{ id: 'lounge', label: 'Lounge', icon: 'sofa', type: 'voice' }])).toEqual([
      { id: 'lounge', label: 'Lounge', icon: 'sofa', type: 'hybrid' },
    ]);
  });

  it('returns [] for non-arrays and drops malformed entries', () => {
    expect(sanitizeRoomList(undefined)).toEqual([]);
    expect(sanitizeRoomList('rooms')).toEqual([]);
    expect(sanitizeRoomList([null, 42, {}, { id: '' }])).toEqual([]);
  });

  it('falls back label to id, clamps fields, de-dupes by id, keeps createdBy', () => {
    const [a, b] = sanitizeRoomList([
      { id: 'a', label: '', icon: 7, createdBy: 'uid-1' },
      { id: 'x'.repeat(500), label: 'y'.repeat(500), icon: 'sofa' },
      { id: 'a', label: 'dup' },
    ]);
    expect(a).toEqual({ id: 'a', label: 'a', icon: '', type: 'hybrid', createdBy: 'uid-1' });
    expect(b!.id).toHaveLength(128);
    expect(b!.label).toHaveLength(32);
    expect(sanitizeRoomList([{ id: 'a' }, { id: 'a' }])).toHaveLength(1);
  });

  it('caps the list at MAX_ROOMS', () => {
    const flood = Array.from({ length: MAX_ROOMS + 10 }, (_, i) => ({ id: `r${i}`, label: 'R', icon: 'i' }));
    expect(sanitizeRoomList(flood)).toHaveLength(MAX_ROOMS);
  });
});

describe('evaluateRoomsUpdate', () => {
  const legacy = { id: 'general', label: 'General', icon: 'chat', type: 'hybrid' as const };
  const mine = { id: 'my-room', label: 'My Room', icon: 'sofa', type: 'hybrid' as const, createdBy: 'me' };
  const theirs = { id: 'their-room', label: 'Their Room', icon: 'dice', type: 'hybrid' as const, createdBy: 'them' };

  it('owner may add/rename/remove anything', () => {
    const d = evaluateRoomsUpdate([legacy, theirs], [{ ...legacy, label: 'Renamed' }, { id: 'new', label: 'New', icon: 'i' }], true, 'owner');
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.rooms.map((r) => r.id)).toEqual(['general', 'new']);
      expect(d.rooms[1]!.createdBy).toBe('owner');
    }
  });

  it('non-owner may add one room, stamped with THEIR id (anti-tamper)', () => {
    const d = evaluateRoomsUpdate([legacy], [legacy, { id: 'new', label: 'New', icon: 'i', createdBy: 'spoofed' }], false, 'me');
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.rooms.find((r) => r.id === 'new')!.createdBy).toBe('me');
  });

  it('non-owner may not hold a second created room, but delete-then-create in one update is fine', () => {
    expect(evaluateRoomsUpdate([legacy, mine], [legacy, mine, { id: 'second', label: 'S', icon: 'i' }], false, 'me').ok).toBe(false);
    const swap = evaluateRoomsUpdate([legacy, mine], [legacy, { id: 'second', label: 'S', icon: 'i' }], false, 'me');
    expect(swap.ok).toBe(true);
  });

  it('non-owner may rename/remove only their own room', () => {
    expect(evaluateRoomsUpdate([legacy, mine], [legacy, { ...mine, label: 'Renamed' }], false, 'me').ok).toBe(true);
    expect(evaluateRoomsUpdate([legacy, mine], [legacy], false, 'me').ok).toBe(true);
    // Legacy (unstamped) and other-created rooms are untouchable.
    expect(evaluateRoomsUpdate([legacy, mine], [{ ...legacy, label: 'Hax' }, mine], false, 'me').ok).toBe(false);
    expect(evaluateRoomsUpdate([legacy, mine], [mine], false, 'me').ok).toBe(false);
    expect(evaluateRoomsUpdate([theirs], [{ ...theirs, icon: 'other' }], false, 'me').ok).toBe(false);
    expect(evaluateRoomsUpdate([theirs], [], false, 'me').ok).toBe(false);
  });

  it('surviving rooms keep their CURRENT createdBy regardless of what the sender claims', () => {
    const d = evaluateRoomsUpdate([theirs, mine], [{ ...theirs, createdBy: 'me' }, mine], false, 'me');
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.rooms.find((r) => r.id === 'their-room')!.createdBy).toBe('them');
    // ...and a legacy room can't be given a creator after the fact.
    const d2 = evaluateRoomsUpdate([legacy], [{ ...legacy, createdBy: 'me' }], false, 'me');
    expect(d2.ok).toBe(true);
    if (d2.ok) expect(d2.rooms[0]!.createdBy).toBeUndefined();
  });

  it('a no-change update and pure reordering are always ok', () => {
    expect(evaluateRoomsUpdate([legacy, mine], [legacy, mine], false, 'me').ok).toBe(true);
    expect(evaluateRoomsUpdate([legacy, mine], [mine, legacy], false, 'me').ok).toBe(true);
  });

  it('an anonymous (empty-userId) non-owner can change nothing', () => {
    expect(evaluateRoomsUpdate([legacy], [legacy, { id: 'new', label: 'N', icon: 'i' }], false, '').ok).toBe(false);
    expect(evaluateRoomsUpdate([legacy], [], false, '').ok).toBe(false);
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
