import { Modal } from './Modal';
import { Logo } from './Logo';
import { getAppVersion } from '../lib/appInfo';

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps): React.JSX.Element {
  return (
    <Modal title="About" onClose={onClose}>
      <div className="about-modal">
        <Logo size={48} staticLogo />
        <div className="about-modal__name">Chickadee Chat</div>
        <div className="about-modal__version">Version {getAppVersion()}</div>
        <p className="about-modal__tagline">
          A lightweight peer-to-peer voice, video, and screen-share app.
        </p>
      </div>
    </Modal>
  );
}
