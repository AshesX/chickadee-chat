import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, watch, writeFileSync, type FSWatcher, type WriteStream } from 'node:fs';
import { copyFile, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { app, dialog, ipcMain, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import {
  clampString,
  sanitizeSaveFileName,
  sanitizeSoundboardHash,
  suffixedFileName,
  type SoundboardLibraryClip,
} from '@chickadee/shared';
import { getSettings } from './settings';
import { sha256Hex } from './soundboardHash';
import {
  STABLE_SAMPLES,
  SUPPORTED_AUDIO_EXTENSIONS,
  deriveClipName,
  isSizeStable,
  isSupportedAudioFile,
} from './soundboardLibraryLogic';
import { transcodeClip } from './soundboardTranscode';

/**
 * Local soundboard asset management: an `fs.watch`-ed inbox folder for raw
 * user-dropped audio, a content-addressed cache of transcoded clips (shared
 * by local ingest AND P2P-synced clips — see useSoundboardSync), and the
 * manifest of "my own" clips persisted alongside it. All filesystem/process
 * work lives here; the sandboxed renderer only ever sees opaque hashes and
 * clip metadata over IPC, mirroring main/fileTransfer.ts's split. Pure
 * decision logic (debounce, extension allowlist, name derivation) lives in
 * soundboardLibraryLogic.ts so it's testable without an Electron runtime.
 */

const POLL_INTERVAL_MS = 300;

function inboxDir(): string {
  return join(app.getPath('userData'), 'soundboard-inbox');
}

function cacheDir(): string {
  return join(app.getPath('userData'), 'soundboard-cache');
}

function manifestPath(): string {
  return join(app.getPath('userData'), 'soundboard-manifest.json');
}

function isValidManifestEntry(value: unknown): value is SoundboardLibraryClip {
  const v = value as Partial<SoundboardLibraryClip> | null;
  return (
    !!v &&
    typeof v === 'object' &&
    typeof v.hash === 'string' &&
    typeof v.name === 'string' &&
    typeof v.durationMs === 'number' &&
    typeof v.sourceFile === 'string'
  );
}

let manifest: SoundboardLibraryClip[] = [];

function loadManifest(): void {
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath(), 'utf8'));
    manifest = Array.isArray(parsed) ? parsed.filter(isValidManifestEntry) : [];
  } catch {
    manifest = [];
  }
}

