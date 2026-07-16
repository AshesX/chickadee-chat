import React from 'react';
import type { Peer } from '@chickadee/shared';
import type { Signaling } from '../hooks/useSignaling';

interface DevPanelProps {
  signaling: Signaling;
}

export function DevPanel({ signaling }: DevPanelProps): React.JSX.Element | null {
  if (import.meta.env && !import.meta.env.DEV && process.env.NODE_ENV !== 'development') {
    return null;
  }

  const handleSpawnGhost = () => {
    const id = Math.random().toString(36).substring(2, 9);
    const ghostPeer: Peer = {
      id: `ghost-${id}`,
      userId: `ghost-user-${id}`,
      displayName: `Ghost ${id.substring(0, 4)}`,
      muted: true,
      speaking: false,
      cameraOn: false,
      screenStreamId: null,
      deafened: false,
      status: 'online',
      avatarDataUrl: null,
      voicePreference: '',
      accentColor: '',
      wantsVideo: true,
      videoSubscriptions: [],
      soundboardClips: [],
    };
    signaling.injectGhostPeer(ghostPeer);
  };

  const handleClearGhosts = () => {
    signaling.clearGhostPeers();
  };

  return (
    <div
      className="glass-panel"
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '1rem',
        zIndex: 9999,
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '4px' }}>
        Dev Tools
      </div>
      <button className="button" onClick={handleSpawnGhost}>
        Spawn Ghost User
      </button>
      <button className="button" onClick={handleClearGhosts}>
        Clear Ghosts
      </button>
    </div>
  );
}
