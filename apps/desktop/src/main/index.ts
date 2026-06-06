import { dirname, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { exec } from 'node:child_process';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  session,
  shell,
  Tray,
  clipboard,
} from 'electron';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import {
  PUBLIC_TURN_SERVERS,
  STUN_SERVERS,
  defaultSettings,
  type PersistedSettings,
  type ScreenSource,
} from '@chickadee/shared';

// In dev, override userData per "instance slot" (default 0) so settings persist
// across restarts (a fixed dir) while two instances stay isolated — run a second
// one with CHICKADEE_INSTANCE=1. (A per-pid dir would lose settings every launch.)
// Packaged builds keep the real per-user userData.
if (!app.isPackaged) {
  const slot = process.env.CHICKADEE_INSTANCE ?? '0';
  app.setPath('userData', join(app.getPath('temp'), `chickadee-dev-${slot}`));
}

/**
 * Minimal .env loader (no dependency): walks up from the cwd looking for a
 * `.env` file and sets any KEY=VALUE lines into process.env without overwriting
 * existing vars. Lets users configure signaling/TURN with a file in dev.
 */
function loadDotEnv(): void {
  let dir = process.cwd();
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

interface AppConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
  settings: PersistedSettings;
}

// Persisted settings live in userData/settings.json; held in memory after load.
let currentSettings: PersistedSettings = defaultSettings();

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

/** Load settings (merged over defaults), minting a stable userId on first run. */
function loadSettings(): void {
  let stored: Partial<PersistedSettings> = {};
  try {
    const path = settingsPath();
    if (existsSync(path)) stored = JSON.parse(readFileSync(path, 'utf8')) as Partial<PersistedSettings>;
  } catch (err) {
    console.error('failed to read settings.json', err);
  }
  currentSettings = { ...defaultSettings(), ...stored };

  // Migrate legacy settings containing 'rooms' list into a new private Space
  const legacyRooms = (stored as any).rooms;
  if (legacyRooms && Array.isArray(legacyRooms) && legacyRooms.length > 0) {
    const defaultSpaceId = `my-space-${randomUUID().slice(0, 5)}`;
    currentSettings.spaces = [
      {
        id: defaultSpaceId,
        name: 'My Space',
        rooms: legacyRooms,
      },
    ];
    currentSettings.activeSpaceId = defaultSpaceId;
    delete (currentSettings as any).rooms;
    persistSettings();
  }

  if (!currentSettings.userId) {
    currentSettings.userId = randomUUID();
    persistSettings();
  }
}

function persistSettings(): void {
  try {
    writeFileSync(settingsPath(), JSON.stringify(currentSettings, null, 2));
  } catch (err) {
    console.error('failed to write settings.json', err);
  }
}

/** Merge a partial settings update from the renderer and persist it. */
function saveSettings(partial: Partial<PersistedSettings>): void {
  currentSettings = { ...currentSettings, ...partial };
  persistSettings();
}

/** Build runtime config from env: signaling URL + ICE servers (STUN + TURN). */
function buildConfig(): AppConfig {
  const signalingUrl =
    process.env.CHICKADEE_SIGNALING_URL ??
    process.env.VITE_SIGNALING_URL ??
    'ws://localhost:8080';

  const iceServers: RTCIceServer[] = [...STUN_SERVERS];
  const turnUrl = process.env.CHICKADEE_TURN_URL;
  if (turnUrl) {
    // Custom TURN replaces the public default.
    iceServers.push({
      urls: turnUrl.split(',').map((u) => u.trim()).filter(Boolean),
      username: process.env.CHICKADEE_TURN_USERNAME,
      credential: process.env.CHICKADEE_TURN_CREDENTIAL,
    });
  } else {
    iceServers.push(...PUBLIC_TURN_SERVERS);
  }
  return { signalingUrl, iceServers, settings: currentSettings };
}

loadDotEnv();

/**
 * Permissions the renderer is allowed to use. `media` covers microphone and
 * camera; `display-capture` covers screen share. Without this, getUserMedia /
 * getDisplayMedia are silently denied in Electron.
 */
const GRANTED_PERMISSIONS = new Set(['media', 'display-capture']);

function configureMediaPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(GRANTED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
    GRANTED_PERMISSIONS.has(permission),
  );
}

// The source the renderer's picker selected, consumed by the next
// getDisplayMedia() request. `audio` requests Windows loopback (game audio).
let pendingShare: { sourceId: string; audio: boolean } | null = null;

/**
 * Screen sharing uses the modern getDisplayMedia path: the renderer picks a
 * source in our custom React picker, tells main which one (set-share-source),
 * then calls getDisplayMedia — and this handler fulfils it with the chosen
 * desktopCapturer source. This is far more reliable on modern Electron than the
 * legacy getUserMedia({ chromeMediaSource }) approach, and `audio: 'loopback'`
 * gives real system/game audio on Windows.
 */
