import { describe, expect, it } from 'vitest';
import type { SoundboardLibraryClip } from '@chickadee/shared';
import { addManifestClip, deriveClipName, normalizeManifestEntry } from './soundboardLibraryLogic';

const clip = (hash: string, name = 'Clip'): SoundboardLibraryClip => ({
  hash,
  name,
  durationMs: 1000,
  sizeBytes: 80_000,
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

  it('accepts a well-formed entry', () => {
    expect(normalizeManifestEntry(base)).toEqual(base);
  });

  it('rejects entries missing required fields or with wrong types', () => {
    expect(normalizeManifestEntry(null)).toBeNull();
    expect(normalizeManifestEntry({ ...base, hash: 5 })).toBeNull();
    expect(normalizeManifestEntry({ name: 'Clip', durationMs: 1000, sizeBytes: 80_000 })).toBeNull();
    expect(normalizeManifestEntry({ ...base, durationMs: '1000' })).toBeNull();
  });
});

describe('addManifestClip', () => {
  it('adds a new entry for an unseen hash', () => {
    const { manifest, changed } = addManifestClip([], clip('h1'));
    expect(changed).toBe(true);
    expect(manifest).toEqual([clip('h1')]);
  });

  it('is a no-op when the hash already exists, regardless of a different name', () => {
    const before = [clip('h1', 'Old Name')];
    const { manifest, changed } = addManifestClip(before, clip('h1', 'New Name'));
    expect(changed).toBe(false);
    expect(manifest).toBe(before);
  });

  it('leaves unrelated entries untouched', () => {
    const before = [clip('h1')];
    const { manifest } = addManifestClip(before, clip('h2'));
    expect(manifest).toEqual([clip('h1'), clip('h2')]);
  });
});
