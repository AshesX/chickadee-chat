import { useState, useEffect, useRef } from 'react';
import { User, Mic, Volume2, Sliders, X, Video, Monitor, MessageSquare, Search } from 'lucide-react';
import { defaultSettings } from '@chickadee/shared';
import { useKeyCapture } from '../hooks/useKeyCapture';
import type { MediaDeviceOption } from '../hooks/useMediaDevices';
import { AvatarCropModal } from './AvatarCropModal';
import { CustomSelect } from './CustomSelect';
import { VOICE_CATEGORIES } from '../lib/voices';
import { previewVoice } from '../lib/tts';
import { USER_COLORS } from '../lib/userColors';

interface SettingsModalProps {
  displayName: string;
  onChangeName: (name: string) => void;
  noiseSuppression: boolean;
  onChangeNoiseSuppression: (on: boolean) => void;
  echoCancellation: boolean;
  onChangeEchoCancellation: (on: boolean) => void;
  autoGainControl: boolean;
  onChangeAutoGainControl: (on: boolean) => void;
  normalizeVoices: boolean;
  onChangeNormalizeVoices: (on: boolean) => void;
  inputDevices: MediaDeviceOption[];
  outputDevices: MediaDeviceOption[];
  inputDeviceId: string;
  onChangeInputDevice: (id: string) => void;
  outputDeviceId: string;
  onChangeOutputDevice: (id: string) => void;
  inputMode: 'open' | 'voice' | 'ptt';
  onChangeInputMode: (mode: 'open' | 'voice' | 'ptt') => void;
  vadThreshold: number;
  onChangeVadThreshold: (v: number) => void;
  vadReleaseMs: number;
  onChangeVadReleaseMs: (v: number) => void;
  openMicNoiseReductionEnabled: boolean;
  onChangeOpenMicNoiseReductionEnabled: (on: boolean) => void;
  openMicThreshold: number;
  onChangeOpenMicThreshold: (v: number) => void;
  openMicReductionDb: number;
  onChangeOpenMicReductionDb: (v: number) => void;
  theme: 'midnight' | 'classic' | 'oled';
  onChangeTheme: (t: 'midnight' | 'classic' | 'oled') => void;
  launchOnStartup: boolean;
  onChangeLaunchOnStartup: (on: boolean) => void;
  closeBehavior: 'quit' | 'tray';
  onChangeCloseBehavior: (b: 'quit' | 'tray') => void;
  alwaysOnTop: boolean;
  onChangeAlwaysOnTop: (on: boolean) => void;
  pushToTalkKey: string;
  onChangePushToTalkKey: (key: string) => void;
  pttMode: 'hold' | 'toggle';
  onChangePttMode: (mode: 'hold' | 'toggle') => void;
  muteKey: string;
  onChangeMuteKey: (key: string) => void;
  muteMode: 'hold' | 'toggle';
  onChangeMuteMode: (mode: 'hold' | 'toggle') => void;
  sfxEnabled: boolean;
  onChangeSfxEnabled: (on: boolean) => void;
  sfxVolume: number;
  onChangeSfxVolume: (vol: number) => void;
  sfxJoinLeaveEnabled: boolean;
  onChangeSfxJoinLeaveEnabled: (on: boolean) => void;
  sfxMuteEnabled: boolean;
  onChangeSfxMuteEnabled: (on: boolean) => void;
  sfxTransmitEnabled: boolean;
  onChangeSfxTransmitEnabled: (on: boolean) => void;
  sfxChatEnabled: boolean;
  onChangeSfxChatEnabled: (on: boolean) => void;
  sfxDeafenEnabled: boolean;
  onChangeSfxDeafenEnabled: (on: boolean) => void;
  badgeNotificationsEnabled: boolean;
  onChangeBadgeNotificationsEnabled: (on: boolean) => void;
  initialTab?: string;
  micVolume: number;
  onChangeMicVolume: (vol: number) => void;
  outputVolume: number;
  onChangeOutputVolume: (vol: number) => void;
  cameraResolution: string;
  onChangeCameraResolution: (res: string) => void;
  defaultVideoAction: 'camera' | 'screen';
  onChangeDefaultVideoAction: (action: 'camera' | 'screen') => void;
  cameraFramerate: string;
  onChangeCameraFramerate: (fps: string) => void;
  screenResolution: string;
  onChangeScreenResolution: (res: string) => void;
  screenFramerate: string;
  onChangeScreenFramerate: (fps: string) => void;
  uiScale: number;
  onChangeUiScale: (scale: number) => void;
  chatFontScale: number;
  onChangeChatFontScale: (scale: number) => void;
  chatPosition: 'left' | 'right';
  onChangeChatPosition: (pos: 'left' | 'right') => void;
  chatWidthScale: number;
  onChangeChatWidthScale: (scale: number) => void;
  chatTtsEnabled: boolean;
  onChangeChatTtsEnabled: (on: boolean) => void;
  chatTtsSpeakName: boolean;
  onChangeChatTtsSpeakName: (on: boolean) => void;
  voicePreference: string;
  onChangeVoicePreference: (id: string) => void;
  analyserNode: AnalyserNode | null;
  onClose: () => void;
  avatarDataUrl: string | null;
  selfColor: string;
  onChangeAvatar: (dataUrl: string | null) => void;
  /** Chosen accent color (`#rrggbb`), or '' for auto-assigned. */
  accentColor: string;
  onChangeAccent: (color: string) => void;
  hasCamera?: boolean;
}

