import { useEffect } from 'react';

interface UseKeybindSyncOpts {
  inputMode: 'open' | 'voice' | 'ptt';
  pushToTalkKey: string;
  pttMode: 'hold' | 'toggle';
  muteKey: string;
  muteMode: 'hold' | 'toggle';
  onPttStart: () => void;
  onPttStop: () => void;
  onPttToggle: () => void;
  onMuteStart: () => void;
  onMuteStop: () => void;
  onMuteToggle: () => void;
  localStream: MediaStream | null;
}

export function useKeybindSync({
  inputMode,
  pushToTalkKey,
  pttMode,
  muteKey,
  muteMode,
  onPttStart,
  onPttStop,
  onPttToggle,
  onMuteStart,
  onMuteStop,
  onMuteToggle,
  localStream,
}: UseKeybindSyncOpts): void {
  const pttEnabled = inputMode === 'ptt';

  useEffect(() => {
    void window.chickadee?.setPushToTalk?.({
      enabled: pttEnabled && pushToTalkKey !== '',
      key: pushToTalkKey,
      mode: pttMode,
    });
  }, [pttEnabled, pushToTalkKey, pttMode]);

  useEffect(() => {
    void window.chickadee?.setMuteKeybind?.({ enabled: muteKey !== '', key: muteKey, mode: muteMode });
  }, [muteKey, muteMode]);

  // Baseline mic gating per input mode. PTT starts muted (the key opens it);
  // Open Mic is always live; Voice Activation is managed by useVoiceActivation.
  useEffect(() => {
    if (!localStream) return;
    if (inputMode === 'ptt') onPttStop();
    else if (inputMode === 'open') onPttStart();
  }, [inputMode, localStream, onPttStart, onPttStop]);

  // PTT toggle mode: each key press flips mic on/off.
  useEffect(() => {
    if (!pttEnabled || pttMode !== 'toggle') return;
    return window.chickadee?.onPushToTalk?.(() => onPttToggle());
  }, [pttEnabled, pttMode, onPttToggle]);

  // PTT hold mode: mic on while key held, off on release.
  useEffect(() => {
    if (!pttEnabled || pttMode !== 'hold') return;
    const unsubStart = window.chickadee?.onPttStart?.(() => onPttStart());
    const unsubStop = window.chickadee?.onPttStop?.(() => onPttStop());
    return () => { unsubStart?.(); unsubStop?.(); };
  }, [pttEnabled, pttMode, onPttStart, onPttStop]);

  // Mute toggle mode: each key press toggles mic on/off.
  useEffect(() => {
    if (muteMode !== 'toggle') return;
    return window.chickadee?.onMuteToggle?.(() => onMuteToggle());
  }, [muteMode, onMuteToggle]);

  // Mute hold mode: mic off while key held, on on release.
  useEffect(() => {
    if (muteMode !== 'hold') return;
    const unsubStart = window.chickadee?.onMuteStart?.(() => onMuteStart());
    const unsubStop = window.chickadee?.onMuteStop?.(() => onMuteStop());
    return () => { unsubStart?.(); unsubStop?.(); };
  }, [muteMode, onMuteStart, onMuteStop]);
}
