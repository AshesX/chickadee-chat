import { useState } from 'react';
import { Modal } from './Modal';
import { AdvancedConnectionSettings } from './AdvancedConnectionSettings';
import type { SpaceInfo } from '@chickadee/shared';

interface SpaceSettingsModalProps {
  space: SpaceInfo;
  onSave: (name: string, customSignalingUrl: string, joinSecret: string) => void;
  onClose: () => void;
}

export function SpaceSettingsModal({ space, onSave, onClose }: SpaceSettingsModalProps): React.JSX.Element {
  const [name, setName] = useState(space.name);
  const [customSignalingUrl, setCustomSignalingUrl] = useState(space.customSignalingUrl ?? '');
  const [joinSecret, setJoinSecret] = useState(space.joinSecret ?? '');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function handleSave(): void {
    onSave(name.trim(), customSignalingUrl.trim(), joinSecret.trim());
  }

  // Generate safe slug for preview
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'space';

  return (
    <Modal title={`Settings: ${space.name}`} onClose={onClose}>
      <div className="field">
        <label className="field-label">Space Name</label>
        <input
          className="welcome__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter new space name"
        />
        {name.trim().toLowerCase() !== space.name.toLowerCase() && (
          <span className="settings-row__hint" style={{ marginTop: '6px', display: 'block', color: '#f59e0b', fontSize: '11px', fontWeight: '500' }}>
            ⚠️ Changing name will regenerate invite code to: <strong>{slug}-xxxxx</strong>. Active members in the space will update automatically. Others must receive the new code.
          </span>
        )}
      </div>

      <AdvancedConnectionSettings
        customSignalingUrl={customSignalingUrl}
        setCustomSignalingUrl={setCustomSignalingUrl}
        joinSecret={joinSecret}
        setJoinSecret={setJoinSecret}
        advancedOpen={advancedOpen}
        setAdvancedOpen={setAdvancedOpen}
        onEnterKeyDown={handleSave}
      />

      <button className="modal-action" onClick={handleSave} style={{ marginTop: '24px' }} disabled={!name.trim()}>
        Save Settings
      </button>
    </Modal>
  );
}
