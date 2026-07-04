import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  CHAT_MAX_LEN,
  MAX_AVATAR_DATA_URL_LEN,
  MAX_DISPLAY_NAME_LEN,
  MAX_ID_LEN,
  MAX_PEERS_VOICE,
  MAX_VOICE_PREF_LEN,
  capacityForType,
  clampString,
  parseClientMessage,
  sanitizeAccentColor,
  sanitizeAvatarDataUrl,
  sanitizeStatus,
  type ClientMessage,
  type Peer,
  type PeerId,
  type Room,
  type RoomId,
  type ServerMessage,
  type SpacePresence,
} from '@chickadee/shared';

const PORT = Number(process.env.PORT ?? 8080);

/** Cap on a single inbound WS frame. The largest legitimate message is an avatar
 *  data URL; everything else is tiny. Keeps a small headroom over the avatar cap. */
const MAX_WS_PAYLOAD = MAX_AVATAR_DATA_URL_LEN + 8 * 1024;

/** Per-connection message rate limit (generous — well above WebRTC ICE trickle bursts). */
const MSG_RATE_LIMIT = 200;
const MSG_RATE_WINDOW_MS = 1000;

/**
 * Optional Origin allowlist (comma-separated env). The Electron client sends no
 * Origin, so an empty allowlist permits all (current behaviour); set it to lock
 * the hosted server to known origins. CSWSH risk is low here (no cookies/auth),
 * but this plus the rate limit + payload cap blunt browser-based resource abuse.
 */
