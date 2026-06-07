import { useEffect } from 'react';

interface UseKeybindSyncOpts {
  pttEnabled: boolean;
  pushToTalkKey: string;
  pttMode: 'hold' | 'toggle';
  muteKey: string;
  muteMode: 'hold' | 'toggle';
  setMicEnabled: (on: boolean) => void;
  toggleMic: () => void;
  localStream: MediaStream | null;
}

export function useKeybindSync({
  pttEnabled,
  pushToTalkKey,
  pttMode,
  muteKey,
  muteMode,
  setMicEnabled,
  toggleMic,
  localStream,
}: UseKeybindSyncOpts): void {
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

  // In PTT mode the mic starts muted until the hotkey activates it.
  useEffect(() => {
    if (pttEnabled && localStream) setMicEnabled(false);
  }, [pttEnabled, localStream, setMicEnabled]);

  // Toggle mode: each key press flips mic on/off.
  useEffect(() => {
    if (pttMode !== 'toggle') return;
    return window.chickadee?.onPushToTalk?.(() => toggleMic());
  }, [pttMode, toggleMic]);

  // Hold mode: mic on while key held, off on release.
  useEffect(() => {
    if (pttMode !== 'hold') return;
    const unsubStart = window.chickadee?.onPttStart?.(() => setMicEnabled(true));
    const unsubStop = window.chickadee?.onPttStop?.(() => setMicEnabled(false));
    return () => { unsubStart?.(); unsubStop?.(); };
  }, [pttMode, setMicEnabled]);

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
