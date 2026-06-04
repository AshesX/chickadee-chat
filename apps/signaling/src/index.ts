import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  MAX_PEERS_PER_ROOM,
  parseClientMessage,
  type ClientMessage,
  type Peer,
  type PeerId,
  type RoomId,
  type ServerMessage,
} from '@chickadee/shared';

const PORT = Number(process.env.PORT ?? 8080);

/** Everything we track about one connected socket. */
interface Connection {
  socket: WebSocket;
  peer: Peer;
  room: RoomId;
}

/** room id -> (peer id -> connection). In-memory only; restart clears all state. */
const rooms = new Map<RoomId, Map<PeerId, Connection>>();

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
  const members = rooms.get(msg.room) ?? new Map<PeerId, Connection>();

  if (members.size >= MAX_PEERS_PER_ROOM) {
    send(socket, { type: 'room-full', room: msg.room });
    return null;
  }

  const peer: Peer = {
    id: randomUUID(),
    displayName: msg.displayName.trim() || 'Anonymous',
  };
  const conn: Connection = { socket, peer, room: msg.room };

  // Snapshot existing peers before adding the newcomer.
  const existingPeers: Peer[] = [...members.values()].map((c) => c.peer);

  members.set(peer.id, conn);
  rooms.set(msg.room, members);

  // Tell the newcomer who is already here (newcomer will initiate offers in Phase 2).
  send(socket, { type: 'welcome', selfId: peer.id, peers: existingPeers });
  // Tell everyone else about the newcomer.
  broadcast(msg.room, { type: 'peer-joined', peer }, peer.id);

  console.log(`[join] ${peer.displayName} (${peer.id}) -> room "${msg.room}" (${members.size}/${MAX_PEERS_PER_ROOM})`);
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

function handleDisconnect(conn: Connection): void {
  const members = rooms.get(conn.room);
  if (!members) return;
  members.delete(conn.peer.id);
  broadcast(conn.room, { type: 'peer-left', peerId: conn.peer.id });
  console.log(`[leave] ${conn.peer.displayName} (${conn.peer.id}) <- room "${conn.room}" (${members.size}/${MAX_PEERS_PER_ROOM})`);
  if (members.size === 0) rooms.delete(conn.room);
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (socket) => {
  // A connection has no identity until it sends a valid `join`.
  let conn: Connection | null = null;

  socket.on('message', (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) return;

    if (msg.type === 'join') {
      if (conn) return; // already joined; ignore duplicate joins
      conn = handleJoin(socket, msg);
      return;
    }

    if (!conn) return; // must join before doing anything else

    if (msg.type === 'offer' || msg.type === 'answer' || msg.type === 'ice-candidate') {
      relay(conn, msg);
    }
  });

  socket.on('close', () => {
    if (conn) handleDisconnect(conn);
  });

  socket.on('error', () => {
    if (conn) handleDisconnect(conn);
  });
});

console.log(`Chickadee signaling server listening on :${PORT}`);
