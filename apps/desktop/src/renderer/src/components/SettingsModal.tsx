import { useState, useEffect, useRef } from 'react';
import { User, Mic, Volume2, Keyboard, Sliders, X, Video, Monitor } from 'lucide-react';
import { useKeyCapture } from '../hooks/useKeyCapture';

interface SettingsModalProps {
  displayName: string;
  onChangeName: (name: string) => void;
  noiseSuppression: boolean;
  onChangeNoiseSuppression: (on: boolean) => void;
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
  analyserNode: AnalyserNode | null;
  onClose: () => void;
}

function SettingsSlider({
  min,
  max,
  step,
  value,
  onChange,
  markers,
  labels,
  snapThreshold = 0.03,
  commitOnRelease = false,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
  markers: number[];
  labels: { value: number; text: string }[];
  snapThreshold?: number;
  commitOnRelease?: boolean;
}): React.JSX.Element {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    if (commitOnRelease) {
      setLocalValue(value);
    }
  }, [value, commitOnRelease]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = parseFloat(e.target.value);
    
    // Magnetic snap
    for (const m of markers) {
      if (Math.abs(m - val) <= snapThreshold) {
        val = m;
        break;
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
    <div style={{ width: '100%' }}>
      <div className="mic-slider-container">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={commitOnRelease ? localValue : value}
          onChange={handleChange}
          onPointerUp={commitOnRelease ? handleCommit : undefined}
          onKeyUp={commitOnRelease ? handleKeyUp : undefined}
          onBlur={commitOnRelease ? handleCommit : undefined}
          className="settings-slider"
        />
        {markers.map((m) => {
          const percent = ((m - min) / (max - min)) * 100;
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
          const percent = ((l.value - min) / (max - min)) * 100;
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

function MicLevelMeter({
  analyserNode,
}: {
  analyserNode: AnalyserNode | null;
}): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!analyserNode) {
      if (barRef.current) barRef.current.style.width = '0%';
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

      if (barRef.current) {
        barRef.current.style.width = `${percentage}%`;

        // Clip warning if boosted audio is excessively high (frequency amplitude clipping)
        const isClipping = average > 195;
        barRef.current.className = `mic-meter__fill${isClipping ? ' mic-meter__fill--clipping' : ''}`;
      }

      animationFrameId = requestAnimationFrame(updateMeter);
    };

    updateMeter();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyserNode]);

  return (
    <div className="mic-meter">
      <div className="mic-meter__track">
        <div ref={barRef} className="mic-meter__fill" />
      </div>
      <span className="mic-meter__label">
        {analyserNode ? 'Live input' : 'Mic offline'}
      </span>
    </div>
  );
}

export function SettingsModal({
  displayName,
  onChangeName,
  noiseSuppression,
  onChangeNoiseSuppression,
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
  analyserNode,
  onClose,
}: SettingsModalProps): React.JSX.Element {
  const [name, setName] = useState(displayName);
  const { capturing, startCapture, onRebindKey } = useKeyCapture();
  const [activeTab, setActiveTab] = useState<'profile' | 'audio' | 'video' | 'sfx' | 'ui' | 'keybinds' | 'app'>('profile');

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
            className={`settings-sidebar__item${activeTab === 'app' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('app')}
          >
            <Sliders size={15} />
            <span>App Settings</span>
          </button>
        </div>

        {/* Right Content Panel */}
        <div className="settings-content">
          <div className="settings-content__head">
            <h2 className="settings-content__title">
              {activeTab === 'profile' && 'My Profile'}
              {activeTab === 'audio' && 'Voice & Audio'}
              {activeTab === 'video' && 'Video & Screen Share'}
              {activeTab === 'sfx' && 'Sound Effects'}
              {activeTab === 'ui' && 'User Interface'}
              {activeTab === 'keybinds' && 'Push-to-talk/Mute'}
              {activeTab === 'app' && 'App Settings'}
            </h2>
            <button className="settings-content__close" onClick={onClose} aria-label="Close settings">
              <X size={18} />
            </button>
          </div>

          <div className="settings-content__body">
            {activeTab === 'profile' && (
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
            )}

            {activeTab === 'audio' && (
              <>
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
                    <MicLevelMeter analyserNode={analyserNode} />
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Noise suppression</span>
                    <span className="settings-row__hint">Chromium built-in mic noise removal.</span>
                  </div>
                  <Toggle on={noiseSuppression} onClick={() => onChangeNoiseSuppression(!noiseSuppression)} />
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
                    <span className="settings-row__hint">Audio cues for room join/leave, mute, and chat.</span>
                  </div>
                  <Toggle on={sfxEnabled} onClick={() => onChangeSfxEnabled(!sfxEnabled)} />
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

            {activeTab === 'app' && (
              <div className="settings-row">
                <div className="settings-row__label">
                  <span>Taskbar unread badge</span>
                  <span className="settings-row__hint">Show count of unread messages on the app icon when unfocused.</span>
                </div>
                <Toggle on={badgeNotificationsEnabled} onClick={() => onChangeBadgeNotificationsEnabled(!badgeNotificationsEnabled)} />
              </div>
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
