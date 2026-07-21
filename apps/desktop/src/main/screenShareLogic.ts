/**
 * Pure decision logic for screen-share audio source selection, split out from
 * screenShare.ts (which owns Electron/desktopCapturer/native-module wiring)
 * so it's testable without an Electron runtime — same split as windowSize.ts
 * and hotkeyLogic.ts.
 */

/**
 * Parses the HWND out of an Electron desktopCapturer window source id
 * ("window:<hwnd>:<flag>", the format used on Windows). Returns null for a
 * screen source (no owning window) or a malformed id.
 */
export function parseHwndFromWindowSourceId(sourceId: string): number | null {
  const match = /^window:(\d+):/.exec(sourceId);
  if (!match) return null;
  const hwnd = Number(match[1]);
  return Number.isFinite(hwnd) ? hwnd : null;
}
