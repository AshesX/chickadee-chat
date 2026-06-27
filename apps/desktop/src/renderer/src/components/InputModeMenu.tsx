import { Settings } from 'lucide-react';
import { GATE_THRESHOLD_MIN, GATE_THRESHOLD_MAX, thresholdToPct } from '../lib/audioGate';
import { KeybindControl } from './KeybindControl';
import { ChevronMenu } from './ChevronMenu';

interface InputModeMenuProps {
  inputMode: 'voice' | 'ptt';
  onSwitchMode: (mode: 'voice' | 'ptt') => void;
  pttMode: 'hold' | 'toggle';
  onChangePttMode: (mode: 'hold' | 'toggle') => void;
  pushToTalkKey: string;
  onChangePushToTalkKey: (k: string) => void;
  vadThreshold: number;
  onChangeVadThreshold: (v: number) => void;
  onOpenVoiceSettings: () => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

const MODE_LABELS: Record<'voice' | 'ptt', string> = {
  voice: 'Voice',
  ptt: 'Push-Talk',
};

export function InputModeMenu({
  inputMode,
  onSwitchMode,
  pttMode,
  onChangePttMode,
  pushToTalkKey,
  onChangePushToTalkKey,
  vadThreshold,
  onChangeVadThreshold,
  onOpenVoiceSettings,
  onClose,
  anchorRect,
}: InputModeMenuProps): React.JSX.Element {
  const vadPct = thresholdToPct(vadThreshold);

  return (
    <ChevronMenu anchorRect={anchorRect} onClose={onClose} width={280} className="audio-menu">
        <div className="input-mode-switcher">
          {(['voice', 'ptt'] as const).map((m) => (
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
          <KeybindControl
            mode={pttMode}
            onChangeMode={onChangePttMode}
            value={pushToTalkKey}
            onChange={onChangePushToTalkKey}
            clearLabel="Push-to-talk keybind"
          />
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

        <hr className="audio-menu__divider" />
        <button className="audio-menu__settings-link" onClick={onOpenVoiceSettings}>
          <Settings size={11} />
          Voice Settings
        </button>
    </ChevronMenu>
  );
}
