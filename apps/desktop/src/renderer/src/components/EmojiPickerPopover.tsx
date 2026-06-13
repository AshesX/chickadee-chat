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
    emojis: ['❤️', '✨', '🌟', '💯', '👀', '💬', '🚀', '💡', '❌', '✅', '⚠️', '💀'],
  },
];

export function EmojiPickerPopover({ onSelectEmoji, onClose, anchorRect, onMouseEnter, onMouseLeave }: EmojiPickerPopoverProps): React.JSX.Element {
  const menuWidth = 260;
  const gap = 8;

  const bottom = window.innerHeight - anchorRect.top + gap;
  const rawLeft = anchorRect.left + anchorRect.width / 2 - menuWidth / 2;
  const left = Math.max(8, Math.min(rawLeft, window.innerWidth - menuWidth - 8));

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div
        className="emoji-picker-pop"
        style={{ bottom, left, width: menuWidth }}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
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
      </div>
    </>
  );
}
