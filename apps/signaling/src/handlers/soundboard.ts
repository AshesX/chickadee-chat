import {
  MAX_FILE_REASON_LEN,
  MAX_ID_LEN,
  clampString,
  sanitizeSoundboardClips,
  sanitizeSoundboardFetchHashes,
  sanitizeSoundboardTriggerSource,
  type ClientMessage,
} from '@chickadee/shared';
import { broadcast, broadcastSpace, spaceConnections, spacePresence, send, type Connection } from '../state';

/**
 * Soundboard signaling: the manifest mirror (own custom-clip library, space-
 * wide like avatar/accent), the trigger relay (room-only, like chat), and the
 * clip-fetch relay (directed, space-scoped, like file transfer). The actual
 * clip BYTES never touch this file — they flow over a dedicated RTCDataChannel,
 * same as file transfer.
 */

/** Record a peer's custom-clip library and broadcast to all space members (mirror pattern, like avatar). */
export function handleSoundboardManifestState(conn: Connection, clips: unknown): void {
  const safe = sanitizeSoundboardClips(clips);
  conn.peer.soundboardClips = safe;
  broadcast(conn.room, { type: 'soundboard-manifest-state', from: conn.peer.id, clips: safe }, conn.peer.id);
  const pMap = spacePresence.get(conn.space);
  if (pMap) {
    const p = pMap.get(conn.peer.userId);
    if (p) broadcastSpace(conn.space, { type: 'space-peer-update', presence: p }, conn);
  }
}

/** Relay a soundboard trigger to the rest of the room (ephemeral, like chat — no server-side state). */
export function handleSoundboardTrigger(conn: Connection, source: unknown, clipId: unknown): void {
  const safeSource = sanitizeSoundboardTriggerSource(source);
  const safeClipId = clampString(clipId, MAX_ID_LEN);
  if (!safeSource || !safeClipId) return;
  broadcast(
    conn.room,
    { type: 'soundboard-trigger', from: conn.peer.id, source: safeSource, clipId: safeClipId },
    conn.peer.id,
  );
}

type SoundboardFetchMessage = Extract<
  ClientMessage,
  { type: 'soundboard-fetch-request' | 'soundboard-fetch-signal' | 'soundboard-fetch-cancel' }
>;

/**
 * Directed SPACE-scoped relay for the silent clip-fetch handshake — same
 * shape as `relayFileMessage`: looked up across the whole space (not just the
 * room) so a fetch can reach a peer elsewhere in the Space, stateless (the
 * server never tracks in-flight fetches, only stamps `from` and forwards),
 * and `-signal`'s SDP/ICE payload is relayed verbatim, never inspected.
 */
export function relaySoundboardFetchMessage(conn: Connection, msg: SoundboardFetchMessage): void {
  const to = clampString(msg.to, MAX_ID_LEN);
  const requestId = clampString(msg.requestId, MAX_ID_LEN);
  if (!to || !requestId || to === conn.peer.id) return;
  const target = spaceConnections.get(conn.space)?.get(to);
  if (!target) return;

  switch (msg.type) {
    case 'soundboard-fetch-request': {
      const hashes = sanitizeSoundboardFetchHashes(msg.hashes);
      if (hashes.length === 0) return;
      send(target.socket, { type: 'soundboard-fetch-request', from: conn.peer.id, requestId, hashes });
      break;
    }
    case 'soundboard-fetch-signal':
      send(target.socket, {
        type: 'soundboard-fetch-signal',
        from: conn.peer.id,
        requestId,
        sdp: msg.sdp,
        candidate: msg.candidate,
      });
      break;
    case 'soundboard-fetch-cancel': {
      const reason = clampString(msg.reason, MAX_FILE_REASON_LEN);
      send(target.socket, {
        type: 'soundboard-fetch-cancel',
        from: conn.peer.id,
        requestId,
        ...(reason ? { reason } : {}),
      });
      break;
    }
  }
}
