import { useState, useEffect, useRef } from 'react';
import { User, Mic, Volume2, Keyboard, Sliders, X } from 'lucide-react';
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
  analyserNode: AnalyserNode | null;
  onClose: () => void;
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
  analyserNode,
  onClose,
}: SettingsModalProps): React.JSX.Element {
  const [name, setName] = useState(displayName);
  const { capturing, startCapture, onRebindKey } = useKeyCapture();
  const [activeTab, setActiveTab] = useState<'profile' | 'audio' | 'sfx' | 'keybinds' | 'app'>('profile');

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
            className={`settings-sidebar__item${activeTab === 'sfx' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('sfx')}
          >
            <Volume2 size={15} />
            <span>Sound Effects</span>
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
              {activeTab === 'sfx' && 'Sound Effects'}
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
                    <div className="mic-slider-container">
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="0.1"
                        value={micVolume}
                        onChange={(e) => onChangeMicVolume(parseFloat(e.target.value))}
                        className="settings-slider"
                      />
                      <div className="mic-slider-tick" />
                    </div>
                    <div className="mic-slider-labels">
                      <span>0%</span>
                      <span className="mic-slider-labels__center">100% (Normal)</span>
                      <span>400% (Boosted)</span>
                    </div>
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
