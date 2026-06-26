import type { SettingsModalProps } from './types';

type VideoTabProps = Pick<
  SettingsModalProps,
  | 'defaultVideoAction' | 'onChangeDefaultVideoAction'
  | 'hasCamera'
  | 'cameraResolution' | 'onChangeCameraResolution'
  | 'cameraFramerate' | 'onChangeCameraFramerate'
  | 'screenResolution' | 'onChangeScreenResolution'
  | 'screenFramerate' | 'onChangeScreenFramerate'
>;

export function VideoTab({
  defaultVideoAction,
  onChangeDefaultVideoAction,
  hasCamera = true,
  cameraResolution,
  onChangeCameraResolution,
  cameraFramerate,
  onChangeCameraFramerate,
  screenResolution,
  onChangeScreenResolution,
  screenFramerate,
  onChangeScreenFramerate,
}: VideoTabProps): React.JSX.Element {
  return (
    <>
      <div id="section-video-default" className="settings-subdivision">Room Video Button</div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Default action</span>
          <span className="settings-row__hint">Action when clicking Video button while inactive.</span>
        </div>
        <div className="seg-group">
          <button
            className={`seg-btn${defaultVideoAction === 'camera' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeDefaultVideoAction('camera')}
          >Camera</button>
          <button
            className={`seg-btn${defaultVideoAction === 'screen' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeDefaultVideoAction('screen')}
          >Screen Share</button>
        </div>
      </div>

      <hr className="settings-divider" />

      <div id="section-camera" className="settings-subdivision" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>Camera Constraints</span>
        {!hasCamera && (
          <span style={{ color: 'var(--danger-text)', fontSize: '11px', fontWeight: 600, textTransform: 'initial' }}>
            (No camera detected)
          </span>
        )}
      </div>

      <div className="settings-row" style={{ opacity: hasCamera ? 1 : 0.5, pointerEvents: hasCamera ? undefined : 'none' }}>
        <div className="settings-row__label">
          <span>Streaming resolution</span>
          <span className="settings-row__hint">Higher resolutions require more bandwidth.</span>
        </div>
        <select
          className="welcome__input"
          value={cameraResolution}
          onChange={(e) => onChangeCameraResolution(e.target.value)}
          style={{ width: 'auto', padding: '6px 12px' }}
        >
          <option value="480p">480p</option>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
          <option value="1440p">1440p</option>
          <option value="4K">4K</option>
        </select>
      </div>

      <div className="settings-row" style={{ opacity: hasCamera ? 1 : 0.5, pointerEvents: hasCamera ? undefined : 'none' }}>
        <div className="settings-row__label">
          <span>Framerate</span>
          <span className="settings-row__hint">Camera stream framerate.</span>
        </div>
        <select
          className="welcome__input"
          value={cameraFramerate}
          onChange={(e) => onChangeCameraFramerate(e.target.value)}
          style={{ width: 'auto', padding: '6px 12px' }}
        >
          <option value="15">15 fps</option>
          <option value="30">30 fps</option>
          <option value="60">60 fps</option>
        </select>
      </div>

      <hr className="settings-divider" />
      <div id="section-screen-share" className="settings-subdivision">Screen Share Constraints</div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Screen resolution limit</span>
          <span className="settings-row__hint">Maximum resolution for screen sharing.</span>
        </div>
        <select
          className="welcome__input"
          value={screenResolution}
          onChange={(e) => onChangeScreenResolution(e.target.value)}
          style={{ width: 'auto', padding: '6px 12px' }}
        >
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
          <option value="1440p">1440p</option>
          <option value="4K">Unlimited (4K)</option>
        </select>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Screen framerate limit</span>
          <span className="settings-row__hint">Maximum framerate for screen sharing.</span>
        </div>
        <select
          className="welcome__input"
          value={screenFramerate}
          onChange={(e) => onChangeScreenFramerate(e.target.value)}
          style={{ width: 'auto', padding: '6px 12px' }}
        >
          <option value="15">15 fps</option>
          <option value="30">30 fps</option>
          <option value="60">60 fps</option>
        </select>
      </div>
    </>
  );
}
