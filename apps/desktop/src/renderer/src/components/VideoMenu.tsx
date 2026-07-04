import { Settings } from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { ChevronMenu } from './ChevronMenu';

interface VideoMenuProps {

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
  activeVideoMode: 'camera' | 'screen';
  onSelectVideoMode: (mode: 'camera' | 'screen') => void;
}

export function VideoMenu({

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
  activeVideoMode,
  onSelectVideoMode,
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
        <div style={{ display: 'flex', gap: 'var(--s-1)', marginBottom: 'var(--s-2)' }}>
          <button
            type="button"
            className={`seg-btn${activeVideoMode === 'screen' ? ' seg-btn--active' : ''}`}
            style={{ flex: 1, borderRadius: 'var(--r-1)', textAlign: 'center' }}
            onClick={() => onSelectVideoMode('screen')}
          >
            Screen
          </button>
          <button
            type="button"
            className={`seg-btn${activeVideoMode === 'camera' ? ' seg-btn--active' : ''}`}
            style={{ flex: 1, borderRadius: 'var(--r-1)', textAlign: 'center' }}
            onClick={() => onSelectVideoMode('camera')}
          >
            Camera
          </button>
        </div>

        {activeVideoMode === 'camera' && hasCamera ? (
          <>
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
          </>
        ) : (
          <>
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
          </>
        )}

        <hr className="audio-menu__divider" />

        <button className="audio-menu__settings-link" onClick={onOpenVideoSettings}>
          <Settings size={11} />
          Video Settings
        </button>
    </ChevronMenu>
  );
}
