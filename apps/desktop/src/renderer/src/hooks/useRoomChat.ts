import { useCallback, useEffect, useRef, useState } from 'react';
import type { Peer, PeerId } from '@chickadee/shared';
import type { ChatMessage } from '../components/ChatPanel';
import { SELF_COLOR } from '../lib/userColors';
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
  colors: Record<PeerId, string>;
  /** Current room id; chat is ephemeral and clears when it changes. */
  roomId: string | null;
}

export interface RoomChat {
  messages: ChatMessage[];
  floats: FloatReaction[];
  sendChat: (text: string) => void;
  react: (emoji: string) => void;
}

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Room chat over the signaling relay. Outgoing messages echo optimistically;
 * inbound `chat` events (from `signaling.subscribe`) are appended with the
 * sender's name + accent color, and reactions also spawn a floating emoji.
 * Chat is ephemeral — cleared whenever the room changes.
 */
export function useRoomChat({ signaling, displayName, colors, roomId }: UseRoomChatArgs): RoomChat {
  const { subscribe, send } = signaling;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [floats, setFloats] = useState<FloatReaction[]>([]);

  // Latest values for the stable inbound handler.
  const peersRef = useRef<Peer[]>(signaling.peers);
  peersRef.current = signaling.peers;
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const nameRef = useRef(displayName);
  nameRef.current = displayName;
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

      if (store.getSfxEnabled()) {
        playSfx('chat', store.getSfxVolume());
      }

      const peer = peersRef.current.find((p) => p.id === msg.from);
      const message: ChatMessage = {
        id: nextId(),
        senderName: peer?.displayName ?? 'Someone',
        color: colorsRef.current[msg.from] ?? SELF_COLOR,
        text: msg.text,
        time: nowTime(),
        isReaction: msg.reaction,
      };
      setMessages((m) => [...m, message]);
      if (msg.reaction) spawnFloat(msg.text);
    };
    return subscribe(handle);
  }, [subscribe, spawnFloat]);

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setMessages((m) => [
        ...m,
        { id: nextId(), senderName: nameRef.current, color: SELF_COLOR, text: trimmed, time: nowTime() },
      ]);
      send({ type: 'chat', text: trimmed });
    },
    [send],
  );

  const react = useCallback(
    (emoji: string) => {
      spawnFloat(emoji);
      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          senderName: nameRef.current,
          color: SELF_COLOR,
          text: emoji,
          time: nowTime(),
          isReaction: true,
        },
      ]);
      send({ type: 'chat', text: emoji, reaction: true });
    },
    [send, spawnFloat],
  );

  return { messages, floats, sendChat, react };
}
