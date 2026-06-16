import { join } from 'node:path';
import { mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { app, contentTracing, globalShortcut, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';

/**
 * Idle-performance profiling harness (read-only instrumentation). Entirely
 * inert unless CHICKADEE_PROFILE is set, so it ships in every build at zero
 * cost when off. Captures the runtime numbers behind the static audit's §4:
 *   - metrics.csv  per-process CPU/memory from app.getAppMetrics(), tagged with
 *                  window state (foreground vs minimized)            [§4.1, §4.6]
 *   - raf.csv      renderer requestAnimationFrame callback rate      [§4.3]
 *   - marks.csv    timing marks (e.g. the tasklist scan)             [§4.5]
 *   - trace-*.json contentTracing paint/raster capture (Ctrl+Alt+P)  [§4.2]
 *
 * CAVEAT: getAppMetrics().cpu.percentCPUUsage semantics vary by platform and
 * Electron version. Trust the *foreground-vs-minimized delta* over absolute
 * values, and cross-check one scenario's total against Windows Task Manager's
 * per-PID CPU to calibrate. The report script surfaces the deltas.
 */

export function isProfiling(): boolean {
  return !!process.env.CHICKADEE_PROFILE;
}

// One session dir + start time per PROCESS, stashed on globalThis. electron-vite
// can duplicate this module in the main bundle; a module-level variable would then
// give each copy its own dir, splitting one run's files across two folders
// (metrics/raf/trace in one, marks.csv in another). A process-global keeps the
// whole run together regardless of how many module copies exist.
interface ProfileState {
  dir?: string;
  startedAt: number;
}
const state: ProfileState = ((globalThis as { __chickadeeProfile?: ProfileState })
  .__chickadeeProfile ??= { startedAt: Date.now() });

function getSessionDir(): string {
  if (state.dir) return state.dir;
  const label = (process.env.CHICKADEE_PROFILE_LABEL ?? 'session').replace(/[^a-z0-9_-]/gi, '') || 'session';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(app.getPath('userData'), 'profiling', `${label}-${ts}`);
  mkdirSync(dir, { recursive: true });
  state.dir = dir;
  console.log('[profiler] writing session to', dir);
  return dir;
}

// Header is written only for a new file; existsSync is instance-independent, so
// duplicated module copies writing different files each still get one header.
function appendCsv(file: string, header: string, row: string): void {
  const path = join(getSessionDir(), file);
  if (!existsSync(path)) appendFileSync(path, header + '\n');
  appendFileSync(path, row + '\n');
}

/** Record a one-off timing mark (no-op when profiling is off). */
export function profileMark(label: string, ms: number): void {
  if (!isProfiling()) return;
  appendCsv('marks.csv', 'isoTime,label,ms', `${new Date().toISOString()},${label},${ms}`);
}

/**
 * IPC + global-shortcut setup. Call once from app.whenReady(). Registers the
 * renderer rAF sink and a Ctrl+Alt+P toggle that captures a ~20 s paint trace.
 */
export function configureProfiler(): void {
  if (!isProfiling()) return;

  ipcMain.on(
    'chickadee:profile-raf',
    (_e, p: { rafPerSec: number; hidden: boolean; focused: boolean }) => {
      appendCsv(
        'raf.csv',
        'isoTime,rafPerSec,hidden,focused',
        `${new Date().toISOString()},${p.rafPerSec},${p.hidden},${p.focused}`,
      );
    },
  );

  const TRACE_MS = 10_000;
  let tracing = false;
  const toggleTrace = async (): Promise<void> => {
    if (tracing) {
      const out = join(getSessionDir(), `trace-${Date.now()}.json`);
      await contentTracing.stopRecording(out);
      tracing = false;
      console.log('[profiler] trace written:', out);
      return;
    }
    tracing = true;
    console.log('[profiler] tracing started (auto-stops in 10s, or press Ctrl+Alt+P again)');
    // Paint/raster/compositor + GPU only. 'blink'/'toplevel' are dropped — on a
    // visible window they ballooned captures to ~250 MB; devtools.timeline +
    // cc + gpu give the Paint/RasterTask/compositor events we need for §4.2.
    await contentTracing.startRecording({
      included_categories: [
        'disabled-by-default-devtools.timeline',
        'cc',
        'gpu',
      ],
    });
    setTimeout(() => {
      if (tracing) void toggleTrace();
    }, TRACE_MS);
  };

  const registered = globalShortcut.register('Control+Alt+P', () => void toggleTrace());
  if (!registered) console.warn('[profiler] could not register Ctrl+Alt+P (in use?)');
}

/**
 * Start the per-process metrics sampler. Call from createWindow() after the
 * BrowserWindow exists, so window state can tag each sample.
 */
export function startProfiler(window: BrowserWindow): void {
  if (!isProfiling()) return;
  getSessionDir(); // create + log the path eagerly

  const intervalMs = Number(process.env.CHICKADEE_PROFILE_INTERVAL) || 2000;

  const sample = (): void => {
    if (window.isDestroyed()) return;
    const windowState = window.isMinimized()
      ? 'minimized'
      : !window.isVisible()
        ? 'hidden'
        : window.isFocused()
          ? 'foreground'
          : 'background';
    const iso = new Date().toISOString();
    const elapsed = Date.now() - state.startedAt;
    for (const m of app.getAppMetrics()) {
      const cpu = (m.cpu?.percentCPUUsage ?? 0).toFixed(2);
      const ws = m.memory?.workingSetSize ?? 0; // KB
      const name = (m.name ?? m.serviceName ?? '').replace(/[",\n]/g, ' ');
      appendCsv(
        'metrics.csv',
        'isoTime,elapsedMs,windowState,pid,type,name,cpuPercent,workingSetKB',
        `${iso},${elapsed},${windowState},${m.pid},${m.type},${name},${cpu},${ws}`,
      );
    }
  };

  const id = setInterval(sample, intervalMs);
  sample(); // immediate first sample
  window.on('closed', () => clearInterval(id));
}
