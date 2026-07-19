import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { app } from 'electron';
import { STUN_SERVERS } from '@chickadee/shared';

/**
 * Minimal .env loader (no dependency): walks up looking for a `.env` file and
 * sets any KEY=VALUE lines into process.env without overwriting existing vars.
 * Lets users configure signaling/TURN with a file in dev — or, for a packaged
 * (portable) build, by dropping a `.env` next to the `.exe`.
 */
export function loadDotEnv(): void {
  // A portable exe runs from a temp extraction dir, so process.cwd() won't see a
  // `.env` placed beside the exe. Search the portable launch dir and the exe's
  // own dir (when packaged) first, then fall back to cwd (dev). First file wins.
  const bases = [
    process.env.PORTABLE_EXECUTABLE_DIR,
    app.isPackaged ? dirname(app.getPath('exe')) : undefined,
    process.cwd(),
  ].filter((d): d is string => Boolean(d));

  for (const base of bases) {
    let dir = base;
    for (let i = 0; i < 4; i++) {
      const candidate = join(dir, '.env');
      if (existsSync(candidate)) {
        for (const line of readFileSync(candidate, 'utf8').split(/\r?\n/)) {
          const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
          if (!match || line.trimStart().startsWith('#')) continue;
          const [, key, raw] = match;
          if (process.env[key] !== undefined) continue;
          const value = raw.replace(/^["']|["']$/g, '');
          process.env[key] = value;
        }
        return;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
}

export interface AppConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
  appVersion: string;
  /** Optional shared join secret for private signaling deployments ('' = none). */
  joinSecret: string;
}

export function buildConfig(): AppConfig {
  // Packaged builds default to the hosted signaling server; dev defaults to a
  // local server (npm run dev). Either can be overridden via env / a .env file.
  const signalingUrl =
    process.env.CHICKADEE_SIGNALING_URL ??
    process.env.VITE_SIGNALING_URL ??
    (app.isPackaged ? 'wss://chickadee-signaling.onrender.com' : 'ws://localhost:8080');

  // STUN-only by default (pure P2P); a self-hosted TURN is opt-in via env.
  const iceServers: RTCIceServer[] = [...STUN_SERVERS];
  const turnUrl = process.env.CHICKADEE_TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl.split(',').map((u) => u.trim()).filter(Boolean),
      username: process.env.CHICKADEE_TURN_USERNAME,
      credential: process.env.CHICKADEE_TURN_CREDENTIAL,
    });
  }
  // NOTE: settings are intentionally NOT passed here — they ride the synchronous
  // `chickadee:get-settings` IPC instead, because the full settings object includes
  // the base64 avatar and argv has a hard length limit (~32 KB on Windows).
  return {
    signalingUrl,
    iceServers,
    appVersion: app.getVersion(),
    joinSecret: process.env.CHICKADEE_JOIN_SECRET ?? '',
  };
}
