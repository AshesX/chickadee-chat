import { useCallback, useEffect, useRef } from 'react';

/**
 * Hover-to-dismiss timer shared by the popovers that auto-close when the pointer
 * leaves (space switcher, chat emoji picker, reaction popover). `arm(delayMs)`
 * (re)starts the countdown; `cancel()` aborts it; the timer is cleared on unmount.
 * The latest `onDismiss` is always called, so callers can pass a fresh closure.
 */
export function useDismissTimeout(onDismiss: () => void): {
  arm: (delayMs: number) => void;
  cancel: () => void;
} {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(onDismiss);
  callbackRef.current = onDismiss;

  const cancel = useCallback((): void => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const arm = useCallback(
    (delayMs: number): void => {
      cancel();
      timeoutRef.current = setTimeout(() => callbackRef.current(), delayMs);
    },
    [cancel],
  );

  useEffect(() => cancel, [cancel]);

  return { arm, cancel };
}
