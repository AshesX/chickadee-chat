import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  MAX_DISPLAY_NAME_LEN,
  MAX_VOICE_PREF_LEN,
  clampString,
  sanitizeAccentColor,
  sanitizeAvatarDataUrl,
  sanitizeBannerDataUrl,
  sanitizeSoundboardClips,
  sanitizeStatus,
  type ClientMessage,
  type Peer,
  type PeerId,
  type RoomId,
  type SpacePresence,
} from '@chickadee/shared';
import {
  broadcast,
  broadcastSpace,
  roomLocks,
  roomModeratorId,
  rooms,
  scheduleSpaceCleanup,
  send,
  spaceBanners,
  spaceBans,
  spaceConnections,
  spaceGraceTimers,
  spaceLocks,
  spaceOwners,
  spacePresence,
  spaceTimeouts,
  spaces,
  spotlights,
  syncRoomModerator,
  type Connection,
} from '../state';
import { evaluateJoinGate, evaluateRoomEntry, resolveRoomCap, sanitizeJoinRequest } from '../logic';
import { clearSpotlightIfHeld } from './spotlight';

export function handleJoin(socket: WebSocket, msg: Extract<ClientMessage, { type: 'join' }>): Connection | null {
  const sanitized = sanitizeJoinRequest(msg);
  if (!sanitized) return null;
  const { spaceId, userId, room, joinRooms } = sanitized;

  // Space-level moderation gate, decided BEFORE the ghost cleanup below so a
  // rejected join can never tear down the target's live connection. Bans key
  // on the client-asserted userId (honor-system); a locked space still admits
  // the owner and anyone the presence roster knows (members + <10-min-offline
  // reconnects — which is also what lets a locked-out-of-band member return).
  const isOwner = !!userId && spaceOwners.get(spaceId) === userId;
  const gate = evaluateJoinGate({
    isBanned: !!userId && (spaceBans.get(spaceId)?.has(userId) ?? false),
    spaceLocked: spaceLocks.get(spaceId) ?? false,
    isOwner,
    knownToPresence: !!userId && (spacePresence.get(spaceId)?.has(userId) ?? false),
  });
  if (gate !== 'ok') {
    send(socket, { type: 'join-denied', spaceId, reason: gate });
    return null;
  }

  // If a connection with the same userId already exists in this space, clean it up first.
  if (userId) {
    const spaceConns = spaceConnections.get(spaceId);
    if (spaceConns) {
      const ghosts: Connection[] = [];
      for (const conn of spaceConns.values()) {
        if (conn.peer.userId === userId) {
          ghosts.push(conn);
        }
      }
      for (const ghost of ghosts) {
        console.log(`[join-cleanup] closing ghost connection for userId ${userId} (${ghost.peer.id})`);
        ghost.socket.removeAllListeners('close');
        ghost.socket.removeAllListeners('error');
        ghost.socket.close();
        handleDisconnect(ghost);
      }
    }
  }

  const fullRoomId = room ? `${spaceId}:${room}` : null;
  const members = fullRoomId ? (rooms.get(fullRoomId) ?? new Map<PeerId, Connection>()) : null;

  // Resolve the space's room list (existing, else the joiner's local list) so the
  // joining room's type drives the capacity.
  const knownRooms = spaces.get(spaceId) ?? joinRooms;
  const roomCap = resolveRoomCap(knownRooms, room);

  if (members && fullRoomId) {
    const entry = evaluateRoomEntry({
      locked: roomLocks.has(fullRoomId),
      isOwner,
      memberCount: members.size,
      cap: roomCap,
    });
    if (entry === 'room-locked') {
      send(socket, { type: 'join-denied', spaceId, reason: 'room-locked' });
      return null;
    }
    if (entry === 'full') {
      // members is non-null only when fullRoomId (and thus room) is non-null.
      send(socket, { type: 'room-full', room: room! });
      return null;
    }
  }

  const id = randomUUID();
  const peer: Peer = {
    id,
    // Tolerant: fall back to the session id if a client omits a stable userId.
    userId: userId || id,
    displayName: clampString(msg.displayName, MAX_DISPLAY_NAME_LEN) || 'Anonymous',
    muted: false,
    speaking: false,
    cameraOn: false,
    screenStreamId: null,
    deafened: false,
    status: sanitizeStatus(msg.status),
    avatarDataUrl: sanitizeAvatarDataUrl(msg.avatarDataUrl),
    voicePreference: clampString(msg.voicePreference, MAX_VOICE_PREF_LEN),
    accentColor: sanitizeAccentColor(msg.accentColor),
    wantsVideo: true,
    videoSubscriptions: [],
    soundboardClips: sanitizeSoundboardClips(msg.soundboardClips),
  };
  const conn: Connection = { socket, peer, space: spaceId, room: fullRoomId };

  const wasEmpty = !spaces.has(spaceId);

  // Track/sync rooms for the space
  if (wasEmpty && joinRooms.length > 0) {
    spaces.set(spaceId, joinRooms);
  }
  const spaceRooms = spaces.get(spaceId) ?? joinRooms;

  // Seed the Space's banner from the first joiner's local cache if the server
  // has no live record yet (same "resurrect from the joining client" discipline
  // as the room-list seed above). Any joiner can seed it — unlike ownership, a
  // wrong seed here is just a stale picture until the real owner reconnects and
  // re-sends set-banner, not a trust/security concern. Only a non-null value
  // seeds, though: a joiner with no locally-cached banner (e.g. a second test
  // client, or anyone who isn't the owner) must not lock the map to "no banner"
  // ahead of the actual owner's own rejoin, which would otherwise wipe a real
  // banner it never got the chance to re-seed.
  if (!spaceBanners.has(spaceId) && msg.bannerDataUrl != null) {
    spaceBanners.set(spaceId, { dataUrl: sanitizeBannerDataUrl(msg.bannerDataUrl), setBy: peer.userId });
  }

  // Snapshot existing peers before adding the newcomer.
  const existingPeers: Peer[] = members ? [...members.values()].map((c) => c.peer) : [];

  if (fullRoomId && members) {
    members.set(peer.id, conn);
    rooms.set(fullRoomId, members);
  }

  // Add to spaceConnections
  const spaceConns = spaceConnections.get(spaceId) ?? new Map<PeerId, Connection>();
  spaceConns.set(peer.id, conn);
  spaceConnections.set(spaceId, spaceConns);

  // Someone is here again — cancel any pending grace teardown for this space.
  const grace = spaceGraceTimers.get(spaceId);
  if (grace) {
    clearTimeout(grace);
    spaceGraceTimers.delete(spaceId);
  }

  // Tell the newcomer who is already here (newcomer will initiate offers in Phase 2), the
  // current room list, who (if anyone) currently holds the room's stage, and the
  // Space's moderation snapshot (locks + bans; the joiner persists bans so a
  // future owner can re-seed them after a server restart).
  const joinSpotlight = fullRoomId ? spotlights.get(fullRoomId) : undefined;
  const spaceBanList = spaceBans.get(spaceId);
  const spacePrefix = `${spaceId}:`;
  send(socket, {
    type: 'welcome',
    selfId: peer.id,
    peers: existingPeers,
    rooms: spaceRooms,
    wasEmpty,
    spotlightHolderId: joinSpotlight?.holderId ?? null,
    spotlightKind: joinSpotlight?.kind ?? null,
    ownerId: spaceOwners.get(spaceId) ?? null,
    bannerDataUrl: spaceBanners.get(spaceId)?.dataUrl ?? null,
    // Computed after members.set above, so a first joiner sees themselves as moderator.
    moderatorId: roomModeratorId(fullRoomId),
    lockedRooms: [...roomLocks].filter((id) => id.startsWith(spacePrefix)).map((id) => id.slice(spacePrefix.length)),
    spaceLocked: spaceLocks.get(spaceId) ?? false,
    bannedUsers: spaceBanList ? [...spaceBanList.entries()].map(([uid, displayName]) => ({ userId: uid, displayName })) : [],
  });

  // Update space presence
  const presenceMap = spacePresence.get(spaceId) ?? new Map<string, SpacePresence>();
  const presence: SpacePresence = {
    peer,
    roomId: room,
  };
  presenceMap.set(peer.userId, presence);
  spacePresence.set(spaceId, presenceMap);

  // Clear timeout if any
  const timeouts = spaceTimeouts.get(spaceId);
  if (timeouts) {
    const timer = timeouts.get(peer.userId);
    if (timer) {
      clearTimeout(timer);
      timeouts.delete(peer.userId);
    }
  }

  // Send the full space-presence to newcomer
  const allSpacePresence = Array.from(presenceMap.values());
  send(socket, { type: 'space-presence', presence: allSpacePresence });

  // Broadcast update to space (except newcomer)
  broadcastSpace(spaceId, { type: 'space-peer-update', presence }, conn);

  // Tell everyone else about the newcomer.
  if (fullRoomId) {
    broadcast(fullRoomId, { type: 'peer-joined', peer }, peer.id);
    console.log(`[join] ${peer.displayName} (${peer.id}) -> room "${fullRoomId}" (${members!.size}/${roomCap})`);
  } else {
    console.log(`[join] ${peer.displayName} (${peer.id}) -> Space "${spaceId}" (no room)`);
  }

  return conn;
}

