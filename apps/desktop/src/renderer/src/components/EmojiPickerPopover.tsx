import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { ChevronMenu } from './ChevronMenu';
import { CATEGORIES, searchEmojis } from '../lib/emojiData';
import { store } from '../lib/settings';
import { usePersistedState } from '../hooks/usePersistedState';

interface EmojiPickerPopoverProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
  anchorRect: DOMRect;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function EmojiPickerPopover({ onSelectEmoji, onClose, anchorRect, onMouseEnter, onMouseLeave }: EmojiPickerPopoverProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [customEmojis] = usePersistedState(store.getCustomEmojis, store.setCustomEmojis);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus the search input automatically when opened
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const searchResults = searchQuery.trim() ? searchEmojis(searchQuery) : [];

  const displaySections = searchQuery.trim() ? [
    { name: 'Search Results', emojis: searchResults }
  ] : [
    ...(customEmojis.length > 0 ? [{ name: 'Favorites', emojis: customEmojis }] : []),
    ...CATEGORIES
  ];

  return (
    <ChevronMenu anchorRect={anchorRect} onClose={onClose} className="emoji-picker-pop menu-surface menu-surface--frosted" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        <div className="search-field__wrap">
          <Search size={12} className="search-field__icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="search-field__input"
            placeholder="Search emojis…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && searchQuery) {
                e.stopPropagation();
                setSearchQuery('');
              }
            }}
          />
          {searchQuery && (
            <button
              className="search-field__clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setSearchQuery('')}
            >
              <X size={10} />
            </button>
          )}
        </div>
        
        <div className="emoji-picker-pop__scrollable">
          {displaySections.map((cat) => (
            cat.emojis.length > 0 && (
              <div key={cat.name} className="emoji-picker-pop__section">
                {displaySections.length > 1 && <div className="hint">{cat.name}</div>}
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
            )
          ))}
          {searchQuery.trim() && searchResults.length === 0 && (
            <div className="hint emoji-picker-pop__empty">No emojis found</div>
          )}
        </div>
    </ChevronMenu>
  );
}
