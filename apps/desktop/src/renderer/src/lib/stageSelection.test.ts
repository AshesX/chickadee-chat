import { describe, expect, it } from 'vitest';
import { selectStage } from './stageSelection';

const peers = [
  { id: 'p1', userId: 'u1' },
  { id: 'p2', userId: 'u2' },
];

describe('selectStage', () => {
  it('no spotlight → no theater, no stage source', () => {
    const sel = selectStage({
      myStageKind: null,
      spotlightHolderId: null,
      spotlightKind: null,
      peers,
      subscribedUserIds: [],
    });
    expect(sel).toEqual({
      isSelfStage: false,
      stagePeerId: null,
      stageSubscribed: true,
      stageSource: null,
      theater: false,
    });
  });

  it('self holds the stage with a screen → local screen source', () => {
    const sel = selectStage({
      myStageKind: 'screen',
      spotlightHolderId: 'self',
      spotlightKind: 'screen',
      peers,
      subscribedUserIds: [],
    });
    expect(sel.isSelfStage).toBe(true);
    expect(sel.theater).toBe(true);
    expect(sel.stagePeerId).toBeNull();
    expect(sel.stageSource).toBe('local-screen');
  });

  it('self holds the stage with the camera → local camera source', () => {
    const sel = selectStage({
      myStageKind: 'camera',
      spotlightHolderId: 'self',
      spotlightKind: 'camera',
      peers,
      subscribedUserIds: [],
    });
    expect(sel.stageSource).toBe('local-camera');
  });

  it('peer holds the stage and we are subscribed → remote source by kind', () => {
    const screen = selectStage({
      myStageKind: null,
      spotlightHolderId: 'p1',
      spotlightKind: 'screen',
      peers,
      subscribedUserIds: ['u1'],
    });
    expect(screen.stagePeerId).toBe('p1');
    expect(screen.stageSubscribed).toBe(true);
    expect(screen.stageSource).toBe('remote-screen');
    expect(screen.theater).toBe(true);

    const camera = selectStage({
      myStageKind: null,
      spotlightHolderId: 'p2',
      spotlightKind: 'camera',
      peers,
      subscribedUserIds: ['u2'],
    });
    expect(camera.stageSource).toBe('remote-camera');
  });

  it('peer holds the stage but we have NOT opted in → theater with null source (Watch placeholder)', () => {
    const sel = selectStage({
      myStageKind: null,
      spotlightHolderId: 'p1',
      spotlightKind: 'screen',
      peers,
      subscribedUserIds: ['u2'],
    });
    expect(sel.stagePeerId).toBe('p1');
    expect(sel.stageSubscribed).toBe(false);
    expect(sel.stageSource).toBeNull();
    expect(sel.theater).toBe(true);
  });

  it('holder not in the peer list (mid-join race) → no theater', () => {
    const sel = selectStage({
      myStageKind: null,
      spotlightHolderId: 'ghost',
      spotlightKind: 'screen',
      peers,
      subscribedUserIds: [],
    });
    expect(sel.stagePeerId).toBeNull();
    expect(sel.theater).toBe(false);
    expect(sel.stageSource).toBeNull();
  });
});
