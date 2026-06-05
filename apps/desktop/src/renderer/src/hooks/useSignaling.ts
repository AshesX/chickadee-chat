import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseServerMessage,
  type ClientMessage,
  type Peer,
  type PeerId,
  type ServerMessage,
} from '@chickadee/shared';

/** A listener invoked for every inbound server message (used by the WebRTC layer). */
export type MessageListener = (message: ServerMessage) => void;

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'room-full'
  | 'error'
  | 'closed';

export interface SignalingState {
  status: ConnectionStatus;
  /** This client's server-assigned id, once joined. */
  selfId: PeerId | null;
  /** Other peers currently in the room (excludes self). */
  peers: Peer[];
  error: string | null;
}

export interface Signaling extends SignalingState {
  join: (room: string, displayName: string) => void;
  leave: () => void;
  /** Send a message to the server (used by WebRTC negotiation + mic-state). */
  send: (message: ClientMessage) => void;
  /** Subscribe to raw inbound server messages; returns an unsubscribe fn. */
  subscribe: (listener: MessageListener) => () => void;
}

const INITIAL: SignalingState = {
  status: 'idle',
  selfId: null,
  peers: [],
  error: null,
};

// Reconnection + heartbeat tuning.
const PING_INTERVAL_MS = 15_000;
const PONG_TIMEOUT_MS = 35_000;
const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Manages the WebSocket connection to the signaling server and the room's
 * peer list. Auto-reconnects with backoff after an unexpected drop (re-joining
 * the same room), and runs an app-level ping/pong heartbeat to detect dead /
 * half-open connections. On reconnect the server assigns a new selfId, so the
 * WebRTC mesh rebuilds from the fresh `welcome`.
 */
export function useSignaling(url: string): Signaling {
  const [state, setState] = useState<SignalingState>(INITIAL);
  const socketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<MessageListener>>(new Set());

  const roomRef = useRef('');
  const nameRef = useRef('');
  const shouldReconnectRef = useRef(false);
  const attemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPongRef = useRef(0);
  const connectRef = useRef<() => void>(() => {});

  const subscribe = useCallback((listener: MessageListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const closeSocket = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
      socketRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    attemptsRef.current += 1;
    if (attemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
      shouldReconnectRef.current = false;
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: 'Lost connection to the signaling server.',
      }));
      return;
    }
    setState((prev) => ({ ...prev, status: 'reconnecting' }));
    const delay = Math.min(BASE_RECONNECT_MS * 2 ** (attemptsRef.current - 1), MAX_RECONNECT_MS);
    reconnectTimerRef.current = setTimeout(() => connectRef.current(), delay);
  }, []);

  const connect = useCallback(() => {
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'join', room: roomRef.current, displayName: nameRef.current }));
      // Heartbeat: ping periodically; if pongs stop, force-close → reconnect.
      lastPongRef.current = Date.now();
      pingTimerRef.current = setInterval(() => {
        if (Date.now() - lastPongRef.current > PONG_TIMEOUT_MS) {
          socket.close();
          return;
        }
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL_MS);
    };

    socket.onmessage = (event) => {
      const msg = parseServerMessage(String(event.data));
      if (!msg) return;

      if (msg.type === 'pong') {
        lastPongRef.current = Date.now();
        return;
      }

      // Fan out to the WebRTC layer before updating presence state.
      for (const listener of listenersRef.current) listener(msg);

      switch (msg.type) {
        case 'welcome':
          attemptsRef.current = 0;
          setState((prev) => ({
            ...prev,
            status: 'connected',
            error: null,
            selfId: msg.selfId,
            peers: msg.peers,
          }));
          break;
        case 'peer-joined':
          setState((prev) =>
            prev.peers.some((p) => p.id === msg.peer.id)
              ? prev
              : { ...prev, peers: [...prev.peers, msg.peer] },
          );
          break;
        case 'peer-left':
          setState((prev) => ({
            ...prev,
            peers: prev.peers.filter((p) => p.id !== msg.peerId),
          }));
          break;
        case 'mic-state':
          setState((prev) => ({
            ...prev,
            peers: prev.peers.map((p) => (p.id === msg.from ? { ...p, muted: msg.muted } : p)),
          }));
          break;
        case 'cam-state':
          setState((prev) => ({
            ...prev,
            peers: prev.peers.map((p) => (p.id === msg.from ? { ...p, cameraOn: msg.on } : p)),
          }));
          break;
        case 'screen-state':
          setState((prev) => ({
            ...prev,
            peers: prev.peers.map((p) =>
              p.id === msg.from ? { ...p, screenStreamId: msg.streamId } : p,
            ),
          }));
          break;
        case 'room-full':
          shouldReconnectRef.current = false;
          clearTimers();
          setState((prev) => ({
            ...prev,
            status: 'room-full',
            error: `Room "${msg.room}" is full (max 4).`,
          }));
          closeSocket();
          break;
      }
    };

    socket.onerror = () => {
      // The close handler decides whether to reconnect.
    };

    socket.onclose = () => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (shouldReconnectRef.current) {
        scheduleReconnect();
      } else {
        setState((prev) =>
          prev.status === 'room-full' || prev.status === 'error'
            ? prev
            : { ...INITIAL, status: 'closed' },
        );
      }
    };
  }, [url, scheduleReconnect, clearTimers, closeSocket]);

  // Keep the ref pointing at the latest connect for scheduleReconnect to call.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const join = useCallback(
    (room: string, displayName: string) => {
      closeSocket();
      clearTimers();
      shouldReconnectRef.current = true;
      attemptsRef.current = 0;
      roomRef.current = room;
      nameRef.current = displayName;
      setState({ ...INITIAL, status: 'connecting' });
      connect();
    },
    [closeSocket, clearTimers, connect],
  );

  const leave = useCallback(() => {
    shouldReconnectRef.current = false;
    clearTimers();
    closeSocket();
    setState(INITIAL);
  }, [clearTimers, closeSocket]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }, []);

  // Clean up timers + socket if the component unmounts mid-call.
  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      clearTimers();
      closeSocket();
    };
  }, [clearTimers, closeSocket]);

  return { ...state, join, leave, send, subscribe };
}
