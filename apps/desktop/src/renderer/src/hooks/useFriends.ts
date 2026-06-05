import { useEffect, useMemo, useState } from 'react';
import type { Peer } from '@chickadee/shared';
import { friendColor, store, type StoredFriend } from '../lib/settings';
import type { Friend } from '../components/Sidebar';

/**
 * Persisted friends with in-room presence. Friends are auto-remembered by
 * stable `userId` when you share a room with them, and shown online ("in
 * <room>") only while they're a peer in your current room. Cross-room / idle
 * presence isn't observable, so everyone else reads offline.
 */
export function useFriends(
  peers: Peer[],
  selfUserId: string,
  currentRoomLabel: string | null,
): Friend[] {
  const [stored, setStored] = useState<StoredFriend[]>(() => store.getFriends());

  // Signature of the current peer set + names; drives auto-add/rename.
  const sig = peers.map((p) => `${p.userId}:${p.displayName}`).join('|');

  useEffect(() => {
    setStored((prev) => {
      const byId = new Map(prev.map((f) => [f.userId, f]));
      let changed = false;
      for (const p of peers) {
        if (!p.userId || p.userId === selfUserId) continue;
        const existing = byId.get(p.userId);
        if (!existing) {
          byId.set(p.userId, { userId: p.userId, name: p.displayName, color: friendColor(p.userId) });
          changed = true;
        } else if (p.displayName && existing.name !== p.displayName) {
          byId.set(p.userId, { ...existing, name: p.displayName });
          changed = true;
        }
      }
      if (!changed) return prev;
      const next = [...byId.values()];
      store.setFriends(next);
      return next;
    });
  }, [sig, selfUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const onlineIds = new Set(peers.map((p) => p.userId));
    return stored.map((f) => {
      const online = onlineIds.has(f.userId);
      return {
        name: f.name,
        initial: f.name.trim().charAt(0).toUpperCase() || '?',
        color: f.color,
        status: online ? ('online' as const) : ('offline' as const),
        where: online && currentRoomLabel ? `In ${currentRoomLabel}` : 'Offline',
      };
    });
  }, [stored, sig, currentRoomLabel]); // eslint-disable-line react-hooks/exhaustive-deps
}
