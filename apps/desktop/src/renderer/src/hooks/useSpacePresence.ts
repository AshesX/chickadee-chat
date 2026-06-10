import type { Room } from '@chickadee/shared';
import type { Signaling } from './useSignaling';
import { userColor } from '../lib/settings';

export interface SpaceUser {
  id: string; // The peer's stable userId
  name: string;
  initial: string;
  color: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  where: string;
  /** Custom avatar data URL, if the peer has shared one. */
  avatarUrl?: string;
}

export function useSpacePresence(signaling: Signaling, rooms: Room[]): SpaceUser[] {
  // Map to UI objects
  const users = signaling.spacePresence.map((p): SpaceUser => {
    const isOffline = p.leftAt !== undefined;
    let where = 'Online';
    if (isOffline) {
      where = 'Offline';
    } else if (p.roomId) {
      const room = rooms.find((r) => r.id === p.roomId);
      where = room ? `In ${room.label}` : 'In a room';
    }

    return {
      id: p.peer.userId,
      name: p.peer.displayName,
      initial: p.peer.displayName.trim().charAt(0).toUpperCase() || '?',
      color: userColor(p.peer.userId),
      status: isOffline ? 'offline' : p.peer.status,
      where,
      avatarUrl: p.peer.avatarDataUrl ?? undefined,
    };
  });

  // Sort: Online first (alphabetical), then offline (alphabetical)
  users.sort((a, b) => {
    if (a.status === 'offline' && b.status !== 'offline') return 1;
    if (a.status !== 'offline' && b.status === 'offline') return -1;
    return a.name.localeCompare(b.name);
  });

  return users;
}
