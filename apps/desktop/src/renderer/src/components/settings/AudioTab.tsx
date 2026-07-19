import type { AudioQuality } from '@chickadee/shared';
import { CustomSelect } from '../CustomSelect';
import { KeybindRow } from '../KeybindRow';
import { GATE_THRESHOLD_MIN, GATE_THRESHOLD_MAX } from '../../lib/audioGate';
import { computeAudioEncoding, formatBitrate } from '../../webrtc/encodingParams';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { SelectRow } from './SelectRow';
import { SliderRow } from './SliderRow';
import { SegmentedRow } from './SegmentedRow';
import { ToggleRow } from './ToggleRow';
import type { SettingsModalProps } from './types';

type AudioTabProps = Pick<
  SettingsModalProps,
  | 'inputDevices' | 'outputDevices'
  | 'inputDeviceId' | 'onChangeInputDevice'
  | 'outputDeviceId' | 'onChangeOutputDevice'
  | 'micVolume' | 'onChangeMicVolume'
  | 'outputVolume' | 'onChangeOutputVolume'
  | 'inputMode' | 'onChangeInputMode'
  | 'vadThreshold' | 'onChangeVadThreshold'
  | 'vadReleaseMs' | 'onChangeVadReleaseMs'
  | 'pttMode' | 'onChangePttMode'
  | 'pushToTalkKey' | 'onChangePushToTalkKey'
  | 'noiseSuppression' | 'onChangeNoiseSuppression'
  | 'echoCancellation' | 'onChangeEchoCancellation'
  | 'autoGainControl' | 'onChangeAutoGainControl'
  | 'normalizeVoices' | 'onChangeNormalizeVoices'
  | 'audioQuality' | 'onChangeAudioQuality'
  | 'analyserNode'
> & {
  micBars: React.MutableRefObject<Set<HTMLDivElement>>;
};