function SettingsSlider({
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  markers = [],
  labels,
  snapThreshold = 0.03,
  commitOnRelease = false,
  snapValues,
}: {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (val: number) => void;
  markers?: number[];
  labels: { value: number; text: string }[];
  snapThreshold?: number;
  commitOnRelease?: boolean;
  /** When provided, the slider only lands on these exact values, rendered as
   *  uniformly spaced detents (index-based). Overrides min/max/step/markers. */
  snapValues?: number[];
}): React.JSX.Element {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    if (commitOnRelease) {
      setLocalValue(value);
    }
  }, [value, commitOnRelease]);

  const discrete = snapValues != null && snapValues.length > 0;

  // Index of the stop closest to a value (tolerates legacy/off-grid values).
  const nearestIndex = (v: number): number => {
    if (!discrete) return 0;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < snapValues.length; i++) {
      const d = Math.abs(snapValues[i] - v);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  // Horizontal position (0..100%) of a value: by index in discrete mode (even
  // detents), by linear interpolation otherwise.
  const posPercent = (v: number): number =>
    discrete ? (nearestIndex(v) / (snapValues.length - 1)) * 100 : ((v - min) / (max - min)) * 100;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = parseFloat(e.target.value);

    if (discrete) {
      const idx = Math.min(snapValues.length - 1, Math.max(0, Math.round(val)));
      val = snapValues[idx];
    } else {
      // Magnetic snap
      for (const m of markers) {
        if (Math.abs(m - val) <= snapThreshold) {
          val = m;
          break;
        }
      }
    }

    if (commitOnRelease) {
      setLocalValue(val);
    } else {
      onChange(val);
    }
  };

  const handleCommit = () => {
    if (commitOnRelease && localValue !== value) {
      onChange(localValue);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (commitOnRelease && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
      handleCommit();
    }
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="mic-slider-container">
        <input
          type="range"
          min={discrete ? 0 : min}
          max={discrete ? snapValues.length - 1 : max}
          step={discrete ? 1 : step}
          value={discrete ? nearestIndex(commitOnRelease ? localValue : value) : commitOnRelease ? localValue : value}
          onChange={handleChange}
          onPointerUp={commitOnRelease ? handleCommit : undefined}
          onKeyUp={commitOnRelease ? handleKeyUp : undefined}
          onBlur={commitOnRelease ? handleCommit : undefined}
          className="settings-slider"
        />
        {(discrete ? snapValues : markers).map((m) => {
          const percent = posPercent(m);
          // Thumb is ~16px diameter (8px radius)
          const leftCalc = `calc(${percent}% + ${8 - (percent / 100) * 16}px)`;
          return (
            <div
              key={m}
              className="mic-slider-tick"
              style={{ left: leftCalc }}
            />
          );
        })}
      </div>
      <div className="mic-slider-labels" style={{ position: 'relative', height: '14px', marginTop: '-6px' }}>
        {labels.map((l) => {
          const percent = posPercent(l.value);
          const leftCalc = `calc(${percent}% + ${8 - (percent / 100) * 16}px)`;
          return (
            <span
              key={l.value}
              className="mic-slider-labels__center"
              style={{ left: leftCalc }}
            >
              {l.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({
  on,
  onClick,
}: {
  on: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button className={`switch${on ? ' switch--on' : ''}`} onClick={onClick} role="switch" aria-checked={on}>
      <span className="switch__knob" />
    </button>
  );
}

/**
 * A single rAF loop reads `analyserNode.getByteTimeDomainData` once per frame and
 * writes the level to every registered meter bar. This avoids having multiple
 * `MicLevelMeter`s each poll the same AnalyserNode — two readers on one node
 * starve each other.
 */
function useSharedMicMeter(
  analyserNode: AnalyserNode | null,
  bars: React.MutableRefObject<Set<HTMLDivElement>>,
): void {
  useEffect(() => {
    if (!analyserNode) {
      bars.current.forEach((b) => {
        b.style.width = '0%';
      });
      return;
    }

    const dataArray = new Uint8Array(analyserNode.fftSize);
    let animationFrameId: number;

    const updateMeter = (): void => {
      analyserNode.getByteTimeDomainData(dataArray);

      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const centered = (dataArray[i] - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);

      // Normalize RMS relative to the 0.1 maximum sensitivity threshold.
      const percentage = Math.min(100, Math.round((rms / 0.1) * 100));
      // Clip warning if boosted audio is excessively high (clipping begins above ~0.95)
      const className = `mic-meter__fill${rms > 0.95 ? ' mic-meter__fill--clipping' : ''}`;

      // Read the live Set each frame so a meter that mounts later (the
      // conditional voice section) is picked up immediately.
      bars.current.forEach((b) => {
        b.style.width = `${percentage}%`;
        b.className = className;
      });

      animationFrameId = requestAnimationFrame(updateMeter);
    };

    updateMeter();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyserNode, bars]);
}

/** Renders one meter bar and registers it with the shared reader above. */
function MicLevelMeter({
  bars,
  online,
  threshold,
}: {
  bars: React.MutableRefObject<Set<HTMLDivElement>>;
  online: boolean;
  threshold?: number;
}): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const set = bars.current;
    set.add(el);
    return () => {
      set.delete(el);
    };
  }, [bars]);

  const markerPosition = threshold !== undefined ? Math.min(100, (threshold / 0.1) * 100) : null;

  return (
    <div className="mic-meter">
      <div className="mic-meter__track">
        <div ref={barRef} className="mic-meter__fill" />
        {markerPosition !== null && (
          <div
            className="mic-meter__gate-marker"
            style={{ left: `${markerPosition}%` }}
            title={`Gate Threshold: ${Math.round(markerPosition)}%`}
          />
        )}
      </div>
      <span className="mic-meter__label">
        {online ? 'Live input' : 'Mic offline'}
      </span>
    </div>
  );
}

export function SettingsModal({
  displayName,
  onChangeName,
  noiseSuppression,
  onChangeNoiseSuppression,
  echoCancellation,
  onChangeEchoCancellation,
  autoGainControl,
  onChangeAutoGainControl,
  normalizeVoices,
  onChangeNormalizeVoices,
  inputDevices,
  outputDevices,
  inputDeviceId,
  onChangeInputDevice,
  outputDeviceId,
  onChangeOutputDevice,
  inputMode,
  onChangeInputMode,
  vadThreshold,
  onChangeVadThreshold,
  vadReleaseMs,
  onChangeVadReleaseMs,
  openMicNoiseReductionEnabled,
  onChangeOpenMicNoiseReductionEnabled,
  openMicThreshold,
  onChangeOpenMicThreshold,
  openMicReductionDb,
  onChangeOpenMicReductionDb,
  theme,
  onChangeTheme,
  launchOnStartup,
  onChangeLaunchOnStartup,
  closeBehavior,
  onChangeCloseBehavior,
  alwaysOnTop,
  onChangeAlwaysOnTop,
  pushToTalkKey,
  onChangePushToTalkKey,
  pttMode,
  onChangePttMode,
  muteKey,
  onChangeMuteKey,
  muteMode,
  onChangeMuteMode,
  sfxEnabled,
  onChangeSfxEnabled,
  sfxVolume,
  onChangeSfxVolume,
  sfxJoinLeaveEnabled,
  onChangeSfxJoinLeaveEnabled,
  sfxMuteEnabled,
  onChangeSfxMuteEnabled,
  sfxTransmitEnabled,
  onChangeSfxTransmitEnabled,
  sfxChatEnabled,
  onChangeSfxChatEnabled,
  sfxDeafenEnabled,
  onChangeSfxDeafenEnabled,
  badgeNotificationsEnabled,
  onChangeBadgeNotificationsEnabled,
  initialTab,
  micVolume,
  onChangeMicVolume,
  outputVolume,
  onChangeOutputVolume,
  cameraResolution,
  onChangeCameraResolution,
  defaultVideoAction,
  onChangeDefaultVideoAction,
  cameraFramerate,
  onChangeCameraFramerate,
  screenResolution,
  onChangeScreenResolution,
  screenFramerate,
  onChangeScreenFramerate,
  uiScale,
  onChangeUiScale,
  chatFontScale,
  onChangeChatFontScale,
  chatPosition,
  onChangeChatPosition,
  chatWidthScale,
  onChangeChatWidthScale,
  chatTtsEnabled,
  onChangeChatTtsEnabled,
  chatTtsSpeakName,
  onChangeChatTtsSpeakName,
  voicePreference,
  onChangeVoicePreference,
  analyserNode,
  onClose,
  avatarDataUrl,
  selfColor,
  onChangeAvatar,
  accentColor,
  onChangeAccent,
  hasCamera = true,
}: SettingsModalProps): React.JSX.Element {
  const [name, setName] = useState(displayName);
  const [cropOpen, setCropOpen] = useState(false);
  const { capturing, startCapture, onRebindKey } = useKeyCapture();
  const [activeTab, setActiveTab] = useState<'profile' | 'audio' | 'video' | 'sfx' | 'chat' | 'ui' | 'app'>(
    (initialTab as 'profile' | 'audio' | 'video' | 'sfx' | 'chat' | 'ui' | 'app') ?? 'profile'
  );
  const [versionCopied, setVersionCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const version = window.chickadee?.appVersion || '0.2.0';

  type TabId = 'profile' | 'audio' | 'video' | 'sfx' | 'chat' | 'ui' | 'app';
  interface SearchEntry { label: string; description?: string; tab: TabId; sectionId?: string; keywords: string[]; }

  const SETTINGS_SEARCH_INDEX: SearchEntry[] = [
    { label: 'Avatar', description: 'Set or change your profile picture', tab: 'profile', sectionId: 'section-avatar', keywords: ['photo', 'picture', 'image', 'crop', 'pfp'] },
    { label: 'Display Name', description: 'Change your name shown to others', tab: 'profile', sectionId: 'section-display-name', keywords: ['name', 'username', 'handle'] },
    { label: 'Input Device', description: 'Choose your microphone', tab: 'audio', sectionId: 'section-devices', keywords: ['microphone', 'mic', 'input', 'device'] },
    { label: 'Output Device', description: 'Choose your speakers or headphones', tab: 'audio', sectionId: 'section-devices', keywords: ['speaker', 'headphones', 'output', 'device', 'playback'] },
    { label: 'Mic Volume', description: 'Adjust microphone gain and boost', tab: 'audio', sectionId: 'section-devices', keywords: ['gain', 'volume', 'boost', 'mic level'] },
    { label: 'Input Mode', description: 'Open Mic, Voice Activation, or Push-to-Talk', tab: 'audio', sectionId: 'section-input-mode', keywords: ['ptt', 'push to talk', 'voice activation', 'vad', 'open mic', 'transmit'] },
    { label: 'Push-to-Talk Key', description: 'Set the keybind for push-to-talk', tab: 'audio', sectionId: 'section-input-mode', keywords: ['ptt', 'push to talk', 'keybind', 'hotkey', 'key', 'bind'] },
    { label: 'Mute Key', description: 'Set the keybind to mute/unmute mic', tab: 'audio', sectionId: 'section-mic-mute', keywords: ['mute', 'unmute', 'keybind', 'hotkey', 'key', 'bind'] },
    { label: 'Noise Suppression', description: 'Remove background noise from your mic', tab: 'audio', sectionId: 'section-processing', keywords: ['noise', 'background', 'suppress', 'filter', 'processing'] },
    { label: 'Echo Cancellation', description: 'Prevent speaker audio feeding back into mic', tab: 'audio', sectionId: 'section-processing', keywords: ['echo', 'feedback', 'cancellation', 'processing'] },
    { label: 'Auto Gain Control', description: 'Automatically adjust mic input level', tab: 'audio', sectionId: 'section-processing', keywords: ['agc', 'auto gain', 'automatic', 'level', 'processing'] },
    { label: 'Camera Resolution', description: 'Set streaming resolution for your camera', tab: 'video', sectionId: 'section-camera', keywords: ['camera', 'resolution', '720p', '1080p', '4k', 'quality', 'fps', 'framerate'] },
    { label: 'Screen Share Quality', description: 'Cap resolution and framerate for screen sharing', tab: 'video', sectionId: 'section-screen-share', keywords: ['screen share', 'screen capture', 'resolution', 'framerate', 'fps', 'quality'] },
    { label: 'Default Video Button', description: 'Whether the video button starts camera or screen share', tab: 'video', sectionId: 'section-video-default', keywords: ['default', 'video', 'camera', 'screen share', 'button'] },
    { label: 'Sound Effects', description: 'Enable or disable audio cues for join, leave, mute, etc.', tab: 'sfx', keywords: ['sfx', 'sounds', 'audio cues', 'join', 'leave', 'beep', 'chime', 'notification'] },
    { label: 'SFX Volume', description: 'Adjust the volume of sound effects', tab: 'sfx', keywords: ['sfx volume', 'sound effects volume', 'sounds'] },
    { label: 'Text-to-Speech', description: 'Read incoming chat messages aloud when unfocused', tab: 'chat', sectionId: 'section-chat-settings', keywords: ['tts', 'text to speech', 'read aloud', 'voice', 'speak', 'speech'] },
    { label: 'Chat Voice', description: 'Voice others hear when reading your messages', tab: 'chat', sectionId: 'section-chat-settings', keywords: ['tts', 'voice', 'text to speech', 'preference', 'uk', 'female', 'male'] },
    { label: 'Chat Font Size', description: 'Scale the size of chat text', tab: 'chat', sectionId: 'section-chat-settings', keywords: ['font', 'size', 'scale', 'text', 'chat', 'zoom'] },
    { label: 'Chat Width', description: 'Adjust how wide the chat panel is', tab: 'chat', sectionId: 'section-chat-settings', keywords: ['width', 'panel', 'chat', 'size', 'scale'] },
    { label: 'Chat Position', description: 'Place the chat panel on left or right', tab: 'chat', sectionId: 'section-chat-settings', keywords: ['chat', 'position', 'left', 'right', 'layout', 'side'] },
    { label: 'Theme', description: 'Midnight, Classic Dark, or OLED Black', tab: 'ui', keywords: ['theme', 'color', 'dark', 'midnight', 'oled', 'appearance', 'colours'] },
    { label: 'UI Scale', description: 'Zoom the entire app interface', tab: 'ui', keywords: ['scale', 'zoom', 'size', 'ui', 'interface', 'accessibility', 'dpi'] },
    { label: 'Launch on Startup', description: 'Open automatically when Windows starts', tab: 'app', keywords: ['startup', 'autostart', 'boot', 'launch', 'windows', 'login'] },
    { label: 'Minimize to Tray', description: 'Keep running in background when window is closed', tab: 'app', keywords: ['tray', 'close', 'minimize', 'background', 'quit', 'system tray'] },
    { label: 'Always on Top', description: 'Pin the window above all other apps', tab: 'app', keywords: ['always on top', 'pin', 'window', 'focus', 'float'] },
    { label: 'Taskbar Badge', description: 'Show unread count on taskbar when unfocused', tab: 'app', keywords: ['badge', 'taskbar', 'unread', 'notification', 'count'] },
  ];

  const SUBSECTIONS: Partial<Record<string, { label: string; id: string }[]>> = {
    profile: [
      { label: 'Avatar', id: 'section-avatar' },
      { label: 'Display Name', id: 'section-display-name' },
    ],
    audio: [
      { label: 'Devices', id: 'section-devices' },
      { label: 'Input Mode', id: 'section-input-mode' },
      { label: 'Mic Mute', id: 'section-mic-mute' },
      { label: 'Processing', id: 'section-processing' },
    ],
    video: [
      { label: 'Default Button Action', id: 'section-video-default' },
      { label: 'Camera', id: 'section-camera' },
      { label: 'Screen Share', id: 'section-screen-share' },
    ],
    chat: [
      { label: 'Chat Settings', id: 'section-chat-settings' },
    ],
  };

  function scrollToSection(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function getSearchResults(query: string): SearchEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SETTINGS_SEARCH_INDEX.filter(({ label, description, keywords }) =>
      label.toLowerCase().includes(q) ||
      (description ?? '').toLowerCase().includes(q) ||
      keywords.some((k) => k.toLowerCase().includes(q))
    ).slice(0, 6);
  }

  function handleSearchResultClick(entry: SearchEntry): void {
    setActiveTab(entry.tab);
    setSearchQuery('');
    setHighlightedIndex(-1);
    if (entry.sectionId) {
      setTimeout(() => scrollToSection(entry.sectionId!), 0);
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    const results = getSearchResults(searchQuery);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && results[highlightedIndex]) {
        handleSearchResultClick(results[highlightedIndex]);
      }
    } else if (e.key === 'Escape' && searchQuery) {
      e.stopPropagation();
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  }

  function copyVersion(): void {
    if (window.chickadee?.writeClipboard) {
      void window.chickadee.writeClipboard(version);
    } else {
      void navigator.clipboard.writeText(version);
    }
    setVersionCopied(true);
    setTimeout(() => setVersionCopied(false), 1500);
  }

  // One shared analyser reader feeds every mic-level bar (see useSharedMicMeter).
  const micBars = useRef<Set<HTMLDivElement>>(new Set());
  useSharedMicMeter(activeTab === 'audio' ? analyserNode : null, micBars);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function commitName(): void {
    const trimmed = name.trim();
    if (trimmed) onChangeName(trimmed);
  }

  function resetAppSettings(): void {
    const defaults = defaultSettings();
    onChangeNoiseSuppression(defaults.noiseSuppression);
    onChangeEchoCancellation(defaults.echoCancellation);
    onChangeAutoGainControl(defaults.autoGainControl);
    onChangeNormalizeVoices(defaults.normalizeVoices);
    onChangeInputDevice(defaults.inputDeviceId);
    onChangeOutputDevice(defaults.outputDeviceId);
    onChangeInputMode(defaults.inputMode);
    onChangeVadThreshold(defaults.vadThreshold);
    onChangeVadReleaseMs(defaults.vadReleaseMs);
    onChangeOpenMicNoiseReductionEnabled(defaults.openMicNoiseReductionEnabled);
    onChangeOpenMicThreshold(defaults.openMicThreshold);
    onChangeOpenMicReductionDb(defaults.openMicReductionDb);
    onChangeTheme(defaults.theme);
    onChangeLaunchOnStartup(defaults.launchOnStartup);
    onChangeCloseBehavior(defaults.closeBehavior);
    onChangeAlwaysOnTop(defaults.alwaysOnTop);
    onChangePushToTalkKey(defaults.pushToTalkKey);
    onChangePttMode(defaults.pttMode);
    onChangeMuteKey(defaults.muteKey);
    onChangeMuteMode(defaults.muteMode);
    onChangeSfxEnabled(defaults.sfxEnabled);
    onChangeSfxVolume(defaults.sfxVolume);
    onChangeSfxJoinLeaveEnabled(defaults.sfxJoinLeaveEnabled);
    onChangeSfxMuteEnabled(defaults.sfxMuteEnabled);
    onChangeSfxTransmitEnabled(defaults.sfxTransmitEnabled);
    onChangeSfxChatEnabled(defaults.sfxChatEnabled);
    onChangeSfxDeafenEnabled(defaults.sfxDeafenEnabled);
    onChangeBadgeNotificationsEnabled(defaults.badgeNotificationsEnabled);
    onChangeMicVolume(defaults.micVolume);
    onChangeCameraResolution(defaults.cameraResolution);
    onChangeDefaultVideoAction(defaults.defaultVideoAction ?? 'camera');
    onChangeCameraFramerate(defaults.cameraFramerate);
    onChangeScreenResolution(defaults.screenResolution);
    onChangeScreenFramerate(defaults.screenFramerate);
    onChangeUiScale(defaults.uiScale);
    onChangeChatFontScale(defaults.chatFontScale);
    onChangeChatPosition(defaults.chatPosition);
    onChangeChatWidthScale(defaults.chatWidthScale);
    onChangeChatTtsEnabled(defaults.chatTtsEnabled);
    onChangeChatTtsSpeakName(defaults.chatTtsSpeakName);
    onChangeVoicePreference(defaults.voicePreference);
  }

  const searchResults = getSearchResults(searchQuery);
  const showResults = searchFocused && searchQuery.trim().length > 0;
  const TAB_LABELS: Record<TabId, string> = {
    profile: 'My Profile', audio: 'Voice & Audio', video: 'Video & Screen Share',
    sfx: 'Sound Effects', chat: 'Chat Settings', ui: 'User Interface',
    app: 'App Settings',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>

        {/* Left Sidebar Menu */}
        <div className="settings-sidebar">
          <div className="settings-sidebar__search-wrap">
            <Search size={12} className="settings-sidebar__search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="settings-sidebar__search-input"
              placeholder="Search settings…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setHighlightedIndex(-1); }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 120)}
              onKeyDown={handleSearchKeyDown}
              aria-label="Search settings"
            />
            {searchQuery && (
              <button
                className="settings-sidebar__search-clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setSearchQuery(''); setHighlightedIndex(-1); searchInputRef.current?.focus(); }}
                aria-label="Clear search"
              >
                <X size={10} />
              </button>
            )}
            {showResults && (
              <div className="settings-sidebar__search-results">
                {searchResults.length === 0 ? (
                  <div className="settings-sidebar__search-empty">No results</div>
                ) : (
                  searchResults.map((entry, i) => (
                    <button
                      key={`${entry.tab}-${entry.label}`}
                      className={`settings-sidebar__search-result${i === highlightedIndex ? ' settings-sidebar__search-result--highlighted' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSearchResultClick(entry)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                    >
                      <span className="settings-sidebar__search-result-label">{entry.label}</span>
                      <span className="settings-sidebar__search-result-breadcrumb">
                        {TAB_LABELS[entry.tab]}
                        {entry.sectionId
                          ? ` › ${SUBSECTIONS[entry.tab]?.find((s) => s.id === entry.sectionId)?.label ?? ''}`
                          : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="settings-sidebar__title">User Settings</div>
          <button
            className={`settings-sidebar__item${activeTab === 'profile' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <User size={15} />
            <span>My Profile</span>
          </button>
          {activeTab === 'profile' && (
            <div className="settings-sidebar__sub-items">
              {SUBSECTIONS.profile!.map((s) => (
                <button key={s.id} className="settings-sidebar__sub-item" onClick={() => scrollToSection(s.id)}>{s.label}</button>
              ))}
            </div>
          )}

          <div className="settings-sidebar__title" style={{ marginTop: '14px' }}>App Settings</div>
          <button
            className={`settings-sidebar__item${activeTab === 'audio' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('audio')}
          >
            <Mic size={15} />
            <span>Voice & Audio</span>
          </button>
          {activeTab === 'audio' && (
            <div className="settings-sidebar__sub-items">
              {SUBSECTIONS.audio!.map((s) => (
                <button key={s.id} className="settings-sidebar__sub-item" onClick={() => scrollToSection(s.id)}>{s.label}</button>
              ))}
            </div>
          )}
          <button
            className={`settings-sidebar__item${activeTab === 'video' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('video')}
          >
            <Video size={15} />
            <span>Video & Screen Share</span>
          </button>
          {activeTab === 'video' && (
            <div className="settings-sidebar__sub-items">
              {SUBSECTIONS.video!.map((s) => (
                <button key={s.id} className="settings-sidebar__sub-item" onClick={() => scrollToSection(s.id)}>{s.label}</button>
              ))}
            </div>
          )}
          <button
            className={`settings-sidebar__item${activeTab === 'sfx' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('sfx')}
          >
            <Volume2 size={15} />
            <span>Sound Effects</span>
          </button>
          <button
            className={`settings-sidebar__item${activeTab === 'chat' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare size={15} />
            <span>Chat Settings</span>
          </button>
          {activeTab === 'chat' && (
            <div className="settings-sidebar__sub-items">
              {SUBSECTIONS.chat!.map((s) => (
                <button key={s.id} className="settings-sidebar__sub-item" onClick={() => scrollToSection(s.id)}>{s.label}</button>
              ))}
            </div>
          )}
          <button
            className={`settings-sidebar__item${activeTab === 'ui' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('ui')}
          >
            <Monitor size={15} />
            <span>User Interface</span>
          </button>
          <button
            className={`settings-sidebar__item${activeTab === 'app' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('app')}
          >
            <Sliders size={15} />
            <span>App Settings</span>
          </button>

          <div className="settings-sidebar__footer">
            <button
              className="settings-sidebar__version-btn"
              onClick={copyVersion}
              title="Copy Version"
            >
              {versionCopied ? 'Copied!' : `${version} Profiling`}
            </button>
          </div>
        </div>

        {/* Right Content Panel */}
        <div className="settings-content">
          <div className="settings-content__head">
            <h2 className="settings-content__title">
              {activeTab === 'profile' && 'My Profile'}
              {activeTab === 'audio' && 'Voice & Audio'}
              {activeTab === 'video' && 'Video & Screen Share'}
              {activeTab === 'sfx' && 'Sound Effects'}
              {activeTab === 'chat' && 'Chat Settings'}
              {activeTab === 'ui' && 'User Interface'}
              {activeTab === 'app' && 'App Settings'}
            </h2>
            <button className="settings-content__close" onClick={onClose} aria-label="Close settings">
              <X size={18} />
            </button>
          </div>

          <div className="settings-content__body">
            {activeTab === 'profile' && (
              <>
                <div id="section-avatar" className="settings-subdivision">Avatar</div>
                <div className="avatar-settings-row">
                  <div
                    className="avatar-settings-preview"
                    style={avatarDataUrl ? undefined : { background: `linear-gradient(145deg, ${selfColor}ee, ${selfColor}66)` }}
                  >
                    {avatarDataUrl ? (
                      <img src={avatarDataUrl} alt="Your avatar" className="avatar-settings-preview__img" />
                    ) : (
                      <span className="avatar-settings-preview__initial">
                        {name.trim().charAt(0).toUpperCase() || '?'}
                      </span>
                    )}
                  </div>
                  <div className="avatar-settings-actions">
                    <button
                      className="seg-btn"
                      onClick={() => setCropOpen(true)}
                    >
                      {avatarDataUrl ? 'Change Avatar' : 'Set Avatar'}
                    </button>
                    {avatarDataUrl && (
                      <button
                        className="seg-btn avatar-settings-remove"
                        onClick={() => onChangeAvatar(null)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div id="section-display-name" className="settings-subdivision" style={{ marginTop: '16px' }}>Display Name</div>
                <label className="field">
                  <span>Display name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => e.key === 'Enter' && commitName()}
                    maxLength={32}
                    autoFocus
                  />
                </label>

                <div id="section-accent" className="settings-subdivision" style={{ marginTop: '16px' }}>Accent Color</div>
                <span className="settings-row__hint">Colors your avatar ring and the glow shown when you speak. Synced to everyone; leave on auto for an assigned color.</span>
                <div className="accent-swatches">
                  {USER_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`accent-swatch${accentColor.toLowerCase() === c.toLowerCase() ? ' accent-swatch--active' : ''}`}
                      style={{ background: c }}
                      onClick={() => onChangeAccent(c)}
                      aria-label={`Use accent color ${c}`}
                    />
                  ))}
                  <label
                    className={`accent-swatch accent-swatch--custom${accentColor && !USER_COLORS.some((c) => c.toLowerCase() === accentColor.toLowerCase()) ? ' accent-swatch--active' : ''}`}
                    style={accentColor ? { background: accentColor } : undefined}
                    aria-label="Pick a custom accent color"
                  >
                    +
                    <input
                      type="color"
                      value={accentColor || selfColor}
                      onChange={(e) => onChangeAccent(e.target.value)}
                    />
                  </label>
                  {accentColor && (
                    <button type="button" className="seg-btn accent-reset" onClick={() => onChangeAccent('')}>
                      Reset to auto
                    </button>
                  )}
                </div>

                {cropOpen && (
                  <AvatarCropModal
                    onSave={(dataUrl) => {
                      onChangeAvatar(dataUrl);
                      setCropOpen(false);
                    }}
                    onCancel={() => setCropOpen(false)}
                  />
                )}
              </>
            )}

            {activeTab === 'audio' && (
              <>
                <div id="section-devices" className="settings-subdivision">Devices</div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Input device (microphone)</span>
                    <span className="settings-row__hint">Switches your mic live without dropping the call.</span>
                  </div>
                  <CustomSelect
                    value={inputDeviceId}
                    onChange={onChangeInputDevice}
                    options={[
                      { value: '', label: 'System Default' },
                      ...inputDevices.map((d) => ({ value: d.deviceId, label: d.label })),
                    ]}
                    className="settings-device-select"
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Mic volume</span>
                    <span className="settings-row__hint">Adjust mic volume. Levels above 100% act as a gain boost (which also helps voice sensitivity triggers).</span>
                  </div>
                  <div className="mic-control-wrap">
                    <SettingsSlider
                      min={0}
                      max={4}
                      step={0.05}
                      value={micVolume}
                      onChange={onChangeMicVolume}
                      markers={[0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]}
                      labels={[
                        { value: 0, text: '0%' },
                        { value: 1.0, text: '100% (Normal)' },
                        { value: 2.0, text: '200%' },
                        { value: 3.0, text: '300%' },
                        { value: 4.0, text: '400%' }
                      ]}
                      snapThreshold={0.08}
                    />
                    <MicLevelMeter bars={micBars} online={!!analyserNode} />
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Output device (speakers)</span>
                    <span className="settings-row__hint">Where other people's audio plays.</span>
                  </div>
                  <CustomSelect
                    value={outputDeviceId}
                    onChange={onChangeOutputDevice}
                    options={[
                      { value: '', label: 'System Default' },
                      ...outputDevices.map((d) => ({ value: d.deviceId, label: d.label })),
                    ]}
                    className="settings-device-select"
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Output volume</span>
                    <span className="settings-row__hint">Master volume for all incoming peer audio.</span>
                  </div>
                  <SettingsSlider
                    min={0}
                    max={1}
                    step={0.05}
                    value={outputVolume}
                    onChange={onChangeOutputVolume}
                    markers={[0, 0.25, 0.5, 0.75, 1.0]}
                    labels={[
                      { value: 0, text: '0%' },
                      { value: 1.0, text: '100%' },
                    ]}
                    snapThreshold={0.04}
                  />
                </div>

                <hr className="settings-divider" />
                <div id="section-input-mode" className="settings-subdivision">Input Mode</div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>How your mic transmits</span>
                    <span className="settings-row__hint">Open Mic: always live. Voice Activation: opens when you speak. Push-to-Talk: only while the key is held/toggled.</span>
                  </div>
                  <div className="seg-group">
                    <button
                      className={`seg-btn${inputMode === 'open' ? ' seg-btn--active' : ''}`}
                      onClick={() => onChangeInputMode('open')}
                    >Open Mic</button>
                    <button
                      className={`seg-btn${inputMode === 'voice' ? ' seg-btn--active' : ''}`}
                      onClick={() => onChangeInputMode('voice')}
                    >Voice</button>
                    <button
                      className={`seg-btn${inputMode === 'ptt' ? ' seg-btn--active' : ''}`}
                      onClick={() => onChangeInputMode('ptt')}
                    >Push-to-Talk</button>
                  </div>
                </div>

                {inputMode === 'voice' && (
                  <>
                    <div className="settings-row">
                      <div className="settings-row__label">
                        <span>Voice sensitivity</span>
                        <span className="settings-row__hint">Speak normally and adjust until the meter consistently crosses the gate. Higher = needs louder sound to transmit.</span>
                      </div>
                      <div className="mic-control-wrap">
                        <SettingsSlider
                          min={0.01}
                          max={0.1}
                          step={0.005}
                          value={vadThreshold}
                          onChange={onChangeVadThreshold}
                          markers={[0.01, 0.05, 0.1]}
                          labels={[
                            { value: 0.01, text: 'Low' },
                            { value: 0.05, text: 'Medium' },
                            { value: 0.1, text: 'High' },
                          ]}
                          snapThreshold={0.002}
                        />
                        <MicLevelMeter bars={micBars} online={!!analyserNode} threshold={vadThreshold} />
                      </div>
                    </div>

                    <div className="settings-row">
                      <div className="settings-row__label">
                        <span>Voice hold time</span>
                        <span className="settings-row__hint">How long the mic stays open after you stop talking, so word endings and short pauses aren't clipped. Currently {vadReleaseMs} ms.</span>
                      </div>
                      <SettingsSlider
                        value={vadReleaseMs}
                        onChange={onChangeVadReleaseMs}
                        snapValues={[100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000]}
                        labels={[
                          { value: 100, text: 'Short' },
                          { value: 1000, text: 'Medium' },
                          { value: 3000, text: 'Long' },
                        ]}
                      />
                    </div>
                  </>
                )}

                {inputMode === 'open' && (
                  <>
                    <div className="settings-row">
                      <div className="settings-row__label">
                        <span>Reduce background noise</span>
                        <span className="settings-row__hint">Softly lowers the volume of background noise while you're not speaking, instead of cutting it off. Turn off for a raw, unprocessed mic.</span>
                      </div>
                      <Toggle on={openMicNoiseReductionEnabled} onClick={() => onChangeOpenMicNoiseReductionEnabled(!openMicNoiseReductionEnabled)} />
                    </div>

                    {openMicNoiseReductionEnabled && (
                      <>
                        <div className="settings-row">
                          <div className="settings-row__label">
                            <span>Speech sensitivity</span>
                            <span className="settings-row__hint">Speak normally and adjust until the meter consistently crosses the gate. Higher = needs louder sound to count as speech.</span>
                          </div>
                          <div className="mic-control-wrap">
                            <SettingsSlider
                              min={0.01}
                              max={0.1}
                              step={0.005}
                              value={openMicThreshold}
                              onChange={onChangeOpenMicThreshold}
                              markers={[0.01, 0.05, 0.1]}
                              labels={[
                                { value: 0.01, text: 'Low' },
                                { value: 0.05, text: 'Medium' },
                                { value: 0.1, text: 'High' },
                              ]}
                              snapThreshold={0.002}
                            />
                            <MicLevelMeter bars={micBars} online={!!analyserNode} threshold={openMicThreshold} />
                          </div>
                        </div>

                        <div className="settings-row">
                          <div className="settings-row__label">
                            <span>Reduction amount</span>
                            <span className="settings-row__hint">How much to attenuate background noise. {openMicReductionDb} dB{openMicReductionDb <= -40 ? ' (near silent)' : ''}.</span>
                          </div>
                          <SettingsSlider
                            min={-40}
                            max={-10}
                            step={5}
                            value={openMicReductionDb}
                            onChange={onChangeOpenMicReductionDb}
                            markers={[-40, -30, -20, -10]}
                            labels={[
                              { value: -10, text: 'Gentle' },
                              { value: -40, text: 'Strong' },
                            ]}
                            snapThreshold={4}
                          />
                        </div>
                      </>
                    )}
                  </>
                )}

                {inputMode === 'ptt' && (
                  <>
                    <div className="settings-row">
                      <div className="settings-row__label">
                        <span>PTT mode</span>
                        <span className="settings-row__hint">Hold: mic live while key held. Toggle: press to unmute, press again to mute.</span>
                      </div>
                      <div className="seg-group">
                        <button
                          className={`seg-btn${pttMode === 'hold' ? ' seg-btn--active' : ''}`}
                          onClick={() => onChangePttMode('hold')}
                        >Hold</button>
                        <button
                          className={`seg-btn${pttMode === 'toggle' ? ' seg-btn--active' : ''}`}
                          onClick={() => onChangePttMode('toggle')}
                        >Toggle</button>
                      </div>
                    </div>

                    <div className="settings-row">
                      <div className="settings-row__label">
                        <span>Push-to-talk key</span>
                        <span className="settings-row__hint">Captured system-wide — pick a key you don't use in-game.</span>
                      </div>
                      <div className="keybind-row">
                        <button
                          className={`rebind${capturing === 'ptt' ? ' rebind--active' : ''}`}
                          onClick={() => startCapture('ptt')}
                          onKeyDown={capturing === 'ptt' ? (e) => onRebindKey(e, onChangePushToTalkKey, onChangeMuteKey) : undefined}
                        >
                          {capturing === 'ptt' ? 'Press a key…' : (pushToTalkKey || 'Unbound')}
                        </button>
                        {pushToTalkKey && (
                          <button
                            className="unbind-btn"
                            onClick={() => onChangePushToTalkKey('')}
                            title="Clear keybind"
                            aria-label="Clear Push-to-talk keybind"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <hr className="settings-divider" />
                <div id="section-mic-mute" className="settings-subdivision">Mic Mute</div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Mute mode</span>
                    <span className="settings-row__hint">Hold: mic muted while key held. Toggle: press to toggle mute on/off.</span>
                  </div>
                  <div className="seg-group">
                    <button
                      className={`seg-btn${muteMode === 'hold' ? ' seg-btn--active' : ''}`}
                      onClick={() => onChangeMuteMode('hold')}
                    >Hold</button>
                    <button
                      className={`seg-btn${muteMode === 'toggle' ? ' seg-btn--active' : ''}`}
                      onClick={() => onChangeMuteMode('toggle')}
                    >Toggle</button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Mute key</span>
                    <span className="settings-row__hint">Captured system-wide — press to mute/unmute your microphone.</span>
                  </div>
                  <div className="keybind-row">
                    <button
                      className={`rebind${capturing === 'mute' ? ' rebind--active' : ''}`}
                      onClick={() => startCapture('mute')}
                      onKeyDown={capturing === 'mute' ? (e) => onRebindKey(e, onChangePushToTalkKey, onChangeMuteKey) : undefined}
                    >
                      {capturing === 'mute' ? 'Press a key…' : (muteKey || 'Unbound')}
                    </button>
                    {muteKey && (
                      <button
                        className="unbind-btn"
                        onClick={() => onChangeMuteKey('')}
                        title="Clear keybind"
                        aria-label="Clear Mute keybind"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <hr className="settings-divider" />
                <div id="section-processing" className="settings-subdivision">Processing</div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Noise suppression</span>
                    <span className="settings-row__hint">Chromium built-in mic noise removal.</span>
                  </div>
                  <Toggle on={noiseSuppression} onClick={() => onChangeNoiseSuppression(!noiseSuppression)} />
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Echo cancellation</span>
                    <span className="settings-row__hint">Removes speaker echo picked up by the mic. Turn off if using headphones with a dedicated mic.</span>
                  </div>
                  <Toggle on={echoCancellation} onClick={() => onChangeEchoCancellation(!echoCancellation)} />
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Automatic gain control</span>
                    <span className="settings-row__hint">Auto-levels your mic volume. Turn off if you prefer manual control.</span>
                  </div>
                  <Toggle on={autoGainControl} onClick={() => onChangeAutoGainControl(!autoGainControl)} />
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Normalize voices</span>
                    <span className="settings-row__hint">Auto-levels how loud <em>others</em> sound — boosts quiet people, tames loud ones. Applies to incoming audio only.</span>
                  </div>
                  <Toggle on={normalizeVoices} onClick={() => onChangeNormalizeVoices(!normalizeVoices)} />
                </div>
              </>
            )}

            {activeTab === 'video' && (
              <>
                <div id="section-video-default" className="settings-subdivision">Room Video Button</div>
                
                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Default action</span>
                    <span className="settings-row__hint">Choose the default action for the Video button when both camera and screen share are off.</span>
                  </div>
                  <div className="seg-group">
                    <button
                      className={`seg-btn${defaultVideoAction === 'camera' ? ' seg-btn--active' : ''}`}
                      onClick={() => onChangeDefaultVideoAction('camera')}
                    >Camera</button>
                    <button
                      className={`seg-btn${defaultVideoAction === 'screen' ? ' seg-btn--active' : ''}`}
                      onClick={() => onChangeDefaultVideoAction('screen')}
                    >Screen Share</button>
                  </div>
                </div>

                <hr className="settings-divider" />

                <div id="section-camera" className="settings-subdivision" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Camera Constraints</span>
                  {!hasCamera && (
                    <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 600, textTransform: 'initial' }}>
                      (No camera detected)
                    </span>
                  )}
                </div>
                
                <div className="settings-row" style={{ opacity: hasCamera ? 1 : 0.5, pointerEvents: hasCamera ? undefined : 'none' }}>
                  <div className="settings-row__label">
                    <span>Streaming resolution</span>
                    <span className="settings-row__hint">Higher resolutions require significantly more bandwidth.</span>
                  </div>
                  <select 
                    className="welcome__input" 
                    value={cameraResolution} 
                    onChange={(e) => onChangeCameraResolution(e.target.value)}
                    style={{ width: 'auto', padding: '6px 12px' }}
                  >
                    <option value="480p">480p</option>
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                    <option value="1440p">1440p</option>
                    <option value="4K">4K</option>
                  </select>
                </div>

                <div className="settings-row" style={{ opacity: hasCamera ? 1 : 0.5, pointerEvents: hasCamera ? undefined : 'none' }}>
                  <div className="settings-row__label">
                    <span>Framerate</span>
                    <span className="settings-row__hint">Frames per second for your camera stream.</span>
                  </div>
                  <select 
                    className="welcome__input" 
                    value={cameraFramerate} 
                    onChange={(e) => onChangeCameraFramerate(e.target.value)}
                    style={{ width: 'auto', padding: '6px 12px' }}
                  >
                    <option value="15">15 fps</option>
                    <option value="30">30 fps</option>
                    <option value="60">60 fps</option>
                  </select>
                </div>

                <hr className="settings-divider" />
                <div id="section-screen-share" className="settings-subdivision">Screen Share Constraints</div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Screen resolution limit</span>
                    <span className="settings-row__hint">Cap the maximum resolution when sharing your screen.</span>
                  </div>
                  <select 
                    className="welcome__input" 
                    value={screenResolution} 
                    onChange={(e) => onChangeScreenResolution(e.target.value)}
                    style={{ width: 'auto', padding: '6px 12px' }}
                  >
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                    <option value="1440p">1440p</option>
                    <option value="4K">Unlimited (4K)</option>
                  </select>
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Screen framerate limit</span>
                    <span className="settings-row__hint">Max frames per second for screen sharing.</span>
                  </div>
                  <select 
                    className="welcome__input" 
                    value={screenFramerate} 
                    onChange={(e) => onChangeScreenFramerate(e.target.value)}
                    style={{ width: 'auto', padding: '6px 12px' }}
                  >
                    <option value="15">15 fps</option>
                    <option value="30">30 fps</option>
                    <option value="60">60 fps</option>
                  </select>
                </div>
              </>
            )}

            {activeTab === 'sfx' && (
              <>
                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Sound effects</span>
                    <span className="settings-row__hint">Master switch for all audio cues.</span>
                  </div>
                  <Toggle on={sfxEnabled} onClick={() => onChangeSfxEnabled(!sfxEnabled)} />
                </div>

                <div className="settings-row" style={{ paddingLeft: 16, opacity: sfxEnabled ? 1 : 0.45, pointerEvents: sfxEnabled ? undefined : 'none' }}>
                  <div className="settings-row__label">
                    <span>Room join / leave</span>
                    <span className="settings-row__hint">When you or a peer join or leave a room.</span>
                  </div>
                  <Toggle on={sfxJoinLeaveEnabled} onClick={() => onChangeSfxJoinLeaveEnabled(!sfxJoinLeaveEnabled)} />
                </div>

                <div className="settings-row" style={{ paddingLeft: 16, opacity: sfxEnabled ? 1 : 0.45, pointerEvents: sfxEnabled ? undefined : 'none' }}>
                  <div className="settings-row__label">
                    <span>Mic mute / unmute</span>
                    <span className="settings-row__hint">When you mute or unmute your microphone.</span>
                  </div>
                  <Toggle on={sfxMuteEnabled} onClick={() => onChangeSfxMuteEnabled(!sfxMuteEnabled)} />
                </div>

                <div className="settings-row" style={{ paddingLeft: 16, opacity: sfxEnabled ? 1 : 0.45, pointerEvents: sfxEnabled ? undefined : 'none' }}>
                  <div className="settings-row__label">
                    <span>Transmission start / stop</span>
                    <span className="settings-row__hint">When voice activation or push-to-talk opens or closes.</span>
                  </div>
                  <Toggle on={sfxTransmitEnabled} onClick={() => onChangeSfxTransmitEnabled(!sfxTransmitEnabled)} />
                </div>

                <div className="settings-row" style={{ paddingLeft: 16, opacity: sfxEnabled ? 1 : 0.45, pointerEvents: sfxEnabled ? undefined : 'none' }}>
                  <div className="settings-row__label">
                    <span>Chat messages</span>
                    <span className="settings-row__hint">When an incoming chat message arrives.</span>
                  </div>
                  <Toggle on={sfxChatEnabled} onClick={() => onChangeSfxChatEnabled(!sfxChatEnabled)} />
                </div>

                <div className="settings-row" style={{ paddingLeft: 16, opacity: sfxEnabled ? 1 : 0.45, pointerEvents: sfxEnabled ? undefined : 'none' }}>
                  <div className="settings-row__label">
                    <span>Deafen / undeafen</span>
                    <span className="settings-row__hint">When you toggle deafen mode.</span>
                  </div>
                  <Toggle on={sfxDeafenEnabled} onClick={() => onChangeSfxDeafenEnabled(!sfxDeafenEnabled)} />
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>SFX volume</span>
                    <span className="settings-row__hint">Adjust volume level of sound effects.</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={sfxVolume}
                    disabled={!sfxEnabled}
                    onChange={(e) => onChangeSfxVolume(parseFloat(e.target.value))}
                    className="settings-slider"
                  />
                </div>
              </>
            )}

            {activeTab === 'ui' && (
              <>
              <div className="settings-row">
                <div className="settings-row__label">
                  <span>Theme</span>
                  <span className="settings-row__hint">Pick a color theme for the whole app.</span>
                </div>
                <div className="seg-group">
                  <button
                    className={`seg-btn${theme === 'midnight' ? ' seg-btn--active' : ''}`}
                    onClick={() => onChangeTheme('midnight')}
                  >Midnight</button>
                  <button
                    className={`seg-btn${theme === 'classic' ? ' seg-btn--active' : ''}`}
                    onClick={() => onChangeTheme('classic')}
                  >Classic Dark</button>
                  <button
                    className={`seg-btn${theme === 'oled' ? ' seg-btn--active' : ''}`}
                    onClick={() => onChangeTheme('oled')}
                  >OLED Black</button>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row__label">
                  <span>UI Scale Slider</span>
                  <span className="settings-row__hint">Scale the size of all application elements.</span>
                </div>
                <div className="mic-control-wrap" style={{ marginTop: '12px' }}>
                  <SettingsSlider
                    min={0.8}
                    max={1.5}
                    step={0.1}
                    value={uiScale}
                    onChange={onChangeUiScale}
                    markers={[0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5]}
                    labels={[
                      { value: 0.8, text: '80%' },
                      { value: 1.0, text: '100% (Default)' },
                      { value: 1.2, text: '120%' },
                      { value: 1.5, text: '150%' }
                    ]}
                    snapThreshold={0.05}
                    commitOnRelease={true}
                  />
                </div>
              </div>
              </>
            )}

            {activeTab === 'chat' && (
              <>
              <div id="section-chat-settings" className="settings-subdivision">Chat Settings</div>

              <div className="settings-row">
                <div className="settings-row__label">
                  <span>Chat Font Scale</span>
                  <span className="settings-row__hint">Adjust the size of the text messages in the chat panel.</span>
                </div>
                <div className="mic-control-wrap">
                  <SettingsSlider
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={chatFontScale}
                    onChange={onChangeChatFontScale}
                    markers={[0.5, 1.0, 1.5, 2.0]}
                    labels={[
                      { value: 0.5, text: '50%' },
                      { value: 1.0, text: '100% (Default)' },
                      { value: 1.5, text: '150%' },
                      { value: 2.0, text: '200%' }
                    ]}
                    snapThreshold={0.08}
                    commitOnRelease={false}
                  />
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row__label">
                  <span>Chat Width Scale</span>
                  <span className="settings-row__hint">Adjust the width of the room chat panel (from 100% to 200%).</span>
                </div>
                <div className="mic-control-wrap">
                  <SettingsSlider
                    min={1.0}
                    max={2.0}
                    step={0.05}
                    value={chatWidthScale}
                    onChange={onChangeChatWidthScale}
                    markers={[1.0, 1.25, 1.5, 1.75, 2.0]}
                    labels={[
                      { value: 1.0, text: '100% (Default)' },
                      { value: 1.25, text: '125%' },
                      { value: 1.5, text: '150%' },
                      { value: 1.75, text: '175%' },
                      { value: 2.0, text: '200%' }
                    ]}
                    snapThreshold={0.04}
                    commitOnRelease={false}
                  />
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row__label">
                  <span>Chat position</span>
                  <span className="settings-row__hint">Align the chat panel on either the left or right side of the screen.</span>
                </div>
                <div className="seg-group">
                  <button
                    className={`seg-btn${chatPosition === 'left' ? ' seg-btn--active' : ''}`}
                    onClick={() => onChangeChatPosition('left')}
                  >Left</button>
                  <button
                    className={`seg-btn${chatPosition === 'right' ? ' seg-btn--active' : ''}`}
                    onClick={() => onChangeChatPosition('right')}
                  >Right</button>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row__label">
                  <span>Read messages aloud (Text-to-Speech)</span>
                  <span className="settings-row__hint">When the app is minimized or unfocused, new chat messages are spoken using your system voice.</span>
                </div>
                <Toggle on={chatTtsEnabled} onClick={() => onChangeChatTtsEnabled(!chatTtsEnabled)} />
              </div>

              <div className="settings-row">
                <div className="settings-row__label">
                  <span>Speak sender's name</span>
                  <span className="settings-row__hint">Read "[name] says:" before each message. Turn off to hear just the message text.</span>
                </div>
                <Toggle on={chatTtsSpeakName} onClick={() => onChangeChatTtsSpeakName(!chatTtsSpeakName)} />
              </div>

              <div className="settings-row">
                <div className="settings-row__label">
                  <span>My chat voice</span>
                  <span className="settings-row__hint">How your messages sound to others who have read-aloud on. Each listener's app matches it to the closest voice their system has.</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <CustomSelect
                    value={voicePreference}
                    onChange={onChangeVoicePreference}
                    options={[
                      { value: '', label: 'System Default' },
                      ...VOICE_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))
                    ]}
                    className="settings-device-select"
                  />
                  <button
                    className="seg-btn"
                    onClick={() => previewVoice(voicePreference)}
                  >
                    Test
                  </button>
                </div>
              </div>
              </>
            )}

            {activeTab === 'app' && (
              <>
                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Launch on startup</span>
                    <span className="settings-row__hint">Open Chickadee automatically when Windows boots.</span>
                  </div>
                  <Toggle on={launchOnStartup} onClick={() => onChangeLaunchOnStartup(!launchOnStartup)} />
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>When closing the window</span>
                    <span className="settings-row__hint">Minimize to tray keeps you connected to voice in the background.</span>
                  </div>
                  <div className="seg-group">
                    <button
                      className={`seg-btn${closeBehavior === 'quit' ? ' seg-btn--active' : ''}`}
                      onClick={() => onChangeCloseBehavior('quit')}
                    >Quit app</button>
                    <button
                      className={`seg-btn${closeBehavior === 'tray' ? ' seg-btn--active' : ''}`}
                      onClick={() => onChangeCloseBehavior('tray')}
                    >Minimize to tray</button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Always on top</span>
                    <span className="settings-row__hint">Pin the window above other apps — handy on a single monitor.</span>
                  </div>
                  <Toggle on={alwaysOnTop} onClick={() => onChangeAlwaysOnTop(!alwaysOnTop)} />
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Taskbar unread badge</span>
                    <span className="settings-row__hint">Show count of unread messages on the app icon when unfocused.</span>
                  </div>
                  <Toggle on={badgeNotificationsEnabled} onClick={() => onChangeBadgeNotificationsEnabled(!badgeNotificationsEnabled)} />
                </div>

                <hr className="settings-divider" />

                <div className="settings-row" style={{ marginTop: '10px' }}>
                  <div className="settings-row__label">
                    <span style={{ color: '#f87171', fontWeight: 600 }}>Reset Application Settings</span>
                    <span className="settings-row__hint">Restore all settings (audio, video, hotkeys, UI) to default. Profile and Spaces are kept.</span>
                  </div>
                  <button
                    className="danger-action-btn"
                    onClick={resetAppSettings}
                  >
                    Reset Settings
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="settings-content__foot">
            <button className="modal-action" onClick={() => { commitName(); onClose(); }}>
              Done
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
