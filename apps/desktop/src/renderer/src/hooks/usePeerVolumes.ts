import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { store } from '../lib/settings';

interface VolumePeer {
  id: string;
  userId: string;
}

interface VolumeStore {
  get: () => Record<string, number>;
  set: (userId: string, volume: number) => void;
}

export interface PeerVolumes {
  volumes: Record<string, number>;
  handleVolumeChange: (peerId: string, volume: number) => void;
  togglePeerMute: (peerId: string) => void;
  togglePeerMuteByUserId: (uid: string) => void;
  mutedUserIds: Set<string>;
}

// Per-peer playback volume + click-to-silence, generic over which persisted
// store backs it (voice vs. screen-share audio). Live values are keyed by
// session peer.id; persistence is keyed by stable userId so a boost sticks
// across restarts/reconnects. Silence is just volume 0 (no separate mute flag).
function usePeerVolumeControl(
  peers: readonly VolumePeer[],
  volumeStore: VolumeStore,
  onMuteOtherCue?: () => void,
): PeerVolumes {
  const [volumes, setVolumes] = useState<Record<string, number>>({});

  // Mirror peers + volumes into refs so the callbacks below can stay
  // identity-stable (deps []). `peers` gets a fresh array reference on every
  // presence update (including each peer's speaking edge), so a callback
  // depending on it would change identity ~constantly and defeat
  // ParticipantTile's React.memo — exactly the churn the memo exists to skip.
  const peersRef = useRef(peers);
  peersRef.current = peers;
  const volumesRef = useRef(volumes);
  volumesRef.current = volumes;

  // Manual per-peer volume: update the live (peerId-keyed) map and persist by
  // stable userId (a new peer.id is re-seeded on join by the hydrate effect below).
  const handleVolumeChange = useCallback((peerId: string, volume: number) => {
    setVolumes((prev) => ({ ...prev, [peerId]: volume }));
    const uid = peersRef.current.find((p) => p.id === peerId)?.userId;
    if (uid) volumeStore.set(uid, volume);
  }, [volumeStore]);

  // Click-to-silence: mute = volume 0, remembering the pre-mute level (by
  // peer.id, session-only) so a later un-silence restores it. Reuses the volume
  // persistence path.
  const lastNonZeroVolumeRef = useRef<Record<string, number>>({});
  const togglePeerMute = useCallback(
    (peerId: string) => {
      const cur = volumesRef.current[peerId] ?? 1;
      if (cur > 0) {
        lastNonZeroVolumeRef.current[peerId] = cur;
        handleVolumeChange(peerId, 0);
      } else {
        handleVolumeChange(peerId, lastNonZeroVolumeRef.current[peerId] ?? 1);
      }
      onMuteOtherCue?.();
    },
    [handleVolumeChange, onMuteOtherCue],
  );

  // Stable userIds of peers we've silenced (volume 0) — drives the compact
  // avatar mute overlay; plus a userId→session-id bridge so the sidebar can
  // mute by userId.
  const mutedUserIds = useMemo(
    () => new Set(peers.filter((p) => (volumes[p.id] ?? 1) <= 0).map((p) => p.userId)),
    [peers, volumes],
  );
  const togglePeerMuteByUserId = useCallback(
    (uid: string) => {
      const pid = peers.find((p) => p.userId === uid)?.id;
      if (pid) togglePeerMute(pid);
    },
    [peers, togglePeerMute],
  );

  // Hydrate per-peer volume from persisted (userId-keyed) values when peers
  // appear. Fill-missing-only so an in-session edit is never clobbered.
  useEffect(() => {
    const saved = volumeStore.get();
    setVolumes((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of peers) {
        if (p.id in next) continue;
        const v = p.userId ? saved[p.userId] : undefined;
        if (v !== undefined) {
          next[p.id] = v;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [peers, volumeStore]);

  return { volumes, handleVolumeChange, togglePeerMute, togglePeerMuteByUserId, mutedUserIds };
}

const VOICE_STORE: VolumeStore = { get: store.getPeerVolumes, set: store.setPeerVolume };
const SCREEN_STORE: VolumeStore = { get: store.getPeerScreenVolumes, set: store.setPeerScreenVolume };

export function usePeerVolumes(peers: readonly VolumePeer[], onMuteOtherCue?: () => void): PeerVolumes {
  return usePeerVolumeControl(peers, VOICE_STORE, onMuteOtherCue);
}

// Same control, backing a peer's screen-share audio volume instead of their
// voice — fully independent (own persisted store, own live state, own
// click-to-silence memory). No SFX cue (that cue is a voice-mute social
// signal) and no mutedUserIds/togglePeerMuteByUserId — there's no sidebar
// affordance for screen-audio mute today.
export function usePeerScreenVolumes(peers: readonly VolumePeer[]): PeerVolumes {
  return usePeerVolumeControl(peers, SCREEN_STORE);
}
