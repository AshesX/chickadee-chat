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
  displayName: string;
  /** Whether this peer's microphone is currently muted (tracked server-side). */
  muted: boolean;
  /** Whether this peer's camera is currently on (tracked server-side). */
  cameraOn: boolean;
}

/** Messages sent from a client up to the signaling server. */
export type ClientMessage =
  | { type: 'join'; room: RoomId; displayName: string }
  | { type: 'offer'; to: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; to: PeerId; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; to: PeerId; candidate: RTCIceCandidateInit }
  // Broadcast to the whole room (no `to`); server relays with `from` stamped.
  | { type: 'mic-state'; muted: boolean }
  | { type: 'cam-state'; on: boolean };

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
  | { type: 'cam-state'; from: PeerId; on: boolean };

/** Union of every message that can travel over the signaling socket. */
export type SignalMessage = ClientMessage | ServerMessage;

/**
 * ICE server configuration for WebRTC (used in Phase 2).
 * STUN is free and configured now; TURN relay is added in Phase 5 for peers
 * behind symmetric NAT where pure P2P fails.
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

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
