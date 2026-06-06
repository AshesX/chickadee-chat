import {
  DEFAULT_ROOMS,
  defaultSettings,
  type PersistedSettings,
  type Room,
  type SpaceInfo,
  type StoredFriend,
} from '@chickadee/shared';

export type { Room, SpaceInfo, StoredFriend };
export { DEFAULT_ROOMS };

/**
 * Settings persisted to Electron userData. Main hands the initial snapshot to
 * the renderer synchronously (via the config bridge); writes go back over IPC.
 * Falls back to localStorage only if the bridge is absent (dev/browser).
 */
function initialSettings(): PersistedSettings {
  const fromBridge = window.chickadee?.settings;
  if (fromBridge) return fromBridge;
  try {
    const raw = localStorage.getItem('chickadee.settings');
    if (raw) return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<PersistedSettings>) };
  } catch {
    /* ignore */
  }
  return defaultSettings();
}

let cache = initialSettings();

function persist(partial: Partial<PersistedSettings>): void {
  cache = { ...cache, ...partial };
  const save = window.chickadee?.saveSettings;
  if (save) {
    void save(partial);
  } else {
    try {
      localStorage.setItem('chickadee.settings', JSON.stringify(cache));
    } catch {
      /* ignore */
    }
  }
}

export const store = {
  getUserId: (): string => cache.userId,
  getName: (): string => cache.displayName,
  setName: (displayName: string): void => persist({ displayName }),
  getSpaces: (): SpaceInfo[] => cache.spaces,
  setSpaces: (spaces: SpaceInfo[]): void => persist({ spaces }),
  getActiveSpaceId: (): string | null => cache.activeSpaceId,
  setActiveSpaceId: (id: string | null): void => persist({ activeSpaceId: id }),
  getRooms: (): Room[] => {
    const active = cache.spaces.find((s) => s.id === cache.activeSpaceId);
    return active ? active.rooms : [];
  },
  setRooms: (rooms: Room[]): void => {
    const nextSpaces = cache.spaces.map((s) =>
      s.id === cache.activeSpaceId ? { ...s, rooms } : s
    );
    persist({ spaces: nextSpaces });
  },
  getFriends: (): StoredFriend[] => cache.friends,
  setFriends: (friends: StoredFriend[]): void => persist({ friends }),
  getChatVisible: (): boolean => cache.chatVisible,
  setChatVisible: (chatVisible: boolean): void => persist({ chatVisible }),
  getNoiseSuppression: (): boolean => cache.noiseSuppression,
  setNoiseSuppression: (noiseSuppression: boolean): void => persist({ noiseSuppression }),
  getPttEnabled: (): boolean => cache.pttEnabled,
  setPttEnabled: (pttEnabled: boolean): void => persist({ pttEnabled }),
  getPushToTalkKey: (): string => cache.pushToTalkKey,
  setPushToTalkKey: (pushToTalkKey: string): void => persist({ pushToTalkKey }),
  getPttMode: (): 'hold' | 'toggle' => cache.pttMode,
  setPttMode: (pttMode: 'hold' | 'toggle'): void => persist({ pttMode }),
  getSfxEnabled: (): boolean => cache.sfxEnabled ?? true,
  setSfxEnabled: (sfxEnabled: boolean): void => persist({ sfxEnabled }),
  getSfxVolume: (): number => cache.sfxVolume ?? 0.25,
  setSfxVolume: (sfxVolume: number): void => persist({ sfxVolume }),
};

const FRIEND_PALETTE = [
  '#f97316',
  '#10b981',
  '#ec4899',
  '#3b82f6',
  '#8b5cf6',
  '#f59e0b',
  '#06b6d4',
  '#ef4444',
];

/** Deterministic, stable avatar color for a friend (hashed from their userId). */
export function friendColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FRIEND_PALETTE[h % FRIEND_PALETTE.length];
}
