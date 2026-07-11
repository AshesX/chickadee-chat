/**
 * Signaling protocol contract for Chickadee Chat.
 *
 * Shared by the desktop client and the signaling server so the two can never
 * drift out of sync. The server relays the WebRTC messages (`offer`/`answer`/
 * `ice-candidate`, and `file-signal` for file-transfer connections) verbatim
 * and never inspects their payloads.
 */
import type { RoomType } from './capacity';

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
  /** User-chosen accent color (`#rrggbb`), or '' to fall back to an auto-assigned color. */
  accentColor: string;
  /**
   * Whether this peer is currently rendering video (true) or docked/compact
   * (false). While false, senders pause the *video* of this peer's
   * subscriptions but keep their *audio* flowing (audio-only dock).
   */
  wantsVideo: boolean;
  /**
   * Stable userIds whose video this peer has opted into ("joined"). Video and
   * screen-audio are sent to this peer only for senders in this set; empty =
   * watching nobody (the opt-in default).
   */
  videoSubscriptions: string[];
}

/** A sidebar room entry (local; the server uses arbitrary room ids). */
export interface Room {
  id: string;
  label: string;
  icon: string;
  /** Room kind. 'hybrid' (audio + optional video, 8-cap) going forward; legacy
   *  'voice'/'video'/omitted are normalized to 'hybrid' on load. */
  type?: RoomType;
}

