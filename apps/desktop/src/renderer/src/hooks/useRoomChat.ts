import { useCallback, useEffect, useRef, useState } from 'react';
import type { Peer } from '@chickadee/shared';
import type { ChatMessage } from '../components/ChatPanel';
import { SELF_COLOR, resolveAccentColor } from '../lib/userColors';
import type { MessageListener, Signaling } from './useSignaling';
import { playSfx } from '../lib/sfx';
import { store } from '../lib/settings';

export interface FloatReaction {
  id: number;
  emoji: string;
  x: number;
}

interface UseRoomChatArgs {
  signaling: Signaling;
  displayName: string;
  /** Local user's effective accent color (chosen, else the deterministic auto color). */
  selfColor: string;
  /** Current room id; chat is ephemeral and clears when it changes. */
  roomId: string | null;
  onNewMessage?: (msg: ChatMessage) => void;
  onSelfMessage?: (msg: ChatMessage) => void;
}

export interface RoomChat {
  messages: ChatMessage[];
  floats: FloatReaction[];
  sendChat: (text: string) => void;
  react: (emoji: string) => void;
}

/** Cap on retained chat history — bounds the JS array and the DOM (ChatPanel renders 1:1). */
const MAX_MESSAGES = 300;

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Room chat over the signaling relay. Outgoing messages echo optimistically;
 * inbound `chat` events (from `signaling.subscribe`) are appended with the
 * sender's name + accent color, and reactions also spawn a floating emoji.
 * Chat is ephemeral — cleared whenever the room changes.
 */
export function useRoomChat({ signaling, displayName, selfColor, roomId, onNewMessage, onSelfMessage }: UseRoomChatArgs): RoomChat {
  const { subscribe, send } = signaling;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [floats, setFloats] = useState<FloatReaction[]>([]);

  // Latest values for the stable inbound handler.
  const peersRef = useRef<Peer[]>(signaling.peers);
  peersRef.current = signaling.peers;
  const selfColorRef = useRef(selfColor);
  selfColorRef.current = selfColor;
  const nameRef = useRef(displayName);
  nameRef.current = displayName;
  const onNewMessageRef = useRef(onNewMessage);
  onNewMessageRef.current = onNewMessage;
  const onSelfMessageRef = useRef(onSelfMessage);
  onSelfMessageRef.current = onSelfMessage;
  const idRef = useRef(0);

  const nextId = (): number => (idRef.current += 1);

  const spawnFloat = useCallback((emoji: string) => {
    const id = nextId();
    setFloats((f) => [...f, { id, emoji, x: 18 + Math.random() * 64 }]);
    setTimeout(() => setFloats((f) => f.filter((i) => i.id !== id)), 1800);
  }, []);

  // Clear history when the room changes (ephemeral).
  useEffect(() => {
    setMessages([]);
    setFloats([]);
  }, [roomId]);

  // Inbound chat / reactions from other peers.
  useEffect(() => {
    const handle: MessageListener = (msg) => {
      if (msg.type !== 'chat') return;

      if (msg.reaction) {
        // Honor the local "disable reactions" setting — drop incoming floats.
        if (store.getReactionsEnabled()) spawnFloat(msg.text);
      } else {
        if (store.getSfxEnabled() && store.getSfxChatEnabled()) {
          playSfx('chat', store.getSfxVolume());
        }

        const peer = peersRef.current.find((p) => p.id === msg.from);
        const message: ChatMessage = {
          id: nextId(),
          senderName: peer?.displayName ?? 'Someone',
          color: peer ? resolveAccentColor(peer.accentColor, peer.userId) : SELF_COLOR,
          text: msg.text,
          time: nowTime(),
          // Look up the sender's synced voice preference so TTS reads them in their chosen voice.
          voicePreference: peer?.voicePreference ?? '',
        };
        setMessages((m) => [...m, message].slice(-MAX_MESSAGES));
        onNewMessageRef.current?.(message);
      }
    };
    return subscribe(handle);
  }, [subscribe, spawnFloat]);

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const message: ChatMessage = { id: nextId(), senderName: nameRef.current, color: selfColorRef.current, text: trimmed, time: nowTime() };
      setMessages((m) => [...m, message].slice(-MAX_MESSAGES));
      onSelfMessageRef.current?.(message);
      send({ type: 'chat', text: trimmed });
    },
    [send],
  );

  const react = useCallback(
    (emoji: string) => {
      spawnFloat(emoji);
      send({ type: 'chat', text: emoji, reaction: true });
    },
    [send, spawnFloat],
  );

  return { messages, floats, sendChat, react };
}
