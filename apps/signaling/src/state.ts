import type { WebSocket } from 'ws';
import type { Peer, PeerId, Room, RoomId, ServerMessage, SpacePresence } from '@chickadee/shared';

/** Everything we track about one connected socket. */
export interface Connection {
  socket: WebSocket;
  peer: Peer;
  space: string;
  room: RoomId | null;
}

/** room id -> (peer id -> connection). In-memory only; restart clears all state. */
export const rooms = new Map<RoomId, Map<PeerId, Connection>>();

/**
 * composite room id -> the single "stage" holder (spotlight). At most one peer
 * per room may hold the stage; a screen/camera on the stage streams at high
 * quality while everyone else's video is a compressed thumbnail. Server-arbitrated
 * so two claimants can't both win (mirror of the `room-full` reject pattern).
 */
export const spotlights = new Map<RoomId, { holderId: PeerId; kind: 'screen' | 'camera' }>();

/**
 * space id -> owning member's stable userId. Ephemeral (in-memory only) but,
 * unlike `spaces`/`spacePresence`, deliberately NOT cleared by
 * scheduleSpaceCleanup when a Space fully empties — a Space emptying out (e.g.
 * overnight) is routine, and resetting ownership then would let whoever
 * reconnects first silently and permanently claim it (no take-over mechanic
 * exists for ownership, unlike spotlight). Only a full server restart resets
 * this map.
 */
export const spaceOwners = new Map<string, string>();

/**
 * space id -> the Space's current banner + who set it. Same "not cleared on
 * empty" reasoning as spaceOwners above — it's sticky content, not
 * per-connection presence.
 */
export const spaceBanners = new Map<string, { dataUrl: string | null; setBy: string }>();

/** space id -> Room[] list. In-memory only; cleared when no users remain in the space. */
export const spaces = new Map<string, Room[]>();

/** space id -> userId -> SpacePresence */
export const spacePresence = new Map<string, Map<string, SpacePresence>>();

/** space id -> userId -> Timeout */
export const spaceTimeouts = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();

/** space id -> (peer id -> connection). In-memory only; cleared when no users remain in the space. */
export const spaceConnections = new Map<string, Map<PeerId, Connection>>();

/** Grace window before a Space with no remaining connections is torn down, so a
 *  sole member reconnecting (heartbeat blip, dev same-userId handoff) doesn't make
 *  the Space momentarily report as non-existent to a check-space probe. */
export const SPACE_EXISTENCE_GRACE_MS = 5_000;

/** space id -> pending teardown timer. */
export const spaceGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Tear down a Space's in-memory state after a grace window, but only if it still
 * has no live connections by the time the timer fires. A (re)join cancels this
 * via `spaceGraceTimers`, so a brief reconnect of the last member keeps the Space
 * continuously "live" for `check-space` probes.
 */
export function scheduleSpaceCleanup(spaceId: string): void {
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

export function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/** Send a message to every peer in a room except `exceptId`. */
export function broadcast(room: RoomId | null, message: ServerMessage, exceptId?: PeerId): void {
  if (!room) return;
  const members = rooms.get(room);
  if (!members) return;
  for (const [peerId, conn] of members) {
    if (peerId !== exceptId) send(conn.socket, message);
  }
}

export function broadcastSpace(spaceId: string, message: ServerMessage, exceptConn?: Connection): void {
  const conns = spaceConnections.get(spaceId);
  if (!conns) return;
  for (const conn of conns.values()) {
    if (conn !== exceptConn) {
      send(conn.socket, message);
    }
  }
}
