import { useState } from 'react';
import { Modal } from './Modal';
import { AdvancedConnectionSettings } from './AdvancedConnectionSettings';
import { AvatarCropModal } from './AvatarCropModal';
import { userColor } from '../lib/settings';
import { MAX_BANNER_DATA_URL_LEN, sanitizeBannerDataUrl, type SpaceInfo } from '@chickadee/shared';

// The banner is authored for the sidebar's widest resizable state (base 280px *
// max 2.0x scale, see useSidebarResize.ts) at its fixed header height (176px,
// see .sidebar__space-header--banner in styles.css), so object-fit:cover never
// has to guess an aspect ratio that doesn't match what's actually rendered.
// Cropped at 2x pixel density for crisp rendering on HiDPI displays.
const SIDEBAR_MAX_WIDTH_PX = 560;
const BANNER_HEADER_HEIGHT_PX = 176;
const BANNER_PIXEL_DENSITY = 2;
const BANNER_OUTPUT_WIDTH = SIDEBAR_MAX_WIDTH_PX * BANNER_PIXEL_DENSITY;
const BANNER_OUTPUT_HEIGHT = BANNER_HEADER_HEIGHT_PX * BANNER_PIXEL_DENSITY;

interface SpaceSettingsModalProps {
  space: SpaceInfo;
  /** Stable userId of the current user, to check against `space.ownerId`. */
  myUserId: string;
  onSave: (name: string, customSignalingUrl: string, joinSecret: string) => void;
  /** Owner-only: set/change/clear the Space banner. Live-sends immediately (not batched into onSave). */
  onSaveBanner: (spaceId: string, bannerDataUrl: string | null) => void;
  /** First-claim-wins ownership claim, shown when the Space has no recorded owner yet. */
  onClaimOwnership: (spaceId: string) => void;
  onClose: () => void;
}

export function SpaceSettingsModal({ space, myUserId, onSave, onSaveBanner, onClaimOwnership, onClose }: SpaceSettingsModalProps): React.JSX.Element {
  const [name, setName] = useState(space.name);
  const [customSignalingUrl, setCustomSignalingUrl] = useState(space.customSignalingUrl ?? '');
  const [joinSecret, setJoinSecret] = useState(space.joinSecret ?? '');
  const [bannerDataUrl, setBannerDataUrl] = useState<string | null>(sanitizeBannerDataUrl(space.bannerDataUrl));
  const [bannerCropOpen, setBannerCropOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isOwner = space.ownerId === myUserId;

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
        <label className="field-label">Space Banner</label>
        {isOwner ? (
          <>
            <div
              className="space-banner-settings-preview"
              style={bannerDataUrl ? undefined : { background: userColor(space.id) }}
            >
              {bannerDataUrl && (
                <img src={bannerDataUrl} alt="" className="space-banner-settings-preview__img" />
              )}
            </div>
            <div className="avatar-settings-actions avatar-settings-actions--row">
              <button className="seg-btn" onClick={() => setBannerCropOpen(true)}>
                {bannerDataUrl ? 'Change Banner' : 'Set Banner'}
              </button>
              {bannerDataUrl && (
                <button
                  className="seg-btn avatar-settings-remove"
                  onClick={() => {
                    setBannerDataUrl(null);
                    onSaveBanner(space.id, null);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </>
        ) : (
          <span className="hint">
            Only the Space Owner can set the banner.
            {!space.ownerId && (
              <button
                className="seg-btn"
                style={{ marginLeft: 'var(--s-2)' }}
                onClick={() => onClaimOwnership(space.id)}
              >
                Claim ownership
              </button>
            )}
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

      <button className="btn btn--primary" onClick={handleSave} style={{ marginTop: 'var(--s-6)' }} disabled={!name.trim()}>
        Save Settings
      </button>

      {bannerCropOpen && (
        <AvatarCropModal
          outputWidth={BANNER_OUTPUT_WIDTH}
          outputHeight={BANNER_OUTPUT_HEIGHT}
          title="Set Space Banner"
          saveLabel="Save Banner"
          maxDataUrlLen={MAX_BANNER_DATA_URL_LEN}
          onSave={(dataUrl) => {
            setBannerDataUrl(dataUrl);
            onSaveBanner(space.id, dataUrl);
            setBannerCropOpen(false);
          }}
          onCancel={() => setBannerCropOpen(false)}
        />
      )}
    </Modal>
  );
}
