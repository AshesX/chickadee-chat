import {
  CHAT_MAX_LEN,
  MAX_ID_LEN,
  MAX_SINK_SUBSCRIPTIONS,
  MAX_VOICE_PREF_LEN,
  clampString,
  sanitizeAccentColor,
  sanitizeAvatarDataUrl,
  sanitizeStatus,
} from '@chickadee/shared';
import { broadcast, broadcastSpace, spacePresence, type Connection } from '../state';

// The per-peer "mirror pattern" broadcasts: record the new state on conn.peer and
// tell everyone else in the room (avatar/accent/status additionally fan out
// space-wide via space-peer-update).

/** Record a peer's new mute state and tell everyone else in the room. */
export function handleMicState(conn: Connection, muted: boolean): void {
  conn.peer.muted = muted;
  broadcast(conn.room, { type: 'mic-state', from: conn.peer.id, muted }, conn.peer.id);
}

/** Record a peer's new speaking state and tell everyone else in the room. */
export function handleSpeakingState(conn: Connection, speaking: boolean): void {
  conn.peer.speaking = speaking;
  broadcast(conn.room, { type: 'speaking-state', from: conn.peer.id, speaking }, conn.peer.id);
}

/** Record a peer's new camera state and tell everyone else in the room. */
export function handleCamState(conn: Connection, on: boolean): void {
  conn.peer.cameraOn = on;
  broadcast(conn.room, { type: 'cam-state', from: conn.peer.id, on }, conn.peer.id);
}

/** Record a peer's screen-share state (streamId or null) and tell the room. */
export function handleScreenState(conn: Connection, streamId: string | null): void {
  conn.peer.screenStreamId = streamId;
  broadcast(conn.room, { type: 'screen-state', from: conn.peer.id, streamId }, conn.peer.id);
}

/** Record a peer's new deafen state and tell everyone else in the room (mirror pattern). */
export function handleDeafenState(conn: Connection, deafened: boolean): void {
  conn.peer.deafened = deafened;
  broadcast(conn.room, { type: 'deafen-state', from: conn.peer.id, deafened }, conn.peer.id);
}

/** Record a peer's avatar and broadcast to all space members (avatar syncs space-wide, not just the room). */
export function handleAvatarState(conn: Connection, avatarDataUrl: string | null): void {
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
export function handleAccentState(conn: Connection, accentColor: string): void {
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
export function handleVoiceState(conn: Connection, voicePreference: string): void {
  conn.peer.voicePreference = clampString(voicePreference, MAX_VOICE_PREF_LEN);
  broadcast(conn.room, { type: 'voice-state', from: conn.peer.id, voicePreference: conn.peer.voicePreference }, conn.peer.id);
}

/**
 * Record a peer's video opt-in state — which userIds it has joined
 * (subscriptions) and whether it's rendering video (false while docked) — and
 * tell the room (room-only — media is room-scoped). Subscriptions are clamped:
 * an array of clamped-string userIds, capped at the room size.
 */
export function handleSinkState(conn: Connection, subscriptions: unknown, wantsVideo: unknown): void {
  const safeSubs = Array.isArray(subscriptions)
    ? subscriptions
        .filter((s): s is string => typeof s === 'string')
        .slice(0, MAX_SINK_SUBSCRIPTIONS)
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

/** Record a peer's presence status and tell the room (mirror pattern). */
export function handleStatusState(conn: Connection, status: 'online' | 'idle' | 'dnd'): void {
  const safe = sanitizeStatus(status);
  conn.peer.status = safe;
  broadcast(conn.room, { type: 'status-state', from: conn.peer.id, status: safe }, conn.peer.id);

  const pMap = spacePresence.get(conn.space);
  if (pMap) {
    const p = pMap.get(conn.peer.userId);
    if (p) broadcastSpace(conn.space, { type: 'space-peer-update', presence: p });
  }
}

/** Relay an ephemeral chat message / reaction to the rest of the room. */
export function handleChat(conn: Connection, text: string, reaction: boolean | undefined): void {
  const trimmed = clampString(text, CHAT_MAX_LEN);
  if (!trimmed) return;
  broadcast(
    conn.room,
    { type: 'chat', from: conn.peer.id, text: trimmed, reaction },
    conn.peer.id,
  );
}
