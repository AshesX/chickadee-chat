import { useEffect, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { EmojiPickerPopover } from './EmojiPickerPopover';

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

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  chatFontScale?: number;
  chatPosition?: 'left' | 'right';
  chatWidthScale?: number;
}

export function ChatPanel({
  messages,
  onSend,
  chatFontScale,
  chatPosition,
  chatWidthScale,
}: ChatPanelProps): React.JSX.Element {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasEnteredPopoverRef = useRef(false);

  function startCloseTimeout(): void {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    const delay = hasEnteredPopoverRef.current ? 1000 : 3000;
    closeTimeoutRef.current = setTimeout(() => {
      setPickerOpen(false);
    }, delay);
  }

  function cancelCloseTimeout(): void {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    if (pickerOpen) {
      hasEnteredPopoverRef.current = false;
    } else {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    }
  }, [pickerOpen]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function submit(): void {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
  }

  function insertEmoji(emoji: string): void {
    const el = inputRef.current;
    if (!el) {
      setInput((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const nextVal = el.value.substring(0, start) + emoji + el.value.substring(end);
    setInput(nextVal);

    // Put focus back and place cursor after the inserted emoji
    setTimeout(() => {
      el.focus();
      const newCursorPos = start + emoji.length;
      el.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
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

      <div className="chat-panel__input-row">
        <button
          className="emoji-trigger-btn"
          onClick={(e) => {
            setPickerAnchor(e.currentTarget.getBoundingClientRect());
            setPickerOpen((prev) => !prev);
          }}
          onMouseEnter={cancelCloseTimeout}
          onMouseLeave={startCloseTimeout}
          aria-label="Choose emoji"
        >
          😊
        </button>
        <input
          ref={inputRef}
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

      {pickerOpen && pickerAnchor && (
        <EmojiPickerPopover
          onSelectEmoji={(emoji) => {
            insertEmoji(emoji);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
          anchorRect={pickerAnchor}
          onMouseEnter={() => {
            cancelCloseTimeout();
            hasEnteredPopoverRef.current = true;
          }}
          onMouseLeave={startCloseTimeout}
        />
      )}
    </div>
  );
}

