import { describe, expect, it } from 'vitest';
import {
  PEER_SFX_GAP_MS,
  POST_ROOM_CHANGE_SUPPRESS_MS,
  ROSTER_SETTLE_MS,
  decideMuteCue,
  decideRoomPeerCue,
  decideTransmitCue,
} from './sfxTriggers';

const base = {
  sfxEnabled: true,
  joinLeaveEnabled: true,
  roomId: 'general' as string | null,
  prevRoomId: 'general' as string | null,
  peerIds: '',
  prevPeerIds: '',
  now: 100_000,
  lastRoomChangeAt: 0,
  lastPeerSfxAt: 0,
};

describe('decideRoomPeerCue', () => {
  it('plays join when entering a room and stamps the room change', () => {
    const d = decideRoomPeerCue({ ...base, prevRoomId: null });
    expect(d).toEqual({ cue: 'join', roomChanged: true, peerCuePlayed: false });
  });

  it('plays leave when exiting to no room', () => {
    const d = decideRoomPeerCue({ ...base, roomId: null, prevRoomId: 'general' });
    expect(d.cue).toBe('leave');
    expect(d.roomChanged).toBe(true);
  });

  it('a room switch counts as a join into the new room', () => {
    expect(decideRoomPeerCue({ ...base, roomId: 'lounge' }).cue).toBe('join');
  });

  it('still stamps the room change when the join/leave cue is disabled', () => {
    const d = decideRoomPeerCue({ ...base, prevRoomId: null, joinLeaveEnabled: false });
    expect(d).toEqual({ cue: null, roomChanged: true, peerCuePlayed: false });
  });

  it('does nothing at all while sfx are disabled', () => {
    const d = decideRoomPeerCue({ ...base, prevRoomId: null, sfxEnabled: false });
    expect(d).toEqual({ cue: null, roomChanged: false, peerCuePlayed: false });
  });

  it('plays peer join/leave once the roster has settled', () => {
    const settled = base.now - ROSTER_SETTLE_MS - 1;
    expect(
      decideRoomPeerCue({ ...base, peerIds: 'p1,p2', prevPeerIds: 'p1', lastRoomChangeAt: settled }),
    ).toEqual({ cue: 'join', roomChanged: false, peerCuePlayed: true });
    expect(
      decideRoomPeerCue({ ...base, peerIds: '', prevPeerIds: 'p1', lastRoomChangeAt: settled }).cue,
    ).toBe('leave');
  });

  it('suppresses peer cues inside the roster-settle window', () => {
    const d = decideRoomPeerCue({
      ...base,
      peerIds: 'p1',
      prevPeerIds: '',
      lastRoomChangeAt: base.now - ROSTER_SETTLE_MS + 50,
    });
    expect(d.cue).toBeNull();
  });

  it('coalesces rapid peer cues within the gap', () => {
    const d = decideRoomPeerCue({
      ...base,
      peerIds: 'p1,p2',
      prevPeerIds: 'p1',
      lastPeerSfxAt: base.now - PEER_SFX_GAP_MS + 50,
    });
    expect(d.cue).toBeNull();
    expect(d.peerCuePlayed).toBe(false);
  });

  it('an equal-size roster swap (one in, one out) plays nothing', () => {
    expect(decideRoomPeerCue({ ...base, peerIds: 'p2', prevPeerIds: 'p1' }).cue).toBeNull();
  });
});

const muteCtx = {
  inRoom: true,
  sfxEnabled: true,
  muteEnabled: true,
  inputMode: 'voice' as const,
  msSinceRoomChange: POST_ROOM_CHANGE_SUPPRESS_MS + 1,
};

describe('decideMuteCue', () => {
  it('maps the intent edge to mute/unmute', () => {
    expect(decideMuteCue(false, muteCtx)).toBe('mute');
    expect(decideMuteCue(true, muteCtx)).toBe('unmute');
  });

  it('is silent in PTT mode, out of room, and right after a room change', () => {
    expect(decideMuteCue(false, { ...muteCtx, inputMode: 'ptt' })).toBeNull();
    expect(decideMuteCue(false, { ...muteCtx, inRoom: false })).toBeNull();
    expect(decideMuteCue(false, { ...muteCtx, msSinceRoomChange: 500 })).toBeNull();
    expect(decideMuteCue(false, { ...muteCtx, muteEnabled: false })).toBeNull();
  });
});

const txCtx = {
  inRoom: true,
  sfxEnabled: true,
  transmitEnabled: true,
  inputMode: 'voice' as const,
  micButtonOn: true,
  msSinceRoomChange: POST_ROOM_CHANGE_SUPPRESS_MS + 1,
};

describe('decideTransmitCue', () => {
  it('maps the gate edge to open/close', () => {
    expect(decideTransmitCue(true, txCtx)).toBe('transmit-open');
    expect(decideTransmitCue(false, txCtx)).toBe('transmit-close');
  });

  it('suppresses gate-close cues caused by a manual mute in voice mode', () => {
    expect(decideTransmitCue(false, { ...txCtx, micButtonOn: false })).toBeNull();
  });

  it('plays in PTT mode regardless of the mute intent', () => {
    expect(decideTransmitCue(true, { ...txCtx, inputMode: 'ptt', micButtonOn: false })).toBe('transmit-open');
  });

  it('is silent when disabled, out of room, or right after a room change', () => {
    expect(decideTransmitCue(true, { ...txCtx, transmitEnabled: false })).toBeNull();
    expect(decideTransmitCue(true, { ...txCtx, inRoom: false })).toBeNull();
    expect(decideTransmitCue(true, { ...txCtx, msSinceRoomChange: 100 })).toBeNull();
  });
});
