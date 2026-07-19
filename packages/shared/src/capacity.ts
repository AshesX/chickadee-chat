/**
 * Room capacity model. Rooms are uniformly 'hybrid' and 8-capped — the full
 * mesh is protected by the asymmetric-quality "one stage stream + thumbnails"
 * model (see the desktop's encodingParams.ts), not a low headcount.
 */

/** Legacy voice-room cap, kept for reference/back-compat (equals the hybrid cap). */
export const MAX_PEERS_VOICE = 8;

/** Peer capacity of a hybrid room (audio + golden-ratio video). */
export const MAX_PEERS_HYBRID = 8;

/**
 * Max number of userIds one peer may subscribe to via sink-state — a viewer
 * can't watch more senders than a full room holds.
 */
export const MAX_SINK_SUBSCRIPTIONS = MAX_PEERS_HYBRID;

/**
 * The kind of a room. 'hybrid' is the current unified room (audio + optional
 * video, 8-cap); 'voice'/'video' are legacy values that migrate to 'hybrid'.
 */
export type RoomType = 'voice' | 'video' | 'hybrid';

/** Peer capacity per room type. All types are 8 now (hybrid rooms). */
export const ROOM_CAPACITY: Record<RoomType, number> = {
  video: MAX_PEERS_HYBRID,
  voice: MAX_PEERS_HYBRID,
  hybrid: MAX_PEERS_HYBRID,
};

/**
 * Resolve a room's peer capacity. Every room is a hybrid 8-cap now (the
 * golden-ratio media model keeps 8-way video mesh-safe), so this is uniformly 8
 * regardless of the (possibly legacy) type.
 */
export function capacityForType(_type: RoomType | undefined): number {
  return MAX_PEERS_HYBRID;
}

/**
 * Normalize a possibly-legacy room type to the unified 'hybrid'. All rooms are
 * hybrid now; this keeps persisted 'voice'/'video'/undefined rooms rendering in
 * the single sidebar list. Applied on load (the client is the room-list writer).
 */
export function normalizeRoomType(_type: RoomType | undefined): RoomType {
  return 'hybrid';
}
