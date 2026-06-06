import { useState, useEffect, useRef } from 'react';
import { User, Mic, Volume2, Keyboard, Sliders, X } from 'lucide-react';

interface SettingsModalProps {
  displayName: string;
  onChangeName: (name: string) => void;
  noiseSuppression: boolean;
  onChangeNoiseSuppression: (on: boolean) => void;
  pttEnabled: boolean;
  onChangePttEnabled: (on: boolean) => void;
  pushToTalkKey: string;
  onChangePushToTalkKey: (key: string) => void;
  pttMode: 'hold' | 'toggle';
  onChangePttMode: (mode: 'hold' | 'toggle') => void;
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

/** Convert a keydown into an Electron accelerator (single keys only). */
function toAccelerator(e: React.KeyboardEvent): string | null {
  const k = e.key;
  if (k === ' ' || k === 'Spacebar') return 'Space';
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) return k;
  if (/^[a-zA-Z0-9]$/.test(k)) return k.toUpperCase();
  if (k === 'ArrowUp') return 'Up';
  if (k === 'ArrowDown') return 'Down';
  if (k === 'ArrowLeft') return 'Left';
  if (k === 'ArrowRight') return 'Right';
  if (k === 'Tab' || k === 'Insert' || k === 'Delete' || k === 'Home' || k === 'End') return k;
  return null;
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
  pttEnabled,
  onChangePttEnabled,
  pushToTalkKey,
  onChangePushToTalkKey,
  pttMode,
  onChangePttMode,
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
  const [capturing, setCapturing] = useState(false);
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

  function onRebindKey(e: React.KeyboardEvent): void {
    e.preventDefault();
    const accel = toAccelerator(e);
    if (accel) {
      onChangePushToTalkKey(accel);
      setCapturing(false);
    }
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
            <span>Keybinds (PTT)</span>
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
              {activeTab === 'keybinds' && 'Keybinds (PTT)'}
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
                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Push-to-talk</span>
                    <span className="settings-row__hint">System-wide hotkey; mic off until activated.</span>
                  </div>
                  <Toggle on={pttEnabled} onClick={() => onChangePttEnabled(!pttEnabled)} />
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>PTT mode</span>
                    <span className="settings-row__hint">Hold: mic live while key held. Toggle: press to unmute, press again to mute.</span>
                  </div>
                  <div className="seg-group">
                    <button
                      className={`seg-btn${pttMode === 'hold' ? ' seg-btn--active' : ''}`}
                      disabled={!pttEnabled}
                      onClick={() => onChangePttMode('hold')}
                    >Hold</button>
                    <button
                      className={`seg-btn${pttMode === 'toggle' ? ' seg-btn--active' : ''}`}
                      disabled={!pttEnabled}
                      onClick={() => onChangePttMode('toggle')}
                    >Toggle</button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Push-to-talk key</span>
                    <span className="settings-row__hint">Captured system-wide — pick a key you don't use in-game.</span>
                  </div>
                  <button
                    className={`rebind${capturing ? ' rebind--active' : ''}`}
                    disabled={!pttEnabled}
                    onClick={() => setCapturing(true)}
                    onKeyDown={capturing ? onRebindKey : undefined}
                  >
                    {capturing ? 'Press a key…' : pushToTalkKey}
                  </button>
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
