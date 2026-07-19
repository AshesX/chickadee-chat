import { useEffect, useRef, useState } from 'react';

export interface WindowFocusState {
  windowFocused: boolean;
  windowVisible: boolean;
}

// Window focus + visibility tracking.
// - `windowFocused`: false while another app has focus — gates infinite CSS
//   animations via `.app--unfocused`. Uses window focus/blur, NOT document.hidden,
//   which doesn't flip when the Electron window is merely minimized.
// - `windowVisible`: false only while minimized/hidden (signalled from main) —
//   gates incoming video decode so frames nobody can see aren't decoded.
// `onFocus` fires on every focus gain (read through a ref so callers don't have
// to memoize it and the listeners attach exactly once).
export function useWindowFocus(onFocus?: () => void): WindowFocusState {
  const [windowFocused, setWindowFocused] = useState(() => document.hasFocus());
  const [windowVisible, setWindowVisible] = useState(true);
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  useEffect(() => {
    const handleFocus = (): void => {
      setWindowFocused(true);
      onFocusRef.current?.();
    };
    const handleBlur = (): void => setWindowFocused(false);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    return window.chickadee?.onWindowVisibilityChange?.(setWindowVisible);
  }, []);

  return { windowFocused, windowVisible };
}
