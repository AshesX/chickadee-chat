import { useState } from 'react';
import { Settings } from 'lucide-react';

interface SidebarSelfProps {
  selfName: string;
  selfInitial: string;
  selfColor: string;
  selfAvatarUrl?: string | null;
  online: boolean;
  selfStatus: 'online' | 'idle' | 'dnd';
  onChangeStatus: (status: 'online' | 'idle' | 'dnd') => void;
  onOpenSettings: () => void;
}

/** Sidebar footer: self avatar + presence dot, name, settings cog, and the status dropdown. */
export function SidebarSelf({
  selfName,
  selfInitial,
  selfColor,
  selfAvatarUrl,
  online,
  selfStatus,
  onChangeStatus,
  onOpenSettings,
}: SidebarSelfProps): React.JSX.Element {
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  return (
    <div className="sidebar__self">
      <button
        className="sidebar__self-avatar-btn"
        onClick={() => setStatusMenuOpen(!statusMenuOpen)}
        aria-label="Change status"
      >
        <div className="friend-row__avatar-wrap">
          <div
            className="avatar"
            style={selfAvatarUrl ? undefined : { background: selfColor }}
          >
            {selfAvatarUrl ? (
              <img src={selfAvatarUrl} alt={selfName} />
            ) : (
              selfInitial
            )}
          </div>
          <span className={`presence-dot presence-dot--${online ? selfStatus : 'offline'}`} />
        </div>
      </button>
      <div className="self__meta">
        <div className="self__name">{selfName || 'You'}</div>
      </div>
      <button className="self__settings" onClick={onOpenSettings} aria-label="Settings">
        <Settings size={18} />
      </button>

      {statusMenuOpen && (
        <>
          <div className="backdrop" style={{ zIndex: 'var(--z-dropdown)' }} onClick={() => setStatusMenuOpen(false)} />
          <div className="menu-surface menu-surface--frosted" style={{ position: 'absolute', bottom: '50px', left: '12px', zIndex: 'var(--z-dropdown)', width: '155px', padding: 'var(--s-1)', display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' }} onClick={(e) => e.stopPropagation()}>
            <button
              className={`menu-item${selfStatus === 'online' ? ' menu-item--active' : ''}`}
              onClick={() => {
                onChangeStatus('online');
                setStatusMenuOpen(false);
              }}
            >
              <span className="presence-dot presence-dot--online" />
              <span>Online</span>
            </button>
            <button
              className={`menu-item${selfStatus === 'idle' ? ' menu-item--active' : ''}`}
              onClick={() => {
                onChangeStatus('idle');
                setStatusMenuOpen(false);
              }}
            >
              <span className="presence-dot presence-dot--idle" />
              <span>Idle</span>
            </button>
            <button
              className={`menu-item${selfStatus === 'dnd' ? ' menu-item--active' : ''}`}
              onClick={() => {
                onChangeStatus('dnd');
                setStatusMenuOpen(false);
              }}
            >
              <span className="presence-dot presence-dot--dnd" />
              <span>Do Not Disturb</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
