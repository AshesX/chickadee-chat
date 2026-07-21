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
  /**
   * This peer's custom (non-preset) soundboard clips, advertised for P2P
   * sync — presets need no sync since they're bundled identically in every
   * build. Space-wide identity data, like avatarDataUrl.
   */
  soundboardClips: SoundboardClipMeta[];
}

/** A sidebar room entry (local; the server uses arbitrary room ids). */
export interface Room {
  id: string;
  label: string;
  icon: string;
  /** Room kind. 'hybrid' (audio + optional video, 8-cap) going forward; legacy
   *  'voice'/'video'/omitted are normalized to 'hybrid' on load. */
  type?: RoomType;
  /**
   * Stable userId of the member who created this room. Drives room governance:
   * a standard member may hold ONE room they created (rename/delete it only);
   * the Space Owner manages every room. undefined = legacy/default room —
   * owner-managed only, counts against nobody's quota. Stamped server-side on
   * create (client-asserted values for surviving rooms are ignored) and
   * persisted with the room list, so it survives server restarts via the
   * normal room-list re-seed.
   */
  createdBy?: string;
}

export interface SpacePresence {
  peer: Peer;
  roomId: RoomId | null;
  leftAt?: number;
}

/**
 * A Space ban entry. Keyed on the stable (client-asserted) userId — an
 * honor-system deterrent, not a security boundary. The display name is
 * captured at ban time so the owner's unban UI stays readable after the
 * banned user's presence record is long gone.
 */