export function handleJoinRoom(conn: Connection, newRoom: RoomId | null): void {
  const oldFullRoomId = conn.room;
  const newFullRoomId = newRoom ? `${conn.space}:${newRoom}` : null;
  if (oldFullRoomId === newFullRoomId) return;

  const spaceRooms = spaces.get(conn.space) ?? [];

  // 1. Leave old room if in one
  if (oldFullRoomId) {
    // Free the stage if the leaver held it, before dropping them from the room.
    clearSpotlightIfHeld(oldFullRoomId, conn.peer.id);
    const members = rooms.get(oldFullRoomId);
    if (members) {
      const prevMod = roomModeratorId(oldFullRoomId);
      members.delete(conn.peer.id);
      broadcast(oldFullRoomId, { type: 'peer-left', peerId: conn.peer.id });
      console.log(`[leave-room] ${conn.peer.displayName} (${conn.peer.id}) <- room "${oldFullRoomId}" (${members.size})`);
      if (members.size === 0) {
        rooms.delete(oldFullRoomId);
        spotlights.delete(oldFullRoomId);
        // Room locks are session-scoped: the lock dies with the room.
        roomLocks.delete(oldFullRoomId);
      } else {
        // Moderator = longest-present; announce if the departure passed it on.
        syncRoomModerator(oldFullRoomId, prevMod);
      }
    }
  }

  // 2. Clear room-specific media flags if leaving room
  if (!newRoom) {
    conn.peer.cameraOn = false;
    conn.peer.screenStreamId = null;
  }

  // 3. Join new room if not null
  if (newRoom && newFullRoomId) {
    const members = rooms.get(newFullRoomId) ?? new Map<PeerId, Connection>();
    const roomCap = resolveRoomCap(spaceRooms, newRoom);
    const entry = evaluateRoomEntry({
      locked: roomLocks.has(newFullRoomId),
      isOwner: spaceOwners.get(conn.space) === conn.peer.userId,
      memberCount: members.size,
      cap: roomCap,
    });
    if (entry === 'room-locked') {
      send(conn.socket, { type: 'join-denied', spaceId: conn.space, reason: 'room-locked' });
      conn.room = null;
    } else if (entry === 'full') {
      send(conn.socket, { type: 'room-full', room: newRoom });
      conn.room = null;
    } else {
      conn.room = newFullRoomId;
      const existingPeers = [...members.values()].map((c) => c.peer);
      members.set(conn.peer.id, conn);
      rooms.set(newFullRoomId, members);

      // Send welcome to newcomer, including who holds the new room's stage and
      // who moderates it (computed post-insert, so a first joiner sees themselves).
      const roomSpotlight = spotlights.get(newFullRoomId);
      send(conn.socket, {
        type: 'welcome',
        selfId: conn.peer.id,
        peers: existingPeers,
        rooms: spaceRooms,
        spotlightHolderId: roomSpotlight?.holderId ?? null,
        spotlightKind: roomSpotlight?.kind ?? null,
        moderatorId: roomModeratorId(newFullRoomId),
      });

      // Broadcast peer-joined to new room
      broadcast(newFullRoomId, { type: 'peer-joined', peer: conn.peer }, conn.peer.id);
      console.log(`[join-room] ${conn.peer.displayName} (${conn.peer.id}) -> room "${newFullRoomId}" (${members.size}/${roomCap})`);
    }
  } else {
    conn.room = null;
    // Send welcome with empty peers to newcomer to clear their peer mesh
    send(conn.socket, { type: 'welcome', selfId: conn.peer.id, peers: [], rooms: spaceRooms });
    console.log(`[leave-room-complete] ${conn.peer.displayName} (${conn.peer.id}) -> no room`);
  }

  // 4. Update space presence
  const presenceMap = spacePresence.get(conn.space);
  if (presenceMap) {
    const p = presenceMap.get(conn.peer.userId);
    if (p) {
      p.roomId = newRoom;
      p.peer = conn.peer;
      broadcastSpace(conn.space, { type: 'space-peer-update', presence: p });
    }
  }
}

