/**
 * Client-persisted settings schema + defaults (written to Electron userData by
 * the desktop app; the server never sees these).
 */
import type { BannedUser, Room } from './protocol';

export interface SpaceInfo {
  id: string;
  name: string;
  rooms: Room[];
  customSignalingUrl?: string;
  joinSecret?: string;
  /**
   * Stable userId of this Space's creator/owner — currently the only member
   * allowed to set/change the banner. null/undefined = unknown/unclaimed:
   * either a pre-existing Space created before this feature shipped, or (rare)
   * a Space whose server-side owner record was lost across a full server
   * restart. Any future owner-exclusive feature (kick, room-edit gating, etc.)
   * should reuse this field rather than inventing a parallel ownership notion.
   */
  ownerId?: string | null;
  /**
   * Space banner — a hero image shown full-bleed behind the centered name in
   * the sidebar header (replaces the old small circular Space icon entirely).
   * WebP/JPEG, authored for the sidebar's widest resizable state. null/undefined
   * = no banner (flat compact header, name only).
   */
  bannerDataUrl?: string | null;
  /**
   * Mirror of the Space's ban list, persisted by EVERY member (it arrives on
   * space-wide `ban-state` broadcasts). Only the owner's copy is authoritative
   * enough to matter: after a signaling-server restart wipes the in-memory
   * list, the (possibly newly transferred) owner re-seeds it via
   * `seed-moderation`. undefined = never seen a ban-state (treat as []).
   */
  bannedUsers?: BannedUser[];
  /**
   * Mirror of the Space's lock-to-newcomers flag, persisted like `bannedUsers`
   * and re-seeded by the owner the same way. undefined = never seen (false).
   */
  locked?: boolean;
}

/** Active color theme identifier. */
export type ThemeName = 'light' | 'dark';

/**
 * Outbound streaming quality tier. Governs the per-sender bitrate caps for
 * camera/screen video and the Opus audio target (see `computeMeshEncoding`).
 * `'max'` leaves video uncapped and audio stereo (Chromium defaults); the other
 * tiers progressively trade quality for bandwidth/CPU in the full mesh.
 */
export type VideoQuality = 'max' | 'high' | 'balanced' | 'saver';
export type AudioQuality = 'max' | 'high' | 'balanced' | 'saver';

/** Settings persisted to Electron userData (the renderer reads/writes via IPC). */
export interface PersistedSettings {
  /** Stable per-user id; generated once in main if missing. */
  userId: string;
  displayName: string;
  spaces: SpaceInfo[];
  activeSpaceId: string | null;
  chatVisible: boolean;
  noiseSuppression: boolean;
  /** Chromium echo-cancellation constraint on the local mic. */
  echoCancellation: boolean;
  /** Chromium automatic-gain-control constraint on the local mic. */
  autoGainControl: boolean;
  /** Listener-side auto-level: compress + makeup-gain incoming peer audio to even out quiet/loud talkers. */
  normalizeVoices: boolean;
  /** Per-peer output volume (0–2) keyed by stable userId, so manual boosts persist across sessions/reconnects. */
  peerVolumes: Record<string, number>;
  /** Per-peer screen-share audio volume (0–2), independent of peerVolumes (voice). Keyed by stable userId. */
  peerScreenVolumes: Record<string, number>;
  /**
   * How the mic transmits: 'voice' = gated by VAD threshold, 'ptt' =
   * push-to-talk via the hotkey. (The legacy always-live 'open' mode was
   * removed; persisted 'open' is migrated to 'voice' in the renderer store.)
   */
  inputMode: 'voice' | 'ptt';
  /** RMS gate level (0..1) for voice-activation mode. */
  vadThreshold: number;
  /** Hangover (ms) the voice-activation gate stays open after the level drops. */
  vadReleaseMs: number;
  /** Preferred mic deviceId, or '' for the system default. */
  inputDeviceId: string;
  /** Preferred speaker deviceId (setSinkId), or '' for the system default. */
  outputDeviceId: string;
  /** Electron accelerator for the global push-to-talk hotkey. */
  pushToTalkKey: string;
  /** 'hold' = mic live while key held; 'toggle' = press to unmute/mute. */
  pttMode: 'hold' | 'toggle';
  sfxEnabled: boolean;
  sfxVolume: number;
  sfxJoinLeaveEnabled: boolean;
  sfxMuteEnabled: boolean;
  sfxMuteOtherEnabled: boolean;
  sfxTransmitEnabled: boolean;
  sfxChatEnabled: boolean;
  sfxDeafenEnabled: boolean;
  badgeNotificationsEnabled: boolean;
  status: 'online' | 'idle' | 'dnd';
  micVolume: number;
  /** Master output volume multiplier (0–1) applied to all peer audio. */
  outputVolume: number;
  muteKey: string;
  muteMode: 'hold' | 'toggle';

