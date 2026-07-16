import type { AudioQuality, SoundboardLibraryClip, ThemeName, VideoQuality } from '@chickadee/shared';
import type { MediaDeviceOption } from '../../hooks/useMediaDevices';

export type TabId = 'profile' | 'audio' | 'video' | 'sfx' | 'chat' | 'reactions' | 'ui' | 'app' | 'keybindings' | 'soundboard';

export interface SearchEntry {
  label: string;
  description?: string;
  tab: TabId;
  sectionId?: string;
  keywords: string[];
}

export interface SettingsModalProps {
  displayName: string;
  onChangeName: (name: string) => void;
  noiseSuppression: boolean;
  onChangeNoiseSuppression: (on: boolean) => void;
  echoCancellation: boolean;
  onChangeEchoCancellation: (on: boolean) => void;
  autoGainControl: boolean;
  onChangeAutoGainControl: (on: boolean) => void;
  normalizeVoices: boolean;
  onChangeNormalizeVoices: (on: boolean) => void;
  inputDevices: MediaDeviceOption[];
  outputDevices: MediaDeviceOption[];
  inputDeviceId: string;
  onChangeInputDevice: (id: string) => void;
  outputDeviceId: string;
  onChangeOutputDevice: (id: string) => void;
  inputMode: 'voice' | 'ptt';
  onChangeInputMode: (mode: 'voice' | 'ptt') => void;
  vadThreshold: number;
  onChangeVadThreshold: (v: number) => void;
  vadReleaseMs: number;
  onChangeVadReleaseMs: (v: number) => void;
  theme: ThemeName;
  onChangeTheme: (t: ThemeName) => void;
  /** Hide the space banner image and show a shorter, text-only header instead. */
  hideSpaceBanner: boolean;
  onChangeHideSpaceBanner: (on: boolean) => void;
  launchOnStartup: boolean;
  onChangeLaunchOnStartup: (on: boolean) => void;
  closeBehavior: 'quit' | 'tray';
  onChangeCloseBehavior: (b: 'quit' | 'tray') => void;
  alwaysOnTop: boolean;
  onChangeAlwaysOnTop: (on: boolean) => void;
  pushToTalkKey: string;
  onChangePushToTalkKey: (key: string) => void;
  pttMode: 'hold' | 'toggle';
  onChangePttMode: (mode: 'hold' | 'toggle') => void;
  muteKey: string;
  onChangeMuteKey: (key: string) => void;
  muteMode: 'hold' | 'toggle';
  onChangeMuteMode: (mode: 'hold' | 'toggle') => void;
  sfxEnabled: boolean;
  onChangeSfxEnabled: (on: boolean) => void;
  sfxVolume: number;
  onChangeSfxVolume: (vol: number) => void;
  sfxJoinLeaveEnabled: boolean;
  onChangeSfxJoinLeaveEnabled: (on: boolean) => void;
  sfxMuteEnabled: boolean;
  onChangeSfxMuteEnabled: (on: boolean) => void;
  sfxMuteOtherEnabled: boolean;
  onChangeSfxMuteOtherEnabled: (on: boolean) => void;
  sfxTransmitEnabled: boolean;
  onChangeSfxTransmitEnabled: (on: boolean) => void;
  sfxChatEnabled: boolean;
  onChangeSfxChatEnabled: (on: boolean) => void;
  sfxDeafenEnabled: boolean;
  onChangeSfxDeafenEnabled: (on: boolean) => void;
  badgeNotificationsEnabled: boolean;
  onChangeBadgeNotificationsEnabled: (on: boolean) => void;
  /** File sharing: auto-accept transfers from the trusted-users list. */
  autoAcceptEnabled: boolean;
  onChangeAutoAcceptEnabled: (on: boolean) => void;
  autoAcceptUsers: { userId: string; displayName: string }[];
  onRemoveTrustedUser: (userId: string) => void;
  /** Master switch for the whole P2P soundboard feature. */
  soundboardEnabled: boolean;
  onChangeSoundboardEnabled: (on: boolean) => void;
  soundboardVolume: number;
  onChangeSoundboardVolume: (vol: number) => void;
  /** Auto-download other peers' custom soundboard clips in the background. */
  soundboardAutoSyncEnabled: boolean;
  onChangeSoundboardAutoSyncEnabled: (on: boolean) => void;
  soundboardOwnClips: SoundboardLibraryClip[];
  onAddSoundboardFiles: () => void;
  onRemoveSoundboardClip: (hash: string) => void;
  onOpenSoundboardInbox: () => void;
  initialTab?: string;
  micVolume: number;
  onChangeMicVolume: (vol: number) => void;
  outputVolume: number;
  onChangeOutputVolume: (vol: number) => void;

  cameraResolution: string;
  onChangeCameraResolution: (res: string) => void;

  cameraFramerate: string;
  onChangeCameraFramerate: (fps: string) => void;
  screenResolution: string;
  onChangeScreenResolution: (res: string) => void;
  screenFramerate: string;
  onChangeScreenFramerate: (fps: string) => void;
  videoQuality: VideoQuality;
  onChangeVideoQuality: (q: VideoQuality) => void;
  /** Total stage-stream upload budget in Mbps (0 = unlimited). */
  uploadBudgetMbps: number;
  onChangeUploadBudgetMbps: (mbps: number) => void;
  audioQuality: AudioQuality;
  onChangeAudioQuality: (q: AudioQuality) => void;
  uiScale: number;
  onChangeUiScale: (scale: number) => void;
  chatFontScale: number;
  onChangeChatFontScale: (scale: number) => void;
  chatPosition: 'left' | 'right';
  onChangeChatPosition: (pos: 'left' | 'right') => void;
  chatWidthScale: number;
  onChangeChatWidthScale: (scale: number) => void;
  sidebarWidthScale: number;
  onChangeSidebarWidthScale: (scale: number) => void;
  chatTtsEnabled: boolean;
  onChangeChatTtsEnabled: (on: boolean) => void;
  chatTtsSpeakName: boolean;
  onChangeChatTtsSpeakName: (on: boolean) => void;
  chatTtsSpeakOwnMessages: boolean;
  onChangeChatTtsSpeakOwnMessages: (on: boolean) => void;
  chatTtsSpeakWhenFocused: boolean;
  onChangeChatTtsSpeakWhenFocused: (on: boolean) => void;
  reactionsEnabled: boolean;
  onChangeReactionsEnabled: (on: boolean) => void;
  voicePreference: string;
  onChangeVoicePreference: (id: string) => void;
  analyserNode: AnalyserNode | null;
  onClose: () => void;
  avatarDataUrl: string | null;
  selfColor: string;
  onChangeAvatar: (dataUrl: string | null) => void;
  /** Chosen accent color (`#rrggbb`), or '' for auto-assigned. */
  accentColor: string;
  onChangeAccent: (color: string) => void;
  hasCamera?: boolean;
  deafenKey: string;
  onChangeDeafenKey: (key: string) => void;
  deafenMode: 'hold' | 'toggle';
  onChangeDeafenMode: (mode: 'hold' | 'toggle') => void;
  cameraKey: string;
  onChangeCameraKey: (key: string) => void;
  screenShareKey: string;
  onChangeScreenShareKey: (key: string) => void;
  chatPanelKey: string;
  onChangeChatPanelKey: (key: string) => void;
  ttsToggleKey: string;
  onChangeTtsToggleKey: (key: string) => void;
  ttsStopKey: string;
  onChangeTtsStopKey: (key: string) => void;
}
