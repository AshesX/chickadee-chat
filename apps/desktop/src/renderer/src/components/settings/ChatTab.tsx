import { CustomSelect } from '../CustomSelect';
import { KeybindRow } from '../KeybindRow';
import { VOICE_CATEGORIES } from '../../lib/voices';
import { previewVoice } from '../../lib/tts';
import { store } from '../../lib/settings';
import { usePersistedState } from '../../hooks/usePersistedState';
import { EmojiListManager } from './EmojiListManager';
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
  | 'chatTtsSpeakOwnMessages' | 'onChangeChatTtsSpeakOwnMessages'
  | 'chatTtsSpeakWhenFocused' | 'onChangeChatTtsSpeakWhenFocused'
  | 'reactionsEnabled' | 'onChangeReactionsEnabled'
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
  chatTtsSpeakOwnMessages,
  onChangeChatTtsSpeakOwnMessages,
  chatTtsSpeakWhenFocused,
  onChangeChatTtsSpeakWhenFocused,
  reactionsEnabled,
  onChangeReactionsEnabled,
  voicePreference,
  onChangeVoicePreference,
  chatPanelKey,
  onChangeChatPanelKey,
  ttsToggleKey,
  onChangeTtsToggleKey,
  ttsStopKey,
  onChangeTtsStopKey,
}: ChatTabProps): React.JSX.Element {
  const [customEmojis, setCustomEmojis] = usePersistedState(store.getCustomEmojis, store.setCustomEmojis);
  const [quickReactions, setQuickReactions] = usePersistedState(store.getQuickReactions, store.setQuickReactions);

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

      <hr className="settings-divider" />
      <SettingsSection id="section-chat-emojis" title="Emojis & Reactions" />

      <ToggleRow
        label="Enable reactions"
        hint="Show floating emoji reactions from others and the control-bar React button."
        value={reactionsEnabled}
        onChange={onChangeReactionsEnabled}
      />

      <SettingsRow label="Quick Reactions" hint="Exactly 6 emojis shown in the quick reaction popover.">
        <EmojiListManager emojis={quickReactions} onChange={setQuickReactions} max={6} />
      </SettingsRow>

      <SettingsRow label="Favorite Emojis" hint="Custom emojis pinned to the top of your emoji picker.">
        <EmojiListManager emojis={customEmojis} onChange={setCustomEmojis} max={24} />
      </SettingsRow>

      <hr className="settings-divider" />
      <SettingsSection id="section-chat-tts" title="Text-to-Speech" />

      <ToggleRow
        label="Read messages aloud (Text-to-Speech)"
        hint="Speaks new chat messages aloud."
        value={chatTtsEnabled}
        onChange={onChangeChatTtsEnabled}
      />

      {chatTtsEnabled && (
        <>
          <ToggleRow
            label="Speak own messages"
            hint="Also reads messages you send."
            value={chatTtsSpeakOwnMessages}
            onChange={onChangeChatTtsSpeakOwnMessages}
          />

          <ToggleRow
            label="Speak while focused"
            hint="Otherwise only reads while unfocused."
            value={chatTtsSpeakWhenFocused}
            onChange={onChangeChatTtsSpeakWhenFocused}
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
        </>
      )}

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
