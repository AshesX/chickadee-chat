import { describe, expect, it } from 'vitest';
import {
  DEGRADED_RELINK_MS,
  ICE_RESTART_VERIFY_MS,
  MAX_RELINK_ATTEMPTS,
  MESH_CONNECT_TIMEOUT_MS,
  PRESENCE_GRACE_MS,
  RELINK_VERIFY_MS,
  STALL_AFTER_MS,
  deriveHealthUi,
  evaluateHealth,
  initialHealth,
  reconcileMesh,
  sumInboundAudioPackets,
  type LinkHealth,
} from './connectionHealthPolicy';

const T0 = 1_000_000;

/** A healthy, receiving link at T0: packets seen, phase ok. */
function liveHealth(): LinkHealth {
  return { ...initialHealth(T0), packets: 500, lastAdvanceAt: T0, hasReceived: true };
}

describe('sumInboundAudioPackets', () => {
  it('sums only inbound-rtp audio entries', () => {
    expect(
      sumInboundAudioPackets([
        { type: 'inbound-rtp', kind: 'audio', packetsReceived: 100 },
        { type: 'inbound-rtp', kind: 'audio', packetsReceived: 40 }, // screen audio
        { type: 'inbound-rtp', kind: 'video', packetsReceived: 9000 },
        { type: 'outbound-rtp', kind: 'audio', packetsReceived: 7 },
        { type: 'candidate-pair' },
      ]),
    ).toBe(140);
  });

  it('returns 0 for an empty or irrelevant report', () => {
    expect(sumInboundAudioPackets([])).toBe(0);
    expect(sumInboundAudioPackets([{ type: 'transport' }])).toBe(0);
  });
});

describe('evaluateHealth — packet tracking & recovery', () => {
  it('advancing packets while connected stays ok and refreshes lastAdvanceAt', () => {
    const t = T0 + 2000;
    const { next, action } = evaluateHealth(liveHealth(), 'connected', 600, t);
    expect(action).toBe('none');
    expect(next.phase).toBe('ok');
    expect(next.packets).toBe(600);
    expect(next.lastAdvanceAt).toBe(t);
  });

  it('first packets flip hasReceived', () => {
    const { next } = evaluateHealth(initialHealth(T0), 'connected', 3, T0 + 2000);
    expect(next.hasReceived).toBe(true);
  });

  it('a never-received link that is connected is healthy (listen-only peer)', () => {
    const old = { ...initialHealth(T0) };
    const { next, action } = evaluateHealth(old, 'connected', 0, T0 + 60_000);
    expect(action).toBe('none');
    expect(next.phase).toBe('ok');
  });

  it('packet advance alone recovers any phase, even mid-restart with a stale state label', () => {
    const h: LinkHealth = {
      ...liveHealth(),
      phase: 'restarting',
      deadline: T0 + 1000, // already past
      relinkAttempts: 2,
    };
    const { next, action } = evaluateHealth(h, 'connecting', 700, T0 + 2000);
    expect(action).toBe('none');
    expect(next.phase).toBe('ok');
    expect(next.relinkAttempts).toBe(0);
  });

  it('recovery exits failed (spontaneous recovery)', () => {
    const h: LinkHealth = { ...liveHealth(), phase: 'failed', relinkAttempts: 3 };
    const { next } = evaluateHealth(h, 'connected', 501, T0 + 2000);
    expect(next.phase).toBe('ok');
    expect(next.relinkAttempts).toBe(0);
  });
});

describe('evaluateHealth — connect timeout (lost offer/answer)', () => {
  it('relinks a link stuck in connecting past the timeout', () => {
    const t = T0 + MESH_CONNECT_TIMEOUT_MS;
    const { next, action } = evaluateHealth(initialHealth(T0), 'connecting', 0, t);
    expect(action).toBe('relink');
    expect(next.phase).toBe('relinking');
    expect(next.relinkAttempts).toBe(1);
    expect(next.deadline).toBe(t + RELINK_VERIFY_MS);
  });

  it('waits below the timeout', () => {
    const { action } = evaluateHealth(
      initialHealth(T0),
      'new',
      0,
      T0 + MESH_CONNECT_TIMEOUT_MS - 1,
    );
    expect(action).toBe('none');
  });

  it('never fires for a link that has received (mid-call state regressions)', () => {
    const h = { ...liveHealth(), createdAt: T0 - 60_000 };
    const { action } = evaluateHealth(h, 'connecting', 500, T0 + STALL_AFTER_MS - 1);
    expect(action).toBe('none');
  });
});

