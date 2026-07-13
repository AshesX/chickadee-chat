import { useState } from 'react';
import { Settings, Mic, MicOff, Headphones, HeadphoneOff } from 'lucide-react';
import { AvatarBadge } from '../AvatarBadge';
import { INPUT_MODE_ICONS } from '../../lib/inputModeIcons';

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
  /** Compact (sidebar-only dock) mode — swaps the settings-only button for the
      2x2 mute/deafen/input-mode/settings grid (the main Control Bar is hidden). */
  compact: boolean;
  micEnabled: boolean;
  hasMic: boolean;
  onToggleMic: () => void;
  deafened: boolean;
  onToggleDeafen: () => void;
  inputMode: 'voice' | 'ptt';
  onCycleInputMode: () => void;
  selfSpeaking: boolean;
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
  compact,
  micEnabled,
  hasMic,
  onToggleMic,
  deafened,
  onToggleDeafen,
  inputMode,
  onCycleInputMode,
  selfSpeaking,
}: SidebarSelfProps): React.JSX.Element {
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const InputModeIcon = INPUT_MODE_ICONS[inputMode];

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
      {compact ? (
        <div className="self__mini-grid">
          <button
            className={`self__mini-btn${micEnabled ? '' : ' self__mini-btn--active'}`}
            onClick={onToggleMic}
            disabled={!hasMic}
            title={micEnabled ? 'Mute' : 'Unmute'}
            aria-label={micEnabled ? 'Mute' : 'Unmute'}
          >
            {micEnabled ? <Mic size={14} /> : <MicOff size={14} />}
          </button>
          <button
            className={`self__mini-btn${deafened ? ' self__mini-btn--active' : ''}`}
            onClick={onToggleDeafen}
            title={deafened ? 'Undeafen' : 'Deafen'}
            aria-label={deafened ? 'Undeafen' : 'Deafen'}
          >
            {deafened ? <HeadphoneOff size={14} /> : <Headphones size={14} />}
          </button>
          <button
            className={`self__mini-btn${selfSpeaking ? ' self__mini-btn--speaking' : ''}`}
            onClick={onCycleInputMode}
            title={inputMode === 'ptt' ? 'Push-Talk' : 'Voice'}
            aria-label="Cycle input mode"
          >
            <InputModeIcon size={14} />
          </button>
          <button className="self__mini-btn" onClick={onOpenSettings} aria-label="Settings">
            <Settings size={14} />
          </button>
        </div>
      ) : (
        <button className="self__settings" onClick={onOpenSettings} aria-label="Settings">
          <Settings size={18} />
        </button>
      )}

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
