import { join } from 'node:path';
import { rename, unlink } from 'node:fs/promises';
import { createWriteStream, unlinkSync, type WriteStream } from 'node:fs';
import { app, dialog, ipcMain, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { MAX_ID_LEN, clampString, sanitizeSaveFileName } from '@chickadee/shared';

/**
 * Receiver-side disk IO for P2P file transfers. The renderer (sandboxed) moves
 * DataChannel chunks over IPC; the write streams, the native Save dialog, and
 * every filesystem path live here. Data is written to `<path>.part` and only
 * renamed to the real filename on a byte-complete finish, so a torn transfer
 * can never masquerade as the finished file.
 */

interface ActiveSave {
  stream: WriteStream;
  partPath: string;
  finalPath: string;
  /** First stream error (e.g. disk full); later writes fail fast on it. */
  failed: Error | null;
}

/** transferId -> open .part write stream. */
const saves = new Map<string, ActiveSave>();
/** transferId -> final path of a completed save (for show-in-folder; the renderer never handles paths). */
const completed = new Map<string, string>();
let mainWindow: BrowserWindow | null = null;

export function setFileTransferMainWindow(w: BrowserWindow | null): void {
  mainWindow = w;
}

export function configureFileTransfer(): void {
  ipcMain.handle(
    'chickadee:begin-file-save',
    async (_e, transferId: unknown, suggestedName: unknown): Promise<string | null> => {
      const id = clampString(transferId, MAX_ID_LEN);
      if (!id || saves.has(id) || !mainWindow || mainWindow.isDestroyed()) return null;
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: join(app.getPath('downloads'), sanitizeSaveFileName(suggestedName)),
      });
      if (canceled || !filePath) return null;
      // The dialog is async: re-check the id and reject a path another active
      // save is already writing to (two .part streams on one target).
      if (saves.has(id)) return null;
      for (const other of saves.values()) {
        if (other.finalPath === filePath) return null;
      }
      const partPath = `${filePath}.part`;
      const entry: ActiveSave = {
        stream: createWriteStream(partPath),
        partPath,
        finalPath: filePath,
        failed: null,
      };
      entry.stream.on('error', (err) => {
        entry.failed = err;
      });
      saves.set(id, entry);
      return filePath;
    },
  );

  ipcMain.handle('chickadee:write-file-chunk', async (_e, transferId: unknown, chunk: unknown): Promise<void> => {
    const save = saves.get(clampString(transferId, MAX_ID_LEN));
    if (!save) throw new Error('unknown transfer');
    if (save.failed) throw save.failed;
    if (!(chunk instanceof Uint8Array)) throw new Error('invalid chunk');
    // The invoke promise resolving per-chunk IS the renderer's backpressure,
    // and a disk error (e.g. disk full) rejects the exact failing chunk.
    await new Promise<void>((resolve, reject) => {
      save.stream.write(chunk, (err) => (err ? reject(err) : resolve()));
    });
  });

  ipcMain.handle('chickadee:end-file-save', async (_e, transferId: unknown): Promise<string> => {
    const id = clampString(transferId, MAX_ID_LEN);
    const save = saves.get(id);
    if (!save) throw new Error('unknown transfer');
    if (save.failed) throw save.failed;
    await new Promise<void>((resolve, reject) => {
      save.stream.once('error', reject);
      save.stream.end(() => resolve());
    });
    // Node's rename replaces an existing target on Windows — covers the user
    // having picked an existing file to overwrite in the Save dialog.
    await rename(save.partPath, save.finalPath);
    saves.delete(id);
    completed.set(id, save.finalPath);
    return save.finalPath;
  });

  ipcMain.handle('chickadee:abort-file-save', async (_e, transferId: unknown): Promise<void> => {
    const id = clampString(transferId, MAX_ID_LEN);
    const save = saves.get(id);
    if (!save) return;
    saves.delete(id);
    // Wait for the fd to actually close before unlinking (Windows holds it).
    await new Promise<void>((resolve) => {
      if (save.stream.closed) return resolve();
      save.stream.once('close', () => resolve());
      save.stream.destroy();
    });
    try {
      await unlink(save.partPath);
    } catch {
      // Best effort — a stray .part is harmless and never masquerades as the file.
    }
  });

  ipcMain.handle('chickadee:show-file-in-folder', (_e, transferId: unknown): void => {
    const path = completed.get(clampString(transferId, MAX_ID_LEN));
    if (path) shell.showItemInFolder(path);
  });

  app.on('will-quit', () => {
    for (const save of saves.values()) {
      save.stream.destroy();
      try {
        unlinkSync(save.partPath);
      } catch {
        // The fd may still be closing on a hard quit; a leftover .part is acceptable.
      }
    }
    saves.clear();
  });
}
