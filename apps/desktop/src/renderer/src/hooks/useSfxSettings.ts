import { useCallback, useRef } from 'react';
import { usePersistedState } from './usePersistedState';
import { store } from '../lib/settings';
import { playSfx } from '../lib/sfx';

export interface SfxSettings {
  sfxEnabled: boolean;
  applySfxEnabled: (on: boolean) => void;
  sfxVolume: number;
  applySfxVolume: (v: number) => void;
  sfxJoinLeaveEnabled: boolean;
  applySfxJoinLeaveEnabled: (on: boolean) => void;
  sfxMuteEnabled: boolean;
  applySfxMuteEnabled: (on: boolean) => void;
  sfxMuteOtherEnabled: boolean;
  applySfxMuteOtherEnabled: (on: boolean) => void;
  sfxTransmitEnabled: boolean;
  applySfxTransmitEnabled: (on: boolean) => void;
  sfxChatEnabled: boolean;
  applySfxChatEnabled: (on: boolean) => void;
  sfxDeafenEnabled: boolean;
  applySfxDeafenEnabled: (on: boolean) => void;
  playMuteOtherCue: () => void;
}

// The persisted SFX toggles + volume, plus the "mute other" cue used when
// silencing a peer from a tile or the compact sidebar.
export function useSfxSettings(): SfxSettings {
  const [sfxEnabled, applySfxEnabled] = usePersistedState(store.getSfxEnabled, store.setSfxEnabled);
  const [sfxVolume, applySfxVolume] = usePersistedState(store.getSfxVolume, store.setSfxVolume);
  const [sfxJoinLeaveEnabled, applySfxJoinLeaveEnabled] = usePersistedState(store.getSfxJoinLeaveEnabled, store.setSfxJoinLeaveEnabled);
  const [sfxMuteEnabled, applySfxMuteEnabled] = usePersistedState(store.getSfxMuteEnabled, store.setSfxMuteEnabled);
  const [sfxMuteOtherEnabled, applySfxMuteOtherEnabled] = usePersistedState(store.getSfxMuteOtherEnabled, store.setSfxMuteOtherEnabled);
  const [sfxTransmitEnabled, applySfxTransmitEnabled] = usePersistedState(store.getSfxTransmitEnabled, store.setSfxTransmitEnabled);
  const [sfxChatEnabled, applySfxChatEnabled] = usePersistedState(store.getSfxChatEnabled, store.setSfxChatEnabled);
  const [sfxDeafenEnabled, applySfxDeafenEnabled] = usePersistedState(store.getSfxDeafenEnabled, store.setSfxDeafenEnabled);

  // Live config read through a ref so the cue callback stays identity-stable
  // (deps []) — it's threaded into per-tile callbacks that must not churn.
  const muteOtherSfxRef = useRef({ enabled: false, on: true, volume: 0.25 });
  muteOtherSfxRef.current = { enabled: sfxEnabled, on: sfxMuteOtherEnabled, volume: sfxVolume };
  const playMuteOtherCue = useCallback(() => {
    const sfx = muteOtherSfxRef.current;
    if (sfx.enabled && sfx.on) playSfx('mute-other', sfx.volume);
  }, []);

  return {
    sfxEnabled,
    applySfxEnabled,
    sfxVolume,
    applySfxVolume,
    sfxJoinLeaveEnabled,
    applySfxJoinLeaveEnabled,
    sfxMuteEnabled,
    applySfxMuteEnabled,
    sfxMuteOtherEnabled,
    applySfxMuteOtherEnabled,
    sfxTransmitEnabled,
    applySfxTransmitEnabled,
    sfxChatEnabled,
    applySfxChatEnabled,
    sfxDeafenEnabled,
    applySfxDeafenEnabled,
    playMuteOtherCue,
  };
}
