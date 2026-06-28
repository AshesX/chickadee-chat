import { X } from 'lucide-react';
import { CustomSelect } from '../CustomSelect';
import { SettingsSlider } from '../SettingsSlider';
import { VOICE_CATEGORIES } from '../../lib/voices';
import { previewVoice } from '../../lib/tts';
import { Toggle } from './Toggle';
import type { KeyCapture, SettingsModalProps } from './types';

type ChatTabProps = Pick<
  SettingsModalProps,
  | 'chatFontScale' | 'onChangeChatFontScale'
  | 'chatPosition' | 'onChangeChatPosition'
  | 'chatTtsEnabled' | 'onChangeChatTtsEnabled'
  | 'chatTtsSpeakName' | 'onChangeChatTtsSpeakName'
  | 'voicePreference' | 'onChangeVoicePreference'
  | 'chatPanelKey' | 'onChangeChatPanelKey'
  | 'ttsToggleKey' | 'onChangeTtsToggleKey'
  | 'ttsStopKey' | 'onChangeTtsStopKey'
> & {
  keyCapture: KeyCapture;
};

export function ChatTab({
  chatFontScale,
  onChangeChatFontScale,
  chatPosition,
  onChangeChatPosition,
  chatTtsEnabled,
  onChangeChatTtsEnabled,
  chatTtsSpeakName,
  onChangeChatTtsSpeakName,
  voicePreference,
  onChangeVoicePreference,
  chatPanelKey,
  onChangeChatPanelKey,
  ttsToggleKey,
  onChangeTtsToggleKey,
  ttsStopKey,
  onChangeTtsStopKey,
  keyCapture,
}: ChatTabProps): React.JSX.Element {
  const { capturing, startCapture, onRebindKey } = keyCapture;

  return (
    <>
      <div id="section-chat-settings" className="settings-subdivision">Chat Settings</div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Chat Font Scale</span>
          <span className="settings-row__hint">Chat message text size.</span>
        </div>
        <div className="mic-control-wrap">
          <SettingsSlider
            min={0.5}
            max={2.0}
            step={0.1}
            value={chatFontScale}
            onChange={onChangeChatFontScale}
            markers={[0.5, 1.0, 1.5, 2.0]}
            labels={[
              { value: 0.5, text: '50%' },
              { value: 1.0, text: '100% (Default)' },
              { value: 1.5, text: '150%' },
              { value: 2.0, text: '200%' }
            ]}
            snapThreshold={0.08}
            commitOnRelease={false}
          />
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Chat position</span>
          <span className="settings-row__hint">Dock chat to the left or right.</span>
        </div>
        <div className="seg-group">
          <button
            className={`seg-btn${chatPosition === 'left' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeChatPosition('left')}
          >Left</button>
          <button
            className={`seg-btn${chatPosition === 'right' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeChatPosition('right')}
          >Right</button>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Read messages aloud (Text-to-Speech)</span>
          <span className="settings-row__hint">Speaks new messages when app is unfocused.</span>
        </div>
        <Toggle on={chatTtsEnabled} onClick={() => onChangeChatTtsEnabled(!chatTtsEnabled)} />
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Speak sender's name</span>
          <span className="settings-row__hint">Reads &quot;[name] says&quot; before messages.</span>
        </div>
        <Toggle on={chatTtsSpeakName} onClick={() => onChangeChatTtsSpeakName(!chatTtsSpeakName)} />
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>My chat voice</span>
          <span className="settings-row__hint">Your voice for others using TTS. Listeners match this to their closest system voice.</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <CustomSelect
            value={voicePreference}
            onChange={onChangeVoicePreference}
            options={[
              { value: '', label: 'System Default' },
              ...VOICE_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))
            ]}
            className="settings-device-select"
          />
          <button
            className="seg-btn"
            onClick={() => previewVoice(voicePreference)}
          >
            Test
          </button>
        </div>
      </div>

      <hr className="settings-divider" />
      <div id="section-chat-keybindings" className="settings-subdivision">Keybindings</div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Chat Panel Key</span>
          <span className="settings-row__hint">Toggle the chat panel visibility.</span>
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
            <button
              className="btn btn--danger-soft unbind-btn"
              onClick={() => onChangeChatPanelKey('')}
            ><X size={14} /></button>
          )}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>TTS Toggle Key</span>
          <span className="settings-row__hint">Toggle the "Read messages aloud" setting.</span>
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
            <button
              className="btn btn--danger-soft unbind-btn"
              onClick={() => onChangeTtsToggleKey('')}
            ><X size={14} /></button>
          )}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>TTS Stop Key</span>
          <span className="settings-row__hint">Immediately stop reading the current message.</span>
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
            <button
              className="btn btn--danger-soft unbind-btn"
              onClick={() => onChangeTtsStopKey('')}
            ><X size={14} /></button>
          )}
        </div>
      </div>
    </>
  );
}
