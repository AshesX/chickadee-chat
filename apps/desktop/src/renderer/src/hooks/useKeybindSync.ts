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
  deafenKey: string;
  deafenMode: 'hold' | 'toggle';
  onDeafenStart: () => void;
  onDeafenStop: () => void;
  onDeafenToggle: () => void;
  cameraKey: string;
  onCameraToggle: () => void;
  screenShareKey: string;
  onScreenShareToggle: () => void;
  chatPanelKey: string;
  onChatPanelToggle: () => void;
  ttsToggleKey: string;
  onTtsToggle: () => void;
  ttsStopKey: string;
  onTtsStop: () => void;
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
  deafenKey,
  deafenMode,
  onDeafenStart,
  onDeafenStop,
  onDeafenToggle,
  cameraKey,
  onCameraToggle,
  screenShareKey,
  onScreenShareToggle,
  chatPanelKey,
  onChatPanelToggle,
  ttsToggleKey,
  onTtsToggle,
  ttsStopKey,
  onTtsStop,
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

  // Sync new keybinds to main
  useEffect(() => {
    void window.chickadee?.setDeafenKeybind?.({ enabled: deafenKey !== '', key: deafenKey, mode: deafenMode });
  }, [deafenKey, deafenMode]);

  useEffect(() => {
    void window.chickadee?.setCameraKeybind?.({ enabled: cameraKey !== '', key: cameraKey, mode: 'toggle' });
  }, [cameraKey]);

  useEffect(() => {
    void window.chickadee?.setScreenShareKeybind?.({ enabled: screenShareKey !== '', key: screenShareKey, mode: 'toggle' });
  }, [screenShareKey]);

  useEffect(() => {
    void window.chickadee?.setChatPanelKeybind?.({ enabled: chatPanelKey !== '', key: chatPanelKey, mode: 'toggle' });
  }, [chatPanelKey]);

  useEffect(() => {
    void window.chickadee?.setTtsToggleKeybind?.({ enabled: ttsToggleKey !== '', key: ttsToggleKey, mode: 'toggle' });
  }, [ttsToggleKey]);

  useEffect(() => {
    void window.chickadee?.setTtsStopKeybind?.({ enabled: ttsStopKey !== '', key: ttsStopKey, mode: 'toggle' });
  }, [ttsStopKey]);

  // Listeners for new keybinds
  useEffect(() => {
    if (deafenMode !== 'toggle') return;
    return window.chickadee?.onDeafenToggle?.(() => onDeafenToggle());
  }, [deafenMode, onDeafenToggle]);

  useEffect(() => {
    if (deafenMode !== 'hold') return;
    const unsubStart = window.chickadee?.onDeafenStart?.(() => onDeafenStart());
    const unsubStop = window.chickadee?.onDeafenStop?.(() => onDeafenStop());
    return () => { unsubStart?.(); unsubStop?.(); };
  }, [deafenMode, onDeafenStart, onDeafenStop]);

  useEffect(() => {
    return window.chickadee?.onCameraToggle?.(() => onCameraToggle());
  }, [onCameraToggle]);

  useEffect(() => {
    return window.chickadee?.onScreenShareToggle?.(() => onScreenShareToggle());
  }, [onScreenShareToggle]);

  useEffect(() => {
    return window.chickadee?.onChatPanelToggle?.(() => onChatPanelToggle());
  }, [onChatPanelToggle]);

  useEffect(() => {
    return window.chickadee?.onTtsToggle?.(() => onTtsToggle());
  }, [onTtsToggle]);

  useEffect(() => {
    return window.chickadee?.onTtsStop?.(() => onTtsStop());
  }, [onTtsStop]);
}
