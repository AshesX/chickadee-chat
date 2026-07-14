import { useState, useRef } from 'react';
import { X, Plus } from 'lucide-react';
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
  | 'chatTtsSpeakOwnMessages' | 'onChangeChatTtsSpeakOwnMessages'
  | 'chatTtsSpeakWhenFocused' | 'onChangeChatTtsSpeakWhenFocused'
  | 'voicePreference' | 'onChangeVoicePreference'
  | 'chatPanelKey' | 'onChangeChatPanelKey'
  | 'ttsToggleKey' | 'onChangeTtsToggleKey'
  | 'ttsStopKey' | 'onChangeTtsStopKey'
  | 'customEmojis' | 'onChangeCustomEmojis'
  | 'quickReactions' | 'onChangeQuickReactions'
>;

function EmojiListManager({ emojis, onChange, max, label }: { emojis: string[], onChange: (emojis: string[]) => void, max: number, label: string }): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const chars = Array.from(val.trim());
    if (chars.length > 0) {
      const newEmojis = Array.from(new Set([...emojis, ...chars])).slice(0, max);
      onChange(newEmojis);
    }
    e.target.value = '';
  };

  const handleRemove = (index: number) => {
    const newEmojis = [...emojis];
    newEmojis.splice(index, 1);
    onChange(newEmojis);
  };

  return (
    <div className="emoji-manager">
      <div className="emoji-manager__list">
        {emojis.map((emoji, idx) => (
          <div key={`${emoji}-${idx}`} className="emoji-manager__item">
            <span>{emoji}</span>
            <button onClick={() => handleRemove(idx)} aria-label="Remove emoji" className="emoji-manager__remove"><X size={12} /></button>
          </div>
        ))}
        {emojis.length < max && (
          <div className="emoji-manager__add" onClick={() => inputRef.current?.focus()}>
            <Plus size={14} className="emoji-manager__add-icon" />
            <input 
              ref={inputRef}
              type="text" 
              onChange={handleInputChange} 
              placeholder="😃" 
            />
          </div>
        )}
      </div>
      <div className="emoji-manager__hint">Max {max} emojis. Tip: Use OS emoji picker (Win + .)</div>
    </div>
  );
}

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
  voicePreference,
  onChangeVoicePreference,
  chatPanelKey,
  onChangeChatPanelKey,
  ttsToggleKey,
  onChangeTtsToggleKey,
  ttsStopKey,
  onChangeTtsStopKey,
  customEmojis,
  onChangeCustomEmojis,
  quickReactions,
  onChangeQuickReactions,
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

      <hr className="settings-divider" />
      <SettingsSection id="section-chat-emojis" title="Emojis & Reactions" />

      <SettingsRow label="Quick Reactions" hint="Exactly 6 emojis shown in the quick reaction popover.">
        <EmojiListManager emojis={quickReactions} onChange={onChangeQuickReactions} max={6} label="Quick Reactions" />
      </SettingsRow>

      <SettingsRow label="Favorite Emojis" hint="Custom emojis pinned to the top of your emoji picker.">
        <EmojiListManager emojis={customEmojis} onChange={onChangeCustomEmojis} max={24} label="Favorite Emojis" />
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
