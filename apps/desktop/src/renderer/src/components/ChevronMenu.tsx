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
  /** Menu width in px; the popover is centered on the anchor and viewport-clamped. */
  width: number;
  /** The menu's own class, kept so each popover's existing CSS still applies. */
  className: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
}

/**
 * Shared scaffolding for the control-bar/chat anchored popovers: a full-screen
 * backdrop that closes on click + a positioned menu surface that stops click
 * propagation. Each popover supplies its own `width`, `className`, and content.
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
  const { bottom, left } = computeChevronPosition(anchorRect, width, window.innerWidth, window.innerHeight);

  return (
    <>
      <div className="backdrop backdrop--dropdown" onClick={onClose} />
      <div
        className={className}
        style={{ bottom, left, width }}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </div>
    </>
  );
}
