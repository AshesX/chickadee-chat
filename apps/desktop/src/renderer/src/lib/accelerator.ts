import type { KeyboardEvent } from 'react';

/** Convert a React keydown event into an Electron accelerator string (single keys only). */
export function toAccelerator(e: KeyboardEvent): string | null {
  const k = e.key;
  if (k === ' ' || k === 'Spacebar') return 'Space';
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) return k;
  if (/^[a-zA-Z0-9]$/.test(k)) return k.toUpperCase();
  if (k === 'ArrowUp') return 'Up';
  if (k === 'ArrowDown') return 'Down';
  if (k === 'ArrowLeft') return 'Left';
  if (k === 'ArrowRight') return 'Right';
  if (k === 'Tab' || k === 'Insert' || k === 'Delete' || k === 'Home' || k === 'End') return k;
  // CapsLock works as a bind (UiohookKey.CapsLock for the global hook; 'CapsLock' matches
  // input.code for the focused path). Caveat: pressing it still toggles the OS Caps-Lock
  // state — we can't suppress that — so it's best used in toggle mode.
  if (k === 'CapsLock') return 'CapsLock';
  return null;
}
