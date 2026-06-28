import { X } from 'lucide-react';
import type { KeyCapture, SettingsModalProps } from './types';

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
> & {
  keyCapture: KeyCapture;
};

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
  keyCapture,
}: KeybindingsTabProps): React.JSX.Element {
  const { capturing, startCapture, onRebindKey } = keyCapture;

  return (
    <>
      <div id="section-kb-voice" className="settings-subdivision">Voice & Audio</div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Mute mode</span>
          <span className="settings-row__hint">Hold: muted while pressed. Toggle: press to mute/unmute.</span>
        </div>
        <div className="seg-group">
          <button
            className={`seg-btn${muteMode === 'hold' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeMuteMode('hold')}
          >Hold</button>
          <button
            className={`seg-btn${muteMode === 'toggle' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeMuteMode('toggle')}
          >Toggle</button>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Deafen mode</span>
          <span className="settings-row__hint">Hold: deafened while pressed. Toggle: press to deafen/undeafen.</span>
        </div>
        <div className="seg-group">
          <button
            className={`seg-btn${deafenMode === 'hold' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeDeafenMode('hold')}
          >Hold</button>
          <button
            className={`seg-btn${deafenMode === 'toggle' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeDeafenMode('toggle')}
          >Toggle</button>
        </div>
      </div>

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
          <span>Mute key</span>
        </div>
        <div className="keybind-row">
          <button
            className={`rebind${capturing === 'mute' ? ' rebind--active' : ''}`}
            onClick={() => startCapture('mute')}
            onKeyDown={capturing === 'mute' ? (e) => onRebindKey(e, onChangeMuteKey) : undefined}
          >
            {capturing === 'mute' ? 'Press a key…' : (muteKey || 'Unbound')}
          </button>
          {muteKey && (
            <button
              className="btn btn--danger-soft unbind-btn"
              onClick={() => onChangeMuteKey('')}
              title="Clear keybind"
              aria-label="Clear Mute keybind"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Deafen key</span>
        </div>
        <div className="keybind-row">
          <button
            className={`rebind${capturing === 'deafen' ? ' rebind--active' : ''}`}
            onClick={() => startCapture('deafen')}
            onKeyDown={capturing === 'deafen' ? (e) => onRebindKey(e, onChangeDeafenKey) : undefined}
          >
            {capturing === 'deafen' ? 'Press a key…' : (deafenKey || 'Unbound')}
          </button>
          {deafenKey && (
            <button
              className="btn btn--danger-soft unbind-btn"
              onClick={() => onChangeDeafenKey('')}
              title="Clear keybind"
              aria-label="Clear Deafen keybind"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Push-to-talk key</span>
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
              className="btn btn--danger-soft unbind-btn"
              onClick={() => onChangePushToTalkKey('')}
              title="Clear keybind"
              aria-label="Clear Push-to-talk keybind"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <hr className="settings-divider" />
      <div id="section-kb-video" className="settings-subdivision">Video</div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Camera Toggle Key</span>
        </div>
        <div className="keybind-row">
          <button
            className={`rebind${capturing === 'camera' ? ' rebind--active' : ''}`}
            onClick={() => startCapture('camera')}
            onKeyDown={capturing === 'camera' ? (e) => onRebindKey(e, onChangeCameraKey) : undefined}
          >
            {capturing === 'camera' ? 'Press a key…' : (cameraKey || 'Unbound')}
          </button>
          {cameraKey && (
            <button className="btn btn--danger-soft unbind-btn" onClick={() => onChangeCameraKey('')}><X size={14} /></button>
          )}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Screen Share Toggle Key</span>
        </div>
        <div className="keybind-row">
          <button
            className={`rebind${capturing === 'screenShare' ? ' rebind--active' : ''}`}
            onClick={() => startCapture('screenShare')}
            onKeyDown={capturing === 'screenShare' ? (e) => onRebindKey(e, onChangeScreenShareKey) : undefined}
          >
            {capturing === 'screenShare' ? 'Press a key…' : (screenShareKey || 'Unbound')}
          </button>
          {screenShareKey && (
            <button className="btn btn--danger-soft unbind-btn" onClick={() => onChangeScreenShareKey('')}><X size={14} /></button>
          )}
        </div>
      </div>

      <hr className="settings-divider" />
      <div id="section-kb-chat" className="settings-subdivision">Chat</div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Chat Panel Key</span>
        </div>
        <div className="keybind-row">
          <button
            className={`rebind${capturing === 'chatPanel' ? ' rebind--active' : ''}`}
            onClick={() => startCapture('chatPanel')}
            onKeyDown={capturing === 'chatPanel' ? (e) => onRebindKey(e, onChangeChatPanelKey) : undefined}
          >
            {capturing === 'chatPanel' ? 'Press a key…' : (chatPanelKey || 'Unbound')}
          </button>
          {chatPanelKey && (
            <button className="btn btn--danger-soft unbind-btn" onClick={() => onChangeChatPanelKey('')}><X size={14} /></button>
          )}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>TTS Toggle Key</span>
        </div>
        <div className="keybind-row">
          <button
            className={`rebind${capturing === 'ttsToggle' ? ' rebind--active' : ''}`}
            onClick={() => startCapture('ttsToggle')}
            onKeyDown={capturing === 'ttsToggle' ? (e) => onRebindKey(e, onChangeTtsToggleKey) : undefined}
          >
            {capturing === 'ttsToggle' ? 'Press a key…' : (ttsToggleKey || 'Unbound')}
          </button>
          {ttsToggleKey && (
            <button className="btn btn--danger-soft unbind-btn" onClick={() => onChangeTtsToggleKey('')}><X size={14} /></button>
          )}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>TTS Stop Key</span>
        </div>
        <div className="keybind-row">
          <button
            className={`rebind${capturing === 'ttsStop' ? ' rebind--active' : ''}`}
            onClick={() => startCapture('ttsStop')}
            onKeyDown={capturing === 'ttsStop' ? (e) => onRebindKey(e, onChangeTtsStopKey) : undefined}
          >
            {capturing === 'ttsStop' ? 'Press a key…' : (ttsStopKey || 'Unbound')}
          </button>
          {ttsStopKey && (
            <button className="btn btn--danger-soft unbind-btn" onClick={() => onChangeTtsStopKey('')}><X size={14} /></button>
          )}
        </div>
      </div>
    </>
  );
}
