import { useState, useLayoutEffect, useRef } from 'react';

/**
 * Centers a popover above its anchor button, clamped to stay 8px inside the
 * viewport. Pure (viewport dims passed in) so it's unit-testable in node.
 */
export function computeChevronPosition(
  anchorRect: DOMRect,
  width: number,
  viewportWidth: number,
  viewportHeight: number,
): { bottom: number; left: number } {
  const gap = 8;
  const bottom = viewportHeight - anchorRect.top + gap;
  const rawLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
  const left = Math.max(8, Math.min(rawLeft, viewportWidth - width - 8));
  return { bottom, left };
}

interface ChevronMenuProps {
  anchorRect: DOMRect;
  onClose: () => void;
  /** Menu width in px (optional). If omitted, the menu automatically scales to fit its content. */
  width?: number;
  /** The menu's own class, kept so each popover's existing CSS still applies. */
  className: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
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

  const { bottom, left } = computeChevronPosition(
    anchorRect,
    activeWidth,
    window.innerWidth,
    window.innerHeight
  );

  return (
    <>
      <div className="backdrop backdrop--dropdown" onClick={onClose} />
      <div
        ref={ref}
        className={className}
        style={{
          bottom,
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
    </>
  );
}
