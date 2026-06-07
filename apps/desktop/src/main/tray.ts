import { ipcMain, Menu, nativeImage, Tray, app } from 'electron';
import type { BrowserWindow } from 'electron';

let tray: Tray | null = null;
let trayRoom: string | null = null;
let mainWindow: BrowserWindow | null = null;

export function setTrayMainWindow(w: BrowserWindow | null): void {
  mainWindow = w;
}

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
      { label: 'Toggle deafen', click: () => mainWindow?.webContents.send('chickadee:tray-deafen') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
}

export function configureTray(): void {
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

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
