import { useState } from 'react';
import { Modal } from './Modal';

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
  onClose,
}: SettingsModalProps): React.JSX.Element {
  const [name, setName] = useState(displayName);
  const [capturing, setCapturing] = useState(false);

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
    <Modal title="Settings" onClose={onClose}>
      <label className="field">
        <span>Display name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && commitName()}
          maxLength={32}
        />
      </label>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Noise suppression</span>
          <span className="settings-row__hint">Chromium built-in mic noise removal.</span>
        </div>
        <Toggle on={noiseSuppression} onClick={() => onChangeNoiseSuppression(!noiseSuppression)} />
      </div>

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
        <button
          className={`rebind${capturing ? ' rebind--active' : ''}`}
          onClick={() => setCapturing(true)}
          onKeyDown={capturing ? onRebindKey : undefined}
        >
          {capturing ? 'Press a key…' : pushToTalkKey}
        </button>
      </div>

      <button className="modal-action" onClick={() => { commitName(); onClose(); }}>
        Done
      </button>
    </Modal>
  );
}
