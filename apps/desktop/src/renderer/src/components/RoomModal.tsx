import { useState } from 'react';
import { Mic, Video } from 'lucide-react';
import { capacityForType, type RoomType } from '@chickadee/shared';
import { Modal } from './Modal';
import { ROOM_ICONS, RoomIcon } from './RoomIcon';

interface RoomModalProps {
  title: string;
  submitLabel: string;
  initialLabel?: string;
  initialIcon?: string;
  initialType?: RoomType;
  /** Show the Voice/Video segmented picker (create only; type is fixed on rename). */
  showTypePicker?: boolean;
  onSubmit: (label: string, icon: string, type: RoomType) => void;
  onClose: () => void;
}

/** Create-or-rename a room: optional type picker + name input + SVG icon search picker. */
export function RoomModal({
  title,
  submitLabel,
  initialLabel = '',
  initialIcon = '',
  initialType = 'voice',
  showTypePicker = false,
  onSubmit,
  onClose,
}: RoomModalProps): React.JSX.Element {
  const [label, setLabel] = useState(initialLabel);
  const [type, setType] = useState<RoomType>(initialType);

  // Clean default: if initialIcon is not in the list of custom SVGs (e.g. legacy emoji), fall back to ROOM_ICONS[0]
  const defaultIcon = ROOM_ICONS.includes(initialIcon) ? initialIcon : ROOM_ICONS[0];
  const [icon, setIcon] = useState(defaultIcon);
  const [search, setSearch] = useState('');

  function submit(): void {
    const trimmed = label.trim();
    if (trimmed) onSubmit(trimmed, icon, type);
  }

  const filteredIcons = ROOM_ICONS.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal title={title} onClose={onClose}>
      {showTypePicker && (
        <div className="field" style={{ marginBottom: '14px' }}>
          <span>Room type</span>
          <div className="seg-group seg-group--room-type">
            <button
              className={`seg-btn${type === 'voice' ? ' seg-btn--active' : ''}`}
              onClick={() => setType('voice')}
            >
              <Mic size={13} /> Voice <span className="seg-btn__cap"> (max {capacityForType('voice')} users)</span>
            </button>
            <button
              className={`seg-btn${type === 'video' ? ' seg-btn--active' : ''}`}
              onClick={() => setType('video')}
            >
              <Video size={13} /> Video <span className="seg-btn__cap"> (max {capacityForType('video')} users)</span>
            </button>
          </div>
        </div>
      )}

      <label className="field" style={{ marginBottom: '14px' }}>
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
              <RoomIcon name={name} size={20} />
            </button>
          ))}
          {filteredIcons.length === 0 && (
            <div style={{ gridColumn: 'span 6', textAlign: 'center', padding: '20px', color: 'var(--dim)', fontSize: '12.5px' }}>
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

