import { useState } from 'react';
import { Modal } from './Modal';
import { AdvancedConnectionSettings } from './AdvancedConnectionSettings';
import { AvatarCropModal } from './AvatarCropModal';
import { userColor } from '../lib/settings';
import { sanitizeAvatarDataUrl, type SpaceInfo } from '@chickadee/shared';

interface SpaceSettingsModalProps {
  space: SpaceInfo;
  onSave: (name: string, customSignalingUrl: string, joinSecret: string, iconDataUrl: string | null) => void;
  onClose: () => void;
}

export function SpaceSettingsModal({ space, onSave, onClose }: SpaceSettingsModalProps): React.JSX.Element {
  const [name, setName] = useState(space.name);
  const [customSignalingUrl, setCustomSignalingUrl] = useState(space.customSignalingUrl ?? '');
  const [joinSecret, setJoinSecret] = useState(space.joinSecret ?? '');
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(sanitizeAvatarDataUrl(space.iconDataUrl));
  const [cropOpen, setCropOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function handleSave(): void {
    onSave(name.trim(), customSignalingUrl.trim(), joinSecret.trim(), iconDataUrl);
  }

  // Generate safe slug for preview
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'space';

  return (
    <Modal title={`Settings: ${space.name}`} onClose={onClose}>
      <div className="field">
        <label className="field-label">Space Name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter new space name"
        />
        {name.trim().toLowerCase() !== space.name.toLowerCase() && (
          <span className="hint" style={{ marginTop: 'var(--s-2)', display: 'block', color: 'var(--orange)', fontSize: 'var(--fs-1)', fontWeight: 'var(--fw-1)' }}>
            ⚠️ Changing name will regenerate invite code to: <strong>{slug}-xxxxx</strong>. Active members in the space will update automatically. Others must receive the new code.
          </span>
        )}
      </div>

      <div className="field">
        <label className="field-label">Space Icon</label>
        <div className="avatar-settings-row">
          <div
            className="avatar-settings-preview"
            style={iconDataUrl ? undefined : { background: userColor(space.id) }}
          >
            {iconDataUrl ? (
              <img src={iconDataUrl} alt={`${name || 'Space'} icon`} className="avatar-settings-preview__img" />
            ) : (
              <span className="avatar-settings-preview__initial">
                {name.trim().charAt(0).toUpperCase() || '?'}
              </span>
            )}
          </div>
          <div className="avatar-settings-actions">
            <button className="seg-btn" onClick={() => setCropOpen(true)}>
              {iconDataUrl ? 'Change Icon' : 'Set Icon'}
            </button>
            {iconDataUrl && (
              <button className="seg-btn avatar-settings-remove" onClick={() => setIconDataUrl(null)}>
                Remove
              </button>
            )}
          </div>
        </div>
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

      <button className="btn btn--primary" onClick={handleSave} style={{ marginTop: 'var(--s-6)' }} disabled={!name.trim()}>
        Save Settings
      </button>

      {cropOpen && (
        <AvatarCropModal
          onSave={(dataUrl) => {
            setIconDataUrl(dataUrl);
            setCropOpen(false);
          }}
          onCancel={() => setCropOpen(false)}
        />
      )}
    </Modal>
  );
}
