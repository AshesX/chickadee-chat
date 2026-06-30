import { ToggleRow } from './ToggleRow';
import { SliderRow } from './SliderRow';
import type { SettingsModalProps } from './types';

type SfxTabProps = Pick<
  SettingsModalProps,
  | 'sfxEnabled' | 'onChangeSfxEnabled'
  | 'sfxJoinLeaveEnabled' | 'onChangeSfxJoinLeaveEnabled'
  | 'sfxMuteEnabled' | 'onChangeSfxMuteEnabled'
  | 'sfxMuteOtherEnabled' | 'onChangeSfxMuteOtherEnabled'
  | 'sfxTransmitEnabled' | 'onChangeSfxTransmitEnabled'
  | 'sfxChatEnabled' | 'onChangeSfxChatEnabled'
  | 'sfxDeafenEnabled' | 'onChangeSfxDeafenEnabled'
  | 'sfxVolume' | 'onChangeSfxVolume'
>;

export function SfxTab({
  sfxEnabled,
  onChangeSfxEnabled,
  sfxJoinLeaveEnabled,
  onChangeSfxJoinLeaveEnabled,
  sfxMuteEnabled,
  onChangeSfxMuteEnabled,
  sfxMuteOtherEnabled,
  onChangeSfxMuteOtherEnabled,
  sfxTransmitEnabled,
  onChangeSfxTransmitEnabled,
  sfxChatEnabled,
  onChangeSfxChatEnabled,
  sfxDeafenEnabled,
  onChangeSfxDeafenEnabled,
  sfxVolume,
  onChangeSfxVolume,
}: SfxTabProps): React.JSX.Element {
  return (
    <>
      <ToggleRow
        label="Sound effects"
        hint="Enable or disable all audio cues."
        value={sfxEnabled}
        onChange={onChangeSfxEnabled}
      />

      <ToggleRow
        label="Room join / leave"
        hint="Plays when someone joins or leaves."
        value={sfxJoinLeaveEnabled}
        onChange={onChangeSfxJoinLeaveEnabled}
        nested
        disabled={!sfxEnabled}
      />
      <ToggleRow
        label="Mic mute / unmute"
        hint="Plays when toggling mic mute."
        value={sfxMuteEnabled}
        onChange={onChangeSfxMuteEnabled}
        nested
        disabled={!sfxEnabled}
      />
      <ToggleRow
        label="Mute / unmute others"
        hint="Plays when silencing/unsilencing others."
        value={sfxMuteOtherEnabled}
        onChange={onChangeSfxMuteOtherEnabled}
        nested
        disabled={!sfxEnabled}
      />
      <ToggleRow
        label="Transmission start / stop"
        hint="Plays when mic opens or closes."
        value={sfxTransmitEnabled}
        onChange={onChangeSfxTransmitEnabled}
        nested
        disabled={!sfxEnabled}
      />
      <ToggleRow
        label="Chat messages"
        hint="Plays on incoming chat messages."
        value={sfxChatEnabled}
        onChange={onChangeSfxChatEnabled}
        nested
        disabled={!sfxEnabled}
      />
      <ToggleRow
        label="Deafen / undeafen"
        hint="Plays when toggling deafen."
        value={sfxDeafenEnabled}
        onChange={onChangeSfxDeafenEnabled}
        nested
        disabled={!sfxEnabled}
      />

      <SliderRow
        label="SFX volume"
        hint="Sound effects volume."
        disabled={!sfxEnabled}
        slider={{
          min: 0,
          max: 1,
          step: 0.05,
          value: sfxVolume,
          onChange: onChangeSfxVolume,
          markers: [0, 0.5, 1],
          labels: [
            { value: 0, text: '0%' },
            { value: 0.5, text: '50%' },
            { value: 1, text: '100%' },
          ],
        }}
      />
    </>
  );
}
