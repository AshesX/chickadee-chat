"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePidFromHwnd = resolvePidFromHwnd;
exports.startCapture = startCapture;
exports.stopCapture = stopCapture;
const node_path_1 = __importDefault(require("node:path"));
// node-gyp-build has no published types; it's a plain CJS `(dir) => bindings` loader.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bindings = require('node-gyp-build');
const native = bindings(node_path_1.default.join(__dirname, '..'));
/**
 * Resolves the owning process id for a Win32 window handle — e.g. the numeric
 * middle segment of an Electron desktopCapturer window source id
 * (`"window:<hwnd>:<flag>"`). Returns null if the window/PID can't be resolved.
 */
function resolvePidFromHwnd(hwnd) {
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
function startCapture(pid, includeProcessTree, onFrame) {
    return native.start(pid, includeProcessTree, onFrame);
}
/** Stops capture and tears down the WASAPI session. Idempotent. */
function stopCapture() {
    return native.stop();
}
