import type { VideoQuality } from '@chickadee/shared';
import type { SettingsModalProps } from './types';
import { Toggle } from './Toggle';
import { computeMeshEncoding, formatBitrate } from '../../webrtc/encodingParams';

type VideoTabProps = Pick<
  SettingsModalProps,
  | 'defaultVideoAction' | 'onChangeDefaultVideoAction'
  | 'hasCamera'
  | 'cameraFeatureEnabled' | 'onChangeCameraFeatureEnabled'
  | 'cameraResolution' | 'onChangeCameraResolution'
  | 'cameraFramerate' | 'onChangeCameraFramerate'
  | 'screenResolution' | 'onChangeScreenResolution'
  | 'screenFramerate' | 'onChangeScreenFramerate'
  | 'videoQuality' | 'onChangeVideoQuality'
>;

export function VideoTab({
  defaultVideoAction,
  onChangeDefaultVideoAction,
  hasCamera = true,
  cameraFeatureEnabled,
  onChangeCameraFeatureEnabled,
  cameraResolution,
  onChangeCameraResolution,
  cameraFramerate,
  onChangeCameraFramerate,
  screenResolution,
  onChangeScreenResolution,
  screenFramerate,
  onChangeScreenFramerate,
  videoQuality,
  onChangeVideoQuality,
}: VideoTabProps): React.JSX.Element {
  // Resolution/framerate controls only matter when the camera feature is on and a device exists.
  const cameraControlsEnabled = hasCamera && cameraFeatureEnabled;

  // Concrete per-stream caps the current tier + resolution/framerate produce, so
  // the Quality setting explains exactly what it changes (computed from the same
  // pure helper the mesh uses — no separate source of truth).
  const enc = computeMeshEncoding(cameraResolution, cameraFramerate, screenResolution, screenFramerate, videoQuality);
  const audioLabel =
    enc.audio.maxAverageBitrate == null ? 'Uncapped' : formatBitrate(enc.audio.maxAverageBitrate);

  return (
    <>
      <div id="section-video-quality" className="settings-subdivision">Streaming Quality</div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Quality</span>
          <span className="hint">
            Caps outbound bitrate for camera, screen, and voice. Lower tiers save bandwidth and CPU in busy rooms.
          </span>
        </div>
        <select
          className="welcome__input"
          value={videoQuality}
          onChange={(e) => onChangeVideoQuality(e.target.value as VideoQuality)}
          style={{ width: 'auto' }}
        >
          <option value="max">Maximum (uncapped)</option>
          <option value="high">High</option>
          <option value="balanced">Balanced</option>
          <option value="saver">Data saver</option>
        </select>
      </div>

      <div className="settings-row">
        <div className="settings-row__label" style={{ flex: 1 }}>
          <span>What this sends</span>
          <span className="hint">
            {cameraFeatureEnabled && (
              <>
                Camera: <strong>{formatBitrate(enc.camera.maxBitrate)}</strong> · {cameraResolution} · {enc.camera.maxFramerate} fps<br />
              </>
            )}
            Screen: <strong>{formatBitrate(enc.screen.maxBitrate)}</strong> · {screenResolution} · {enc.screen.maxFramerate} fps · maintains resolution<br />
            Voice: <strong>{audioLabel}</strong> · {enc.audio.mono ? 'mono' : 'stereo'}<br />
            <em>Maximum</em> leaves video uncapped (Chromium decides); lower tiers trade sharpness for bandwidth &amp; CPU.
          </span>
        </div>
      </div>

      <hr className="settings-divider" />

      <div id="section-video-default" className="settings-subdivision">Room Video Button</div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Default action</span>
          <span className="hint">Action when clicking Video button while inactive.</span>
        </div>
        <div className="seg-group">
          <button
            className={`seg-btn${defaultVideoAction === 'screen' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeDefaultVideoAction('screen')}
          >Screen Share</button>
          <button
            className={`seg-btn${defaultVideoAction === 'camera' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeDefaultVideoAction('camera')}
          >Camera</button>
        </div>
      </div>

      <hr className="settings-divider" />

      <div id="section-camera" className="settings-subdivision" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
        <span>Camera</span>
        {!hasCamera && (
          <span style={{ color: 'var(--red)', fontSize: 'var(--fs-1)', fontWeight: 'var(--fw-2)', textTransform: 'initial' }}>
            (No camera detected)
          </span>
        )}
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Enable camera</span>
          <span className="hint">Show the camera option in room video controls.</span>
        </div>
        <Toggle on={cameraFeatureEnabled} onClick={() => onChangeCameraFeatureEnabled(!cameraFeatureEnabled)} />
      </div>

      <div className="settings-row" style={{ opacity: cameraControlsEnabled ? 1 : 0.5, pointerEvents: cameraControlsEnabled ? undefined : 'none' }}>
        <div className="settings-row__label">
          <span>Streaming resolution</span>
          <span className="hint">Higher resolutions require more bandwidth.</span>
        </div>
        <select
          className="welcome__input"
          value={cameraResolution}
          onChange={(e) => onChangeCameraResolution(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="480p">480p</option>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
          <option value="1440p">1440p</option>
          <option value="4K">4K</option>
        </select>
      </div>

      <div className="settings-row" style={{ opacity: cameraControlsEnabled ? 1 : 0.5, pointerEvents: cameraControlsEnabled ? undefined : 'none' }}>
        <div className="settings-row__label">
          <span>Framerate</span>
          <span className="hint">Camera stream framerate.</span>
        </div>
        <select
          className="welcome__input"
          value={cameraFramerate}
          onChange={(e) => onChangeCameraFramerate(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="15">15 fps</option>
          <option value="30">30 fps</option>
          <option value="60">60 fps</option>
        </select>
      </div>

      <hr className="settings-divider" />
      <div id="section-screen-share" className="settings-subdivision">Screen Share</div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Screen resolution limit</span>
          <span className="hint">Maximum resolution for screen sharing.</span>
        </div>
        <select
          className="welcome__input"
          value={screenResolution}
          onChange={(e) => onChangeScreenResolution(e.target.value)}
          style={{ width: 'auto' }}
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
          <span className="hint">Maximum framerate for screen sharing.</span>
        </div>
        <select
          className="welcome__input"
          value={screenFramerate}
          onChange={(e) => onChangeScreenFramerate(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="15">15 fps</option>
          <option value="30">30 fps</option>
          <option value="60">60 fps</option>
        </select>
      </div>
    </>
  );
}
