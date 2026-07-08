import { join } from 'node:path';
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
import { type PersistedSettings } from '@chickadee/shared';
import { loadSettings, saveSettings, getSettings } from './settings';
import { loadDotEnv, buildConfig } from './config';
import {
  COMPACT_MAX_WIDTH,
  COMPACT_MIN_HEIGHT,
  COMPACT_MIN_WIDTH,
  COMPACT_WIDTH,
  DEFAULT_FULL_WIDTH,
  DEFAULT_HEIGHT,
  NORMAL_MIN_HEIGHT,
  NORMAL_MIN_WIDTH,
  clampCompactWidth,
} from './windowSize';
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

// Sidebar-only "compact mode" (dock-style window): tracked here so the resize
// handler and createWindow()'s initial sizing branch agree on the current state.
let isCompact = false;
// Full-view width remembered on entering compact, so expanding restores the
// wide layout. Height is intentionally NOT saved — it stays continuous across
// the compact↔full transition (full view adopts whatever height the user left
// the dock at).
let savedFullWidth: number | null = null;
let wasMaximized = false;

function registerWindowControls(): void {
  ipcMain.on('chickadee:window-minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on('chickadee:window-maximize-toggle', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('chickadee:window-close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
  ipcMain.on('chickadee:window-set-compact', (e, compact: boolean, compactWidth?: number) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || compact === isCompact) return;
    isCompact = compact;
    if (compact) {
      wasMaximized = win.isMaximized();
      if (wasMaximized) win.unmaximize();
      const bounds = win.getBounds();
      savedFullWidth = bounds.width;
      // Dock is resizable (height + width), but width is capped at 200%.
      // NOTE: the window is already resizable (constructor) and we never toggle
      // it — calling setResizable() here would silently reset the min/max size on
      // Windows, leaving OS-edge drag unconstrained (infinite horizontal stretch).
      // So apply the size constraints and do NOT call setResizable.
      win.setMaximizable(false);
      win.setMinimumSize(COMPACT_MIN_WIDTH, COMPACT_MIN_HEIGHT);
      win.setMaximumSize(COMPACT_MAX_WIDTH, 0);
      win.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: clampCompactWidth(compactWidth ?? COMPACT_WIDTH),
        height: bounds.height, // keep current height — continuous across the transition
      });
    } else {
      // Lift the dock's width cap, restore the wide layout, but keep the height.
      // (No setResizable here either — see the note above; it would reset min/max.)
      win.setMaximizable(true);
      win.setMaximumSize(0, 0);
      win.setMinimumSize(NORMAL_MIN_WIDTH, NORMAL_MIN_HEIGHT);
      const bounds = win.getBounds();
      win.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: savedFullWidth ?? DEFAULT_FULL_WIDTH,
        height: bounds.height,
      });
      if (wasMaximized) win.maximize();
      savedFullWidth = null;
    }
  });
  // Live width-only resize while docked (in-app sidebar drag handle + slider).
  ipcMain.on('chickadee:window-set-width', (e, px: number) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || !isCompact) return;
    const bounds = win.getBounds();
    win.setBounds({ x: bounds.x, y: bounds.y, width: clampCompactWidth(px), height: bounds.height });
  });
}

let mainWindow: BrowserWindow | null = null;
// Set when the app is genuinely quitting, so the close-to-tray handler knows to
// let the window actually close (vs. hiding it on a normal 'X' click).
let isQuitting = false;

