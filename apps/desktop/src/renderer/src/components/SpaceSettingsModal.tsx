import { useState } from 'react';
import { Modal } from './Modal';
import type { SpaceInfo } from '@chickadee/shared';

interface SpaceSettingsModalProps {
  space: SpaceInfo;
  onSave: (customSignalingUrl: string, joinSecret: string) => void;
  onClose: () => void;
}

export function SpaceSettingsModal({ space, onSave, onClose }: SpaceSettingsModalProps): React.JSX.Element {
  const [customSignalingUrl, setCustomSignalingUrl] = useState(space.customSignalingUrl ?? '');
  const [joinSecret, setJoinSecret] = useState(space.joinSecret ?? '');

  function handleSave(): void {
    onSave(customSignalingUrl.trim(), joinSecret.trim());
  }

  return (
    <Modal title={`Settings: ${space.name}`} onClose={onClose}>
      <div className="field">
        <label className="field-label">Signaling Server URL</label>
        <input
          className="welcome__input"
          value={customSignalingUrl}
          onChange={(e) => setCustomSignalingUrl(e.target.value)}
          placeholder="e.g. wss://chickadee.example.com"
        />
        <span className="settings-row__hint" style={{ marginTop: '4px', display: 'block' }}>
          Leave blank to use the default public server.
        </span>
      </div>
      <div className="field" style={{ marginTop: '16px' }}>
        <label className="field-label">Join Secret / Password</label>
        <input
          className="welcome__input"
          type="password"
          value={joinSecret}
          onChange={(e) => setJoinSecret(e.target.value)}
          placeholder="Leave blank for public servers"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
        />
        <span className="settings-row__hint" style={{ marginTop: '4px', display: 'block' }}>
          Required only if the signaling server has a CHICKADEE_JOIN_SECRET configured.
        </span>
      </div>
      <button className="modal-action" onClick={handleSave} style={{ marginTop: '24px' }}>
        Save Settings
      </button>
    </Modal>
  );
}
