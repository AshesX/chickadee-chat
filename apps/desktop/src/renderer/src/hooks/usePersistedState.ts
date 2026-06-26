import { useCallback, useState } from 'react';

/**
 * State mirror for a single persisted setting. Seeds once from `read()` and, on
 * every update, writes through `write()` to the store. Collapses the repeated
 * `useState(() => store.getX())` + `applyX = (v) => { setX(v); store.setX(v); }`
 * boilerplate that otherwise multiplies across App.tsx.
 *
 * `read`/`write` are the `store.getX`/`store.setX` accessors (module-level, so
 * stable) — the returned setter persists *and* updates React state in one call.
 */
export function usePersistedState<T>(
  read: () => T,
  write: (value: T) => void,
): [T, (value: T) => void] {
  const [value, setValue] = useState(read);
  const apply = useCallback(
    (next: T) => {
      setValue(next);
      write(next);
    },
    [write],
  );
  return [value, apply];
}
