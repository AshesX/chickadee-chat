import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseServerMessage,
  type BannedUser,
  type ClientMessage,
  type Peer,
  type PeerId,
  type Room,
  type ServerMessage,
  type SoundboardClipMeta,
  type SpacePresence,
} from '@chickadee/shared';
import {
  PING_INTERVAL_MS,
  heartbeatExpired,
  reconnectDelayMs,
  reconnectExhausted,
} from '../lib/reconnectPolicy';
import { verifySpace, type SpaceVerifyResult } from '../lib/verifySpace';

/** A listener invoked for every inbound server message (used by the WebRTC layer). */
export type MessageListener = (message: ServerMessage) => void;

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'room-full'
  // Terminal, like room-full: kicked/banned from the Space, or a join was
  // denied by a moderation gate (banned / space-locked / room-locked).
  | 'kicked'
  | 'error'
  | 'closed';

export interface SignalingState {
  status: ConnectionStatus;
  /** This client's server-assigned id, once joined. */
  selfId: PeerId | null;
  /** Other peers currently in the room (excludes self). */
  peers: Peer[];
  error: string | null;
  /** Synced list of rooms for the active Space. */
  rooms: Room[];
  /** Synced space presence. */
  spacePresence: SpacePresence[];
  /** The peer id currently holding the room's single "stage" slot, or null if free. */
  spotlightHolderId: PeerId | null;
  /** What the stage holder is spotlighting ('screen' | 'camera'), or null if free. */
  spotlightKind: 'screen' | 'camera' | null;
  /** Session id of the current room's moderator (longest-present member), or null outside a room. */
  moderatorId: PeerId | null;
  /** Bare ids of this Space's rooms currently locked to new entrants. */
  lockedRooms: string[];
  /** Whether this Space is locked to newcomers. */
  spaceLocked: boolean;
  /** The Space's ban list (mirrored to every member; persisted for owner re-seeding). */
  bannedUsers: BannedUser[];
}

export interface Signaling extends SignalingState {
  join: (spaceId: string, room: string | null, displayName: string, userId: string, rooms: Room[], status: 'online' | 'idle' | 'dnd', avatarDataUrl?: string | null, voicePreference?: string, accentColor?: string, joinSecret?: string, signalingUrl?: string, bannerDataUrl?: string | null, soundboardClips?: SoundboardClipMeta[]) => void;
  leave: () => void;
  joinRoom: (room: string | null) => void;
  /** Send a message to the server (used by WebRTC negotiation + mic-state). */
  send: (message: ClientMessage) => void;
  /**
   * Non-mutating existence probe over a throwaway socket (independent of the
   * persistent connection) — see lib/verifySpace.ts.
   */
  verifySpace: (spaceId: string, signalingUrl: string, secret?: string) => Promise<SpaceVerifyResult>;
  /** Subscribe to raw inbound server messages; returns an unsubscribe fn. */
  subscribe: (listener: MessageListener) => () => void;
  /** Claim the room's stage for a screen/camera; `force` takes it over from the current holder. */
  claimSpotlight: (kind: 'screen' | 'camera', force?: boolean) => void;
  /** Release the stage if this client holds it. */
  releaseSpotlight: () => void;
  /**
   * Keep the join-payload ref fresh so a future reconnect's `join` message
   * carries the current custom-clip library (mirrors how avatar/accent stay
   * current — no separate reannounce path needed since the manifest already
   * rides `join` directly, unlike media state).
   */
  setSoundboardClips: (clips: SoundboardClipMeta[]) => void;
  injectGhostPeer: (peer: Peer) => void;
  clearGhostPeers: () => void;
}

const INITIAL: SignalingState = {
  status: 'idle',
  selfId: null,
  peers: [],
  error: null,
  rooms: [],
  spacePresence: [],
  spotlightHolderId: null,
  spotlightKind: null,
  moderatorId: null,
  lockedRooms: [],
  spaceLocked: false,
  bannedUsers: [],
};

/** The user-facing message for each moderation join-denial reason. */
function joinDeniedMessage(reason: 'banned' | 'space-locked' | 'room-locked'): string {
  switch (reason) {
    case 'banned':
      return 'You are banned from this Space.';
    case 'space-locked':
      return 'This Space is locked.';
    case 'room-locked':
      return 'That room is locked.';
  }
}

