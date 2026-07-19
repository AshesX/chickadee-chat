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

// Compact + chat: the dock widened to also show the room chat panel (sidebar
// keeps its own width; chat flexes into the rest — see App.tsx showCompactChat).
// The floating chat panel carries var(--s-3) margin on both its left and right
// (styles.css .app--compact-chat .chat-panel) — CSS can't be imported here, so
// this literal must stay in sync with that rule.
const CHAT_PANEL_MARGIN_PX = 24;
// Both panels at their default (unscaled) width, margins included — the dock
// can't shrink narrower than sidebar + chat already shown comfortably.
export const COMPACT_CHAT_MIN_WIDTH = COMPACT_WIDTH * 2 + CHAT_PANEL_MARGIN_PX;
export const COMPACT_CHAT_MAX_WIDTH = 960; // generous but still a "dock", not full view

/** Width the docked window temporarily grows to while a sidebar modal (Settings,
 *  Create/Rename Room, Space Settings, Create/Join Space) is open — enough to host
 *  the settings panel above its 900px fullscreen breakpoint. The app stays in
 *  compact mode; the window snaps back to the dock width on close. */
export const OVERLAY_EXPAND_WIDTH = 960;

/** Clamp a requested compact-dock width to the allowed range. `hasChat` widens
 *  the range to the compact+chat bounds. */
export function clampCompactWidth(px: number, hasChat = false): number {
  const min = hasChat ? COMPACT_CHAT_MIN_WIDTH : COMPACT_MIN_WIDTH;
  const max = hasChat ? COMPACT_CHAT_MAX_WIDTH : COMPACT_MAX_WIDTH;
  return Math.max(min, Math.min(max, Math.round(px)));
}
