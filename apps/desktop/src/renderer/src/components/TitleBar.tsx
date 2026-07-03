import { MessageSquare, ChevronsLeft } from 'lucide-react';
import { Logo } from './Logo';
import { WindowControls } from './WindowControls';

interface TitleBarProps {
  chatOpen: boolean;
  onToggleChat: () => void;
  inRoom: boolean;
  compact: boolean;
  onToggleCompact: () => void;
}

export function TitleBar({ chatOpen, onToggleChat, inRoom, compact, onToggleCompact }: TitleBarProps): React.JSX.Element {
  return (
    <header className="title-bar">
      <div className="title-bar__left">
        <Logo size={16} staticLogo className="title-bar__logo" />
        <span className="title-bar__wordmark">CHICKADEE CHAT</span>
      </div>

      <div className="title-bar__spacer" />

      <div className="title-bar__right">
        {inRoom && !compact && (
          <button
            className={`pill pill--chat${chatOpen ? ' pill--chat-on' : ''}`}
            onClick={onToggleChat}
            style={{ marginRight: 'var(--s-2)' }}
          >
            <MessageSquare size={14} />
            Chat
          </button>
        )}
        <button
          className="icon-btn title-bar__collapse-btn"
          onClick={onToggleCompact}
          title={compact ? 'Expand' : 'Collapse to sidebar'}
          aria-label={compact ? 'Expand' : 'Collapse to sidebar'}
        >
          <ChevronsLeft
            size={14}
            className={`title-bar__collapse-icon${compact ? ' title-bar__collapse-icon--flipped' : ''}`}
          />
        </button>
        <WindowControls showMaximize={!compact} />
      </div>
    </header>
  );
}
