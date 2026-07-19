import { describe, expect, it } from 'vitest';
import { deriveClipName, isSizeStable, isSupportedAudioFile } from './soundboardLibraryLogic';

describe('isSizeStable', () => {
  it('is false with fewer than the required samples', () => {
    expect(isSizeStable([])).toBe(false);
    expect(isSizeStable([100])).toBe(false);
    expect(isSizeStable([100, 100])).toBe(false);
  });

  it('is false while the file is still growing', () => {
    expect(isSizeStable([100, 200, 300])).toBe(false);
    expect(isSizeStable([100, 200, 200])).toBe(false);
  });

  it('is true once the last N samples agree', () => {
    expect(isSizeStable([50, 100, 100, 100])).toBe(true);
    expect(isSizeStable([100, 100, 100])).toBe(true);
  });

  it('only looks at the trailing window for a custom sample count', () => {
    expect(isSizeStable([100, 100], 2)).toBe(true);
    expect(isSizeStable([50, 100, 100, 100, 100], 4)).toBe(true);
    expect(isSizeStable([50, 60, 100, 100, 100], 4)).toBe(false);
  });
});

describe('isSupportedAudioFile', () => {
  it('accepts common audio extensions, case-insensitively', () => {
    expect(isSupportedAudioFile('airhorn.mp3')).toBe(true);
    expect(isSupportedAudioFile('airhorn.WAV')).toBe(true);
    expect(isSupportedAudioFile('clip.ogg')).toBe(true);
    expect(isSupportedAudioFile('clip.opus')).toBe(true);
  });

  it('rejects non-audio files (Explorer/editor noise)', () => {
    expect(isSupportedAudioFile('thumbs.db')).toBe(false);
    expect(isSupportedAudioFile('notes.txt')).toBe(false);
    expect(isSupportedAudioFile('no-extension')).toBe(false);
    expect(isSupportedAudioFile('video.mp4')).toBe(false);
  });
});

describe('deriveClipName', () => {
  it('title-cases kebab- and snake_case basenames', () => {
    expect(deriveClipName('air-horn.wav')).toBe('Air Horn');
    expect(deriveClipName('sad_trombone.mp3')).toBe('Sad Trombone');
  });

  it('strips only the final extension', () => {
    expect(deriveClipName('my.clip.name.ogg')).toBe('My.clip.name');
  });

  it('falls back to a generic name for an empty/symbol-only basename', () => {
    expect(deriveClipName('.mp3')).toBe('Sound');
    expect(deriveClipName('---.wav')).toBe('Sound');
  });
});
