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
} from '@chickadee/shared';

const PORT = Number(process.env.PORT ?? 8080);

/** Everything we track about one connected socket. */
interface Connection {
  socket: WebSocket;
  peer: Peer;
  space: string;
  room: RoomId;
}

/** room id -> (peer id -> connection). In-memory only; restart clears all state. */
const rooms = new Map<RoomId, Map<PeerId, Connection>>();

/** space id -> Room[] list. In-memory only; cleared when no users remain in the space. */
const spaces = new Map<string, Room[]>();

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/** Send a message to every peer in a room except `exceptId`. */
function broadcast(room: RoomId, message: ServerMessage, exceptId?: PeerId): void {
  const members = rooms.get(room);
  if (!members) return;
  for (const [peerId, conn] of members) {
    if (peerId !== exceptId) send(conn.socket, message);
  }
}

function handleJoin(socket: WebSocket, msg: Extract<ClientMessage, { type: 'join' }>): Connection | null {
  const fullRoomId = `${msg.spaceId}:${msg.room}`;
  const members = rooms.get(fullRoomId) ?? new Map<PeerId, Connection>();

  if (members.size >= MAX_PEERS_PER_ROOM) {
    send(socket, { type: 'room-full', room: msg.room });
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
  };
  const conn: Connection = { socket, peer, space: msg.spaceId, room: fullRoomId };

  // Track/sync rooms for the space
  if (!spaces.has(msg.spaceId) && msg.rooms && msg.rooms.length > 0) {
    spaces.set(msg.spaceId, msg.rooms);
  }
  const spaceRooms = spaces.get(msg.spaceId) ?? msg.rooms ?? [];

  // Snapshot existing peers before adding the newcomer.
  const existingPeers: Peer[] = [...members.values()].map((c) => c.peer);

  members.set(peer.id, conn);
  rooms.set(fullRoomId, members);

  // Tell the newcomer who is already here (newcomer will initiate offers in Phase 2) and the current room list.
  send(socket, { type: 'welcome', selfId: peer.id, peers: existingPeers, rooms: spaceRooms });
  // Tell everyone else about the newcomer.
  broadcast(fullRoomId, { type: 'peer-joined', peer }, peer.id);

  console.log(`[join] ${peer.displayName} (${peer.id}) -> room "${fullRoomId}" (${members.size}/${MAX_PEERS_PER_ROOM})`);
  return conn;
}

/** Relay a directed WebRTC message to its target peer in the same room, stamping `from`. */
function relay(conn: Connection, msg: ClientMessage & { to: PeerId }): void {
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
  const members = rooms.get(conn.room);
  if (!members) return;
  members.delete(conn.peer.id);
  broadcast(conn.room, { type: 'peer-left', peerId: conn.peer.id });
  console.log(`[leave] ${conn.peer.displayName} (${conn.peer.id}) <- room "${conn.room}" (${members.size}/${MAX_PEERS_PER_ROOM})`);
  if (members.size === 0) rooms.delete(conn.room);

  // Clean up Space from memory if no connections are left in the entire Space
  let spaceHasUsers = false;
  for (const roomMap of rooms.values()) {
    for (const c of roomMap.values()) {
      if (c.space === conn.space) {
        spaceHasUsers = true;
        break;
      }
    }
    if (spaceHasUsers) break;
  }
  if (!spaceHasUsers) {
    spaces.delete(conn.space);
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
