import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } from 'electron';
import { PUBLIC_TURN_SERVERS, STUN_SERVERS, type ScreenSource } from '@chickadee/shared';

// Running two dev instances that share one userData dir causes cache-lock
// errors (Unable to move the cache / GPU cache creation failed). Give each
// unpackaged instance its own dir so two clients can run side by side cleanly.
if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('temp'), `chickadee-dev-${process.pid}`));
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
  return { signalingUrl, iceServers };
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
      // Pass runtime config to the preload synchronously via argv.
      additionalArguments: [`--chickadee-config=${JSON.stringify(config)}`],
    },
  });

  window.on('ready-to-show', () => window.show());

  // Surface preload load failures (they would otherwise be silent).
  window.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error('preload-error', preloadPath, error);
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
}

// Log renderer crashes so a white-screen never goes unexplained.
app.on('render-process-gone', (_e, _wc, details) => {
  console.error('render-process-gone', details);
});

app.whenReady().then(() => {
  configureMediaPermissions();
  configureScreenShare();
  registerWindowControls();
  createWindow();

  app.on('activate', () => {
    // macOS: re-create a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