describe('evaluateHealth — silent stall escalation', () => {
  it('frozen packets while connected trigger restart-ice after the stall window', () => {
    const t = T0 + STALL_AFTER_MS;
    const { next, action } = evaluateHealth(liveHealth(), 'connected', 500, t);
    expect(action).toBe('restart-ice');
    expect(next.phase).toBe('restarting');
    expect(next.deadline).toBe(t + ICE_RESTART_VERIFY_MS);
  });

  it('does not fire below the stall window', () => {
    const { action } = evaluateHealth(liveHealth(), 'connected', 500, T0 + STALL_AFTER_MS - 1);
    expect(action).toBe('none');
  });

  it('never fires for a link that has never received', () => {
    const { action } = evaluateHealth(initialHealth(T0), 'connected', 0, T0 + STALL_AFTER_MS * 5);
    expect(action).toBe('none');
  });

  it('an unverified restart escalates to relink at its deadline', () => {
    const stalled = evaluateHealth(liveHealth(), 'connected', 500, T0 + STALL_AFTER_MS).next;
    const { next, action } = evaluateHealth(stalled, 'connected', 500, stalled.deadline);
    expect(action).toBe('relink');
    expect(next.phase).toBe('relinking');
    expect(next.packets).toBe(0); // fresh pc counters restart at zero
  });

  it('a relink recovers when packets resume on the fresh pc (counter reset handled)', () => {
    const relinking: LinkHealth = {
      ...liveHealth(),
      phase: 'relinking',
      deadline: T0 + RELINK_VERIFY_MS,
      relinkAttempts: 1,
      packets: 0,
      lastAdvanceAt: T0,
    };
    const { next, action } = evaluateHealth(relinking, 'connected', 42, T0 + 4000);
    expect(action).toBe('none');
    expect(next.phase).toBe('ok');
    expect(next.relinkAttempts).toBe(0);
  });

  it('gives up after MAX_RELINK_ATTEMPTS', () => {
    let h: LinkHealth = {
      ...liveHealth(),
      phase: 'relinking',
      deadline: T0,
      relinkAttempts: 1,
      packets: 0,
    };
    let t = T0;
    let lastAction = '';
    for (let i = 0; i < MAX_RELINK_ATTEMPTS; i++) {
      t = h.deadline;
      const r = evaluateHealth(h, 'connecting', 0, t);
      h = r.next;
      lastAction = r.action;
    }
    expect(lastAction).toBe('give-up');
    expect(h.phase).toBe('failed');
    // Failed is quiescent — no further actions.
    expect(evaluateHealth(h, 'failed', 0, t + 60_000).action).toBe('none');
  });
});

describe('evaluateHealth — degraded states', () => {
  it('relinks after the grace once the pc reports disconnected', () => {
    const h = liveHealth();
    const first = evaluateHealth(h, 'disconnected', 500, T0 + 1000).next;
    expect(first.degradedAt).toBe(T0 + 1000);
    const { action } = evaluateHealth(first, 'disconnected', 500, T0 + 1000 + DEGRADED_RELINK_MS);
    expect(action).toBe('relink');
  });

  it('does not instantly relink an old never-received link on its first blip', () => {
    const h = { ...initialHealth(T0), createdAt: T0 - 120_000, lastAdvanceAt: T0 - 120_000 };
    const { action } = evaluateHealth(h, 'disconnected', 0, T0);
    expect(action).toBe('none');
  });

  it('clears degradedAt when the pc heals before the grace', () => {
    const first = evaluateHealth(liveHealth(), 'disconnected', 500, T0 + 1000).next;
    const healed = evaluateHealth(first, 'connected', 510, T0 + 3000).next;
    expect(healed.degradedAt).toBeNull();
  });
});

describe('reconcileMesh', () => {
  it('holds mismatches during the grace, then acts', () => {
    const first = reconcileMesh(['a', 'b'], ['a'], {}, T0);
    expect(first.close).toEqual([]);
    expect(first.nextPending['close:b']).toBe(T0);
    const later = reconcileMesh(['a', 'b'], ['a'], first.nextPending, T0 + PRESENCE_GRACE_MS);
    expect(later.close).toEqual(['b']);
    expect(later.nextPending['close:b']).toBeUndefined();
  });

  it('creates links for peers that stayed linkless past the grace', () => {
    const first = reconcileMesh(['a'], ['a', 'c'], {}, T0);
    expect(first.create).toEqual([]);
    const later = reconcileMesh(['a'], ['a', 'c'], first.nextPending, T0 + PRESENCE_GRACE_MS);
    expect(later.create).toEqual(['c']);
  });

  it('drops a pending entry once the mismatch resolves itself', () => {
    const first = reconcileMesh(['a', 'b'], ['a'], {}, T0);
    const resolved = reconcileMesh(['a', 'b'], ['a', 'b'], first.nextPending, T0 + 1000);
    expect(resolved.close).toEqual([]);
    expect(resolved.nextPending).toEqual({});
  });

  it('a matched mesh yields no work', () => {
    const r = reconcileMesh(['a', 'b'], ['b', 'a'], {}, T0);
    expect(r).toEqual({ close: [], create: [], nextPending: {} });
  });
});

describe('deriveHealthUi', () => {
  it('maps phases to the tile pill signal', () => {
    expect(deriveHealthUi('ok')).toBe('ok');
    expect(deriveHealthUi('restarting')).toBe('recovering');
    expect(deriveHealthUi('relinking')).toBe('recovering');
    expect(deriveHealthUi('failed')).toBe('failed');
  });
});
