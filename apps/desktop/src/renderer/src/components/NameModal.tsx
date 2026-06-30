import { useState } from 'react';
import { Logo } from './Logo';

interface NameModalProps {
  onSubmit: (name: string) => void;
}

/** First-run, non-dismissable prompt for the user's display name. */
export function NameModal({ onSubmit }: NameModalProps): React.JSX.Element {
  const [name, setName] = useState('');

  function submit(): void {
    const trimmed = name.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <div className="backdrop backdrop--scrim backdrop--modal">
      <div className="modal-panel modal-panel--welcome" onClick={(e) => e.stopPropagation()}>
        <Logo size={64} className="welcome__logo" />
        <h2 className="welcome__title">
          Welcome to Chickadee <span className="sidebar__wordmark-accent">CHAT</span>
        </h2>
        <p className="welcome__sub">Pick a display name to get started.</p>
        <input
          className="welcome__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="e.g. Birby"
          autoFocus
          maxLength={32}
        />
        <button className="btn btn--primary btn--block" onClick={submit} disabled={!name.trim()}>
          Enter the lounge
        </button>
      </div>
    </div>
  );
}
