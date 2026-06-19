import { Settings } from 'lucide-react';
import { GATE_THRESHOLD_MIN, GATE_THRESHOLD_MAX, thresholdToPct } from '../lib/audioGate';

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
  openMicThreshold: number;
  onChangeOpenMicThreshold: (v: number) => void;
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
  openMicThreshold,
  onChangeOpenMicThreshold,
  onOpenVoiceSettings,
  onClose,
  anchorRect,
}: InputModeMenuProps): React.JSX.Element {
  const menuWidth = 260;
  const gap = 8;
  const bottom = window.innerHeight - anchorRect.top + gap;
  const rawLeft = anchorRect.left + anchorRect.width / 2 - menuWidth / 2;
  const left = Math.max(8, Math.min(rawLeft, window.innerWidth - menuWidth - 8));

  const vadPct = thresholdToPct(vadThreshold);
  const openMicPct = thresholdToPct(openMicThreshold);

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
            <div className="audio-menu__section-label">Threshold — {vadPct}%</div>
            <input
              type="range"
              className="audio-menu__slider"
              min={GATE_THRESHOLD_MIN}
              max={GATE_THRESHOLD_MAX}
              step={0.001}
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
            <label className="audio-menu__toggle-row">
              <input
                type="checkbox"
                checked={openMicNoiseReductionEnabled}
                onChange={() => onToggleOpenMicNoiseReduction()}
              />
              Noise gate
            </label>
            {openMicNoiseReductionEnabled && (
              <>
                <div className="audio-menu__section-label">Threshold — {openMicPct}%</div>
                <input
                  type="range"
                  className="audio-menu__slider"
                  min={GATE_THRESHOLD_MIN}
                  max={GATE_THRESHOLD_MAX}
                  step={0.001}
                  value={openMicThreshold}
                  onChange={(e) => onChangeOpenMicThreshold(Number(e.target.value))}
                />
                <div className="audio-menu__vol-labels">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </>
            )}
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
