import { useRef } from 'react';

/**
 * Drag-to-resize the sidebar width. Uses screenX (absolute) deltas so the math
 * holds in compact mode too, where resizing the frameless window makes its right
 * edge follow the cursor — the left edge stays fixed, so screenX delta == width
 * delta. base 240px (full view) / 260px (compact dock) maps to the 1.0–2.0 scale.
 *
 * Returns `navRef` to attach to the sidebar `<nav>` and `handleResizeStart` for
 * the drag handle's `onPointerDown`.
 */
export function useSidebarResize(
  compact: boolean,
  widthScale: number,
  onResize: (scale: number, commit: boolean) => void,
): {
  navRef: React.RefObject<HTMLElement | null>;
  handleResizeStart: (e: React.PointerEvent<HTMLDivElement>) => void;
} {
  const navRef = useRef<HTMLElement>(null);

  function handleResizeStart(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault();
    const handle = e.currentTarget;
    const startX = e.screenX;
    const base = compact ? 260 : 240;
    const startWidth = navRef.current?.getBoundingClientRect().width ?? base * widthScale;
    handle.setPointerCapture(e.pointerId);
    const scaleFor = (ev: PointerEvent): number =>
      Math.max(1.0, Math.min(2.0, (startWidth + (ev.screenX - startX)) / base));
    const onMove = (ev: PointerEvent): void => onResize(scaleFor(ev), false);
    const onUp = (ev: PointerEvent): void => {
      onResize(scaleFor(ev), true);
      handle.releasePointerCapture?.(e.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }

  return { navRef, handleResizeStart };
}