/** Relay a directed WebRTC message to its target peer in the same room, stamping `from`. */
export function relay(conn: Connection, msg: ClientMessage & { to: PeerId }): void {
  if (!conn.room) return;
  const members = rooms.get(conn.room);
  const target = members?.get(msg.to);
  if (!target) return;

  switch (msg.type) {
    case 'offer':
      send(target.socket, { type: 'offer', from: conn.peer.id, sdp: msg.sdp });
      break;
    case 'answer':
      send(target.socket, { type: 'answer', from: conn.peer.id, sdp: msg.sdp });
      break;
    case 'ice-candidate':
      send(target.socket, { type: 'ice-candidate', from: conn.peer.id, candidate: msg.candidate });
      break;
    case 'relink':
      send(target.socket, { type: 'relink', from: conn.peer.id });
      break;
  }
}

export function handleDisconnect(conn: Connection): void {
  if (conn.room) {
    // Free the stage if this peer held it, so the room doesn't stay stuck in theater.
    clearSpotlightIfHeld(conn.room, conn.peer.id);
    const members = rooms.get(conn.room);
    if (members) {
      const prevMod = roomModeratorId(conn.room);
      members.delete(conn.peer.id);
      broadcast(conn.room, { type: 'peer-left', peerId: conn.peer.id });
      console.log(`[leave] ${conn.peer.displayName} (${conn.peer.id}) <- room "${conn.room}" (${members.size})`);
      if (members.size === 0) {
        rooms.delete(conn.room);
        spotlights.delete(conn.room);
        // Room locks are session-scoped: the lock dies with the room.
        roomLocks.delete(conn.room);
      } else {
        // Moderator = longest-present; announce if the departure passed it on.
        syncRoomModerator(conn.room, prevMod);
      }
    }
  }

  // Remove from spaceConnections. Keep the (possibly now-empty) map in place; the
  // empty-Space teardown is deferred via scheduleSpaceCleanup below so a sole member
  // reconnecting doesn't make the Space momentarily report as non-existent.
  const spaceConns = spaceConnections.get(conn.space);
  if (spaceConns) {
    spaceConns.delete(conn.peer.id);
  }

  // Update space presence to offline
  const presenceMap = spacePresence.get(conn.space);
  if (presenceMap) {
    const p = presenceMap.get(conn.peer.userId);
    // Only set offline if this exact connection's peer id matches (prevents ghosting if they already rejoined on another socket)
    if (p && p.peer.id === conn.peer.id) {
      p.roomId = null;
      p.leftAt = Date.now();
      broadcastSpace(conn.space, { type: 'space-peer-update', presence: p });

      const timeouts = spaceTimeouts.get(conn.space) ?? new Map<string, ReturnType<typeof setTimeout>>();
      spaceTimeouts.set(conn.space, timeouts);
      const timer = setTimeout(() => {
        const currentP = presenceMap.get(conn.peer.userId);
        if (currentP && currentP.leftAt === p.leftAt) {
          presenceMap.delete(conn.peer.userId);
          broadcastSpace(conn.space, { type: 'space-peer-remove', userId: conn.peer.userId });
        }
      }, 10 * 60 * 1000);
      timeouts.set(conn.peer.userId, timer);
    }
  }

  // If no live connections remain, defer the Space teardown by a grace window
  // instead of deleting immediately — a rejoin within the window cancels it.
  if (spaceConns && spaceConns.size === 0) {
    scheduleSpaceCleanup(conn.space);
  }
}
