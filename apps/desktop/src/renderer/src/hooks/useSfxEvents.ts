import { useEffect, useRef } from 'react';
import { playSfx } from '../lib/sfx';

interface UseSfxEventsOpts {
  sfxEnabled: boolean;
  sfxVolume: number;
  sfxJoinLeaveEnabled: boolean;
  sfxMuteEnabled: boolean;
  currentRoomId: string | null;
  peerIdsStr: string;
  micEnabled: boolean;
  inRoom: boolean;
}

export function useSfxEvents({
  sfxEnabled,
  sfxVolume,
  sfxJoinLeaveEnabled,
  sfxMuteEnabled,
  currentRoomId,
  peerIdsStr,
  micEnabled,
  inRoom,
}: UseSfxEventsOpts): void {
  const prevPeerIdsRef = useRef<string>('');
  const prevRoomIdRef = useRef<string | null>(null);
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

  // Mute/unmute sound.
  useEffect(() => {
    if (prevMicEnabledRef.current === null) {
      prevMicEnabledRef.current = micEnabled;
      return;
    }
    if (micEnabled !== prevMicEnabledRef.current) {
      // Only play mute/unmute if we're in a room and it's been more than 1 second since joining.
      // This suppresses the mute/unmute sounds that trigger during media setup/re-negotiation on join.
      const timeSinceJoin = Date.now() - lastJoinTimeRef.current;
      if (inRoom && timeSinceJoin > 1000 && sfxEnabled && sfxMuteEnabled) {
        playSfx(micEnabled ? 'unmute' : 'mute', sfxVolume);
      }
      prevMicEnabledRef.current = micEnabled;
    }
  }, [micEnabled, inRoom, sfxEnabled, sfxVolume, sfxMuteEnabled]);
}
