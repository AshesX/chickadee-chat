import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_ID_LEN, clampString, parseClientMessage } from '@chickadee/shared';
import { ALLOWED_ORIGINS, JOIN_SECRET, MAX_WS_PAYLOAD, MSG_RATE_LIMIT, MSG_RATE_WINDOW_MS, PORT } from './config';
import { send, spaceConnections, type Connection } from './state';
import { bumpRateWindow, type RateWindow } from './logic';
import { handleDisconnect, handleJoin, handleJoinRoom, relay } from './handlers/room';
import { relayFileMessage } from './handlers/fileTransfer';
import {
  handleAccentState,
  handleAvatarState,
  handleCamState,
  handleChat,
  handleDeafenState,
  handleMicState,
  handleScreenState,
  handleSinkState,
  handleSpeakingState,
  handleStatusState,
  handleVoiceState,
} from './handlers/mirrors';
import { handleClaimSpotlight, handleReleaseSpotlight } from './handlers/spotlight';
import { handleSoundboardManifestState, handleSoundboardTrigger } from './handlers/soundboard';
import { handleClaimOwnership, handleRenameSpace, handleSetBanner, handleUpdateRooms } from './handlers/spaceMeta';
import {
  handleBanUser,
  handleKickUser,
  handleSeedModeration,
  handleSetRoomLock,
  handleSetSpaceLock,
  handleTransferOwnership,
  handleUnbanUser,
} from './handlers/moderation';

const wss = new WebSocketServer({
  port: PORT,
  // Cap a single inbound frame so a huge payload can't exhaust memory.
  maxPayload: MAX_WS_PAYLOAD,
  // Optional Origin allowlist; empty = allow all (Electron sends no Origin).
  verifyClient: ALLOWED_ORIGINS.length === 0
    ? undefined
    : ({ origin }: { origin: string }) => !origin || ALLOWED_ORIGINS.includes(origin),
});

/** Liveness tracking for the ws-level heartbeat (terminates dead sockets). */
const alive = new WeakMap<WebSocket, boolean>();

/** Per-connection sliding-window message counter for rate limiting. */
const rate = new WeakMap<WebSocket, RateWindow>();

/** Returns true (and the socket should be dropped) when a connection floods messages. */
function isRateLimited(socket: WebSocket): boolean {
  const { window, limited } = bumpRateWindow(rate.get(socket), Date.now(), MSG_RATE_LIMIT, MSG_RATE_WINDOW_MS);
  rate.set(socket, window);
  return limited;
}

