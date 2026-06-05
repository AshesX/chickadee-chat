import { useState } from 'react';
import { Modal } from './Modal';

interface SettingsModalProps {
  displayName: string;
  onChangeName: (name: string) => void;
  onClose: () => void;
}

/**
 * Minimal settings for 6A: edit the display name. Push-to-talk rebinding,
 * noise suppression, device pickers, etc. arrive in later sub-phases.
 */
export function SettingsModal({
  displayName,
  onChangeName,
  onClose,
}: SettingsModalProps): React.JSX.Element {
  const [name, setName] = useState(displayName);

  function save(): void {
    const trimmed = name.trim();
    if (trimmed) onChangeName(trimmed);
    onClose();
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <label className="field">
        <span>Display name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          maxLength={32}
        />
      </label>

      <p className="settings-note">
        More settings — push-to-talk key, noise suppression, audio devices — are coming soon.
      </p>

      <button className="modal-action" onClick={save} disabled={!name.trim()}>
        Save
      </button>
    </Modal>
  );
}
