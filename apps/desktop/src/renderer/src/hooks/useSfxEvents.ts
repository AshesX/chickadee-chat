import { useEffect, useRef } from 'react';
import { playSfx } from '../lib/sfx';

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
  const lastJoinTimeRef = useRef<number>(0);

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
        lastJoinTimeRef.current = Date.now();
      } else if (prevRoomIdRef.current) {
        if (sfxJoinLeaveEnabled) playSfx('leave', sfxVolume);
      }
      prevRoomIdRef.current = currentRoomId;
      prevPeerIdsRef.current = peerIdsStr;
      return;
    }

    // Peer join/leave (only while in a room).
    if (currentRoomId && sfxJoinLeaveEnabled) {
      const prevPeers = prevPeerIdsRef.current ? prevPeerIdsRef.current.split(',').filter(Boolean) : [];
      const currentPeers = peerIdsStr ? peerIdsStr.split(',').filter(Boolean) : [];
      if (currentPeers.length > prevPeers.length) playSfx('join', sfxVolume);
      else if (currentPeers.length < prevPeers.length) playSfx('leave', sfxVolume);
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

    const timeSinceJoin = Date.now() - lastJoinTimeRef.current;
    if (inRoom && timeSinceJoin > 1000 && sfxEnabled && sfxMuteEnabled && inputMode !== 'ptt') {
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
    const timeSinceJoin = Date.now() - lastJoinTimeRef.current;
    if (timeSinceJoin > 1000) {
      playSfx(micEnabled ? 'transmit-open' : 'transmit-close', sfxVolume);
    }
  }, [micEnabled, sfxEnabled, sfxTransmitEnabled, sfxVolume, inRoom, inputMode, micButtonOn]);
}
