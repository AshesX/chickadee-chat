import { CustomSelect } from '../CustomSelect';
import { KeybindRow } from '../KeybindRow';
import { VOICE_CATEGORIES } from '../../lib/voices';
import { previewVoice } from '../../lib/tts';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { SliderRow } from './SliderRow';
import { SegmentedRow } from './SegmentedRow';
import { ToggleRow } from './ToggleRow';
import type { SettingsModalProps } from './types';

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
>;

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
}: ChatTabProps): React.JSX.Element {
  return (
    <>
      <SettingsSection id="section-chat-settings" title="Chat Settings" />

      <SliderRow
        label="Chat Font Scale"
        hint="Chat message text size."
        constrained
        slider={{
          min: 0.5,
          max: 2.0,
          step: 0.1,
          value: chatFontScale,
          onChange: onChangeChatFontScale,
          markers: [0.5, 1.0, 1.5, 2.0],
          labels: [
            { value: 0.5, text: '50%' },
            { value: 1.0, text: '100% (Default)' },
            { value: 1.5, text: '150%' },
            { value: 2.0, text: '200%' },
          ],
          snapThreshold: 0.08,
          commitOnRelease: false,
        }}
      />

      <SegmentedRow
        label="Chat position"
        hint="Dock chat to the left or right."
        value={chatPosition}
        onChange={onChangeChatPosition}
        options={[
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
        ]}
      />

      <ToggleRow
        label="Read messages aloud (Text-to-Speech)"
        hint="Speaks new messages when app is unfocused."
        value={chatTtsEnabled}
        onChange={onChangeChatTtsEnabled}
      />

      <ToggleRow
        label="Speak sender's name"
        hint={<>Reads &quot;[name] says&quot; before messages.</>}
        value={chatTtsSpeakName}
        onChange={onChangeChatTtsSpeakName}
      />

      <SettingsRow
        label="My chat voice"
        hint="Your voice for others using TTS. Listeners match this to their closest system voice."
      >
        <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
          <CustomSelect
            value={voicePreference}
            onChange={onChangeVoicePreference}
            options={[
              { value: '', label: 'System Default' },
              ...VOICE_CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
            ]}
            className="settings-device-select"
          />
          <button className="seg-btn" onClick={() => previewVoice(voicePreference)}>
            Test
          </button>
        </div>
      </SettingsRow>

      <hr className="settings-divider" />
      <SettingsSection id="section-chat-keybindings" title="Keybindings" />

      <SettingsRow label="Chat Panel Key" hint="Toggle the chat panel visibility.">
        <KeybindRow value={chatPanelKey} onChange={onChangeChatPanelKey} clearLabel="Chat Panel keybind" />
      </SettingsRow>
      <SettingsRow label="TTS Toggle Key" hint={'Toggle the "Read messages aloud" setting.'}>
        <KeybindRow value={ttsToggleKey} onChange={onChangeTtsToggleKey} clearLabel="TTS Toggle keybind" />
      </SettingsRow>
      <SettingsRow label="TTS Stop Key" hint="Immediately stop reading the current message.">
        <KeybindRow value={ttsStopKey} onChange={onChangeTtsStopKey} clearLabel="TTS Stop keybind" />
      </SettingsRow>
    </>
  );
}
