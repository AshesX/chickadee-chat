/**
 * Lightweight typed localStorage for renderer-side preferences. This is the
 * interim store for Phase 6A; Phase 6C migrates these to Electron userData.
 */

export interface Room {
  id: string;
  label: string;
  icon: string;
}

export const DEFAULT_ROOMS: Room[] = [
  { id: 'lobby', label: 'Lobby', icon: '🏠' },
  { id: 'dungeon', label: 'Dungeon Run', icon: '⚔️' },
  { id: 'chill', label: 'Chill Zone', icon: '🎮' },
];

const KEYS = {
  name: 'chickadee.displayName',
  rooms: 'chickadee.rooms',
  chatVisible: 'chickadee.chatVisible',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / disabled storage */
  }
}

export const store = {
  getName: (): string => read<string>(KEYS.name, ''),
  setName: (name: string): void => write(KEYS.name, name),
  getRooms: (): Room[] => read<Room[]>(KEYS.rooms, DEFAULT_ROOMS),
  setRooms: (rooms: Room[]): void => write(KEYS.rooms, rooms),
  getChatVisible: (): boolean => read<boolean>(KEYS.chatVisible, false),
  setChatVisible: (visible: boolean): void => write(KEYS.chatVisible, visible),
};
