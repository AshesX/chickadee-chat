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
});
