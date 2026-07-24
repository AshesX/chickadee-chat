import type { SoundboardCategory, SoundboardLibraryClip } from '@chickadee/shared';
import {
  MAX_LOCAL_SOUNDBOARD_CLIPS,
  MAX_SOUNDBOARD_CATEGORIES_TOTAL,
  MAX_SOUNDBOARD_CATEGORY_NAME_LEN,
  MAX_SOUNDBOARD_CLIP_NAME_LEN,
  canMoveClipToCategory,
  canShareCategory,
  clampString,
} from '@chickadee/shared';

/**
 * Pure decision logic for the soundboard manifest — kept free of any
 * `electron`/filesystem import (mirrors windowSize.ts/hotkeyLogic.ts) so it's
 * unit-testable without mocking Electron; soundboardLibrary.ts owns the
 * ffmpeg/IPC wiring and calls into these. The active-clip/shared-category cap
 * math itself lives in @chickadee/shared's soundboard.ts (canShareCategory /
 * canMoveClipToCategory) so this file and the renderer's proactive-disable
 * UI can never disagree — this file only owns persistence-shape validation
 * and the mutations that delegate to those cap checks.
 */

export const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus', '.webm',
]);

/** 'air-horn_02.wav' -> 'Air Horn 02' — a cosmetic display-name guess, not a slug/identity. */
export function deriveClipName(filename: string): string {
  const base = filename.replace(/\.[^./\\]+$/, '');
  const words = base.replace(/[_-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Sound';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// --- Manifest decisions (one entry per content hash) ---
//
// The manifest invariant is ONE entry per hash: hashes are the clip identity
// everywhere downstream (React keys, remove-by-hash IPC, P2P sync planning),
// so re-adding content that's already in the library is a silent no-op
// rather than minting a duplicate row.

/**
 * Validate one persisted manifest entry against the current schema.
 * Null = drop the entry (an invalid/legacy shape is simply dropped, not
 * migrated — this is also what makes an old pre-category manifest entry,
 * which has no `categoryId` field, disappear cleanly on load).
 */
export function normalizeManifestEntry(value: unknown): SoundboardLibraryClip | null {
  const v = value as Partial<SoundboardLibraryClip> | null;
  if (
    !v ||
    typeof v !== 'object' ||
    typeof v.hash !== 'string' ||
    typeof v.name !== 'string' ||
    typeof v.durationMs !== 'number' ||
    typeof v.sizeBytes !== 'number' ||
    (typeof v.categoryId !== 'string' && v.categoryId !== null)
  ) {
    return null;
  }
  const { hash, name, durationMs, sizeBytes, categoryId } = v;
  return { hash, name, durationMs, sizeBytes, categoryId };
}

/**
 * Validate one persisted category entry against the current schema. Null =
 * drop the entry. An empty/whitespace-only name is treated as invalid —
 * dropping the category also orphans its clips, which `reconcileOrphanCategories`
 * cleans up right after this runs at load time.
 */
export function normalizeCategoryEntry(value: unknown): SoundboardCategory | null {
  const v = value as Partial<SoundboardCategory> | null;
  if (!v || typeof v !== 'object' || typeof v.id !== 'string' || typeof v.name !== 'string' || typeof v.shared !== 'boolean') {
    return null;
  }
  const name = clampString(v.name, MAX_SOUNDBOARD_CATEGORY_NAME_LEN);
  if (!name) return null;
  return { id: v.id, name, shared: v.shared };
}

/**
 * Null out any clip's `categoryId` that no longer matches a surviving
 * category (e.g. the category row failed validation and was dropped) —
 * corrupted category metadata shouldn't destroy the clip itself, unlike a
 * corrupted clip entry which normalizeManifestEntry drops outright.
 */
export function reconcileOrphanCategories(
  clips: SoundboardLibraryClip[],
  categories: SoundboardCategory[],
): SoundboardLibraryClip[] {
  const ids = new Set(categories.map((c) => c.id));
  return clips.map((c) => (c.categoryId !== null && !ids.has(c.categoryId) ? { ...c, categoryId: null } : c));
}

/**
 * Add a freshly-ingested clip to the manifest unless its hash is already
 * present (re-adding the "same" content shouldn't create a second library
 * row) or the local library is already at capacity. New clips always land
 * Uncategorized (`categoryId: null`) — ingest doesn't ask up front, matching
 * the existing "pick files, organize afterward" flow.
 */
export function addManifestClip(
  manifest: SoundboardLibraryClip[],
  clip: { hash: string; name: string; durationMs: number; sizeBytes: number },
  maxClips: number = MAX_LOCAL_SOUNDBOARD_CLIPS,
): { manifest: SoundboardLibraryClip[]; changed: boolean; error?: 'cap' } {
  if (manifest.some((c) => c.hash === clip.hash)) return { manifest, changed: false };
  if (manifest.length >= maxClips) return { manifest, changed: false, error: 'cap' };
  return { manifest: [...manifest, { ...clip, categoryId: null }], changed: true };
}

// --- Category decisions ---

/**
 * Create a new, initially-unshared category. Rejects an empty/whitespace-only
 * name or once the total-category ceiling is reached (organization headroom,
 * unrelated to the much smaller shared/active caps).
 */
export function createCategory(
  categories: SoundboardCategory[],
  id: string,
  name: unknown,
  maxCategories: number = MAX_SOUNDBOARD_CATEGORIES_TOTAL,
): { categories: SoundboardCategory[]; category: SoundboardCategory } | { error: 'invalid-name' | 'too-many-categories' } {
  const clamped = clampString(name, MAX_SOUNDBOARD_CATEGORY_NAME_LEN);
  if (!clamped) return { error: 'invalid-name' };
  if (categories.length >= maxCategories) return { error: 'too-many-categories' };
  const category: SoundboardCategory = { id, name: clamped, shared: false };
  return { categories: [...categories, category], category };
}

/** Rename a category. Null = rejected (unknown id, or empty/whitespace-only name). */
export function renameCategory(categories: SoundboardCategory[], id: string, name: unknown): SoundboardCategory[] | null {
  const clamped = clampString(name, MAX_SOUNDBOARD_CATEGORY_NAME_LEN);
  if (!clamped) return null;
  if (!categories.some((c) => c.id === id)) return null;
  return categories.map((c) => (c.id === id ? { ...c, name: clamped } : c));
}

/**
 * Delete a category, cascading its member clips to Uncategorized
 * (`categoryId: null`) rather than deleting the clips themselves. A
 * nonexistent id is a silent no-op, not an error.
 */
export function deleteCategory(
  clips: SoundboardLibraryClip[],
  categories: SoundboardCategory[],
  id: string,
): { clips: SoundboardLibraryClip[]; categories: SoundboardCategory[] } {
  return {
    clips: clips.map((c) => (c.categoryId === id ? { ...c, categoryId: null } : c)),
    categories: categories.filter((c) => c.id !== id),
  };
}

/**
 * Move a clip to a (possibly null/Uncategorized) category — and, since drag
 * position IS clip order (the global array's order is what every
 * category-filtered view renders in), optionally reposition it too — subject
 * to the shared active-clip cap when the destination is itself shared. A
 * nonexistent hash is a silent no-op. `beforeHash: null` means "append to the
 * end" (of the destination category, which for a global-array append is the
 * same thing, since everything already in that category keeps its relative
 * order); a given `beforeHash` inserts immediately before that clip —
 * `beforeHash` need not belong to the destination category (a caller
 * dropping onto a specific row already knows it does).
 */
export function moveClipToCategory(
  clips: SoundboardLibraryClip[],
  categories: SoundboardCategory[],
  hash: string,
  categoryId: string | null,
  beforeHash: string | null = null,
): { clips: SoundboardLibraryClip[] } | { error: 'too-many-active-clips' } {
  const check = canMoveClipToCategory(clips, categories, hash, categoryId);
  if (!check.ok) return { error: check.reason };
  const clip = clips.find((c) => c.hash === hash);
  if (!clip || hash === beforeHash) return { clips };
  const moved: SoundboardLibraryClip = { ...clip, categoryId };
  const rest = clips.filter((c) => c.hash !== hash);
  const insertAt = beforeHash === null ? rest.length : rest.findIndex((c) => c.hash === beforeHash);
  const at = insertAt === -1 ? rest.length : insertAt;
  return { clips: [...rest.slice(0, at), moved, ...rest.slice(at)] };
}

/** Rename a clip. Null = rejected (unknown hash, or empty/whitespace-only name). */
export function renameClip(clips: SoundboardLibraryClip[], hash: string, name: unknown): SoundboardLibraryClip[] | null {
  const clamped = clampString(name, MAX_SOUNDBOARD_CLIP_NAME_LEN);
  if (!clamped) return null;
  if (!clips.some((c) => c.hash === hash)) return null;
  return clips.map((c) => (c.hash === hash ? { ...c, name: clamped } : c));
}

/**
 * Toggle a category's whole-category share state. Sharing is capped
 * (delegates to @chickadee/shared's canShareCategory); unsharing always
 * succeeds, since retracting a category can only decrease both caps.
 */
export function setCategoryShared(
  clips: SoundboardLibraryClip[],
  categories: SoundboardCategory[],
  id: string,
  shared: boolean,
): { categories: SoundboardCategory[] } | { error: 'too-many-shared-categories' | 'too-many-active-clips' } {
  if (shared) {
    const check = canShareCategory(clips, categories, id);
    if (!check.ok) return { error: check.reason };
  }
  return { categories: categories.map((c) => (c.id === id ? { ...c, shared } : c)) };
}
