import { X } from 'lucide-react';
import { CustomSelect } from '../CustomSelect';
import { SettingsSlider } from '../SettingsSlider';
import { GATE_THRESHOLD_MIN, GATE_THRESHOLD_MAX } from '../../lib/audioGate';
import { Toggle } from './Toggle';
import { MicLevelMeter } from './MicMeter';
import type { KeyCapture, SettingsModalProps } from './types';

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
  | 'openMicNoiseReductionEnabled' | 'onChangeOpenMicNoiseReductionEnabled'
  | 'openMicThreshold' | 'onChangeOpenMicThreshold'
  | 'openMicReductionDb' | 'onChangeOpenMicReductionDb'
  | 'openMicReleaseMs' | 'onChangeOpenMicReleaseMs'
  | 'pttMode' | 'onChangePttMode'
  | 'pushToTalkKey' | 'onChangePushToTalkKey'
  | 'noiseSuppression' | 'onChangeNoiseSuppression'
  | 'echoCancellation' | 'onChangeEchoCancellation'
  | 'autoGainControl' | 'onChangeAutoGainControl'
  | 'normalizeVoices' | 'onChangeNormalizeVoices'
  | 'analyserNode'
> & {
  micBars: React.MutableRefObject<Set<HTMLDivElement>>;
  keyCapture: KeyCapture;
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
  openMicNoiseReductionEnabled,
  onChangeOpenMicNoiseReductionEnabled,
  openMicThreshold,
  onChangeOpenMicThreshold,
  openMicReductionDb,
  onChangeOpenMicReductionDb,
  openMicReleaseMs,
  onChangeOpenMicReleaseMs,
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
  analyserNode,
  micBars,
  keyCapture,
}: AudioTabProps): React.JSX.Element {
  const { capturing, startCapture, onRebindKey } = keyCapture;

  return (
    <>
      <div id="section-devices" className="settings-subdivision">Devices</div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Input device (microphone)</span>
          <span className="settings-row__hint">Select your active microphone.</span>
        </div>
        <CustomSelect
          value={inputDeviceId}
          onChange={onChangeInputDevice}
          options={[
            { value: '', label: 'System Default' },
            ...inputDevices.map((d) => ({ value: d.deviceId, label: d.label })),
          ]}
          className="settings-device-select"
        />
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Mic volume</span>
          <span className="settings-row__hint">Adjust mic level. &gt;100% boosts gain and threshold sensitivity.</span>
        </div>
        <div className="mic-control-wrap">
          <SettingsSlider
            min={0}
            max={2}
            step={0.05}
            value={micVolume}
            onChange={onChangeMicVolume}
            boostFrom={1.0}
            markers={[0, 0.5, 1.0, 1.5, 2.0]}
            labels={[
              { value: 0, text: '0%' },
              { value: 1.0, text: '100% (Normal)' },
              { value: 2.0, text: '200%' }
            ]}
            snapThreshold={0.08}
          />
          <MicLevelMeter bars={micBars} online={!!analyserNode} />
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Output device (speakers)</span>
          <span className="settings-row__hint">Select your speakers or headphones.</span>
        </div>
        <CustomSelect
          value={outputDeviceId}
          onChange={onChangeOutputDevice}
          options={[
            { value: '', label: 'System Default' },
            ...outputDevices.map((d) => ({ value: d.deviceId, label: d.label })),
          ]}
          className="settings-device-select"
        />
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Output volume</span>
          <span className="settings-row__hint">Master volume for incoming audio. &gt;100% may distort.</span>
        </div>
        <SettingsSlider
          min={0}
          max={2}
          step={0.05}
          value={outputVolume}
          onChange={onChangeOutputVolume}
          boostFrom={1.0}
          markers={[0, 0.5, 1.0, 1.5, 2.0]}
          labels={[
            { value: 0, text: '0%' },
            { value: 1.0, text: '100%' },
            { value: 2.0, text: '200%' },
          ]}
          snapThreshold={0.04}
        />
      </div>

      <hr className="settings-divider" />
      <div id="section-input-mode" className="settings-subdivision">Input Mode</div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>How your mic transmits</span>
          <span className="settings-row__hint">Open Mic: always live. Voice: opens when speaking. PTT: key press required.</span>
        </div>
        <div className="seg-group">
          <button
            className={`seg-btn${inputMode === 'open' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeInputMode('open')}
          >Open Mic</button>
          <button
            className={`seg-btn${inputMode === 'voice' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeInputMode('voice')}
          >Voice</button>
          <button
            className={`seg-btn${inputMode === 'ptt' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeInputMode('ptt')}
          >Push-to-Talk</button>
        </div>
      </div>

      {inputMode === 'voice' && (
        <>
          <div className="settings-row">
            <div className="settings-row__label">
              <span>Voice threshold</span>
              <span className="settings-row__hint">Minimum volume required to transmit. Higher requires louder speech.</span>
            </div>
            <div className="mic-control-wrap">
              <SettingsSlider
                min={GATE_THRESHOLD_MIN}
                max={GATE_THRESHOLD_MAX}
                step={0.001}
                value={vadThreshold}
                onChange={onChangeVadThreshold}
                markers={[GATE_THRESHOLD_MIN, 0.1, GATE_THRESHOLD_MAX]}
                labels={[
                  { value: GATE_THRESHOLD_MIN, text: 'Low' },
                  { value: 0.1, text: 'Medium' },
                  { value: GATE_THRESHOLD_MAX, text: 'High' },
                ]}
                snapThreshold={0.0005}
              />
              <MicLevelMeter bars={micBars} online={!!analyserNode} threshold={vadThreshold} />
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row__label">
              <span>Voice hold time</span>
              <span className="settings-row__hint">Duration mic stays open after speaking ends. <strong>Currently {vadReleaseMs} ms.</strong></span>
            </div>
            <SettingsSlider
              value={vadReleaseMs}
              onChange={onChangeVadReleaseMs}
              snapValues={[100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000]}
              labels={[
                { value: 100, text: 'Short' },
                { value: 1000, text: 'Medium' },
                { value: 3000, text: 'Long' },
              ]}
            />
          </div>
        </>
      )}

      {inputMode === 'open' && (
        <>
          <div className="settings-row">
            <div className="settings-row__label">
              <span>Noise gate</span>
              <span className="settings-row__hint">Mutes mic when not speaking to hide background noise. Turn off for raw mic.</span>
            </div>
            <Toggle on={openMicNoiseReductionEnabled} onClick={() => onChangeOpenMicNoiseReductionEnabled(!openMicNoiseReductionEnabled)} />
          </div>

          {openMicNoiseReductionEnabled && (
            <>
              <div className="settings-row">
                <div className="settings-row__label">
                  <span>Speech threshold</span>
                  <span className="settings-row__hint">Volume required to open gate. Bar must pass line.</span>
                </div>
                <div className="mic-control-wrap">
                  <SettingsSlider
                    min={GATE_THRESHOLD_MIN}
                    max={GATE_THRESHOLD_MAX}
                    step={0.001}
                    value={openMicThreshold}
                    onChange={onChangeOpenMicThreshold}
                    markers={[GATE_THRESHOLD_MIN, 0.1, GATE_THRESHOLD_MAX]}
                    labels={[
                      { value: GATE_THRESHOLD_MIN, text: 'Low' },
                      { value: 0.1, text: 'Medium' },
                      { value: GATE_THRESHOLD_MAX, text: 'High' },
                    ]}
                    snapThreshold={0.0005}
                  />
                  <MicLevelMeter bars={micBars} online={!!analyserNode} threshold={openMicThreshold} />
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row__label">
                  <span>Reduction amount</span>
                  <span className="settings-row__hint">Amount to reduce background noise. {openMicReductionDb} dB{openMicReductionDb <= -40 ? ' (near silent)' : ''}.</span>
                </div>
                <SettingsSlider
                  min={-40}
                  max={-10}
                  step={5}
                  value={openMicReductionDb}
                  onChange={onChangeOpenMicReductionDb}
                  markers={[-40, -30, -20, -10]}
                  labels={[
                    { value: -10, text: 'Gentle' },
                    { value: -40, text: 'Strong' },
                  ]}
                  snapThreshold={4}
                />
              </div>

              <div className="settings-row">
                <div className="settings-row__label">
                  <span>Gate hold time</span>
                  <span className="settings-row__hint">Duration gate remains open after speaking ends. Currently {openMicReleaseMs} ms.</span>
                </div>
                <SettingsSlider
                  value={openMicReleaseMs}
                  onChange={onChangeOpenMicReleaseMs}
                  snapValues={[100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000]}
                  labels={[
                    { value: 100, text: 'Short' },
                    { value: 1000, text: 'Medium' },
                    { value: 3000, text: 'Long' },
                  ]}
                />
              </div>
            </>
          )}
        </>
      )}

      {inputMode === 'ptt' && (
        <>
          <div className="settings-row">
            <div className="settings-row__label">
              <span>Push-to-talk mode</span>
              <span className="settings-row__hint">Hold: live while pressed. Toggle: press to mute/unmute.</span>
            </div>
            <div className="seg-group">
              <button
                className={`seg-btn${pttMode === 'hold' ? ' seg-btn--active' : ''}`}
                onClick={() => onChangePttMode('hold')}
              >Hold</button>
              <button
                className={`seg-btn${pttMode === 'toggle' ? ' seg-btn--active' : ''}`}
                onClick={() => onChangePttMode('toggle')}
              >Toggle</button>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row__label">
              <span>Push-to-talk key</span>
              <span className="settings-row__hint">System-wide hotkey. Pick an unused key.</span>
            </div>
            <div className="keybind-row">
              <button
                className={`rebind${capturing === 'ptt' ? ' rebind--active' : ''}`}
                onClick={() => startCapture('ptt')}
                onKeyDown={capturing === 'ptt' ? (e) => onRebindKey(e, onChangePushToTalkKey) : undefined}
              >
                {capturing === 'ptt' ? 'Press a key…' : (pushToTalkKey || 'Unbound')}
              </button>
              {pushToTalkKey && (
                <button
                  className="unbind-btn"
                  onClick={() => onChangePushToTalkKey('')}
                  title="Clear keybind"
                  aria-label="Clear Push-to-talk keybind"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <hr className="settings-divider" />
      <div id="section-processing" className="settings-subdivision">Processing</div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Noise suppression</span>
          <span className="settings-row__hint">Removes steady background noise while speaking.</span>
        </div>
        <Toggle on={noiseSuppression} onClick={() => onChangeNoiseSuppression(!noiseSuppression)} />
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Echo cancellation</span>
          <span className="settings-row__hint">Prevents mic from picking up speaker audio. Disable if using headphones.</span>
        </div>
        <Toggle on={echoCancellation} onClick={() => onChangeEchoCancellation(!echoCancellation)} />
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Automatic gain control</span>
          <span className="settings-row__hint">Automatically adjusts mic volume to a consistent level.</span>
        </div>
        <Toggle on={autoGainControl} onClick={() => onChangeAutoGainControl(!autoGainControl)} />
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Normalize voices</span>
          <span className="settings-row__hint">Auto-levels incoming audio. Boosts quiet users, tames loud ones.</span>
        </div>
        <Toggle on={normalizeVoices} onClick={() => onChangeNormalizeVoices(!normalizeVoices)} />
      </div>
    </>
  );
}
