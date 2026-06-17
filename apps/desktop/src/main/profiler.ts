import { join } from 'node:path';
import { mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { app, BrowserWindow, contentTracing, globalShortcut, ipcMain, Notification } from 'electron';

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

// The main window, stashed by startProfiler so the feedback helper can flash it.
let profiledWindow: BrowserWindow | null = null;
let appIdSet = false;

/**
 * Visible "the shortcut fired" feedback for the profiler hotkeys. A packaged
 * build has no console, so a bare console.log is invisible — this also fires a
 * native notification and flashes the taskbar (the latter is reliable even when
 * the window is unfocused/minimized, the common profiling state).
 */
function notifyProfiler(body: string): void {
  console.log('[profiler]', body);
  try {
    if (process.platform === 'win32' && !appIdSet) {
      app.setAppUserModelId('com.chickadee.chat'); // Windows shows toasts only with an AUMID
      appIdSet = true;
    }
    if (Notification.isSupported()) {
      new Notification({ title: 'Chickadee Profiler', body, silent: true }).show();
    }
  } catch {
    /* notifications are best-effort; the flash + console below always run */
  }
  profiledWindow?.flashFrame(true);
}

/**
 * IPC + global-shortcut setup. Call once from app.whenReady(). Registers the
 * renderer rAF sink, a Ctrl+Alt+P toggle that captures a ~10 s paint trace, and
 * a Ctrl+Alt+W toggle that opens chrome://webrtc-internals.
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
      notifyProfiler(`Paint trace written: ${out}`);
      return;
    }
    tracing = true;
    notifyProfiler('Paint trace started (10s) — Ctrl+Alt+P');
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

  // Ctrl+Alt+W → open chrome://webrtc-internals in its own window. A second
  // BrowserWindow shares the app's Chromium browser process, so its
  // webrtc-internals page sees the main window's live RTCPeerConnections — the
  // standard way to inspect WebRTC (e.g. confirm Opus DTX) in a frameless app
  // with no address bar. Reuse the window if it's already open.
  let webrtcWindow: BrowserWindow | null = null;
  const openWebrtcInternals = (): void => {
    if (webrtcWindow && !webrtcWindow.isDestroyed()) {
      webrtcWindow.focus();
      return;
    }
    webrtcWindow = new BrowserWindow({
      width: 1000,
      height: 720,
      title: 'WebRTC Internals — Chickadee profiling',
      webPreferences: { sandbox: true }, // trusted internal page; no preload
    });
    webrtcWindow.removeMenu();
    void webrtcWindow.loadURL('chrome://webrtc-internals');
    webrtcWindow.on('closed', () => {
      webrtcWindow = null;
    });
    notifyProfiler('WebRTC Internals opened — Ctrl+Alt+W');
  };

  const regWebrtc = globalShortcut.register('Control+Alt+W', openWebrtcInternals);
  if (!regWebrtc) console.warn('[profiler] could not register Ctrl+Alt+W (in use?)');
}

/**
 * Start the per-process metrics sampler. Call from createWindow() after the
 * BrowserWindow exists, so window state can tag each sample.
 */
export function startProfiler(window: BrowserWindow): void {
  if (!isProfiling()) return;
  getSessionDir(); // create + log the path eagerly

  profiledWindow = window; // so notifyProfiler can flash the taskbar as feedback

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
  window.on('closed', () => {
    clearInterval(id);
    profiledWindow = null;
  });
}