function createWindow(): void {
  const config = buildConfig();

  // Read the persisted compact-mode flag up front so a relaunch into compact
  // mode opens at the right size instead of flashing full-size first.
  const startCompact = getSettings().compactMode ?? false;
  isCompact = startCompact;
  const startCompactWidth = clampCompactWidth(COMPACT_WIDTH * (getSettings().sidebarWidthScale ?? 1));

  const window = new BrowserWindow({
    width: startCompact ? startCompactWidth : DEFAULT_FULL_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: startCompact ? COMPACT_MIN_WIDTH : NORMAL_MIN_WIDTH,
    minHeight: startCompact ? COMPACT_MIN_HEIGHT : NORMAL_MIN_HEIGHT,
    maxWidth: startCompact ? COMPACT_MAX_WIDTH : undefined,
    resizable: true,
    maximizable: !startCompact,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    alwaysOnTop: getSettings().alwaysOnTop,
    backgroundColor: '#e9e9e9',
    title: 'Chickadee Chat',
    webPreferences: {
      // Main and preload are built as CommonJS (the package is not
      // "type": "module"), so the preload is index.js. Keeping these in sync
      // is essential — a wrong extension leaves window.chickadee undefined.
      preload: join(__dirname, '../preload/index.js'),
      // Chromium sandbox on for defense-in-depth. The preload only uses
      // sandbox-safe APIs (contextBridge/ipcRenderer/webFrame) and reads its
      // config from process.argv (additionalArguments), both of which work in a
      // sandboxed preload. @chickadee/shared is bundled in (pure TS, no node
      // builtins), so no disallowed require() is emitted.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // DevTools (Ctrl+Shift+I) only in development; disabled in the packaged build.
      devTools: !app.isPackaged,
      // Keep the renderer responsive (mic toggles, PTT) when unfocused/minimized.
      backgroundThrottling: false,
      // Pass runtime config to the preload synchronously via argv.
      additionalArguments: [`--chickadee-config=${JSON.stringify(config)}`],
    },
  });

  window.on('ready-to-show', () => {
    window.show();
    // Portable/packaged Windows launches can inherit a STARTUPINFO show-flag that
    // Windows honors on the FIRST ShowWindow, opening us minimized. Detect and undo.
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  // Belt-and-suspenders: enforce the compact width cap on any user resize path
  // (edge drag, Aero snap, double-click-maximize). setMaximumSize covers normal
  // edge drags, but snap/maximize can bypass it; clamp the requested bounds here.
  window.on('will-resize', (e, newBounds) => {
    if (!isCompact) return;
    const clamped = clampCompactWidth(newBounds.width);
    if (clamped !== newBounds.width) {
      e.preventDefault();
    }
  });

  // Tell the renderer when the window becomes invisible (minimized/hidden) so it
  // can detach incoming video streams and stop decoding frames nobody can see.
  // Focus/blur is *not* enough — a window on a 2nd monitor is unfocused but
  // visible and must keep decoding; document.hidden doesn't flip on minimize.
  const sendVisibility = (): void => {
    if (window.isDestroyed()) return;
    const visible = !window.isMinimized() && window.isVisible();
    window.webContents.send('chickadee:window-visibility', visible);
  };
  window.on('minimize', sendVisibility);
  window.on('restore', sendVisibility);
  window.on('hide', sendVisibility);
  window.on('show', sendVisibility);

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
}

app.on('render-process-gone', (_e, _wc, details) => {
  console.error('render-process-gone', details);
});

app.whenReady().then(() => {
  loadSettings();

  // Required on Windows for toast notifications + taskbar overlay badges to work in
  // packaged builds (Electron does not set this automatically). Was previously set by
  // the now-removed profiler module. Match the electron-builder appId.
  if (process.platform === 'win32') app.setAppUserModelId('com.chickadee.chat');

  // Reconcile OS-level prefs with the persisted settings on launch.
  app.setLoginItemSettings({ openAtLogin: getSettings().launchOnStartup });

  // Synchronous settings handoff to the preload (replaces passing settings via argv,
  // which has a length limit the base64 avatar could overflow). Registered before
  // createWindow() so the preload's sendSync always has a loaded value to return.
  ipcMain.on('chickadee:get-settings', (e) => {
    e.returnValue = getSettings();
  });
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
  registerWindowControls();
  registerPushToTalk();
  configureTray();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  console.error('Failed during app startup:', err);
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
