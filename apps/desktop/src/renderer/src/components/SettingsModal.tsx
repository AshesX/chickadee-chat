import { useState, useEffect, useRef } from 'react';
import { User, Mic, Volume2, Keyboard, Sliders, X, Video, Monitor, Gamepad2, Plus, Trash2, MessageSquare } from 'lucide-react';
import { defaultSettings, type GameDef } from '@chickadee/shared';
import { useKeyCapture } from '../hooks/useKeyCapture';
import type { MediaDeviceOption } from '../hooks/useMediaDevices';
import { AvatarCropModal } from './AvatarCropModal';

interface SettingsModalProps {
  displayName: string;
  onChangeName: (name: string) => void;
  noiseSuppression: boolean;
  onChangeNoiseSuppression: (on: boolean) => void;
  echoCancellation: boolean;
  onChangeEchoCancellation: (on: boolean) => void;
  autoGainControl: boolean;
  onChangeAutoGainControl: (on: boolean) => void;
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
  sfxChatEnabled: boolean;
  onChangeSfxChatEnabled: (on: boolean) => void;
  sfxDeafenEnabled: boolean;
  onChangeSfxDeafenEnabled: (on: boolean) => void;
  badgeNotificationsEnabled: boolean;
  onChangeBadgeNotificationsEnabled: (on: boolean) => void;
  micVolume: number;
  onChangeMicVolume: (vol: number) => void;
  cameraResolution: string;
  onChangeCameraResolution: (res: string) => void;
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
  analyserNode: AnalyserNode | null;
  onClose: () => void;
  avatarDataUrl: string | null;
  selfColor: string;
  onChangeAvatar: (dataUrl: string | null) => void;
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
 * A single rAF loop reads `analyserNode.getByteFrequencyData` once per frame and
 * writes the level to every registered meter bar. This avoids having multiple
 * `MicLevelMeter`s each poll the same AnalyserNode — two `getByteFrequencyData`
 * readers on one node starve each other (the second reads zeros), which is why
 * the voice meter previously stayed empty while the mic-volume meter worked.
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

    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    let animationFrameId: number;