export function AudioTab({
  inputDevices,
  outputDevices,
  inputDeviceId,
  onChangeInputDevice,
  outputDeviceId,
  onChangeOutputDevice,
  micVolume,
  onChangeMicVolume,
  outputVolume,
  onChangeOutputVolume,
  inputMode,
  onChangeInputMode,
  vadThreshold,
  onChangeVadThreshold,
  vadReleaseMs,
  onChangeVadReleaseMs,
  pttMode,
  onChangePttMode,
  pushToTalkKey,
  onChangePushToTalkKey,
  noiseSuppression,
  onChangeNoiseSuppression,
  echoCancellation,
  onChangeEchoCancellation,
  autoGainControl,
  onChangeAutoGainControl,
  normalizeVoices,
  onChangeNormalizeVoices,
  audioQuality,
  onChangeAudioQuality,
  analyserNode,
  micBars,
}: AudioTabProps): React.JSX.Element {
  return (
    <>
      <SettingsSection id="section-devices" title="Devices" />

      <SettingsRow label="Input device (microphone)" hint="Select your active microphone.">
        <CustomSelect
          value={inputDeviceId}
          onChange={onChangeInputDevice}
          options={[
            { value: '', label: 'System Default' },
            ...inputDevices.map((d) => ({ value: d.deviceId, label: d.label })),
          ]}
          className="settings-device-select"
        />
      </SettingsRow>

      <SliderRow
        label="Mic volume"
        hint="Adjust mic level. >100% boosts gain and threshold sensitivity."
        slider={{
          min: 0,
          max: 2,
          step: 0.05,
          value: micVolume,
          onChange: onChangeMicVolume,
          boostFrom: 1.0,
          markers: [0, 0.5, 1.0, 1.5, 2.0],
          labels: [
            { value: 0, text: '0%' },
            { value: 1.0, text: '100% (Normal)' },
            { value: 2.0, text: '200%' },
          ],
          snapThreshold: 0.08,
        }}
        meter={{ bars: micBars, online: !!analyserNode }}
      />

      <SettingsRow label="Output device (speakers)" hint="Select your speakers or headphones.">
        <CustomSelect
          value={outputDeviceId}
          onChange={onChangeOutputDevice}
          options={[
            { value: '', label: 'System Default' },
            ...outputDevices.map((d) => ({ value: d.deviceId, label: d.label })),
          ]}
          className="settings-device-select"
        />
      </SettingsRow>

      <SliderRow
        label="Output volume"
        hint="Master volume for incoming audio. >100% may distort."
        slider={{
          min: 0,
          max: 2,
          step: 0.05,
          value: outputVolume,
          onChange: onChangeOutputVolume,
          boostFrom: 1.0,
          markers: [0, 0.5, 1.0, 1.5, 2.0],
          labels: [
            { value: 0, text: '0%' },
            { value: 1.0, text: '100%' },
            { value: 2.0, text: '200%' },
          ],
          snapThreshold: 0.04,
        }}
      />

      <hr className="settings-divider" />
      <SettingsSection id="section-input-mode" title="Input Mode" />

      <SegmentedRow
        label="How your mic transmits"
        hint="Voice: opens when speaking. Push-to-Talk: key press required."
        value={inputMode}
        onChange={onChangeInputMode}
        options={[
          { value: 'voice', label: 'Voice' },
          { value: 'ptt', label: 'Push-to-Talk' },
        ]}
      />

      {inputMode === 'voice' && (
        <>
          <SliderRow
            label="Voice threshold"
            hint="Minimum volume required to transmit. Higher requires louder speech."
            slider={{
              min: GATE_THRESHOLD_MIN,
              max: GATE_THRESHOLD_MAX,
              step: 0.001,
              value: vadThreshold,
              onChange: onChangeVadThreshold,
              markers: [GATE_THRESHOLD_MIN, 0.1, GATE_THRESHOLD_MAX],
              labels: [
                { value: GATE_THRESHOLD_MIN, text: 'Low' },
                { value: 0.1, text: 'Medium' },
                { value: GATE_THRESHOLD_MAX, text: 'High' },
              ],
              snapThreshold: 0.0005,
            }}
            meter={{ bars: micBars, online: !!analyserNode, threshold: vadThreshold }}
          />

          <SliderRow
            label="Voice hold time"
            hint={<>Duration mic stays open after speaking ends. <strong>Currently {vadReleaseMs} ms.</strong></>}
            slider={{
              value: vadReleaseMs,
              onChange: onChangeVadReleaseMs,
              snapValues: [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000],
              labels: [
                { value: 100, text: 'Short' },
                { value: 1000, text: 'Medium' },
                { value: 3000, text: 'Long' },
              ],
            }}
          />
        </>
      )}

      {inputMode === 'ptt' && (
        <>
          <SegmentedRow
            label="Push-to-talk mode"
            hint="Hold: live while pressed. Toggle: press to mute/unmute."
            value={pttMode}
            onChange={onChangePttMode}
            options={[
              { value: 'hold', label: 'Hold' },
              { value: 'toggle', label: 'Toggle' },
            ]}
          />

          <SettingsRow label="Push-to-talk key" hint="System-wide hotkey. Pick an unused key.">
            <KeybindRow value={pushToTalkKey} onChange={onChangePushToTalkKey} clearLabel="Push-to-talk keybind" />
          </SettingsRow>
        </>
      )}

      <hr className="settings-divider" />
      <SettingsSection id="section-processing" title="Processing" />

      <ToggleRow
        label="Noise suppression"
        hint="Removes steady background noise while speaking."
        value={noiseSuppression}
        onChange={onChangeNoiseSuppression}
      />
      <ToggleRow
        label="Echo cancellation"
        hint="Prevents mic from picking up speaker audio. Disable if using headphones."
        value={echoCancellation}
        onChange={onChangeEchoCancellation}
      />
      <ToggleRow
        label="Automatic gain control"
        hint="Automatically adjusts mic volume to a consistent level."
        value={autoGainControl}
        onChange={onChangeAutoGainControl}
      />
      <ToggleRow
        label="Normalize voices"
        hint="Auto-levels incoming audio. Boosts quiet users, tames loud ones."
        value={normalizeVoices}
        onChange={onChangeNormalizeVoices}
      />

      <hr className="settings-divider" />
      <SettingsSection id="section-voice-quality" title="Voice Quality" />

      <SelectRow
        label="Quality"
        hint="Caps outbound Opus bitrate for your voice. Lower tiers save bandwidth in busy rooms."
        value={audioQuality}
        onChange={(v) => onChangeAudioQuality(v as AudioQuality)}
        options={[
          { value: 'max', label: 'Maximum (stereo, uncapped)' },
          { value: 'high', label: 'High' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'saver', label: 'Data saver' },
        ]}
      />

      {(() => {
        const enc = computeAudioEncoding(audioQuality);
        const label = enc.maxAverageBitrate == null ? 'Uncapped' : formatBitrate(enc.maxAverageBitrate);
        return (
          <SettingsRow
            label="What this sends"
            hint={
              <>
                Voice: <strong>{label}</strong> · {enc.mono ? 'mono' : 'stereo'}<br />
                <em>Maximum</em> sends stereo Opus at full quality; lower tiers use mono to halve audio bandwidth.
              </>
            }
          />
        );
      })()}
    </>
  );
}