export interface SpacePresence {
  peer: Peer;
  roomId: RoomId | null;
  leftAt?: number;
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
  | { type: 'join'; spaceId: string; room: RoomId | null; displayName: string; userId: string; rooms: Room[]; status?: 'online' | 'idle' | 'dnd'; avatarDataUrl?: string | null; voicePreference?: string; accentColor?: string; secret?: string; bannerDataUrl?: string | null }
  | { type: 'join-room'; room: RoomId | null }
  | { type: 'offer'; to: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; to: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; to: PeerId; candidate: RTCIceCandidateInit }
  // Directed file-transfer handshake, relayed SPACE-wide (unlike the room-scoped
  // offer/answer/ice-candidate above) so a transfer can cross rooms. File BYTES
  // never touch the signaling socket — they flow over a dedicated RTCDataChannel.
  | { type: 'file-offer'; to: PeerId; transferId: string; name: string; size: number }
  | { type: 'file-answer'; to: PeerId; transferId: string; accept: boolean }
  // SDP/ICE for the dedicated file-transfer RTCPeerConnection (sender = offerer,
  // fixed roles — no perfect negotiation). Relayed verbatim, never inspected.
  | { type: 'file-signal'; to: PeerId; transferId: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
  | { type: 'file-cancel'; to: PeerId; transferId: string; reason?: string }
  // Broadcast to the whole room (no `to`); server relays with `from` stamped.
  | { type: 'mic-state'; muted: boolean }
  | { type: 'speaking-state'; speaking: boolean }
  | { type: 'cam-state'; on: boolean }
  | { type: 'screen-state'; streamId: string | null }
  | { type: 'deafen-state'; deafened: boolean }
  | { type: 'status-state'; status: 'online' | 'idle' | 'dnd' }
  | { type: 'avatar-state'; avatarDataUrl: string | null }
  | { type: 'voice-state'; voicePreference: string }
  | { type: 'accent-state'; accentColor: string }
  // This peer's video opt-in state: which userIds it has joined (subscriptions)
  // and whether it's rendering video now (wantsVideo false while docked/compact).
  | { type: 'sink-state'; subscriptions: string[]; wantsVideo: boolean }
  // Claim the single room "stage" slot for a screen or camera (high-quality tile).
  // `force` takes it over from the current holder (after a take-over confirm).
  | { type: 'claim-spotlight'; kind: 'screen' | 'camera'; force?: boolean }
  // Release the stage slot if this peer holds it.
  | { type: 'release-spotlight' }
  // Broadcast room list changes to the active space.
  | { type: 'update-rooms'; spaceId: string; rooms: Room[] }
  // Broadcast space rename to active peers.
  | { type: 'rename-space'; spaceId: string; newSpaceId: string; newSpaceName: string }
  // Claim ownership of this connection's Space if nobody owns it yet
  // (first-claim-wins; no force/take-over — ownership isn't disputed once set).
  | { type: 'claim-ownership' }
  // Owner-only: set/clear this connection's Space banner. Silently ignored
  // server-side if the sender isn't the recorded owner.
  | { type: 'set-banner'; bannerDataUrl: string | null }
  // Non-mutating existence probe — answered before/without joining. A Space "exists"
  // only while ≥1 member is currently connected (the server is in-memory).
  | { type: 'check-space'; spaceId: string; secret?: string }
  // Ephemeral room chat (a reaction is a chat with `reaction: true`).
  | { type: 'chat'; text: string; reaction?: boolean }
  // Liveness check so the client can detect a dead/half-open connection.
  | { type: 'ping' };

/** Messages sent from the signaling server down to a client. */
export type ServerMessage =
  | { type: 'space-presence'; presence: SpacePresence[] }
  | { type: 'space-peer-update'; presence: SpacePresence }
  | { type: 'space-peer-remove'; userId: string }
  // Sent to the newcomer right after a successful join. Carries the room's current
  // stage holder (spotlight) so a mid-join client renders theater immediately —
  // broadcasts only reach existing members (same reason peers carry screenStreamId).
  // `ownerId`/`bannerDataUrl` are only populated on a fresh Space join, never on
  // a same-space room switch — absence there means "no update," not "cleared,"
  // since owner/banner are Space-scoped and must survive a room switch.
  | { type: 'welcome'; selfId: PeerId; peers: Peer[]; rooms: Room[]; wasEmpty?: boolean; spotlightHolderId?: PeerId | null; spotlightKind?: 'screen' | 'camera' | null; ownerId?: string | null; bannerDataUrl?: string | null }
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
  // Relayed file-transfer handshake (space-wide, directed), `from` stamped.
  | { type: 'file-offer'; from: PeerId; transferId: string; name: string; size: number }
  | { type: 'file-answer'; from: PeerId; transferId: string; accept: boolean }
  | { type: 'file-signal'; from: PeerId; transferId: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
  | { type: 'file-cancel'; from: PeerId; transferId: string; reason?: string }
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
  // A peer changed their accent color; broadcast to all space members.
  | { type: 'accent-state'; from: PeerId; accentColor: string }
  // A peer updated its video opt-in state (joined subscriptions and/or dock
  // state); broadcast to the room (the mesh is room-scoped).
  | { type: 'sink-state'; from: PeerId; subscriptions: string[]; wantsVideo: boolean }
  // The room's stage holder changed (null = stage free). Broadcast to the whole room.
  | { type: 'spotlight-state'; holderId: PeerId | null; kind: 'screen' | 'camera' | null }
  // Reply to a `claim-spotlight` that lost to the current holder (no `force`) —
  // drives the take-over prompt on the claimant.
  | { type: 'spotlight-busy'; holderId: PeerId }
  // Broadcast room list changes to the active space.
  | { type: 'rooms-updated'; spaceId: string; rooms: Room[] }
  // Broadcast space rename to all clients in the space.
  | { type: 'space-renamed'; spaceId: string; newSpaceId: string; newSpaceName: string }
  // The Space's owner was (re)established; broadcast to every space member.
  | { type: 'owner-state'; spaceId: string; ownerId: string | null }
  // The Space's banner changed (or was cleared); broadcast to every space member.
  | { type: 'banner-state'; spaceId: string; bannerDataUrl: string | null; updatedBy: string }
  // Relayed room chat / reaction.
  | { type: 'chat'; from: PeerId; text: string; reaction?: boolean }
  // Reply to a client ping.
  | { type: 'pong' };

/** Union of every message that can travel over the signaling socket. */
export type SignalMessage = ClientMessage | ServerMessage;

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
