import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  MAX_PEERS_PER_ROOM,
  parseClientMessage,
  type ClientMessage,
  type Peer,
  type PeerId,
  type Room,
  type RoomId,
  type ServerMessage,
  type SpacePresence,
} from '@chickadee/shared';

const PORT = Number(process.env.PORT ?? 8080);

/** Everything we track about one connected socket. */
interface Connection {
  socket: WebSocket;
  peer: Peer;
  space: string;
  room: RoomId | null;
}

/** room id -> (peer id -> connection). In-memory only; restart clears all state. */
const rooms = new Map<RoomId, Map<PeerId, Connection>>();

/** space id -> Room[] list. In-memory only; cleared when no users remain in the space. */
const spaces = new Map<string, Room[]>();

/** space id -> userId -> SpacePresence */
const spacePresence = new Map<string, Map<string, SpacePresence>>();

/** space id -> userId -> Timeout */
const spaceTimeouts = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();

/** space id -> (peer id -> connection). In-memory only; cleared when no users remain in the space. */
const spaceConnections = new Map<string, Map<PeerId, Connection>>();

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
  const fullRoomId = msg.room ? `${msg.spaceId}:${msg.room}` : null;
  const members = fullRoomId ? (rooms.get(fullRoomId) ?? new Map<PeerId, Connection>()) : null;

  if (members && members.size >= MAX_PEERS_PER_ROOM) {
    send(socket, { type: 'room-full', room: msg.room! });
    return null;
  }

  const id = randomUUID();
  const peer: Peer = {
    id,
    // Tolerant: fall back to the session id if a client omits a stable userId.
    userId: typeof msg.userId === 'string' && msg.userId ? msg.userId : id,
    displayName: msg.displayName.trim() || 'Anonymous',
    muted: false,
    cameraOn: false,
    screenStreamId: null,
    game: null,
    deafened: false,
    status: msg.status || 'online',
    avatarDataUrl: msg.avatarDataUrl ?? null,
    voicePreference: msg.voicePreference ?? '',
  };
  const conn: Connection = { socket, peer, space: msg.spaceId, room: fullRoomId };

  const wasEmpty = !spaces.has(msg.spaceId);

  // Track/sync rooms for the space
  if (wasEmpty && msg.rooms && msg.rooms.length > 0) {
    spaces.set(msg.spaceId, msg.rooms);
  }
  const spaceRooms = spaces.get(msg.spaceId) ?? msg.rooms ?? [];

  // Snapshot existing peers before adding the newcomer.
  const existingPeers: Peer[] = members ? [...members.values()].map((c) => c.peer) : [];

  if (fullRoomId && members) {
    members.set(peer.id, conn);
    rooms.set(fullRoomId, members);
  }

  // Add to spaceConnections
  const spaceConns = spaceConnections.get(msg.spaceId) ?? new Map<PeerId, Connection>();
  spaceConns.set(peer.id, conn);
  spaceConnections.set(msg.spaceId, spaceConns);

  // Tell the newcomer who is already here (newcomer will initiate offers in Phase 2) and the current room list.
  send(socket, { type: 'welcome', selfId: peer.id, peers: existingPeers, rooms: spaceRooms, wasEmpty });

  // Update space presence
  const presenceMap = spacePresence.get(msg.spaceId) ?? new Map<string, SpacePresence>();
  const presence: SpacePresence = {
    peer,
    roomId: msg.room,
  };
  presenceMap.set(peer.userId, presence);
  spacePresence.set(msg.spaceId, presenceMap);

  // Clear timeout if any
  const timeouts = spaceTimeouts.get(msg.spaceId);
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
  broadcastSpace(msg.spaceId, { type: 'space-peer-update', presence }, conn);

  // Tell everyone else about the newcomer.
  if (fullRoomId) {
    broadcast(fullRoomId, { type: 'peer-joined', peer }, peer.id);
    console.log(`[join] ${peer.displayName} (${peer.id}) -> room "${fullRoomId}" (${members!.size}/${MAX_PEERS_PER_ROOM})`);
  } else {
    console.log(`[join] ${peer.displayName} (${peer.id}) -> Space "${msg.spaceId}" (no room)`);
  }

  return conn;
}

