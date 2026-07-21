import path from 'node:path';

interface NativeBindings {
  resolvePidFromHwnd(hwnd: number): number | null;
  start(pid: number, includeProcessTree: boolean, onFrame: (chunk: Buffer) => void): Promise<void>;
  stop(): Promise<void>;
}

// node-gyp-build has no published types; it's a plain CJS `(dir) => bindings` loader.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bindings = require('node-gyp-build') as (dir: string) => NativeBindings;
const native = bindings(path.join(__dirname, '..'));

/**
 * Resolves the owning process id for a Win32 window handle — e.g. the numeric
 * middle segment of an Electron desktopCapturer window source id
 * (`"window:<hwnd>:<flag>"`). Returns null if the window/PID can't be resolved.
 */
export function resolvePidFromHwnd(hwnd: number): number | null {
  return native.resolvePidFromHwnd(hwnd);
}

/**
 * Starts WASAPI process-loopback capture scoped to `pid` (optionally
 * including its child processes) instead of the whole system audio mix —
 * this is what keeps locally-played audio from other processes (including
 * this Electron app's own) out of the captured stream, by construction.
 *
 * Resolves once capture is actually flowing; `onFrame` is then called
 * repeatedly with interleaved 16-bit stereo 48kHz PCM chunks until `stop()`
 * is called. Only one capture may be active at a time — always await
 * `stop()` before starting a new one.
 */
export function startCapture(
  pid: number,
  includeProcessTree: boolean,
  onFrame: (chunk: Buffer) => void,
): Promise<void> {
  return native.start(pid, includeProcessTree, onFrame);
}

/** Stops capture and tears down the WASAPI session. Idempotent. */
export function stopCapture(): Promise<void> {
  return native.stop();
}
