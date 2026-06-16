/**
 * Signaling protocol contract for Chickadee Chat.
 *
 * Shared by the desktop client and the signaling server so the two can never
 * drift out of sync. The server relays the WebRTC messages (`offer`/`answer`/
 * `ice-candidate`) verbatim and never inspects their payloads.
 */

/** Maximum number of peers allowed in a single room (full-mesh limit). */
export const MAX_PEERS_PER_ROOM = 4;

// --- Input bounds (enforced server-side; reused client-side for defense in depth) ---
/** Max length of a chat message / reaction. */
export const CHAT_MAX_LEN = 500;
/** Max length of a display name. */
export const MAX_DISPLAY_NAME_LEN = 32;
/** Max length of a TTS voice-category id. */
export const MAX_VOICE_PREF_LEN = 32;
/** Max length of an id-like field (userId / spaceId / roomId). */
export const MAX_ID_LEN = 128;
/**
 * Max length of an avatar data URL. A 128×128 WebP/JPEG is typically 10–30 KB
 * of base64; 256 KB is a generous ceiling that still stops amplification abuse.
 */
export const MAX_AVATAR_DATA_URL_LEN = 256 * 1024;

const AVATAR_DATA_URL_RE = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Validate an untrusted avatar value: must be a base64 PNG/JPEG/WebP data URL
 * within the size cap. Returns the value if valid, else null. Used by the
 * signaling server on intake and by the renderer before binding to an <img>.
 */
export function sanitizeAvatarDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length > MAX_AVATAR_DATA_URL_LEN) return null;
  return AVATAR_DATA_URL_RE.test(value) ? value : null;
}

/** Coerce an untrusted value to a trimmed string capped at `max` chars (default '' on non-strings). */
export function clampString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** The valid presence statuses. */
export const PRESENCE_STATUSES = ['online', 'idle', 'dnd'] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

/** Narrow an untrusted value to a PresenceStatus, defaulting to 'online'. */
export function sanitizeStatus(value: unknown): PresenceStatus {
  return PRESENCE_STATUSES.includes(value as PresenceStatus) ? (value as PresenceStatus) : 'online';
}

export type RoomId = string;
export type PeerId = string;

export interface Peer {
  id: PeerId;
  /** Stable per-user id (client-generated, persisted) for recognizing friends. */
  userId: string;
  displayName: string;
  /** Whether this peer's microphone is currently muted (tracked server-side). */
  muted: boolean;
  /** Whether this peer is actively speaking/transmitting (drives the speaking ripple). */
  speaking: boolean;
  /** Whether this peer's camera is currently on (tracked server-side). */
  cameraOn: boolean;
  /**
   * The MediaStream id of this peer's active screen share, or null if not
   * sharing. Lets receivers tell the screen stream apart from the camera
   * stream, and lets mid-share joiners classify it correctly.
   */
  screenStreamId: string | null;
  /** Whether this peer is currently deafened. */
  deafened: boolean;
  /** The presence status of this peer: 'online' | 'idle' | 'dnd'. */
  status: 'online' | 'idle' | 'dnd';
  /** Custom avatar as a base64 data URL (128×128 WebP/JPEG), or null. */
  avatarDataUrl: string | null;
  /** Generic TTS voice-category id others use to read this peer's chat aloud (e.g. 'uk-female'); '' = system default. */
  voicePreference: string;
}

/** A sidebar room entry (local; the server uses arbitrary room ids). */
export interface Room {
  id: string;
  label: string;
  icon: string;
}



