import { useState } from 'react';
import { Modal } from './Modal';
import { ROOM_ICONS, RoomIcon } from './RoomIcon';

interface RoomModalProps {
  title: string;
  submitLabel: string;
  initialLabel?: string;
  initialIcon?: string;
  onSubmit: (label: string, icon: string) => void;
  onClose: () => void;
}

/** Create-or-rename a room: name input + SVG icon search picker. (Rooms are unified
 *  hybrid — audio + optional golden-ratio video — so there's no type picker.) */
export function RoomModal({
  title,
  submitLabel,
  initialLabel = '',
  initialIcon = '',
  onSubmit,
  onClose,
}: RoomModalProps): React.JSX.Element {
  const [label, setLabel] = useState(initialLabel);

  // Clean default: if initialIcon is not in the list of custom SVGs (e.g. legacy emoji), fall back to ROOM_ICONS[0]
  const defaultIcon = ROOM_ICONS.includes(initialIcon) ? initialIcon : ROOM_ICONS[0];
  const [icon, setIcon] = useState(defaultIcon);
  const [search, setSearch] = useState('');

  function submit(): void {
    const trimmed = label.trim();
    if (trimmed) onSubmit(trimmed, icon);
  }

  const filteredIcons = ROOM_ICONS.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal title={title} onClose={onClose}>
      <label className="field" style={{ marginBottom: 'var(--s-4)' }}>
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

      <div className="field">
        <span>Icon</span>
        <input
          type="text"
          className="room-modal__search-input"
          placeholder="Search icons..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 0 }}
        />
      </div>

      <div className="room-modal__icon-container">
        <div className="icon-grid">
          {filteredIcons.map((name) => (
            <button
              key={name}
              className={`icon-grid__item${icon === name ? ' icon-grid__item--active' : ''}`}
              onClick={() => setIcon(name)}
              title={name.replace(/-/g, ' ')}
            >
              <RoomIcon name={name} size={32} />
            </button>
          ))}
          {filteredIcons.length === 0 && (
            <div style={{ gridColumn: 'span 6', textAlign: 'center', padding: 'var(--s-5)', color: 'var(--dim)', fontSize: 'var(--fs-1)' }}>
              No icons found
            </div>
          )}
        </div>
      </div>

      <button className="btn btn--primary" onClick={submit} disabled={!label.trim()}>
        {submitLabel}
      </button>
    </Modal>
  );
}