/** Pure reducer: maps an inbound server message to a new SignalingState. Exported for unit tests. */
export function applyPresenceUpdate(state: SignalingState, msg: ServerMessage): SignalingState {
  switch (msg.type) {
    case 'welcome':
      return {
        ...state,
        status: 'connected',
        error: null,
        selfId: msg.selfId,
        peers: msg.peers,
        rooms: msg.rooms || state.rooms,
        spotlightHolderId: msg.spotlightHolderId ?? null,
        spotlightKind: msg.spotlightKind ?? null,
        // Room-scoped like the spotlight: absent (lobby welcome) = no moderator.
        moderatorId: msg.moderatorId ?? null,
        // Space-scoped: omitted on a room-switch welcome, so omit-means-keep.
        lockedRooms: msg.lockedRooms ?? state.lockedRooms,
        spaceLocked: msg.spaceLocked ?? state.spaceLocked,
        bannedUsers: msg.bannedUsers ?? state.bannedUsers,
      };
    case 'space-presence':
      return { ...state, spacePresence: msg.presence };
    case 'space-peer-update': {
      const idx = state.spacePresence.findIndex((p) => p.peer.userId === msg.presence.peer.userId);
      if (idx >= 0) {
        const next = [...state.spacePresence];
        next[idx] = msg.presence;
        return { ...state, spacePresence: next };
      }
      return { ...state, spacePresence: [...state.spacePresence, msg.presence] };
    }
    case 'space-peer-remove':
      return {
        ...state,
        spacePresence: state.spacePresence.filter((p) => p.peer.userId !== msg.userId),
      };
    case 'rooms-updated':
      return { ...state, rooms: msg.rooms };
    case 'peer-joined':
      return state.peers.some((p) => p.id === msg.peer.id)
        ? state
        : { ...state, peers: [...state.peers, msg.peer] };
    case 'peer-left': {
      // If the leaver held the stage, free it locally too (the server also
      // broadcasts spotlight-state null, but clearing here avoids a stuck theater
      // if that message is missed). Same belt-and-suspenders for the moderator —
      // the server's moderator-state follow-up names the successor.
      const heldStage = state.spotlightHolderId === msg.peerId;
      return {
        ...state,
        peers: state.peers.filter((p) => p.id !== msg.peerId),
        spotlightHolderId: heldStage ? null : state.spotlightHolderId,
        spotlightKind: heldStage ? null : state.spotlightKind,
        moderatorId: state.moderatorId === msg.peerId ? null : state.moderatorId,
      };
    }
    case 'spotlight-state':
      return { ...state, spotlightHolderId: msg.holderId, spotlightKind: msg.kind };
    case 'moderator-state':
      return { ...state, moderatorId: msg.holderId };
    case 'room-lock-state': {
      const others = state.lockedRooms.filter((id) => id !== msg.room);
      return { ...state, lockedRooms: msg.locked ? [...others, msg.room] : others };
    }
    case 'space-lock-state':
      return { ...state, spaceLocked: msg.locked };
    case 'ban-state':
      return { ...state, bannedUsers: msg.bannedUsers };
    case 'kicked':
      // Room-scope is handled by App (leaveRoom + notice); only a space-scope
      // kick/ban ends the session (room-full shape — terminal).
      return msg.scope === 'space'
        ? {
            ...INITIAL,
            status: 'kicked',
            error:
              msg.reason === 'banned'
                ? 'You were banned from this Space.'
                : 'You were removed from this Space.',
            rooms: state.rooms,
          }
        : state;
    case 'join-denied':
      return {
        ...INITIAL,
        status: 'kicked',
        error: joinDeniedMessage(msg.reason),
        rooms: state.rooms,
      };
    case 'mic-state':
      return {
        ...state,
        peers: state.peers.map((p) => (p.id === msg.from ? { ...p, muted: msg.muted } : p)),
      };
    case 'speaking-state':
      return {
        ...state,
        peers: state.peers.map((p) => (p.id === msg.from ? { ...p, speaking: msg.speaking } : p)),
      };
    case 'cam-state':
      return {
        ...state,
        peers: state.peers.map((p) => (p.id === msg.from ? { ...p, cameraOn: msg.on } : p)),
      };
    case 'screen-state':
      return {
        ...state,
        peers: state.peers.map((p) =>
          p.id === msg.from ? { ...p, screenStreamId: msg.streamId } : p,
        ),
      };
    case 'deafen-state':
      return {
        ...state,
        peers: state.peers.map((p) =>
          p.id === msg.from ? { ...p, deafened: msg.deafened } : p,
        ),
      };
    case 'status-state':
      return {
        ...state,
        peers: state.peers.map((p) => (p.id === msg.from ? { ...p, status: msg.status } : p)),
      };
    case 'avatar-state':
      return {
        ...state,
        peers: state.peers.map((p) =>
          p.id === msg.from ? { ...p, avatarDataUrl: msg.avatarDataUrl } : p,
        ),
      };
    case 'voice-state':
      return {
        ...state,
        peers: state.peers.map((p) =>
          p.id === msg.from ? { ...p, voicePreference: msg.voicePreference } : p,
        ),
      };
    case 'accent-state':
      return {
        ...state,
        peers: state.peers.map((p) =>
          p.id === msg.from ? { ...p, accentColor: msg.accentColor } : p,
        ),
      };
    case 'soundboard-manifest-state':
      return {
        ...state,
        peers: state.peers.map((p) =>
          p.id === msg.from ? { ...p, soundboardClips: msg.clips } : p,
        ),
      };
    case 'sink-state':
      return {
        ...state,
        peers: state.peers.map((p) =>
          p.id === msg.from
            ? { ...p, wantsVideo: msg.wantsVideo, videoSubscriptions: msg.subscriptions }
            : p,
        ),
      };
    case 'room-full':
      return {
        ...INITIAL,
        status: 'room-full',
        error: `Room "${msg.room}" is full.`,
        rooms: state.rooms,
      };
    default:
      return state;
  }
}

