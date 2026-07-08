// Window sizing rules shared by createWindow()'s initial-size branch and the
// compact-mode IPC/resize handlers, so they can't drift apart. Pure math — no
// Electron imports — so the clamp is unit-testable.

export const NORMAL_MIN_WIDTH = 760;
export const NORMAL_MIN_HEIGHT = 520;
export const COMPACT_WIDTH = 280;
export const COMPACT_MIN_WIDTH = 280;
export const COMPACT_MAX_WIDTH = COMPACT_WIDTH * 2; // 200% — matches the sidebar width scale cap.
export const COMPACT_MIN_HEIGHT = 360;
/** Default full-view width (also the fallback when expanding from compact). */
export const DEFAULT_FULL_WIDTH = 1143;
export const DEFAULT_HEIGHT = 720;

/** Clamp a requested compact-dock width to the allowed range. */
export function clampCompactWidth(px: number): number {
  return Math.max(COMPACT_MIN_WIDTH, Math.min(COMPACT_MAX_WIDTH, Math.round(px)));
}
