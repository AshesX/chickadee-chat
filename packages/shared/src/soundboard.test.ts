import { describe, expect, it } from 'vitest';
import type { SoundboardCategory, SoundboardLibraryClip } from './protocol';
import {
  activeClips,
  canMoveClipToCategory,
  canShareCategory,
  computeSoundboardStats,
  deriveSharedClipMeta,
  sharedCategoryIds,
} from './soundboard';

function clip(hash: string, categoryId: string | null, overrides: Partial<SoundboardLibraryClip> = {}): SoundboardLibraryClip {
  return { hash, name: `clip-${hash}`, durationMs: 1000, sizeBytes: 1000, categoryId, ...overrides };
}

function category(id: string, shared: boolean, name = id): SoundboardCategory {
  return { id, name, shared };
}

describe('sharedCategoryIds', () => {
  it('returns only shared category ids', () => {
    const categories = [category('a', true), category('b', false), category('c', true)];
    expect(sharedCategoryIds(categories)).toEqual(new Set(['a', 'c']));
  });

  it('returns an empty set when nothing is shared', () => {
    expect(sharedCategoryIds([category('a', false)])).toEqual(new Set());
  });
});

describe('activeClips', () => {
  const categories = [category('shared1', true), category('unshared', false)];

  it('includes only clips in a shared category', () => {
    const clips = [clip('1', 'shared1'), clip('2', 'unshared'), clip('3', null)];
    expect(activeClips(clips, categories).map((c) => c.hash)).toEqual(['1']);
  });

  it('excludes uncategorized clips', () => {
    expect(activeClips([clip('1', null)], categories)).toEqual([]);
  });

  it('returns [] for an empty library', () => {
    expect(activeClips([], categories)).toEqual([]);
  });
});

describe('computeSoundboardStats', () => {
  it('counts active clips and shared categories independently', () => {
    const categories = [category('a', true), category('b', true), category('c', false)];
    const clips = [clip('1', 'a'), clip('2', 'a'), clip('3', 'b'), clip('4', 'c'), clip('5', null)];
    expect(computeSoundboardStats(clips, categories)).toEqual({ activeClipCount: 3, sharedCategoryCount: 2 });
  });

  it('returns zeros for an empty library', () => {
    expect(computeSoundboardStats([], [])).toEqual({ activeClipCount: 0, sharedCategoryCount: 0 });
  });
});

describe('deriveSharedClipMeta', () => {
  it('carries the category display name onto each shared clip', () => {
    const categories = [category('a', true, 'Party Sounds')];
    const clips = [clip('1', 'a', { name: 'Air Horn', durationMs: 500, sizeBytes: 200 })];
    expect(deriveSharedClipMeta(clips, categories)).toEqual([
      { hash: '1', name: 'Air Horn', durationMs: 500, sizeBytes: 200, category: 'Party Sounds' },
    ]);
  });

  it('excludes clips in unshared or nonexistent categories, and uncategorized clips', () => {
    const categories = [category('unshared', false, 'Unshared')];
    const clips = [clip('1', 'unshared'), clip('2', 'missing'), clip('3', null)];
    expect(deriveSharedClipMeta(clips, categories)).toEqual([]);
  });
});

describe('canShareCategory', () => {
  it('allows sharing when under both caps', () => {
    const categories = [category('a', false)];
    expect(canShareCategory([clip('1', 'a')], categories, 'a')).toEqual({ ok: true });
  });

  it('is a no-op success for an already-shared category', () => {
    const categories = [category('a', true)];
    expect(canShareCategory([], categories, 'a')).toEqual({ ok: true });
  });

  it('is a no-op success for a nonexistent category id', () => {
    expect(canShareCategory([], [], 'missing')).toEqual({ ok: true });
  });

  it('rejects when 2 categories are already shared', () => {
    const categories = [category('a', true), category('b', true), category('c', false)];
    expect(canShareCategory([], categories, 'c')).toEqual({ ok: false, reason: 'too-many-shared-categories' });
  });

  it('accepts exactly at the shared-category boundary (2)', () => {
    const categories = [category('a', true), category('b', false)];
    expect(canShareCategory([], categories, 'b')).toEqual({ ok: true });
  });

  it('rejects when the category itself would push active clips over 12', () => {
    const categories = [category('a', false)];
    const clips = Array.from({ length: 13 }, (_, i) => clip(String(i), 'a'));
    expect(canShareCategory(clips, categories, 'a')).toEqual({ ok: false, reason: 'too-many-active-clips' });
  });

  it('accepts exactly at the active-clip boundary (12)', () => {
    const categories = [category('a', false)];
    const clips = Array.from({ length: 12 }, (_, i) => clip(String(i), 'a'));
    expect(canShareCategory(clips, categories, 'a')).toEqual({ ok: true });
  });

  it('rejects when combined with an already-shared category it would exceed 12', () => {
    const categories = [category('a', true), category('b', false)];
    const clips = [
      ...Array.from({ length: 8 }, (_, i) => clip(`a${i}`, 'a')),
      ...Array.from({ length: 5 }, (_, i) => clip(`b${i}`, 'b')),
    ];
    expect(canShareCategory(clips, categories, 'b')).toEqual({ ok: false, reason: 'too-many-active-clips' });
  });
});

describe('canMoveClipToCategory', () => {
  it('always allows moving to Uncategorized (null)', () => {
    const categories = [category('a', true)];
    const clips = Array.from({ length: 12 }, (_, i) => clip(String(i), 'a'));
    expect(canMoveClipToCategory(clips, categories, '0', null)).toEqual({ ok: true });
  });

  it('always allows moving into an unshared category', () => {
    const categories = [category('a', false)];
    expect(canMoveClipToCategory([clip('1', null)], categories, '1', 'a')).toEqual({ ok: true });
  });

  it('allows moving into a shared category under the cap', () => {
    const categories = [category('a', true)];
    const clips = [...Array.from({ length: 5 }, (_, i) => clip(`a${i}`, 'a')), clip('x', null)];
    expect(canMoveClipToCategory(clips, categories, 'x', 'a')).toEqual({ ok: true });
  });

  it('rejects moving into a shared category at capacity', () => {
    const categories = [category('a', true)];
    const clips = [...Array.from({ length: 12 }, (_, i) => clip(`a${i}`, 'a')), clip('x', null)];
    expect(canMoveClipToCategory(clips, categories, 'x', 'a')).toEqual({ ok: false, reason: 'too-many-active-clips' });
  });

  it('is a no-op success when the clip is already in the destination category', () => {
    const categories = [category('a', true)];
    const clips = Array.from({ length: 12 }, (_, i) => clip(String(i), 'a'));
    expect(canMoveClipToCategory(clips, categories, '0', 'a')).toEqual({ ok: true });
  });

  it('is a no-op success for a nonexistent destination category', () => {
    expect(canMoveClipToCategory([clip('1', null)], [], '1', 'missing')).toEqual({ ok: true });
  });
});
