import { describe, it, expect } from 'vitest';
import { deriveWants, classifyPeerStreams } from './meshLogic';

describe('deriveWants', () => {
  it('wants nothing when not subscribed to us', () => {
    expect(deriveWants(['someone-else'], true, 'me')).toEqual({ video: false, screenAudio: false });
    expect(deriveWants(undefined, true, 'me')).toEqual({ video: false, screenAudio: false });
    expect(deriveWants([], true, 'me')).toEqual({ video: false, screenAudio: false });
  });

  it('wants screen audio when subscribed, video only when also rendering', () => {
    expect(deriveWants(['me'], true, 'me')).toEqual({ video: true, screenAudio: true });
    expect(deriveWants(['me'], false, 'me')).toEqual({ video: false, screenAudio: true });
  });
});

describe('classifyPeerStreams', () => {
  it('matches the announced screen id; the other is camera', () => {
    expect(classifyPeerStreams(['cam1', 'scr1'], 'scr1')).toEqual({
      cameraStreamId: 'cam1',
      screenStreamId: 'scr1',
    });
  });

  it('treats everything as camera when no screen id is announced', () => {
    expect(classifyPeerStreams(['cam1'], undefined)).toEqual({
      cameraStreamId: 'cam1',
      screenStreamId: null,
    });
  });

  it('handles a screen-only peer', () => {
    expect(classifyPeerStreams(['scr1'], 'scr1')).toEqual({
      cameraStreamId: null,
      screenStreamId: 'scr1',
    });
  });

  it('returns nulls for no streams', () => {
    expect(classifyPeerStreams([], 'scr1')).toEqual({ cameraStreamId: null, screenStreamId: null });
  });

  it('last non-screen id wins (matches the original loop assignment)', () => {
    expect(classifyPeerStreams(['cam1', 'scr1', 'cam2'], 'scr1')).toEqual({
      cameraStreamId: 'cam2',
      screenStreamId: 'scr1',
    });
  });
});
