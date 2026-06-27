import { describe, it, expect } from 'vitest';
import {
  computeVideoEncoding,
  computeAudioEncoding,
  computeMeshEncoding,
  formatBitrate,
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

describe('computeMeshEncoding', () => {
  it('combines camera, screen, and audio for the chosen tier', () => {
    const mesh = computeMeshEncoding('720p', '30', '1080p', '60', 'balanced');
    expect(mesh.camera).toEqual(computeVideoEncoding('camera', '720p', '30', 'balanced'));
    expect(mesh.screen).toEqual(computeVideoEncoding('screen', '1080p', '60', 'balanced'));
    expect(mesh.audio).toEqual(computeAudioEncoding('balanced'));
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
