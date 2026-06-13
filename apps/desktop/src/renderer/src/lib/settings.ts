import {
  DEFAULT_ROOMS,
  defaultSettings,
  type PersistedSettings,
  type Room,
  type SpaceInfo,
} from '@chickadee/shared';

export type { Room, SpaceInfo };
export { DEFAULT_ROOMS };

/**
 * Settings persisted to Electron userData. Main hands the initial snapshot to
 * the renderer synchronously (via the config bridge); writes go back over IPC.
 * Falls back to localStorage only if the bridge is absent (dev/browser).
 */
function initialSettings(): PersistedSettings {
  const fromBridge = window.chickadee?.settings;
  if (fromBridge) return fromBridge;
  let settings = defaultSettings();
  try {
    const raw = localStorage.getItem('chickadee.settings');
    if (raw) {
      settings = { ...settings, ...(JSON.parse(raw) as Partial<PersistedSettings>) };
    }
  } catch {
    /* ignore */
  }

  if (!settings.userId) {
    settings.userId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    try {
      localStorage.setItem('chickadee.settings', JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }
  return settings;
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
  getChatVisible: (): boolean => cache.chatVisible,
  setChatVisible: (chatVisible: boolean): void => persist({ chatVisible }),
  getNoiseSuppression: (): boolean => cache.noiseSuppression,
  setNoiseSuppression: (noiseSuppression: boolean): void => persist({ noiseSuppression }),
  getEchoCancellation: (): boolean => cache.echoCancellation ?? true,
  setEchoCancellation: (echoCancellation: boolean): void => persist({ echoCancellation }),
  getAutoGainControl: (): boolean => cache.autoGainControl ?? false,
  setAutoGainControl: (autoGainControl: boolean): void => persist({ autoGainControl }),
  getInputMode: (): 'open' | 'voice' | 'ptt' => cache.inputMode ?? 'voice',
  setInputMode: (inputMode: 'open' | 'voice' | 'ptt'): void => persist({ inputMode }),
  getVadThreshold: (): number => cache.vadThreshold ?? 0.04,
  setVadThreshold: (vadThreshold: number): void => persist({ vadThreshold }),
  getVadReleaseMs: (): number => cache.vadReleaseMs ?? 500,
  setVadReleaseMs: (vadReleaseMs: number): void => persist({ vadReleaseMs }),
  getOpenMicNoiseReductionEnabled: (): boolean => cache.openMicNoiseReductionEnabled ?? true,
  setOpenMicNoiseReductionEnabled: (openMicNoiseReductionEnabled: boolean): void => persist({ openMicNoiseReductionEnabled }),
  getOpenMicThreshold: (): number => cache.openMicThreshold ?? 0.04,
  setOpenMicThreshold: (openMicThreshold: number): void => persist({ openMicThreshold }),
  getOpenMicReductionDb: (): number => cache.openMicReductionDb ?? -20,
  setOpenMicReductionDb: (openMicReductionDb: number): void => persist({ openMicReductionDb }),
  getInputDeviceId: (): string => cache.inputDeviceId ?? '',
  setInputDeviceId: (inputDeviceId: string): void => persist({ inputDeviceId }),
  getOutputDeviceId: (): string => cache.outputDeviceId ?? '',
  setOutputDeviceId: (outputDeviceId: string): void => persist({ outputDeviceId }),
  getPushToTalkKey: (): string => cache.pushToTalkKey,
  setPushToTalkKey: (pushToTalkKey: string): void => persist({ pushToTalkKey }),
  getPttMode: (): 'hold' | 'toggle' => cache.pttMode,
  setPttMode: (pttMode: 'hold' | 'toggle'): void => persist({ pttMode }),
  getSfxEnabled: (): boolean => cache.sfxEnabled ?? true,
  setSfxEnabled: (sfxEnabled: boolean): void => persist({ sfxEnabled }),
  getSfxVolume: (): number => cache.sfxVolume ?? 0.25,
  setSfxVolume: (sfxVolume: number): void => persist({ sfxVolume }),
  getSfxJoinLeaveEnabled: (): boolean => cache.sfxJoinLeaveEnabled ?? true,
  setSfxJoinLeaveEnabled: (sfxJoinLeaveEnabled: boolean): void => persist({ sfxJoinLeaveEnabled }),
  getSfxMuteEnabled: (): boolean => cache.sfxMuteEnabled ?? true,
  setSfxMuteEnabled: (sfxMuteEnabled: boolean): void => persist({ sfxMuteEnabled }),
  getSfxChatEnabled: (): boolean => cache.sfxChatEnabled ?? true,
  setSfxChatEnabled: (sfxChatEnabled: boolean): void => persist({ sfxChatEnabled }),
  getSfxDeafenEnabled: (): boolean => cache.sfxDeafenEnabled ?? true,
  setSfxDeafenEnabled: (sfxDeafenEnabled: boolean): void => persist({ sfxDeafenEnabled }),
  getBadgeNotificationsEnabled: (): boolean => cache.badgeNotificationsEnabled ?? true,
  setBadgeNotificationsEnabled: (badgeNotificationsEnabled: boolean): void => persist({ badgeNotificationsEnabled }),
  getStatus: (): 'online' | 'idle' | 'dnd' => cache.status ?? 'online',
  setStatus: (status: 'online' | 'idle' | 'dnd'): void => persist({ status }),
  getMicVolume: (): number => cache.micVolume ?? 1.0,
  setMicVolume: (micVolume: number): void => persist({ micVolume }),
  getOutputVolume: (): number => cache.outputVolume ?? 1.0,
  setOutputVolume: (outputVolume: number): void => persist({ outputVolume }),
  getMuteKey: (): string => cache.muteKey ?? '',
  setMuteKey: (muteKey: string): void => persist({ muteKey }),
  getMuteMode: (): 'hold' | 'toggle' => cache.muteMode ?? 'toggle',
  setMuteMode: (muteMode: 'hold' | 'toggle'): void => persist({ muteMode }),
  getCameraResolution: (): string => cache.cameraResolution ?? '720p',
  setCameraResolution: (cameraResolution: string): void => persist({ cameraResolution }),
  getCameraFramerate: (): string => cache.cameraFramerate ?? '30',
  setCameraFramerate: (cameraFramerate: string): void => persist({ cameraFramerate }),
  getScreenResolution: (): string => cache.screenResolution ?? '1080p',
  setScreenResolution: (screenResolution: string): void => persist({ screenResolution }),
  getScreenFramerate: (): string => cache.screenFramerate ?? '30',
  setScreenFramerate: (screenFramerate: string): void => persist({ screenFramerate }),
  getUiScale: (): number => cache.uiScale ?? 1.0,
  setUiScale: (uiScale: number): void => persist({ uiScale }),
  getLaunchOnStartup: (): boolean => cache.launchOnStartup ?? false,
  setLaunchOnStartup: (launchOnStartup: boolean): void => persist({ launchOnStartup }),
  getCloseBehavior: (): 'quit' | 'tray' => cache.closeBehavior ?? 'quit',
  setCloseBehavior: (closeBehavior: 'quit' | 'tray'): void => persist({ closeBehavior }),
  getAlwaysOnTop: (): boolean => cache.alwaysOnTop ?? false,
  setAlwaysOnTop: (alwaysOnTop: boolean): void => persist({ alwaysOnTop }),
  getTheme: (): 'midnight' | 'classic' | 'oled' => cache.theme ?? 'midnight',
  setTheme: (theme: 'midnight' | 'classic' | 'oled'): void => persist({ theme }),
  getChatFontScale: (): number => cache.chatFontScale ?? 1.0,
  setChatFontScale: (chatFontScale: number): void => persist({ chatFontScale }),
  getChatPosition: (): 'left' | 'right' => cache.chatPosition ?? 'right',
  setChatPosition: (chatPosition: 'left' | 'right'): void => persist({ chatPosition }),
  getChatWidthScale: (): number => cache.chatWidthScale ?? 1.0,
  setChatWidthScale: (chatWidthScale: number): void => persist({ chatWidthScale }),
  getChatTtsEnabled: (): boolean => cache.chatTtsEnabled ?? false,
  setChatTtsEnabled: (chatTtsEnabled: boolean): void => persist({ chatTtsEnabled }),
  getChatTtsSpeakName: (): boolean => cache.chatTtsSpeakName ?? true,
  setChatTtsSpeakName: (chatTtsSpeakName: boolean): void => persist({ chatTtsSpeakName }),
  getVoicePreference: (): string => cache.voicePreference ?? '',
  setVoicePreference: (voicePreference: string): void => persist({ voicePreference }),
  getAvatarDataUrl: (): string | null => cache.avatarDataUrl ?? null,
  setAvatarDataUrl: (avatarDataUrl: string | null): void => persist({ avatarDataUrl }),
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

/** Deterministic, stable avatar color for a user (hashed from their userId). */
export function userColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FRIEND_PALETTE[h % FRIEND_PALETTE.length];
}
