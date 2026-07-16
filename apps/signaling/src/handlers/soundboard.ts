import {
  MAX_ID_LEN,
  clampString,
  sanitizeSoundboardClips,
  sanitizeSoundboardTriggerSource,
} from '@chickadee/shared';
import { broadcast, broadcastSpace, spacePresence, type Connection } from '../state';

/**
 * Soundboard signaling: the manifest mirror (own custom-clip library, space-
 * wide like avatar/accent) and the trigger relay (room-only, like chat). The
 * actual clip BYTES never touch this file — P2P sync rides its own directed
 * relay (see handlers/fileTransfer.ts's shape, once soundboard fetch lands).
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
