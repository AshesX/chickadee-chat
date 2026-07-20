import { app, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { BrowserWindow } from 'electron';

/**
 * electron-updater only knows how to update an NSIS-installed app in place —
 * there is no "installed app" for the portable .exe to replace, so it's
 * skipped entirely there (a portable user just downloads a fresh .exe).
 * electron-builder sets this env var for portable launches.
 */
function isPortable(): boolean {
  return Boolean(process.env['PORTABLE_EXECUTABLE_FILE']);
}

const STARTUP_CHECK_DELAY_MS = 10_000;
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let mainWindow: BrowserWindow | null = null;
// Distinguishes a user-clicked "Check for Updates" (Settings/About) from the
// silent background checks — only the manual path gets "you're up to date" /
// error feedback; a silent check that finds nothing stays silent.
let manualCheckPending = false;
// Once a check has found something, further background polls are pointless
// (and would otherwise re-fire 'update-available' while the user is mid-flow).
let updateFound = false;

export function setAutoUpdateMainWindow(w: BrowserWindow | null): void {
  mainWindow = w;
}

function send(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args);
}

function checkForUpdates(): void {
  if (updateFound) return;
  autoUpdater.checkForUpdates().catch((err: unknown) => {
    console.error('autoUpdater: checkForUpdates failed', err);
  });
}

/** Wires up electron-updater against the GitHub releases published by `npm run release`. */
export function configureAutoUpdate(): void {
  if (!app.isPackaged || isPortable()) return;

  // Prompt-before-download: never pull an update over the user's connection
  // without them asking for it first (see chickadee:update-available below).
  autoUpdater.autoDownload = false;
  // Falls back to installing on quit if the user downloads but never clicks
  // "Restart & Update" — the update still lands next time the app closes.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    if (manualCheckPending) send('chickadee:update-checking');
  });
  autoUpdater.on('update-available', (info) => {
    updateFound = true;
    send('chickadee:update-available', { version: info.version });
    manualCheckPending = false;
  });
  autoUpdater.on('update-not-available', () => {
    if (manualCheckPending) send('chickadee:update-not-available');
    manualCheckPending = false;
  });
  autoUpdater.on('error', (err) => {
    console.error('autoUpdater error', err);
    if (manualCheckPending) send('chickadee:update-error', err.message);
    manualCheckPending = false;
  });
  autoUpdater.on('download-progress', (progress) => {
    send('chickadee:update-download-progress', { percent: progress.percent });
  });
  autoUpdater.on('update-downloaded', (info) => {
    send('chickadee:update-downloaded', { version: info.version });
  });

  ipcMain.handle('chickadee:check-for-updates', () => {
    // Bypasses the updateFound guard: a manual click must always re-run, even
    // if a background check already found (and the user dismissed) this same
    // update, so "Check for Updates" in About never silently does nothing.
    manualCheckPending = true;
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.error('autoUpdater: checkForUpdates failed', err);
    });
  });
  ipcMain.handle('chickadee:download-update', () => {
    autoUpdater.downloadUpdate().catch((err: unknown) => {
      console.error('autoUpdater: downloadUpdate failed', err);
    });
  });
  ipcMain.handle('chickadee:install-update', () => {
    autoUpdater.quitAndInstall();
  });

  setTimeout(checkForUpdates, STARTUP_CHECK_DELAY_MS);
  setInterval(checkForUpdates, RECHECK_INTERVAL_MS);
}
