import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  nativeImage,
  session,
  shell,
} from 'electron';
import {
  PUBLIC_TURN_SERVERS,
  STUN_SERVERS,
  type PersistedSettings,
} from '@chickadee/shared';
import { loadSettings, saveSettings, getSettings } from './settings';
import { loadGamesList, startGameDetection, configureGameDetection } from './gameDetection';
import { registerPushToTalk, handleBeforeInput, setHotkeyMainWindow, stopHotkeys } from './hotkeys';
import { configureTray, setTrayMainWindow, destroyTray } from './tray';
import { configureScreenShare } from './screenShare';

// In dev, override userData per "instance slot" (default 0) so settings persist
// across restarts (a fixed dir) while two instances stay isolated — run a second
// one with CHICKADEE_INSTANCE=1. (A per-pid dir would lose settings every launch.)
// Packaged builds keep the real per-user userData.
if (!app.isPackaged) {
  const slot = process.env.CHICKADEE_INSTANCE ?? '0';
  app.setPath('userData', join(app.getPath('temp'), `chickadee-dev-${slot}`));
}

/**
 * Minimal .env loader (no dependency): walks up looking for a `.env` file and
 * sets any KEY=VALUE lines into process.env without overwriting existing vars.
 * Lets users configure signaling/TURN with a file in dev — or, for a packaged
 * (portable) build, by dropping a `.env` next to the `.exe`.
 */
function loadDotEnv(): void {
  // A portable exe runs from a temp extraction dir, so process.cwd() won't see a
  // `.env` placed beside the exe. Search the portable launch dir and the exe's
  // own dir (when packaged) first, then fall back to cwd (dev). First file wins.
  const bases = [
    process.env.PORTABLE_EXECUTABLE_DIR,
    app.isPackaged ? dirname(app.getPath('exe')) : undefined,
    process.cwd(),
  ].filter((d): d is string => Boolean(d));

  for (const base of bases) {
    let dir = base;
    for (let i = 0; i < 4; i++) {
      const candidate = join(dir, '.env');
      if (existsSync(candidate)) {
        for (const line of readFileSync(candidate, 'utf8').split(/\r?\n/)) {
          const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
          if (!match || line.trimStart().startsWith('#')) continue;
          const [, key, raw] = match;
          if (process.env[key] !== undefined) continue;
          const value = raw.replace(/^["']|["']$/g, '');
          process.env[key] = value;
        }
        return;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
}

interface AppConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
  settings: PersistedSettings;
  appVersion: string;
}

function buildConfig(): AppConfig {
  // Packaged builds default to the hosted signaling server; dev defaults to a
  // local server (npm run dev). Either can be overridden via env / a .env file.
  const signalingUrl =
    process.env.CHICKADEE_SIGNALING_URL ??
    process.env.VITE_SIGNALING_URL ??
    (app.isPackaged ? 'wss://chickadee-signaling.onrender.com' : 'ws://localhost:8080');

  const iceServers: RTCIceServer[] = [...STUN_SERVERS];
  const turnUrl = process.env.CHICKADEE_TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl.split(',').map((u) => u.trim()).filter(Boolean),
      username: process.env.CHICKADEE_TURN_USERNAME,
      credential: process.env.CHICKADEE_TURN_CREDENTIAL,
    });
  } else {
    iceServers.push(...PUBLIC_TURN_SERVERS);
  }
  return { signalingUrl, iceServers, settings: getSettings(), appVersion: app.getVersion() };
}

loadDotEnv();

const GRANTED_PERMISSIONS = new Set(['media', 'display-capture']);

function configureMediaPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(GRANTED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
    GRANTED_PERMISSIONS.has(permission),
  );
}

function registerWindowControls(): void {
  ipcMain.on('chickadee:window-minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on('chickadee:window-maximize-toggle', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('chickadee:window-close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
}

let mainWindow: BrowserWindow | null = null;
// Set when the app is genuinely quitting, so the close-to-tray handler knows to
// let the window actually close (vs. hiding it on a normal 'X' click).
let isQuitting = false;

function createWindow(): void {
  const config = buildConfig();

  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    alwaysOnTop: config.settings.alwaysOnTop,
    backgroundColor: '#06060f',
    title: 'Chickadee Chat',
    webPreferences: {
      // Main and preload are built as CommonJS (the package is not
      // "type": "module"), so the preload is index.js. Keeping these in sync
      // is essential — a wrong extension leaves window.chickadee undefined.
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Keep the renderer responsive (mic toggles, PTT) when unfocused/minimized.
      backgroundThrottling: false,
      // Pass runtime config to the preload synchronously via argv.
      additionalArguments: [`--chickadee-config=${JSON.stringify(config)}`],
    },
  });

  window.on('ready-to-show', () => window.show());

  // Close-to-tray: when the user's preference is 'tray' and we aren't quitting,
  // hide the window instead of closing it so voice stays connected in the
  // background. getSettings() reflects live changes from the renderer.
  window.on('close', (e) => {
    if (!isQuitting && getSettings().closeBehavior === 'tray') {
      e.preventDefault();
      window.hide();
    }
  });

  // Surface preload load failures (they would otherwise be silent).
  window.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error('preload-error', preloadPath, error);
  });

  // PTT and Mute fallback for when the window is in the foreground: uiohook-napi's global
  // hook doesn't fire while Chromium is the active window, so before-input-event
  // covers the in-focus case. pttIsHeld and muteIsHeld coordinate between the two
  // sources so only one sends the IPC message per physical press.
  window.webContents.on('before-input-event', (_event, input) => {
    handleBeforeInput(window, input);
  });

  // Open external links in the user's browser, never inside the app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
    setHotkeyMainWindow(null);
    setTrayMainWindow(null);
  });

  setHotkeyMainWindow(window);
  setTrayMainWindow(window);
  startGameDetection(window);
}

app.on('render-process-gone', (_e, _wc, details) => {
  console.error('render-process-gone', details);
});

app.whenReady().then(() => {
  loadSettings();
  loadGamesList();

  // Reconcile OS-level prefs with the persisted settings on launch.
  app.setLoginItemSettings({ openAtLogin: getSettings().launchOnStartup });

  ipcMain.handle('chickadee:save-settings', (_e, partial: Partial<PersistedSettings>) =>
    saveSettings(partial),
  );
  ipcMain.handle('chickadee:set-login-item', (_e, openAtLogin: boolean) => {
    app.setLoginItemSettings({ openAtLogin });
  });
  ipcMain.handle('chickadee:set-always-on-top', (_e, on: boolean) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(on);
  });
  ipcMain.handle('chickadee:write-clipboard', (_e, text: string) => {
    clipboard.writeText(text);
  });
  ipcMain.handle('chickadee:set-badge', (_e, count: number, dataUrl: string | null) => {
    if (process.platform === 'darwin') {
      app.setBadgeCount(count);
    }
    if (process.platform === 'win32') {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (count > 0 && dataUrl) {
          const image = nativeImage.createFromDataURL(dataUrl);
          mainWindow.setOverlayIcon(image, `${count} unread messages`);
        } else {
          mainWindow.setOverlayIcon(null, '');
        }
      }
    }
  });

  configureMediaPermissions();
  configureScreenShare();
  configureGameDetection();
  registerWindowControls();
  registerPushToTalk();
  configureTray();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  stopHotkeys();
  globalShortcut.unregisterAll();
  destroyTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
