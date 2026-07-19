// Pure decision logic for the event-driven SFX cues (useSfxEvents owns the
// refs/effects and plays whatever cue these return). Timestamps come in as
// plain numbers so every suppression window is unit-testable.

// After a local room change the roster arrives async (welcome); suppress peer
// join/leave cues until it settles so the populate/swap doesn't fire a second
// cue over your own join/leave. Matches the mute-guard window.
export const ROSTER_SETTLE_MS = 1000;
// Min spacing between peer join/leave cues (~one cue length) so near-simultaneous
// peer events (separate WS messages → separate renders) don't stack/distort.
export const PEER_SFX_GAP_MS = 300;
// Mute/transmit cues are suppressed this long after a local room change so the
// join/leave cue and the (re)asserted gate state don't play over each other.
export const POST_ROOM_CHANGE_SUPPRESS_MS = 1000;

export interface RoomPeerCueInput {
  sfxEnabled: boolean;
  joinLeaveEnabled: boolean;
  roomId: string | null;
  prevRoomId: string | null;
  /** Comma-joined sorted peer ids (the cheap roster identity from App). */
  peerIds: string;
  prevPeerIds: string;
  now: number;
  lastRoomChangeAt: number;
  lastPeerSfxAt: number;
}

export interface RoomPeerCueDecision {
  cue: 'join' | 'leave' | null;
  /** True on any local room change — caller stamps lastRoomChangeAt. */
  roomChanged: boolean;
  /** True when a peer join/leave cue fired — caller stamps lastPeerSfxAt. */
  peerCuePlayed: boolean;
}

/** Local room join/leave/switch cue, else a settled + coalesced peer join/leave cue. */
export function decideRoomPeerCue(i: RoomPeerCueInput): RoomPeerCueDecision {
  if (!i.sfxEnabled) return { cue: null, roomChanged: false, peerCuePlayed: false };

  // Local user join/leave/switch (a switch counts as a join into the new room).
  if (i.roomId !== i.prevRoomId) {
    const cue = i.roomId
      ? i.joinLeaveEnabled
        ? ('join' as const)
        : null
      : i.prevRoomId && i.joinLeaveEnabled
        ? ('leave' as const)
        : null;
    return { cue, roomChanged: true, peerCuePlayed: false };
  }

  // Peer join/leave (only while in a room, and only once the roster has settled
  // after a local room change — otherwise the initial populate looks like joins).
  if (i.roomId && i.joinLeaveEnabled && i.now - i.lastRoomChangeAt > ROSTER_SETTLE_MS) {
    const prevCount = i.prevPeerIds ? i.prevPeerIds.split(',').filter(Boolean).length : 0;
    const count = i.peerIds ? i.peerIds.split(',').filter(Boolean).length : 0;
    // Coalesce rapid peer events so two near-simultaneous ones don't overlap.
    if (count !== prevCount && i.now - i.lastPeerSfxAt > PEER_SFX_GAP_MS) {
      return { cue: count > prevCount ? 'join' : 'leave', roomChanged: false, peerCuePlayed: true };
    }
  }

  return { cue: null, roomChanged: false, peerCuePlayed: false };
}

export interface MuteCueContext {
  inRoom: boolean;
  sfxEnabled: boolean;
  muteEnabled: boolean;
  inputMode: 'voice' | 'ptt';
  msSinceRoomChange: number;
}

/**
 * Mute/unmute cue for a just-flipped micButtonOn (user intent). Excluded in PTT
 * mode, where the PTT key and the mute button look identical at this level.
 */
export function decideMuteCue(micButtonOn: boolean, ctx: MuteCueContext): 'mute' | 'unmute' | null {
  if (!ctx.inRoom || ctx.msSinceRoomChange <= POST_ROOM_CHANGE_SUPPRESS_MS) return null;
  if (!ctx.sfxEnabled || !ctx.muteEnabled || ctx.inputMode === 'ptt') return null;
  return micButtonOn ? 'unmute' : 'mute';
}

export interface TransmitCueContext {
  inRoom: boolean;
  sfxEnabled: boolean;
  transmitEnabled: boolean;
  inputMode: 'voice' | 'ptt';
  micButtonOn: boolean;
  msSinceRoomChange: number;
}

/**
 * Transmission-gate cue for a just-flipped micEnabled (VAD open/close, PTT key).
 * In voice mode, suppressed while manually muted (the gate close came from the
 * mute button, which has its own cue).
 */
export function decideTransmitCue(
  micEnabled: boolean,
  ctx: TransmitCueContext,
): 'transmit-open' | 'transmit-close' | null {
  if (!ctx.sfxEnabled || !ctx.transmitEnabled || !ctx.inRoom) return null;
  if (ctx.inputMode === 'voice' && !ctx.micButtonOn) return null;
  if (ctx.msSinceRoomChange <= POST_ROOM_CHANGE_SUPPRESS_MS) return null;
  return micEnabled ? 'transmit-open' : 'transmit-close';
}