function configureScreenShare(): void {
  // The picker lists sources (with thumbnails) for the renderer.
  ipcMain.handle('chickadee:get-screen-sources', async (): Promise<ScreenSource[]> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
    }));
  });

  // The renderer records its selection just before calling getDisplayMedia.
  ipcMain.handle('chickadee:set-share-source', (_e, sourceId: string, audio: boolean) => {
    pendingShare = { sourceId, audio };
  });

  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      const wanted = pendingShare;
      pendingShare = null;
      desktopCapturer
        .getSources({ types: ['screen', 'window'] })
        .then((sources) => {
          const source = sources.find((s) => s.id === wanted?.sourceId) ?? sources[0];
          if (!source) {
            // Deny: nothing to share.
            callback({});
            return;
          }
          callback({ video: source, audio: wanted?.audio ? 'loopback' : undefined });
        })
        .catch(() => callback({}));
    },
    // We render our own picker, so don't show the OS picker.
    { useSystemPicker: false },
  );
}

// ── Push-to-talk (uiohook-napi for out-of-focus + before-input-event for in-focus) ─
let pttKeyCode: number | null = null;      // uiohook keycode
let pttInputCode: string | null = null;    // DOM input.code for before-input-event
let pttCurrentMode: 'hold' | 'toggle' = 'hold';
let pttIsHeld = false; // shared flag: whichever source fires first owns the press
let uiohookRunning = false;

// Maps Electron accelerator strings to uiohook keycodes (for global/out-of-focus PTT).
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

// Maps Electron accelerator strings to DOM input.code format (for before-input-event).
function acceleratorToInputCode(accel: string): string {
  if (/^[A-Z]$/.test(accel)) return `Key${accel}`;
  if (/^[0-9]$/.test(accel)) return `Digit${accel}`;
  if (accel === 'Up') return 'ArrowUp';
  if (accel === 'Down') return 'ArrowDown';
  if (accel === 'Left') return 'ArrowLeft';
  if (accel === 'Right') return 'ArrowRight';
  return accel; // F1-F24, Space, Tab, Insert, Delete, Home, End match as-is
}

function registerPushToTalk(): void {
  // Listeners are registered once; the pttKeyCode guard filters the target key.
  uIOhook.on('keydown', (e) => {
    if (pttKeyCode === null || e.keycode !== pttKeyCode || pttIsHeld) return;
    pttIsHeld = true; // suppress OS key-repeat: only fire on the first keydown
    mainWindow?.webContents.send(
      pttCurrentMode === 'hold' ? 'chickadee:ptt-start' : 'chickadee:ptt-toggle',
    );
  });
  uIOhook.on('keyup', (e) => {
    if (pttKeyCode === null || e.keycode !== pttKeyCode) return;
    if (!pttIsHeld) return; // before-input-event already handled this keyup
    pttIsHeld = false;
    if (pttCurrentMode === 'hold') mainWindow?.webContents.send('chickadee:ptt-stop');
  });

  ipcMain.handle(
    'chickadee:set-ptt',
    (_e, opts: { enabled: boolean; key: string; mode: 'hold' | 'toggle' }) => {
      pttKeyCode = opts.enabled ? acceleratorToUiohookCode(opts.key) : null;
      pttInputCode = opts.enabled ? acceleratorToInputCode(opts.key) : null;
      pttCurrentMode = opts.mode ?? 'hold';
      pttIsHeld = false;

      if (opts.enabled && !uiohookRunning) {
        uIOhook.start();
        uiohookRunning = true;
      } else if (!opts.enabled && uiohookRunning) {
        uIOhook.stop();
        uiohookRunning = false;
      }

      if (opts.enabled && pttKeyCode === null) {
        console.warn('push-to-talk: key not mapped to uiohook code:', opts.key);
      }
    },
  );
}

// The primary window, used by tray actions and game-detection broadcasts.
let mainWindow: BrowserWindow | null = null;

// ── Game detection (Windows tasklist; zero-dependency) ───────────────────────
interface GameDef {
  name: string;
  short: string;
  processName: string;
}

const DEFAULT_GAMES: GameDef[] = [
  { name: 'Deep Rock Galactic', short: 'DRG', processName: 'fsd-win64' },
  { name: 'Helldivers 2', short: 'HD2', processName: 'helldivers2' },
  { name: 'Valheim', short: 'VLH', processName: 'valheim' },
  { name: 'Counter-Strike 2', short: 'CS2', processName: 'cs2' },
  { name: 'Elden Ring', short: 'ELD', processName: 'eldenring' },
  { name: 'Apex Legends', short: 'APX', processName: 'r5apex' },
  { name: 'Rocket League', short: 'RL', processName: 'rocketleague' },
  { name: 'Minecraft', short: 'MC', processName: 'javaw' },
  { name: 'Fortnite', short: 'FN', processName: 'fortniteclient-win64-shipping' },
  { name: 'Overwatch 2', short: 'OW', processName: 'overwatch' },
  { name: 'Stardew Valley', short: 'SDV', processName: 'stardew valley' },
  { name: 'Terraria', short: 'TER', processName: 'terraria' },
];

let gamesList: GameDef[] = DEFAULT_GAMES;
let lastGameShort: string | null = null;

