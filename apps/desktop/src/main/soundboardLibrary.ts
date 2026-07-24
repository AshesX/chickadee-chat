import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, type WriteStream } from 'node:fs';
import { readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { app, dialog, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import {
  MAX_LOCAL_SOUNDBOARD_CLIPS,
  clampString,
  sanitizeSoundboardHash,
  type SoundboardCategory,
  type SoundboardLibraryClip,
} from '@chickadee/shared';
import { sha256Hex } from './soundboardHash';
import {
  SUPPORTED_AUDIO_EXTENSIONS,
  addManifestClip,
  createCategory,
  deleteCategory,
  deriveClipName,
  moveClipToCategory,
  normalizeCategoryEntry,
  normalizeManifestEntry,
  reconcileOrphanCategories,
  renameCategory,
  renameClip,
  setCategoryShared,
} from './soundboardLibraryLogic';
import { transcodeClip } from './soundboardTranscode';

/**
 * Local soundboard asset management: a content-addressed cache of transcoded
 * clips (shared by local ingest AND P2P-synced clips — see
 * useSoundboardSync), and the manifest of "my own" clips persisted alongside
 * it. Ingest transcodes straight from a user-picked file's own path (same
 * pattern as main/customSfx.ts) — no intermediate folder. All
 * filesystem/process work lives here; the sandboxed renderer only ever sees
 * opaque hashes and clip metadata over IPC, mirroring main/fileTransfer.ts's
 * split. Pure decision logic (extension allowlist, name derivation, manifest
 * dedup) lives in soundboardLibraryLogic.ts so it's testable without an
 * Electron runtime.
 */

function cacheDir(): string {
  return join(app.getPath('userData'), 'soundboard-cache');
}

/** Cache filename extension — kept in one place; see soundboardTranscode.ts for why it's MP3, not Ogg. */
const CACHE_EXT = '.mp3';

function cachePath(hash: string): string {
  return join(cacheDir(), `${hash}${CACHE_EXT}`);
}

function manifestPath(): string {
  return join(app.getPath('userData'), 'soundboard-manifest.json');
}

interface SoundboardManifestFile {
  clips: SoundboardLibraryClip[];
  categories: SoundboardCategory[];
}

let manifest: SoundboardLibraryClip[] = [];
let categories: SoundboardCategory[] = [];

function loadManifest(): void {
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath(), 'utf8'));
    const p = parsed as Partial<SoundboardManifestFile> | null;
    // An old bare-array (pre-category) manifest fails this shape guard and
    // loads empty — the intended drop-on-load behavior, no migration.
    if (!p || typeof p !== 'object' || Array.isArray(p) || !Array.isArray(p.clips) || !Array.isArray(p.categories)) {
      manifest = [];
      categories = [];
      return;
    }
    // normalizeManifestEntry/normalizeCategoryEntry drop entries that don't
    // match the current schema; reconcileOrphanCategories then nulls any
    // clip's categoryId left dangling by a dropped category.
    const loadedCategories = p.categories.map(normalizeCategoryEntry).filter((c): c is SoundboardCategory => c !== null);
    const loadedClips = p.clips.map(normalizeManifestEntry).filter((e): e is SoundboardLibraryClip => e !== null);
    categories = loadedCategories;
    manifest = reconcileOrphanCategories(loadedClips, loadedCategories);
  } catch {
    manifest = [];
    categories = [];
  }
}

function persistManifest(): void {
  try {
    const file: SoundboardManifestFile = { clips: manifest, categories };
    writeFileSync(manifestPath(), JSON.stringify(file));
  } catch {
    // Best-effort — a failed write only means the library doesn't survive this
    // particular change; the in-memory list (and the live UI) is unaffected.
  }
}

interface ActiveCacheWrite {
  stream: WriteStream;
  partPath: string;
  finalPath: string;
  failed: Error | null;
}

/** hash -> open .part write stream for an in-progress P2P-synced clip. */
const cacheWrites = new Map<string, ActiveCacheWrite>();
let mainWindow: BrowserWindow | null = null;

export function setSoundboardMainWindow(w: BrowserWindow | null): void {
  mainWindow = w;
}

function pushToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function pushManifestChanged(): void {
  // Bundles both arrays atomically so the renderer's clips/categories state
  // is never one tick out of sync — active-clip/shared-category math reads
  // both together.
  pushToRenderer('chickadee:soundboard-manifest-changed', { clips: manifest.slice(), categories: categories.slice() });
}

/**
 * Transcode a user-picked file straight from its own path (no copy step —
 * same pattern as main/customSfx.ts) into the content-addressed cache.
 */
