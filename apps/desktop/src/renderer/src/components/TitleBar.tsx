import { MessageSquare } from 'lucide-react';
import { Logo } from './Logo';
import { WindowControls } from './WindowControls';

interface TitleBarProps {
  chatOpen: boolean;
  onToggleChat: () => void;
  inRoom: boolean;
  compact: boolean;
}

export function TitleBar({ chatOpen, onToggleChat, inRoom, compact }: TitleBarProps): React.JSX.Element {
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
            style={{ marginRight: 8 }}
          >
            <MessageSquare size={14} />
            Chat
          </button>
        )}
        <WindowControls showMaximize={!compact} />
      </div>
    </header>
  );
}