export interface SpaceInfo {
  id: string;
  name: string;
  rooms: Room[];
  customSignalingUrl?: string;
  joinSecret?: string;
}

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
  /**
   * How the mic transmits: 'open' = always live, 'voice' = gated by VAD
   * threshold, 'ptt' = push-to-talk via the hotkey. Replaces the old
   * `pttEnabled` boolean (migrated in main: pttEnabled true → 'ptt').
   */
  inputMode: 'open' | 'voice' | 'ptt';
  /** RMS gate level (0..1) for voice-activation mode. */
  vadThreshold: number;
  /** Hangover (ms) the voice-activation gate stays open after the level drops. */
  vadReleaseMs: number;
  /** Open-mic downward expander: attenuate background noise when not speaking. */
  openMicNoiseReductionEnabled: boolean;
  /** RMS speech threshold (0..1) for the open-mic expander (separate from vadThreshold). */
  openMicThreshold: number;
  /** Attenuation floor in dB (negative, e.g. -20) applied below the threshold. */
  openMicReductionDb: number;
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
  uiScale: number;
  /** Open the app automatically when the OS starts (packaged builds). */
  launchOnStartup: boolean;
  /** What the window 'X' does: 'quit' the app or hide to 'tray'. */
  closeBehavior: 'quit' | 'tray';
  /** Pin the window above all other apps. */
  alwaysOnTop: boolean;
  /** Active color theme. */
  theme: 'midnight' | 'classic' | 'oled';
  /** Chat Font Scale (relative to normal, e.g. 0.5 to 2.0). */
  chatFontScale: number;
  /** Chat Panel Position (left or right). */
  chatPosition: 'left' | 'right';
  /** Chat Width Scale (relative to normal, e.g. 1.0 to 2.0). */
  chatWidthScale: number;
  /** Read incoming chat messages aloud (Web Speech API) when the app is unfocused. */
  chatTtsEnabled: boolean;
  /** Speak the "[name] says:" prefix before each read-aloud message; false = message text only. */
  chatTtsSpeakName: boolean;
  /** Generic TTS voice-category id peers use to read this user's chat aloud (e.g. 'uk-female'); '' = system default. */
  voicePreference: string;
  /** User's custom avatar as a base64 data URL (128×128 WebP/JPEG), or null. */
  avatarDataUrl: string | null;
  defaultVideoAction: 'camera' | 'screen';
}

export const DEFAULT_ROOMS: Room[] = [
  { id: 'general', label: 'General', icon: '💬' },
  { id: 'gaming', label: 'Gaming', icon: '🎮' },
  { id: 'lounge', label: 'Lounge', icon: '🛋️' },
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
    autoGainControl: false,
    normalizeVoices: false,
    peerVolumes: {},
    inputMode: 'voice',
    vadThreshold: 0.04,
    vadReleaseMs: 500,
    openMicNoiseReductionEnabled: true,
    openMicThreshold: 0.04,
    openMicReductionDb: -20,
    inputDeviceId: '',
    outputDeviceId: '',
    // Default to F8 — captured system-wide, so Space would swallow the spacebar in-game.
    pushToTalkKey: 'F8',
    pttMode: 'hold',
    sfxEnabled: true,
    sfxVolume: 0.25,
    sfxJoinLeaveEnabled: true,
    sfxMuteEnabled: true,
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
    uiScale: 1.0,
    launchOnStartup: false,
    closeBehavior: 'quit',
    alwaysOnTop: false,
    theme: 'midnight',
    chatFontScale: 1.0,
    chatPosition: 'right',
    chatWidthScale: 1.0,
    chatTtsEnabled: false,
    chatTtsSpeakName: true,
    voicePreference: '',
    avatarDataUrl: null,
    defaultVideoAction: 'camera',
  };
}

/** A capturable screen or window, enumerated by the main process for the picker. */
export interface ScreenSource {
  id: string;
  name: string;
  /** Pre-rendered thumbnail as a data URL. */
  thumbnail: string;
  /** App icon as a data URL (windows only), or null. */
  appIcon: string | null;
}

/** Messages sent from a client up to the signaling server. */
export type ClientMessage =
  | { type: 'join'; spaceId: string; room: RoomId | null; displayName: string; userId: string; rooms: Room[]; status?: 'online' | 'idle' | 'dnd'; avatarDataUrl?: string | null; voicePreference?: string; secret?: string }
  | { type: 'join-room'; room: RoomId | null }
  | { type: 'offer'; to: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; to: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; to: PeerId; candidate: RTCIceCandidateInit }
  // Broadcast to the whole room (no `to`); server relays with `from` stamped.
  | { type: 'mic-state'; muted: boolean }
  | { type: 'speaking-state'; speaking: boolean }
  | { type: 'cam-state'; on: boolean }
  | { type: 'screen-state'; streamId: string | null }
  | { type: 'deafen-state'; deafened: boolean }
  | { type: 'status-state'; status: 'online' | 'idle' | 'dnd' }
  | { type: 'avatar-state'; avatarDataUrl: string | null }
  | { type: 'voice-state'; voicePreference: string }
  // Broadcast room list changes to the active space.
  | { type: 'update-rooms'; spaceId: string; rooms: Room[] }
  // Broadcast space rename to active peers.
  | { type: 'rename-space'; spaceId: string; newSpaceId: string; newSpaceName: string }
  // Non-mutating existence probe — answered before/without joining. A Space "exists"
  // only while ≥1 member is currently connected (the server is in-memory).
  | { type: 'check-space'; spaceId: string; secret?: string }
  // Ephemeral room chat (a reaction is a chat with `reaction: true`).
  | { type: 'chat'; text: string; reaction?: boolean }
  // Liveness check so the client can detect a dead/half-open connection.
  | { type: 'ping' };

