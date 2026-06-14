import { useState, useEffect, useRef } from 'react';
import { Logo } from './Logo';

interface WelcomeWizardProps {
  onSubmit: (displayName: string, spaceNameOrCode: string, action: 'create' | 'join', customSignalingUrl?: string, joinSecret?: string) => void;
}

export function WelcomeWizard({ onSubmit }: WelcomeWizardProps): React.JSX.Element {
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState('');
  const [action, setAction] = useState<'create' | 'join'>('create');
  const [spaceValue, setSpaceValue] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customSignalingUrl, setCustomSignalingUrl] = useState('');
  const [joinSecret, setJoinSecret] = useState('');

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

  function finish(): void {
    const name = displayName.trim();
    const val = spaceValue.trim();
    if (name && val) {
      onSubmit(name, val, action, customSignalingUrl.trim() || undefined, joinSecret || undefined);
    }
  }

  return (
    <div className="modal-overlay">
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
              className="welcome__btn"
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
                    onKeyDown={(e) => e.key === 'Enter' && finish()}
                    placeholder="e.g. Midnight Lounge"
                    maxLength={32}
                  />
                </>
              ) : (
                <>
                  <label className="field-label" style={{ textAlign: 'left' }}>Invite Code / Space ID</label>
                  <input
                    ref={inputRef}
                    className="welcome__input"
                    value={spaceValue}
                    onChange={(e) => setSpaceValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && finish()}
                    placeholder="e.g. midnight-lounge-7f8a3"
                  />
                </>
              )}

              <div style={{ marginTop: '8px' }}>
                <button
                  className="welcome__btn"
                  style={{ background: 'transparent', border: 'none', color: 'var(--dim)', textAlign: 'left', padding: '0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                >
                  {advancedOpen ? '▼ Hide' : '▶ Show'} Advanced Connection Settings
                </button>
                {advancedOpen && (
                  <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-mid)', borderRadius: 'var(--radius-panel)' }}>
                    <label className="field-label" style={{ textAlign: 'left' }}>Signaling Server URL (Optional)</label>
                    <input
                      className="welcome__input"
                      value={customSignalingUrl}
                      onChange={(e) => setCustomSignalingUrl(e.target.value)}
                      placeholder="e.g. wss://chickadee.example.com"
                      style={{ marginBottom: '12px' }}
                    />
                    <label className="field-label" style={{ textAlign: 'left' }}>Join Secret / Password (Optional)</label>
                    <input
                      className="welcome__input"
                      type="password"
                      value={joinSecret}
                      onChange={(e) => setJoinSecret(e.target.value)}
                      placeholder="Leave blank for public servers"
                      onKeyDown={(e) => e.key === 'Enter' && finish()}
                    />
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button
                className="welcome__btn"
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', flex: 1 }}
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                className="welcome__btn"
                style={{ flex: 2 }}
                onClick={finish}
                disabled={!spaceValue.trim()}
              >
                Finish
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
