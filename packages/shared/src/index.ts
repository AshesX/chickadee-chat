/**
 * Signaling protocol contract for Chickadee Chat.
 *
 * Shared by the desktop client and the signaling server so the two can never
 * drift out of sync. The server relays the WebRTC messages (`offer`/`answer`/
 * `ice-candidate`) verbatim and never inspects their payloads.
 */

/** Maximum number of peers allowed in a single room (full-mesh limit). */
export const MAX_PEERS_PER_ROOM = 4;

export type RoomId = string;
export type PeerId = string;

export interface Peer {
  id: PeerId;
  /** Stable per-user id (client-generated, persisted) for recognizing friends. */
  userId: string;
  displayName: string;
  /** Whether this peer's microphone is currently muted (tracked server-side). */
  muted: boolean;
  /** Whether this peer's camera is currently on (tracked server-side). */
  cameraOn: boolean;
  /**
   * The MediaStream id of this peer's active screen share, or null if not
   * sharing. Lets receivers tell the screen stream apart from the camera
   * stream, and lets mid-share joiners classify it correctly.
   */
  screenStreamId: string | null;
  /** Short tag for the game this peer is playing (e.g. "DRG"), or null. */
  game: string | null;
}

/** A sidebar room entry (local; the server uses arbitrary room ids). */
export interface Room {
  id: string;
  label: string;
  icon: string;
}

/** A remembered friend, keyed by stable userId. */
export interface StoredFriend {
  userId: string;
  name: string;
  color: string;
}

/** Settings persisted to Electron userData (the renderer reads/writes via IPC). */
export interface PersistedSettings {
  /** Stable per-user id; generated once in main if missing. */
  userId: string;
  displayName: string;
  rooms: Room[];
  friends: StoredFriend[];
  chatVisible: boolean;
  noiseSuppression: boolean;
  pttEnabled: boolean;
  /** Electron accelerator for the global push-to-talk hotkey. */
  pushToTalkKey: string;
  /** 'hold' = mic live while key held; 'toggle' = press to unmute/mute. */
  pttMode: 'hold' | 'toggle';
}

export const DEFAULT_ROOMS: Room[] = [
  { id: 'lobby', label: 'Lobby', icon: '🏠' },
  { id: 'dungeon', label: 'Dungeon Run', icon: '⚔️' },
  { id: 'chill', label: 'Chill Zone', icon: '🎮' },
];

export function defaultSettings(): PersistedSettings {
  return {
    userId: '',
    displayName: '',
    rooms: DEFAULT_ROOMS,
    friends: [],
    chatVisible: false,
    noiseSuppression: true,
    pttEnabled: false,
    // Default to F8 — captured system-wide, so Space would swallow the spacebar in-game.
    pushToTalkKey: 'F8',
    pttMode: 'hold',
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
  | { type: 'join'; room: RoomId; displayName: string; userId: string }
  | { type: 'offer'; to: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; to: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; to: PeerId; candidate: RTCIceCandidateInit }
  // Broadcast to the whole room (no `to`); server relays with `from` stamped.
  | { type: 'mic-state'; muted: boolean }
  | { type: 'cam-state'; on: boolean }
  | { type: 'screen-state'; streamId: string | null }
  | { type: 'game-state'; game: string | null }
  // Ephemeral room chat (a reaction is a chat with `reaction: true`).
  | { type: 'chat'; text: string; reaction?: boolean }
  // Liveness check so the client can detect a dead/half-open connection.
  | { type: 'ping' };

/** Messages sent from the signaling server down to a client. */
export type ServerMessage =
  // Sent to the newcomer right after a successful join.
  | { type: 'welcome'; selfId: PeerId; peers: Peer[] }
  // Sent to existing peers when someone new joins.
  | { type: 'peer-joined'; peer: Peer }
  // Sent to remaining peers when someone disconnects.
  | { type: 'peer-left'; peerId: PeerId }
  // Sent to the newcomer if the room is already full.
  | { type: 'room-full'; room: RoomId }
  // Relayed WebRTC signaling, with `from` stamped by the server.
  | { type: 'offer'; from: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; from: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; from: PeerId; candidate: RTCIceCandidateInit }
  // A peer toggled their mic; broadcast to everyone else in the room.
  | { type: 'mic-state'; from: PeerId; muted: boolean }
  // A peer toggled their camera; broadcast to everyone else in the room.
  | { type: 'cam-state'; from: PeerId; on: boolean }
  // A peer started/stopped sharing their screen (streamId null = stopped).
  | { type: 'screen-state'; from: PeerId; streamId: string | null }
  // A peer's detected game changed (null = none).
  | { type: 'game-state'; from: PeerId; game: string | null }
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
