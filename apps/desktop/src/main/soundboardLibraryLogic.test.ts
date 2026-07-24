import { describe, expect, it } from 'vitest';
import type { SoundboardCategory, SoundboardLibraryClip } from '@chickadee/shared';
import {
  addManifestClip,
  createCategory,
  deleteCategory,
  deriveClipName,
  moveClipToCategory,
  normalizeCategoryEntry,
  normalizeManifestEntry,
  reconcileOrphanCategories,
  renameCategory,
  renameClip,
  setCategoryShared,
} from './soundboardLibraryLogic';

const clip = (hash: string, categoryId: string | null = null, name = 'Clip'): SoundboardLibraryClip => ({
  hash,
  name,
  durationMs: 1000,
  sizeBytes: 80_000,
  categoryId,
});

const ingested = (hash: string, name = 'Clip') => ({ hash, name, durationMs: 1000, sizeBytes: 80_000 });

const category = (id: string, shared: boolean, name = id): SoundboardCategory => ({ id, name, shared });

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
  const base = { hash: 'h1', name: 'Clip', durationMs: 1000, sizeBytes: 80_000, categoryId: null };

  it('accepts a well-formed entry with categoryId: null', () => {
    expect(normalizeManifestEntry(base)).toEqual(base);
  });

  it('accepts a well-formed entry with a string categoryId', () => {
    const withCategory = { ...base, categoryId: 'cat1' };
    expect(normalizeManifestEntry(withCategory)).toEqual(withCategory);
  });

  it('rejects entries missing required fields or with wrong types', () => {
    expect(normalizeManifestEntry(null)).toBeNull();
    expect(normalizeManifestEntry({ ...base, hash: 5 })).toBeNull();
    expect(normalizeManifestEntry({ name: 'Clip', durationMs: 1000, sizeBytes: 80_000, categoryId: null })).toBeNull();
    expect(normalizeManifestEntry({ ...base, durationMs: '1000' })).toBeNull();
  });

  it('rejects a pre-category (old-shape) entry missing categoryId — the intended drop-on-load behavior, no migration', () => {
    const { categoryId: _categoryId, ...oldShape } = base;
    expect(normalizeManifestEntry(oldShape)).toBeNull();
  });

  it('rejects a non-string, non-null categoryId', () => {
    expect(normalizeManifestEntry({ ...base, categoryId: 5 })).toBeNull();
  });
});

describe('normalizeCategoryEntry', () => {
  it('accepts a well-formed entry', () => {
    expect(normalizeCategoryEntry({ id: 'c1', name: 'Party', shared: true })).toEqual({ id: 'c1', name: 'Party', shared: true });
  });

  it('rejects entries missing required fields or with wrong types', () => {
    expect(normalizeCategoryEntry(null)).toBeNull();
    expect(normalizeCategoryEntry({ id: 'c1', name: 'Party' })).toBeNull();
    expect(normalizeCategoryEntry({ id: 'c1', name: 'Party', shared: 'yes' })).toBeNull();
  });

  it('rejects an empty/whitespace-only name', () => {
    expect(normalizeCategoryEntry({ id: 'c1', name: '', shared: false })).toBeNull();
    expect(normalizeCategoryEntry({ id: 'c1', name: '   ', shared: false })).toBeNull();
  });

  it('trims and clamps an over-long name', () => {
    const entry = normalizeCategoryEntry({ id: 'c1', name: `  ${'x'.repeat(500)}  `, shared: false });
    expect(entry).not.toBeNull();
    expect(entry!.name.length).toBeLessThanOrEqual(40);
  });
});

describe('reconcileOrphanCategories', () => {
  it('nulls categoryId for clips referencing a category that no longer exists', () => {
    const clips = [clip('h1', 'gone'), clip('h2', 'kept')];
    const result = reconcileOrphanCategories(clips, [category('kept', false)]);
    expect(result).toEqual([clip('h1', null), clip('h2', 'kept')]);
  });

  it('leaves already-uncategorized clips and valid references untouched', () => {
    const clips = [clip('h1', null), clip('h2', 'kept')];
    const result = reconcileOrphanCategories(clips, [category('kept', false)]);
    expect(result).toEqual(clips);
  });
});