  cameraResolution: string;
  cameraFramerate: string;
  screenResolution: string;
  screenFramerate: string;
  /** Outbound video quality tier (bitrate caps for camera + screen). */
  videoQuality: VideoQuality;
  /** Outbound audio quality tier (Opus bitrate cap + mono/stereo). */
  audioQuality: AudioQuality;
  /**
   * Total outbound bitrate (in Mbps) the single stage stream may consume across
   * all its viewers combined. Caps per-viewer bitrate to budget/viewers so the
   * full mesh stays safe as a room fills. `0` = unlimited (tier cap only).
   */
  uploadBudgetMbps: number;
  uiScale: number;
  /** Open the app automatically when the OS starts (packaged builds). */
  launchOnStartup: boolean;
  /** What the window 'X' does: 'quit' the app or hide to 'tray'. */
  closeBehavior: 'quit' | 'tray';
  /** Pin the window above all other apps. */
  alwaysOnTop: boolean;
  /** Active color theme. */
  theme: ThemeName;
  /** Chat Font Scale (relative to normal, e.g. 0.5 to 2.0). */
  chatFontScale: number;
  /** Chat Panel Position (left or right). */
  chatPosition: 'left' | 'right';
  /** Chat Width Scale (relative to normal, e.g. 1.0 to 2.0). */
  chatWidthScale: number;
  /** Sidebar Width Scale (relative to normal, e.g. 1.0 to 2.0). */
  sidebarWidthScale: number;
  /** Read incoming chat messages aloud (Web Speech API) when the app is unfocused. */
  chatTtsEnabled: boolean;
  /** Speak the "[name] says:" prefix before each read-aloud message; false = message text only. */
  chatTtsSpeakName: boolean;
  /** Also read your own sent chat messages aloud, not just incoming ones. */
  chatTtsSpeakOwnMessages: boolean;
  /** Read chat messages aloud even while the app window is focused (not just unfocused). */
  chatTtsSpeakWhenFocused: boolean;
  /** Generic TTS voice-category id peers use to read this user's chat aloud (e.g. 'uk-female'); '' = system default. */
  voicePreference: string;
  /** User's custom avatar as a base64 data URL (128×128 WebP/JPEG), or null. */
  avatarDataUrl: string | null;
  /** User-chosen accent color (`#rrggbb`), or '' to fall back to an auto-assigned color. */
  accentColor: string;
  defaultVideoAction: 'camera' | 'screen';
  deafenKey: string;
  deafenMode: 'hold' | 'toggle';
  cameraKey: string;
  screenShareKey: string;
  chatPanelKey: string;
  ttsToggleKey: string;
  ttsStopKey: string;
  /** Sidebar-only dock mode: window shrinks, room header/grid/control-bar hidden. */
  compactMode: boolean;
  /** Whether the sidebar ROOMS section is collapsed. */
  roomsSectionCollapsed: boolean;
  /** Hide the space banner image and show a shorter, text-only header instead. */
  hideSpaceBanner: boolean;
  /** Custom favorite emojis for the picker. */
  customEmojis: string[];
  /** Exactly 6 emojis used for quick reactions in the UI. */
  quickReactions: string[];
  /**
   * Show floating emoji reactions in the room and the control-bar "React"
   * button. false = hide incoming reactions from other users AND the React
   * button (the button's flanking divider collapses too).
   */
  reactionsEnabled: boolean;
  /** Master switch for the file-transfer trust list (pause without clearing it). */
  autoAcceptEnabled: boolean;
  /**
   * Users whose file transfers auto-accept (skip the prompt + save dialog and
   * stream straight to Downloads). Keyed by stable userId; displayName is a
   * snapshot from when trust was granted so the Settings list renders offline
   * users too.
   */
  autoAcceptUsers: { userId: string; displayName: string }[];
  /**
   * Master switch for the whole P2P soundboard feature: the control-bar
   * button, background manifest sync, playback, and the local ingest watcher
   * all gate on this (off = no ffmpeg spawns, not just a hidden button).
   */
  soundboardEnabled: boolean;
  /** Soundboard clip playback volume (0-2) — separate from sfxVolume since these are full-fidelity user clips, not UI chimes. */
  soundboardVolume: number;
  /** Auto-download other peers' custom soundboard clips in the background. */
  soundboardAutoSyncEnabled: boolean;
}

