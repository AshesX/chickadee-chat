import { describe, it, expect } from 'vitest';
import {
  computeVideoEncoding,
  computeAudioEncoding,
  computeMeshEncoding,
  applyUploadBudget,
  formatBitrate,
  STAGE_UPLOAD_BUDGET_BPS,
} from './encodingParams';

describe('computeVideoEncoding', () => {
  it('caps camera bitrate from the resolution at the high tier', () => {
    const enc = computeVideoEncoding('camera', '720p', '30', 'high');
    expect(enc.maxBitrate).toBe(2_000_000);
    expect(enc.maxFramerate).toBe(30);
    expect(enc.degradationPreference).toBe('balanced');
  });

  it('scales the cap down for lower quality tiers', () => {
    const high = computeVideoEncoding('camera', '1080p', '30', 'high').maxBitrate!;
    const balanced = computeVideoEncoding('camera', '1080p', '30', 'balanced').maxBitrate!;
    const saver = computeVideoEncoding('camera', '1080p', '30', 'saver').maxBitrate!;
    expect(balanced).toBeLessThan(high);
    expect(saver).toBeLessThan(balanced);
    expect(balanced).toBe(Math.round(high * 0.6));
    expect(saver).toBe(Math.round(high * 0.35));
  });

  it("leaves bitrate uncapped at the 'max' tier", () => {
    expect(computeVideoEncoding('camera', '1080p', '30', 'max').maxBitrate).toBeUndefined();
    expect(computeVideoEncoding('screen', '4K', '60', 'max').maxBitrate).toBeUndefined();
  });

  it('uses higher base bitrate + maintain-resolution for screen', () => {
    const cam = computeVideoEncoding('camera', '1080p', '30', 'high');
    const screen = computeVideoEncoding('screen', '1080p', '30', 'high');
    expect(screen.maxBitrate!).toBeGreaterThan(cam.maxBitrate!);
    expect(screen.degradationPreference).toBe('maintain-resolution');
  });

  it('carries the selected framerate through and defaults bad input to 30', () => {
    expect(computeVideoEncoding('camera', '720p', '60', 'high').maxFramerate).toBe(60);
    expect(computeVideoEncoding('camera', '720p', 'nonsense', 'high').maxFramerate).toBe(30);
  });

  it('falls back to the 720p row for unknown resolutions', () => {
    const unknown = computeVideoEncoding('camera', 'weird', '30', 'high');
    const known720 = computeVideoEncoding('camera', '720p', '30', 'high');
    expect(unknown.maxBitrate).toBe(known720.maxBitrate);
  });

  it('returns fixed tiny ceilings for the thumbnail role, ignoring tier/resolution', () => {
    const thumb = computeVideoEncoding('camera', '1080p', '60', 'max', 'thumbnail');
    expect(thumb.maxBitrate).toBe(200_000);
    expect(thumb.maxFramerate).toBe(15);
    expect(thumb.scaleResolutionDownBy).toBe(3);
    // Even a 'max' screen thumbnail is capped tiny (protects the full mesh).
    const screenThumb = computeVideoEncoding('screen', '4K', '60', 'max', 'thumbnail');
    expect(screenThumb).toEqual(thumb);
  });
});

describe('applyUploadBudget', () => {
  it('splits the budget across viewers (min of tier cap and budget/viewers)', () => {
    const cap = computeVideoEncoding('screen', '1080p', '30', 'max'); // uncapped tier
    // 4 viewers → budget / 4.
    expect(applyUploadBudget(cap, 4, 12_000_000).maxBitrate).toBe(3_000_000);
    // 1 viewer → whole budget (still a hard ceiling, even for 'max').
    expect(applyUploadBudget(cap, 1, 12_000_000).maxBitrate).toBe(12_000_000);
  });

  it('keeps the lower user-tier cap when the tier is stricter than the budget share', () => {
    const saver = computeVideoEncoding('screen', '480p', '30', 'saver'); // small cap
    const capped = applyUploadBudget(saver, 1, 12_000_000);
    expect(capped.maxBitrate).toBe(saver.maxBitrate); // tier wins at 1 viewer
  });

  it('floors viewers at 1 so a zero-watcher stage never divides by zero', () => {
    const cap = computeVideoEncoding('screen', '1080p', '30', 'max');
    expect(applyUploadBudget(cap, 0, 12_000_000).maxBitrate).toBe(12_000_000);
  });

  it('bounds total stage upload at ~budget regardless of viewer count', () => {
    const cap = computeVideoEncoding('screen', '4K', '60', 'max');
    for (const viewers of [1, 3, 7]) {
      const perViewer = applyUploadBudget(cap, viewers, 12_000_000).maxBitrate!;
      expect(perViewer * viewers).toBeLessThanOrEqual(12_000_000);
    }
  });
});

describe('computeMeshEncoding', () => {
  it('makes both camera + screen thumbnails when we hold no stage', () => {
    const mesh = computeMeshEncoding('720p', '30', '1080p', '60', 'balanced', 'balanced');
    expect(mesh.camera).toEqual(computeVideoEncoding('camera', '720p', '30', 'balanced', 'thumbnail'));
    expect(mesh.screen).toEqual(computeVideoEncoding('screen', '1080p', '60', 'balanced', 'thumbnail'));
    expect(mesh.audio).toEqual(computeAudioEncoding('balanced'));
  });

  it('promotes only the spotlighted kind to a budget-clamped stage encoding', () => {
    const mesh = computeMeshEncoding('720p', '30', '1080p', '60', 'high', 'high', 'screen', 3);
    // Screen is the stage: tier cap clamped by budget / 3 watchers.
    const stageBase = computeVideoEncoding('screen', '1080p', '60', 'high');
    expect(mesh.screen).toEqual(applyUploadBudget(stageBase, 3, STAGE_UPLOAD_BUDGET_BPS));
    // Camera stays a thumbnail.
    expect(mesh.camera).toEqual(computeVideoEncoding('camera', '720p', '30', 'high', 'thumbnail'));
  });

  it('promotes the camera when it is the spotlighted kind', () => {
    const mesh = computeMeshEncoding('720p', '30', '1080p', '60', 'high', 'high', 'camera', 1);
    expect(mesh.screen).toEqual(computeVideoEncoding('screen', '1080p', '60', 'high', 'thumbnail'));
    expect(mesh.camera.scaleResolutionDownBy).toBeUndefined(); // stage, not thumbnail
  });
});

describe('computeAudioEncoding', () => {
  it('forces mono + caps bitrate below the max tier', () => {
    const high = computeAudioEncoding('high');
    expect(high.mono).toBe(true);
    expect(high.maxAverageBitrate).toBe(48_000);
    expect(computeAudioEncoding('saver').maxAverageBitrate).toBe(24_000);
  });

  it("stays stereo + uncapped at the 'max' tier", () => {
    const max = computeAudioEncoding('max');
    expect(max.mono).toBe(false);
    expect(max.maxAverageBitrate).toBeUndefined();
  });
});

describe('formatBitrate', () => {
  it("renders 'Uncapped' for undefined", () => {
    expect(formatBitrate(undefined)).toBe('Uncapped');
  });

  it('renders Mbps with one decimal, trimming a trailing .0', () => {
    expect(formatBitrate(4_500_000)).toBe('4.5 Mbps');
    expect(formatBitrate(2_000_000)).toBe('2 Mbps');
    expect(formatBitrate(8_000_000)).toBe('8 Mbps');
  });

  it('renders sub-Mbps values as rounded kbps', () => {
    expect(formatBitrate(48_000)).toBe('48 kbps');
    expect(formatBitrate(24_000)).toBe('24 kbps');
  });
});
