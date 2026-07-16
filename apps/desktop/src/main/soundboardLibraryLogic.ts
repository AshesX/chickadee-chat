import { extname } from 'node:path';

/**
 * Pure decision logic for the soundboard inbox watcher — kept free of any
 * `electron`/filesystem import (mirrors windowSize.ts/hotkeyLogic.ts) so it's
 * unit-testable without mocking Electron; soundboardLibrary.ts owns the
 * fs.watch wiring and calls into these.
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
