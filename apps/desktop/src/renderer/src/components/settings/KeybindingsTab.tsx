import { KeybindRow } from '../KeybindRow';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { SegmentedRow } from './SegmentedRow';
import type { SettingsModalProps } from './types';

type KeybindingsTabProps = Pick<
  SettingsModalProps,
  | 'muteMode' | 'onChangeMuteMode'
  | 'deafenMode' | 'onChangeDeafenMode'
  | 'pttMode' | 'onChangePttMode'
  | 'muteKey' | 'onChangeMuteKey'
  | 'deafenKey' | 'onChangeDeafenKey'
  | 'pushToTalkKey' | 'onChangePushToTalkKey'
  | 'cameraKey' | 'onChangeCameraKey'
  | 'screenShareKey' | 'onChangeScreenShareKey'
  | 'chatPanelKey' | 'onChangeChatPanelKey'
  | 'ttsToggleKey' | 'onChangeTtsToggleKey'
  | 'ttsStopKey' | 'onChangeTtsStopKey'
>;

const HOLD_TOGGLE = [
  { value: 'hold' as const, label: 'Hold' },
  { value: 'toggle' as const, label: 'Toggle' },
];

export function KeybindingsTab({
  muteMode,
  onChangeMuteMode,
  deafenMode,
  onChangeDeafenMode,
  pttMode,
  onChangePttMode,
  muteKey,
  onChangeMuteKey,
  deafenKey,
  onChangeDeafenKey,
  pushToTalkKey,
  onChangePushToTalkKey,
  cameraKey,
  onChangeCameraKey,
  screenShareKey,
  onChangeScreenShareKey,
  chatPanelKey,
  onChangeChatPanelKey,
  ttsToggleKey,
  onChangeTtsToggleKey,
  ttsStopKey,
  onChangeTtsStopKey,
}: KeybindingsTabProps): React.JSX.Element {
  return (
    <>
      <SettingsSection id="section-kb-voice" title="Voice & Audio" />

      <SegmentedRow
        label="Mute mode"
        hint="Hold: muted while pressed. Toggle: press to mute/unmute."
        value={muteMode}
        onChange={onChangeMuteMode}
        options={HOLD_TOGGLE}
      />
      <SegmentedRow
        label="Deafen mode"
        hint="Hold: deafened while pressed. Toggle: press to deafen/undeafen."
        value={deafenMode}
        onChange={onChangeDeafenMode}
        options={HOLD_TOGGLE}
      />
      <SegmentedRow
        label="Push-to-talk mode"
        hint="Hold: live while pressed. Toggle: press to mute/unmute."
        value={pttMode}
        onChange={onChangePttMode}
        options={HOLD_TOGGLE}
      />

      <SettingsRow label="Mute key">
        <KeybindRow value={muteKey} onChange={onChangeMuteKey} clearLabel="Mute keybind" />
      </SettingsRow>
      <SettingsRow label="Deafen key">
        <KeybindRow value={deafenKey} onChange={onChangeDeafenKey} clearLabel="Deafen keybind" />
      </SettingsRow>
      <SettingsRow label="Push-to-talk key">
        <KeybindRow value={pushToTalkKey} onChange={onChangePushToTalkKey} clearLabel="Push-to-talk keybind" />
      </SettingsRow>

      <hr className="settings-divider" />
      <SettingsSection id="section-kb-video" title="Video" />

      <SettingsRow label="Camera Toggle Key">
        <KeybindRow value={cameraKey} onChange={onChangeCameraKey} clearLabel="Camera keybind" />
      </SettingsRow>
      <SettingsRow label="Screen Share Toggle Key">
        <KeybindRow value={screenShareKey} onChange={onChangeScreenShareKey} clearLabel="Screen Share keybind" />
      </SettingsRow>

      <hr className="settings-divider" />
      <SettingsSection id="section-kb-chat" title="Chat" />

      <SettingsRow label="Chat Panel Key">
        <KeybindRow value={chatPanelKey} onChange={onChangeChatPanelKey} clearLabel="Chat Panel keybind" />
      </SettingsRow>
      <SettingsRow label="TTS Toggle Key">
        <KeybindRow value={ttsToggleKey} onChange={onChangeTtsToggleKey} clearLabel="TTS Toggle keybind" />
      </SettingsRow>
      <SettingsRow label="TTS Stop Key">
        <KeybindRow value={ttsStopKey} onChange={onChangeTtsStopKey} clearLabel="TTS Stop keybind" />
      </SettingsRow>
    </>
  );
}