export const DEFAULT_ROOMS: Room[] = [
  { id: 'general', label: 'General', icon: 'chat-bubble', type: 'hybrid' },
  { id: 'gaming', label: 'Gaming', icon: 'dice-twenty-faces-twenty', type: 'hybrid' },
  { id: 'lounge', label: 'Lounge', icon: 'sofa', type: 'hybrid' },
];

export function defaultSettings(): PersistedSettings {
  return {
    userId: '',
    displayName: '',
    spaces: [],
    activeSpaceId: null,
    chatVisible: false,
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    normalizeVoices: true,
    peerVolumes: {},
    peerScreenVolumes: {},
    inputMode: 'voice',
    vadThreshold: 0.1,
    vadReleaseMs: 500,
    inputDeviceId: '',
    outputDeviceId: '',
    // Default to unbound
    pushToTalkKey: '',
    pttMode: 'hold',
    sfxEnabled: true,
    sfxVolume: 0.25,
    sfxJoinLeaveEnabled: true,
    sfxMuteEnabled: true,
    sfxMuteOtherEnabled: true,
    sfxTransmitEnabled: false,
    sfxChatEnabled: true,
    sfxDeafenEnabled: true,
    badgeNotificationsEnabled: true,
    status: 'online',
    micVolume: 1.0,
    outputVolume: 1.0,
    muteKey: '',
    muteMode: 'toggle',

    cameraResolution: '720p',
    cameraFramerate: '30',
    screenResolution: '1080p',
    screenFramerate: '30',
    videoQuality: 'high',
    audioQuality: 'high',
    uploadBudgetMbps: 12,
    uiScale: 1.0,
    launchOnStartup: false,
    closeBehavior: 'quit',
    alwaysOnTop: false,
    theme: 'dark',
    chatFontScale: 1.0,
    chatPosition: 'right',
    chatWidthScale: 1.0,
    sidebarWidthScale: 1.0,
    chatTtsEnabled: false,
    chatTtsSpeakName: true,
    chatTtsSpeakOwnMessages: true,
    chatTtsSpeakWhenFocused: true,
    voicePreference: '',
    avatarDataUrl: null,
    accentColor: '',
    defaultVideoAction: 'screen',
    deafenKey: '',
    deafenMode: 'toggle',
    cameraKey: '',
    screenShareKey: '',
    chatPanelKey: '',
    ttsToggleKey: '',
    ttsStopKey: '',
    compactMode: false,
    roomsSectionCollapsed: false,
    hideSpaceBanner: false,
    customEmojis: [],
    quickReactions: ['🔥', '😂', '👍', '❤️', '🎉', '💀'],
    reactionsEnabled: true,
    autoAcceptEnabled: true,
    autoAcceptUsers: [],
    soundboardEnabled: true,
    soundboardVolume: 1.0,
    soundboardAutoSyncEnabled: true,
  };
}
