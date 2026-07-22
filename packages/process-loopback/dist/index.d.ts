/**
 * Resolves the owning process id for a Win32 window handle — e.g. the numeric
 * middle segment of an Electron desktopCapturer window source id
 * (`"window:<hwnd>:<flag>"`). Returns null if the window/PID can't be resolved.
 */
export declare function resolvePidFromHwnd(hwnd: number): number | null;
/**
 * Starts WASAPI process-loopback capture scoped to `pid` (optionally
 * including its child processes) instead of the whole system audio mix —
 * this is what keeps locally-played audio from other processes (including
 * this Electron app's own) out of the captured stream, by construction.
 *
 * Resolves once capture is actually flowing; `onFrame` is then called
 * repeatedly with interleaved 16-bit stereo 48kHz PCM chunks until `stop()`
 * is called. `onStopped` fires once instead if capture ends itself — e.g.
 * the target process died mid-capture — so a caller that never called
 * `stop()` can still notice; it never fires for a deliberate `stop()`. Only
 * one capture may be active at a time — always await `stop()` before
 * starting a new one.
 */
export declare function startCapture(pid: number, includeProcessTree: boolean, onFrame: (chunk: Buffer) => void, onStopped: () => void): Promise<void>;
/** Stops capture and tears down the WASAPI session. Idempotent. */
export declare function stopCapture(): Promise<void>;
