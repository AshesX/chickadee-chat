import { useCallback, useRef, useState } from 'react';

/**
 * Transient error state that auto-clears after `timeoutMs` (default 3s). Setting
 * a new message resets the timer; setting `null` clears it immediately. Used for
 * the mic/camera/screen-share error toasts in the peer mesh.
 */
export function useAutoClearError(timeoutMs = 3000): [string | null, (msg: string | null) => void] {
  const [error, setErrorState] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setError = useCallback(
    (msg: string | null) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setErrorState(msg);
      if (msg) {
        timeoutRef.current = setTimeout(() => {
          setErrorState(null);
          timeoutRef.current = null;
        }, timeoutMs);
      }
    },
    [timeoutMs],
  );

  return [error, setError];
}
