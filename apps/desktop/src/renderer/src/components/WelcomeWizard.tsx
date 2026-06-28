import { useState, useEffect, useRef } from 'react';
import { Logo } from './Logo';
import { AdvancedConnectionSettings } from './AdvancedConnectionSettings';
import type { AddSpaceResult } from '../hooks/useSpaces';

interface WelcomeWizardProps {
  onSubmit: (displayName: string, spaceNameOrCode: string, action: 'create' | 'join', customSignalingUrl?: string, joinSecret?: string) => Promise<AddSpaceResult>;
}

export function WelcomeWizard({ onSubmit }: WelcomeWizardProps): React.JSX.Element {
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState('');
  const [action, setAction] = useState<'create' | 'join'>('create');
  const [spaceValue, setSpaceValue] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customSignalingUrl, setCustomSignalingUrl] = useState('');
  const [joinSecret, setJoinSecret] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function tryFocus(): void {
      inputRef.current?.focus();
    }
    window.addEventListener('focus', tryFocus);
    const timer = setTimeout(tryFocus, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', tryFocus);
    };
  }, [step, action]);

  function next(): void {
    if (displayName.trim()) {
      setStep(2);
    }
  }

  async function finish(): Promise<void> {
    const name = displayName.trim();
    const val = spaceValue.trim();
    if (!name || !val || checking) return;
    setError(null);
    setChecking(true);
    const result = await onSubmit(name, val, action, customSignalingUrl.trim() || undefined, joinSecret || undefined);
    // On success the wizard unmounts (onboarding completes); only surface failures.
    if (!result.ok) {
      setChecking(false);
      setError(
        result.reason === 'unreachable'
          ? "Couldn't reach the signaling server — check your connection."
          : 'That Space does not exist (or no one is currently in it).',
      );
    }
  }

  return (
    <div className="backdrop backdrop--scrim" style={{ zIndex: 100 }}>
      <div className="modal-panel modal-panel--welcome">
        <Logo size={64} className="welcome__logo" />
        <h2 className="welcome__title">
          Welcome to Chickadee <span className="sidebar__wordmark-accent">CHAT</span>
        </h2>

        {step === 1 ? (
          <>
            <p className="welcome__sub">Choose a display name to get started.</p>
            <input
              ref={inputRef}
              className="welcome__input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && next()}
              placeholder="e.g. Birby"
              maxLength={32}
            />
            <button
              className="btn btn--primary btn--lg btn--block"
              onClick={next}
              disabled={!displayName.trim()}
            >
              Next
            </button>
          </>
        ) : (
          <>
            <p className="welcome__sub">Create your own private space or join an existing one.</p>

            <div className="seg-group" style={{ marginBottom: '16px', width: '100%' }}>
              <button
                className={`seg-btn ${action === 'create' ? 'seg-btn--active' : ''}`}
                style={{ flex: 1, textAlign: 'center' }}
                onClick={() => {
                  setAction('create');
                  setSpaceValue('');
                  setError(null);
                }}
              >
                Create Space
              </button>
              <button
                className={`seg-btn ${action === 'join' ? 'seg-btn--active' : ''}`}
                style={{ flex: 1, textAlign: 'center' }}
                onClick={() => {
                  setAction('join');
                  setSpaceValue('');
                  setError(null);
                }}
              >
                Join Space
              </button>
            </div>

            <div className="field" style={{ width: '100%', marginBottom: '18px' }}>
              {action === 'create' ? (
                <>
                  <label className="field-label" style={{ textAlign: 'left' }}>Space Name</label>
                  <input
                    ref={inputRef}
                    className="welcome__input"
                    value={spaceValue}
                    onChange={(e) => setSpaceValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void finish(); }}
                    placeholder="e.g. Midnight Lounge"
                    maxLength={32}
                    disabled={checking}
                  />
                </>
              ) : (
                <>
                  <label className="field-label" style={{ textAlign: 'left' }}>Invite Code / Space ID</label>
                  <input
                    ref={inputRef}
                    className="welcome__input"
                    value={spaceValue}
                    onChange={(e) => { setSpaceValue(e.target.value); setError(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void finish(); }}
                    placeholder="e.g. midnight-lounge-7f8a3"
                    disabled={checking}
                  />
                </>
              )}

              {error && <p className="field-error">{error}</p>}

              <AdvancedConnectionSettings
                customSignalingUrl={customSignalingUrl}
                setCustomSignalingUrl={setCustomSignalingUrl}
                joinSecret={joinSecret}
                setJoinSecret={setJoinSecret}
                advancedOpen={advancedOpen}
                setAdvancedOpen={setAdvancedOpen}
                onEnterKeyDown={() => void finish()}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button
                className="btn btn--ghost btn--lg"
                style={{ border: '1px solid var(--border)', flex: 1 }}
                onClick={() => { setStep(1); setError(null); }}
                disabled={checking}
              >
                Back
              </button>
              <button
                className="btn btn--primary btn--lg"
                style={{ flex: 2 }}
                onClick={() => void finish()}
                disabled={!spaceValue.trim() || checking}
              >
                {checking ? 'Checking…' : 'Finish'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
