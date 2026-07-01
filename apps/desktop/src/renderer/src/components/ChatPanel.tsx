import { useEffect, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { useDismissTimeout } from '../hooks/useDismissTimeout';

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
  /** Live width resize from the drag handle; commit=true on pointer release. */
  onResize?: (scale: number, commit: boolean) => void;
}

export function ChatPanel({
  messages,
  onSend,
  chatFontScale,
  chatPosition,
  chatWidthScale,
  onResize,
}: ChatPanelProps): React.JSX.Element {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);
  const hasEnteredPopoverRef = useRef(false);
  const { arm, cancel: cancelCloseTimeout } = useDismissTimeout(() => setPickerOpen(false));

  // Linger 3s before the pointer first enters the popover, then a snappier 1s after.
  function startCloseTimeout(): void {
    arm(hasEnteredPopoverRef.current ? 1000 : 3000);
  }

  useEffect(() => {
    if (pickerOpen) {
      hasEnteredPopoverRef.current = false;
    } else {
      cancelCloseTimeout();
    }
  }, [pickerOpen, cancelCloseTimeout]);

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

  // Drag-to-resize the chat panel width. The handle sits on the grid-facing edge
  // (left when the chat is docked right, right when docked left), so the panel
  // grows when dragging toward the grid. base 280px maps to the 1.0–2.0 scale.
  function handleResizeStart(e: React.PointerEvent<HTMLDivElement>): void {
    if (!onResize) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const startX = e.screenX;
    const startWidth = panelRef.current?.getBoundingClientRect().width ?? 280 * (chatWidthScale ?? 1);
    // Right-docked chat grows when dragging left (−delta); left-docked grows right (+delta).
    const sign = chatPosition === 'left' ? 1 : -1;
    handle.setPointerCapture(e.pointerId);
    const scaleFor = (ev: PointerEvent): number =>
      Math.max(1.0, Math.min(2.0, (startWidth + sign * (ev.screenX - startX)) / 280));
    const onMove = (ev: PointerEvent): void => onResize(scaleFor(ev), false);
    const onUp = (ev: PointerEvent): void => {
      onResize(scaleFor(ev), true);
      handle.releasePointerCapture?.(e.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }

  return (
    <div
      ref={panelRef}
      className={`chat-panel${chatPosition === 'left' ? ' chat-panel--left' : ''}`}
      style={{
        '--chat-font-scale': chatFontScale,
        '--chat-width-scale': chatWidthScale,
      } as React.CSSProperties}
    >
      {onResize && (
        <div
          className="resize-handle chat-panel__resize-handle"
          onPointerDown={handleResizeStart}
          title="Drag to resize chat"
          role="separator"
          aria-orientation="vertical"
        />
      )}
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

