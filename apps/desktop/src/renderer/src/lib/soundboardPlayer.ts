import { getMasterBus, getSharedAudioContext } from './audioContext';
import { getPresetUrl } from './soundboardAssets';

export type SoundboardClipSource = 'preset' | 'custom';

/** Decoded-clip cache, keyed by `${source}:${clipId}` (a preset id and a custom hash could theoretically collide otherwise). */
const decodedCache = new Map<string, AudioBuffer>();
const DECODED_CACHE_CAP = 24;

/**
 * Pure LRU trim: `Map` iterates in insertion order, so the oldest (least-
 * recently-touched, since callers re-insert on access) entries are simply the
 * first ones — drop from the front until `cache.size` is back at `cap`.
 */
export function evictOldest(cache: Map<string, AudioBuffer>, cap: number): void {
  while (cache.size > cap) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

async function loadClipBytes(clipId: string, source: SoundboardClipSource): Promise<ArrayBuffer | null> {
  if (source === 'preset') {
    const url = getPresetUrl(clipId);
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  }
  if (!window.chickadee) return null;
  const bytes = await window.chickadee.soundboard.cache.read(clipId);
  if (!bytes) return null;
  // Slice to the view's exact window — decodeAudioData wants just the clip's
  // own bytes, not whatever the underlying transport buffer happens to hold.
  // IPC-delivered bytes are always backed by a real ArrayBuffer (never SharedArrayBuffer).
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function getDecodedClip(
  ctx: AudioContext,
  clipId: string,
  source: SoundboardClipSource,
): Promise<AudioBuffer | null> {
  const cacheKey = `${source}:${clipId}`;
  const cached = decodedCache.get(cacheKey);
  if (cached) {
    // Touch: re-insert so this key reads as most-recently-used for evictOldest.
    decodedCache.delete(cacheKey);
    decodedCache.set(cacheKey, cached);
    return cached;
  }
  const bytes = await loadClipBytes(clipId, source);
  if (!bytes) return null;
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  }
  decodedCache.set(cacheKey, buffer);
  evictOldest(decodedCache, DECODED_CACHE_CAP);
  return buffer;
}

/**
 * Play a soundboard clip locally: decode (cached after the first play) and
 * route through a per-trigger gain node into the shared master bus — the
 * same limiter every peer voice and SFX already connects to, so this mixes
 * cleanly with live voice without any new mixing logic. Never touches the
 * mic-capture graph, so it can't be sent as outbound voice.
 */
export async function playClip(clipId: string, source: SoundboardClipSource, cueVolume: number): Promise<void> {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  const buffer = await getDecodedClip(ctx, clipId, source);
  if (!buffer) return;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(Math.max(0, cueVolume), ctx.currentTime);
  src.connect(gain);
  gain.connect(getMasterBus() ?? ctx.destination);
  src.start();
}
