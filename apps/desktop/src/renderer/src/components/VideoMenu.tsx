import { Settings } from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { ChevronMenu } from './ChevronMenu';

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
  hasCamera: boolean;
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
  hasCamera,
}: VideoMenuProps): React.JSX.Element {
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
    <ChevronMenu anchorRect={anchorRect} onClose={onClose} width={240} className="audio-menu menu-surface">
        {/* Camera Section */}
        {hasCamera && (
          <>
            <div className="label">Camera</div>
            <button
              type="button"
              className={`seg-btn${cameraEnabled ? ' seg-btn--active' : ''}`}
              style={{ width: '100%', borderRadius: 'var(--r-1)', textAlign: 'center', marginBottom: 'var(--s-2)' }}
              onClick={onToggleCamera}
            >
              {cameraEnabled ? 'Stop Camera' : 'Start Camera'}
            </button>

            <div className="label" style={{ marginBottom: 'var(--s-1)' }}>Resolution</div>
            <CustomSelect
              value={cameraResolution}
              onChange={onChangeCameraResolution}
              options={cameraResolutionOptions}
              className="settings-device-select"
            />

            <div className="label" style={{ marginTop: 'var(--s-2)', marginBottom: 'var(--s-1)' }}>Framerate</div>
            <CustomSelect
              value={cameraFramerate}
              onChange={onChangeCameraFramerate}
              options={cameraFramerateOptions}
              className="settings-device-select"
            />

            <hr className="audio-menu__divider" />
          </>
        )}

        {/* Screen Share Section */}
        <div className="label">Screen Share</div>
        <button
          type="button"
          className={`seg-btn${sharingScreen ? ' seg-btn--active' : ''}`}
          style={{ width: '100%', borderRadius: 'var(--r-1)', textAlign: 'center', marginBottom: 'var(--s-2)' }}
          onClick={onToggleShare}
        >
          {sharingScreen ? 'Stop Sharing' : 'Share Screen'}
        </button>

        <div className="label" style={{ marginBottom: 'var(--s-1)' }}>Max Resolution</div>
        <CustomSelect
          value={screenResolution}
          onChange={onChangeScreenResolution}
          options={screenResolutionOptions}
          className="settings-device-select"
        />

        <div className="label" style={{ marginTop: 'var(--s-2)', marginBottom: 'var(--s-1)' }}>Max Framerate</div>
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
    </ChevronMenu>
  );
}
