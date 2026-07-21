import { usePersistedState } from '../../hooks/usePersistedState';
import { store } from '../../lib/settings';
import { EmojiListManager } from './EmojiListManager';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { ToggleRow } from './ToggleRow';
import type { SettingsModalProps } from './types';

type ReactionsTabProps = Pick<
  SettingsModalProps,
  'reactionsEnabled' | 'onChangeReactionsEnabled' | 'reactionsButtonEnabled' | 'onChangeReactionsButtonEnabled'
>;

export function ReactionsTab({
  reactionsEnabled,
  onChangeReactionsEnabled,
  reactionsButtonEnabled,
  onChangeReactionsButtonEnabled,
}: ReactionsTabProps): React.JSX.Element {
  const [quickReactions, setQuickReactions] = usePersistedState(store.getQuickReactions, store.setQuickReactions);

  return (
    <>
      <SettingsSection id="section-reactions-emojis" title="Reactions" />

      <ToggleRow
        label="Enable reactions"
        hint="See floating emoji reactions from others and send your own."
        value={reactionsEnabled}
        onChange={onChangeReactionsEnabled}
      />

      <ToggleRow
        label="Show React button"
        hint="Show the React button in the control bar. Turn off if you'd rather not send reactions yourself but still want to see others'."
        value={reactionsButtonEnabled}
        onChange={onChangeReactionsButtonEnabled}
        disabled={!reactionsEnabled}
      />

      <SettingsRow label="Quick Reactions" hint="Exactly 6 emojis shown in the quick reaction popover.">
        <EmojiListManager emojis={quickReactions} onChange={setQuickReactions} max={6} />
      </SettingsRow>

    </>
  );
}
