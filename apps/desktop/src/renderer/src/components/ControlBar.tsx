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
  Headphones,
  HeadphoneOff,
  ChevronUp,
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
  onInputMenu: (rect: DOMRect) => void;
  cameraEnabled: boolean;
  onToggleCamera: () => void;
  sharingScreen: boolean;
  onToggleShare: () => void;
  inputMode: 'open' | 'voice' | 'ptt';
  /** Cycle Open Mic → Voice Activation → Push-to-Talk. */
  onCycleInputMode: () => void;
  onInputModeMenu: (rect: DOMRect) => void;
  /** True while actively transmitting (gated modes; Mute button glows active). */
  transmitting: boolean;
  onVolume: () => void;
  onLeave: () => void;
  deafened: boolean;
  onToggleDeafen: () => void;
  onOutputMenu: (rect: DOMRect) => void;
}

export function ControlBar({
  micEnabled,
  hasMic,
  onToggleMic,
  onInputMenu,
  cameraEnabled,
  onToggleCamera,
  sharingScreen,
  onToggleShare,
  inputMode,
  onCycleInputMode,
  onInputModeMenu,
  transmitting,
  onVolume,
  onLeave,
  deafened,
  onToggleDeafen,
  onOutputMenu,
}: ControlBarProps): React.JSX.Element {
  return (
    <footer className="control-bar">
      <div className="ctrl-group">
        <ControlButton
          icon={micEnabled ? Mic : MicOff}
          label={micEnabled ? 'Mute' : 'Unmute'}
          state={transmitting ? 'active' : micEnabled ? 'default' : 'danger'}
          disabled={!hasMic}
          title={hasMic ? '' : 'No microphone'}
          onClick={onToggleMic}
        />
        <button
          className="ctrl-btn--chevron"
          title="Input settings"
          onClick={(e) => onInputMenu(e.currentTarget.getBoundingClientRect())}
        >
          <ChevronUp size={11} />
        </button>
      </div>

      <div className="ctrl-group">
        <ControlButton
          icon={deafened ? HeadphoneOff : Headphones}
          label={deafened ? 'Undeafen' : 'Deafen'}
          state={deafened ? 'danger' : 'default'}
          onClick={onToggleDeafen}
        />
        <button
          className="ctrl-btn--chevron"
          title="Output settings"
          onClick={(e) => onOutputMenu(e.currentTarget.getBoundingClientRect())}
        >
          <ChevronUp size={11} />
        </button>
      </div>

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
      <div className="ctrl-group">
        <ControlButton
          icon={Radio}
          label={inputMode === 'ptt' ? 'Push-Talk' : inputMode === 'voice' ? 'Voice' : 'Open Mic'}
          state={inputMode === 'open' ? 'default' : 'active'}
          title="Click to cycle: Open Mic → Voice Activation → Push-to-Talk"
          onClick={onCycleInputMode}
        />
        <button
          className="ctrl-btn--chevron"
          title="Input mode settings"
          onClick={(e) => onInputModeMenu(e.currentTarget.getBoundingClientRect())}
        >
          <ChevronUp size={11} />
        </button>
      </div>
      <ControlButton icon={Volume2} label="Volume" onClick={onVolume} />

      <div className="control-bar__divider" />

      <button className="leave-btn" onClick={onLeave}>
        <PhoneOff size={15} />
        Leave
      </button>
    </footer>
  );
}
