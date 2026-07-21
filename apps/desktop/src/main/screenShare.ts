import { app, desktopCapturer, ipcMain, session } from 'electron';
import type { BrowserWindow } from 'electron';
import type { ScreenSource } from '@chickadee/shared';
import { resolvePidFromHwnd, startCapture, stopCapture } from '@chickadee/process-loopback';
import { parseHwndFromWindowSourceId } from './screenShareLogic';

/**
 * Which audio path a share ended up using:
 * - 'process': the shared window's own audio only, via WASAPI process-loopback
 *   (native module) — architecturally can't include Chickadee's own locally-
 *   played peer audio, since that lives in a different process. Delivered to
 *   the renderer out-of-band as raw PCM frames (see below), not as part of
 *   the getDisplayMedia() stream.
 * - 'system': the pre-existing whole-system loopback fallback (full-display
 *   shares have no single owning process to isolate; also the fallback if
 *   process-loopback activation fails for a window share).
 * - 'none': audio wasn't requested.
 */
export type ScreenAudioMode = 'process' | 'system' | 'none';

let pendingShare: { sourceId: string; audioMode: ScreenAudioMode } | null = null;
let mainWindow: BrowserWindow | null = null;
let processCaptureActive = false;

export function setScreenShareMainWindow(w: BrowserWindow | null): void {
  mainWindow = w;
}

async function stopProcessCapture(): Promise<void> {
  if (!processCaptureActive) return;
  processCaptureActive = false;
  try {
    await stopCapture();
  } catch (err) {
    console.error('process-loopback stopCapture failed', err);
  }
}

export function configureScreenShare(): void {
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

  // Decides (and, for 'process', actually starts) the audio capture strategy
  // up front, before the renderer ever calls getDisplayMedia() — the
  // setDisplayMediaRequestHandler callback below just reads the outcome, so
  // it never has to await native activation mid-negotiation.
  ipcMain.handle(
    'chickadee:set-share-source',
    async (_e, sourceId: string, audio: boolean): Promise<ScreenAudioMode> => {
      await stopProcessCapture(); // one audio source at a time; always start clean

      if (!audio) {
        pendingShare = { sourceId, audioMode: 'none' };
        return 'none';
      }

      const hwnd = parseHwndFromWindowSourceId(sourceId);
      const pid = hwnd != null ? resolvePidFromHwnd(hwnd) : null;

      if (pid != null) {
        try {
          await startCapture(pid, true, (chunk) => {
            mainWindow?.webContents.send('chickadee:screen-audio-frame', chunk);
          });
          processCaptureActive = true;
          pendingShare = { sourceId, audioMode: 'process' };
          return 'process';
        } catch (err) {
          console.warn('process-loopback capture failed, falling back to system loopback', err);
        }
      }

      pendingShare = { sourceId, audioMode: 'system' };
      return 'system';
    },
  );

  ipcMain.handle('chickadee:stop-screen-audio-capture', async (): Promise<void> => {
    await stopProcessCapture();
  });

  // Best-effort: if the app quits mid-share, let the native capture thread
  // wind down cleanly rather than relying solely on process-exit teardown.
  app.on('will-quit', () => {
    void stopProcessCapture();
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
            callback({});
            return;
          }
          // 'process' audio arrives out-of-band (see chickadee:screen-audio-frame)
          // — the renderer builds its own track from those frames, so this
          // getDisplayMedia() stream carries no audio track for that case.
          callback({ video: source, audio: wanted?.audioMode === 'system' ? 'loopback' : undefined });
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: false },
  );
}
