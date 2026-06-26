import { Toggle } from './Toggle';
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
      <div className="settings-row">
        <div className="settings-row__label">
          <span>Sound effects</span>
          <span className="settings-row__hint">Enable or disable all audio cues.</span>
        </div>
        <Toggle on={sfxEnabled} onClick={() => onChangeSfxEnabled(!sfxEnabled)} />
      </div>

      <div className="settings-row" style={{ paddingLeft: 16, opacity: sfxEnabled ? 1 : 0.45, pointerEvents: sfxEnabled ? undefined : 'none' }}>
        <div className="settings-row__label">
          <span>Room join / leave</span>
          <span className="settings-row__hint">Plays when someone joins or leaves.</span>
        </div>
        <Toggle on={sfxJoinLeaveEnabled} onClick={() => onChangeSfxJoinLeaveEnabled(!sfxJoinLeaveEnabled)} />
      </div>

      <div className="settings-row" style={{ paddingLeft: 16, opacity: sfxEnabled ? 1 : 0.45, pointerEvents: sfxEnabled ? undefined : 'none' }}>
        <div className="settings-row__label">
          <span>Mic mute / unmute</span>
          <span className="settings-row__hint">Plays when toggling mic mute.</span>
        </div>
        <Toggle on={sfxMuteEnabled} onClick={() => onChangeSfxMuteEnabled(!sfxMuteEnabled)} />
      </div>

      <div className="settings-row" style={{ paddingLeft: 16, opacity: sfxEnabled ? 1 : 0.45, pointerEvents: sfxEnabled ? undefined : 'none' }}>
        <div className="settings-row__label">
          <span>Mute / unmute others</span>
          <span className="settings-row__hint">Plays when silencing/unsilencing others.</span>
        </div>
        <Toggle on={sfxMuteOtherEnabled} onClick={() => onChangeSfxMuteOtherEnabled(!sfxMuteOtherEnabled)} />
      </div>

      <div className="settings-row" style={{ paddingLeft: 16, opacity: sfxEnabled ? 1 : 0.45, pointerEvents: sfxEnabled ? undefined : 'none' }}>
        <div className="settings-row__label">
          <span>Transmission start / stop</span>
          <span className="settings-row__hint">Plays when mic opens or closes.</span>
        </div>
        <Toggle on={sfxTransmitEnabled} onClick={() => onChangeSfxTransmitEnabled(!sfxTransmitEnabled)} />
      </div>

      <div className="settings-row" style={{ paddingLeft: 16, opacity: sfxEnabled ? 1 : 0.45, pointerEvents: sfxEnabled ? undefined : 'none' }}>
        <div className="settings-row__label">
          <span>Chat messages</span>
          <span className="settings-row__hint">Plays on incoming chat messages.</span>
        </div>
        <Toggle on={sfxChatEnabled} onClick={() => onChangeSfxChatEnabled(!sfxChatEnabled)} />
      </div>

      <div className="settings-row" style={{ paddingLeft: 16, opacity: sfxEnabled ? 1 : 0.45, pointerEvents: sfxEnabled ? undefined : 'none' }}>
        <div className="settings-row__label">
          <span>Deafen / undeafen</span>
          <span className="settings-row__hint">Plays when toggling deafen.</span>
        </div>
        <Toggle on={sfxDeafenEnabled} onClick={() => onChangeSfxDeafenEnabled(!sfxDeafenEnabled)} />
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>SFX volume</span>
          <span className="settings-row__hint">Sound effects volume.</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={sfxVolume}
          disabled={!sfxEnabled}
          onChange={(e) => onChangeSfxVolume(parseFloat(e.target.value))}
          className="settings-slider"
        />
      </div>
    </>
  );
}
