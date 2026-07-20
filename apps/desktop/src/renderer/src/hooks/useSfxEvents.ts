import { useEffect, useRef } from 'react';
import { playSfx } from '../lib/sfx';
import {
  decideMuteCue,
  decideRoomPeerCue,
  decideScreenShareCue,
  decideSpotlightCue,
  decideTransmitCue,
} from '../lib/sfxTriggers';

interface UseSfxEventsOpts {
  sfxEnabled: boolean;
  sfxVolume: number;
  sfxJoinLeaveEnabled: boolean;
  sfxMuteEnabled: boolean;
  /** Whether the separate transmission-gate sound is enabled (VAD open/close, PTT key). */
  sfxTransmitEnabled: boolean;
  sfxScreenShareEnabled: boolean;
  sfxSpotlightEnabled: boolean;
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
  inputMode: 'voice' | 'ptt';
  inRoom: boolean;
  /** Comma-joined sorted ids (peers + a self sentinel) currently sharing their screen. */
  sharingIds: string;
  spotlightHolderId: string | null;
  spotlightKind: 'screen' | 'camera' | null;
}

/**
 * Plays the event-driven SFX cues. All decisions (which cue, and the settle/
 * coalesce/post-room-change suppression windows) live in the pure, unit-tested
 * lib/sfxTriggers; this hook only tracks previous values and timestamps.
 */
export function useSfxEvents({
  sfxEnabled,
  sfxVolume,
  sfxJoinLeaveEnabled,
  sfxMuteEnabled,
  sfxTransmitEnabled,
  sfxScreenShareEnabled,
  sfxSpotlightEnabled,
  currentRoomId,
  peerIdsStr,
  micEnabled,
  micButtonOn,
  inputMode,
  inRoom,
  sharingIds,
  spotlightHolderId,
  spotlightKind,
}: UseSfxEventsOpts): void {
  const prevPeerIdsRef = useRef<string>('');
  const prevRoomIdRef = useRef<string | null>(null);
  const prevMicButtonOnRef = useRef<boolean | null>(null);
  const prevMicEnabledRef = useRef<boolean | null>(null);
  const prevSharingIdsRef = useRef<string>('');
  const prevSpotlightRef = useRef<{ holderId: string | null; kind: 'screen' | 'camera' | null }>({
    holderId: null,
    kind: null,
  });
  // Timestamp of the last local room change (join / leave / switch); gates both
  // the roster-settle window and the post-room-change mute/transmit suppression.
  const lastRoomChangeRef = useRef<number>(0);
  // Timestamp of the last peer join/leave cue, for coalescing rapid ones.
  const lastPeerSfxRef = useRef<number>(0);

  // Peer join/leave sounds + local room join/leave sounds.
  useEffect(() => {
    const decision = decideRoomPeerCue({
      sfxEnabled,
      joinLeaveEnabled: sfxJoinLeaveEnabled,
      roomId: currentRoomId,
      prevRoomId: prevRoomIdRef.current,
      peerIds: peerIdsStr,
      prevPeerIds: prevPeerIdsRef.current,
      now: Date.now(),
      lastRoomChangeAt: lastRoomChangeRef.current,
      lastPeerSfxAt: lastPeerSfxRef.current,
    });
    if (decision.roomChanged) lastRoomChangeRef.current = Date.now();
    if (decision.peerCuePlayed) lastPeerSfxRef.current = Date.now();
    if (decision.cue) playSfx(decision.cue, sfxVolume);
    prevPeerIdsRef.current = peerIdsStr;
    prevRoomIdRef.current = currentRoomId;
  }, [currentRoomId, peerIdsStr, sfxEnabled, sfxVolume, sfxJoinLeaveEnabled]);

  // Mute/unmute sound — watches micButtonOn (user intent).
  useEffect(() => {
    const prev = prevMicButtonOnRef.current;
    prevMicButtonOnRef.current = micButtonOn;
    if (prev === null || micButtonOn === prev) return;

    const cue = decideMuteCue(micButtonOn, {
      inRoom,
      sfxEnabled,
      muteEnabled: sfxMuteEnabled,
      inputMode,
      msSinceRoomChange: Date.now() - lastRoomChangeRef.current,
    });
    if (cue) playSfx(cue, sfxVolume);
  }, [micButtonOn, inRoom, sfxEnabled, sfxVolume, sfxMuteEnabled, inputMode]);

  // Transmission sound — watches micEnabled in gated modes (VAD open/close, PTT key).
  useEffect(() => {
    const prev = prevMicEnabledRef.current;
    prevMicEnabledRef.current = micEnabled;
    if (prev === null || micEnabled === prev) return;

    const cue = decideTransmitCue(micEnabled, {
      inRoom,
      sfxEnabled,
      transmitEnabled: sfxTransmitEnabled,
      inputMode,
      micButtonOn,
      msSinceRoomChange: Date.now() - lastRoomChangeRef.current,
    });
    if (cue) playSfx(cue, sfxVolume);
  }, [micEnabled, sfxEnabled, sfxTransmitEnabled, sfxVolume, inRoom, inputMode, micButtonOn]);

  // Screen-share start/stop — self or any peer in the room.
  useEffect(() => {
    const cue = decideScreenShareCue({
      sfxEnabled,
      screenShareEnabled: sfxScreenShareEnabled,
      inRoom,
      sharingIds,
      prevSharingIds: prevSharingIdsRef.current,
      now: Date.now(),
      lastRoomChangeAt: lastRoomChangeRef.current,
    });
    if (cue) playSfx(cue, sfxVolume);
    prevSharingIdsRef.current = sharingIds;
  }, [sharingIds, sfxEnabled, sfxScreenShareEnabled, sfxVolume, inRoom]);

  // Camera-stage spotlight claim/lose.
  useEffect(() => {
    const prev = prevSpotlightRef.current;
    const cue = decideSpotlightCue({
      sfxEnabled,
      spotlightEnabled: sfxSpotlightEnabled,
      prevHolderId: prev.holderId,
      prevKind: prev.kind,
      holderId: spotlightHolderId,
      kind: spotlightKind,
    });
    if (cue) playSfx(cue, sfxVolume);
    prevSpotlightRef.current = { holderId: spotlightHolderId, kind: spotlightKind };
  }, [spotlightHolderId, spotlightKind, sfxEnabled, sfxSpotlightEnabled, sfxVolume]);
}
