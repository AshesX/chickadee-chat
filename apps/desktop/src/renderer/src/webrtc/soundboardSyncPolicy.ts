import { MAX_SOUNDBOARD_FETCH_HASHES } from '@chickadee/shared';

/**
 * Pure decisions for the soundboard clip-fetch orchestration (useSoundboardSync
 * owns the links/refs and calls into these). Distinct from fileTransferPolicy.ts
 * — a different domain — though its chunk/flow-control constants and helpers
 * (CHUNK_BYTES, shouldPauseSend, nextFlowControl, makeBatchFileId, ...) are
 * reused directly, unchanged, by useSoundboardSync.
 */

/** Max simultaneous per-hash send links a possessor keeps open for one fetch-request at a time. */
export const SOUNDBOARD_FETCH_CONCURRENCY = 3;

export interface MissingClipPeer {
  id: string;
  soundboardClips: { hash: string; sizeBytes: number }[];
}

export interface PlannedFetch {
  toPeerId: string;
  clips: { hash: string; sizeBytes: number }[];
}

/**
 * For each hash advertised by any room peer but not in `excludeHashes`, pick
 * exactly one possessor — the first peer (in `peers` order) advertising it —
 * so a hash is never requested from more than one peer at once in an 8-peer
 * mesh. Returns one batched request per possessor, chunked at
 * `maxHashesPerRequest` (mirrors the MAX_BATCH_FILES-style cap).
 */
export function planMissingClipFetches(
  peers: MissingClipPeer[],
  excludeHashes: ReadonlySet<string>,
  maxHashesPerRequest: number = MAX_SOUNDBOARD_FETCH_HASHES,
): PlannedFetch[] {
  const claimedBy = new Map<string, { toPeerId: string; sizeBytes: number }>();
  for (const peer of peers) {
    for (const clip of peer.soundboardClips) {
      if (excludeHashes.has(clip.hash) || claimedBy.has(clip.hash)) continue;
      claimedBy.set(clip.hash, { toPeerId: peer.id, sizeBytes: clip.sizeBytes });
    }
  }

  const byPeer = new Map<string, { hash: string; sizeBytes: number }[]>();
  for (const [hash, { toPeerId, sizeBytes }] of claimedBy) {
    const list = byPeer.get(toPeerId);
    if (list) list.push({ hash, sizeBytes });
    else byPeer.set(toPeerId, [{ hash, sizeBytes }]);
  }

  const requests: PlannedFetch[] = [];
  for (const [toPeerId, clips] of byPeer) {
    for (let i = 0; i < clips.length; i += maxHashesPerRequest) {
      requests.push({ toPeerId, clips: clips.slice(i, i + maxHashesPerRequest) });
    }
  }
  return requests;
}

/** Concurrency gate for starting the next send link to a possessor's requester. */
export function canStartFetch(activeCount: number, max: number = SOUNDBOARD_FETCH_CONCURRENCY): boolean {
  return activeCount < max;
}

/**
 * Max DIFFERENT possessors the requester pulls from at once — distinct from
 * SOUNDBOARD_FETCH_CONCURRENCY, which gates one possessor's own concurrent
 * sends. Without this gate, a join where N peers each have missing clips
 * fires N simultaneous soundboard-fetch-requests in the same tick, each
 * opening up to SOUNDBOARD_FETCH_CONCURRENCY fresh RTCPeerConnections — e.g.
 * 6 peers x 3 = 18 concurrent connection negotiations from one join event,
 * right as the voice/video mesh is also trying to stabilize. This caps the
 * worst case at SOUNDBOARD_REQUEST_CONCURRENCY x SOUNDBOARD_FETCH_CONCURRENCY
 * regardless of room size.
 */
export const SOUNDBOARD_REQUEST_CONCURRENCY = 2;

/** Concurrency gate for starting the next possessor's fetch-request. */
export function canStartRequest(activeCount: number, max: number = SOUNDBOARD_REQUEST_CONCURRENCY): boolean {
  return activeCount < max;
}

/**
 * From a queue of planned per-possessor fetch-requests, pick the next ones
 * to actually send — skipping possessors already active — up to `max` total
 * concurrently-active possessors. Pure planning only: the caller is
 * responsible for tracking which peers are "active" and removing queued
 * entries once started.
 */
export function nextRequestsToStart(
  queued: readonly PlannedFetch[],
  activePeerIds: ReadonlySet<string>,
  max: number = SOUNDBOARD_REQUEST_CONCURRENCY,
): PlannedFetch[] {
  const toStart: PlannedFetch[] = [];
  let activeCount = activePeerIds.size;
  for (const request of queued) {
    if (!canStartRequest(activeCount, max)) break;
    if (activePeerIds.has(request.toPeerId) || toStart.some((r) => r.toPeerId === request.toPeerId)) continue;
    toStart.push(request);
    activeCount += 1;
  }
  return toStart;
}

/** Delay before the requester-side effect starts planning/sending fetch-requests after a peers[] change, to let the media mesh's own PCs get past initial signaling first. */
export const SOUNDBOARD_SYNC_STARTUP_DELAY_MS = 1500;