export interface SpacePresence {
  peer: Peer;
  roomId: RoomId | null;
  leftAt?: number;
}

/** Messages sent from the signaling server down to a client. */
export type ServerMessage =
  | { type: 'space-presence'; presence: SpacePresence[] }
  | { type: 'space-peer-update'; presence: SpacePresence }
  | { type: 'space-peer-remove'; userId: string }
  // Sent to the newcomer right after a successful join.
  | { type: 'welcome'; selfId: PeerId; peers: Peer[]; rooms: Room[]; wasEmpty?: boolean }
  // Sent to existing peers when someone new joins.
  | { type: 'peer-joined'; peer: Peer }
  // Sent to remaining peers when someone disconnects.
  | { type: 'peer-left'; peerId: PeerId }
  // Sent to the newcomer if the room is already full.
  | { type: 'room-full'; room: RoomId }
  // Reply to `check-space`: whether the Space currently has ≥1 connected member.
  | { type: 'space-status'; spaceId: string; exists: boolean }
  // Relayed WebRTC signaling, with `from` stamped by the server.
  | { type: 'offer'; from: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; from: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; from: PeerId; candidate: RTCIceCandidateInit }
  // A peer toggled their mic; broadcast to everyone else in the room.
  | { type: 'mic-state'; from: PeerId; muted: boolean }
  // A peer started/stopped speaking; broadcast to everyone else in the room.
  | { type: 'speaking-state'; from: PeerId; speaking: boolean }
  // A peer toggled their camera; broadcast to everyone else in the room.
  | { type: 'cam-state'; from: PeerId; on: boolean }
  // A peer started/stopped sharing their screen (streamId null = stopped).
  | { type: 'screen-state'; from: PeerId; streamId: string | null }
  // A peer toggled their deafen state; broadcast to everyone else in the room.
  | { type: 'deafen-state'; from: PeerId; deafened: boolean }
  // A peer updated their presence status; broadcast to everyone else in the room.
  | { type: 'status-state'; from: PeerId; status: 'online' | 'idle' | 'dnd' }
  // A peer updated their avatar; broadcast to all space members.
  | { type: 'avatar-state'; from: PeerId; avatarDataUrl: string | null }
  // A peer changed the voice others use to read their chat aloud; broadcast to the room.
  | { type: 'voice-state'; from: PeerId; voicePreference: string }
  // Broadcast room list changes to the active space.
  | { type: 'rooms-updated'; spaceId: string; rooms: Room[] }
  // Broadcast space rename to all clients in the space.
  | { type: 'space-renamed'; spaceId: string; newSpaceId: string; newSpaceName: string }
  // Relayed room chat / reaction.
  | { type: 'chat'; from: PeerId; text: string; reaction?: boolean }
  // Reply to a client ping.
  | { type: 'pong' };

/** Union of every message that can travel over the signaling socket. */
export type SignalMessage = ClientMessage | ServerMessage;

/** STUN lets peers discover their public address; free and always included. */
export const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

/**
 * Free public TURN relay (OpenRelay) used as a best-effort default so cross-NAT
 * play works out of the box. It is rate-limited and may be down — for reliable
 * internet play, override it with your own coturn/hosted TURN via the
 * CHICKADEE_TURN_URL / CHICKADEE_TURN_USERNAME / CHICKADEE_TURN_CREDENTIAL env
 * vars (see README "Play over the internet").
 */
export const PUBLIC_TURN_SERVERS: RTCIceServer[] = [
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

/** Renderer fallback when the main process didn't supply a configured set. */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [...STUN_SERVERS, ...PUBLIC_TURN_SERVERS];

function parseTyped<T extends { type: string }>(data: string): T | null {
  try {
    const parsed = JSON.parse(data) as T;
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Parse inbound data on the server (only client messages arrive here). */
export function parseClientMessage(data: string): ClientMessage | null {
  return parseTyped<ClientMessage>(data);
}

/** Parse inbound data on the client (only server messages arrive here). */
export function parseServerMessage(data: string): ServerMessage | null {
  return parseTyped<ServerMessage>(data);
}
