import { join } from 'node:path';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { app, session } from 'electron';
import { shouldWipe } from './versionGateLogic';

/**
 * Beta version gate: on the first launch after ANY version change, wipe all
 * local state — Chromium session data plus every schema-bearing file in
 * userData — so the app regenerates a clean baseline from current defaults.
 * There are deliberately no read-time schema migrations anywhere; this wipe is
 * the one mechanism that handles stale persisted shapes. Runs inside
 * app.whenReady() (the session API needs ready) but BEFORE loadSettings() /
 * configureSoundboard() / configureCustomSfx() / createWindow(), so nothing —
 * including the renderer's synchronous get-settings — can observe pre-wipe state.
 */

/**
 * The version sentinel is its own tiny file, NOT a settings.json key: the gate
 * deletes every schema-bearing file, so its own record must live outside them.
 */
function sentinelPath(): string {
  return join(app.getPath('userData'), 'last-run-version');
}

/** Everything in userData the wipe removes; dirs are recreated by their owners on boot. */
function wipeTargets(): string[] {
  const userData = app.getPath('userData');
  return [
    join(userData, 'settings.json'),
    join(userData, 'soundboard-manifest.json'),
    join(userData, 'soundboard-cache'),
    join(userData, 'custom-sfx'),
  ];
}

export async function runVersionGate(): Promise<void> {
  const current = app.getVersion();
  let lastRun: string | null = null;
  try {
    lastRun = readFileSync(sentinelPath(), 'utf8').trim() || null;
  } catch {
    // Missing/unreadable sentinel counts as "never ran" → wipe.
  }

  if (!shouldWipe(lastRun, current)) return;

  console.log(`version gate: ${lastRun ?? '(none)'} -> ${current}, wiping local state`);
  // Every step is best-effort — a failed wipe must never brick startup.
  try {
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
  } catch (err) {
    console.error('version gate: failed to clear session data', err);
  }
  for (const target of wipeTargets()) {
    try {
      rmSync(target, { recursive: true, force: true });
    } catch (err) {
      console.error('version gate: failed to remove', target, err);
    }
  }

  // Record the new version so subsequent launches skip the wipe.
  try {
    writeFileSync(sentinelPath(), current);
  } catch (err) {
    console.error('version gate: failed to record version', err);
  }
}
