import type { LucideIcon } from 'lucide-react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  ScreenShareOff,
  PhoneOff,
  Headphones,
  HeadphoneOff,
  ChevronUp,
  Smile,
} from 'lucide-react';
import { INPUT_MODE_ICONS } from '../lib/inputModeIcons';

type ButtonState = 'default' | 'active' | 'leave' | 'fade';

function ControlButton({
  icon: Icon,
  label,
  state = 'default',
  disabled,
  title,
  onClick,
  speaking,
}: {
  icon: LucideIcon;
  label: string;
  state?: ButtonState;
  disabled?: boolean;
  title?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  speaking?: boolean;
}): React.JSX.Element {
  return (
    <button
      className={`ctrl-btn ctrl-btn--${state}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <Icon size={16} className={speaking ? 'ctrl-btn__icon--speaking' : undefined} />
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
  onVideoMenu: (rect: DOMRect) => void;
  activeVideoMode: 'camera' | 'screen';
  inputMode: 'voice' | 'ptt';
  /** Cycle Voice Activation → Push-to-Talk. */
  onCycleInputMode: () => void;
  onInputModeMenu: (rect: DOMRect) => void;
  onReactMenu: (rect: DOMRect) => void;
  onLeave: () => void;
  deafened: boolean;
  onToggleDeafen: () => void;
  onOutputMenu: (rect: DOMRect) => void;
  onMouseEnterReact?: () => void;
  onMouseLeaveReact?: () => void;
  selfSpeaking: boolean;
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
  onVideoMenu,
  activeVideoMode,
  inputMode,
  onCycleInputMode,
  onInputModeMenu,
  onReactMenu,
  onLeave,
  deafened,
  onToggleDeafen,
  onOutputMenu,
  onMouseEnterReact,
  onMouseLeaveReact,
  selfSpeaking,
}: ControlBarProps): React.JSX.Element {
  return (
    <div className="control-bar-dock">
      <footer className="control-bar">
        <div className="ctrl-group">
          <ControlButton
            icon={micEnabled ? Mic : MicOff}
            label={micEnabled ? 'Mute' : 'Unmute'}
            state={micEnabled ? 'default' : 'active'}
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
            state={deafened ? 'active' : 'default'}
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

        <div className="control-bar__divider" />

        <div className="ctrl-group">
          <ControlButton
            icon={INPUT_MODE_ICONS[inputMode]}
            label={inputMode === 'ptt' ? 'Push-Talk' : 'Voice'}
            state="default"
            title="Click to cycle: Voice Activation → Push-to-Talk"
            onClick={onCycleInputMode}
            speaking={selfSpeaking}
          />
          <button
            className="ctrl-btn--chevron"
            title="Input mode settings"
            onClick={(e) => onInputModeMenu(e.currentTarget.getBoundingClientRect())}
          >
            <ChevronUp size={11} />
          </button>
        </div>

        <div className="ctrl-group">
          <ControlButton
            icon={cameraEnabled ? VideoOff : (sharingScreen ? ScreenShareOff : (activeVideoMode === 'screen' ? ScreenShare : Video))}
            label={cameraEnabled ? 'Stop Cam' : (sharingScreen ? 'Stop Share' : (activeVideoMode === 'screen' ? 'Share' : 'Camera'))}
            state={(cameraEnabled || sharingScreen) ? 'active' : 'default'}
            onClick={() => {
              if (cameraEnabled) {
                onToggleCamera();
              } else if (sharingScreen) {
                onToggleShare();
              } else {
                if (activeVideoMode === 'screen') {
                  onToggleShare();
                } else {
                  onToggleCamera();
                }
              }
            }}
          />
          <button
            className="ctrl-btn--chevron"
            title="Video settings"
            onClick={(e) => onVideoMenu(e.currentTarget.getBoundingClientRect())}
          >
            <ChevronUp size={11} />
          </button>
        </div>

        <div className="control-bar__divider" />

        <div
          onMouseEnter={onMouseEnterReact}
          onMouseLeave={onMouseLeaveReact}
          style={{ display: 'flex' }}
        >
          <ControlButton
            icon={Smile}
            label="React"
            onClick={(e) => onReactMenu(e.currentTarget.getBoundingClientRect())}
          />
        </div>

        <div className="control-bar__divider" />

        <ControlButton icon={PhoneOff} label="Leave" state="leave" onClick={onLeave} />
      </footer>
    </div>
  );
}
