import { useState } from 'react';
import { MessageSquare, ChevronsLeft, Info, Scale, CircleHelp, Settings } from 'lucide-react';
import { Logo } from './Logo';
import { WindowControls } from './WindowControls';
import { ChevronMenu } from './ChevronMenu';

interface TitleBarProps {
  chatOpen: boolean;
  onToggleChat: () => void;
  inRoom: boolean;
  compact: boolean;
  onToggleCompact: () => void;
  onOpenAbout: () => void;
  onOpenLegal: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
}

export function TitleBar({
  chatOpen,
  onToggleChat,
  inRoom,
  compact,
  onToggleCompact,
  onOpenAbout,
  onOpenLegal,
  onOpenHelp,
  onOpenSettings,
}: TitleBarProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);

  const collapseBtn = (
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
  );

  return (
    <header className="title-bar">
      <div className="title-bar__center">
        <button
          className="title-bar__brand"
          onClick={(e) => {
            setMenuAnchor(e.currentTarget.getBoundingClientRect());
            setMenuOpen((v) => !v);
          }}
          title="Chickadee Chat menu"
          aria-label="Chickadee Chat menu"
        >
          <Logo size={16} staticLogo className="title-bar__logo" />
          <span className="title-bar__wordmark">CHICKADEE CHAT</span>
        </button>
        {menuOpen && menuAnchor && (
          <ChevronMenu
            anchorRect={menuAnchor}
            onClose={() => setMenuOpen(false)}
            placement="below"
            width={200}
            className="brand-menu menu-surface"
          >
            <button className="menu-item" onClick={() => { onOpenAbout(); setMenuOpen(false); }}>
              <Info size={16} />
              <span>About</span>
            </button>
            <button className="menu-item" onClick={() => { onOpenLegal(); setMenuOpen(false); }}>
              <Scale size={16} />
              <span>Legal Information</span>
            </button>
            <button className="menu-item" onClick={() => { onOpenHelp(); setMenuOpen(false); }}>
              <CircleHelp size={16} />
              <span>Help</span>
            </button>
            <hr className="brand-menu__divider" />
            <button className="menu-item" onClick={() => { onOpenSettings(); setMenuOpen(false); }}>
              <Settings size={16} />
              <span>Settings</span>
            </button>
          </ChevronMenu>
        )}
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
        {inRoom && compact && (
          <button
            className={`icon-btn title-bar__chat-btn${chatOpen ? ' title-bar__chat-btn--active' : ''}`}
            onClick={onToggleChat}
            title={chatOpen ? 'Hide chat' : 'Show chat'}
            aria-label={chatOpen ? 'Hide chat' : 'Show chat'}
          >
            <MessageSquare size={14} />
          </button>
        )}
        {collapseBtn}
        <WindowControls showMaximize={!compact} />
      </div>
    </header>
  );
}
