import { join } from 'node:path';
import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } from 'electron';
import type { ScreenSource } from '@chickadee/shared';

// Running two dev instances that share one userData dir causes cache-lock
// errors (Unable to move the cache / GPU cache creation failed). Give each
// unpackaged instance its own dir so two clients can run side by side cleanly.
if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('temp'), `chickadee-dev-${process.pid}`));
}

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

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1b1b22',
    title: 'Chickadee Chat',
    webPreferences: {
      // Main and preload are built as CommonJS (the package is not
      // "type": "module"), so the preload is index.js. Keeping these in sync
      // is essential — a wrong extension leaves window.chickadee undefined.
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
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
  createWindow();

  app.on('activate', () => {
    // macOS: re-create a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
