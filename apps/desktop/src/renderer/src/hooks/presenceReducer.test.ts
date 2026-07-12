import { describe, it, expect } from 'vitest';
import type { Peer, PeerId, ServerMessage } from '@chickadee/shared';
import { applyPresenceUpdate, type SignalingState } from './useSignaling';

const BASE_STATE: SignalingState = {
  status: 'idle',
  selfId: null,
  peers: [],
  error: null,
  rooms: [],
  spacePresence: [],
  spotlightHolderId: null,
  spotlightKind: null,
  moderatorId: null,
  lockedRooms: [],
  spaceLocked: false,
  bannedUsers: [],
};

function makePeer(over: Partial<Peer> & { id: PeerId }): Peer {
  return {
    userId: `uid-${over.id}`,
    displayName: String(over.id),
    muted: false,
    speaking: false,
    cameraOn: false,
    screenStreamId: null,
    deafened: false,
    status: 'online',
    avatarDataUrl: null,
    voicePreference: '',
    accentColor: '',
    wantsVideo: true,
    videoSubscriptions: [],
    ...over,
  };
}

describe('applyPresenceUpdate', () => {
  it('welcome sets connected status, selfId, peers, and rooms', () => {
    const peers = [makePeer({ id: 'a' })];
    const rooms = [{ id: 'gaming', label: 'Gaming', icon: 'sofa' }];
    const next = applyPresenceUpdate(BASE_STATE, {
      type: 'welcome',
      selfId: 'me',
      peers,
      rooms,
    } as ServerMessage);
    expect(next.status).toBe('connected');
    expect(next.selfId).toBe('me');
    expect(next.peers).toEqual(peers);
    expect(next.rooms).toEqual(rooms);
    expect(next.error).toBeNull();
  });

  it('peer-joined appends, and is idempotent on a duplicate id', () => {
    const start: SignalingState = { ...BASE_STATE, peers: [makePeer({ id: 'a' })] };
    const joined = applyPresenceUpdate(start, { type: 'peer-joined', peer: makePeer({ id: 'b' }) } as ServerMessage);
    expect(joined.peers.map((p) => p.id)).toEqual(['a', 'b']);

    const dup = applyPresenceUpdate(joined, { type: 'peer-joined', peer: makePeer({ id: 'b' }) } as ServerMessage);
    expect(dup).toBe(joined); // unchanged reference
  });

  it('peer-left removes the matching peer', () => {
    const start: SignalingState = { ...BASE_STATE, peers: [makePeer({ id: 'a' }), makePeer({ id: 'b' })] };
    const next = applyPresenceUpdate(start, { type: 'peer-left', peerId: 'a' } as ServerMessage);
    expect(next.peers.map((p) => p.id)).toEqual(['b']);
  });

  it('mic-state updates only the addressed peer and only its muted flag', () => {
    const start: SignalingState = { ...BASE_STATE, peers: [makePeer({ id: 'a' }), makePeer({ id: 'b' })] };
    const next = applyPresenceUpdate(start, { type: 'mic-state', from: 'b', muted: true } as ServerMessage);
    expect(next.peers.find((p) => p.id === 'a')?.muted).toBe(false);
    const b = next.peers.find((p) => p.id === 'b');
    expect(b?.muted).toBe(true);
    expect(b?.cameraOn).toBe(false); // other fields untouched
  });

  it('room-full resets peers/selfId but keeps the room list', () => {
    const start: SignalingState = {
      ...BASE_STATE,
      status: 'connected',
      selfId: 'me',
      peers: [makePeer({ id: 'a' })],
      rooms: [{ id: 'gaming', label: 'Gaming', icon: 'sofa' }],
    };
    const next = applyPresenceUpdate(start, { type: 'room-full', room: 'gaming' } as ServerMessage);
    expect(next.status).toBe('room-full');
    expect(next.peers).toEqual([]);
    expect(next.selfId).toBeNull();
    expect(next.rooms).toEqual(start.rooms);
    expect(next.error).toContain('full');
  });

  it('returns the same state for an unhandled message type', () => {
    const next = applyPresenceUpdate(BASE_STATE, { type: 'pong' } as ServerMessage);
    expect(next).toBe(BASE_STATE);
  });

  it('welcome carries the current stage holder (spotlight) for mid-join clients', () => {
    const next = applyPresenceUpdate(BASE_STATE, {
      type: 'welcome',
      selfId: 'me',
      peers: [makePeer({ id: 'a' })],
      rooms: [],
      spotlightHolderId: 'a',
      spotlightKind: 'screen',
    } as ServerMessage);
    expect(next.spotlightHolderId).toBe('a');
    expect(next.spotlightKind).toBe('screen');
  });

  it('spotlight-state sets the holder + kind, and null frees the stage', () => {
    const claimed = applyPresenceUpdate(BASE_STATE, {
      type: 'spotlight-state',
      holderId: 'a',
      kind: 'camera',
    } as ServerMessage);
    expect(claimed.spotlightHolderId).toBe('a');
    expect(claimed.spotlightKind).toBe('camera');

    const freed = applyPresenceUpdate(claimed, {
      type: 'spotlight-state',
      holderId: null,
      kind: null,
    } as ServerMessage);
    expect(freed.spotlightHolderId).toBeNull();
    expect(freed.spotlightKind).toBeNull();
  });

  it('peer-left clears the stage if the leaver was holding it', () => {
    const start: SignalingState = {
      ...BASE_STATE,
      peers: [makePeer({ id: 'a' }), makePeer({ id: 'b' })],
      spotlightHolderId: 'a',
      spotlightKind: 'screen',
    };
    const next = applyPresenceUpdate(start, { type: 'peer-left', peerId: 'a' } as ServerMessage);
    expect(next.spotlightHolderId).toBeNull();
    expect(next.spotlightKind).toBeNull();
  });

  it('peer-left keeps the stage when a different peer leaves', () => {
    const start: SignalingState = {
      ...BASE_STATE,
      peers: [makePeer({ id: 'a' }), makePeer({ id: 'b' })],
      spotlightHolderId: 'a',
      spotlightKind: 'screen',
    };
    const next = applyPresenceUpdate(start, { type: 'peer-left', peerId: 'b' } as ServerMessage);
    expect(next.spotlightHolderId).toBe('a');
  });

  it('welcome carries the room moderator, defaulting to null when omitted (lobby)', () => {
    const withMod = applyPresenceUpdate(BASE_STATE, {
      type: 'welcome',
      selfId: 'me',
      peers: [],
      rooms: [],
      moderatorId: 'a',
    } as ServerMessage);
    expect(withMod.moderatorId).toBe('a');

    const lobby = applyPresenceUpdate(withMod, {
      type: 'welcome',
      selfId: 'me',
      peers: [],
      rooms: [],
    } as ServerMessage);
    expect(lobby.moderatorId).toBeNull();
  });

  it('welcome merges space-scoped moderation fields with omit-means-keep', () => {
    const fresh = applyPresenceUpdate(BASE_STATE, {
      type: 'welcome',
      selfId: 'me',
      peers: [],
      rooms: [],
      lockedRooms: ['gaming'],
      spaceLocked: true,
      bannedUsers: [{ userId: 'u1', displayName: 'Troll' }],
    } as ServerMessage);
    expect(fresh.lockedRooms).toEqual(['gaming']);
    expect(fresh.spaceLocked).toBe(true);
    expect(fresh.bannedUsers).toEqual([{ userId: 'u1', displayName: 'Troll' }]);

    // A room-switch welcome omits the space fields — they must survive.
    const switched = applyPresenceUpdate(fresh, {
      type: 'welcome',
      selfId: 'me',
      peers: [],
      rooms: [],
      moderatorId: 'me',
    } as ServerMessage);
    expect(switched.lockedRooms).toEqual(['gaming']);
    expect(switched.spaceLocked).toBe(true);
    expect(switched.bannedUsers).toEqual([{ userId: 'u1', displayName: 'Troll' }]);
  });

  it('moderator-state sets the holder', () => {
    const next = applyPresenceUpdate(BASE_STATE, { type: 'moderator-state', holderId: 'b' } as ServerMessage);
    expect(next.moderatorId).toBe('b');
  });

  it('peer-left clears the moderator if the leaver held it, keeps it otherwise', () => {
    const start: SignalingState = { ...BASE_STATE, peers: [makePeer({ id: 'a' }), makePeer({ id: 'b' })], moderatorId: 'a' };
    const modLeft = applyPresenceUpdate(start, { type: 'peer-left', peerId: 'a' } as ServerMessage);
    expect(modLeft.moderatorId).toBeNull();
    const otherLeft = applyPresenceUpdate(start, { type: 'peer-left', peerId: 'b' } as ServerMessage);
    expect(otherLeft.moderatorId).toBe('a');
  });

  it('room-lock-state adds and removes bare room ids without duplicates', () => {
    const locked = applyPresenceUpdate(BASE_STATE, { type: 'room-lock-state', spaceId: 's', room: 'gaming', locked: true } as ServerMessage);
    expect(locked.lockedRooms).toEqual(['gaming']);
    const relocked = applyPresenceUpdate(locked, { type: 'room-lock-state', spaceId: 's', room: 'gaming', locked: true } as ServerMessage);
    expect(relocked.lockedRooms).toEqual(['gaming']);
    const unlocked = applyPresenceUpdate(relocked, { type: 'room-lock-state', spaceId: 's', room: 'gaming', locked: false } as ServerMessage);
    expect(unlocked.lockedRooms).toEqual([]);
  });

  it('space-lock-state and ban-state replace their fields', () => {
    const locked = applyPresenceUpdate(BASE_STATE, { type: 'space-lock-state', spaceId: 's', locked: true } as ServerMessage);
    expect(locked.spaceLocked).toBe(true);
    const banned = applyPresenceUpdate(locked, {
      type: 'ban-state',
      spaceId: 's',
      bannedUsers: [{ userId: 'u1', displayName: 'Troll' }],
    } as ServerMessage);
    expect(banned.bannedUsers).toEqual([{ userId: 'u1', displayName: 'Troll' }]);
  });

  it('kicked scope:space is terminal (room-full shape) with a reason-specific message', () => {
    const start: SignalingState = {
      ...BASE_STATE,
      status: 'connected',
      selfId: 'me',
      peers: [makePeer({ id: 'a' })],
      rooms: [{ id: 'gaming', label: 'Gaming', icon: 'sofa' }],
    };
    const kicked = applyPresenceUpdate(start, { type: 'kicked', scope: 'space', reason: 'kicked' } as ServerMessage);
    expect(kicked.status).toBe('kicked');
    expect(kicked.selfId).toBeNull();
    expect(kicked.peers).toEqual([]);
    expect(kicked.rooms).toEqual(start.rooms);
    expect(kicked.error).toContain('removed');

    const banned = applyPresenceUpdate(start, { type: 'kicked', scope: 'space', reason: 'banned' } as ServerMessage);
    expect(banned.status).toBe('kicked');
    expect(banned.error).toContain('banned');
  });

  it('kicked scope:room leaves the state untouched (App handles the lobby return)', () => {
    const start: SignalingState = { ...BASE_STATE, status: 'connected', selfId: 'me' };
    const next = applyPresenceUpdate(start, { type: 'kicked', scope: 'room', room: 'gaming', reason: 'kicked' } as ServerMessage);
    expect(next).toBe(start);
  });

  it('join-denied is terminal with a per-reason message', () => {
    const start: SignalingState = { ...BASE_STATE, rooms: [{ id: 'g', label: 'G', icon: 'i' }] };
    const banned = applyPresenceUpdate(start, { type: 'join-denied', spaceId: 's', reason: 'banned' } as ServerMessage);
    expect(banned.status).toBe('kicked');
    expect(banned.error).toContain('banned');
    expect(banned.rooms).toEqual(start.rooms);

    expect(applyPresenceUpdate(start, { type: 'join-denied', spaceId: 's', reason: 'space-locked' } as ServerMessage).error).toContain('Space is locked');
    expect(applyPresenceUpdate(start, { type: 'join-denied', spaceId: 's', reason: 'room-locked' } as ServerMessage).error).toContain('room is locked');
  });
});
