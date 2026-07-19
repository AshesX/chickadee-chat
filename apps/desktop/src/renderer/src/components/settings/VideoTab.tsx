import type { VideoQuality } from '@chickadee/shared';
import type { SettingsModalProps } from './types';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { SelectRow } from './SelectRow';

import { computeVideoEncoding, formatBitrate } from '../../webrtc/encodingParams';

type VideoTabProps = Pick<
  SettingsModalProps,

  | 'hasCamera'

  | 'cameraResolution' | 'onChangeCameraResolution'
  | 'cameraFramerate' | 'onChangeCameraFramerate'
  | 'screenResolution' | 'onChangeScreenResolution'
  | 'screenFramerate' | 'onChangeScreenFramerate'
  | 'videoQuality' | 'onChangeVideoQuality'
  | 'uploadBudgetMbps' | 'onChangeUploadBudgetMbps'
>;

export function VideoTab({

  hasCamera = true,

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
  uploadBudgetMbps,
  onChangeUploadBudgetMbps,
}: VideoTabProps): React.JSX.Element {
  const cameraControlsEnabled = hasCamera;

  // Stage (spotlighted) per-viewer caps and the compressed gallery thumbnail cap.
  const camEnc = computeVideoEncoding('camera', cameraResolution, cameraFramerate, videoQuality, 'stage');
  const scrEnc = computeVideoEncoding('screen', screenResolution, screenFramerate, videoQuality, 'stage');
  const thumbEnc = computeVideoEncoding('camera', cameraResolution, cameraFramerate, videoQuality, 'thumbnail');
  const budgetLabel = uploadBudgetMbps > 0 ? `${uploadBudgetMbps} Mbps` : 'Unlimited';

  return (
    <>
      <SettingsSection id="section-video-quality" title="Video Quality" />

      <SelectRow
        label="Quality"
        hint={<><strong>Per-stream</strong> bitrate ceiling for stage camera or screen. Lower tiers save bandwidth and CPU.</>}
        value={videoQuality}
        onChange={(v) => onChangeVideoQuality(v as VideoQuality)}
        options={[
          { value: 'max', label: 'Maximum (uncapped)' },
          { value: 'high', label: 'High' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'saver', label: 'Data saver' },
        ]}
      />

      <SelectRow
        label="Upload limit"
        hint={<><strong>Total outbound</strong> bandwidth, shared across all viewers. Bitrate drops automatically as the room fills.</>}
        value={String(uploadBudgetMbps)}
        onChange={(v) => onChangeUploadBudgetMbps(Number(v))}
        options={[
          { value: '5', label: '5 Mbps' },
          { value: '10', label: '10 Mbps' },
          { value: '12', label: '12 Mbps (recommended)' },
          { value: '20', label: '20 Mbps' },
          { value: '30', label: '30 Mbps' },
          { value: '50', label: '50 Mbps' },
          { value: '0', label: 'Unlimited (tier cap only)' },
        ]}
      />

      <SettingsRow
        label="What this sends"
        hint={
          <>
            On the <strong>stage</strong> (spotlighted): screen up to <strong>{formatBitrate(scrEnc.maxBitrate)}</strong> · {screenResolution} · {scrEnc.maxFramerate} fps
            {hasCamera && (
              <> · camera up to <strong>{formatBitrate(camEnc.maxBitrate)}</strong> · {cameraResolution} · {camEnc.maxFramerate} fps</>
            )}
            <br />
            In the <strong>gallery</strong>: other webcams compress to <strong>~{formatBitrate(thumbEnc.maxBitrate)}</strong> each.<br />
            Total stage upload stays under <strong>{budgetLabel}</strong>, split across viewers as the room fills.
          </>
        }
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

      <div id="section-camera" className="settings-subdivision" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
        <span>Camera</span>
        {!hasCamera && (
          <span style={{ color: 'var(--red)', fontSize: 'var(--fs-1)', fontWeight: 'var(--fw-2)', textTransform: 'initial' }}>
            (No camera detected)
          </span>
        )}
      </div>



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

    </>
  );
}
