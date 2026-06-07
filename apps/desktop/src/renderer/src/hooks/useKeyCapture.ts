import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { toAccelerator } from '../lib/accelerator';

export function useKeyCapture(): {
  capturing: 'ptt' | 'mute' | null;
  startCapture: (target: 'ptt' | 'mute') => void;
  onRebindKey: (
    e: KeyboardEvent,
    onChangePtt: (k: string) => void,
    onChangeMute: (k: string) => void,
  ) => void;
} {
  const [capturing, setCapturing] = useState<'ptt' | 'mute' | null>(null);

  function startCapture(target: 'ptt' | 'mute'): void {
    setCapturing(target);
  }

  function onRebindKey(
    e: KeyboardEvent,
    onChangePtt: (k: string) => void,
    onChangeMute: (k: string) => void,
  ): void {
    e.preventDefault();
    const accel = toAccelerator(e);
    if (accel) {
      if (capturing === 'ptt') onChangePtt(accel);
      else if (capturing === 'mute') onChangeMute(accel);
      setCapturing(null);
    }
  }

  return { capturing, startCapture, onRebindKey };
}
