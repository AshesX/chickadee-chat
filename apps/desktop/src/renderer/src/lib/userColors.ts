import { useEffect, useRef, useState } from 'react';
import type { PeerId } from '@chickadee/shared';

/** Four per-user accent colors. The local user is always index 0 (gold). */
export const USER_COLORS = ['#f59e0b', '#8b5cf6', '#3b82f6', '#ec4899'] as const;
export const SELF_COLOR = USER_COLORS[0];

/**
 * Stable per-session color assignment for remote peers: each peer keeps its
 * color until it leaves, and a freed color is reused by the next joiner.
 */
export function useUserColors(peerIds: PeerId[]): Record<PeerId, string> {
  const assignedRef = useRef<Map<PeerId, string>>(new Map());
  const [colors, setColors] = useState<Record<PeerId, string>>({});
  const key = peerIds.join(',');

  useEffect(() => {
    const assigned = assignedRef.current;
    const present = new Set(peerIds);
    for (const id of [...assigned.keys()]) {
      if (!present.has(id)) assigned.delete(id);
    }
    const used = new Set<string>([SELF_COLOR, ...assigned.values()]);
    for (const id of peerIds) {
      if (assigned.has(id)) continue;
      const next = USER_COLORS.find((c) => !used.has(c)) ?? USER_COLORS[USER_COLORS.length - 1];
      assigned.set(id, next);
      used.add(next);
    }
    const map: Record<PeerId, string> = {};
    for (const id of peerIds) map[id] = assigned.get(id) ?? USER_COLORS[1];
    setColors(map);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return colors;
}
