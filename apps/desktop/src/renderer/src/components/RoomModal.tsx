import { useState } from 'react';
import { Modal } from './Modal';

interface RoomModalProps {
  title: string;
  submitLabel: string;
  initialLabel?: string;
  initialIcon?: string;
  onSubmit: (label: string, icon: string) => void;
  onClose: () => void;
}

const ROOM_ICONS = ['💬', '🎮', '🛋️', '🏠', '⚔️', '🔥', '🌙', '🚀', '🎯', '🏆', '👾', '🍕', '🛸', '🐉'];

/** Create-or-rename a room: name input + emoji icon picker. */
export function RoomModal({
  title,
  submitLabel,
  initialLabel = '',
  initialIcon = ROOM_ICONS[0],
  onSubmit,
  onClose,
}: RoomModalProps): React.JSX.Element {
  const [label, setLabel] = useState(initialLabel);
  const [icon, setIcon] = useState(initialIcon);

  function submit(): void {
    const trimmed = label.trim();
    if (trimmed) onSubmit(trimmed, icon);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <label className="field">
        <span>Room name</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="e.g. Raid Night"
          autoFocus
          maxLength={24}
        />
      </label>

      <span className="field-label">Icon</span>
      <div className="icon-grid">
        {ROOM_ICONS.map((emoji) => (
          <button
            key={emoji}
            className={`icon-grid__item${icon === emoji ? ' icon-grid__item--active' : ''}`}
            onClick={() => setIcon(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>

      <button className="modal-action" onClick={submit} disabled={!label.trim()}>
        {submitLabel}
      </button>
    </Modal>
  );
}
