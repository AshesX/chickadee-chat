import { describe, expect, it } from 'vitest';
import { bumpRateWindow, evaluateSpotlightClaim, resolveRoomCap, sanitizeJoinRequest } from './logic';

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
