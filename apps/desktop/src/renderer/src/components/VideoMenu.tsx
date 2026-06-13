import { Settings } from 'lucide-react';
import { CustomSelect } from './CustomSelect';

interface VideoMenuProps {
  cameraEnabled: boolean;
  onToggleCamera: () => void;
  sharingScreen: boolean;
  onToggleShare: () => void;
  cameraResolution: string;
  onChangeCameraResolution: (res: string) => void;
  cameraFramerate: string;
  onChangeCameraFramerate: (fps: string) => void;
  screenResolution: string;
  onChangeScreenResolution: (res: string) => void;
  screenFramerate: string;
  onChangeScreenFramerate: (fps: string) => void;
  onOpenVideoSettings: () => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

export function VideoMenu({
  cameraEnabled,
  onToggleCamera,
  sharingScreen,
  onToggleShare,
  cameraResolution,
  onChangeCameraResolution,
  cameraFramerate,
  onChangeCameraFramerate,
  screenResolution,
  onChangeScreenResolution,
  screenFramerate,
  onChangeScreenFramerate,
  onOpenVideoSettings,
  onClose,
  anchorRect,
}: VideoMenuProps): React.JSX.Element {
  const menuWidth = 240;
  const gap = 8;
  const bottom = window.innerHeight - anchorRect.top + gap;
  const rawLeft = anchorRect.left + anchorRect.width / 2 - menuWidth / 2;
  const left = Math.max(8, Math.min(rawLeft, window.innerWidth - menuWidth - 8));

  const cameraResolutionOptions = [
    { value: '480p', label: '480p' },
    { value: '720p', label: '720p' },
    { value: '1080p', label: '1080p' },
    { value: '1440p', label: '1440p' },
    { value: '4K', label: '4K' },
  ];

  const cameraFramerateOptions = [
    { value: '15', label: '15 fps' },
    { value: '30', label: '30 fps' },
    { value: '60', label: '60 fps' },
  ];

  const screenResolutionOptions = [
    { value: '720p', label: '720p' },
    { value: '1080p', label: '1080p' },
    { value: '1440p', label: '1440p' },
    { value: '4K', label: 'Unlimited (4K)' },
  ];

  const screenFramerateOptions = [
    { value: '15', label: '15 fps' },
    { value: '30', label: '30 fps' },
    { value: '60', label: '60 fps' },
  ];

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div
        className="audio-menu"
        style={{ bottom, left, width: menuWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Camera Section */}
        <div className="audio-menu__section-label">Camera</div>
        <button
          type="button"
          className={`seg-btn${cameraEnabled ? ' seg-btn--active' : ''}`}
          style={{ width: '100%', borderRadius: 'var(--radius-badge)', textAlign: 'center', marginBottom: 10 }}
          onClick={onToggleCamera}
        >
          {cameraEnabled ? 'Stop Camera' : 'Start Camera'}
        </button>

        <div className="audio-menu__section-label" style={{ marginBottom: 4 }}>Resolution</div>
        <CustomSelect
          value={cameraResolution}
          onChange={onChangeCameraResolution}
          options={cameraResolutionOptions}
          className="settings-device-select"
        />

        <div className="audio-menu__section-label" style={{ marginTop: 10, marginBottom: 4 }}>Framerate</div>
        <CustomSelect
          value={cameraFramerate}
          onChange={onChangeCameraFramerate}
          options={cameraFramerateOptions}
          className="settings-device-select"
        />

        <hr className="audio-menu__divider" />

        {/* Screen Share Section */}
        <div className="audio-menu__section-label">Screen Share</div>
        <button
          type="button"
          className={`seg-btn${sharingScreen ? ' seg-btn--active' : ''}`}
          style={{ width: '100%', borderRadius: 'var(--radius-badge)', textAlign: 'center', marginBottom: 10 }}
          onClick={onToggleShare}
        >
          {sharingScreen ? 'Stop Sharing' : 'Share Screen'}
        </button>

        <div className="audio-menu__section-label" style={{ marginBottom: 4 }}>Max Resolution</div>
        <CustomSelect
          value={screenResolution}
          onChange={onChangeScreenResolution}
          options={screenResolutionOptions}
          className="settings-device-select"
        />

        <div className="audio-menu__section-label" style={{ marginTop: 10, marginBottom: 4 }}>Max Framerate</div>
        <CustomSelect
          value={screenFramerate}
          onChange={onChangeScreenFramerate}
          options={screenFramerateOptions}
          className="settings-device-select"
        />

        <hr className="audio-menu__divider" />

        <button className="audio-menu__settings-link" onClick={onOpenVideoSettings}>
          <Settings size={11} />
          Video Settings
        </button>
      </div>
    </>
  );
}
