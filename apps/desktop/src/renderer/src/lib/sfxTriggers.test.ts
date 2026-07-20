import { describe, expect, it } from 'vitest';
import {
  PEER_SFX_GAP_MS,
  POST_ROOM_CHANGE_SUPPRESS_MS,
  ROSTER_SETTLE_MS,
  decideMuteCue,
  decideRoomPeerCue,
  decideScreenShareCue,
  decideSpotlightCue,
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

const screenBase = {
  sfxEnabled: true,
  screenShareEnabled: true,
  inRoom: true,
  sharingIds: '',
  prevSharingIds: '',
  now: 100_000,
  lastRoomChangeAt: 0,
};

describe('decideScreenShareCue', () => {
  it('plays start/stop on a count change', () => {
    expect(decideScreenShareCue({ ...screenBase, sharingIds: 'p1', prevSharingIds: '' })).toBe('screen-share-start');
    expect(decideScreenShareCue({ ...screenBase, sharingIds: '', prevSharingIds: 'p1' })).toBe('screen-share-stop');
  });

  it('is silent when the count is unchanged (a swap)', () => {
    expect(decideScreenShareCue({ ...screenBase, sharingIds: 'p2', prevSharingIds: 'p1' })).toBeNull();
  });

  it('is silent when disabled, out of room, or inside the roster-settle window', () => {
    expect(decideScreenShareCue({ ...screenBase, sharingIds: 'p1', screenShareEnabled: false })).toBeNull();
    expect(decideScreenShareCue({ ...screenBase, sharingIds: 'p1', sfxEnabled: false })).toBeNull();
    expect(decideScreenShareCue({ ...screenBase, sharingIds: 'p1', inRoom: false })).toBeNull();
    expect(
      decideScreenShareCue({ ...screenBase, sharingIds: 'p1', lastRoomChangeAt: screenBase.now - ROSTER_SETTLE_MS + 50 }),
    ).toBeNull();
  });
});

const spotlightBase = {
  sfxEnabled: true,
  spotlightEnabled: true,
  prevHolderId: null as string | null,
  prevKind: null as 'screen' | 'camera' | null,
  holderId: null as string | null,
  kind: null as 'screen' | 'camera' | null,
};

describe('decideSpotlightCue', () => {
  it('plays a claim cue when a peer camera-spotlights', () => {
    expect(decideSpotlightCue({ ...spotlightBase, holderId: 'p1', kind: 'camera' })).toBe('spotlight-claim');
  });

  it('plays a lose cue when the camera holder releases or is taken over', () => {
    const held = { ...spotlightBase, prevHolderId: 'p1', prevKind: 'camera' as const };
    expect(decideSpotlightCue({ ...held, holderId: null, kind: null })).toBe('spotlight-lose');
    expect(decideSpotlightCue({ ...held, holderId: 'p2', kind: 'camera' })).toBe('spotlight-claim');
  });

  it('is silent for screen-kind changes (screen-share cue covers those)', () => {
    expect(decideSpotlightCue({ ...spotlightBase, holderId: 'p1', kind: 'screen' })).toBeNull();
    const held = { ...spotlightBase, prevHolderId: 'p1', prevKind: 'screen' as const };
    expect(decideSpotlightCue({ ...held, holderId: null, kind: null })).toBeNull();
  });

  it('is silent when unchanged or disabled', () => {
    const held = { ...spotlightBase, prevHolderId: 'p1', prevKind: 'camera' as const, holderId: 'p1', kind: 'camera' as const };
    expect(decideSpotlightCue(held)).toBeNull();
    expect(decideSpotlightCue({ ...spotlightBase, holderId: 'p1', kind: 'camera', spotlightEnabled: false })).toBeNull();
    expect(decideSpotlightCue({ ...spotlightBase, holderId: 'p1', kind: 'camera', sfxEnabled: false })).toBeNull();
  });
});
