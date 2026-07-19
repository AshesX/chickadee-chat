// Pure hotkey logic: accelerator→code mapping and the hold/toggle edge
// decisions shared by the global uiohook listeners AND the in-focus
// before-input-event path (so the two can't drift). No electron/uiohook
// imports — the native UiohookKey map is passed in — so this is unit-testable.

/** Map an Electron accelerator key to a uiohook keycode via the given keymap (UiohookKey). */
export function acceleratorToKeyCode(accel: string, keymap: Record<string, number | undefined>): number | null {
  const arrowMap: Record<string, string> = {
    Up: 'ArrowUp',
    Down: 'ArrowDown',
    Left: 'ArrowLeft',
    Right: 'ArrowRight',
  };
  const name = arrowMap[accel] ?? accel;
  return keymap[name] ?? null;
}

/** Map an Electron accelerator key to a Chromium KeyboardEvent.code (for before-input-event). */
export function acceleratorToInputCode(accel: string): string {
  if (/^[A-Z]$/.test(accel)) return `Key${accel}`;
  if (/^[0-9]$/.test(accel)) return `Digit${accel}`;
  if (accel === 'Up') return 'ArrowUp';
  if (accel === 'Down') return 'ArrowDown';
  if (accel === 'Left') return 'ArrowLeft';
  if (accel === 'Right') return 'ArrowRight';
  return accel; // F1-F24, Space, Tab, Insert, Delete, Home, End match as-is
}

export interface HotkeyEdgeState {
  mode: 'hold' | 'toggle';
  isHeld: boolean;
  onStart?: string;
  onToggle: string;
  onStop?: string;
}

export interface HotkeyEdgeResult {
  /** IPC channel to send, or null (already-held repeat / toggle-mode key-up). */
  emit: string | null;
  /** The next isHeld value (suppresses OS key-repeat until key-up). */
  isHeld: boolean;
}

/** Key-down edge: hold mode emits onStart, toggle mode emits onToggle; repeats are swallowed. */
export function hotkeyKeyDown(hk: HotkeyEdgeState): HotkeyEdgeResult {
  if (hk.isHeld) return { emit: null, isHeld: true };
  return { emit: hk.mode === 'hold' && hk.onStart ? hk.onStart : hk.onToggle, isHeld: true };
}

/** Key-up edge: hold mode emits onStop; toggle mode emits nothing. */
export function hotkeyKeyUp(hk: HotkeyEdgeState): HotkeyEdgeResult {
  if (!hk.isHeld) return { emit: null, isHeld: false };
  return { emit: hk.mode === 'hold' && hk.onStop ? hk.onStop : null, isHeld: false };
}
