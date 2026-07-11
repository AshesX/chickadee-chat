import { contextBridge, ipcRenderer, webFrame } from 'electron';
import {
  DEFAULT_ICE_SERVERS,
  defaultSettings,
  type PersistedSettings,
  type ScreenSource,
} from '@chickadee/shared';

interface AppConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
  appVersion: string;
  joinSecret: string;
}

/** Main passes small fixed runtime config synchronously via --chickadee-config=<json>. */
function readConfig(): AppConfig {
  const fallback: AppConfig = {
    signalingUrl: 'ws://localhost:8080',
    iceServers: DEFAULT_ICE_SERVERS,
    appVersion: '0.1.0',
    joinSecret: '',
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
 * A parameterless main→renderer event subscription: invokes `cb` on every
 * message on `channel`, returns an unsubscribe fn. All the hotkey/tray events
 * share this shape.
 */
function subscription(channel: string): (cb: () => void) => () => void {
  return (cb) => {
    const listener = (): void => cb();
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

/**
 * Minimal, safe API surface exposed to the renderer over the context bridge.
 * `getScreenSources` proxies to the main process, where desktopCapturer lives.
 */
const api = {
  /** WebSocket URL of the signaling server. */
  signalingUrl: config.signalingUrl,
  /** ICE servers (STUN + TURN) for RTCPeerConnection. */
  iceServers: config.iceServers,
  /** Optional shared join secret for private signaling deployments ('' = none). */
  joinSecret: config.joinSecret,
  /**
   * Persisted settings (name, rooms, friends, userId, prefs). Fetched over a
   * synchronous IPC rather than argv so the base64 avatar can't overflow the
   * command-line length limit (which would silently reset to defaults).
   */
  settings:
    (ipcRenderer.sendSync('chickadee:get-settings') as PersistedSettings | null) ??
    defaultSettings(),
  /** App version */
  appVersion: config.appVersion,
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
    setCompact: (compact: boolean, compactWidth?: number, chatWidth?: number): void =>
      ipcRenderer.send('chickadee:window-set-compact', compact, compactWidth, chatWidth),
    /** Live width-only resize of the docked compact window (no-op when not compact). */
    setWindowWidth: (px: number): void => ipcRenderer.send('chickadee:window-set-width', px),
  },
  /**
   * Subscribe to window-visibility changes (false when minimized/hidden, true
   * when restored/shown). Used to pause incoming video decode while invisible.
   * Returns an unsubscribe fn.
   */
  onWindowVisibilityChange: (cb: (visible: boolean) => void): (() => void) => {
    const listener = (_e: unknown, visible: boolean): void => cb(visible);
    ipcRenderer.on('chickadee:window-visibility', listener);
    return () => ipcRenderer.removeListener('chickadee:window-visibility', listener);
  },
  /** Register/unregister the global push-to-talk hotkey in main. */
  setPushToTalk: (opts: { enabled: boolean; key: string; mode: 'hold' | 'toggle' }): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-ptt', opts),
  /** PTT toggle events (toggle mode). */
  onPushToTalk: subscription('chickadee:ptt-toggle'),
  /** PTT key-down (hold mode: mic on). */
  onPttStart: subscription('chickadee:ptt-start'),
  /** PTT key-up (hold mode: mic off). */
  onPttStop: subscription('chickadee:ptt-stop'),
  /** Register/unregister the global mute mic hotkey in main. */
  setMuteKeybind: (opts: { enabled: boolean; key: string; mode: 'hold' | 'toggle' }): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-mute-keybind', opts),
  onMuteToggle: subscription('chickadee:mute-toggle'),
  onMuteStart: subscription('chickadee:mute-start'),
  onMuteStop: subscription('chickadee:mute-stop'),
  /** Register/unregister the global deafen hotkey in main. */
  setDeafenKeybind: (opts: { enabled: boolean; key: string; mode: 'hold' | 'toggle' }): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-deafen-keybind', opts),
  onDeafenToggle: subscription('chickadee:deafen-toggle'),
  onDeafenStart: subscription('chickadee:deafen-start'),
  onDeafenStop: subscription('chickadee:deafen-stop'),
  /** Register/unregister the camera toggle hotkey in main. */
  setCameraKeybind: (opts: { enabled: boolean; key: string; mode: 'toggle' }): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-camera-keybind', opts),
  onCameraToggle: subscription('chickadee:camera-toggle'),
  /** Register/unregister the screen share toggle hotkey in main. */
  setScreenShareKeybind: (opts: { enabled: boolean; key: string; mode: 'toggle' }): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-screen-share-keybind', opts),
  onScreenShareToggle: subscription('chickadee:screen-share-toggle'),
  /** Register/unregister the chat panel toggle hotkey in main. */
  setChatPanelKeybind: (opts: { enabled: boolean; key: string; mode: 'toggle' }): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-chat-panel-keybind', opts),
  onChatPanelToggle: subscription('chickadee:chat-panel-toggle'),
  /** Register/unregister the TTS toggle hotkey in main. */
  setTtsToggleKeybind: (opts: { enabled: boolean; key: string; mode: 'toggle' }): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-tts-toggle-keybind', opts),
  onTtsToggle: subscription('chickadee:tts-toggle'),
  /** Register/unregister the TTS stop hotkey in main. */
  setTtsStopKeybind: (opts: { enabled: boolean; key: string; mode: 'toggle' }): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-tts-stop-keybind', opts),
  onTtsStop: subscription('chickadee:tts-stop'),
  /** Tray: set its icon (data URL), current room label, and mute-from-tray. */
  setTrayIcon: (dataUrl: string): Promise<void> => ipcRenderer.invoke('chickadee:set-tray-icon', dataUrl),
  setTrayRoom: (label: string | null): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-tray-room', label),
  onTrayMute: subscription('chickadee:tray-mute'),
  onTrayDeafen: subscription('chickadee:tray-deafen'),
  setBadge: (count: number, dataUrl: string | null): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-badge', count, dataUrl),
  /** Adjust the UI zoom factor */
  setZoomFactor: (factor: number): void => webFrame.setZoomFactor(factor),
  /** Toggle launch-on-system-startup (packaged builds). */
  setLoginItem: (open: boolean): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-login-item', open),
  /** Pin/unpin the window above all other apps. */
  setAlwaysOnTop: (on: boolean): Promise<void> =>
    ipcRenderer.invoke('chickadee:set-always-on-top', on),
};

contextBridge.exposeInMainWorld('chickadee', api);

export type ChickadeeApi = typeof api;
