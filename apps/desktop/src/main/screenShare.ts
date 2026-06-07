import { desktopCapturer, ipcMain, session } from 'electron';
import type { ScreenSource } from '@chickadee/shared';

let pendingShare: { sourceId: string; audio: boolean } | null = null;

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
            callback({});
            return;
          }
          callback({ video: source, audio: wanted?.audio ? 'loopback' : undefined });
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: false },
  );
}
