import { ipcMain } from 'electron';
import type { BrowserWindow, Input } from 'electron';
import { uIOhook, UiohookKey } from 'uiohook-napi';

let pttKeyCode: number | null = null;
let pttInputCode: string | null = null;
let pttCurrentMode: 'hold' | 'toggle' = 'hold';
let pttIsHeld = false;

let muteKeyCode: number | null = null;
let muteInputCode: string | null = null;
let muteCurrentMode: 'hold' | 'toggle' = 'toggle';
let muteIsHeld = false;

let uiohookRunning = false;
let mainWindow: BrowserWindow | null = null;

export function setHotkeyMainWindow(w: BrowserWindow | null): void {
  mainWindow = w;
}

function acceleratorToUiohookCode(accel: string): number | null {
  const arrowMap: Record<string, number> = {
    Up: UiohookKey.ArrowUp,
    Down: UiohookKey.ArrowDown,
    Left: UiohookKey.ArrowLeft,
    Right: UiohookKey.ArrowRight,
  };
  if (accel in arrowMap) return arrowMap[accel]!;
  const code = (UiohookKey as unknown as Record<string, number | undefined>)[accel];
  return code ?? null;
}

function acceleratorToInputCode(accel: string): string {
  if (/^[A-Z]$/.test(accel)) return `Key${accel}`;
  if (/^[0-9]$/.test(accel)) return `Digit${accel}`;
  if (accel === 'Up') return 'ArrowUp';
  if (accel === 'Down') return 'ArrowDown';
  if (accel === 'Left') return 'ArrowLeft';
  if (accel === 'Right') return 'ArrowRight';
  return accel; // F1-F24, Space, Tab, Insert, Delete, Home, End match as-is
}

function updateUiohookState(): void {
  const needsUiohook = pttKeyCode !== null || muteKeyCode !== null;
  if (needsUiohook && !uiohookRunning) {
    try {
      uIOhook.start();
      uiohookRunning = true;
    } catch (err) {
      console.error('failed to start uIOhook', err);
    }
  } else if (!needsUiohook && uiohookRunning) {
    try {
      uIOhook.stop();
      uiohookRunning = false;
    } catch (err) {
      console.error('failed to stop uIOhook', err);
    }
  }
}

export function registerPushToTalk(): void {
  // Listeners are registered once; pttKeyCode / muteKeyCode guards filter the target key.
  uIOhook.on('keydown', (e) => {
    if (pttKeyCode !== null && e.keycode === pttKeyCode && !pttIsHeld) {
      pttIsHeld = true; // suppress OS key-repeat: only fire on the first keydown
      mainWindow?.webContents.send(
        pttCurrentMode === 'hold' ? 'chickadee:ptt-start' : 'chickadee:ptt-toggle',
      );
    }
    if (muteKeyCode !== null && e.keycode === muteKeyCode && !muteIsHeld) {
      muteIsHeld = true; // suppress OS key-repeat
      mainWindow?.webContents.send(
        muteCurrentMode === 'hold' ? 'chickadee:mute-start' : 'chickadee:mute-toggle',
      );
    }
  });

  uIOhook.on('keyup', (e) => {
    if (pttKeyCode !== null && e.keycode === pttKeyCode && pttIsHeld) {
      pttIsHeld = false;
      if (pttCurrentMode === 'hold') mainWindow?.webContents.send('chickadee:ptt-stop');
    }
    if (muteKeyCode !== null && e.keycode === muteKeyCode && muteIsHeld) {
      muteIsHeld = false;
      if (muteCurrentMode === 'hold') mainWindow?.webContents.send('chickadee:mute-stop');
    }
  });

  ipcMain.handle(
    'chickadee:set-ptt',
    (_e, opts: { enabled: boolean; key: string; mode: 'hold' | 'toggle' }) => {
      pttKeyCode = opts.enabled ? acceleratorToUiohookCode(opts.key) : null;
      pttInputCode = opts.enabled ? acceleratorToInputCode(opts.key) : null;
      pttCurrentMode = opts.mode ?? 'hold';
      pttIsHeld = false;
      updateUiohookState();
      if (opts.enabled && pttKeyCode === null) {
        console.warn('push-to-talk: key not mapped to uiohook code:', opts.key);
      }
    },
  );

  ipcMain.handle(
    'chickadee:set-mute-keybind',
    (_e, opts: { enabled: boolean; key: string; mode: 'hold' | 'toggle' }) => {
      muteKeyCode = opts.enabled ? acceleratorToUiohookCode(opts.key) : null;
      muteInputCode = opts.enabled ? acceleratorToInputCode(opts.key) : null;
      muteCurrentMode = opts.mode ?? 'toggle';
      muteIsHeld = false;
      updateUiohookState();
      if (opts.enabled && muteKeyCode === null) {
        console.warn('mute-mic: key not mapped to uiohook code:', opts.key);
      }
    },
  );
}

export function handleBeforeInput(window: BrowserWindow, input: Input): void {
  if (pttInputCode && input.code === pttInputCode) {
    if (input.type === 'keyDown') {
      if (pttIsHeld) return; // uiohook fired first, or key is already held (OS repeat)
      if (input.isAutoRepeat) return;
      pttIsHeld = true;
      window.webContents.send(
        pttCurrentMode === 'hold' ? 'chickadee:ptt-start' : 'chickadee:ptt-toggle',
      );
    } else if (input.type === 'keyUp') {
      if (!pttIsHeld) return; // uiohook already handled this keyup
      pttIsHeld = false;
      if (pttCurrentMode === 'hold') window.webContents.send('chickadee:ptt-stop');
    }
  }

  if (muteInputCode && input.code === muteInputCode) {
    if (input.type === 'keyDown') {
      if (muteIsHeld) return;
      if (input.isAutoRepeat) return;
      muteIsHeld = true;
      window.webContents.send(
        muteCurrentMode === 'hold' ? 'chickadee:mute-start' : 'chickadee:mute-toggle',
      );
    } else if (input.type === 'keyUp') {
      if (!muteIsHeld) return;
      muteIsHeld = false;
      if (muteCurrentMode === 'hold') window.webContents.send('chickadee:mute-stop');
    }
  }
}

export function stopHotkeys(): void {
  if (uiohookRunning) {
    try { uIOhook.stop(); } catch { /* ignore */ }
    uiohookRunning = false;
  }
}
