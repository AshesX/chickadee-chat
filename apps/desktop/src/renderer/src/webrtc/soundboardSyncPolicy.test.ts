import { describe, expect, it } from 'vitest';
import { SOUNDBOARD_FETCH_CONCURRENCY, canStartFetch, planMissingClipFetches } from './soundboardSyncPolicy';

const hash1 = '1'.repeat(64);
const hash2 = '2'.repeat(64);
const hash3 = '3'.repeat(64);

describe('planMissingClipFetches', () => {
  it('returns nothing when there is nothing missing', () => {
    const peers = [{ id: 'p1', soundboardClips: [{ hash: hash1, sizeBytes: 100 }] }];
    expect(planMissingClipFetches(peers, new Set([hash1]))).toEqual([]);
  });

  it('requests a missing hash from the peer advertising it', () => {
    const peers = [{ id: 'p1', soundboardClips: [{ hash: hash1, sizeBytes: 100 }] }];
    expect(planMissingClipFetches(peers, new Set())).toEqual([{ toPeerId: 'p1', clips: [{ hash: hash1, sizeBytes: 100 }] }]);
  });

  it('claims a hash from only the FIRST peer advertising it, never two', () => {
    const peers = [
      { id: 'p1', soundboardClips: [{ hash: hash1, sizeBytes: 100 }] },
      { id: 'p2', soundboardClips: [{ hash: hash1, sizeBytes: 100 }] },
    ];
    const plan = planMissingClipFetches(peers, new Set());
    expect(plan).toHaveLength(1);
    expect(plan[0].toPeerId).toBe('p1');
  });

  it('groups multiple missing hashes from the same peer into one request', () => {
    const peers = [{ id: 'p1', soundboardClips: [{ hash: hash1, sizeBytes: 100 }, { hash: hash2, sizeBytes: 200 }] }];
    const plan = planMissingClipFetches(peers, new Set());
    expect(plan).toHaveLength(1);
    expect(plan[0].clips.map((c) => c.hash).sort()).toEqual([hash1, hash2].sort());
  });

  it('produces separate requests per distinct possessor', () => {
    const peers = [
      { id: 'p1', soundboardClips: [{ hash: hash1, sizeBytes: 100 }] },
      { id: 'p2', soundboardClips: [{ hash: hash2, sizeBytes: 200 }] },
    ];
    const plan = planMissingClipFetches(peers, new Set());
    expect(plan.map((r) => r.toPeerId).sort()).toEqual(['p1', 'p2']);
  });

  it('excludes already-cached or already-requested hashes', () => {
    const peers = [{ id: 'p1', soundboardClips: [{ hash: hash1, sizeBytes: 100 }, { hash: hash2, sizeBytes: 200 }] }];
    const plan = planMissingClipFetches(peers, new Set([hash1]));
    expect(plan).toEqual([{ toPeerId: 'p1', clips: [{ hash: hash2, sizeBytes: 200 }] }]);
  });

  it('chunks one possessor across multiple requests once over maxHashesPerRequest', () => {
    const peers = [
      {
        id: 'p1',
        soundboardClips: [
          { hash: hash1, sizeBytes: 100 },
          { hash: hash2, sizeBytes: 200 },
          { hash: hash3, sizeBytes: 300 },
        ],
      },
    ];
    const plan = planMissingClipFetches(peers, new Set(), 2);
    expect(plan).toHaveLength(2);
    expect(plan[0].clips).toHaveLength(2);
    expect(plan[1].clips).toHaveLength(1);
    expect(plan.every((r) => r.toPeerId === 'p1')).toBe(true);
  });
});

describe('canStartFetch', () => {
  it('allows starting under the default concurrency cap', () => {
    expect(canStartFetch(0)).toBe(true);
    expect(canStartFetch(SOUNDBOARD_FETCH_CONCURRENCY - 1)).toBe(true);
  });

  it('blocks at and above the default cap', () => {
    expect(canStartFetch(SOUNDBOARD_FETCH_CONCURRENCY)).toBe(false);
    expect(canStartFetch(SOUNDBOARD_FETCH_CONCURRENCY + 1)).toBe(false);
  });

  it('honors a custom cap', () => {
    expect(canStartFetch(1, 2)).toBe(true);
    expect(canStartFetch(2, 2)).toBe(false);
  });
});
