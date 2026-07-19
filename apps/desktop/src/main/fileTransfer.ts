import { join } from 'node:path';
import { rename, unlink } from 'node:fs/promises';
import { createWriteStream, existsSync, unlinkSync, type WriteStream } from 'node:fs';
import { app, dialog, ipcMain, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { MAX_ID_LEN, clampString, sanitizeSaveFileName, suffixedFileName } from '@chickadee/shared';

/**
 * Receiver-side disk IO for P2P file transfers. The renderer (sandboxed) moves
 * DataChannel chunks over IPC; the write streams, the native dialogs, and
 * every filesystem path live here. Data is written to `<path>.part` and only
 * renamed to the real filename on a byte-complete finish, so a torn transfer
 * can never masquerade as the finished file.
 *
 * Save destinations come in three flavors: Save As dialog (single manual
 * file), one folder pick per batch (`batchDirs` authorizes the derived
 * per-file streams), and dialog-less Downloads saves for auto-accepted
 * transfers — the latter two collision-suffix names Explorer-style.
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
/** batchId -> the directory the receiver authorized for that batch's files. */
const batchDirs = new Map<string, string>();
/** per-file transferId -> its batchId (back-fills `completed` for the batch card's reveal). */
const fileBatch = new Map<string, string>();
let mainWindow: BrowserWindow | null = null;

export function setFileTransferMainWindow(w: BrowserWindow | null): void {
  mainWindow = w;
}

/** A target is taken if the file, its .part, or an active save already claims it. */
function isTargetTaken(finalPath: string): boolean {
  if (existsSync(finalPath) || existsSync(`${finalPath}.part`)) return true;
  for (const save of saves.values()) {
    if (save.finalPath === finalPath) return true;
  }
  return false;
}

/** Explorer-style free name inside `dir` ("clip.mp4" -> "clip (2).mp4" ...). */
function availableFileName(dir: string, suggestedName: string): string {
  const base = sanitizeSaveFileName(suggestedName);
  let candidate = base;
  for (let n = 2; isTargetTaken(join(dir, candidate)); n++) {
    // A pathological directory could exhaust suffixes; a timestamp always frees us.
    if (n > 999) return `${Date.now()}-${base}`;
    candidate = suffixedFileName(base, n);
  }
  return candidate;
}

/** Open the .part write stream for a claimed target and register it. */
function openSave(transferId: string, finalPath: string): void {
  const partPath = `${finalPath}.part`;
  const entry: ActiveSave = {
    stream: createWriteStream(partPath),
    partPath,
    finalPath,
    failed: null,
  };
  entry.stream.on('error', (err) => {
    entry.failed = err;
  });
  saves.set(transferId, entry);
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
      openSave(id, filePath);
      return filePath;
    },
  );

  // One folder pick authorizes a whole batch; per-file streams open lazily via
  // begin-batch-file-save as each file's transfer starts.
  ipcMain.handle('chickadee:begin-batch-save', async (_e, batchId: unknown): Promise<string | null> => {
    const id = clampString(batchId, MAX_ID_LEN);
    if (!id || batchDirs.has(id) || !mainWindow || mainWindow.isDestroyed()) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Save files to folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: app.getPath('downloads'),
    });
    const dir = canceled ? undefined : filePaths[0];
    if (!dir || batchDirs.has(id)) return null;
    batchDirs.set(id, dir);
    return dir;
  });

  // Trusted senders: authorize Downloads as the batch dir with no dialog.
  ipcMain.handle('chickadee:authorize-auto-batch', (_e, batchId: unknown): string | null => {
    const id = clampString(batchId, MAX_ID_LEN);
    if (!id || batchDirs.has(id)) return null;
    const dir = app.getPath('downloads');
    batchDirs.set(id, dir);
    return dir;
  });

  // Trusted senders, single file: dialog-less save into Downloads.
  ipcMain.handle('chickadee:begin-auto-save', (_e, transferId: unknown, suggestedName: unknown): string | null => {
    const id = clampString(transferId, MAX_ID_LEN);
    if (!id || saves.has(id)) return null;
    const dir = app.getPath('downloads');
    const finalPath = join(dir, availableFileName(dir, clampString(suggestedName, 255) || 'download'));
    openSave(id, finalPath);
    return finalPath;
  });

  // Open one batch file's stream inside its authorized dir (collision-suffixed).
  ipcMain.handle(
    'chickadee:begin-batch-file-save',
    (_e, batchId: unknown, fileTransferId: unknown, suggestedName: unknown): string | null => {
      const batch = clampString(batchId, MAX_ID_LEN);
      const id = clampString(fileTransferId, MAX_ID_LEN);
      const dir = batchDirs.get(batch);
      if (!dir || !id || saves.has(id)) return null;
      const fileName = availableFileName(dir, clampString(suggestedName, 255) || 'download');
      openSave(id, join(dir, fileName));
      fileBatch.set(id, batch);
      return fileName;
    },
  );

  // Batch settled (done/cancelled/error): drop its authorization + id links.
  ipcMain.handle('chickadee:release-batch', (_e, batchId: unknown): void => {
    const id = clampString(batchId, MAX_ID_LEN);
    batchDirs.delete(id);
    for (const [fileId, batch] of fileBatch) {
      if (batch === id) fileBatch.delete(fileId);
    }
  });

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
    // First finished file of a batch also answers show-in-folder(batchId),
    // so the batch card's "Show in folder" reveals the receive folder.
    const batchId = fileBatch.get(id);
    if (batchId) {
      fileBatch.delete(id);
      if (!completed.has(batchId)) completed.set(batchId, save.finalPath);
    }
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
    batchDirs.clear();
    fileBatch.clear();
  });
}
