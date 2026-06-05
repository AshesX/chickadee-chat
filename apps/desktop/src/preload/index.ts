import { contextBridge, ipcRenderer } from 'electron';
import { DEFAULT_ICE_SERVERS, type ScreenSource } from '@chickadee/shared';

interface AppConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
}

/** Main passes runtime config synchronously via --chickadee-config=<json>. */
function readConfig(): AppConfig {
  const fallback: AppConfig = {
    signalingUrl: 'ws://localhost:8080',
    iceServers: DEFAULT_ICE_SERVERS,
  };
  const arg = process.argv.find((a) => a.startsWith('--chickadee-config='));
  if (!arg) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(arg.slice('--chickadee-config='.length)) as AppConfig) };
  } catch {
    return fallback;
  }
}

const config = readConfig();

/**
 * Minimal, safe API surface exposed to the renderer over the context bridge.
 * `getScreenSources` proxies to the main process, where desktopCapturer lives.
 */
const api = {
  /** WebSocket URL of the signaling server. */
  signalingUrl: config.signalingUrl,
  /** ICE servers (STUN + TURN) for RTCPeerConnection. */
  iceServers: config.iceServers,
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