wss.on('connection', (socket) => {
  // A connection has no identity until it sends a valid `join`.
  let conn: Connection | null = null;
  alive.set(socket, true);
  socket.on('pong', () => alive.set(socket, true));

  socket.on('message', (data) => {
    // Drop abusive senders before doing any parsing work.
    if (isRateLimited(socket)) {
      socket.close(1008, 'rate limit exceeded');
      return;
    }

    const msg = parseClientMessage(data.toString());
    if (!msg) return;

    // App-level liveness ping (lets the client detect a half-open socket).
    if (msg.type === 'ping') {
      send(socket, { type: 'pong' });
      return;
    }

    // Non-mutating existence probe — answerable before/without joining. A Space
    // "exists" only while it has ≥1 connected member. On a secret mismatch we
    // report `false` rather than leaking existence to an unauthorized prober.
    if (msg.type === 'check-space') {
      const spaceId = clampString(msg.spaceId, MAX_ID_LEN);
      const authorized = !JOIN_SECRET || msg.secret === JOIN_SECRET;
      send(socket, {
        type: 'space-status',
        spaceId,
        exists: authorized && !!spaceId && spaceConnections.has(spaceId),
      });
      return;
    }

    if (msg.type === 'join') {
      if (conn) return; // already joined; ignore duplicate joins
      // Optional shared-secret gate (private deployments). Silent reject on
      // mismatch — a legitimate client always carries the configured secret.
      if (JOIN_SECRET && msg.secret !== JOIN_SECRET) {
        console.warn('[join] rejected: missing/incorrect join secret');
        socket.close(1008, 'unauthorized');
        return;
      }
      conn = handleJoin(socket, msg);
      return;
    }

    if (!conn) return; // must join before doing anything else

    if (msg.type === 'join-room') {
      handleJoinRoom(conn, msg.room);
      return;
    }

    if (msg.type === 'offer' || msg.type === 'answer' || msg.type === 'ice-candidate') {
      relay(conn, msg);
    } else if (
      msg.type === 'file-offer' ||
      msg.type === 'file-answer' ||
      msg.type === 'file-signal' ||
      msg.type === 'file-cancel'
    ) {
      relayFileMessage(conn, msg);
    } else if (msg.type === 'mic-state') {
      handleMicState(conn, msg.muted);
    } else if (msg.type === 'speaking-state') {
      handleSpeakingState(conn, msg.speaking);
    } else if (msg.type === 'cam-state') {
      handleCamState(conn, msg.on);
    } else if (msg.type === 'screen-state') {
      handleScreenState(conn, msg.streamId);
    } else if (msg.type === 'deafen-state') {
      handleDeafenState(conn, msg.deafened);
    } else if (msg.type === 'status-state') {
      handleStatusState(conn, msg.status);
    } else if (msg.type === 'avatar-state') {
      handleAvatarState(conn, msg.avatarDataUrl);
    } else if (msg.type === 'voice-state') {
      handleVoiceState(conn, msg.voicePreference);
    } else if (msg.type === 'sink-state') {
      handleSinkState(conn, msg.subscriptions, msg.wantsVideo);
    } else if (msg.type === 'claim-spotlight') {
      handleClaimSpotlight(conn, msg.kind === 'camera' ? 'camera' : 'screen', Boolean(msg.force));
    } else if (msg.type === 'release-spotlight') {
      handleReleaseSpotlight(conn);
    } else if (msg.type === 'accent-state') {
      handleAccentState(conn, msg.accentColor);
    } else if (msg.type === 'soundboard-manifest-state') {
      handleSoundboardManifestState(conn, msg.clips);
    } else if (msg.type === 'soundboard-trigger') {
      handleSoundboardTrigger(conn, msg.source, msg.clipId);
    } else if (msg.type === 'update-rooms') {
      handleUpdateRooms(conn, msg.rooms);
    } else if (msg.type === 'rename-space') {
      handleRenameSpace(conn, msg.newSpaceId, msg.newSpaceName);
    } else if (msg.type === 'claim-ownership') {
      handleClaimOwnership(conn);
    } else if (msg.type === 'set-banner') {
      handleSetBanner(conn, msg.bannerDataUrl);
    } else if (msg.type === 'kick-user') {
      handleKickUser(conn, msg.userId, msg.scope === 'space' ? 'space' : 'room');
    } else if (msg.type === 'ban-user') {
      handleBanUser(conn, msg.userId);
    } else if (msg.type === 'unban-user') {
      handleUnbanUser(conn, msg.userId);
    } else if (msg.type === 'set-room-lock') {
      handleSetRoomLock(conn, msg.room, msg.locked === true);
    } else if (msg.type === 'set-space-lock') {
      handleSetSpaceLock(conn, msg.locked === true);
    } else if (msg.type === 'transfer-ownership') {
      handleTransferOwnership(conn, msg.toUserId);
    } else if (msg.type === 'seed-moderation') {
      handleSeedModeration(conn, msg.bannedUsers, msg.locked);
    } else if (msg.type === 'chat') {
      handleChat(conn, msg.text, msg.reaction);
    }
  });

  socket.on('close', () => {
    if (conn) handleDisconnect(conn);
  });

  socket.on('error', () => {
    if (conn) handleDisconnect(conn);
  });
});

// ws-level heartbeat: ping every client; terminate any that didn't pong since
// the last round. Terminating fires 'close' → handleDisconnect → peer-left, so
// dead peers are cleaned up promptly instead of lingering until TCP timeout.
const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (alive.get(client) === false) {
      client.terminate();
      continue;
    }
    alive.set(client, false);
    client.ping();
  }
}, 20_000);

wss.on('close', () => clearInterval(heartbeat));

console.log(`Chickadee signaling server listening on :${PORT}`);
