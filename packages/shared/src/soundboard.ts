import type { SoundboardCategory, SoundboardClipMeta, SoundboardLibraryClip } from './protocol';
import { MAX_ACTIVE_SOUNDBOARD_CLIPS, MAX_SHARED_SOUNDBOARD_CATEGORIES } from './sanitize';

/**
 * Pure cap/derivation math for the soundboard category model — the single
 * source of truth shared by the main-process library (which enforces these
 * caps on every mutation) and the renderer UI (which proactively disables
 * actions that would violate them), so the two can never disagree. Sharing
 * is whole-category (SoundboardCategory.shared), not per-clip: a category's
 * clips are either all advertised to peers or none of them are.
 */

/** Ceiling on a user's total LOCAL clip count, regardless of category/shared state — enforced on ingest, never wire-visible. */
export const MAX_LOCAL_SOUNDBOARD_CLIPS = 48;

/** Ceiling on total categories a user may create, regardless of shared state — local-only (organization), not wire-enforced. */
export const MAX_SOUNDBOARD_CATEGORIES_TOTAL = 16;

export function sharedCategoryIds(categories: readonly SoundboardCategory[]): Set<string> {
  return new Set(categories.filter((c) => c.shared).map((c) => c.id));
}

/** Clips belonging to a currently-shared category — what's both advertised to peers and shown in the trigger popover. */
export function activeClips(
  clips: readonly SoundboardLibraryClip[],
  categories: readonly SoundboardCategory[],
): SoundboardLibraryClip[] {
  const shared = sharedCategoryIds(categories);
  return clips.filter((c) => c.categoryId !== null && shared.has(c.categoryId));
}

export interface SoundboardStats {
  activeClipCount: number;
  sharedCategoryCount: number;
}

export function computeSoundboardStats(
  clips: readonly SoundboardLibraryClip[],
  categories: readonly SoundboardCategory[],
): SoundboardStats {
  return {
    activeClipCount: activeClips(clips, categories).length,
    sharedCategoryCount: categories.filter((c) => c.shared).length,
  };
}

/** The wire manifest to advertise: only clips in shared categories, each carrying its category's display name. */
export function deriveSharedClipMeta(
  clips: readonly SoundboardLibraryClip[],
  categories: readonly SoundboardCategory[],
): SoundboardClipMeta[] {
  const byId = new Map(categories.map((c) => [c.id, c] as const));
  const out: SoundboardClipMeta[] = [];
  for (const clip of clips) {
    if (clip.categoryId === null) continue;
    const category = byId.get(clip.categoryId);
    if (!category || !category.shared) continue;
    out.push({ hash: clip.hash, name: clip.name, durationMs: clip.durationMs, sizeBytes: clip.sizeBytes, category: category.name });
  }
  return out;
}

export type SoundboardCapError = 'too-many-shared-categories' | 'too-many-active-clips';

/**
 * Would sharing `categoryId` (currently unshared) violate either cap?
 * Simulates the flip: the category itself must not push shared-category
 * count past MAX_SHARED_SOUNDBOARD_CATEGORIES, and its clips must not push
 * the active-clip total past MAX_ACTIVE_SOUNDBOARD_CLIPS.
 */
export function canShareCategory(
  clips: readonly SoundboardLibraryClip[],
  categories: readonly SoundboardCategory[],
  categoryId: string,
): { ok: true } | { ok: false; reason: SoundboardCapError } {
  const target = categories.find((c) => c.id === categoryId);
  if (!target || target.shared) return { ok: true };

  const currentSharedCount = categories.filter((c) => c.shared).length;
  if (currentSharedCount >= MAX_SHARED_SOUNDBOARD_CATEGORIES) {
    return { ok: false, reason: 'too-many-shared-categories' };
  }

  const currentActive = activeClips(clips, categories).length;
  const thisCategoryClipCount = clips.filter((c) => c.categoryId === categoryId).length;
  if (currentActive + thisCategoryClipCount > MAX_ACTIVE_SOUNDBOARD_CLIPS) {
    return { ok: false, reason: 'too-many-active-clips' };
  }

  return { ok: true };
}

/**
 * Would moving `hash` into `categoryId` (null = Uncategorized) violate the
 * active-clip cap? Only the destination matters — leaving a shared category
 * (including for Uncategorized/null) or moving between two unshared
 * categories can only hold or decrease the active total, never increase it.
 * A move can never trip the shared-category-COUNT cap (it never creates or
 * removes a category).
 */
export function canMoveClipToCategory(
  clips: readonly SoundboardLibraryClip[],
  categories: readonly SoundboardCategory[],
  hash: string,
  categoryId: string | null,
): { ok: true } | { ok: false; reason: 'too-many-active-clips' } {
  if (categoryId === null) return { ok: true };
  const dest = categories.find((c) => c.id === categoryId);
  if (!dest || !dest.shared) return { ok: true };

  const clip = clips.find((c) => c.hash === hash);
  const alreadyCounted = clip?.categoryId === categoryId;
  if (alreadyCounted) return { ok: true };

  const currentActive = activeClips(clips, categories).length;
  if (currentActive + 1 > MAX_ACTIVE_SOUNDBOARD_CLIPS) {
    return { ok: false, reason: 'too-many-active-clips' };
  }
  return { ok: true };
}
