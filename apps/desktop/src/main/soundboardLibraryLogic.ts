import { extname } from 'node:path';
import type { SoundboardLibraryClip } from '@chickadee/shared';

/**
 * Pure decision logic for the soundboard inbox watcher + manifest — kept free
 * of any `electron`/filesystem import (mirrors windowSize.ts/hotkeyLogic.ts)
 * so it's unit-testable without mocking Electron; soundboardLibrary.ts owns
 * the fs.watch wiring and calls into these.
 */

export const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus', '.webm',
]);

/** True if `filename`'s extension looks like audio — filters Explorer noise (thumbs.db, .txt) before ffmpeg. */
export function isSupportedAudioFile(filename: string): boolean {
  return SUPPORTED_AUDIO_EXTENSIONS.has(extname(filename).toLowerCase());
}

/** How many consecutive stat polls must agree before ingest treats a file as fully written. */
export const STABLE_SAMPLES = 3;

/**
 * True once the last `requiredSamples` size polls agree on the same value —
 * i.e. the file has stopped growing. `fs.watch` fires on in-progress copies
 * too, so ingest waits for this before touching a file with ffmpeg.
 */
export function isSizeStable(history: number[], requiredSamples = STABLE_SAMPLES): boolean {
  if (history.length < requiredSamples) return false;
  const tail = history.slice(-requiredSamples);
  return tail.every((n) => n === tail[0]);
}

/** 'air-horn_02.wav' -> 'Air Horn 02' — a cosmetic display-name guess, not a slug/identity. */
export function deriveClipName(filename: string): string {
  const base = filename.replace(/\.[^./\\]+$/, '');
  const words = base.replace(/[_-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Sound';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// --- Manifest decisions (one entry per content hash; sourceFiles refcount) ---
//
// The manifest invariant is ONE entry per hash: hashes are the clip identity
// everywhere downstream (React keys, remove-by-hash IPC, P2P sync planning),
// so content-identical inbox files must SHARE an entry via `sourceFiles`
// rather than mint duplicates. Deletion only surrenders the cached bytes when
// the last source for that hash is gone — previously a duplicate's deletion
// unlinked the shared cache file and orphaned the survivor.

/**
 * Validate one persisted manifest entry against the current schema.
 * Null = drop the entry (no read-time migration — old shapes are handled by
 * the version-gated wipe, see main/versionGate.ts).
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
    !Array.isArray(v.sourceFiles)
  ) {
    return null;
  }
  const sourceFiles = v.sourceFiles.filter((f): f is string => typeof f === 'string' && f.length > 0);
  if (sourceFiles.length === 0) return null;
  const { hash, name, durationMs, sizeBytes } = v;
  return { hash, name, durationMs, sizeBytes, sourceFiles };
}

/**
 * Record that `filename`'s transcode produced content `meta.hash`: appends the
 * filename to the existing entry for that hash, or creates a new entry.
 * Returns the (possibly unchanged) manifest + whether anything changed.
 */
export function addManifestSource(
  manifest: SoundboardLibraryClip[],
  meta: { hash: string; name: string; durationMs: number; sizeBytes: number },
  filename: string,
): { manifest: SoundboardLibraryClip[]; changed: boolean } {
  const existing = manifest.find((c) => c.hash === meta.hash);
  if (!existing) {
    return { manifest: [...manifest, { ...meta, sourceFiles: [filename] }], changed: true };
  }
  if (existing.sourceFiles.includes(filename)) return { manifest, changed: false };
  return {
    manifest: manifest.map((c) =>
      c === existing ? { ...c, sourceFiles: [...c.sourceFiles, filename] } : c,
    ),
    changed: true,
  };
}

/**
 * Remove `filename` as a source: drops it from its entry's `sourceFiles`, and
 * drops the whole entry once no sources remain. `unlinkHash` is set ONLY in
 * that last-source case — the caller may then delete the cached bytes.
 */
export function removeManifestSource(
  manifest: SoundboardLibraryClip[],
  filename: string,
): { manifest: SoundboardLibraryClip[]; unlinkHash: string | null; changed: boolean } {
  const entry = manifest.find((c) => c.sourceFiles.includes(filename));
  if (!entry) return { manifest, unlinkHash: null, changed: false };
  const remaining = entry.sourceFiles.filter((f) => f !== filename);
  if (remaining.length === 0) {
    return { manifest: manifest.filter((c) => c !== entry), unlinkHash: entry.hash, changed: true };
  }
  return {
    manifest: manifest.map((c) => (c === entry ? { ...c, sourceFiles: remaining } : c)),
    unlinkHash: null,
    changed: true,
  };
}
