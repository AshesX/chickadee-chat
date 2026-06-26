import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Owns the control-bar chevron popovers (input/output device, input-mode, video)
 * plus the reaction popover: their open flags, anchor rects, mutually-exclusive
 * open orchestration, and the reaction popover's auto-close timeout.
 *
 * Opening any one menu closes the others (matching the original inline handlers).
 */
export function useControlBarMenus() {
  const [inputMenuOpen, setInputMenuOpen] = useState(false);
  const [outputMenuOpen, setOutputMenuOpen] = useState(false);
  const [inputModeMenuOpen, setInputModeMenuOpen] = useState(false);
  const [videoMenuOpen, setVideoMenuOpen] = useState(false);
  const [inputMenuAnchor, setInputMenuAnchor] = useState<DOMRect | null>(null);
  const [outputMenuAnchor, setOutputMenuAnchor] = useState<DOMRect | null>(null);
  const [inputModeMenuAnchor, setInputModeMenuAnchor] = useState<DOMRect | null>(null);
  const [videoMenuAnchor, setVideoMenuAnchor] = useState<DOMRect | null>(null);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const [reactionMenuAnchor, setReactionMenuAnchor] = useState<DOMRect | null>(null);

  const reactionCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionHasEnteredPopoverRef = useRef(false);

  const openInputMenu = useCallback((rect: DOMRect) => {
    setInputMenuAnchor(rect); setInputMenuOpen(true); setOutputMenuOpen(false); setInputModeMenuOpen(false); setVideoMenuOpen(false); setReactionMenuOpen(false);
  }, []);
  const openOutputMenu = useCallback((rect: DOMRect) => {
    setOutputMenuAnchor(rect); setOutputMenuOpen(true); setInputMenuOpen(false); setInputModeMenuOpen(false); setVideoMenuOpen(false); setReactionMenuOpen(false);
  }, []);
  const openInputModeMenu = useCallback((rect: DOMRect) => {
    setInputModeMenuAnchor(rect); setInputModeMenuOpen(true); setInputMenuOpen(false); setOutputMenuOpen(false); setVideoMenuOpen(false); setReactionMenuOpen(false);
  }, []);
  const openVideoMenu = useCallback((rect: DOMRect) => {
    setVideoMenuAnchor(rect); setVideoMenuOpen(true); setInputMenuOpen(false); setOutputMenuOpen(false); setInputModeMenuOpen(false); setReactionMenuOpen(false);
  }, []);
  const openReactionMenu = useCallback((rect: DOMRect) => {
    setReactionMenuAnchor(rect); setReactionMenuOpen(true); setInputMenuOpen(false); setOutputMenuOpen(false); setInputModeMenuOpen(false); setVideoMenuOpen(false);
  }, []);

  const closeInputMenu = useCallback(() => setInputMenuOpen(false), []);
  const closeOutputMenu = useCallback(() => setOutputMenuOpen(false), []);
  const closeInputModeMenu = useCallback(() => setInputModeMenuOpen(false), []);
  const closeVideoMenu = useCallback(() => setVideoMenuOpen(false), []);
  const closeReactionMenu = useCallback(() => setReactionMenuOpen(false), []);

  const startReactionCloseTimeout = useCallback(() => {
    if (reactionCloseTimeoutRef.current) clearTimeout(reactionCloseTimeoutRef.current);
    const delay = reactionHasEnteredPopoverRef.current ? 1000 : 3000;
    reactionCloseTimeoutRef.current = setTimeout(() => {
      setReactionMenuOpen(false);
    }, delay);
  }, []);

  const cancelReactionCloseTimeout = useCallback(() => {
    if (reactionCloseTimeoutRef.current) {
      clearTimeout(reactionCloseTimeoutRef.current);
      reactionCloseTimeoutRef.current = null;
    }
  }, []);

  /** Reaction popover hover-enter: cancel the pending close and shorten future grace. */
  const handleReactionPopoverEnter = useCallback(() => {
    cancelReactionCloseTimeout();
    reactionHasEnteredPopoverRef.current = true;
  }, [cancelReactionCloseTimeout]);

  useEffect(() => {
    if (reactionMenuOpen) {
      reactionHasEnteredPopoverRef.current = false;
    } else {
      if (reactionCloseTimeoutRef.current) {
        clearTimeout(reactionCloseTimeoutRef.current);
        reactionCloseTimeoutRef.current = null;
      }
    }
  }, [reactionMenuOpen]);

  useEffect(() => {
    return () => {
      if (reactionCloseTimeoutRef.current) clearTimeout(reactionCloseTimeoutRef.current);
    };
  }, []);

  return {
    inputMenuOpen, inputMenuAnchor,
    outputMenuOpen, outputMenuAnchor,
    inputModeMenuOpen, inputModeMenuAnchor,
    videoMenuOpen, videoMenuAnchor,
    reactionMenuOpen, reactionMenuAnchor,
    openInputMenu, openOutputMenu, openInputModeMenu, openVideoMenu, openReactionMenu,
    closeInputMenu, closeOutputMenu, closeInputModeMenu, closeVideoMenu, closeReactionMenu,
    startReactionCloseTimeout, cancelReactionCloseTimeout, handleReactionPopoverEnter,
  };
}
