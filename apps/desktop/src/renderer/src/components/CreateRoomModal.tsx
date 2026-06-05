import { useState } from 'react';
import { Modal } from './Modal';

interface CreateRoomModalProps {
  onCreate: (label: string, icon: string) => void;
  onClose: () => void;
}

const ROOM_ICONS = ['🏠', '⚔️', '🎮', '🔥', '🌙', '🚀', '🎯', '🏆', '👾', '🍕', '🛸', '🐉'];

export function CreateRoomModal({ onCreate, onClose }: CreateRoomModalProps): React.JSX.Element {
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState(ROOM_ICONS[0]);

  function submit(): void {
    const trimmed = label.trim();
    if (trimmed) onCreate(trimmed, icon);
  }

  return (
    <Modal title="Create a room" onClose={onClose}>
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
        Create room
      </button>
    </Modal>
  );
}