function loadGamesList(): void {
  const path = join(app.getPath('userData'), 'games.json');
  try {
    if (existsSync(path)) {
      gamesList = JSON.parse(readFileSync(path, 'utf8')) as GameDef[];
      return;
    }
    writeFileSync(path, JSON.stringify(DEFAULT_GAMES, null, 2));
  } catch (err) {
    console.error('games.json failed; using defaults', err);
    gamesList = DEFAULT_GAMES;
  }
}

/** Lowercased base names (no .exe) of running processes; Windows-only. */
function runningProcessNames(): Promise<Set<string>> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(new Set());
    exec('tasklist /fo csv /nh', { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(new Set());
      const names = new Set<string>();
      for (const line of stdout.split(/\r?\n/)) {
        const m = /^"([^"]+)"/.exec(line);
        if (!m) continue;
        let n = m[1].toLowerCase();
        if (n.endsWith('.exe')) n = n.slice(0, -4);
        names.add(n);
      }
      resolve(names);
    });
  });
}

async function detectGame(): Promise<{ name: string; short: string } | null> {
  const names = await runningProcessNames();
  if (names.size === 0) return null;
  for (const g of gamesList) {
    const pn = g.processName.toLowerCase();
    for (const n of names) {
      if (n.includes(pn)) return { name: g.name, short: g.short };
    }
  }
  return null;
}

function startGameDetection(window: BrowserWindow): void {
  const scan = async (): Promise<void> => {
    const game = await detectGame();
    const short = game?.short ?? null;
    if (short !== lastGameShort) {
      lastGameShort = short;
      if (!window.isDestroyed()) window.webContents.send('chickadee:game-detected', game);
    }
  };
  setTimeout(() => void scan(), 4000);
  const interval = setInterval(() => void scan(), 30_000);
  window.on('closed', () => clearInterval(interval));
}

// ── Tray ─────────────────────────────────────────────────────────────────────
let tray: Tray | null = null;
let trayRoom: string | null = null;

function rebuildTrayMenu(): void {
  if (!tray) return;
  tray.setToolTip(trayRoom ? `Chickadee — ${trayRoom}` : 'Chickadee Chat');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show Chickadee',
        click: () => {
          if (!mainWindow) return;
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { label: trayRoom ? `Room: ${trayRoom}` : 'Not in a room', enabled: false },
      { type: 'separator' },
      { label: 'Toggle mic', click: () => mainWindow?.webContents.send('chickadee:tray-mute') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
}

function configureTray(): void {
  ipcMain.handle('chickadee:set-tray-icon', (_e, dataUrl: string) => {
    const image = nativeImage.createFromDataURL(dataUrl);
    if (tray) tray.setImage(image);
    else {
      tray = new Tray(image);
      rebuildTrayMenu();
    }
  });
  ipcMain.handle('chickadee:set-tray-room', (_e, label: string | null) => {
    trayRoom = label;
    rebuildTrayMenu();
  });
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

  // Surface preload load failures (they would otherwise be silent).
  window.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error('preload-error', preloadPath, error);
  });

  // PTT fallback for when the window is in the foreground: uiohook-napi's global
  // hook doesn't fire while Chromium is the active window, so before-input-event
  // covers the in-focus case. pttIsHeld coordinates between the two sources so
  // only one sends the IPC message per physical press.
  window.webContents.on('before-input-event', (_event, input) => {
    if (!pttInputCode || input.code !== pttInputCode) return;
    if (input.type === 'keyDown') {
      if (pttIsHeld) return; // uiohook fired first, or key is already held (OS repeat)
      if (input.isAutoRepeat) return; // belt-and-suspenders: suppress OS key-repeat
      pttIsHeld = true;
      window.webContents.send(
        pttCurrentMode === 'hold' ? 'chickadee:ptt-start' : 'chickadee:ptt-toggle',
      );
    } else if (input.type === 'keyUp') {
      if (!pttIsHeld) return; // uiohook already handled this keyup
      pttIsHeld = false;
      if (pttCurrentMode === 'hold') window.webContents.send('chickadee:ptt-stop');
    }
  });

  // Open external links in the user's browser, never inside the app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // electron-vite injects the dev server URL in development; load the built
  // file in production.
  if (process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  startGameDetection(window);
}

// Log renderer crashes so a white-screen never goes unexplained.
app.on('render-process-gone', (_e, _wc, details) => {
  console.error('render-process-gone', details);
});

app.whenReady().then(() => {
  loadSettings();
  loadGamesList();
  ipcMain.handle('chickadee:save-settings', (_e, partial: Partial<PersistedSettings>) =>
    saveSettings(partial),
  );
  ipcMain.handle('chickadee:write-clipboard', (_e, text: string) => {
    clipboard.writeText(text);
  });
  configureMediaPermissions();
  configureScreenShare();
  registerWindowControls();
  registerPushToTalk();
  configureTray();
  createWindow();

  app.on('activate', () => {
    // macOS: re-create a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  if (uiohookRunning) uIOhook.stop();
  globalShortcut.unregisterAll();
  tray?.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
