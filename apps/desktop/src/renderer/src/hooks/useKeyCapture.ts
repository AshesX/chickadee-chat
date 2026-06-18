import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { toAccelerator } from '../lib/accelerator';

export function useKeyCapture(): {
  capturing: string | null;
  startCapture: (target: string) => void;
  onRebindKey: (
    e: KeyboardEvent,
    onChange: (k: string) => void,
  ) => void;
} {
  const [capturing, setCapturing] = useState<string | null>(null);

  function startCapture(target: string): void {
    setCapturing(target);
  }

  function onRebindKey(
    e: KeyboardEvent,
    onChange: (k: string) => void,
  ): void {
    e.preventDefault();
    const accel = toAccelerator(e);
    if (accel) {
      onChange(accel);
      setCapturing(null);
    }
  }

  return { capturing, startCapture, onRebindKey };
}
