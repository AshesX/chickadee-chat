import { Settings } from 'lucide-react';
import { GATE_THRESHOLD_MIN, GATE_THRESHOLD_MAX, thresholdToPct } from '../lib/audioGate';
import { KeybindControl } from './KeybindControl';
import { ChevronMenu } from './ChevronMenu';
import { SettingsSlider } from './SettingsSlider';

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
    <ChevronMenu anchorRect={anchorRect} onClose={onClose} width={280} className="audio-menu menu-surface">
        <div className="seg-group" style={{ marginBottom: 10 }}>
          {(['voice', 'ptt'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`seg-btn${inputMode === m ? ' seg-btn--active' : ''}`}
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
          <div style={{ padding: '0 12px 12px' }}>
            <div className="audio-menu__section-label" style={{ marginBottom: 8 }}>Threshold — {vadPct}%</div>
            <SettingsSlider
              min={GATE_THRESHOLD_MIN}
              max={GATE_THRESHOLD_MAX}
              step={0.001}
              value={vadThreshold}
              onChange={onChangeVadThreshold}
              markers={[GATE_THRESHOLD_MIN, 0.1, GATE_THRESHOLD_MAX]}
              labels={[
                { value: GATE_THRESHOLD_MIN, text: 'Low' },
                { value: 0.1, text: 'Medium' },
                { value: GATE_THRESHOLD_MAX, text: 'High' },
              ]}
              snapThreshold={0.0005}
            />
          </div>
        )}

        <hr className="audio-menu__divider" />
        <button className="audio-menu__settings-link" onClick={onOpenVoiceSettings}>
          <Settings size={11} />
          Voice Settings
        </button>
    </ChevronMenu>
  );
}