export interface BannedUser {
  userId: string;
  displayName: string;
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

/**
 * A clip in this user's own soundboard library, enumerated by the main
 * process (which owns the content-addressed cache and the ffmpeg ingest
 * pipeline) and reported to the renderer over IPC. Same fields as
 * `SoundboardClipMeta` (the wire-protocol shape advertised to peers) today,
 * but kept as a separate type — they represent different domain concepts
 * (an owned-library entry the user manages in Settings vs. metadata
 * advertised to peers), and the seam leaves room for future local-only
 * fields without touching the wire protocol.
 */
export interface SoundboardLibraryClip {
  /** Content hash (SHA-256 hex) of the transcoded clip — also its cache filename. */
  hash: string;
  name: string;
  durationMs: number;
  sizeBytes: number;
}

/**
 * A custom soundboard clip as advertised to peers (the wire-protocol shape).
 * Unlike `SoundboardLibraryClip`, this never carries `sourceFile` — peers
 * don't need to know your local inbox filename, only enough to detect a
 * missing clip (hash), render it before it's synced (name/durationMs), and
 * size a receive queue for it (sizeBytes) once a P2P fetch actually starts.
 */
export interface SoundboardClipMeta {
  hash: string;
  name: string;
  durationMs: number;
  sizeBytes: number;
}

/** Messages sent from a client up to the signaling server. */
export type ClientMessage =
  | { type: 'join'; spaceId: string; room: RoomId | null; displayName: string; userId: string; rooms: Room[]; status?: 'online' | 'idle' | 'dnd'; avatarDataUrl?: string | null; voicePreference?: string; accentColor?: string; secret?: string; bannerDataUrl?: string | null; soundboardClips?: SoundboardClipMeta[] }
  | { type: 'join-room'; room: RoomId | null }
  | { type: 'offer'; to: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; to: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; to: PeerId; candidate: RTCIceCandidateInit }
  // "Close your media-mesh link to me; my fresh offer follows on this socket."
  // Needed because a recreated RTCPeerConnection mints a new DTLS certificate,
  // so its offer can never be accepted by the remote's OLD connection — both
  // sides must rebuild. Room-scoped like offer/answer (media-mesh recovery).
  | { type: 'relink'; to: PeerId }
  // Directed file-transfer handshake, relayed SPACE-wide (unlike the room-scoped
  // offer/answer/ice-candidate above) so a transfer can cross rooms. File BYTES
  // never touch the signaling socket — they flow over a dedicated RTCDataChannel.
  // `files` present = a multi-file batch (2..MAX_BATCH_FILES); `transferId` is
  // then the batch id, `name`/`size` summarize (first name, total bytes), and
  // per-file transfers use DERIVED ids `${transferId}:${index}` in file-signal.
  // file-answer/file-cancel always carry the ROOT id (batch-wide semantics).
  | { type: 'file-offer'; to: PeerId; transferId: string; name: string; size: number; files?: { name: string; size: number }[] }
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
  // This peer's own custom-clip library changed; broadcast to the whole space
  // (like avatar/accent) since your soundboard is identity-level, not room-level.
  | { type: 'soundboard-manifest-state'; clips: SoundboardClipMeta[] }
  // A soundboard clip was triggered; broadcast ROOM-only (like chat) — playback
  // should only reach peers currently sharing a voice room, unlike the manifest.
  | { type: 'soundboard-trigger'; source: 'preset' | 'custom'; clipId: string }
  // Directed, SPACE-scoped relay for the silent background clip-byte pull
  // (shape mirrors file-offer/file-signal/file-cancel, deliberately NOT reusing
  // those types — useFileTransfers pattern-matches on them and must never
  // mistake this traffic for a user-facing transfer). `requestId` is the batch
  // id on -request/-cancel; soundboard-fetch-signal's `requestId` instead
  // carries the DERIVED per-clip id `${requestId}:${index}`
  // (fileTransferPolicy.makeBatchFileId) — always the derived form, even for a
  // single-hash request, since (unlike file transfer) there's no user-facing
  // single-vs-batch UX distinction to preserve here. There is deliberately no
  // "answer" message: the possessor either silently opens send links for the
  // hashes it has, or replies -cancel if it can serve none of them.
  | { type: 'soundboard-fetch-request'; to: PeerId; requestId: string; hashes: string[] }
  | { type: 'soundboard-fetch-signal'; to: PeerId; requestId: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
  | { type: 'soundboard-fetch-cancel'; to: PeerId; requestId: string; reason?: string }
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
  // Broadcast space rename to active peers. Renaming is cosmetic-only — the
  // Space id (invite code) never changes.
  | { type: 'rename-space'; spaceId: string; newSpaceName: string }
  // Claim ownership of this connection's Space if nobody owns it yet
  // (first-claim-wins; no force/take-over — ownership isn't disputed once set).
  | { type: 'claim-ownership' }
  // Owner-only: set/clear this connection's Space banner. Silently ignored
  // server-side if the sender isn't the recorded owner.
  | { type: 'set-banner'; bannerDataUrl: string | null }
  // --- Moderation (server-authorized; silent no-op on deny, like set-banner) ---
  // Remove a user (by stable userId) from their room (owner, or the room's
  // moderator for their own room) or from the whole Space (owner only).
  | { type: 'kick-user'; userId: string; scope: 'room' | 'space' }
  // Owner-only: ban/unban a user (by stable userId) from this Space.
  | { type: 'ban-user'; userId: string }
  | { type: 'unban-user'; userId: string }
  // Lock/unlock a room to new entrants (owner any room; moderator their own).
  // `room` is the bare room id (the server composes the spaceId itself).
  | { type: 'set-room-lock'; room: RoomId; locked: boolean }
  // Owner-only: lock/unlock the Space to newcomers (presence-roster members
  // and the owner still get in while locked).
  | { type: 'set-space-lock'; locked: boolean }
  // Owner-only: hand ownership to a currently-connected space member.
  | { type: 'transfer-ownership'; toUserId: string }
  // Owner-only, post-restart restore: re-seed the server's (empty) ban list +
  // space-lock flag from the owner's locally persisted copy. The server adopts
  // each part only if it has no record, so duplicate/late seeds are no-ops.
  | { type: 'seed-moderation'; bannedUsers: BannedUser[]; locked: boolean }
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
  // `ownerId`/`bannerDataUrl`/`lockedRooms`/`spaceLocked`/`bannedUsers` are only
  // populated on a fresh Space join, never on a same-space room switch — absence
  // there means "no update," not "cleared," since they are Space-scoped and must
  // survive a room switch. `moderatorId` is room-scoped (like the spotlight
  // fields) and present on every welcome that lands the client in a room.
  | { type: 'welcome'; selfId: PeerId; peers: Peer[]; rooms: Room[]; wasEmpty?: boolean; spotlightHolderId?: PeerId | null; spotlightKind?: 'screen' | 'camera' | null; ownerId?: string | null; bannerDataUrl?: string | null; moderatorId?: PeerId | null; lockedRooms?: string[]; spaceLocked?: boolean; bannedUsers?: BannedUser[] }
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
  // Mesh-recovery teardown request (see ClientMessage `relink`), `from` stamped.
  | { type: 'relink'; from: PeerId }
  // Relayed file-transfer handshake (space-wide, directed), `from` stamped.
  | { type: 'file-offer'; from: PeerId; transferId: string; name: string; size: number; files?: { name: string; size: number }[] }
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
  // A peer's custom soundboard library changed; broadcast to all space members.
  | { type: 'soundboard-manifest-state'; from: PeerId; clips: SoundboardClipMeta[] }
  // A peer triggered a soundboard clip; broadcast to the room only.
  | { type: 'soundboard-trigger'; from: PeerId; source: 'preset' | 'custom'; clipId: string }
  // Relayed soundboard clip-fetch handshake (space-wide, directed), `from` stamped.
  | { type: 'soundboard-fetch-request'; from: PeerId; requestId: string; hashes: string[] }
  | { type: 'soundboard-fetch-signal'; from: PeerId; requestId: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
  | { type: 'soundboard-fetch-cancel'; from: PeerId; requestId: string; reason?: string }
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
  | { type: 'space-renamed'; spaceId: string; newSpaceName: string }
  // The Space's owner was (re)established; broadcast to every space member.
  | { type: 'owner-state'; spaceId: string; ownerId: string | null }
  // The Space's banner changed (or was cleared); broadcast to every space member.
  | { type: 'banner-state'; spaceId: string; bannerDataUrl: string | null; updatedBy: string }
  // The room's moderator (longest-present member) changed; broadcast to the
  // whole room. null only transiently (a room that empties is deleted).
  | { type: 'moderator-state'; holderId: PeerId | null }
  // A room was locked/unlocked; broadcast space-wide (sidebar lock icons must
  // reach members outside the room). `room` is the bare room id.
  | { type: 'room-lock-state'; spaceId: string; room: RoomId; locked: boolean }
  // The Space was locked/unlocked to newcomers; broadcast space-wide.
  | { type: 'space-lock-state'; spaceId: string; locked: boolean }
  // The Space's ban list changed; full list, broadcast space-wide (every member
  // persists it so a future owner can re-seed after a server restart).
  | { type: 'ban-state'; spaceId: string; bannedUsers: BannedUser[] }
  // Directed to a moderated user just before the action lands: scope 'room' =
  // returned to the lobby (connection survives); scope 'space' = the socket is
  // closed right after (terminal client-side, no auto-reconnect).
  | { type: 'kicked'; scope: 'room' | 'space'; room?: RoomId; reason: 'kicked' | 'banned' }
  // Join rejected by a moderation gate (room-full pattern; terminal client-side).
  | { type: 'join-denied'; spaceId: string; reason: 'banned' | 'space-locked' | 'room-locked' }
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
