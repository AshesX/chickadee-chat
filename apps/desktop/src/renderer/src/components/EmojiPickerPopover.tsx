import { ChevronMenu } from './ChevronMenu';

interface EmojiPickerPopoverProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
  anchorRect: DOMRect;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

interface EmojiCategory {
  name: string;
  emojis: string[];
}

const CATEGORIES: EmojiCategory[] = [
  {
    name: 'Smileys',
    emojis: ['😀', '😂', '😊', '😇', '🥰', '😍', '😜', '😎', '🤔', '😴', '😭', '😱'],
  },
  {
    name: 'Gestures',
    emojis: ['👍', '👎', '👊', '✌️', '👋', '👏', '🙌', '🤝', '🙏', '💪', '🔥', '🎉'],
  },
  {
    name: 'Symbols',
    emojis: ['❤️', '🍆', '🌟', '💯', '👀', '💬', '🚀', '💡', '❌', '✅', '⚠️', '💀'],
  },
];

export function EmojiPickerPopover({ onSelectEmoji, onClose, anchorRect, onMouseEnter, onMouseLeave }: EmojiPickerPopoverProps): React.JSX.Element {
  return (
    <ChevronMenu anchorRect={anchorRect} onClose={onClose} width={260} className="emoji-picker-pop menu-surface menu-surface--frosted" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        {CATEGORIES.map((cat) => (
          <div key={cat.name} className="emoji-picker-pop__section">
            <div className="emoji-picker-pop__section-title">{cat.name}</div>
            <div className="emoji-picker-pop__grid">
              {cat.emojis.map((emoji) => (
                <button
                  key={emoji}
                  className="emoji-picker-pop__btn"
                  onClick={() => onSelectEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
    </ChevronMenu>
  );
}
