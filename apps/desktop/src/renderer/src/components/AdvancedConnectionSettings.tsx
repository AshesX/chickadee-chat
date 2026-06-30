import React from 'react';

interface AdvancedConnectionSettingsProps {
  customSignalingUrl: string;
  setCustomSignalingUrl: (url: string) => void;
  joinSecret: string;
  setJoinSecret: (secret: string) => void;
  advancedOpen: boolean;
  setAdvancedOpen: (open: boolean) => void;
  onEnterKeyDown?: () => void;
}

export function AdvancedConnectionSettings({
  customSignalingUrl,
  setCustomSignalingUrl,
  joinSecret,
  setJoinSecret,
  advancedOpen,
  setAdvancedOpen,
  onEnterKeyDown,
}: AdvancedConnectionSettingsProps): React.JSX.Element {
  return (
    <div style={{ marginTop: 'var(--s-3)' }}>
      <button
        type="button"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--dim)',
          textAlign: 'left',
          padding: '0',
          fontSize: 'var(--fs-1)',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-1)',
          cursor: 'pointer',
        }}
        onClick={() => setAdvancedOpen(!advancedOpen)}
      >
        {advancedOpen ? '▼ Hide' : '▶ Show'} Advanced Connection Settings
      </button>
      {advancedOpen && (
        <div
          style={{
            marginTop: 'var(--s-2)',
            padding: 'var(--s-2) var(--s-3)',
            background: 'var(--veil-1)',
            borderRadius: 'var(--r-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s-2)',
          }}
        >
          <div className="field" style={{ gap: 'var(--s-1)' }}>
            <label className="field-label" style={{ textAlign: 'left' }}>
              Signaling Server URL
            </label>
            <input
              className="input"
              value={customSignalingUrl}
              onChange={(e) => setCustomSignalingUrl(e.target.value)}
              placeholder="e.g. wss://chickadee.example.com"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && onEnterKeyDown) onEnterKeyDown();
              }}
            />
            <span className="hint" style={{ fontSize: 'var(--fs-0)', opacity: 0.85 }}>
              Leave blank to use the default public server.
            </span>
          </div>
          <div className="field" style={{ gap: 'var(--s-1)' }}>
            <label className="field-label" style={{ textAlign: 'left' }}>
              Join Secret / Password
            </label>
            <input
              className="input"
              type="password"
              value={joinSecret}
              onChange={(e) => setJoinSecret(e.target.value)}
              placeholder="Leave blank for public servers"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && onEnterKeyDown) onEnterKeyDown();
              }}
            />
            <span className="hint" style={{ fontSize: 'var(--fs-0)', opacity: 0.85 }}>
              Required only if the signaling server has a CHICKADEE_JOIN_SECRET configured.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
