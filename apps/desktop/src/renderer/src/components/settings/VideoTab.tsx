import type { VideoQuality } from '@chickadee/shared';
import type { SettingsModalProps } from './types';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { SelectRow } from './SelectRow';
import { SegmentedRow } from './SegmentedRow';
import { ToggleRow } from './ToggleRow';
import { computeVideoEncoding, formatBitrate } from '../../webrtc/encodingParams';

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
  const cameraControlsEnabled = hasCamera && cameraFeatureEnabled;

  const camEnc = computeVideoEncoding('camera', cameraResolution, cameraFramerate, videoQuality);
  const scrEnc = computeVideoEncoding('screen', screenResolution, screenFramerate, videoQuality);

  return (
    <>
      <SettingsSection id="section-video-quality" title="Video Quality" />

      <SelectRow
        label="Quality"
        hint="Caps outbound bitrate for camera and screen share. Lower tiers save bandwidth and CPU in busy rooms."
        value={videoQuality}
        onChange={(v) => onChangeVideoQuality(v as VideoQuality)}
        options={[
          { value: 'max', label: 'Maximum (uncapped)' },
          { value: 'high', label: 'High' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'saver', label: 'Data saver' },
        ]}
      />

      <SettingsRow
        label="What this sends"
        hint={
          <>
            {cameraFeatureEnabled && (
              <>
                Camera: <strong>{formatBitrate(camEnc.maxBitrate)}</strong> · {cameraResolution} · {camEnc.maxFramerate} fps<br />
              </>
            )}
            Screen: <strong>{formatBitrate(scrEnc.maxBitrate)}</strong> · {screenResolution} · {scrEnc.maxFramerate} fps · maintains resolution<br />
            <em>Maximum</em> leaves video uncapped; lower tiers trade sharpness for bandwidth &amp; CPU.
          </>
        }
      />

      <hr className="settings-divider" />

      <div id="section-camera" className="settings-subdivision" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
        <span>Camera</span>
        {!hasCamera && (
          <span style={{ color: 'var(--red)', fontSize: 'var(--fs-1)', fontWeight: 'var(--fw-2)', textTransform: 'initial' }}>
            (No camera detected)
          </span>
        )}
      </div>

      <ToggleRow
        label="Enable camera"
        hint="Show the camera option in room video controls."
        value={cameraFeatureEnabled}
        onChange={onChangeCameraFeatureEnabled}
      />

      <SelectRow
        label="Streaming resolution"
        hint="Higher resolutions require more bandwidth."
        value={cameraResolution}
        onChange={onChangeCameraResolution}
        disabled={!cameraControlsEnabled}
        options={[
          { value: '480p', label: '480p' },
          { value: '720p', label: '720p' },
          { value: '1080p', label: '1080p' },
          { value: '1440p', label: '1440p' },
          { value: '4K', label: '4K' },
        ]}
      />

      <SelectRow
        label="Framerate"
        hint="Camera stream framerate."
        value={cameraFramerate}
        onChange={onChangeCameraFramerate}
        disabled={!cameraControlsEnabled}
        options={[
          { value: '15', label: '15 fps' },
          { value: '30', label: '30 fps' },
          { value: '60', label: '60 fps' },
        ]}
      />

      <hr className="settings-divider" />
      <SettingsSection id="section-screen-share" title="Screen Share" />

      <SelectRow
        label="Screen resolution limit"
        hint="Maximum resolution for screen sharing."
        value={screenResolution}
        onChange={onChangeScreenResolution}
        options={[
          { value: '720p', label: '720p' },
          { value: '1080p', label: '1080p' },
          { value: '1440p', label: '1440p' },
          { value: '4K', label: 'Unlimited (4K)' },
        ]}
      />

      <SelectRow
        label="Screen framerate limit"
        hint="Maximum framerate for screen sharing."
        value={screenFramerate}
        onChange={onChangeScreenFramerate}
        options={[
          { value: '15', label: '15 fps' },
          { value: '30', label: '30 fps' },
          { value: '60', label: '60 fps' },
        ]}
      />

      <hr className="settings-divider" />

      <SettingsSection id="section-video-default" title="Room Video Button" />

      <SegmentedRow
        label="Default action"
        hint="Action when clicking Video button while inactive."
        value={defaultVideoAction}
        onChange={onChangeDefaultVideoAction}
        options={[
          { value: 'screen', label: 'Screen Share' },
          { value: 'camera', label: 'Camera' },
        ]}
      />
    </>
  );
}