    const updateMeter = (): void => {
      analyserNode.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;

      // Normalize average (which typically lands between 0 and 110 for speech)
      const percentage = Math.min(100, Math.round((average / 110) * 100));
      // Clip warning if boosted audio is excessively high (frequency amplitude clipping)
      const className = `mic-meter__fill${average > 195 ? ' mic-meter__fill--clipping' : ''}`;

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
}: {
  bars: React.MutableRefObject<Set<HTMLDivElement>>;
  online: boolean;
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

  return (
    <div className="mic-meter">
      <div className="mic-meter__track">
        <div ref={barRef} className="mic-meter__fill" />
      </div>
      <span className="mic-meter__label">
        {online ? 'Live input' : 'Mic offline'}
      </span>
    </div>
  );
}

/** Game-detection list editor: built-ins are read-only; custom rows removable. */
function GamesPanel(): React.JSX.Element {
  const [games, setGames] = useState<GameDef[]>([]);
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [proc, setProc] = useState('');

  useEffect(() => {
    void window.chickadee?.getGames?.().then((g) => setGames(g ?? []));
  }, []);

  function persist(next: GameDef[]): void {
    setGames(next);
    void window.chickadee?.saveGames?.(next);
  }

  function addGame(): void {
    const n = name.trim();
    const p = proc.trim().toLowerCase().replace(/\.exe$/, '');
    if (!n || !p) return;
    const s = (short.trim() || n.slice(0, 3)).toUpperCase();
    persist([...games, { name: n, short: s, processName: p, isCustom: true }]);
    setName('');
    setShort('');
    setProc('');
  }

  const builtIns = games.filter((g) => !g.isCustom);
  const customs = games.map((g, i) => ({ g, i })).filter(({ g }) => g.isCustom);

  return (
    <>
      <span className="settings-row__hint" style={{ marginBottom: '10px', display: 'block' }}>
        Chickadee shows a tag on your tile when a known game is running (Windows only).
        Add your own by entering its process name (e.g. <code>mygame.exe</code>).
      </span>

      <div className="settings-subdivision">Your games</div>
      {customs.length === 0 && (
        <span className="settings-row__hint">No custom games yet.</span>
      )}
      {customs.map(({ g, i }) => (
        <div className="settings-row" key={`${g.processName}-${i}`}>
          <div className="settings-row__label">
            <span>{g.name} · {g.short}</span>
            <span className="settings-row__hint">{g.processName}</span>
          </div>
          <button
            className="unbind-btn"
            onClick={() => persist(games.filter((_, idx) => idx !== i))}
            title="Remove game"
            aria-label={`Remove ${g.name}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <div className="settings-row" style={{ alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <input
          className="welcome__input"
          style={{ flex: '2 1 120px', padding: '6px 10px', margin: 0, textAlign: 'left' }}
          placeholder="Display name"
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="welcome__input"
          style={{ flex: '1 1 60px', padding: '6px 10px', margin: 0, textAlign: 'left' }}
          placeholder="Tag"
          value={short}
          maxLength={5}
          onChange={(e) => setShort(e.target.value)}
        />
        <input
          className="welcome__input"
          style={{ flex: '2 1 120px', padding: '6px 10px', margin: 0, textAlign: 'left' }}
          placeholder="process.exe"
          value={proc}
          onChange={(e) => setProc(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addGame()}
        />
        <button
          className="seg-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '8px 12px', borderRadius: 'var(--radius-badge)' }}
          onClick={addGame}
          disabled={!name.trim() || !proc.trim()}
        >
          <Plus size={14} /> Add
        </button>
      </div>

      <hr className="settings-divider" />
      <div className="settings-subdivision">Built-in games</div>
      {builtIns.map((g) => (
        <div className="settings-row" key={g.processName}>
          <div className="settings-row__label">
            <span>{g.name} · {g.short}</span>
            <span className="settings-row__hint">{g.processName}</span>
          </div>
        </div>
      ))}
    </>
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
  sfxChatEnabled,
  onChangeSfxChatEnabled,
  sfxDeafenEnabled,
  onChangeSfxDeafenEnabled,
  badgeNotificationsEnabled,
  onChangeBadgeNotificationsEnabled,
  micVolume,
  onChangeMicVolume,
  cameraResolution,
  onChangeCameraResolution,
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
  analyserNode,
  onClose,
  avatarDataUrl,
  selfColor,
  onChangeAvatar,
}: SettingsModalProps): React.JSX.Element {
  const [name, setName] = useState(displayName);
  const [cropOpen, setCropOpen] = useState(false);
  const { capturing, startCapture, onRebindKey } = useKeyCapture();
  const [activeTab, setActiveTab] = useState<'profile' | 'audio' | 'video' | 'sfx' | 'chat' | 'ui' | 'keybinds' | 'games' | 'app'>('profile');
  const [versionCopied, setVersionCopied] = useState(false);
  const version = window.chickadee?.appVersion || '0.1.0';

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
    onChangeSfxChatEnabled(defaults.sfxChatEnabled);
    onChangeSfxDeafenEnabled(defaults.sfxDeafenEnabled);
    onChangeBadgeNotificationsEnabled(defaults.badgeNotificationsEnabled);
    onChangeMicVolume(defaults.micVolume);
    onChangeCameraResolution(defaults.cameraResolution);
    onChangeCameraFramerate(defaults.cameraFramerate);
    onChangeScreenResolution(defaults.screenResolution);
    onChangeScreenFramerate(defaults.screenFramerate);
    onChangeUiScale(defaults.uiScale);
    onChangeChatFontScale(defaults.chatFontScale);
    onChangeChatPosition(defaults.chatPosition);
    onChangeChatWidthScale(defaults.chatWidthScale);
    onChangeChatTtsEnabled(defaults.chatTtsEnabled);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        
        {/* Left Sidebar Menu */}
        <div className="settings-sidebar">
          <div className="settings-sidebar__title">User Settings</div>
          <button
            className={`settings-sidebar__item${activeTab === 'profile' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <User size={15} />
            <span>My Profile</span>
          </button>

          <div className="settings-sidebar__title" style={{ marginTop: '14px' }}>App Settings</div>
          <button
            className={`settings-sidebar__item${activeTab === 'audio' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('audio')}
          >
            <Mic size={15} />
            <span>Voice & Audio</span>
          </button>
          <button
            className={`settings-sidebar__item${activeTab === 'video' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('video')}
          >
            <Video size={15} />
            <span>Video & Screen Share</span>
          </button>
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
          <button
            className={`settings-sidebar__item${activeTab === 'ui' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('ui')}
          >
            <Monitor size={15} />
            <span>User Interface</span>
          </button>
          <button
            className={`settings-sidebar__item${activeTab === 'keybinds' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('keybinds')}
          >
            <Keyboard size={15} />
            <span>Push-to-talk/Mute</span>
          </button>
          <button
            className={`settings-sidebar__item${activeTab === 'games' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('games')}
          >
            <Gamepad2 size={15} />
            <span>Game Detection</span>
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
              {versionCopied ? 'Copied!' : `v${version}`}
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
              {activeTab === 'keybinds' && 'Push-to-talk/Mute'}
              {activeTab === 'games' && 'Game Detection'}
              {activeTab === 'app' && 'App Settings'}
            </h2>
            <button className="settings-content__close" onClick={onClose} aria-label="Close settings">
              <X size={18} />
            </button>
          </div>

          <div className="settings-content__body">
            {activeTab === 'profile' && (
              <>
                <div className="settings-subdivision">Avatar</div>
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

                <div className="settings-subdivision" style={{ marginTop: '16px' }}>Display Name</div>
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
                <div className="settings-subdivision">Devices</div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Input device (microphone)</span>
                    <span className="settings-row__hint">Switches your mic live without dropping the call.</span>
                  </div>
                  <select
                    className="welcome__input"
                    value={inputDeviceId}
                    onChange={(e) => onChangeInputDevice(e.target.value)}
                    style={{ width: 'auto', maxWidth: '230px', padding: '6px 12px' }}
                  >
                    <option value="">System Default</option>
                    {inputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                    ))}
                  </select>
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Output device (speakers)</span>
                    <span className="settings-row__hint">Where other people's audio plays.</span>
                  </div>
                  <select
                    className="welcome__input"
                    value={outputDeviceId}
                    onChange={(e) => onChangeOutputDevice(e.target.value)}
                    style={{ width: 'auto', maxWidth: '230px', padding: '6px 12px' }}
                  >
                    <option value="">System Default</option>
                    {outputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                    ))}
                  </select>
                </div>

                <hr className="settings-divider" />
                <div className="settings-subdivision">Input Mode</div>

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
                          max={0.2}
                          step={0.005}
                          value={vadThreshold}
                          onChange={onChangeVadThreshold}
                          markers={[0.01, 0.05, 0.1, 0.15, 0.2]}
                          labels={[
                            { value: 0.01, text: 'Low' },
                            { value: 0.1, text: 'Medium' },
                            { value: 0.2, text: 'High' },
                          ]}
                          snapThreshold={0.004}
                        />
                        <MicLevelMeter bars={micBars} online={!!analyserNode} />
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
                              max={0.2}
                              step={0.005}
                              value={openMicThreshold}
                              onChange={onChangeOpenMicThreshold}
                              markers={[0.01, 0.05, 0.1, 0.15, 0.2]}
                              labels={[
                                { value: 0.01, text: 'Low' },
                                { value: 0.1, text: 'Medium' },
                                { value: 0.2, text: 'High' },
                              ]}
                              snapThreshold={0.004}
                            />
                            <MicLevelMeter bars={micBars} online={!!analyserNode} />
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

                <hr className="settings-divider" />
                <div className="settings-subdivision">Processing</div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Mic volume</span>
                    <span className="settings-row__hint">Adjust sensitivity. Levels above 100% act as a gain boost.</span>
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
              </>
            )}

            {activeTab === 'video' && (
              <>
                <div className="settings-subdivision">Camera Constraints</div>
                
                <div className="settings-row">
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

                <div className="settings-row">
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
                <div className="settings-subdivision">Screen Share Constraints</div>

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
              <div className="settings-subdivision">Chat Settings</div>

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
              </>
            )}

            {activeTab === 'keybinds' && (
              <>
                {/* Push-to-talk subdivision */}
                <div className="settings-subdivision">Push-to-talk</div>

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

                {/* Subtle Divider */}
                <hr className="settings-divider" />

                {/* Mic Mute subdivision */}
                <div className="settings-subdivision">Mic Mute</div>

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
              </>
            )}

            {activeTab === 'games' && <GamesPanel />}

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
