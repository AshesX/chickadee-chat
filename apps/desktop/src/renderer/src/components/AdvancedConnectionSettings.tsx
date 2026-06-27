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
    <div style={{ marginTop: '12px' }}>
      <button
        type="button"
        className="welcome__btn"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--dim)',
          textAlign: 'left',
          padding: '0',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'pointer',
        }}
        onClick={() => setAdvancedOpen(!advancedOpen)}
      >
        {advancedOpen ? '▼ Hide' : '▶ Show'} Advanced Connection Settings
      </button>
      {advancedOpen && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px 12px',
            background: 'var(--bg-mid)',
            borderRadius: 'var(--r-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div className="field" style={{ gap: '4px' }}>
            <label className="field-label" style={{ textAlign: 'left', fontSize: '11px' }}>
              Signaling Server URL
            </label>
            <input
              className="welcome__input"
              value={customSignalingUrl}
              onChange={(e) => setCustomSignalingUrl(e.target.value)}
              placeholder="e.g. wss://chickadee.example.com"
              style={{ padding: '6px 9px', fontSize: '13px', marginBottom: '0' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && onEnterKeyDown) onEnterKeyDown();
              }}
            />
            <span className="settings-row__hint" style={{ fontSize: '10px', opacity: 0.85 }}>
              Leave blank to use the default public server.
            </span>
          </div>
          <div className="field" style={{ gap: '4px' }}>
            <label className="field-label" style={{ textAlign: 'left', fontSize: '11px' }}>
              Join Secret / Password
            </label>
            <input
              className="welcome__input"
              type="password"
              value={joinSecret}
              onChange={(e) => setJoinSecret(e.target.value)}
              placeholder="Leave blank for public servers"
              style={{ padding: '6px 9px', fontSize: '13px', marginBottom: '0' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && onEnterKeyDown) onEnterKeyDown();
              }}
            />
            <span className="settings-row__hint" style={{ fontSize: '10px', opacity: 0.85 }}>
              Required only if the signaling server has a CHICKADEE_JOIN_SECRET configured.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
