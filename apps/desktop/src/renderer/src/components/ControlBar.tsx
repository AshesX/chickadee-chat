import type { LucideIcon } from 'lucide-react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  ScreenShareOff,
  Radio,
  Volume2,
  PhoneOff,
} from 'lucide-react';

type ButtonState = 'default' | 'active' | 'danger' | 'fade';

function ControlButton({
  icon: Icon,
  label,
  state = 'default',
  disabled,
  title,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  state?: ButtonState;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      className={`ctrl-btn ctrl-btn--${state}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <Icon size={17} />
      <span className="ctrl-btn__label">{label}</span>
    </button>
  );
}

interface ControlBarProps {
  micEnabled: boolean;
  hasMic: boolean;
  onToggleMic: () => void;
  cameraEnabled: boolean;
  onToggleCamera: () => void;
  sharingScreen: boolean;
  onToggleShare: () => void;
  pttOn: boolean;
  onTogglePtt: () => void;
  /** True while transmitting in push-to-talk mode (Mute button glows active). */
  transmitting: boolean;
  onVolume: () => void;
  onLeave: () => void;
}

export function ControlBar({
  micEnabled,
  hasMic,
  onToggleMic,
  cameraEnabled,
  onToggleCamera,
  sharingScreen,
  onToggleShare,
  pttOn,
  onTogglePtt,
  transmitting,
  onVolume,
  onLeave,
}: ControlBarProps): React.JSX.Element {
  return (
    <footer className="control-bar">
      <ControlButton
        icon={micEnabled ? Mic : MicOff}
        label={transmitting ? 'Transmitting' : micEnabled ? 'Mute' : 'Unmute'}
        state={transmitting ? 'active' : micEnabled ? 'default' : 'danger'}
        disabled={!hasMic}
        title={hasMic ? '' : 'No microphone'}
        onClick={onToggleMic}
      />
      <ControlButton
        icon={cameraEnabled ? VideoOff : Video}
        label={cameraEnabled ? 'Stop Cam' : 'Camera'}
        state={cameraEnabled ? 'active' : 'default'}
        onClick={onToggleCamera}
      />
      <ControlButton
        icon={sharingScreen ? ScreenShareOff : ScreenShare}
        label={sharingScreen ? 'Stop Share' : 'Share'}
        state={sharingScreen ? 'active' : 'default'}
        onClick={onToggleShare}
      />
      <ControlButton
        icon={Radio}
        label={pttOn ? 'PTT On' : 'Push-Talk'}
        state={pttOn ? 'active' : 'default'}
        onClick={onTogglePtt}
      />
      <ControlButton icon={Volume2} label="Volume" onClick={onVolume} />

      <div className="control-bar__divider" />

      <button className="leave-btn" onClick={onLeave}>
        <PhoneOff size={15} />
        Leave
      </button>
    </footer>
  );
}