/**
 * Manages the WebSocket connection to the signaling server and the room's
 * peer list. Auto-reconnects with backoff after an unexpected drop (re-joining
 * the same room), and runs an app-level ping/pong heartbeat to detect dead /
 * half-open connections. On reconnect the server assigns a new selfId, so the
 * WebRTC mesh rebuilds from the fresh `welcome`.
 */
export function useSignaling(): Signaling {
  const [state, setState] = useState<SignalingState>(INITIAL);
  const socketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<MessageListener>>(new Set());

  const spaceIdRef = useRef('');
  const roomRef = useRef<string | null>(null);
  const nameRef = useRef('');
  const userIdRef = useRef('');
  const roomsRef = useRef<Room[]>([]);
  const statusRef = useRef<'online' | 'idle' | 'dnd'>('online');
  const avatarDataUrlRef = useRef<string | null>(null);
  const bannerDataUrlRef = useRef<string | null>(null);
  const soundboardClipsRef = useRef<SoundboardClipMeta[]>([]);
  const voicePreferenceRef = useRef<string>('');
  const accentColorRef = useRef<string>('');
  const joinSecretRef = useRef<string>('');
  const signalingUrlRef = useRef<string>('ws://localhost:8080');
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
    if (reconnectExhausted(attemptsRef.current)) {
      shouldReconnectRef.current = false;
      setState((prev) => ({
        ...INITIAL,
        status: 'error',
        error: 'Lost connection to the signaling server.',
        rooms: prev.rooms,
      }));
      return;
    }
    setState((prev) => ({ ...prev, status: 'reconnecting' }));
    reconnectTimerRef.current = setTimeout(
      () => connectRef.current(),
      reconnectDelayMs(attemptsRef.current),
    );
  }, []);

  const connect = useCallback(() => {
    const socket = new WebSocket(signalingUrlRef.current);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'join',
          spaceId: spaceIdRef.current,
          room: roomRef.current,
          displayName: nameRef.current,
          userId: userIdRef.current,
          rooms: roomsRef.current,
          status: statusRef.current,
          avatarDataUrl: avatarDataUrlRef.current,
          voicePreference: voicePreferenceRef.current,
          accentColor: accentColorRef.current,
          // Use space-specific secret if provided, else fallback to global.
          secret: joinSecretRef.current || (window.chickadee?.joinSecret ?? ''),
          bannerDataUrl: bannerDataUrlRef.current,
          soundboardClips: soundboardClipsRef.current,
        }),
      );
      // Heartbeat: ping periodically; if pongs stop, force-close → reconnect.
      lastPongRef.current = Date.now();
      pingTimerRef.current = setInterval(() => {
        if (heartbeatExpired(lastPongRef.current, Date.now())) {
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

      // 1. Pong: update heartbeat timestamp and return early.
      if (msg.type === 'pong') {
        lastPongRef.current = Date.now();
        return;
      }

      // 2. Fan out to the WebRTC layer before updating presence state.
      for (const listener of listenersRef.current) listener(msg);

      // 3. Side effect: reset attempt counter on successful (re)connect.
      if (msg.type === 'welcome') attemptsRef.current = 0;

      // 4. Apply the presence state update.
      setState((prev) => applyPresenceUpdate(prev, msg));

      // 5. Side effects for terminal cases: room-full, a moderation join
      // denial, and a space-scope kick/ban all end the session (no reconnect).
      if (
        msg.type === 'room-full' ||
        msg.type === 'join-denied' ||
        (msg.type === 'kicked' && msg.scope === 'space')
      ) {
        shouldReconnectRef.current = false;
        clearTimers();
        closeSocket();
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
          prev.status === 'room-full' || prev.status === 'kicked' || prev.status === 'error'
            ? prev
            : { ...INITIAL, status: 'closed' },
        );
      }
    };
  }, [scheduleReconnect, clearTimers, closeSocket]);

  // Keep the ref pointing at the latest connect for scheduleReconnect to call.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const join = useCallback(
    (spaceId: string, room: string | null, displayName: string, userId: string, roomsList: Room[], status: 'online' | 'idle' | 'dnd', avatarDataUrl?: string | null, voicePreference?: string, accentColor?: string, joinSecret?: string, signalingUrl?: string, bannerDataUrl?: string | null, soundboardClips?: SoundboardClipMeta[]) => {
      closeSocket();
      clearTimers();
      shouldReconnectRef.current = true;
      attemptsRef.current = 0;
      spaceIdRef.current = spaceId;
      roomRef.current = room;
      nameRef.current = displayName;
      userIdRef.current = userId;
      roomsRef.current = roomsList;
      statusRef.current = status;
      avatarDataUrlRef.current = avatarDataUrl ?? null;
      voicePreferenceRef.current = voicePreference ?? '';
      accentColorRef.current = accentColor ?? '';
      joinSecretRef.current = joinSecret ?? '';
      if (signalingUrl) signalingUrlRef.current = signalingUrl;
      bannerDataUrlRef.current = bannerDataUrl ?? null;
      soundboardClipsRef.current = soundboardClips ?? [];
      setState({ ...INITIAL, status: 'connecting', rooms: roomsList });
      connect();
    },
    [closeSocket, clearTimers, connect],
  );

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }, []);

  const joinRoom = useCallback(
    (room: string | null) => {
      roomRef.current = room;
      send({ type: 'join-room', room });
    },
    [send],
  );

  const claimSpotlight = useCallback(
    (kind: 'screen' | 'camera', force?: boolean) => {
      send({ type: 'claim-spotlight', kind, force });
    },
    [send],
  );

  const releaseSpotlight = useCallback(() => {
    send({ type: 'release-spotlight' });
  }, [send]);

  const setSoundboardClips = useCallback((clips: SoundboardClipMeta[]) => {
    soundboardClipsRef.current = clips;
  }, []);

  const leave = useCallback(() => {
    shouldReconnectRef.current = false;
    clearTimers();
    closeSocket();
    setState(INITIAL);
  }, [clearTimers, closeSocket]);

  const injectGhostPeer = useCallback((peer: Peer) => {
    setState((prev) => ({ ...prev, peers: [...prev.peers, peer] }));
  }, []);

  const clearGhostPeers = useCallback(() => {
    setState((prev) => ({
      ...prev,
      peers: prev.peers.filter((p) => !p.id.startsWith('ghost-')),
    }));
  }, []);

  // Clean up timers + socket if the component unmounts mid-call.
  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      clearTimers();
      closeSocket();
    };
  }, [clearTimers, closeSocket]);

  return {
    ...state,
    join,
    leave,
    joinRoom,
    send,
    subscribe,
    verifySpace,
    claimSpotlight,
    releaseSpotlight,
    setSoundboardClips,
    injectGhostPeer,
    clearGhostPeers,
  };
}
