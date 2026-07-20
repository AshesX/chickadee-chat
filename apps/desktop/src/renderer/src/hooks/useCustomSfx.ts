import { useCallback, useEffect, useState } from 'react';
import type { CustomSfxSlot } from '@chickadee/shared';
import { getSharedAudioContext } from '../lib/audioContext';
import { loadAndDecodeSlot } from '../lib/customSfxPlayer';
import { SFX_SLOTS, playSfx, setCustomSfxBuffer } from '../lib/sfx';
import { useAutoClearError } from './useAutoClearError';

export interface CustomSfx {
  /** Which of the 11 toggle-group slots currently have a custom sound. */
  customSfxSlots: CustomSfxSlot[];
  /** Slot with an in-flight "Choose file" pick (dialog + ffmpeg transcode). */
  customSfxBusySlot: CustomSfxSlot | null;
  /** Transient error from a failed pick (e.g. an unprocessable file), auto-clears. */
  customSfxError: string | null;
  chooseFile: (slot: CustomSfxSlot) => void;
  resetSlot: (slot: CustomSfxSlot) => void;
  previewSlot: (slot: CustomSfxSlot, volume: number) => void;
}

/**
 * Owns the Settings-facing state for local per-cue SFX customization: which
 * slots are set, decoding their bytes into lib/sfx.ts's playback registry,
 * and the choose/reset/preview actions. Purely local — no P2P/signaling
 * involvement, unlike the very similarly-shaped useSoundboardLibrary.
 */
export function useCustomSfx(): CustomSfx {
  const [customSfxSlots, setCustomSfxSlots] = useState<CustomSfxSlot[]>([]);
  const [busySlot, setBusySlot] = useState<CustomSfxSlot | null>(null);
  const [error, setError] = useAutoClearError();

  const hydrateSlot = useCallback(async (slot: CustomSfxSlot): Promise<void> => {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    setCustomSfxBuffer(slot, await loadAndDecodeSlot(ctx, slot));
  }, []);

  // Mount-time snapshot of which slots already have a custom sound (survives
  // across app restarts, since the files themselves are the source of truth).
  useEffect(() => {
    if (!window.chickadee) return;
    let cancelled = false;
    void window.chickadee.customSfx.listSlots().then((slots) => {
      if (cancelled) return;
      setCustomSfxSlots(slots);
      for (const slot of slots) void hydrateSlot(slot);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrateSlot]);

  const chooseFile = useCallback(
    (slot: CustomSfxSlot) => {
      if (!window.chickadee) return;
      setBusySlot(slot);
      void window.chickadee.customSfx.choose(slot).then(async (result) => {
        setBusySlot(null);
        if (!result) return; // dialog cancelled
        if ('error' in result) {
          setError(`Couldn't process that file: ${result.error}`);
          return;
        }
        await hydrateSlot(slot);
        setCustomSfxSlots((prev) => (prev.includes(slot) ? prev : [...prev, slot]));
      });
    },
    [hydrateSlot, setError],
  );

  const resetSlot = useCallback((slot: CustomSfxSlot) => {
    void window.chickadee?.customSfx.reset(slot).then(() => {
      setCustomSfxBuffer(slot, null);
      setCustomSfxSlots((prev) => prev.filter((s) => s !== slot));
    });
  }, []);

  // Plays the slot's first cue so the user can hear what they just picked,
  // over the exact same playback path (custom buffer or synth fallback) a
  // real trigger uses.
  const previewSlot = useCallback((slot: CustomSfxSlot, volume: number) => {
    playSfx(SFX_SLOTS[slot][0], volume);
  }, []);

  return {
    customSfxSlots,
    customSfxBusySlot: busySlot,
    customSfxError: error,
    chooseFile,
    resetSlot,
    previewSlot,
  };
}
