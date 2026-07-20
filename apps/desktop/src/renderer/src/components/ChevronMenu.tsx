import { useState, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Centers a popover over its anchor button (above by default, or below when
 * `placement: 'below'`), clamped to stay 8px inside the viewport. Pure
 * (viewport dims passed in) so it's unit-testable in node.
 */
export function computeChevronPosition(
  anchorRect: DOMRect,
  width: number,
  viewportWidth: number,
  viewportHeight: number,
  placement: 'above' | 'below' = 'above',
): { left: number; top?: number; bottom?: number } {
  const gap = 8;
  const rawLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
  const left = Math.max(8, Math.min(rawLeft, viewportWidth - width - 8));
  if (placement === 'below') return { left, top: anchorRect.bottom + gap };
  return { left, bottom: viewportHeight - anchorRect.top + gap };
}

interface ChevronMenuProps {
  anchorRect: DOMRect;
  onClose: () => void;
  /** Menu width in px (optional). If omitted, the menu automatically scales to fit its content. */
  width?: number;
  /**
   * The menu's own class, kept so each popover's existing CSS still applies.
   * Must itself set `position: fixed` + `z-index: var(--z-dropdown)` (e.g. `.audio-menu`) —
   * `.menu-surface` only supplies visual styling (background/shadow/radius), not positioning,
   * so without this the computed top/left/bottom offsets below are inert and the menu silently
   * renders in normal document flow instead of anchored near the trigger.
   */
  className: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
  snapToControlBar?: boolean;
  /** Which side of the anchor the menu opens toward. Defaults to 'above' (control-bar popovers). */
  placement?: 'above' | 'below';
}

/**
 * Shared scaffolding for the control-bar/chat anchored popovers: a full-screen
 * backdrop that closes on click + a positioned menu surface that stops click
 * propagation. Each popover supplies its own `className`, and content.
 * If `width` is omitted, it will automatically measure and scale to its content.
 */
export function ChevronMenu({
  anchorRect,
  onClose,
  width,
  className,
  onMouseEnter,
  onMouseLeave,
  children,
  snapToControlBar,
  placement = 'above',
}: ChevronMenuProps): React.JSX.Element {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (width === undefined && ref.current) {
      setMeasuredWidth(ref.current.offsetWidth);
    }
  }, [width, children]);

  const activeWidth = width !== undefined ? width : measuredWidth;
  const isMeasuring = width === undefined && measuredWidth === 0;

  const { top, bottom: computedBottom, left } = computeChevronPosition(
    anchorRect,
    activeWidth,
    window.innerWidth,
    window.innerHeight,
    placement,
  );
  const bottom = snapToControlBar ? 76 : computedBottom;

  // Portaled to document.body so the fixed backdrop + menu escape `.main`'s
  // stacking context (z-index:1) — otherwise they paint beneath the sidebar
  // (z-index:2) whenever the popover's clamped position overlaps it.
  return createPortal(
    <>
      <div className="backdrop backdrop--dropdown" onClick={onClose} />
      <div
        ref={ref}
        className={className}
        style={{
          top,
          bottom: top === undefined ? bottom : undefined,
          left,
          width: width !== undefined ? width : 'max-content',
          visibility: isMeasuring ? 'hidden' : 'visible',
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
