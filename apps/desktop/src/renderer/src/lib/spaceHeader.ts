/**
 * Single source of truth for the sidebar's Space header hero-strip dimensions —
 * shared by the banner crop tool's output size (SpaceSettingsModal) and the
 * space-switcher dropdown's position (SpaceSwitcher), so the two can't drift
 * out of sync with each other the way they did across a few rounds of manual
 * height tuning. CSS can't import this, so `.sidebar__space-header`'s `height`
 * in styles.css stays a literal — update it alongside this file.
 */
export const SIDEBAR_HEADER_HEIGHT_PX = 96;

/** Sidebar's widest resizable width (base 280px * max 2.0x scale, see useSidebarResize.ts). */
export const SIDEBAR_MAX_WIDTH_PX = 560;
