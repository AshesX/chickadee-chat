import { useEffect, useRef } from 'react';
import { playSfx } from '../lib/sfx';

// After a local room change the roster arrives async (welcome); suppress peer
// join/leave cues until it settles so the populate/swap doesn't fire a second
// cue over your own join/leave. Matches the mute-guard window.
const ROSTER_SETTLE_MS = 1000;
// Min spacing between peer join/leave cues (~one cue length) so near-simultaneous
// peer events (separate WS messages → separate renders) don't stack/distort.
const PEER_SFX_GAP_MS = 300;

interface UseSfxEventsOpts {
  sfxEnabled: boolean;
  sfxVolume: number;
  sfxJoinLeaveEnabled: boolean;
  sfxMuteEnabled: boolean;
  /** Whether the separate transmission-gate sound is enabled (VAD open/close, PTT key). */
  sfxTransmitEnabled: boolean;
  currentRoomId: string | null;
  peerIdsStr: string;
  /** Raw mic-enabled state — drives the transmission SFX (VAD gate / PTT key). */
  micEnabled: boolean;
  /**
   * User-intent mic state (what the Mute button reflects).
   * In voice mode this is `!voiceMuted`; in open/PTT it equals micEnabled.
   * Changes only on deliberate mute actions, not on VAD gate transitions.
   */
  micButtonOn: boolean;
  inputMode: 'open' | 'voice' | 'ptt';
  inRoom: boolean;
}

export function useSfxEvents({
  sfxEnabled,
  sfxVolume,
  sfxJoinLeaveEnabled,
  sfxMuteEnabled,
  sfxTransmitEnabled,
  currentRoomId,
  peerIdsStr,
  micEnabled,
  micButtonOn,
  inputMode,
  inRoom,
}: UseSfxEventsOpts): void {
  const prevPeerIdsRef = useRef<string>('');
  const prevRoomIdRef = useRef<string | null>(null);
  const prevMicButtonOnRef = useRef<boolean | null>(null);
  const prevMicEnabledRef = useRef<boolean | null>(null);
  // Timestamp of the last local room change (join / leave / switch); gates both
  // the roster-settle window and the post-room-change mute-cue suppression.
  const lastRoomChangeRef = useRef<number>(0);
  // Timestamp of the last peer join/leave cue, for coalescing rapid ones.
  const lastPeerSfxRef = useRef<number>(0);

  // Peer join/leave sounds + local room join/leave sounds.
  useEffect(() => {
    if (!sfxEnabled) {
      prevPeerIdsRef.current = peerIdsStr;
      prevRoomIdRef.current = currentRoomId;
      return;
    }

    // Local user join/leave/switch.
    if (currentRoomId !== prevRoomIdRef.current) {
      if (currentRoomId) {
        if (sfxJoinLeaveEnabled) playSfx('join', sfxVolume);
      } else if (prevRoomIdRef.current) {
        if (sfxJoinLeaveEnabled) playSfx('leave', sfxVolume);
      }
      // Reset the settle window on ANY local room change so the async roster
      // populate/swap that follows doesn't fire a second (overlapping) cue.
      lastRoomChangeRef.current = Date.now();
      prevRoomIdRef.current = currentRoomId;
      prevPeerIdsRef.current = peerIdsStr;
      return;
    }

    // Peer join/leave (only while in a room, and only once the roster has settled
    // after a local room change — otherwise the initial populate looks like joins).
    if (
      currentRoomId &&
      sfxJoinLeaveEnabled &&
      Date.now() - lastRoomChangeRef.current > ROSTER_SETTLE_MS
    ) {
      const prevPeers = prevPeerIdsRef.current ? prevPeerIdsRef.current.split(',').filter(Boolean) : [];
      const currentPeers = peerIdsStr ? peerIdsStr.split(',').filter(Boolean) : [];
      const grew = currentPeers.length > prevPeers.length;
      const shrank = currentPeers.length < prevPeers.length;
      // Coalesce rapid peer events so two near-simultaneous ones don't overlap.
      if ((grew || shrank) && Date.now() - lastPeerSfxRef.current > PEER_SFX_GAP_MS) {
        lastPeerSfxRef.current = Date.now();
        playSfx(grew ? 'join' : 'leave', sfxVolume);
      }
    }

    prevPeerIdsRef.current = peerIdsStr;
    prevRoomIdRef.current = currentRoomId;
  }, [currentRoomId, peerIdsStr, sfxEnabled, sfxVolume, sfxJoinLeaveEnabled]);

  // Mute/unmute sound — watches micButtonOn (user intent), excluded in PTT mode where
  // the PTT key and the mute button look identical at the micEnabled level.
  useEffect(() => {
    if (prevMicButtonOnRef.current === null) {
      prevMicButtonOnRef.current = micButtonOn;
      return;
    }
    if (micButtonOn === prevMicButtonOnRef.current) {
      prevMicButtonOnRef.current = micButtonOn;
      return;
    }
    prevMicButtonOnRef.current = micButtonOn;

    const timeSinceRoomChange = Date.now() - lastRoomChangeRef.current;
    if (inRoom && timeSinceRoomChange > 1000 && sfxEnabled && sfxMuteEnabled && inputMode !== 'ptt') {
      playSfx(micButtonOn ? 'unmute' : 'mute', sfxVolume);
    }
  }, [micButtonOn, inRoom, sfxEnabled, sfxVolume, sfxMuteEnabled, inputMode]);

  // Transmission sound — watches micEnabled in gated modes (VAD open/close, PTT key).
  // In voice mode, suppressed when the user has manually muted (micButtonOn = false).
  useEffect(() => {
    if (prevMicEnabledRef.current === null) {
      prevMicEnabledRef.current = micEnabled;
      return;
    }
    if (micEnabled === prevMicEnabledRef.current) {
      prevMicEnabledRef.current = micEnabled;
      return;
    }
    prevMicEnabledRef.current = micEnabled;

    if (!sfxEnabled || !sfxTransmitEnabled || !inRoom || inputMode === 'open') return;
    // Voice mode: don't play transmission sound when the gate closes due to manual mute.
    if (inputMode === 'voice' && !micButtonOn) return;
    const timeSinceRoomChange = Date.now() - lastRoomChangeRef.current;
    if (timeSinceRoomChange > 1000) {
      playSfx(micEnabled ? 'transmit-open' : 'transmit-close', sfxVolume);
    }
  }, [micEnabled, sfxEnabled, sfxTransmitEnabled, sfxVolume, inRoom, inputMode, micButtonOn]);
}
