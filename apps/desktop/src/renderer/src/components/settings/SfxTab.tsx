import { ToggleRow } from './ToggleRow';
import { SliderRow } from './SliderRow';
import { SfxCueRow } from './SfxCueRow';
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
  | 'sfxModerationEnabled' | 'onChangeSfxModerationEnabled'
  | 'sfxSpotlightEnabled' | 'onChangeSfxSpotlightEnabled'
  | 'sfxScreenShareEnabled' | 'onChangeSfxScreenShareEnabled'
  | 'sfxTransferEnabled' | 'onChangeSfxTransferEnabled'
  | 'sfxConnectionEnabled' | 'onChangeSfxConnectionEnabled'
  | 'sfxVolume' | 'onChangeSfxVolume'
  | 'customSfxSlots' | 'customSfxBusySlot' | 'customSfxError'
  | 'onChooseCustomSfx' | 'onResetCustomSfx' | 'onPreviewCustomSfx'
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
  sfxModerationEnabled,
  onChangeSfxModerationEnabled,
  sfxSpotlightEnabled,
  onChangeSfxSpotlightEnabled,
  sfxScreenShareEnabled,
  onChangeSfxScreenShareEnabled,
  sfxTransferEnabled,
  onChangeSfxTransferEnabled,
  sfxConnectionEnabled,
  onChangeSfxConnectionEnabled,
  sfxVolume,
  onChangeSfxVolume,
  customSfxSlots,
  customSfxBusySlot,
  customSfxError,
  onChooseCustomSfx,
  onResetCustomSfx,
  onPreviewCustomSfx,
}: SfxTabProps): React.JSX.Element {
  const hasCustom = (slot: (typeof customSfxSlots)[number]): boolean => customSfxSlots.includes(slot);

  return (
    <>
      <ToggleRow
        label="Sound effects"
        hint="Enable or disable all audio cues."
        value={sfxEnabled}
        onChange={onChangeSfxEnabled}
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

      {customSfxError && <p className="field-error">{customSfxError}</p>}

      <SfxCueRow
        label="Room join / leave"
        hint="Plays when someone joins or leaves."
        value={sfxJoinLeaveEnabled}
        onChange={onChangeSfxJoinLeaveEnabled}
        disabled={!sfxEnabled}
        slot="joinLeave"
        hasCustom={hasCustom('joinLeave')}
        busy={customSfxBusySlot === 'joinLeave'}
        onChoose={onChooseCustomSfx}
        onReset={onResetCustomSfx}
        onPreview={onPreviewCustomSfx}
      />
      <SfxCueRow
        label="Mic mute / unmute"
        hint="Plays when toggling mic mute, or pressing Push-to-Talk while muted."
        value={sfxMuteEnabled}
        onChange={onChangeSfxMuteEnabled}
        disabled={!sfxEnabled}
        slot="mute"
        hasCustom={hasCustom('mute')}
        busy={customSfxBusySlot === 'mute'}
        onChoose={onChooseCustomSfx}
        onReset={onResetCustomSfx}
        onPreview={onPreviewCustomSfx}
      />
      <SfxCueRow
        label="Mute / unmute others"
        hint="Plays when silencing/unsilencing others."
        value={sfxMuteOtherEnabled}
        onChange={onChangeSfxMuteOtherEnabled}
        disabled={!sfxEnabled}
        slot="muteOther"
        hasCustom={hasCustom('muteOther')}
        busy={customSfxBusySlot === 'muteOther'}
        onChoose={onChooseCustomSfx}
        onReset={onResetCustomSfx}
        onPreview={onPreviewCustomSfx}
      />
      <SfxCueRow
        label="Transmission start / stop"
        hint="Plays when mic opens or closes."
        value={sfxTransmitEnabled}
        onChange={onChangeSfxTransmitEnabled}
        disabled={!sfxEnabled}
        slot="transmit"
        hasCustom={hasCustom('transmit')}
        busy={customSfxBusySlot === 'transmit'}
        onChoose={onChooseCustomSfx}
        onReset={onResetCustomSfx}
        onPreview={onPreviewCustomSfx}
      />
      <SfxCueRow
        label="Chat messages"
        hint="Plays on incoming chat messages."
        value={sfxChatEnabled}
        onChange={onChangeSfxChatEnabled}
        disabled={!sfxEnabled}
        slot="chat"
        hasCustom={hasCustom('chat')}
        busy={customSfxBusySlot === 'chat'}
        onChoose={onChooseCustomSfx}
        onReset={onResetCustomSfx}
        onPreview={onPreviewCustomSfx}
      />
      <SfxCueRow
        label="Deafen / undeafen"
        hint="Plays when toggling deafen."
        value={sfxDeafenEnabled}
        onChange={onChangeSfxDeafenEnabled}
        disabled={!sfxEnabled}
        slot="deafen"
        hasCustom={hasCustom('deafen')}
        busy={customSfxBusySlot === 'deafen'}
        onChoose={onChooseCustomSfx}
        onReset={onResetCustomSfx}
        onPreview={onPreviewCustomSfx}
      />
      <SfxCueRow
        label="Moderation & Space events"
        hint="Plays when kicked/banned, a room or Space locks or unlocks, or ownership is transferred to you."
        value={sfxModerationEnabled}
        onChange={onChangeSfxModerationEnabled}
        disabled={!sfxEnabled}
        slot="moderation"
        hasCustom={hasCustom('moderation')}
        busy={customSfxBusySlot === 'moderation'}
        onChoose={onChooseCustomSfx}
        onReset={onResetCustomSfx}
        onPreview={onPreviewCustomSfx}
      />
      <SfxCueRow
        label="Stage spotlight"
        hint="Plays when someone claims or loses the camera stage spotlight."
        value={sfxSpotlightEnabled}
        onChange={onChangeSfxSpotlightEnabled}
        disabled={!sfxEnabled}
        slot="spotlight"
        hasCustom={hasCustom('spotlight')}
        busy={customSfxBusySlot === 'spotlight'}
        onChoose={onChooseCustomSfx}
        onReset={onResetCustomSfx}
        onPreview={onPreviewCustomSfx}
      />
      <SfxCueRow
        label="Screen sharing"
        hint="Plays when a screen share starts or stops."
        value={sfxScreenShareEnabled}
        onChange={onChangeSfxScreenShareEnabled}
        disabled={!sfxEnabled}
        slot="screenShare"
        hasCustom={hasCustom('screenShare')}
        busy={customSfxBusySlot === 'screenShare'}
        onChoose={onChooseCustomSfx}
        onReset={onResetCustomSfx}
        onPreview={onPreviewCustomSfx}
      />
      <SfxCueRow
        label="File transfers"
        hint="Plays when a file transfer finishes or fails."
        value={sfxTransferEnabled}
        onChange={onChangeSfxTransferEnabled}
        disabled={!sfxEnabled}
        slot="transfer"
        hasCustom={hasCustom('transfer')}
        busy={customSfxBusySlot === 'transfer'}
        onChoose={onChooseCustomSfx}
        onReset={onResetCustomSfx}
        onPreview={onPreviewCustomSfx}
      />
      <SfxCueRow
        label="Connection health"
        hint="Plays when a peer's connection degrades, fails, or recovers."
        value={sfxConnectionEnabled}
        onChange={onChangeSfxConnectionEnabled}
        disabled={!sfxEnabled}
        slot="connection"
        hasCustom={hasCustom('connection')}
        busy={customSfxBusySlot === 'connection'}
        onChoose={onChooseCustomSfx}
        onReset={onResetCustomSfx}
        onPreview={onPreviewCustomSfx}
      />
    </>
  );
}
