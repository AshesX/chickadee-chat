import { useEffect } from 'react';

interface UseKeybindSyncOpts {
  inputMode: 'open' | 'voice' | 'ptt';
  pushToTalkKey: string;
  pttMode: 'hold' | 'toggle';
  muteKey: string;
  muteMode: 'hold' | 'toggle';
  setMicEnabled: (on: boolean) => void;
  toggleMic: () => void;
  localStream: MediaStream | null;
}

export function useKeybindSync({
  inputMode,
  pushToTalkKey,
  pttMode,
  muteKey,
  muteMode,
  setMicEnabled,
  toggleMic,
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
    if (inputMode === 'ptt') setMicEnabled(false);
    else if (inputMode === 'open') setMicEnabled(true);
  }, [inputMode, localStream, setMicEnabled]);

  // PTT toggle mode: each key press flips mic on/off.
  useEffect(() => {
    if (!pttEnabled || pttMode !== 'toggle') return;
    return window.chickadee?.onPushToTalk?.(() => toggleMic());
  }, [pttEnabled, pttMode, toggleMic]);

  // PTT hold mode: mic on while key held, off on release.
  useEffect(() => {
    if (!pttEnabled || pttMode !== 'hold') return;
    const unsubStart = window.chickadee?.onPttStart?.(() => setMicEnabled(true));
    const unsubStop = window.chickadee?.onPttStop?.(() => setMicEnabled(false));
    return () => { unsubStart?.(); unsubStop?.(); };
  }, [pttEnabled, pttMode, setMicEnabled]);

  // Mute toggle mode: each key press toggles mic on/off.
  useEffect(() => {
    if (muteMode !== 'toggle') return;
    return window.chickadee?.onMuteToggle?.(() => toggleMic());
  }, [muteMode, toggleMic]);

  // Mute hold mode: mic off while key held, on on release.
  useEffect(() => {
    if (muteMode !== 'hold') return;
    const unsubStart = window.chickadee?.onMuteStart?.(() => setMicEnabled(false));
    const unsubStop = window.chickadee?.onMuteStop?.(() => setMicEnabled(true));
    return () => { unsubStart?.(); unsubStop?.(); };
  }, [muteMode, setMicEnabled]);
}
