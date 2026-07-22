import { contextBridge, ipcRenderer, webFrame } from 'electron';
import {
  DEFAULT_ICE_SERVERS,
  defaultSettings,
  type CustomSfxSlot,
  type PersistedSettings,
  type ScreenSource,
  type SoundboardLibraryClip,
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

/** Like `subscription()`, but for main→renderer events that carry a payload. */
function payloadSubscription<T>(channel: string): (cb: (payload: T) => void) => () => void {
  return (cb) => {
    const listener = (_e: unknown, payload: T): void => cb(payload);
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
  /**
   * Record the chosen source just before calling getDisplayMedia(), and (for
   * a window share with audio) start native per-process audio capture.
   * Resolves with which audio path will actually be used: 'process' (audio
   * arrives separately via onScreenAudioFrame — the renderer builds its own
   * track), 'system' (the returned getDisplayMedia() stream carries a normal
   * whole-system-loopback audio track), or 'none'.
   */
  setShareSource: (sourceId: string, audio: boolean): Promise<'process' | 'system' | 'none'> =>
    ipcRenderer.invoke('chickadee:set-share-source', sourceId, audio),
  /** Stop native per-process screen-audio capture (mirrors stopScreenShare()). */
  stopScreenAudioCapture: (): Promise<void> => ipcRenderer.invoke('chickadee:stop-screen-audio-capture'),
  /** Raw PCM frames (16-bit stereo 48kHz) from native per-process audio capture. */
  onScreenAudioFrame: payloadSubscription<Uint8Array>('chickadee:screen-audio-frame'),
  /** Fires if native per-process audio capture ends itself mid-share (e.g. the shared window's process crashed) — never for a deliberate stopScreenAudioCapture(). */
  onScreenAudioCaptureEnded: subscription('chickadee:screen-audio-capture-ended'),
  /**
   * Receiver-side file-transfer disk IO. Write streams, the Save dialog, and
   * all filesystem paths live in main; the renderer only moves opaque transfer
   * ids and chunk bytes. Each writeChunk resolves once the chunk is flushed —
   * awaiting it is the receive loop's backpressure.
   */
  fileTransfer: {
    /** Show "Save As" and open a .part write stream. Resolves the chosen path, or null = declined. */
    beginSave: (transferId: string, suggestedName: string): Promise<string | null> =>
      ipcRenderer.invoke('chickadee:begin-file-save', transferId, suggestedName),
    writeChunk: (transferId: string, chunk: Uint8Array): Promise<void> =>
      ipcRenderer.invoke('chickadee:write-file-chunk', transferId, chunk),
    /** Finish the stream and rename .part to the real filename. */
    endSave: (transferId: string): Promise<string> =>
      ipcRenderer.invoke('chickadee:end-file-save', transferId),
    /** Destroy the stream and delete the .part file. */
    abortSave: (transferId: string): Promise<void> =>
      ipcRenderer.invoke('chickadee:abort-file-save', transferId),
    /** Reveal a completed transfer's file in Explorer. */
    showInFolder: (transferId: string): Promise<void> =>
      ipcRenderer.invoke('chickadee:show-file-in-folder', transferId),
    /** Pick ONE folder for a whole batch; per-file streams open lazily against it. */
    beginBatchSave: (batchId: string): Promise<string | null> =>
      ipcRenderer.invoke('chickadee:begin-batch-save', batchId),
    /** Trusted sender: authorize Downloads as the batch folder, no dialog. */
    authorizeAutoBatch: (batchId: string): Promise<string | null> =>
      ipcRenderer.invoke('chickadee:authorize-auto-batch', batchId),
    /** Trusted sender, single file: dialog-less save into Downloads (collision-suffixed). */
    beginAutoSave: (transferId: string, suggestedName: string): Promise<string | null> =>
      ipcRenderer.invoke('chickadee:begin-auto-save', transferId, suggestedName),
    /** Open one batch file's .part stream inside the authorized folder; resolves the (suffixed) name. */
    beginBatchFileSave: (batchId: string, fileTransferId: string, suggestedName: string): Promise<string | null> =>
      ipcRenderer.invoke('chickadee:begin-batch-file-save', batchId, fileTransferId, suggestedName),
    /** Batch settled: drop its folder authorization. */
    releaseBatch: (batchId: string): Promise<void> =>
      ipcRenderer.invoke('chickadee:release-batch', batchId),
  },
  /**
   * Soundboard local library + cache. Ingest (ffmpeg transcode straight from
   * a picked file's own path, hashing) runs entirely in main; the renderer
   * only sees clip metadata and moves opaque hash-keyed bytes for both
   * local-ingest output and P2P sync.
   */
  soundboard: {
    /** Open a native multi-select file picker and ffmpeg-ingest each pick; resolves with any per-file failures. */
    addFiles: (): Promise<{ errors: string[] }> => ipcRenderer.invoke('chickadee:soundboard-add-files'),
    /** Snapshot of this user's own (already-ingested) clips. */
    listClips: (): Promise<SoundboardLibraryClip[]> => ipcRenderer.invoke('chickadee:soundboard-list-clips'),
    /** Remove one of this user's own clips (cache + manifest entry). */
    removeClip: (hash: string): Promise<void> => ipcRenderer.invoke('chickadee:soundboard-remove-clip', hash),
    /** Fired whenever the own-clip library changes (ingest complete, or a clip removed). */
    onManifestChanged: payloadSubscription<SoundboardLibraryClip[]>('chickadee:soundboard-manifest-changed'),
    cache: {
      /** Whether a clip with this content hash is already cached locally. */
      has: (hash: string): Promise<boolean> => ipcRenderer.invoke('chickadee:soundboard-cache-has', hash),
      /** Read a cached clip's whole bytes (playback decode, or as a P2P-sync send source). */
      read: (hash: string): Promise<Uint8Array | null> => ipcRenderer.invoke('chickadee:soundboard-cache-read', hash),
      /** Open a `.part` write stream for a hash a P2P sync is about to receive. */
      beginWrite: (hash: string): Promise<boolean> => ipcRenderer.invoke('chickadee:soundboard-cache-begin-write', hash),
      writeChunk: (hash: string, chunk: Uint8Array): Promise<void> =>
        ipcRenderer.invoke('chickadee:soundboard-cache-write-chunk', hash, chunk),
      /** Finish the stream; re-hashes and verifies against `hash` before renaming .part into the cache. */
      endWrite: (hash: string): Promise<void> => ipcRenderer.invoke('chickadee:soundboard-cache-end-write', hash),
      abortWrite: (hash: string): Promise<void> => ipcRenderer.invoke('chickadee:soundboard-cache-abort-write', hash),
    },
  },
  /**
   * Local per-cue SFX customization (Settings → Sound Effects). Purely local —
   * never synced to peers — so unlike `soundboard` there are no push events:
   * every state change here is renderer-initiated (a user picking/resetting a
   * file), so plain request/response IPC is enough.
   */
  customSfx: {
    /** Open a native single-file picker, ffmpeg-process the pick (trim/normalize, same pipeline as Soundboard), and store it for this slot. Null = dialog cancelled. */
    choose: (slot: CustomSfxSlot): Promise<{ durationMs: number } | { error: string } | null> =>
      ipcRenderer.invoke('chickadee:custom-sfx-choose', slot),
    /** Delete this slot's custom sound, reverting it to the built-in synthesized cue. */
    reset: (slot: CustomSfxSlot): Promise<void> => ipcRenderer.invoke('chickadee:custom-sfx-reset', slot),
    /** Which slots currently have a custom sound set. */
    listSlots: (): Promise<CustomSfxSlot[]> => ipcRenderer.invoke('chickadee:custom-sfx-list'),
    /** Read one slot's processed audio bytes, for renderer-side decode + playback. */
    read: (slot: CustomSfxSlot): Promise<Uint8Array | null> => ipcRenderer.invoke('chickadee:custom-sfx-read', slot),
  },
  /** Frameless-window title-bar controls. */
  windowControls: {
    minimize: (): void => ipcRenderer.send('chickadee:window-minimize'),
    toggleMaximize: (): void => ipcRenderer.send('chickadee:window-maximize-toggle'),
    close: (): void => ipcRenderer.send('chickadee:window-close'),
    setCompact: (compact: boolean, compactWidth?: number, chatWidth?: number): void =>
      ipcRenderer.send('chickadee:window-set-compact', compact, compactWidth, chatWidth),
    /** Live width-only resize of the docked compact window (no-op when not compact). */
    setWindowWidth: (px: number): void => ipcRenderer.send('chickadee:window-set-width', px),
    /** Temporarily widen the docked window to host a modal, then restore. Stays in
     *  compact mode; no-op when not compact. */
    setOverlayExpand: (expand: boolean): void =>
      ipcRenderer.send('chickadee:window-set-overlay-expand', expand),
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
  /**
   * electron-updater against GitHub releases (NSIS-installed builds only —
   * main is a silent no-op for portable/dev, so these calls/events just never
   * fire there). Prompt-before-download: checking never pulls bytes on its
   * own, only `download()` does.
   */
  update: {
    /** Manually trigger a check (Settings/About "Check for Updates"). */
    check: (): Promise<void> => ipcRenderer.invoke('chickadee:check-for-updates'),
    download: (): Promise<void> => ipcRenderer.invoke('chickadee:download-update'),
    /** Quits and installs the already-downloaded update. */
    install: (): Promise<void> => ipcRenderer.invoke('chickadee:install-update'),
    /** Manual-check-only feedback: fires right after a manual check() call. */
    onChecking: subscription('chickadee:update-checking'),
    /** Fires for both silent and manual checks whenever a newer version exists. */
    onAvailable: payloadSubscription<{ version: string }>('chickadee:update-available'),
    /** Manual-check-only: no newer version found. */
    onNotAvailable: subscription('chickadee:update-not-available'),
    /** Manual-check-only: the check or download failed. */
    onError: payloadSubscription<string>('chickadee:update-error'),
    onDownloadProgress: payloadSubscription<{ percent: number }>('chickadee:update-download-progress'),
    onDownloaded: payloadSubscription<{ version: string }>('chickadee:update-downloaded'),
  },
};

contextBridge.exposeInMainWorld('chickadee', api);

export type ChickadeeApi = typeof api;