describe('addManifestClip', () => {
  it('adds a new entry, defaulting to Uncategorized (categoryId: null)', () => {
    const { manifest, changed } = addManifestClip([], ingested('h1'));
    expect(changed).toBe(true);
    expect(manifest).toEqual([clip('h1')]);
  });

  it('is a no-op when the hash already exists, regardless of a different name', () => {
    const before = [clip('h1', null, 'Old Name')];
    const { manifest, changed } = addManifestClip(before, ingested('h1', 'New Name'));
    expect(changed).toBe(false);
    expect(manifest).toBe(before);
  });

  it('leaves unrelated entries untouched', () => {
    const before = [clip('h1')];
    const { manifest } = addManifestClip(before, ingested('h2'));
    expect(manifest).toEqual([clip('h1'), clip('h2')]);
  });

  it('rejects a new clip once the library is at the max-clips cap', () => {
    const before = [clip('h1'), clip('h2')];
    const { manifest, changed, error } = addManifestClip(before, ingested('h3'), 2);
    expect(changed).toBe(false);
    expect(error).toBe('cap');
    expect(manifest).toBe(before);
  });

  it('still allows re-adding an existing hash at the cap (dedupe check runs first)', () => {
    const before = [clip('h1'), clip('h2')];
    const { manifest, changed, error } = addManifestClip(before, ingested('h1'), 2);
    expect(changed).toBe(false);
    expect(error).toBeUndefined();
    expect(manifest).toBe(before);
  });
});

describe('createCategory', () => {
  it('creates a new, initially-unshared category', () => {
    const result = createCategory([], 'c1', 'Party');
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.category).toEqual({ id: 'c1', name: 'Party', shared: false });
    expect(result.categories).toEqual([result.category]);
  });

  it('rejects an empty/whitespace-only name', () => {
    expect(createCategory([], 'c1', '')).toEqual({ error: 'invalid-name' });
    expect(createCategory([], 'c1', '   ')).toEqual({ error: 'invalid-name' });
  });

  it('rejects once the total-category ceiling is reached', () => {
    const existing = [category('a', false), category('b', false)];
    expect(createCategory(existing, 'c', 'New', 2)).toEqual({ error: 'too-many-categories' });
  });
});

describe('renameCategory', () => {
  it('renames an existing category', () => {
    const result = renameCategory([category('a', false, 'Old')], 'a', 'New');
    expect(result).toEqual([category('a', false, 'New')]);
  });

  it('rejects a nonexistent id', () => {
    expect(renameCategory([category('a', false)], 'missing', 'New')).toBeNull();
  });

  it('rejects an empty/whitespace-only name', () => {
    expect(renameCategory([category('a', false)], 'a', '')).toBeNull();
    expect(renameCategory([category('a', false)], 'a', '   ')).toBeNull();
  });
});

describe('deleteCategory', () => {
  it('removes the category and cascades its clips to Uncategorized', () => {
    const clips = [clip('h1', 'a'), clip('h2', 'a'), clip('h3', 'b')];
    const categories = [category('a', true), category('b', false)];
    const result = deleteCategory(clips, categories, 'a');
    expect(result.categories).toEqual([category('b', false)]);
    expect(result.clips).toEqual([clip('h1', null), clip('h2', null), clip('h3', 'b')]);
  });

  it('is a no-op for a nonexistent id', () => {
    const clips = [clip('h1', 'a')];
    const categories = [category('a', false)];
    const result = deleteCategory(clips, categories, 'missing');
    expect(result.clips).toEqual(clips);
    expect(result.categories).toEqual(categories);
  });

  it('is a no-op cascade for an empty category', () => {
    const clips = [clip('h1', 'b')];
    const categories = [category('a', false), category('b', false)];
    const result = deleteCategory(clips, categories, 'a');
    expect(result.clips).toEqual(clips);
    expect(result.categories).toEqual([category('b', false)]);
  });
});

