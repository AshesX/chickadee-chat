import { Settings } from 'lucide-react';

interface InputModeMenuProps {
  inputMode: 'open' | 'voice' | 'ptt';
  onSwitchMode: (mode: 'open' | 'voice' | 'ptt') => void;
  pttMode: 'hold' | 'toggle';
  onChangePttMode: (mode: 'hold' | 'toggle') => void;
  pushToTalkKey: string;
  vadThreshold: number;
  onChangeVadThreshold: (v: number) => void;
  openMicNoiseReductionEnabled: boolean;
  onToggleOpenMicNoiseReduction: () => void;
  onOpenVoiceSettings: () => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

const MODE_LABELS: Record<'open' | 'voice' | 'ptt', string> = {
  open: 'Open Mic',
  voice: 'Voice',
  ptt: 'Push-Talk',
};

export function InputModeMenu({
  inputMode,
  onSwitchMode,
  pttMode,
  onChangePttMode,
  pushToTalkKey,
  vadThreshold,
  onChangeVadThreshold,
  openMicNoiseReductionEnabled,
  onToggleOpenMicNoiseReduction,
  onOpenVoiceSettings,
  onClose,
  anchorRect,
}: InputModeMenuProps): React.JSX.Element {
  const menuWidth = 260;
  const gap = 8;
  const bottom = window.innerHeight - anchorRect.top + gap;
  const rawLeft = anchorRect.left + anchorRect.width / 2 - menuWidth / 2;
  const left = Math.max(8, Math.min(rawLeft, window.innerWidth - menuWidth - 8));

  const vadPct = Math.round(((vadThreshold - 0.01) / (0.2 - 0.01)) * 100);

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div
        className="audio-menu"
        style={{ bottom, left, width: menuWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="input-mode-switcher">
          {(['open', 'voice', 'ptt'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`input-mode-switcher__btn${inputMode === m ? ' active' : ''}`}
              onClick={() => onSwitchMode(m)}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {inputMode === 'ptt' && (
          <>
            <div className="audio-menu__section-label">Mode</div>
            <div className="seg-group">
              <button
                type="button"
                className={`seg-btn${pttMode === 'hold' ? ' seg-btn--active' : ''}`}
                onClick={() => onChangePttMode('hold')}
              >
                Hold
              </button>
              <button
                type="button"
                className={`seg-btn${pttMode === 'toggle' ? ' seg-btn--active' : ''}`}
                onClick={() => onChangePttMode('toggle')}
              >
                Toggle
              </button>
            </div>
            <div className="input-mode-menu__key-row">
              <span className="input-mode-menu__key-label">Key</span>
              <span className="input-mode-menu__key-value">{pushToTalkKey || '—'}</span>
              <button
                type="button"
                className="input-mode-menu__change-link"
                onClick={onOpenVoiceSettings}
              >
                change
              </button>
            </div>
          </>
        )}

        {inputMode === 'voice' && (
          <>
            <div className="audio-menu__section-label">Sensitivity — {vadPct}%</div>
            <input
              type="range"
              className="audio-menu__slider"
              min={0.01}
              max={0.2}
              step={0.005}
              value={vadThreshold}
              onChange={(e) => onChangeVadThreshold(Number(e.target.value))}
            />
            <div className="audio-menu__vol-labels">
              <span>Low</span>
              <span>High</span>
            </div>
          </>
        )}

        {inputMode === 'open' && (
          <>
            <div className="audio-menu__section-label">Open Mic Settings</div>
            <label className="audio-menu__toggle-row">
              <input
                type="checkbox"
                checked={openMicNoiseReductionEnabled}
                onChange={() => onToggleOpenMicNoiseReduction()}
              />
              Background noise reduction
            </label>
          </>
        )}

        <hr className="audio-menu__divider" />
        <button className="audio-menu__settings-link" onClick={onOpenVoiceSettings}>
          <Settings size={11} />
          Voice Settings
        </button>
      </div>
    </>
  );
}
