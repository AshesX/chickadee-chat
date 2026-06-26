import { useState } from 'react';
import { ChevronMenu } from './ChevronMenu';

interface ReactionPopoverProps {
  onReact: (emoji: string) => void;
  onClose: () => void;
  anchorRect: DOMRect;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const REACTION_EMOJIS = ['🔥', '😂', '👍', '❤️', '🎉', '💀'];

export function ReactionPopover({ onReact, onClose, anchorRect, onMouseEnter, onMouseLeave }: ReactionPopoverProps): React.JSX.Element {
  const [cooldown, setCooldown] = useState(false);

  function handleReact(emoji: string): void {
    if (cooldown) return;
    onReact(emoji);
    setCooldown(true);
    setTimeout(() => {
      setCooldown(false);
    }, 600);
  }

  return (
    <ChevronMenu anchorRect={anchorRect} onClose={onClose} width={340} className="reaction-pop" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        <div className="reaction-pop__grid">
          {REACTION_EMOJIS.map((emoji) => (
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
