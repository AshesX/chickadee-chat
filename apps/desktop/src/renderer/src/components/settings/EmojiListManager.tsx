import { useRef } from 'react';
import { X, Plus } from 'lucide-react';

/**
 * Editable emoji chip list used by the Chat settings tab (Favorites + Quick
 * Reactions). Typing/pasting into the trailing add-field appends any emoji
 * chars (de-duplicated, capped at `max`); each chip removes on click of its X.
 */
export function EmojiListManager({
  emojis,
  onChange,
  max,
}: {
  emojis: string[];
  onChange: (emojis: string[]) => void;
  max: number;
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const chars = Array.from(e.target.value.trim());
    if (chars.length > 0) {
      onChange(Array.from(new Set([...emojis, ...chars])).slice(0, max));
    }
    e.target.value = '';
  };

  const handleRemove = (index: number): void => {
    const next = [...emojis];
    next.splice(index, 1);
    onChange(next);
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
            <input ref={inputRef} type="text" onChange={handleInputChange} placeholder="😃" />
          </div>
        )}
      </div>
      <div className="hint">Max {max} emojis. Tip: Use OS emoji picker (Win + .)</div>
    </div>
  );
}