const ALLOWED_ORIGINS = (process.env.CHICKADEE_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Optional shared join secret. Rooms are otherwise reachable by anyone who knows
 * the (locally-generated, non-secret) spaceId, so set CHICKADEE_JOIN_SECRET on a
 * private deployment to require a matching `secret` in every `join`. Empty =
 * open server (default; the public client sends no secret).
 */
const JOIN_SECRET = process.env.CHICKADEE_JOIN_SECRET ?? '';

/** Everything we track about one connected socket. */
interface Connection {
  socket: WebSocket;
  peer: Peer;
  space: string;
  room: RoomId | null;
}

/** room id -> (peer id -> connection). In-memory only; restart clears all state. */
const rooms = new Map<RoomId, Map<PeerId, Connection>>();

/**
 * composite room id -> the single "stage" holder (spotlight). At most one peer
 * per room may hold the stage; a screen/camera on the stage streams at high
 * quality while everyone else's video is a compressed thumbnail. Server-arbitrated
 * so two claimants can't both win (mirror of the `room-full` reject pattern).
 */
const spotlights = new Map<RoomId, { holderId: PeerId; kind: 'screen' | 'camera' }>();

/** space id -> Room[] list. In-memory only; cleared when no users remain in the space. */
const spaces = new Map<string, Room[]>();

/** space id -> userId -> SpacePresence */
const spacePresence = new Map<string, Map<string, SpacePresence>>();

/** space id -> userId -> Timeout */
const spaceTimeouts = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();

/** space id -> (peer id -> connection). In-memory only; cleared when no users remain in the space. */
const spaceConnections = new Map<string, Map<PeerId, Connection>>();

/** Grace window before a Space with no remaining connections is torn down, so a
 *  sole member reconnecting (heartbeat blip, dev same-userId handoff) doesn't make
 *  the Space momentarily report as non-existent to a check-space probe. */
const SPACE_EXISTENCE_GRACE_MS = 5_000;

/** space id -> pending teardown timer. */
const spaceGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Tear down a Space's in-memory state after a grace window, but only if it still
 * has no live connections by the time the timer fires. A (re)join cancels this
 * via `spaceGraceTimers`, so a brief reconnect of the last member keeps the Space
 * continuously "live" for `check-space` probes.
 */
function scheduleSpaceCleanup(spaceId: string): void {
  if (spaceGraceTimers.has(spaceId)) return;
  const timer = setTimeout(() => {
    spaceGraceTimers.delete(spaceId);
    const conns = spaceConnections.get(spaceId);
    if (conns && conns.size === 0) {
      spaceConnections.delete(spaceId);
      spaces.delete(spaceId);
      spacePresence.delete(spaceId);
      const timeouts = spaceTimeouts.get(spaceId);
      if (timeouts) {
        for (const t of timeouts.values()) clearTimeout(t);
        spaceTimeouts.delete(spaceId);
      }
      console.log(`[space-cleanup] space "${spaceId}" empty after grace; removed from server memory`);
    }
  }, SPACE_EXISTENCE_GRACE_MS);
  spaceGraceTimers.set(spaceId, timer);
}

function broadcastSpace(spaceId: string, message: ServerMessage, exceptConn?: Connection): void {
  const conns = spaceConnections.get(spaceId);
  if (!conns) return;
  for (const conn of conns.values()) {
    if (conn !== exceptConn) {
      send(conn.socket, message);
    }
  }
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/** Send a message to every peer in a room except `exceptId`. */
function broadcast(room: RoomId | null, message: ServerMessage, exceptId?: PeerId): void {
  if (!room) return;
  const members = rooms.get(room);
  if (!members) return;
  for (const [peerId, conn] of members) {
    if (peerId !== exceptId) send(conn.socket, message);
  }
}

function handleJoin(socket: WebSocket, msg: Extract<ClientMessage, { type: 'join' }>): Connection | null {
  // spaceId is used as an in-memory map key; require a sane string.
  const spaceId = clampString(msg.spaceId, MAX_ID_LEN);
  if (!spaceId) return null;
  const userId = clampString(msg.userId, MAX_ID_LEN);

  // If a connection with the same userId already exists in this space, clean it up first.
  if (userId) {
    const spaceConns = spaceConnections.get(spaceId);
    if (spaceConns) {
      const ghosts: Connection[] = [];
      for (const conn of spaceConns.values()) {
        if (conn.peer.userId === userId) {
          ghosts.push(conn);
        }
      }
      for (const ghost of ghosts) {
        console.log(`[join-cleanup] closing ghost connection for userId ${userId} (${ghost.peer.id})`);
        ghost.socket.removeAllListeners('close');
        ghost.socket.removeAllListeners('error');
        ghost.socket.close();
        handleDisconnect(ghost);
      }
    }
  }

  const room = msg.room == null ? null : clampString(msg.room, MAX_ID_LEN) || null;

  const fullRoomId = room ? `${spaceId}:${room}` : null;
  const members = fullRoomId ? (rooms.get(fullRoomId) ?? new Map<PeerId, Connection>()) : null;

  // Resolve the space's room list (existing, else the joiner's local list) so the
  // joining room's type drives the capacity — voice rooms hold 8, video rooms 4.
  const joinRooms = Array.isArray(msg.rooms) ? msg.rooms : [];
  const knownRooms = spaces.get(spaceId) ?? joinRooms;
  const roomCap = capacityForType(knownRooms.find((r) => r.id === room)?.type);

  if (members && members.size >= roomCap) {
    // members is non-null only when fullRoomId (and thus room) is non-null.
    send(socket, { type: 'room-full', room: room! });
    return null;
  }

  const id = randomUUID();
  const peer: Peer = {
    id,
    // Tolerant: fall back to the session id if a client omits a stable userId.
    userId: userId || id,
    displayName: clampString(msg.displayName, MAX_DISPLAY_NAME_LEN) || 'Anonymous',
    muted: false,
    speaking: false,
    cameraOn: false,
    screenStreamId: null,
    deafened: false,
    status: sanitizeStatus(msg.status),
    avatarDataUrl: sanitizeAvatarDataUrl(msg.avatarDataUrl),
    voicePreference: clampString(msg.voicePreference, MAX_VOICE_PREF_LEN),
    accentColor: sanitizeAccentColor(msg.accentColor),
    wantsVideo: true,
    videoSubscriptions: [],
  };
  const conn: Connection = { socket, peer, space: spaceId, room: fullRoomId };

  const wasEmpty = !spaces.has(spaceId);

  // Track/sync rooms for the space
  if (wasEmpty && joinRooms.length > 0) {
    spaces.set(spaceId, joinRooms);
  }
  const spaceRooms = spaces.get(spaceId) ?? joinRooms;

  // Snapshot existing peers before adding the newcomer.
  const existingPeers: Peer[] = members ? [...members.values()].map((c) => c.peer) : [];

  if (fullRoomId && members) {
    members.set(peer.id, conn);
    rooms.set(fullRoomId, members);
  }

  // Add to spaceConnections
  const spaceConns = spaceConnections.get(spaceId) ?? new Map<PeerId, Connection>();
  spaceConns.set(peer.id, conn);
  spaceConnections.set(spaceId, spaceConns);

  // Someone is here again — cancel any pending grace teardown for this space.
  const grace = spaceGraceTimers.get(spaceId);
  if (grace) {
    clearTimeout(grace);
    spaceGraceTimers.delete(spaceId);
  }

  // Tell the newcomer who is already here (newcomer will initiate offers in Phase 2), the
  // current room list, and who (if anyone) currently holds the room's stage.
  const joinSpotlight = fullRoomId ? spotlights.get(fullRoomId) : undefined;
  send(socket, {
    type: 'welcome',
    selfId: peer.id,
    peers: existingPeers,
    rooms: spaceRooms,
    wasEmpty,
    spotlightHolderId: joinSpotlight?.holderId ?? null,
    spotlightKind: joinSpotlight?.kind ?? null,
  });

  // Update space presence
  const presenceMap = spacePresence.get(spaceId) ?? new Map<string, SpacePresence>();
  const presence: SpacePresence = {
    peer,
    roomId: room,
  };
  presenceMap.set(peer.userId, presence);
  spacePresence.set(spaceId, presenceMap);

  // Clear timeout if any
  const timeouts = spaceTimeouts.get(spaceId);
  if (timeouts) {
    const timer = timeouts.get(peer.userId);
    if (timer) {
      clearTimeout(timer);
      timeouts.delete(peer.userId);
    }
  }

  // Send the full space-presence to newcomer
  const allSpacePresence = Array.from(presenceMap.values());
  send(socket, { type: 'space-presence', presence: allSpacePresence });

  // Broadcast update to space (except newcomer)
  broadcastSpace(spaceId, { type: 'space-peer-update', presence }, conn);

  // Tell everyone else about the newcomer.
  if (fullRoomId) {
    broadcast(fullRoomId, { type: 'peer-joined', peer }, peer.id);
    console.log(`[join] ${peer.displayName} (${peer.id}) -> room "${fullRoomId}" (${members!.size}/${roomCap})`);
  } else {
    console.log(`[join] ${peer.displayName} (${peer.id}) -> Space "${spaceId}" (no room)`);
  }

  return conn;
}

function handleJoinRoom(conn: Connection, newRoom: RoomId | null): void {
  const oldFullRoomId = conn.room;
  const newFullRoomId = newRoom ? `${conn.space}:${newRoom}` : null;
  if (oldFullRoomId === newFullRoomId) return;

  const spaceRooms = spaces.get(conn.space) ?? [];

  // 1. Leave old room if in one
  if (oldFullRoomId) {
    // Free the stage if the leaver held it, before dropping them from the room.
    clearSpotlightIfHeld(oldFullRoomId, conn.peer.id);
    const members = rooms.get(oldFullRoomId);
    if (members) {
      members.delete(conn.peer.id);
      broadcast(oldFullRoomId, { type: 'peer-left', peerId: conn.peer.id });
      console.log(`[leave-room] ${conn.peer.displayName} (${conn.peer.id}) <- room "${oldFullRoomId}" (${members.size})`);
      if (members.size === 0) {
        rooms.delete(oldFullRoomId);
        spotlights.delete(oldFullRoomId);
      }
    }
  }

  // 2. Clear room-specific media flags if leaving room
  if (!newRoom) {
    conn.peer.cameraOn = false;
    conn.peer.screenStreamId = null;
  }

  // 3. Join new room if not null
  if (newRoom && newFullRoomId) {
    const members = rooms.get(newFullRoomId) ?? new Map<PeerId, Connection>();
    const roomCap = capacityForType(spaceRooms.find((r) => r.id === newRoom)?.type);
    if (members.size >= roomCap) {
      send(conn.socket, { type: 'room-full', room: newRoom });
      conn.room = null;
    } else {
      conn.room = newFullRoomId;
      const existingPeers = [...members.values()].map((c) => c.peer);
      members.set(conn.peer.id, conn);
      rooms.set(newFullRoomId, members);

      // Send welcome to newcomer, including who holds the new room's stage.
      const roomSpotlight = spotlights.get(newFullRoomId);
      send(conn.socket, {
        type: 'welcome',
        selfId: conn.peer.id,
        peers: existingPeers,
        rooms: spaceRooms,
        spotlightHolderId: roomSpotlight?.holderId ?? null,
        spotlightKind: roomSpotlight?.kind ?? null,
      });

      // Broadcast peer-joined to new room
      broadcast(newFullRoomId, { type: 'peer-joined', peer: conn.peer }, conn.peer.id);
      console.log(`[join-room] ${conn.peer.displayName} (${conn.peer.id}) -> room "${newFullRoomId}" (${members.size}/${roomCap})`);
    }
  } else {
    conn.room = null;
    // Send welcome with empty peers to newcomer to clear their peer mesh
    send(conn.socket, { type: 'welcome', selfId: conn.peer.id, peers: [], rooms: spaceRooms });
    console.log(`[leave-room-complete] ${conn.peer.displayName} (${conn.peer.id}) -> no room`);
  }

  // 4. Update space presence
  const presenceMap = spacePresence.get(conn.space);
  if (presenceMap) {
    const p = presenceMap.get(conn.peer.userId);
    if (p) {
      p.roomId = newRoom;
      p.peer = conn.peer;
      broadcastSpace(conn.space, { type: 'space-peer-update', presence: p });
    }
  }
}

/** Relay a directed WebRTC message to its target peer in the same room, stamping `from`. */
function relay(conn: Connection, msg: ClientMessage & { to: PeerId }): void {
  if (!conn.room) return;
  const members = rooms.get(conn.room);
  const target = members?.get(msg.to);
  if (!target) return;

  switch (msg.type) {
    case 'offer':
      send(target.socket, { type: 'offer', from: conn.peer.id, sdp: msg.sdp });
      break;
    case 'answer':
      send(target.socket, { type: 'answer', from: conn.peer.id, sdp: msg.sdp });
      break;
    case 'ice-candidate':
      send(target.socket, { type: 'ice-candidate', from: conn.peer.id, candidate: msg.candidate });
      break;
  }
}

/** Record a peer's new mute state and tell everyone else in the room. */
function handleMicState(conn: Connection, muted: boolean): void {
  conn.peer.muted = muted;
  broadcast(conn.room, { type: 'mic-state', from: conn.peer.id, muted }, conn.peer.id);
}

/** Record a peer's new speaking state and tell everyone else in the room. */
function handleSpeakingState(conn: Connection, speaking: boolean): void {
  conn.peer.speaking = speaking;
  broadcast(conn.room, { type: 'speaking-state', from: conn.peer.id, speaking }, conn.peer.id);
}

/** Record a peer's new camera state and tell everyone else in the room. */
function handleCamState(conn: Connection, on: boolean): void {
  conn.peer.cameraOn = on;
  broadcast(conn.room, { type: 'cam-state', from: conn.peer.id, on }, conn.peer.id);
}

/** Record a peer's screen-share state (streamId or null) and tell the room. */
function handleScreenState(conn: Connection, streamId: string | null): void {
  conn.peer.screenStreamId = streamId;
  broadcast(conn.room, { type: 'screen-state', from: conn.peer.id, streamId }, conn.peer.id);
}

/** Record a peer's new deafen state and tell everyone else in the room (mirror pattern). */
function handleDeafenState(conn: Connection, deafened: boolean): void {
  conn.peer.deafened = deafened;
  broadcast(conn.room, { type: 'deafen-state', from: conn.peer.id, deafened }, conn.peer.id);
}

/** Record a peer's avatar and broadcast to all space members (avatar syncs space-wide, not just the room). */
function handleAvatarState(conn: Connection, avatarDataUrl: string | null): void {
  // Validate the data URL (type + size) before storing/relaying — this is the
  // primary amplification-DoS guard, since the avatar fans out space-wide.
  const safe = sanitizeAvatarDataUrl(avatarDataUrl);
  conn.peer.avatarDataUrl = safe;
  // Broadcast the sanitized avatar-state to room members so their tiles update immediately.
  broadcast(conn.room, { type: 'avatar-state', from: conn.peer.id, avatarDataUrl: safe }, conn.peer.id);
  // Also broadcast space-peer-update so all space members (across rooms) get the updated Peer.
  const pMap = spacePresence.get(conn.space);
  if (pMap) {
    const p = pMap.get(conn.peer.userId);
    if (p) broadcastSpace(conn.space, { type: 'space-peer-update', presence: p }, conn);
  }
}

/** Record a peer's accent color and broadcast to all space members (syncs space-wide, like the avatar). */
function handleAccentState(conn: Connection, accentColor: string): void {
  const safe = sanitizeAccentColor(accentColor);
  conn.peer.accentColor = safe;
  // Broadcast to room members so their tiles recolor immediately.
  broadcast(conn.room, { type: 'accent-state', from: conn.peer.id, accentColor: safe }, conn.peer.id);
  // Also broadcast space-peer-update so all space members (across rooms) get the updated Peer.
  const pMap = spacePresence.get(conn.space);
  if (pMap) {
    const p = pMap.get(conn.peer.userId);
    if (p) broadcastSpace(conn.space, { type: 'space-peer-update', presence: p }, conn);
  }
}

/** Record a peer's TTS voice preference and tell the room (room-only — chat/TTS is room-scoped). */
function handleVoiceState(conn: Connection, voicePreference: string): void {
  conn.peer.voicePreference = clampString(voicePreference, MAX_VOICE_PREF_LEN);
  broadcast(conn.room, { type: 'voice-state', from: conn.peer.id, voicePreference: conn.peer.voicePreference }, conn.peer.id);
}

/**
 * Record a peer's video opt-in state — which userIds it has joined
 * (subscriptions) and whether it's rendering video (false while docked) — and
 * tell the room (room-only — media is room-scoped). Subscriptions are clamped:
 * an array of clamped-string userIds, capped at the room size.
 */
function handleSinkState(conn: Connection, subscriptions: unknown, wantsVideo: unknown): void {
  const safeSubs = Array.isArray(subscriptions)
    ? subscriptions
        .filter((s): s is string => typeof s === 'string')
        .slice(0, MAX_PEERS_VOICE)
        .map((s) => clampString(s, MAX_ID_LEN))
        .filter((s) => s.length > 0)
    : [];
  conn.peer.videoSubscriptions = safeSubs;
  conn.peer.wantsVideo = Boolean(wantsVideo);
  broadcast(
    conn.room,
    { type: 'sink-state', from: conn.peer.id, subscriptions: safeSubs, wantsVideo: conn.peer.wantsVideo },
    conn.peer.id,
  );
}

/**
 * Claim the room's single stage slot for a screen/camera. Grants if the slot is
 * free, already held by this peer, or `force` (take-over). On grant, broadcasts
 * `spotlight-state` to the whole room (incl. the claimant, so it confirms). On a
 * blocked non-force claim, replies `spotlight-busy` so the client can offer take-over.
 */
function handleClaimSpotlight(conn: Connection, kind: 'screen' | 'camera', force: boolean): void {
  const roomId = conn.room;
  if (!roomId) return;
  const current = spotlights.get(roomId);
  if (current && current.holderId !== conn.peer.id && !force) {
    send(conn.socket, { type: 'spotlight-busy', holderId: current.holderId });
    return;
  }
  spotlights.set(roomId, { holderId: conn.peer.id, kind });
  broadcast(roomId, { type: 'spotlight-state', holderId: conn.peer.id, kind });
}

/** Release the stage slot if this peer holds it, and tell the room it's free. */
function handleReleaseSpotlight(conn: Connection): void {
  const roomId = conn.room;
  if (!roomId) return;
  if (spotlights.get(roomId)?.holderId === conn.peer.id) {
    spotlights.delete(roomId);
    broadcast(roomId, { type: 'spotlight-state', holderId: null, kind: null });
  }
}

/**
 * Free the stage if `peerId` holds `roomId`'s spotlight (on leave/disconnect),
 * broadcasting to the remaining members. Called wherever a peer exits a room.
 */
function clearSpotlightIfHeld(roomId: RoomId | null, peerId: PeerId): void {
  if (!roomId) return;
  if (spotlights.get(roomId)?.holderId === peerId) {
    spotlights.delete(roomId);
    broadcast(roomId, { type: 'spotlight-state', holderId: null, kind: null });
  }
}

/** Record a peer's presence status and tell the room (mirror pattern). */
function handleStatusState(conn: Connection, status: 'online' | 'idle' | 'dnd'): void {
  const safe = sanitizeStatus(status);
  conn.peer.status = safe;
  broadcast(conn.room, { type: 'status-state', from: conn.peer.id, status: safe }, conn.peer.id);

  const pMap = spacePresence.get(conn.space);
  if (pMap) {
    const p = pMap.get(conn.peer.userId);
    if (p) broadcastSpace(conn.space, { type: 'space-peer-update', presence: p });
  }
}

function handleUpdateRooms(spaceId: string, roomsList: Room[]): void {
  if (!Array.isArray(roomsList)) return;
  spaces.set(spaceId, roomsList);
  // Broadcast to space members directly (spaceConnections already indexes them,
  // avoiding an O(all peers) sweep of every room map).
  const conns = spaceConnections.get(spaceId);
  if (conns) {
    for (const conn of conns.values()) {
      send(conn.socket, { type: 'rooms-updated', spaceId, rooms: roomsList });
    }
  }
  console.log(`[rooms-update] space "${spaceId}" rooms updated; broadcasted to members`);
}

function handleRenameSpace(conn: Connection, newSpaceId: string, newSpaceName: string): void {
  const spaceId = conn.space;
  const clampedId = clampString(newSpaceId, MAX_ID_LEN);
  const clampedName = clampString(newSpaceName, MAX_DISPLAY_NAME_LEN);
  
  if (!clampedId || !clampedName) return;

  // Broadcast the space-renamed message to everyone in the current space except the sender
  broadcastSpace(spaceId, { type: 'space-renamed', spaceId, newSpaceId: clampedId, newSpaceName: clampedName }, conn);
  
  console.log(`[space-rename] space "${spaceId}" renamed to "${clampedName}" with new ID "${clampedId}"`);
}

/** Relay an ephemeral chat message / reaction to the rest of the room. */
function handleChat(conn: Connection, text: string, reaction: boolean | undefined): void {
  const trimmed = clampString(text, CHAT_MAX_LEN);
  if (!trimmed) return;
  broadcast(
    conn.room,
    { type: 'chat', from: conn.peer.id, text: trimmed, reaction },
    conn.peer.id,
  );
}

function handleDisconnect(conn: Connection): void {
  if (conn.room) {
    // Free the stage if this peer held it, so the room doesn't stay stuck in theater.
    clearSpotlightIfHeld(conn.room, conn.peer.id);
    const members = rooms.get(conn.room);
    if (members) {
      members.delete(conn.peer.id);
      broadcast(conn.room, { type: 'peer-left', peerId: conn.peer.id });
      console.log(`[leave] ${conn.peer.displayName} (${conn.peer.id}) <- room "${conn.room}" (${members.size})`);
      if (members.size === 0) {
        rooms.delete(conn.room);
        spotlights.delete(conn.room);
      }
    }
  }

  // Remove from spaceConnections. Keep the (possibly now-empty) map in place; the
  // empty-Space teardown is deferred via scheduleSpaceCleanup below so a sole member
  // reconnecting doesn't make the Space momentarily report as non-existent.
  const spaceConns = spaceConnections.get(conn.space);
  if (spaceConns) {
    spaceConns.delete(conn.peer.id);
  }

  // Update space presence to offline
  const presenceMap = spacePresence.get(conn.space);
  if (presenceMap) {
    const p = presenceMap.get(conn.peer.userId);
    // Only set offline if this exact connection's peer id matches (prevents ghosting if they already rejoined on another socket)
    if (p && p.peer.id === conn.peer.id) {
      p.roomId = null;
      p.leftAt = Date.now();
      broadcastSpace(conn.space, { type: 'space-peer-update', presence: p });
      
      const timeouts = spaceTimeouts.get(conn.space) ?? new Map<string, ReturnType<typeof setTimeout>>();
      spaceTimeouts.set(conn.space, timeouts);
      const timer = setTimeout(() => {
        const currentP = presenceMap.get(conn.peer.userId);
        if (currentP && currentP.leftAt === p.leftAt) {
          presenceMap.delete(conn.peer.userId);
          broadcastSpace(conn.space, { type: 'space-peer-remove', userId: conn.peer.userId });
        }
      }, 10 * 60 * 1000);
      timeouts.set(conn.peer.userId, timer);
    }
  }

  // If no live connections remain, defer the Space teardown by a grace window
  // instead of deleting immediately — a rejoin within the window cancels it.
  if (spaceConns && spaceConns.size === 0) {
    scheduleSpaceCleanup(conn.space);
  }
}

const wss = new WebSocketServer({
  port: PORT,
  // Cap a single inbound frame so a huge payload can't exhaust memory.
  maxPayload: MAX_WS_PAYLOAD,
  // Optional Origin allowlist; empty = allow all (Electron sends no Origin).
  verifyClient: ALLOWED_ORIGINS.length === 0
    ? undefined
    : ({ origin }: { origin: string }) => !origin || ALLOWED_ORIGINS.includes(origin),
});

/** Liveness tracking for the ws-level heartbeat (terminates dead sockets). */
const alive = new WeakMap<WebSocket, boolean>();

/** Per-connection sliding-window message counter for rate limiting. */
const rate = new WeakMap<WebSocket, { count: number; resetAt: number }>();

/** Returns true (and the socket should be dropped) when a connection floods messages. */
function isRateLimited(socket: WebSocket): boolean {
  const now = Date.now();
  let r = rate.get(socket);
  if (!r || now > r.resetAt) {
    r = { count: 0, resetAt: now + MSG_RATE_WINDOW_MS };
    rate.set(socket, r);
  }
  r.count += 1;
  return r.count > MSG_RATE_LIMIT;
}

wss.on('connection', (socket) => {
  // A connection has no identity until it sends a valid `join`.
  let conn: Connection | null = null;
  alive.set(socket, true);
  socket.on('pong', () => alive.set(socket, true));

  socket.on('message', (data) => {
    // Drop abusive senders before doing any parsing work.
    if (isRateLimited(socket)) {
      socket.close(1008, 'rate limit exceeded');
      return;
    }

    const msg = parseClientMessage(data.toString());
    if (!msg) return;

    // App-level liveness ping (lets the client detect a half-open socket).
    if (msg.type === 'ping') {
      send(socket, { type: 'pong' });
      return;
    }

    // Non-mutating existence probe — answerable before/without joining. A Space
    // "exists" only while it has ≥1 connected member. On a secret mismatch we
    // report `false` rather than leaking existence to an unauthorized prober.
    if (msg.type === 'check-space') {
      const spaceId = clampString(msg.spaceId, MAX_ID_LEN);
      const authorized = !JOIN_SECRET || msg.secret === JOIN_SECRET;
      send(socket, {
        type: 'space-status',
        spaceId,
        exists: authorized && !!spaceId && spaceConnections.has(spaceId),
      });
      return;
    }

    if (msg.type === 'join') {
      if (conn) return; // already joined; ignore duplicate joins
      // Optional shared-secret gate (private deployments). Silent reject on
      // mismatch — a legitimate client always carries the configured secret.
      if (JOIN_SECRET && msg.secret !== JOIN_SECRET) {
        console.warn('[join] rejected: missing/incorrect join secret');
        socket.close(1008, 'unauthorized');
        return;
      }
      conn = handleJoin(socket, msg);
      return;
    }

    if (!conn) return; // must join before doing anything else

    if (msg.type === 'join-room') {
      handleJoinRoom(conn, msg.room);
      return;
    }

    if (msg.type === 'offer' || msg.type === 'answer' || msg.type === 'ice-candidate') {
      relay(conn, msg);
    } else if (msg.type === 'mic-state') {
      handleMicState(conn, msg.muted);
    } else if (msg.type === 'speaking-state') {
      handleSpeakingState(conn, msg.speaking);
    } else if (msg.type === 'cam-state') {
      handleCamState(conn, msg.on);
    } else if (msg.type === 'screen-state') {
      handleScreenState(conn, msg.streamId);
    } else if (msg.type === 'deafen-state') {
      handleDeafenState(conn, msg.deafened);
    } else if (msg.type === 'status-state') {
      handleStatusState(conn, msg.status);
    } else if (msg.type === 'avatar-state') {
      handleAvatarState(conn, msg.avatarDataUrl);
    } else if (msg.type === 'voice-state') {
      handleVoiceState(conn, msg.voicePreference);
    } else if (msg.type === 'sink-state') {
      handleSinkState(conn, msg.subscriptions, msg.wantsVideo);
    } else if (msg.type === 'claim-spotlight') {
      handleClaimSpotlight(conn, msg.kind === 'camera' ? 'camera' : 'screen', Boolean(msg.force));
    } else if (msg.type === 'release-spotlight') {
      handleReleaseSpotlight(conn);
    } else if (msg.type === 'accent-state') {
      handleAccentState(conn, msg.accentColor);
    } else if (msg.type === 'update-rooms') {
      handleUpdateRooms(msg.spaceId, msg.rooms);
    } else if (msg.type === 'rename-space') {
      handleRenameSpace(conn, msg.newSpaceId, msg.newSpaceName);
    } else if (msg.type === 'chat') {
      handleChat(conn, msg.text, msg.reaction);
    }
  });

  socket.on('close', () => {
    if (conn) handleDisconnect(conn);
  });

  socket.on('error', () => {
    if (conn) handleDisconnect(conn);
  });
});

// ws-level heartbeat: ping every client; terminate any that didn't pong since
// the last round. Terminating fires 'close' → handleDisconnect → peer-left, so
// dead peers are cleaned up promptly instead of lingering until TCP timeout.
const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (alive.get(client) === false) {
      client.terminate();
      continue;
    }
    alive.set(client, false);
    client.ping();
  }
}, 20_000);

wss.on('close', () => clearInterval(heartbeat));

console.log(`Chickadee signaling server listening on :${PORT}`);
