import { useState } from 'react';
import { Settings } from 'lucide-react';
import { AvatarBadge } from '../AvatarBadge';

type SelfStatus = 'online' | 'idle' | 'dnd';

interface SidebarSelfProps {
  selfName: string;
  selfInitial: string;
  selfColor: string;
  selfAvatarUrl?: string | null;
  online: boolean;
  selfStatus: SelfStatus;
  onChangeStatus: (status: SelfStatus) => void;
  onOpenSettings: () => void;
}

const STATUS_OPTIONS: { value: SelfStatus; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'idle', label: 'Idle' },
  { value: 'dnd', label: 'Do Not Disturb' },
];

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
        <AvatarBadge
          avatarUrl={selfAvatarUrl}
          name={selfName}
          initial={selfInitial}
          color={selfColor}
          status={online ? selfStatus : 'offline'}
        />
      </button>
      <div className="self__meta">
        <div className="self__name">{selfName || 'You'}</div>
      </div>
      <button className="self__settings" onClick={onOpenSettings} aria-label="Settings">
        <Settings size={18} />
      </button>

      {statusMenuOpen && (
        <>
          <div className="backdrop backdrop--dropdown" onClick={() => setStatusMenuOpen(false)} />
          <div className="menu-surface menu-surface--frosted status-dropdown" onClick={(e) => e.stopPropagation()}>
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`menu-item${selfStatus === opt.value ? ' menu-item--active' : ''}`}
                onClick={() => {
                  onChangeStatus(opt.value);
                  setStatusMenuOpen(false);
                }}
              >
                <span className={`presence-dot presence-dot--${opt.value}`} />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
