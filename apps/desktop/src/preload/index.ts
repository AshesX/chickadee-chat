import { contextBridge, ipcRenderer } from 'electron';
import {
  DEFAULT_ICE_SERVERS,
  defaultSettings,
  type PersistedSettings,
  type ScreenSource,
} from '@chickadee/shared';

interface AppConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
  settings: PersistedSettings;
}

/** Main passes runtime config synchronously via --chickadee-config=<json>. */
function readConfig(): AppConfig {
  const fallback: AppConfig = {
    signalingUrl: 'ws://localhost:8080',
    iceServers: DEFAULT_ICE_SERVERS,
    settings: defaultSettings(),
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
  /** Persisted settings (name, rooms, friends, userId, prefs). */
  settings: config.settings,
  /** Merge + persist a partial settings update to userData. */
  saveSettings: (partial: Partial<PersistedSettings>): Promise<void> =>
    ipcRenderer.invoke('chickadee:save-settings', partial),
  /** Write text to system clipboard. */
  writeClipboard: (text: string): Promise<void> =>
    ipcRenderer.invoke('chickadee:write-clipboard', text),
  platform: process.platform,
  /** List the shareable screens and windows for the screen-share picker. */
  getScreenSources: (): Promise<ScreenSource[]> =>
    ipcRenderer.invoke('chickadee:get-screen-sources'),
  /** Record the chosen source just before calling getDisplayMedia(). */
  setShareSource: (sourceId: string, audio: boolean): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-share-source', sourceId, audio),
  /** Frameless-window title-bar controls. */
  windowControls: {
    minimize: (): void => ipcRenderer.send('chickadee:window-minimize'),
    toggleMaximize: (): void => ipcRenderer.send('chickadee:window-maximize-toggle'),
    close: (): void => ipcRenderer.send('chickadee:window-close'),
  },
  /** Register/unregister the global push-to-talk hotkey in main. */
  setPushToTalk: (opts: { enabled: boolean; key: string; mode: 'hold' | 'toggle' }): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-ptt', opts),
  /** Subscribe to PTT toggle events (toggle mode). Returns an unsubscribe fn. */
  onPushToTalk: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on('chickadee:ptt-toggle', listener);
    return () => ipcRenderer.removeListener('chickadee:ptt-toggle', listener);
  },
  /** Subscribe to PTT key-down (hold mode: mic on). Returns an unsubscribe fn. */
  onPttStart: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on('chickadee:ptt-start', listener);
    return () => ipcRenderer.removeListener('chickadee:ptt-start', listener);
  },
  /** Subscribe to PTT key-up (hold mode: mic off). Returns an unsubscribe fn. */
  onPttStop: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on('chickadee:ptt-stop', listener);
    return () => ipcRenderer.removeListener('chickadee:ptt-stop', listener);
  },
  /** Subscribe to detected-game changes from the main-process scanner. */
  onGameDetected: (cb: (game: { name: string; short: string } | null) => void): (() => void) => {
    const listener = (_e: unknown, game: { name: string; short: string } | null): void => cb(game);
    ipcRenderer.on('chickadee:game-detected', listener);
    return () => ipcRenderer.removeListener('chickadee:game-detected', listener);
  },
  /** Tray: set its icon (data URL), current room label, and mute-from-tray. */
  setTrayIcon: (dataUrl: string): Promise<void> => ipcRenderer.invoke('chickadee:set-tray-icon', dataUrl),
  setTrayRoom: (label: string | null): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-tray-room', label),
  onTrayMute: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on('chickadee:tray-mute', listener);
    return () => ipcRenderer.removeListener('chickadee:tray-mute', listener);
  },
};

contextBridge.exposeInMainWorld('chickadee', api);

export type ChickadeeApi = typeof api;
