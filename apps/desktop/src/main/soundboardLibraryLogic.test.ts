import { describe, expect, it } from 'vitest';
import type { SoundboardLibraryClip } from '@chickadee/shared';
import {
  addManifestSource,
  deriveClipName,
  isSizeStable,
  isSupportedAudioFile,
  normalizeManifestEntry,
  removeManifestSource,
} from './soundboardLibraryLogic';

const clip = (hash: string, sourceFiles: string[]): SoundboardLibraryClip => ({
  hash,
  name: 'Clip',
  durationMs: 1000,
  sizeBytes: 80_000,
  sourceFiles,
});

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

describe('normalizeManifestEntry', () => {
  const base = { hash: 'h1', name: 'Clip', durationMs: 1000, sizeBytes: 80_000 };

  it('accepts the current sourceFiles shape and drops non-string entries', () => {
    expect(normalizeManifestEntry({ ...base, sourceFiles: ['a.mp3', 7, ''] })).toEqual({
      ...base,
      sourceFiles: ['a.mp3'],
    });
  });

  it('rejects entries missing required fields or any source', () => {
    expect(normalizeManifestEntry(null)).toBeNull();
    expect(normalizeManifestEntry({ ...base })).toBeNull();
    // The pre-refcount `sourceFile: string` shape is no longer migrated — it drops.
    expect(normalizeManifestEntry({ ...base, sourceFile: 'a.mp3' })).toBeNull();
    expect(normalizeManifestEntry({ ...base, sourceFiles: [] })).toBeNull();
    expect(normalizeManifestEntry({ ...base, sourceFiles: ['a.mp3'], hash: 5 })).toBeNull();
  });
});

describe('addManifestSource', () => {
  const meta = { hash: 'h1', name: 'Clip', durationMs: 1000, sizeBytes: 80_000 };

  it('creates a new entry for an unseen hash', () => {
    const { manifest, changed } = addManifestSource([], meta, 'a.mp3');
    expect(changed).toBe(true);
    expect(manifest).toEqual([{ ...meta, sourceFiles: ['a.mp3'] }]);
  });

  it('joins a content-identical file onto the existing entry (no duplicate entry)', () => {
    const { manifest, changed } = addManifestSource([clip('h1', ['a.mp3'])], meta, 'b.mp3');
    expect(changed).toBe(true);
    expect(manifest).toHaveLength(1);
    expect(manifest[0].sourceFiles).toEqual(['a.mp3', 'b.mp3']);
  });

  it('is a no-op when the filename is already recorded (re-transcode of same file)', () => {
    const before = [clip('h1', ['a.mp3'])];
    const { manifest, changed } = addManifestSource(before, meta, 'a.mp3');
    expect(changed).toBe(false);
    expect(manifest).toBe(before);
  });
});

describe('removeManifestSource', () => {
  it('only surrenders the cache (unlinkHash) when the LAST source goes', () => {
    const shared = [clip('h1', ['a.mp3', 'b.mp3'])];
    const first = removeManifestSource(shared, 'a.mp3');
    expect(first.changed).toBe(true);
    expect(first.unlinkHash).toBeNull();
    expect(first.manifest[0].sourceFiles).toEqual(['b.mp3']);

    const second = removeManifestSource(first.manifest, 'b.mp3');
    expect(second.changed).toBe(true);
    expect(second.unlinkHash).toBe('h1');
    expect(second.manifest).toEqual([]);
  });

  it('is a no-op for a filename no entry knows', () => {
    const before = [clip('h1', ['a.mp3'])];
    const { manifest, unlinkHash, changed } = removeManifestSource(before, 'zz.mp3');
    expect(changed).toBe(false);
    expect(unlinkHash).toBeNull();
    expect(manifest).toBe(before);
  });

  it('leaves unrelated entries untouched', () => {
    const before = [clip('h1', ['a.mp3']), clip('h2', ['x.mp3'])];
    const { manifest, unlinkHash } = removeManifestSource(before, 'a.mp3');
    expect(unlinkHash).toBe('h1');
    expect(manifest).toEqual([clip('h2', ['x.mp3'])]);
  });
});
