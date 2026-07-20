import { Modal } from './Modal';
import { LEGAL_NOTICES } from '../lib/legalNotices';

interface LegalModalProps {
  onClose: () => void;
}

export function LegalModal({ onClose }: LegalModalProps): React.JSX.Element {
  return (
    <Modal title="Legal Information" onClose={onClose} wide>
      <p className="legal-modal__intro">
        Chickadee Chat is built with the following open-source software and assets.
      </p>
      <ul className="legal-modal__list">
        {LEGAL_NOTICES.map((entry) => (
          <li key={entry.name} className="legal-modal__entry">
            <div className="legal-modal__entry-head">
              <span className="legal-modal__entry-name">{entry.name}</span>
              <a href={entry.licenseUrl} target="_blank" rel="noreferrer">
                {entry.license}
              </a>
            </div>
            {entry.note && <p className="hint legal-modal__entry-note">{entry.note}</p>}
            {entry.sourceUrl && (
              <a className="legal-modal__entry-source" href={entry.sourceUrl} target="_blank" rel="noreferrer">
                Source
              </a>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