async function ingestPickedFile(
  srcPath: string,
): Promise<{ hash: string; name: string; durationMs: number; sizeBytes: number } | { error: string }> {
  const tempOutputPath = join(cacheDir(), `.tmp-${randomUUID()}${CACHE_EXT}`);
  try {
    const result = await transcodeClip(srcPath, tempOutputPath, () => {});
    const bytes = await readFile(tempOutputPath);
    const hash = await sha256Hex(bytes);
    const finalPath = cachePath(hash);
    if (existsSync(finalPath)) {
      // Identical processed content already cached (e.g. re-adding the same clip).
      await unlink(tempOutputPath).catch(() => {});
    } else {
      await rename(tempOutputPath, finalPath);
    }
    return {
      hash,
      name: deriveClipName(srcPath.split(/[/\\]/).pop() ?? 'sound'),
      durationMs: result.durationMs,
      sizeBytes: bytes.length,
    };
  } catch (err) {
    await unlink(tempOutputPath).catch(() => {});
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function configureSoundboard(): void {
  mkdirSync(cacheDir(), { recursive: true });
  loadManifest();

  // --- Own-library management ---

  ipcMain.handle('chickadee:soundboard-add-files', async (): Promise<{ errors: string[] }> => {
    if (!mainWindow || mainWindow.isDestroyed()) return { errors: [] };
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Add sounds',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: [...SUPPORTED_AUDIO_EXTENSIONS].map((ext) => ext.slice(1)) }],
    });
    if (canceled) return { errors: [] };

    // Sequential: ffmpeg is a real child-process spawn, and a large multi-
    // select shouldn't fan out unbounded concurrent transcodes. Each file is
    // independent — one failure doesn't abort the rest.
    const errors: string[] = [];
    let changed = false;
    for (const src of filePaths) {
      if (manifest.length >= MAX_LOCAL_SOUNDBOARD_CLIPS) {
        errors.push(`Sound library is full (${MAX_LOCAL_SOUNDBOARD_CLIPS}/${MAX_LOCAL_SOUNDBOARD_CLIPS}) — remove a clip to add more.`);
        break; // stop before wasting an ffmpeg spawn on a pick that can't be added
      }
      const outcome = await ingestPickedFile(src);
      if ('error' in outcome) {
        errors.push(`${src.split(/[/\\]/).pop() ?? 'file'}: ${outcome.error}`);
        continue;
      }
      const added = addManifestClip(manifest, outcome, MAX_LOCAL_SOUNDBOARD_CLIPS);
      if (added.changed) {
        manifest = added.manifest;
        changed = true;
      } else if (added.error === 'cap') {
        errors.push(`Sound library is full (${MAX_LOCAL_SOUNDBOARD_CLIPS}/${MAX_LOCAL_SOUNDBOARD_CLIPS}) — remove a clip to add more.`);
        break;
      }
    }
    if (changed) {
      persistManifest();
      pushManifestChanged();
    }
    return { errors };
  });

  ipcMain.handle(
    'chickadee:soundboard-list-library',
    (): { clips: SoundboardLibraryClip[]; categories: SoundboardCategory[] } => ({
      clips: manifest.slice(),
      categories: categories.slice(),
    }),
  );

  // --- Category management ---

  ipcMain.handle(
    'chickadee:soundboard-create-category',
    (_e, name: unknown): { ok: true; category: SoundboardCategory } | { ok: false; error: 'invalid-name' | 'too-many-categories' } => {
      const result = createCategory(categories, randomUUID(), name);
      if ('error' in result) return { ok: false, error: result.error };
      categories = result.categories;
      persistManifest();
      pushManifestChanged();
      return { ok: true, category: result.category };
    },
  );

  ipcMain.handle('chickadee:soundboard-rename-category', (_e, id: unknown, name: unknown): { ok: boolean } => {
    if (typeof id !== 'string') return { ok: false };
    const result = renameCategory(categories, id, name);
    if (!result) return { ok: false };
    categories = result;
    persistManifest();
    pushManifestChanged();
    return { ok: true };
  });

  ipcMain.handle('chickadee:soundboard-delete-category', (_e, id: unknown): void => {
    if (typeof id !== 'string') return;
    const result = deleteCategory(manifest, categories, id);
    manifest = result.clips;
    categories = result.categories;
    persistManifest();
    pushManifestChanged();
  });

  ipcMain.handle(
    'chickadee:soundboard-set-category-shared',
    (_e, id: unknown, shared: unknown): { ok: true } | { ok: false; error?: 'too-many-shared-categories' | 'too-many-active-clips' } => {
      if (typeof id !== 'string' || typeof shared !== 'boolean') return { ok: false };
      const result = setCategoryShared(manifest, categories, id, shared);
      if ('error' in result) return { ok: false, error: result.error };
      categories = result.categories;
      persistManifest();
      pushManifestChanged();
      return { ok: true };
    },
  );

  ipcMain.handle(
    'chickadee:soundboard-move-clip',
    (
      _e,
      hash: unknown,
      categoryId: unknown,
      beforeHash: unknown,
    ): { ok: true } | { ok: false; error?: 'too-many-active-clips' } => {
      const h = sanitizeSoundboardHash(hash);
      if (!h || (typeof categoryId !== 'string' && categoryId !== null)) return { ok: false };
      if (typeof beforeHash !== 'string' && beforeHash !== null && beforeHash !== undefined) return { ok: false };
      const result = moveClipToCategory(manifest, categories, h, categoryId, beforeHash ?? null);
      if ('error' in result) return { ok: false, error: result.error };
      manifest = result.clips;
      persistManifest();
      pushManifestChanged();
      return { ok: true };
    },
  );

  ipcMain.handle('chickadee:soundboard-rename-clip', (_e, hash: unknown, name: unknown): { ok: boolean } => {
    const h = sanitizeSoundboardHash(hash);
    if (!h) return { ok: false };
    const result = renameClip(manifest, h, name);
    if (!result) return { ok: false };
    manifest = result;
    persistManifest();
    pushManifestChanged();
    return { ok: true };
  });

  ipcMain.handle('chickadee:soundboard-remove-clip', async (_e, hash: unknown): Promise<void> => {
    const h = sanitizeSoundboardHash(hash);
    if (!h || !manifest.some((c) => c.hash === h)) return;
    manifest = manifest.filter((c) => c.hash !== h);
    persistManifest();
    await unlink(cachePath(h)).catch(() => {});
    pushManifestChanged();
  });

  // --- Content-addressed cache IO (shared by local ingest output above and
  // P2P-synced clips written by useSoundboardSync) ---

  ipcMain.handle('chickadee:soundboard-cache-has', (_e, hash: unknown): boolean => {
    const h = sanitizeSoundboardHash(hash);
    return !!h && existsSync(cachePath(h));
  });

  ipcMain.handle('chickadee:soundboard-cache-read', async (_e, hash: unknown): Promise<Uint8Array | null> => {
    const h = sanitizeSoundboardHash(hash);
    if (!h) return null;
    try {
      return await readFile(cachePath(h));
    } catch {
      return null;
    }
  });

  ipcMain.handle('chickadee:soundboard-cache-begin-write', (_e, hash: unknown): boolean => {
    const h = sanitizeSoundboardHash(hash);
    if (!h || cacheWrites.has(h) || existsSync(cachePath(h))) return false;
    const finalPath = cachePath(h);
    const partPath = `${finalPath}.part`;
    const entry: ActiveCacheWrite = { stream: createWriteStream(partPath), partPath, finalPath, failed: null };
    entry.stream.on('error', (err) => {
      entry.failed = err;
    });
    cacheWrites.set(h, entry);
    return true;
  });

  ipcMain.handle('chickadee:soundboard-cache-write-chunk', async (_e, hash: unknown, chunk: unknown): Promise<void> => {
    const entry = cacheWrites.get(clampString(hash, 64));
    if (!entry) throw new Error('unknown cache write');
    if (entry.failed) throw entry.failed;
    if (!(chunk instanceof Uint8Array)) throw new Error('invalid chunk');
    await new Promise<void>((resolve, reject) => {
      entry.stream.write(chunk, (err) => (err ? reject(err) : resolve()));
    });
  });

  ipcMain.handle('chickadee:soundboard-cache-end-write', async (_e, hash: unknown): Promise<void> => {
    const h = clampString(hash, 64);
    const entry = cacheWrites.get(h);
    if (!entry) throw new Error('unknown cache write');
    if (entry.failed) throw entry.failed;
    await new Promise<void>((resolve, reject) => {
      entry.stream.once('error', reject);
      entry.stream.end(() => resolve());
    });
    cacheWrites.delete(h);
    // Integrity check: the cache filename IS the claimed hash, so a corrupted
    // or spoofed P2P transfer must never be accepted under a false name.
    const bytes = await readFile(entry.partPath);
    const actualHash = await sha256Hex(bytes);
    if (actualHash !== h) {
      await unlink(entry.partPath).catch(() => {});
      throw new Error('soundboard clip hash mismatch');
    }
    await rename(entry.partPath, entry.finalPath);
  });

  ipcMain.handle('chickadee:soundboard-cache-abort-write', async (_e, hash: unknown): Promise<void> => {
    const h = clampString(hash, 64);
    const entry = cacheWrites.get(h);
    if (!entry) return;
    cacheWrites.delete(h);
    await new Promise<void>((resolve) => {
      if (entry.stream.closed) return resolve();
      entry.stream.once('close', () => resolve());
      entry.stream.destroy();
    });
    await unlink(entry.partPath).catch(() => {});
  });

  app.on('will-quit', () => {
    for (const entry of cacheWrites.values()) {
      entry.stream.destroy();
      void unlink(entry.partPath).catch(() => {});
    }
    cacheWrites.clear();
  });
}
