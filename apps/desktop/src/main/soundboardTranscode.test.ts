import { describe, expect, it } from 'vitest';
import { MAX_CLIP_DURATION_S, buildTranscodeArgs } from './soundboardTranscode';

describe('buildTranscodeArgs', () => {
  const args = buildTranscodeArgs('C:/in/airhorn.wav', 'C:/out/abc123.mp3');

  it('trims INPUT-side, before -i, so discarded audio never reaches the filtergraph', () => {
    const tIndex = args.indexOf('-t');
    const iIndex = args.indexOf('-i');
    expect(tIndex).toBeGreaterThanOrEqual(0);
    expect(iIndex).toBeGreaterThan(tIndex);
    expect(args[tIndex + 1]).toBe(String(MAX_CLIP_DURATION_S));
  });

  it('passes the exact input and output paths', () => {
    expect(args[args.indexOf('-i') + 1]).toBe('C:/in/airhorn.wav');
    expect(args.at(-1)).toBe('C:/out/abc123.mp3');
  });

  it('applies single-pass dynaudnorm loudness normalization', () => {
    const afIndex = args.indexOf('-af');
    expect(afIndex).toBeGreaterThanOrEqual(0);
    expect(args[afIndex + 1]).toMatch(/^dynaudnorm=/);
  });

  it('encodes to 128kbps MP3 (bit-deterministic, unlike Ogg Vorbis — see the module doc comment)', () => {
    expect(args).toContain('libmp3lame');
    expect(args[args.indexOf('-b:a') + 1]).toBe('128k');
  });

  it('drops any video/art stream and requests machine-parseable progress', () => {
    expect(args).toContain('-vn');
    expect(args[args.indexOf('-progress') + 1]).toBe('pipe:1');
  });

  it('is a fixed-shape argv array (no shell interpolation surface)', () => {
    expect(args.every((a) => typeof a === 'string')).toBe(true);
  });
});
