import type { CustomSfxSlot } from '@chickadee/shared';

/**
 * Reads one custom-SFX slot's processed bytes over IPC (see main/customSfx.ts)
 * and decodes them into a Web Audio `AudioBuffer`. Deliberately a small,
 * self-contained module rather than a refactor of lib/soundboardPlayer.ts —
 * the overlap is a few lines of decode wiring, not worth sharing an
 * abstraction with Soundboard's separately-tested LRU clip cache (which this
 * feature doesn't need: at most 11 slots exist, so nothing is ever evicted).
 */
export async function loadAndDecodeSlot(ctx: AudioContext, slot: CustomSfxSlot): Promise<AudioBuffer | null> {
  const bytes = await window.chickadee?.customSfx.read(slot);
  if (!bytes) return null;
  try {
    // IPC-delivered bytes are always backed by a real ArrayBuffer (never SharedArrayBuffer).
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return await ctx.decodeAudioData(buffer);
  } catch {
    return null;
  }
}
