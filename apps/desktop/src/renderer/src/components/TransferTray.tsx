import { ArrowDown, ArrowUp, FolderOpen, X } from 'lucide-react';
import { formatBytes, formatRate, isTerminalStatus } from '../webrtc/fileTransferPolicy';
import type { TransferCard } from '../hooks/useFileTransfers';

interface TransferTrayProps {
  transfers: TransferCard[];
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
  onShowInFolder: (id: string) => void;
}

/** One-line status for the settled / pre-transfer phases. */
function statusLabel(t: TransferCard): string | null {
  switch (t.status) {
    case 'awaiting-accept':
      return 'Waiting for accept…';
    case 'connecting':
      return 'Connecting…';
    case 'finishing':
      return 'Finishing…';
    case 'done':
      return t.direction === 'send' ? 'Sent' : 'Received';
    case 'declined':
      return 'Declined';
    case 'cancelled':
      return 'Cancelled';
    case 'error':
      return t.error ?? 'Failed';
    default:
      return null;
  }
}

/**
 * Floating bottom-right stack of file-transfer cards: direction, filename,
 * peer, progress bar, live rate, and cancel/dismiss. Terminal receive cards
 * offer "Show in folder". Renders nothing while no transfers exist.
 */
export function TransferTray({ transfers, onCancel, onDismiss, onShowInFolder }: TransferTrayProps): React.JSX.Element | null {
  if (transfers.length === 0) return null;
  return (
    <div className="transfer-tray">
      {transfers.map((t) => {
        const terminal = isTerminalStatus(t.status);
        const pct = t.size > 0 ? Math.min(100, (t.bytesDone / t.size) * 100) : t.status === 'done' ? 100 : 0;
        const label = statusLabel(t);
        return (
          <div key={t.id} className="transfer-card">
            <div className="transfer-card__head">
              <span className="transfer-card__dir">
                {t.direction === 'send' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
              </span>
              <span className="transfer-card__name" title={t.fileName}>
                {t.fileName}
              </span>
              <button
                className="icon-btn icon-btn--sm"
                title={terminal ? 'Dismiss' : 'Cancel transfer'}
                aria-label={terminal ? 'Dismiss' : 'Cancel transfer'}
                onClick={() => (terminal ? onDismiss(t.id) : onCancel(t.id))}
              >
                <X size={13} />
              </button>
            </div>
            <div className="transfer-card__peer">
              {t.direction === 'send' ? 'to' : 'from'} {t.peerName}
            </div>
            <div className="transfer-card__track">
              <div
                className={`transfer-card__fill${t.status === 'error' || t.status === 'cancelled' || t.status === 'declined' ? ' transfer-card__fill--error' : ''}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="transfer-card__foot">
              {t.status === 'transferring' ? (
                <span>
                  {formatBytes(t.bytesDone)} / {formatBytes(t.size)}
                  {t.rateBps > 0 ? ` · ${formatRate(t.rateBps)}` : ''}
                </span>
              ) : (
                <span>{label}</span>
              )}
              {t.canReveal && t.status === 'done' && (
                <button className="transfer-card__reveal" onClick={() => onShowInFolder(t.id)}>
                  <FolderOpen size={12} />
                  Show in folder
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