function handleJoinRoom(conn: Connection, newRoom: RoomId | null): void {
  const oldFullRoomId = conn.room;
  const newFullRoomId = newRoom ? `${conn.space}:${newRoom}` : null;
  if (oldFullRoomId === newFullRoomId) return;

  // 1. Leave old room if in one
  if (oldFullRoomId) {
    const members = rooms.get(oldFullRoomId);
    if (members) {
      members.delete(conn.peer.id);
      broadcast(oldFullRoomId, { type: 'peer-left', peerId: conn.peer.id });
      console.log(`[leave-room] ${conn.peer.displayName} (${conn.peer.id}) <- room "${oldFullRoomId}" (${members.size}/${MAX_PEERS_PER_ROOM})`);
      if (members.size === 0) rooms.delete(oldFullRoomId);
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
    if (members.size >= MAX_PEERS_PER_ROOM) {
      send(conn.socket, { type: 'room-full', room: newRoom });
      conn.room = null;
    } else {
      conn.room = newFullRoomId;
      const existingPeers = [...members.values()].map((c) => c.peer);
      members.set(conn.peer.id, conn);
      rooms.set(newFullRoomId, members);

      // Send welcome to newcomer
      const spaceRooms = spaces.get(conn.space) ?? [];
      send(conn.socket, { type: 'welcome', selfId: conn.peer.id, peers: existingPeers, rooms: spaceRooms });

      // Broadcast peer-joined to new room
      broadcast(newFullRoomId, { type: 'peer-joined', peer: conn.peer }, conn.peer.id);
      console.log(`[join-room] ${conn.peer.displayName} (${conn.peer.id}) -> room "${newFullRoomId}" (${members.size}/${MAX_PEERS_PER_ROOM})`);
    }
  } else {
    conn.room = null;
    // Send welcome with empty peers to newcomer to clear their peer mesh
    const spaceRooms = spaces.get(conn.space) ?? [];
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

/** Record a peer's detected game and tell the room (mirror pattern). */
function handleGameState(conn: Connection, game: string | null): void {
  conn.peer.game = game ? game.slice(0, 24) : null;
  broadcast(conn.room, { type: 'game-state', from: conn.peer.id, game: conn.peer.game }, conn.peer.id);

  const pMap = spacePresence.get(conn.space);
  if (pMap) {
    const p = pMap.get(conn.peer.userId);
    if (p) broadcastSpace(conn.space, { type: 'space-peer-update', presence: p });
  }
}

/** Record a peer's new deafen state and tell everyone else in the room (mirror pattern). */
function handleDeafenState(conn: Connection, deafened: boolean): void {
  conn.peer.deafened = deafened;
  broadcast(conn.room, { type: 'deafen-state', from: conn.peer.id, deafened }, conn.peer.id);
}

/** Record a peer's avatar and broadcast to all space members (avatar syncs space-wide, not just the room). */
function handleAvatarState(conn: Connection, avatarDataUrl: string | null): void {
  conn.peer.avatarDataUrl = avatarDataUrl;
  // Broadcast the raw avatar-state message to room members so their peer tiles update immediately.
  broadcast(conn.room, { type: 'avatar-state', from: conn.peer.id, avatarDataUrl }, conn.peer.id);
  // Also broadcast space-peer-update so all space members (across rooms) get the updated Peer.
  const pMap = spacePresence.get(conn.space);
  if (pMap) {
    const p = pMap.get(conn.peer.userId);
    if (p) broadcastSpace(conn.space, { type: 'space-peer-update', presence: p }, conn);
  }
}

/** Record a peer's TTS voice preference and tell the room (room-only — chat/TTS is room-scoped). */
function handleVoiceState(conn: Connection, voicePreference: string): void {
  conn.peer.voicePreference = typeof voicePreference === 'string' ? voicePreference.slice(0, 32) : '';
  broadcast(conn.room, { type: 'voice-state', from: conn.peer.id, voicePreference: conn.peer.voicePreference }, conn.peer.id);
}

/** Record a peer's presence status and tell the room (mirror pattern). */
function handleStatusState(conn: Connection, status: 'online' | 'idle' | 'dnd'): void {
  conn.peer.status = status;
  broadcast(conn.room, { type: 'status-state', from: conn.peer.id, status }, conn.peer.id);

  const pMap = spacePresence.get(conn.space);
  if (pMap) {
    const p = pMap.get(conn.peer.userId);
    if (p) broadcastSpace(conn.space, { type: 'space-peer-update', presence: p });
  }
}

function handleUpdateRooms(spaceId: string, roomsList: Room[]): void {
  spaces.set(spaceId, roomsList);
  // Broadcast update to everyone in this Space (across all rooms of that Space)
  for (const roomMap of rooms.values()) {
    for (const conn of roomMap.values()) {
      if (conn.space === spaceId) {
        send(conn.socket, { type: 'rooms-updated', spaceId, rooms: roomsList });
      }
    }
  }
  console.log(`[rooms-update] space "${spaceId}" rooms updated; broadcasted to members`);
}

const CHAT_MAX_LEN = 500;

/** Relay an ephemeral chat message / reaction to the rest of the room. */
function handleChat(conn: Connection, text: string, reaction: boolean | undefined): void {
  const trimmed = text.trim().slice(0, CHAT_MAX_LEN);
  if (!trimmed) return;
  broadcast(
    conn.room,
    { type: 'chat', from: conn.peer.id, text: trimmed, reaction },
    conn.peer.id,
  );
}

function handleDisconnect(conn: Connection): void {
  if (conn.room) {
    const members = rooms.get(conn.room);
    if (members) {
      members.delete(conn.peer.id);
      broadcast(conn.room, { type: 'peer-left', peerId: conn.peer.id });
      console.log(`[leave] ${conn.peer.displayName} (${conn.peer.id}) <- room "${conn.room}" (${members.size}/${MAX_PEERS_PER_ROOM})`);
      if (members.size === 0) rooms.delete(conn.room);
    }
  }

  // Remove from spaceConnections
  const spaceConns = spaceConnections.get(conn.space);
  if (spaceConns) {
    spaceConns.delete(conn.peer.id);
    if (spaceConns.size === 0) spaceConnections.delete(conn.space);
  }

  const spaceHasUsers = spaceConnections.has(conn.space);

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

  if (!spaceHasUsers) {
    spaces.delete(conn.space);
    spacePresence.delete(conn.space);
    
    // Clear any dangling timeouts for this space
    const timeouts = spaceTimeouts.get(conn.space);
    if (timeouts) {
      for (const t of timeouts.values()) clearTimeout(t);
      spaceTimeouts.delete(conn.space);
    }

    console.log(`[space-cleanup] space "${conn.space}" is now empty; removed from server memory`);
  }
}

const wss = new WebSocketServer({ port: PORT });

/** Liveness tracking for the ws-level heartbeat (terminates dead sockets). */
const alive = new WeakMap<WebSocket, boolean>();

wss.on('connection', (socket) => {
  // A connection has no identity until it sends a valid `join`.
  let conn: Connection | null = null;
  alive.set(socket, true);
  socket.on('pong', () => alive.set(socket, true));

  socket.on('message', (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) return;

    // App-level liveness ping (lets the client detect a half-open socket).
    if (msg.type === 'ping') {
      send(socket, { type: 'pong' });
      return;
    }

    if (msg.type === 'join') {
      if (conn) return; // already joined; ignore duplicate joins
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
    } else if (msg.type === 'cam-state') {
      handleCamState(conn, msg.on);
    } else if (msg.type === 'screen-state') {
      handleScreenState(conn, msg.streamId);
    } else if (msg.type === 'game-state') {
      handleGameState(conn, msg.game);
    } else if (msg.type === 'deafen-state') {
      handleDeafenState(conn, msg.deafened);
    } else if (msg.type === 'status-state') {
      handleStatusState(conn, msg.status);
    } else if (msg.type === 'avatar-state') {
      handleAvatarState(conn, msg.avatarDataUrl);
    } else if (msg.type === 'voice-state') {
      handleVoiceState(conn, msg.voicePreference);
    } else if (msg.type === 'update-rooms') {
      handleUpdateRooms(msg.spaceId, msg.rooms);
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
