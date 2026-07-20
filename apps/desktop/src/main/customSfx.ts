import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { app, dialog, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { CUSTOM_SFX_SLOTS, sanitizeCustomSfxSlot, type CustomSfxSlot } from '@chickadee/shared';
import { SUPPORTED_AUDIO_EXTENSIONS } from './soundboardLibraryLogic';
import { transcodeClip } from './soundboardTranscode';

/**
 * Local per-cue SFX customization: a "Choose file" dialog per toggle-group
 * slot, ffmpeg-processed with the exact same trim/normalize pipeline as the
 * P2P Soundboard (soundboardTranscode.ts, reused directly — no new argv
 * logic). Unlike Soundboard this is purely local (never synced to peers), so
 * there's no inbox watcher, no content hash/manifest, no push events — a
 * fixed set of at most 11 files (`<slot>.mp3`), one per CUSTOM_SFX_SLOTS
 * entry, chosen and replaced entirely via renderer-initiated IPC calls.
 */

function customSfxDir(): string {
  return join(app.getPath('userData'), 'custom-sfx');
}

function slotPath(slot: CustomSfxSlot): string {
  return join(customSfxDir(), `${slot}.mp3`);
}

let mainWindow: BrowserWindow | null = null;

export function setCustomSfxMainWindow(w: BrowserWindow | null): void {
  mainWindow = w;
}

export function configureCustomSfx(): void {
  mkdirSync(customSfxDir(), { recursive: true });

  ipcMain.handle(
    'chickadee:custom-sfx-choose',
    async (_e, slotArg: unknown): Promise<{ durationMs: number } | { error: string } | null> => {
      const slot = sanitizeCustomSfxSlot(slotArg);
      if (!slot || !mainWindow || mainWindow.isDestroyed()) return null;

      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose a sound',
        properties: ['openFile'],
        filters: [{ name: 'Audio', extensions: [...SUPPORTED_AUDIO_EXTENSIONS].map((ext) => ext.slice(1)) }],
      });
      if (canceled || !filePaths[0]) return null;

      const tempPath = join(customSfxDir(), `.tmp-${randomUUID()}.mp3`);
      try {
        const result = await transcodeClip(filePaths[0], tempPath, () => {});
        // Atomic replace: a failed transcode (caught below) never clobbers
        // whatever custom sound this slot already had.
        await rename(tempPath, slotPath(slot));
        return { durationMs: result.durationMs };
      } catch (err) {
        await unlink(tempPath).catch(() => {});
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  ipcMain.handle('chickadee:custom-sfx-reset', async (_e, slotArg: unknown): Promise<void> => {
    const slot = sanitizeCustomSfxSlot(slotArg);
    if (!slot) return;
    await unlink(slotPath(slot)).catch(() => {});
  });

  ipcMain.handle('chickadee:custom-sfx-list', (): CustomSfxSlot[] =>
    CUSTOM_SFX_SLOTS.filter((slot) => existsSync(slotPath(slot))),
  );

  ipcMain.handle('chickadee:custom-sfx-read', async (_e, slotArg: unknown): Promise<Uint8Array | null> => {
    const slot = sanitizeCustomSfxSlot(slotArg);
    if (!slot) return null;
    try {
      return await readFile(slotPath(slot));
    } catch {
      return null;
    }
  });
}
