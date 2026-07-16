import { useEffect, useRef } from 'react';
import type { ClientMessage, Peer, ServerMessage } from '@chickadee/shared';
import { MAX_SOUNDBOARD_FETCH_HASHES } from '@chickadee/shared';
import { createReceiveLink, createSendLink, type FileLink } from '../webrtc/fileTransferLink';
import { makeBatchFileId, parseBatchFileId } from '../webrtc/fileTransferPolicy';
import type { ReceiverIo } from '../webrtc/transferQueue';
import { canStartFetch, planMissingClipFetches } from '../webrtc/soundboardSyncPolicy';
import { shouldAutoSyncFrom } from '../lib/soundboardTrust';

export interface SoundboardSyncArgs {
  peers: Peer[];
  send: (message: ClientMessage) => void;
  subscribe: (listener: (message: ServerMessage) => void) => () => void;
  iceServers: RTCIceServer[];
  enabled: boolean;
  autoSyncEnabled: boolean;
}

interface PendingRequest {
  /** index-aligned with the hashes sent in the original soundboard-fetch-request. */
  clips: { hash: string; sizeBytes: number }[];
}

/**
 * Silent background P2P sync for custom soundboard clips: diffs room peers'
 * advertised manifests against the local cache, requests what's missing, and
 * — symmetrically — serves whatever a peer requests that this device
 * actually has. Reuses the file-transfer WebRTC machinery UNCHANGED
 * (createSendLink/createReceiveLink/createReceiveQueue via ReceiverIo) as a
 * silent pull instead of a user-prompted push; only the orchestration here
 * and the cache-backed IO are new. No UI surface — SoundboardPopover checks
 * cache.has() itself for the "syncing…" tile state.
 */
