import { usePersistedState } from '../../hooks/usePersistedState';
import { store } from '../../lib/settings';
import { EmojiListManager } from './EmojiListManager';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { ToggleRow } from './ToggleRow';
import type { SettingsModalProps } from './types';

type ReactionsTabProps = Pick<
  SettingsModalProps,
  'reactionsEnabled' | 'onChangeReactionsEnabled'
>;

export function ReactionsTab({
  reactionsEnabled,
  onChangeReactionsEnabled,
}: ReactionsTabProps): React.JSX.Element {
  const [quickReactions, setQuickReactions] = usePersistedState(store.getQuickReactions, store.setQuickReactions);

  return (
    <>
      <SettingsSection id="section-reactions-emojis" title="Reactions" />

      <ToggleRow
        label="Enable reactions"
        hint="Show floating emoji reactions from others and the control-bar React button."
        value={reactionsEnabled}
        onChange={onChangeReactionsEnabled}
      />

      <SettingsRow label="Quick Reactions" hint="Exactly 6 emojis shown in the quick reaction popover.">
        <EmojiListManager emojis={quickReactions} onChange={setQuickReactions} max={6} />
      </SettingsRow>

    </>
  );
}
