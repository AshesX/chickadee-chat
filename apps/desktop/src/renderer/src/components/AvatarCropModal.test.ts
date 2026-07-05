import { describe, it, expect } from 'vitest';
import { clampOffset } from './AvatarCropModal';

describe('clampOffset', () => {
  // Square crop window (today's avatar case): 128x128 half-extents.
  it('no clamping needed when the offset is within the available pan room', () => {
    const img = { naturalWidth: 400, naturalHeight: 400 };
    const result = clampOffset({ x: 5, y: -5 }, 1, img, 128, 128);
    expect(result).toEqual({ x: 5, y: -5 });
  });

  it('clamps to zero pan room when the scaled image is smaller than the crop window', () => {
    const img = { naturalWidth: 100, naturalHeight: 100 };
    const result = clampOffset({ x: 5, y: 5 }, 1, img, 128, 128);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('clamps within bounds for a square crop window', () => {
    const img = { naturalWidth: 400, naturalHeight: 400 };
    // scaled image half-extent = 200; crop half = 128 → max pan = 72
    const result = clampOffset({ x: 500, y: -500 }, 1, img, 128, 128);
    expect(result).toEqual({ x: 72, y: -72 });
  });

  // Wide rectangular crop window (banner case): e.g. 128x42.67 half-extents.
  it('clamps within bounds for a wide (banner) crop window, independently per axis', () => {
    const img = { naturalWidth: 400, naturalHeight: 400 };
    // scaled image half-extents = 200,200; crop halves = 128, 42.67 → max pan 72, 157.33
    const result = clampOffset({ x: 500, y: -500 }, 1, img, 128, 42.666666666666664);
    expect(result.x).toBeCloseTo(72);
    expect(result.y).toBeCloseTo(-157.33333333333334);
  });

  it('is symmetric when cropHalfW !== cropHalfH and offset is within bounds', () => {
    const img = { naturalWidth: 1000, naturalHeight: 1000 };
    const result = clampOffset({ x: 10, y: 10 }, 1, img, 128, 42.67);
    expect(result).toEqual({ x: 10, y: 10 });
  });
});
