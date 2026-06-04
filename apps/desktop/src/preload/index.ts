import { contextBridge, ipcRenderer } from 'electron';
import type { ScreenSource } from '@chickadee/shared';

/**
 * Minimal, safe API surface exposed to the renderer over the context bridge.
 * `getScreenSources` proxies to the main process, where desktopCapturer lives.
 */
const api = {
  /** WebSocket URL of the signaling server. */
  signalingUrl: process.env['VITE_SIGNALING_URL'] ?? 'ws://localhost:8080',
  platform: process.platform,
  /** List the shareable screens and windows for the screen-share picker. */
  getScreenSources: (): Promise<ScreenSource[]> =>
    ipcRenderer.invoke('chickadee:get-screen-sources'),
  /** Record the chosen source just before calling getDisplayMedia(). */
  setShareSource: (sourceId: string, audio: boolean): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-share-source', sourceId, audio),
};

contextBridge.exposeInMainWorld('chickadee', api);

export type ChickadeeApi = typeof api;
