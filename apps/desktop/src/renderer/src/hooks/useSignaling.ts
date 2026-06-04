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

/**
 * Manages the WebSocket connection to the signaling server and the room's
 * peer list. In Phase 1 it only tracks presence (join/leave); in Phase 2 the
 * `send` method and the relayed `offer`/`answer`/`ice-candidate` server
 * messages drive WebRTC negotiation.
 */
export function useSignaling(url: string): Signaling {
  const [state, setState] = useState<SignalingState>(INITIAL);
  const socketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<MessageListener>>(new Set());

  const subscribe = useCallback((listener: MessageListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
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

  const join = useCallback(
    (room: string, displayName: string) => {
      closeSocket();
      setState({ ...INITIAL, status: 'connecting' });

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'join', room, displayName }));
      };

      socket.onmessage = (event) => {
        const msg = parseServerMessage(String(event.data));
        if (!msg) return;

        // Fan out to the WebRTC layer before updating presence state.
        for (const listener of listenersRef.current) listener(msg);

        switch (msg.type) {
          case 'welcome':
            setState((prev) => ({
              ...prev,
              status: 'connected',
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
              peers: prev.peers.map((p) =>
                p.id === msg.from ? { ...p, muted: msg.muted } : p,
              ),
            }));
            break;
          case 'cam-state':
            setState((prev) => ({
              ...prev,
              peers: prev.peers.map((p) =>
                p.id === msg.from ? { ...p, cameraOn: msg.on } : p,
              ),
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
            setState((prev) => ({
              ...prev,
              status: 'room-full',
              error: `Room "${msg.room}" is full (max 4).`,
            }));
            closeSocket();
            break;
          // offer / answer / ice-candidate: handled by WebRTC layer in Phase 2.
        }
      };

      socket.onerror = () => {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: 'Could not reach the signaling server.',
        }));
      };

      socket.onclose = () => {
        setState((prev) =>
          // Preserve a terminal status the message handler already set.
          prev.status === 'room-full' || prev.status === 'error'
            ? prev
            : { ...prev, status: 'closed', selfId: null, peers: [] },
        );
      };
    },
    [url, closeSocket],
  );

  const leave = useCallback(() => {
    closeSocket();
    setState(INITIAL);
  }, [closeSocket]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }, []);

  // Clean up the socket if the component unmounts mid-call.
  useEffect(() => closeSocket, [closeSocket]);

  return { ...state, join, leave, send, subscribe };
}
