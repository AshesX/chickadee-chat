import { describe, it, expect } from 'vitest';
import { clampOffset, cropSourceRect, cropWindowHalfExtents, minCropScale } from './cropMath';

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

describe('cropWindowHalfExtents', () => {
  it('fills the padded canvas on both axes for a square (avatar) output', () => {
    expect(cropWindowHalfExtents(128, 128, 288, 16)).toEqual({ halfW: 128, halfH: 128 });
  });

  it('letterboxes a wide (banner) output on the vertical axis', () => {
    const { halfW, halfH } = cropWindowHalfExtents(960, 320, 288, 16);
    expect(halfW).toBe(128);
    expect(halfH).toBeCloseTo(128 / 3);
  });

  it('pillarboxes a tall output on the horizontal axis', () => {
    const { halfW, halfH } = cropWindowHalfExtents(320, 960, 288, 16);
    expect(halfH).toBe(128);
    expect(halfW).toBeCloseTo(128 / 3);
  });
});

describe('minCropScale', () => {
  it('covers the crop window along the image’s tighter axis', () => {
    // 400x200 image, 128x128 window → height is tight: 256/200 = 1.28
    expect(minCropScale({ naturalWidth: 400, naturalHeight: 200 }, 128, 128)).toBeCloseTo(1.28);
  });

  it('is exactly 1 when the image equals the window', () => {
    expect(minCropScale({ naturalWidth: 256, naturalHeight: 256 }, 128, 128)).toBe(1);
  });
});

describe('cropSourceRect', () => {
  it('crops the centered window at scale 1 with no pan', () => {
    const rect = cropSourceRect({ naturalWidth: 400, naturalHeight: 400 }, 1, { x: 0, y: 0 }, 128, 128);
    expect(rect).toEqual({ sx: 72, sy: 72, sw: 256, sh: 256 });
  });

  it('moves the source window opposite to the on-screen pan, scaled', () => {
    // Panning the image +20px right at 2x shows content 10 natural px to the LEFT of center.
    const rect = cropSourceRect({ naturalWidth: 400, naturalHeight: 400 }, 2, { x: 20, y: 0 }, 128, 128);
    expect(rect.sx).toBe(200 - 10 - 64);
    expect(rect.sw).toBe(128);
  });

  it('halves the source extent when zoomed to 2x', () => {
    const rect = cropSourceRect({ naturalWidth: 512, naturalHeight: 512 }, 2, { x: 0, y: 0 }, 128, 128);
    expect(rect.sw).toBe(128);
    expect(rect.sh).toBe(128);
  });
});