export function useSoundboardSync({ peers, send, subscribe, iceServers, enabled, autoSyncEnabled }: SoundboardSyncArgs): void {
  const linksRef = useRef<Map<string, FileLink>>(new Map());
  /** Hashes confirmed present in the local cache — own clips and completed fetches alike. */
  const cachedHashesRef = useRef<Set<string>>(new Set());
  /** Hashes with a fetch-request already in flight this session — avoids re-requesting on every peers[] change. */
  const requestedHashesRef = useRef<Set<string>>(new Set());
  /** My own outbound requests, keyed by the root requestId I generated. */
  const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());

  const sendRef = useRef(send);
  sendRef.current = send;
  const iceServersRef = useRef(iceServers);
  iceServersRef.current = iceServers;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const closeLink = (id: string): void => {
    linksRef.current.get(id)?.close();
    linksRef.current.delete(id);
  };

  // --- Requester side: diff peers against the cache, request what's missing ---
  useEffect(() => {
    if (!enabled || !autoSyncEnabled || !window.chickadee) return;
    const bridge = window.chickadee;
    let cancelled = false;

    void (async () => {
      const toCheck: string[] = [];
      const seen = new Set<string>();
      for (const peer of peers) {
        for (const clip of peer.soundboardClips) {
          if (seen.has(clip.hash)) continue;
          seen.add(clip.hash);
          if (!cachedHashesRef.current.has(clip.hash) && !requestedHashesRef.current.has(clip.hash)) {
            toCheck.push(clip.hash);
          }
        }
      }
      if (toCheck.length === 0) return;

      const haveResults = await Promise.all(toCheck.map((h) => bridge.soundboard.cache.has(h)));
      if (cancelled) return;
      toCheck.forEach((h, i) => {
        if (haveResults[i]) cachedHashesRef.current.add(h);
      });

      const eligiblePeers = peers.filter((p) => shouldAutoSyncFrom(p.userId, { soundboardAutoSyncEnabled: autoSyncEnabled }));
      const exclude = new Set([...cachedHashesRef.current, ...requestedHashesRef.current]);
      const plan = planMissingClipFetches(eligiblePeers, exclude, MAX_SOUNDBOARD_FETCH_HASHES);
      for (const { toPeerId, clips } of plan) {
        const requestId = crypto.randomUUID();
        pendingRequestsRef.current.set(requestId, { clips });
        for (const c of clips) requestedHashesRef.current.add(c.hash);
        sendRef.current({
          type: 'soundboard-fetch-request',
          to: toPeerId,
          requestId,
          hashes: clips.map((c) => c.hash),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, enabled, autoSyncEnabled]);

  // --- Receiver side: lazily create a receive link for one planned clip ---
  const createFetchReceiveLink = (rootRequestId: string, index: number, hash: string, sizeBytes: number, fromPeerId: string): void => {
    const derivedId = makeBatchFileId(rootRequestId, index);
    if (linksRef.current.has(derivedId) || !window.chickadee) return;
    const bridge = window.chickadee;
    let opened = false;
    const ensureStream = async (): Promise<void> => {
      if (opened) return;
      const ok = await bridge.soundboard.cache.beginWrite(hash);
      if (!ok) throw new Error('cache write rejected');
      opened = true;
    };
    const io: ReceiverIo = {
      write: async (chunk) => {
        await ensureStream();
        return bridge.soundboard.cache.writeChunk(hash, chunk);
      },
      finish: async () => {
        await ensureStream();
        await bridge.soundboard.cache.endWrite(hash);
      },
      abort: () => (opened ? bridge.soundboard.cache.abortWrite(hash) : Promise.resolve()),
    };
    const link = createReceiveLink({
      transferId: derivedId,
      size: sizeBytes,
      io,
      iceServers: iceServersRef.current,
      sendSignal: (payload) =>
        sendRef.current({ type: 'soundboard-fetch-signal', to: fromPeerId, requestId: derivedId, ...payload }),
      cb: {
        onProgress: () => {},
        onDone: () => {
          cachedHashesRef.current.add(hash);
          requestedHashesRef.current.delete(hash);
          closeLink(derivedId);
        },
        // A fetch that fails or gets cancelled isn't retried automatically —
        // fire-and-forget, same delivery posture as chat/reactions — but it's
        // un-marked as "requested" so a later peers[] change can retry it
        // (possibly from a different possessor).
        onError: () => {
          requestedHashesRef.current.delete(hash);
          closeLink(derivedId);
        },
        onPeerCancel: () => {
          requestedHashesRef.current.delete(hash);
          closeLink(derivedId);
        },
      },
    });
    linksRef.current.set(derivedId, link);
  };

  // --- Possessor side: serve whatever of a fetch-request this device actually has ---
  const handleFetchRequest = async (msg: Extract<ServerMessage, { type: 'soundboard-fetch-request' }>): Promise<void> => {
    if (!enabledRef.current || !window.chickadee) return;
    const bridge = window.chickadee;
    const haveResults = await Promise.all(msg.hashes.map((h) => bridge.soundboard.cache.has(h)));
    const servable = msg.hashes
      .map((hash, index) => (haveResults[index] ? { hash, index } : null))
      .filter((v): v is { hash: string; index: number } => v !== null);

    if (servable.length === 0) {
      sendRef.current({ type: 'soundboard-fetch-cancel', to: msg.from, requestId: msg.requestId, reason: 'unavailable' });
      return;
    }

    let cursor = 0;
    let activeCount = 0;
    const startNext = (): void => {
      while (canStartFetch(activeCount) && cursor < servable.length) {
        const { hash, index } = servable[cursor];
        cursor += 1;
        activeCount += 1;
        void startSendLink(msg.requestId, index, hash, msg.from, () => {
          activeCount -= 1;
          startNext();
        });
      }
    };
    startNext();
  };

  const startSendLink = async (
    rootRequestId: string,
    index: number,
    hash: string,
    toPeerId: string,
    onSettled: () => void,
  ): Promise<void> => {
    const derivedId = makeBatchFileId(rootRequestId, index);
    if (linksRef.current.has(derivedId) || !window.chickadee) {
      onSettled();
      return;
    }
    const bytes = await window.chickadee.soundboard.cache.read(hash);
    if (!bytes) {
      // Vanished between has() and read() (e.g. the user just deleted it) — skip silently.
      onSettled();
      return;
    }
    // IPC-delivered bytes are always backed by a real ArrayBuffer (never SharedArrayBuffer).
    const file = new File([bytes as Uint8Array<ArrayBuffer>], hash);
    let settled = false;
    const settleOnce = (): void => {
      if (settled) return;
      settled = true;
      closeLink(derivedId);
      onSettled();
    };
    const link = createSendLink({
      transferId: derivedId,
      file,
      iceServers: iceServersRef.current,
      sendSignal: (payload) =>
        sendRef.current({ type: 'soundboard-fetch-signal', to: toPeerId, requestId: derivedId, ...payload }),
      cb: { onProgress: () => {}, onDone: settleOnce, onError: settleOnce, onPeerCancel: settleOnce },
    });
    linksRef.current.set(derivedId, link);
  };

  const handleFetchSignal = (msg: Extract<ServerMessage, { type: 'soundboard-fetch-signal' }>): void => {
    // -signal always carries the DERIVED per-clip id (see protocol.ts's doc comment).
    const derivedId = msg.requestId;
    const existing = linksRef.current.get(derivedId);
    if (existing) {
      void existing.handleSignal({ sdp: msg.sdp, candidate: msg.candidate });
      return;
    }
    const parsed = parseBatchFileId(derivedId);
    if (!parsed) return;
    const pending = pendingRequestsRef.current.get(parsed.batchId);
    const clip = pending?.clips[parsed.index];
    if (!clip) return;
    createFetchReceiveLink(parsed.batchId, parsed.index, clip.hash, clip.sizeBytes, msg.from);
    linksRef.current.get(derivedId)?.handleSignal({ sdp: msg.sdp, candidate: msg.candidate });
  };

  const handleFetchCancel = (msg: Extract<ServerMessage, { type: 'soundboard-fetch-cancel' }>): void => {
    const prefix = `${msg.requestId}:`;
    for (const id of [...linksRef.current.keys()]) {
      if (id === msg.requestId || id.startsWith(prefix)) closeLink(id);
    }
    pendingRequestsRef.current.delete(msg.requestId);
  };

  useEffect(() => {
    return subscribe((msg) => {
      if (!enabledRef.current) return;
      if (msg.type === 'soundboard-fetch-request') void handleFetchRequest(msg);
      else if (msg.type === 'soundboard-fetch-signal') handleFetchSignal(msg);
      else if (msg.type === 'soundboard-fetch-cancel') handleFetchCancel(msg);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe]);

  // Off means off: close everything in flight, not just "stop starting new syncs".
  useEffect(() => {
    if (enabled) return;
    for (const link of linksRef.current.values()) link.close();
    linksRef.current.clear();
    pendingRequestsRef.current.clear();
    requestedHashesRef.current.clear();
  }, [enabled]);

  useEffect(() => {
    return () => {
      for (const link of linksRef.current.values()) link.close();
      linksRef.current.clear();
    };
  }, []);
}