function persistManifest(): void {
  try {
    writeFileSync(manifestPath(), JSON.stringify(manifest));
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
/** inbox filename -> recent size samples, while its stabilize-poll is in flight. */
const sizeHistories = new Map<string, number[]>();
/** inbox filenames currently mid-transcode (or already resolved this tick) — re-entrancy guard. */
const inFlight = new Set<string>();
let watcher: FSWatcher | null = null;
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
  pushToRenderer('chickadee:soundboard-manifest-changed', manifest.slice());
}

function handleInboxDeletion(filename: string): void {
  const entry = manifest.find((c) => c.sourceFile === filename);
  if (!entry) return;
  manifest = manifest.filter((c) => c.sourceFile !== filename);
  persistManifest();
  void unlink(join(cacheDir(), `${entry.hash}.ogg`)).catch(() => {});
  pushManifestChanged();
}

async function processInboxFile(filename: string): Promise<void> {
  if (inFlight.has(filename) || !isSupportedAudioFile(filename)) return;
  // Re-checked live (not cached) so flipping the setting off stops new ffmpeg
  // spawns immediately, without needing to tear the watcher down.
  if (!getSettings().soundboardEnabled) return;

  inFlight.add(filename);
  const jobId = randomUUID();
  const inputPath = join(inboxDir(), filename);
  const tempOutputPath = join(cacheDir(), `.tmp-${jobId}.ogg`);
  try {
    const result = await transcodeClip(inputPath, tempOutputPath, (progress) => {
      pushToRenderer('chickadee:soundboard-transcode-progress', { jobId, sourceFile: filename, ratio: progress.ratio });
    });
    const bytes = await readFile(tempOutputPath);
    const hash = await sha256Hex(bytes);
    const finalPath = join(cacheDir(), `${hash}.ogg`);
    if (existsSync(finalPath)) {
      // Identical processed content already cached (e.g. re-adding the same clip).
      await unlink(tempOutputPath).catch(() => {});
    } else {
      await rename(tempOutputPath, finalPath);
    }
    if (!manifest.some((c) => c.hash === hash)) {
      manifest.push({ hash, name: deriveClipName(filename), durationMs: result.durationMs, sourceFile: filename });
      persistManifest();
    }
    pushToRenderer('chickadee:soundboard-transcode-done', { jobId, sourceFile: filename, hash });
    pushManifestChanged();
  } catch (err) {
    await unlink(tempOutputPath).catch(() => {});
    pushToRenderer('chickadee:soundboard-transcode-error', {
      jobId,
      sourceFile: filename,
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    inFlight.delete(filename);
  }
}

function pollFile(filename: string): void {
  stat(join(inboxDir(), filename))
    .then((stats) => {
      if (inFlight.has(filename)) return;
      const history = [...(sizeHistories.get(filename) ?? []), stats.size].slice(-STABLE_SAMPLES);
      if (isSizeStable(history)) {
        sizeHistories.delete(filename);
        void processInboxFile(filename);
      } else {
        sizeHistories.set(filename, history);
        setTimeout(() => pollFile(filename), POLL_INTERVAL_MS);
      }
    })
    .catch((err: NodeJS.ErrnoException) => {
      sizeHistories.delete(filename);
      if (err.code === 'ENOENT') handleInboxDeletion(filename);
    });
}

/** Explorer-style free name inside the inbox ("clip.mp3" -> "clip (2).mp3" ...). */
function availableInboxName(suggestedName: string): string {
  const base = sanitizeSaveFileName(suggestedName);
  let candidate = base;
  for (let n = 2; existsSync(join(inboxDir(), candidate)); n++) {
    if (n > 999) return `${Date.now()}-${base}`;
    candidate = suffixedFileName(base, n);
  }
  return candidate;
}

export function configureSoundboard(): void {
  mkdirSync(inboxDir(), { recursive: true });
  mkdirSync(cacheDir(), { recursive: true });
  loadManifest();

  watcher = watch(inboxDir(), (_event, filename) => {
    if (!filename || inFlight.has(filename)) return;
    pollFile(filename);
  });

  // --- Own-library management ---

  ipcMain.handle('chickadee:soundboard-add-files', async (): Promise<void> => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Add sounds',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: [...SUPPORTED_AUDIO_EXTENSIONS].map((ext) => ext.slice(1)) }],
    });
    if (canceled) return;
    for (const src of filePaths) {
      const destName = availableInboxName(src.split(/[/\\]/).pop() ?? 'sound');
      await copyFile(src, join(inboxDir(), destName)).catch(() => {});
      // The watcher above picks the new file up from here — one ingest path.
    }
  });

  ipcMain.handle('chickadee:soundboard-open-inbox', (): void => {
    void shell.openPath(inboxDir());
  });

  ipcMain.handle('chickadee:soundboard-list-clips', (): SoundboardLibraryClip[] => manifest.slice());

  ipcMain.handle('chickadee:soundboard-remove-clip', async (_e, hash: unknown): Promise<void> => {
    const h = sanitizeSoundboardHash(hash);
    const entry = h ? manifest.find((c) => c.hash === h) : undefined;
    if (!h || !entry) return;
    manifest = manifest.filter((c) => c.hash !== h);
    persistManifest();
    await unlink(join(cacheDir(), `${h}.ogg`)).catch(() => {});
    await unlink(join(inboxDir(), entry.sourceFile)).catch(() => {});
    pushManifestChanged();
  });

  // --- Content-addressed cache IO (shared by local ingest output above and
  // P2P-synced clips written by useSoundboardSync) ---

  ipcMain.handle('chickadee:soundboard-cache-has', (_e, hash: unknown): boolean => {
    const h = sanitizeSoundboardHash(hash);
    return !!h && existsSync(join(cacheDir(), `${h}.ogg`));
  });

  ipcMain.handle('chickadee:soundboard-cache-read', async (_e, hash: unknown): Promise<Uint8Array | null> => {
    const h = sanitizeSoundboardHash(hash);
    if (!h) return null;
    try {
      return await readFile(join(cacheDir(), `${h}.ogg`));
    } catch {
      return null;
    }
  });

  ipcMain.handle('chickadee:soundboard-cache-begin-write', (_e, hash: unknown): boolean => {
    const h = sanitizeSoundboardHash(hash);
    if (!h || cacheWrites.has(h) || existsSync(join(cacheDir(), `${h}.ogg`))) return false;
    const finalPath = join(cacheDir(), `${h}.ogg`);
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
    watcher?.close();
    watcher = null;
    for (const entry of cacheWrites.values()) {
      entry.stream.destroy();
      void unlink(entry.partPath).catch(() => {});
    }
    cacheWrites.clear();
  });
}
