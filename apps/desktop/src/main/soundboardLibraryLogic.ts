import type { SoundboardLibraryClip } from '@chickadee/shared';

/**
 * Pure decision logic for the soundboard manifest — kept free of any
 * `electron`/filesystem import (mirrors windowSize.ts/hotkeyLogic.ts) so it's
 * unit-testable without mocking Electron; soundboardLibrary.ts owns the
 * ffmpeg/IPC wiring and calls into these.
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
    typeof v.sizeBytes !== 'number'
  ) {
    return null;
  }
  const { hash, name, durationMs, sizeBytes } = v;
  return { hash, name, durationMs, sizeBytes };
}

/**
 * Add `clip` to the manifest unless its hash is already present (re-adding
 * the "same" content shouldn't create a second library row).
 */
export function addManifestClip(
  manifest: SoundboardLibraryClip[],
  clip: SoundboardLibraryClip,
): { manifest: SoundboardLibraryClip[]; changed: boolean } {
  if (manifest.some((c) => c.hash === clip.hash)) return { manifest, changed: false };
  return { manifest: [...manifest, clip], changed: true };
}
