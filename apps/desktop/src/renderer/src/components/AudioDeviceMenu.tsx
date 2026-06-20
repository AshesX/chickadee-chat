import { Settings } from 'lucide-react';
import type { MediaDeviceOption } from '../hooks/useMediaDevices';
import { CustomSelect } from './CustomSelect';
import { KeybindControl } from './KeybindControl';
import { SettingsSlider } from './SettingsSlider';

interface AudioDeviceMenuProps {
  mode: 'input' | 'output';
  devices: MediaDeviceOption[];
  selectedDeviceId: string;
  onSelectDevice: (id: string) => void;
  volume: number;
  onChangeVolume: (v: number) => void;
  /** Optional inline keybind capture (Mute key for input, Deafen key for output). */
  keybindLabel?: string;
  keybindValue?: string;
  onChangeKeybind?: (k: string) => void;
  keybindMode?: 'hold' | 'toggle';
  onChangeKeybindMode?: (m: 'hold' | 'toggle') => void;
  onOpenVoiceSettings: () => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

export function AudioDeviceMenu({
  mode,
  devices,
  selectedDeviceId,
  onSelectDevice,
  volume,
  onChangeVolume,
  keybindLabel,
  keybindValue,
  onChangeKeybind,
  keybindMode,
  onChangeKeybindMode,
  onOpenVoiceSettings,
  onClose,
  anchorRect,
}: AudioDeviceMenuProps): React.JSX.Element {
  const menuWidth = 280;
  const gap = 8;

  const bottom = window.innerHeight - anchorRect.top + gap;
  const rawLeft = anchorRect.left + anchorRect.width / 2 - menuWidth / 2;
  const left = Math.max(8, Math.min(rawLeft, window.innerWidth - menuWidth - 8));

  const isInput = mode === 'input';
  const volumeMax = 2;
  const volumePct = Math.round(volume * 100);

  const deviceOptions = [
    { value: '', label: 'System Default' },
    ...devices.map((d) => ({ value: d.deviceId, label: d.label })),
  ];

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div
        className="audio-menu"
        style={{ bottom, left, width: menuWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="audio-menu__section-label">
          {isInput ? 'Input Device' : 'Output Device'}
        </div>
        <CustomSelect
          value={selectedDeviceId}
          onChange={onSelectDevice}
          options={deviceOptions}
        />

        <div className="audio-menu__section-label" style={{ marginTop: 10 }}>
          {isInput ? `Mic Volume — ${volumePct}%` : `Output Volume — ${volumePct}%`}
        </div>
        <SettingsSlider
          min={0}
          max={volumeMax}
          step={0.05}
          value={volume}
          onChange={onChangeVolume}
          boostFrom={1}
          markers={[0, 0.5, 1, 1.5, 2]}
          labels={[
            { value: 0, text: '0%' },
            { value: 1, text: '100%' },
            { value: 2, text: '200%' },
          ]}
        />

        {onChangeKeybind && onChangeKeybindMode && (
          <KeybindControl
            mode={keybindMode ?? 'toggle'}
            onChangeMode={onChangeKeybindMode}
            value={keybindValue ?? ''}
            onChange={onChangeKeybind}
            clearLabel={`${keybindLabel} keybind`}
          />
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
