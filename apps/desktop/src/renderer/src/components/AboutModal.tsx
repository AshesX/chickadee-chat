import { Modal } from './Modal';
import { Logo } from './Logo';
import { getAppVersion } from '../lib/appInfo';
import type { UpdateStatus } from '../hooks/useAppUpdate';

interface AboutModalProps {
  onClose: () => void;
  updateStatus: UpdateStatus;
  updateVersion: string | null;
  updateError: string | null;
  onCheckForUpdates: () => void;
}

/** One-line status under the version, for the manual "Check for Updates" click. */
function updateStatusLabel(status: UpdateStatus, version: string | null, error: string | null): string | null {
  switch (status) {
    case 'checking':
      return 'Checking for updates…';
    case 'not-available':
      return "You're up to date.";
    case 'available':
      return `Update available — v${version}`;
    case 'downloading':
      return 'Downloading update…';
    case 'downloaded':
      return `Update v${version} ready — restart to install.`;
    case 'error':
      return `Couldn't check for updates${error ? `: ${error}` : ''}`;
    default:
      return null;
  }
}

export function AboutModal({
  onClose,
  updateStatus,
  updateVersion,
  updateError,
  onCheckForUpdates,
}: AboutModalProps): React.JSX.Element {
  const statusLabel = updateStatusLabel(updateStatus, updateVersion, updateError);
  const checking = updateStatus === 'checking';

  return (
    <Modal title="About" onClose={onClose}>
      <div className="about-modal">
        <Logo size={48} staticLogo />
        <div className="about-modal__name">Chickadee Chat</div>
        <div className="about-modal__version">Version {getAppVersion()}</div>
        <p className="about-modal__tagline">
          A lightweight peer-to-peer voice, video, and screen-share app.
        </p>
        <button className="btn btn--ghost" disabled={checking} onClick={onCheckForUpdates}>
          Check for Updates
        </button>
        {statusLabel && <p className="about-modal__update-status">{statusLabel}</p>}
      </div>
    </Modal>
  );
}
