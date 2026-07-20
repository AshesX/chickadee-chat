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

/** Schema defaults, used as read fallbacks for settings files written before a key existed. */
const DEFAULTS = defaultSettings();

/** Typed getter for one settings key: cached value, else the schema default. */
function getter<K extends keyof PersistedSettings>(key: K): () => PersistedSettings[K] {
  return () => (cache[key] ?? DEFAULTS[key]) as PersistedSettings[K];
}

/** Typed setter for one settings key: merge + persist through the IPC/localStorage path. */
function setter<K extends keyof PersistedSettings>(key: K): (value: PersistedSettings[K]) => void {
  return (value) => persist({ [key]: value } as Partial<PersistedSettings>);
}

// Plain key-mirroring accessors come from the getter/setter factory; anything
// with derivation (rooms-from-active-space, keyed-map writes) stays hand-written
// below it. There are deliberately NO read-time schema migrations here — schema
// changes ride the main process's version-gated wipe (versionGate.ts).
export const store = {
  getUserId: (): string => cache.userId,
  getName: getter('displayName'),
  setName: setter('displayName'),
  getSpaces: getter('spaces'),
  setSpaces: setter('spaces'),
  getActiveSpaceId: getter('activeSpaceId'),
  setActiveSpaceId: setter('activeSpaceId'),
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
  getChatVisible: getter('chatVisible'),
  setChatVisible: setter('chatVisible'),
  getNoiseSuppression: getter('noiseSuppression'),
  setNoiseSuppression: setter('noiseSuppression'),
  getEchoCancellation: getter('echoCancellation'),
  setEchoCancellation: setter('echoCancellation'),
  getAutoGainControl: getter('autoGainControl'),
  setAutoGainControl: setter('autoGainControl'),
  getNormalizeVoices: getter('normalizeVoices'),
  setNormalizeVoices: setter('normalizeVoices'),
  getPeerVolumes: getter('peerVolumes'),
  setPeerVolume: (userId: string, volume: number): void =>
    persist({ peerVolumes: { ...(cache.peerVolumes ?? {}), [userId]: volume } }),
  getPeerScreenVolumes: getter('peerScreenVolumes'),
  setPeerScreenVolume: (userId: string, volume: number): void =>
    persist({ peerScreenVolumes: { ...(cache.peerScreenVolumes ?? {}), [userId]: volume } }),
  getAutoAcceptEnabled: getter('autoAcceptEnabled'),
  setAutoAcceptEnabled: setter('autoAcceptEnabled'),
  getAutoAcceptUsers: getter('autoAcceptUsers'),
  addAutoAcceptUser: (userId: string, displayName: string): void => {
    const current = cache.autoAcceptUsers ?? [];
    if (current.some((u) => u.userId === userId)) return;
    persist({ autoAcceptUsers: [...current, { userId, displayName }] });
  },
  removeAutoAcceptUser: (userId: string): void =>
    persist({ autoAcceptUsers: (cache.autoAcceptUsers ?? []).filter((u) => u.userId !== userId) }),
  getInputMode: getter('inputMode'),
  setInputMode: setter('inputMode'),
  getVadThreshold: getter('vadThreshold'),
  setVadThreshold: setter('vadThreshold'),
  getVadReleaseMs: getter('vadReleaseMs'),
  setVadReleaseMs: setter('vadReleaseMs'),
  getInputDeviceId: getter('inputDeviceId'),
  setInputDeviceId: setter('inputDeviceId'),
  getOutputDeviceId: getter('outputDeviceId'),
  setOutputDeviceId: setter('outputDeviceId'),
  getPushToTalkKey: getter('pushToTalkKey'),
  setPushToTalkKey: setter('pushToTalkKey'),
  getPttMode: getter('pttMode'),
  setPttMode: setter('pttMode'),
  getSfxEnabled: getter('sfxEnabled'),
  setSfxEnabled: setter('sfxEnabled'),
  getSfxVolume: getter('sfxVolume'),
  setSfxVolume: setter('sfxVolume'),
  getSfxJoinLeaveEnabled: getter('sfxJoinLeaveEnabled'),
  setSfxJoinLeaveEnabled: setter('sfxJoinLeaveEnabled'),
  getSfxMuteEnabled: getter('sfxMuteEnabled'),
  setSfxMuteEnabled: setter('sfxMuteEnabled'),
  getSfxMuteOtherEnabled: getter('sfxMuteOtherEnabled'),
  setSfxMuteOtherEnabled: setter('sfxMuteOtherEnabled'),
  getSfxTransmitEnabled: getter('sfxTransmitEnabled'),
  setSfxTransmitEnabled: setter('sfxTransmitEnabled'),
  getSfxChatEnabled: getter('sfxChatEnabled'),
  setSfxChatEnabled: setter('sfxChatEnabled'),
  getSfxDeafenEnabled: getter('sfxDeafenEnabled'),
  setSfxDeafenEnabled: setter('sfxDeafenEnabled'),
  getSfxModerationEnabled: getter('sfxModerationEnabled'),
  setSfxModerationEnabled: setter('sfxModerationEnabled'),
  getSfxSpotlightEnabled: getter('sfxSpotlightEnabled'),
  setSfxSpotlightEnabled: setter('sfxSpotlightEnabled'),
  getSfxScreenShareEnabled: getter('sfxScreenShareEnabled'),
  setSfxScreenShareEnabled: setter('sfxScreenShareEnabled'),
  getSfxTransferEnabled: getter('sfxTransferEnabled'),
  setSfxTransferEnabled: setter('sfxTransferEnabled'),
  getSfxConnectionEnabled: getter('sfxConnectionEnabled'),
  setSfxConnectionEnabled: setter('sfxConnectionEnabled'),
  getBadgeNotificationsEnabled: getter('badgeNotificationsEnabled'),
  setBadgeNotificationsEnabled: setter('badgeNotificationsEnabled'),
  getStatus: getter('status'),
  setStatus: setter('status'),
  getMicVolume: getter('micVolume'),
  setMicVolume: setter('micVolume'),
  getOutputVolume: getter('outputVolume'),
  setOutputVolume: setter('outputVolume'),
  getMuteKey: getter('muteKey'),
  setMuteKey: setter('muteKey'),
  getMuteMode: getter('muteMode'),
  setMuteMode: setter('muteMode'),
  getDeafenKey: getter('deafenKey'),
  setDeafenKey: setter('deafenKey'),
  getDeafenMode: getter('deafenMode'),
  setDeafenMode: setter('deafenMode'),
  getCameraKey: getter('cameraKey'),
  setCameraKey: setter('cameraKey'),
  getScreenShareKey: getter('screenShareKey'),
  setScreenShareKey: setter('screenShareKey'),
  getChatPanelKey: getter('chatPanelKey'),
  setChatPanelKey: setter('chatPanelKey'),
  getTtsToggleKey: getter('ttsToggleKey'),
  setTtsToggleKey: setter('ttsToggleKey'),
  getTtsStopKey: getter('ttsStopKey'),
  setTtsStopKey: setter('ttsStopKey'),
  getCameraResolution: getter('cameraResolution'),
  setCameraResolution: setter('cameraResolution'),
  getCameraFramerate: getter('cameraFramerate'),
  setCameraFramerate: setter('cameraFramerate'),
  getScreenResolution: getter('screenResolution'),
  setScreenResolution: setter('screenResolution'),
  getScreenFramerate: getter('screenFramerate'),
  setScreenFramerate: setter('screenFramerate'),
  getVideoQuality: getter('videoQuality'),
  setVideoQuality: setter('videoQuality'),
  getAudioQuality: getter('audioQuality'),
  setAudioQuality: setter('audioQuality'),
  getUploadBudgetMbps: getter('uploadBudgetMbps'),
  setUploadBudgetMbps: setter('uploadBudgetMbps'),
  getUiScale: getter('uiScale'),
  setUiScale: setter('uiScale'),
  getLaunchOnStartup: getter('launchOnStartup'),
  setLaunchOnStartup: setter('launchOnStartup'),
  getCloseBehavior: getter('closeBehavior'),
  setCloseBehavior: setter('closeBehavior'),
  getAlwaysOnTop: getter('alwaysOnTop'),
  setAlwaysOnTop: setter('alwaysOnTop'),
  getTheme: getter('theme'),
  setTheme: setter('theme'),
  getChatFontScale: getter('chatFontScale'),
  setChatFontScale: setter('chatFontScale'),
  getChatPosition: getter('chatPosition'),
  setChatPosition: setter('chatPosition'),
  getChatWidthScale: getter('chatWidthScale'),
  setChatWidthScale: setter('chatWidthScale'),
  getSidebarWidthScale: getter('sidebarWidthScale'),
  setSidebarWidthScale: setter('sidebarWidthScale'),
  getChatTtsEnabled: getter('chatTtsEnabled'),
  setChatTtsEnabled: setter('chatTtsEnabled'),
  getChatTtsSpeakName: getter('chatTtsSpeakName'),
  setChatTtsSpeakName: setter('chatTtsSpeakName'),
  getChatTtsSpeakOwnMessages: getter('chatTtsSpeakOwnMessages'),
  setChatTtsSpeakOwnMessages: setter('chatTtsSpeakOwnMessages'),
  getChatTtsSpeakWhenFocused: getter('chatTtsSpeakWhenFocused'),
  setChatTtsSpeakWhenFocused: setter('chatTtsSpeakWhenFocused'),
  getVoicePreference: getter('voicePreference'),
  setVoicePreference: setter('voicePreference'),
  getAvatarDataUrl: getter('avatarDataUrl'),
  setAvatarDataUrl: setter('avatarDataUrl'),
  getAccentColor: getter('accentColor'),
  setAccentColor: setter('accentColor'),
  getDefaultVideoAction: getter('defaultVideoAction'),
  setDefaultVideoAction: setter('defaultVideoAction'),
  getCompactMode: getter('compactMode'),
  setCompactMode: setter('compactMode'),
  getRoomsSectionCollapsed: getter('roomsSectionCollapsed'),
  setRoomsSectionCollapsed: setter('roomsSectionCollapsed'),
  getHideSpaceBanner: getter('hideSpaceBanner'),
  setHideSpaceBanner: setter('hideSpaceBanner'),
  getCustomEmojis: getter('customEmojis'),
  setCustomEmojis: setter('customEmojis'),
  getQuickReactions: getter('quickReactions'),
  setQuickReactions: setter('quickReactions'),
  getReactionsEnabled: getter('reactionsEnabled'),
  setReactionsEnabled: setter('reactionsEnabled'),
  getSoundboardEnabled: getter('soundboardEnabled'),
  setSoundboardEnabled: setter('soundboardEnabled'),
  getSoundboardVolume: getter('soundboardVolume'),
  setSoundboardVolume: setter('soundboardVolume'),
  getSoundboardAutoSyncEnabled: getter('soundboardAutoSyncEnabled'),
  setSoundboardAutoSyncEnabled: setter('soundboardAutoSyncEnabled'),
  getSoundboardPresetsEnabled: getter('soundboardPresetsEnabled'),
  setSoundboardPresetsEnabled: setter('soundboardPresetsEnabled'),
  getSoundboardMuteOthersEnabled: getter('soundboardMuteOthersEnabled'),
  setSoundboardMuteOthersEnabled: setter('soundboardMuteOthersEnabled'),
};
