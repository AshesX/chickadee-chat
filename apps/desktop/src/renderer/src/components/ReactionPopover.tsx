import { useState } from 'react';
import { ChevronMenu } from './ChevronMenu';
import { store } from '../lib/settings';
import { usePersistedState } from '../hooks/usePersistedState';

interface ReactionPopoverProps {
  onReact: (emoji: string) => void;
  onClose: () => void;
  anchorRect: DOMRect;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function ReactionPopover({ onReact, onClose, anchorRect, onMouseEnter, onMouseLeave }: ReactionPopoverProps): React.JSX.Element {
  const [cooldown, setCooldown] = useState(false);
  const [quickReactions] = usePersistedState(store.getQuickReactions, store.setQuickReactions);

  function handleReact(emoji: string): void {
    if (cooldown) return;
    onReact(emoji);
    setCooldown(true);
    setTimeout(() => {
      setCooldown(false);
    }, 600);
  }

  return (
    <ChevronMenu anchorRect={anchorRect} onClose={onClose} className="reaction-pop menu-surface" snapToControlBar={true} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        <div className="reaction-pop__grid">
          {quickReactions.map((emoji) => (
            <button
              key={emoji}
              className={`reaction-pop__btn${cooldown ? ' reaction-pop__btn--cooldown' : ''}`}
              onClick={() => handleReact(emoji)}
              disabled={cooldown}
              title={cooldown ? 'Cooldown active...' : `Send ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
    </ChevronMenu>
  );
}