describe('moveClipToCategory', () => {
  it('moves a clip to a new category, appended to the end', () => {
    const result = moveClipToCategory([clip('h1', null)], [category('a', false)], 'h1', 'a');
    expect(result).toEqual({ clips: [clip('h1', 'a')] });
  });

  it('moves a clip to Uncategorized', () => {
    const result = moveClipToCategory([clip('h1', 'a')], [category('a', false)], 'h1', null);
    expect(result).toEqual({ clips: [clip('h1', null)] });
  });

  it('is a no-op for a nonexistent hash', () => {
    const clips = [clip('h1', null)];
    const result = moveClipToCategory(clips, [category('a', false)], 'missing', 'a');
    expect(result).toEqual({ clips });
  });

  it('with no beforeHash, moves a clip to the END of the whole list (so also the end of its category once filtered) — true even when already in that category', () => {
    const clips = [clip('h1', 'a'), clip('h2', 'a'), clip('h3', 'b')];
    const result = moveClipToCategory(clips, [category('a', true), category('b', false)], 'h1', 'a');
    expect(result).toEqual({ clips: [clip('h2', 'a'), clip('h3', 'b'), clip('h1', 'a')] });
  });

  it('is a true no-op when moving to the same category immediately before itself', () => {
    const clips = [clip('h1', 'a'), clip('h2', 'a')];
    const result = moveClipToCategory(clips, [category('a', false)], 'h1', 'a', 'h1');
    expect(result).toEqual({ clips });
  });

  it('reorders within the same category by inserting before another clip', () => {
    const clips = [clip('h1', 'a'), clip('h2', 'a'), clip('h3', 'a')];
    const result = moveClipToCategory(clips, [category('a', false)], 'h3', 'a', 'h1');
    expect(result).toEqual({ clips: [clip('h3', 'a'), clip('h1', 'a'), clip('h2', 'a')] });
  });

  it('moves across categories AND positions it before a specific clip in the destination', () => {
    const clips = [clip('h1', 'a'), clip('h2', 'b'), clip('h3', 'b')];
    const result = moveClipToCategory(clips, [category('a', false), category('b', false)], 'h1', 'b', 'h3');
    expect(result).toEqual({ clips: [clip('h2', 'b'), clip('h1', 'b'), clip('h3', 'b')] });
  });

  it('falls back to appending at the end if beforeHash does not exist', () => {
    const clips = [clip('h1', 'a'), clip('h2', 'a')];
    const result = moveClipToCategory(clips, [category('a', false)], 'h1', 'a', 'missing');
    expect(result).toEqual({ clips: [clip('h2', 'a'), clip('h1', 'a')] });
  });

  it('rejects moving into a shared category at capacity', () => {
    const clips = [...Array.from({ length: 12 }, (_, i) => clip(`a${i}`, 'a')), clip('x', null)];
    const result = moveClipToCategory(clips, [category('a', true)], 'x', 'a');
    expect(result).toEqual({ error: 'too-many-active-clips' });
  });

  it('allows pure reordering within an already-full shared category (cap check treats it as already counted)', () => {
    const clips = Array.from({ length: 12 }, (_, i) => clip(String(i), 'a'));
    const result = moveClipToCategory(clips, [category('a', true)], '5', 'a', '0');
    expect('error' in result).toBe(false);
  });
});

describe('renameClip', () => {
  it('renames an existing clip', () => {
    const result = renameClip([clip('h1', null, 'Old')], 'h1', 'New');
    expect(result).toEqual([clip('h1', null, 'New')]);
  });

  it('rejects a nonexistent hash', () => {
    expect(renameClip([clip('h1')], 'missing', 'New')).toBeNull();
  });

  it('rejects an empty/whitespace-only name', () => {
    expect(renameClip([clip('h1')], 'h1', '')).toBeNull();
    expect(renameClip([clip('h1')], 'h1', '   ')).toBeNull();
  });

  it('trims and clamps an over-long name', () => {
    const result = renameClip([clip('h1')], 'h1', `  ${'x'.repeat(500)}  `);
    expect(result).not.toBeNull();
    expect(result![0].name.length).toBeLessThanOrEqual(80);
  });
});

describe('setCategoryShared', () => {
  it('shares a category under the caps', () => {
    const result = setCategoryShared([clip('h1', 'a')], [category('a', false)], 'a', true);
    expect(result).toEqual({ categories: [category('a', true)] });
  });

  it('rejects sharing a 3rd category', () => {
    const categories = [category('a', true), category('b', true), category('c', false)];
    const result = setCategoryShared([], categories, 'c', true);
    expect(result).toEqual({ error: 'too-many-shared-categories' });
  });

  it('rejects sharing a category that would push active clips over 12', () => {
    const clips = Array.from({ length: 13 }, (_, i) => clip(String(i), 'a'));
    const result = setCategoryShared(clips, [category('a', false)], 'a', true);
    expect(result).toEqual({ error: 'too-many-active-clips' });
  });

  it('always allows unsharing', () => {
    const clips = Array.from({ length: 20 }, (_, i) => clip(String(i), 'a'));
    const result = setCategoryShared(clips, [category('a', true)], 'a', false);
    expect(result).toEqual({ categories: [category('a', false)] });
  });
});
