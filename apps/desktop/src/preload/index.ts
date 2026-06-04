import { contextBridge } from 'electron';

/**
 * Minimal, safe API surface exposed to the renderer over the context bridge.
 * Phase 1 only needs configuration; native capabilities (e.g. screen capture
 * via desktopCapturer) are added here in later phases.
 */
const api = {
  /** WebSocket URL of the signaling server. */
  signalingUrl: process.env['VITE_SIGNALING_URL'] ?? 'ws://localhost:8080',
  platform: process.platform,
};

contextBridge.exposeInMainWorld('chickadee', api);

export type ChickadeeApi = typeof api;
