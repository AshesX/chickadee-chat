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
