import { ipcMain } from 'electron';
import type { BrowserWindow, Input } from 'electron';
import { uIOhook, UiohookKey } from 'uiohook-napi';

interface HotkeyState {
  keyCode: number | null;
  inputCode: string | null;
  mode: 'hold' | 'toggle';
  isHeld: boolean;
  onStart?: string;
  onToggle: string;
  onStop?: string;
}

const hotkeys: Record<string, HotkeyState> = {
  ptt: { keyCode: null, inputCode: null, mode: 'hold', isHeld: false, onStart: 'chickadee:ptt-start', onToggle: 'chickadee:ptt-toggle', onStop: 'chickadee:ptt-stop' },
  mute: { keyCode: null, inputCode: null, mode: 'toggle', isHeld: false, onStart: 'chickadee:mute-start', onToggle: 'chickadee:mute-toggle', onStop: 'chickadee:mute-stop' },
  deafen: { keyCode: null, inputCode: null, mode: 'toggle', isHeld: false, onStart: 'chickadee:deafen-start', onToggle: 'chickadee:deafen-toggle', onStop: 'chickadee:deafen-stop' },
  camera: { keyCode: null, inputCode: null, mode: 'toggle', isHeld: false, onToggle: 'chickadee:camera-toggle' },
  screenShare: { keyCode: null, inputCode: null, mode: 'toggle', isHeld: false, onToggle: 'chickadee:screen-share-toggle' },
  chatPanel: { keyCode: null, inputCode: null, mode: 'toggle', isHeld: false, onToggle: 'chickadee:chat-panel-toggle' },
  ttsToggle: { keyCode: null, inputCode: null, mode: 'toggle', isHeld: false, onToggle: 'chickadee:tts-toggle' },
  ttsStop: { keyCode: null, inputCode: null, mode: 'toggle', isHeld: false, onToggle: 'chickadee:tts-stop' },
};

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
  const needsUiohook = Object.values(hotkeys).some((hk) => hk.keyCode !== null);
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
  // Listeners are registered once.
  uIOhook.on('keydown', (e) => {
    for (const hk of Object.values(hotkeys)) {
      if (hk.keyCode !== null && e.keycode === hk.keyCode && !hk.isHeld) {
        hk.isHeld = true; // suppress OS key-repeat
        const eventName = hk.mode === 'hold' && hk.onStart ? hk.onStart : hk.onToggle;
        mainWindow?.webContents.send(eventName);
      }
    }
  });

  uIOhook.on('keyup', (e) => {
    for (const hk of Object.values(hotkeys)) {
      if (hk.keyCode !== null && e.keycode === hk.keyCode && hk.isHeld) {
        hk.isHeld = false;
        if (hk.mode === 'hold' && hk.onStop) {
          mainWindow?.webContents.send(hk.onStop);
        }
      }
    }
  });

  const registerHotkeyIpc = (channel: string, key: string, defaultMode: 'hold' | 'toggle') => {
    ipcMain.handle(
      channel,
      (_e, opts: { enabled: boolean; key: string; mode?: 'hold' | 'toggle' }) => {
        const hk = hotkeys[key];
        hk.keyCode = opts.enabled ? acceleratorToUiohookCode(opts.key) : null;
        hk.inputCode = opts.enabled ? acceleratorToInputCode(opts.key) : null;
        hk.mode = opts.mode ?? defaultMode;
        hk.isHeld = false;
        updateUiohookState();
        if (opts.enabled && hk.keyCode === null) {
          console.warn(`${key}: key not mapped to uiohook code:`, opts.key);
        }
      },
    );
  };

  registerHotkeyIpc('chickadee:set-ptt', 'ptt', 'hold');
  registerHotkeyIpc('chickadee:set-mute-keybind', 'mute', 'toggle');
  registerHotkeyIpc('chickadee:set-deafen-keybind', 'deafen', 'toggle');
  registerHotkeyIpc('chickadee:set-camera-keybind', 'camera', 'toggle');
  registerHotkeyIpc('chickadee:set-screen-share-keybind', 'screenShare', 'toggle');
  registerHotkeyIpc('chickadee:set-chat-panel-keybind', 'chatPanel', 'toggle');
  registerHotkeyIpc('chickadee:set-tts-toggle-keybind', 'ttsToggle', 'toggle');
  registerHotkeyIpc('chickadee:set-tts-stop-keybind', 'ttsStop', 'toggle');
}

export function handleBeforeInput(window: BrowserWindow, input: Input): void {
  for (const hk of Object.values(hotkeys)) {
    if (hk.inputCode && input.code === hk.inputCode) {
      if (input.type === 'keyDown') {
        if (hk.isHeld) continue;
        if (input.isAutoRepeat) continue;
        hk.isHeld = true;
        const eventName = hk.mode === 'hold' && hk.onStart ? hk.onStart : hk.onToggle;
        window.webContents.send(eventName);
      } else if (input.type === 'keyUp') {
        if (!hk.isHeld) continue;
        hk.isHeld = false;
        if (hk.mode === 'hold' && hk.onStop) {
          window.webContents.send(hk.onStop);
        }
      }
    }
  }
}

export function stopHotkeys(): void {
  if (uiohookRunning) {
    try { uIOhook.stop(); } catch { /* ignore */ }
    uiohookRunning = false;
  }
}
