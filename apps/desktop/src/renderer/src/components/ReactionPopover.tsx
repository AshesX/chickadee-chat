import { useState } from 'react';

interface ReactionPopoverProps {
  onReact: (emoji: string) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

const REACTION_EMOJIS = ['🔥', '😂', '👍', '❤️', '🎉', '💀'];

export function ReactionPopover({ onReact, onClose, anchorRect }: ReactionPopoverProps): React.JSX.Element {
  const [cooldown, setCooldown] = useState(false);

  const menuWidth = 240;
  const gap = 8;

  const bottom = window.innerHeight - anchorRect.top + gap;
  const rawLeft = anchorRect.left + anchorRect.width / 2 - menuWidth / 2;
  const left = Math.max(8, Math.min(rawLeft, window.innerWidth - menuWidth - 8));

  function handleReact(emoji: string): void {
    if (cooldown) return;
    onReact(emoji);
    setCooldown(true);
    setTimeout(() => {
      setCooldown(false);
    }, 600);
  }

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div
        className="reaction-pop"
        style={{ bottom, left, width: menuWidth }}
        onClick={(e) => e.stopPropagation()}
      >
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
      </div>
    </>
  );
}
