import type { PeerId, RoomId } from '@chickadee/shared';
import { broadcast, send, spotlights, type Connection } from '../state';
import { evaluateSpotlightClaim } from '../logic';

/**
 * Claim the room's single stage slot for a screen/camera. Grants if the slot is
 * free, already held by this peer, or `force` (take-over). On grant, broadcasts
 * `spotlight-state` to the whole room (incl. the claimant, so it confirms). On a
 * blocked non-force claim, replies `spotlight-busy` so the client can offer take-over.
 */
export function handleClaimSpotlight(conn: Connection, kind: 'screen' | 'camera', force: boolean): void {
  const roomId = conn.room;
  if (!roomId) return;
  const decision = evaluateSpotlightClaim(spotlights.get(roomId), conn.peer.id, force);
  if (!decision.grant) {
    send(conn.socket, { type: 'spotlight-busy', holderId: decision.busyHolderId });
    return;
  }
  spotlights.set(roomId, { holderId: conn.peer.id, kind });
  broadcast(roomId, { type: 'spotlight-state', holderId: conn.peer.id, kind });
}

/** Release the stage slot if this peer holds it, and tell the room it's free. */
export function handleReleaseSpotlight(conn: Connection): void {
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
export function clearSpotlightIfHeld(roomId: RoomId | null, peerId: PeerId): void {
  if (!roomId) return;
  if (spotlights.get(roomId)?.holderId === peerId) {
    spotlights.delete(roomId);
    broadcast(roomId, { type: 'spotlight-state', holderId: null, kind: null });
  }
}
