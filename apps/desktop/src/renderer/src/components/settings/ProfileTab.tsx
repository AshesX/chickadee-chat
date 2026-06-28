import { useState } from 'react';
import { AvatarCropModal } from '../AvatarCropModal';
import { USER_COLORS } from '../../lib/userColors';
import type { SettingsModalProps } from './types';

type ProfileTabProps = Pick<
  SettingsModalProps,
  'avatarDataUrl' | 'selfColor' | 'onChangeAvatar' | 'accentColor' | 'onChangeAccent'
> & {
  name: string;
  setName: (name: string) => void;
  commitName: () => void;
};

export function ProfileTab({
  name,
  setName,
  commitName,
  avatarDataUrl,
  selfColor,
  onChangeAvatar,
  accentColor,
  onChangeAccent,
}: ProfileTabProps): React.JSX.Element {
  const [cropOpen, setCropOpen] = useState(false);

  return (
    <>
      <div id="section-avatar" className="settings-subdivision">Avatar</div>
      <div className="avatar-settings-row">
        <div
          className="avatar-settings-preview"
          style={avatarDataUrl ? undefined : { background: selfColor }}
        >
          {avatarDataUrl ? (
            <img src={avatarDataUrl} alt="Your avatar" className="avatar-settings-preview__img" />
          ) : (
            <span className="avatar-settings-preview__initial">
              {name.trim().charAt(0).toUpperCase() || '?'}
            </span>
          )}
        </div>
        <div className="avatar-settings-actions">
          <button
            className="seg-btn"
            onClick={() => setCropOpen(true)}
          >
            {avatarDataUrl ? 'Change Avatar' : 'Set Avatar'}
          </button>
          {avatarDataUrl && (
            <button
              className="seg-btn avatar-settings-remove"
              onClick={() => onChangeAvatar(null)}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div id="section-display-name" className="settings-subdivision" style={{ marginTop: 'var(--s-4)' }}>Display Name</div>
      <label className="field">
        <span>Display name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && commitName()}
          maxLength={32}
          autoFocus
        />
      </label>

      <div id="section-accent" className="settings-subdivision" style={{ marginTop: 'var(--s-4)' }}>Accent Color</div>
      <span className="hint">Avatar ring and speaking glow color. Auto-assigns if cleared.</span>
      <div className="accent-swatches">
        {USER_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`accent-swatch${accentColor.toLowerCase() === c.toLowerCase() ? ' accent-swatch--active' : ''}`}
            style={{ background: c }}
            onClick={() => onChangeAccent(c)}
            aria-label={`Use accent color ${c}`}
          />
        ))}
        {accentColor && !USER_COLORS.some((c) => c.toLowerCase() === accentColor.toLowerCase()) && (
          <button
            type="button"
            className="accent-swatch accent-swatch--active"
            style={{ background: accentColor }}
            onClick={() => {}}
            aria-label={`Use custom accent color ${accentColor}`}
          />
        )}
        <label
          className="accent-swatch accent-swatch--custom"
          aria-label="Pick a custom accent color"
        >
          +
          <input
            type="color"
            value={accentColor || selfColor}
            onChange={(e) => onChangeAccent(e.target.value)}
          />
        </label>
        {accentColor && (
          <button type="button" className="seg-btn accent-reset" onClick={() => onChangeAccent('')}>
            Reset to auto
          </button>
        )}
      </div>

      {cropOpen && (
        <AvatarCropModal
          onSave={(dataUrl) => {
            onChangeAvatar(dataUrl);
            setCropOpen(false);
          }}
          onCancel={() => setCropOpen(false)}
        />
      )}
    </>
  );
}
