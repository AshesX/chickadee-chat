import { useEffect, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';

export interface ChatMessage {
  id: number;
  senderName: string;
  color: string;
  text: string;
  time: string;
  isReaction?: boolean;
  /** Sender's synced TTS voice-category id (for reading the message aloud); '' = system default. */
  voicePreference?: string;
}

export const REACTION_EMOJIS = ['🔥', '😂', '👍', '❤️', '🎉', '💀'];

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onReact: (emoji: string) => void;
  chatFontScale?: number;
  chatPosition?: 'left' | 'right';
  chatWidthScale?: number;
}

export function ChatPanel({ messages, onSend, onReact, chatFontScale, chatPosition, chatWidthScale }: ChatPanelProps): React.JSX.Element {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function submit(): void {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
  }

  return (
    <div
      className={`chat-panel${chatPosition === 'left' ? ' chat-panel--left' : ''}`}
      style={{
        '--chat-font-scale': chatFontScale,
        '--chat-width-scale': chatWidthScale,
      } as React.CSSProperties}
    >
      <div className="chat-panel__head">ROOM CHAT</div>

      <div className="chat-panel__scroll">
        {messages.length === 0 && <p className="chat-panel__empty">No messages yet</p>}
        {messages.map((m) => (
          <div key={m.id} className="chat-msg">
            <div className="chat-msg__head">
              <span className="chat-msg__name" style={{ color: m.color }}>
                {m.senderName}
              </span>
              <span className="chat-msg__time">{m.time}</span>
            </div>
            <div className={`chat-msg__text${m.isReaction ? ' chat-msg__text--rx' : ''}`}>
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="chat-panel__reactions">
        {REACTION_EMOJIS.map((e) => (
          <button key={e} className="reaction" onClick={() => onReact(e)}>
            {e}
          </button>
        ))}
      </div>

      <div className="chat-panel__input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Message…"
          maxLength={500}
        />
        <button className="send-btn" onClick={submit} aria-label="Send">
          <SendHorizontal size={14} />
        </button>
      </div>
    </div>
  );
}
