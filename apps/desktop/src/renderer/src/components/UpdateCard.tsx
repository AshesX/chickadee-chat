import { X } from 'lucide-react';
import type { AppUpdateState } from '../hooks/useAppUpdate';

interface UpdateCardProps extends AppUpdateState {
  onDownload: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}

/**
 * Floating card mirroring TransferTray's visual language, but a single card:
 * an update never downloads without the user clicking Download here first.
 * Renders nothing outside the available/downloading/downloaded states — the
 * silent background check (idle/checking/not-available/error) stays invisible.
 */
export function UpdateCard({
  status,
  version,
  percent,
  onDownload,
  onInstall,
  onDismiss,
}: UpdateCardProps): React.JSX.Element | null {
  if (status !== 'available' && status !== 'downloading' && status !== 'downloaded') return null;

  return (
    <div className="update-card-tray">
      <div className="transfer-card update-card">
        <div className="transfer-card__head">
          <span className="transfer-card__name">
            {status === 'downloaded' ? 'Update ready' : 'Update available'}
            {version ? ` — v${version}` : ''}
          </span>
          {status !== 'downloading' && (
            <button
              className="icon-btn icon-btn--sm"
              title="Dismiss"
              aria-label="Dismiss"
              onClick={onDismiss}
            >
              <X size={13} />
            </button>
          )}
        </div>
        {status === 'downloading' && (
          <div className="transfer-card__track">
            <div className="transfer-card__fill" style={{ width: `${percent}%` }} />
          </div>
        )}
        <div className="transfer-card__foot">
          {status === 'available' && (
            <button className="btn btn--primary update-card__action" onClick={onDownload}>
              Download
            </button>
          )}
          {status === 'downloading' && <span>{Math.round(percent)}%</span>}
          {status === 'downloaded' && (
            <button className="btn btn--primary update-card__action" onClick={onInstall}>
              Restart &amp; Update
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
