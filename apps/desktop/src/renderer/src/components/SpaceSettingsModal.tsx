import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { AdvancedConnectionSettings } from './AdvancedConnectionSettings';
import { AvatarCropModal } from './AvatarCropModal';
import { useDismissTimeout } from '../hooks/useDismissTimeout';
import { userColor } from '../lib/userColors';
import { SIDEBAR_HEADER_HEIGHT_PX, SIDEBAR_MAX_WIDTH_PX } from '../lib/spaceHeader';
import { MAX_BANNER_DATA_URL_LEN, sanitizeBannerDataUrl, type SpaceInfo } from '@chickadee/shared';

/** An online space member offered as a transfer-of-ownership target. */
export interface TransferCandidate {
  userId: string;
  name: string;
}

// The banner is authored for the sidebar's widest resizable state at its fixed
// header height (see lib/spaceHeader.ts), so object-fit:cover never has to
// guess an aspect ratio that doesn't match what's actually rendered. Cropped
// at 2x pixel density for crisp rendering on HiDPI displays.
const BANNER_PIXEL_DENSITY = 2;
const BANNER_OUTPUT_WIDTH = SIDEBAR_MAX_WIDTH_PX * BANNER_PIXEL_DENSITY;
const BANNER_OUTPUT_HEIGHT = SIDEBAR_HEADER_HEIGHT_PX * BANNER_PIXEL_DENSITY;

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
  /** Whether the app is live-connected to THIS space (moderation actions need the live socket). */
  isLive: boolean;
  /** Whether this Space is currently locked to newcomers (live value when connected, else persisted). */
  spaceLocked: boolean;
  /** Owner-only: lock/unlock the Space to newcomers. */
  onToggleSpaceLock: (locked: boolean) => void;
  /** Online space members (≠ self) offered as transfer targets. */
  onlineMembers: TransferCandidate[];
  /** Owner-only: hand ownership to an online member. */
  onTransferOwnership: (toUserId: string) => void;
  /** Owner-only: lift a ban. */
  onUnban: (userId: string) => void;
}

export function SpaceSettingsModal({ space, myUserId, onSave, onSaveBanner, onClaimOwnership, onClose, isLive, spaceLocked, onToggleSpaceLock, onlineMembers, onTransferOwnership, onUnban }: SpaceSettingsModalProps): React.JSX.Element {
  const [name, setName] = useState(space.name);
  const [customSignalingUrl, setCustomSignalingUrl] = useState(space.customSignalingUrl ?? '');
  const [joinSecret, setJoinSecret] = useState(space.joinSecret ?? '');
  const [bannerDataUrl, setBannerDataUrl] = useState<string | null>(sanitizeBannerDataUrl(space.bannerDataUrl));
  const [bannerCropOpen, setBannerCropOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferArmed, setTransferArmed] = useState(false);
  const { arm: armTransfer, cancel: cancelArmTransfer } = useDismissTimeout(() => setTransferArmed(false));

  function disarmTransfer(): void {
    cancelArmTransfer();
    setTransferArmed(false);
  }

  // Arm-then-confirm (mirrors the sidebar's Delete/Leave Space button): one
  // click grows Transfer into a labeled danger state instead of a native
  // window.confirm(); a second click (or the timeout lapsing) resolves it.
  function handleTransferClick(): void {
    const target = onlineMembers.find((m) => m.userId === transferTarget);
    if (!target) return;
    if (transferArmed) {
      disarmTransfer();
      onTransferOwnership(target.userId);
      setTransferTarget('');
    } else {
      setTransferArmed(true);
      armTransfer(4000);
    }
  }
  const isOwner = space.ownerId === myUserId;
  const bannedUsers = space.bannedUsers ?? [];

  function handleSave(): void {
    onSave(name.trim(), customSignalingUrl.trim(), joinSecret.trim());
  }

  return (
    <Modal title={`Settings: ${space.name}`} onClose={onClose}>
      <div className="field">
        <label className="field-label">Space Name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter new space name"
          // Renaming propagates to every member — owner-only (the server
          // rejects non-owner rename-space too). The invite code never changes.
          disabled={!isOwner}
          title={isOwner ? undefined : 'Only the Space Owner can rename the Space.'}
        />
        {!isOwner && (
          <span className="hint" style={{ marginTop: 'var(--s-2)', display: 'block' }}>
            Only the Space Owner can rename the Space.
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

      {isOwner && (
        <div className="field">
          <label className="field-label">Moderation</label>
          {!isLive && (
            <span className="hint" style={{ display: 'block', marginBottom: 'var(--s-2)' }}>
              Connect to this Space to change moderation settings.
            </span>
          )}

          <div className="mod-row">
            <span className="mod-row__label">
              {spaceLocked ? 'Space is locked — newcomers can’t join.' : 'Space is open to anyone with the invite code.'}
            </span>
            <button className="seg-btn" disabled={!isLive} onClick={() => onToggleSpaceLock(!spaceLocked)}>
              {spaceLocked ? 'Unlock Space' : 'Lock Space'}
            </button>
          </div>

          <div className="mod-row">
            <select
              className="input mod-row__select"
              value={transferTarget}
              disabled={!isLive || onlineMembers.length === 0}
              onChange={(e) => {
                // A stale armed confirmation for the PREVIOUS target would be
                // surprising to resolve against a newly-picked one — require
                // a fresh click-to-arm whenever the selection changes.
                if (transferArmed) disarmTransfer();
                setTransferTarget(e.target.value);
              }}
            >
              <option value="">
                {onlineMembers.length === 0 ? 'No online members to transfer to' : 'Transfer ownership to…'}
              </option>
              {onlineMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
            <button
              className={`seg-btn${transferArmed ? ' seg-btn--armed-danger' : ''}`}
              disabled={!isLive || !transferTarget}
              title={transferArmed ? undefined : 'You will lose owner powers.'}
              onClick={handleTransferClick}
            >
              {transferArmed ? (
                <>
                  <AlertTriangle size={12} />
                  <span>Confirm transfer?</span>
                </>
              ) : (
                'Transfer'
              )}
            </button>
          </div>

          {bannedUsers.length > 0 && (
            <div className="mod-banlist">
              {bannedUsers.map((b) => (
                <div key={b.userId} className="mod-row">
                  <span className="mod-row__label" title={b.userId}>
                    {b.displayName || b.userId}
                  </span>
                  <button className="seg-btn" disabled={!isLive} onClick={() => onUnban(b.userId)}>
                    Unban
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
