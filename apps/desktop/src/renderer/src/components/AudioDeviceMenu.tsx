import { Settings } from 'lucide-react';
import type { MediaDeviceOption } from '../hooks/useMediaDevices';
import { CustomSelect } from './CustomSelect';

interface AudioDeviceMenuProps {
  mode: 'input' | 'output';
  devices: MediaDeviceOption[];
  selectedDeviceId: string;
  onSelectDevice: (id: string) => void;
  volume: number;
  onChangeVolume: (v: number) => void;
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
  onOpenVoiceSettings,
  onClose,
  anchorRect,
}: AudioDeviceMenuProps): React.JSX.Element {
  const menuWidth = 220;
  const gap = 8;

  const bottom = window.innerHeight - anchorRect.top + gap;
  const rawLeft = anchorRect.left + anchorRect.width / 2 - menuWidth / 2;
  const left = Math.max(8, Math.min(rawLeft, window.innerWidth - menuWidth - 8));

  const isInput = mode === 'input';
  const volumeMax = 2;
  const volumePct = Math.round(volume * 100);
  const boosted = volume > 1;

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
        <input
          type="range"
          className="audio-menu__slider"
          min={0}
          max={volumeMax}
          step={0.05}
          value={volume}
          style={{ accentColor: boosted ? '#f59e0b' : undefined }}
          onChange={(e) => onChangeVolume(Number(e.target.value))}
        />
        <div className="audio-menu__vol-labels">
          <span>0%</span>
          <span>100%</span>
          <span>200%</span>
        </div>

        <hr className="audio-menu__divider" />

        <button className="audio-menu__settings-link" onClick={onOpenVoiceSettings}>
          <Settings size={11} />
          Voice Settings
        </button>
      </div>
    </>
  );
}
