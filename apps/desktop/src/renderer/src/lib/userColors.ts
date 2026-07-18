import { useEffect, useRef, useState } from 'react';
import type { PeerId } from '@chickadee/shared';

/**
 * Eight per-user accent colors — one per seat of an 8-cap room, so every peer
 * gets a unique color. The local user is always index 0 (blaze). Every fill
 * carries near-black ink (>=4.6:1) and reads as a bold name on both themes'
 * chat cards. This is THE canonical identity palette — lib/settings.ts hashes
 * over it too.
 */
export const USER_COLORS = [
  '#ff6700', // Blaze (self)
  '#14a38f', // Teal
  '#1f9ec9', // Cyan
  '#3e76e8', // Blue
  '#8a63e8', // Violet
  '#c44bc0', // Magenta
  '#d9488c', // Pink
  '#3fa65c', // Green
] as const;
export const SELF_COLOR = USER_COLORS[0];

/**
 * A translucent variant of a solid color, for accent glows / ambient washes.
 * `percent` is the opacity (0–100). Uses `color-mix` so it reads clearly and works
 * with any CSS color, replacing cryptic hex-alpha suffixes like `${color}70`.
 */
export function withAlpha(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

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
