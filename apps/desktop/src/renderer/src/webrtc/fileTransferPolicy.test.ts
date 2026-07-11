import { describe, expect, it } from 'vitest';
import {
  RECV_QUEUE_HIGH,
  RECV_QUEUE_LOW,
  SEND_HIGH_WATER,
  dismissDelayMs,
  formatBytes,
  formatRate,
  isTerminalStatus,
  nextFlowControl,
  parseControlMessage,
  shouldEmitProgress,
  shouldPauseSend,
  updateRate,
} from './fileTransferPolicy';

describe('shouldPauseSend', () => {
  it('pauses exactly at the high-water mark', () => {
    expect(shouldPauseSend(SEND_HIGH_WATER - 1)).toBe(false);
    expect(shouldPauseSend(SEND_HIGH_WATER)).toBe(true);
    expect(shouldPauseSend(SEND_HIGH_WATER + 1)).toBe(true);
    expect(shouldPauseSend(0)).toBe(false);
  });
});

describe('nextFlowControl', () => {
  it('emits pause once when crossing high water', () => {
    expect(nextFlowControl(RECV_QUEUE_HIGH - 1, false)).toBeNull();
    expect(nextFlowControl(RECV_QUEUE_HIGH, false)).toBe('pause');
    // Already paused: crossing high again must not re-emit.
    expect(nextFlowControl(RECV_QUEUE_HIGH + 1, true)).toBeNull();
  });

  it('emits resume only after draining to low water while paused', () => {
    expect(nextFlowControl(RECV_QUEUE_LOW + 1, true)).toBeNull();
    expect(nextFlowControl(RECV_QUEUE_LOW, true)).toBe('resume');
    expect(nextFlowControl(0, true)).toBe('resume');
    // Not paused: draining low is a no-op.
    expect(nextFlowControl(0, false)).toBeNull();
  });

  it('stays quiet in the hysteresis dead zone', () => {
    const mid = (RECV_QUEUE_LOW + RECV_QUEUE_HIGH) / 2;
    expect(nextFlowControl(mid, false)).toBeNull();
    expect(nextFlowControl(mid, true)).toBeNull();
  });
});

describe('shouldEmitProgress', () => {
  it('always emits at completion', () => {
    expect(shouldEmitProgress(0, 1, 999, 1000, 1000)).toBe(true);
  });

  it('emits after the time threshold', () => {
    expect(shouldEmitProgress(1000, 1250, 0, 1, 1000000)).toBe(true);
    expect(shouldEmitProgress(1000, 1249, 0, 1, 1000000)).toBe(false);
  });

  it('emits after a large byte delta even inside the time window', () => {
    expect(shouldEmitProgress(1000, 1001, 0, 8 * 1024 * 1024, 1024 ** 3)).toBe(true);
    expect(shouldEmitProgress(1000, 1001, 0, 8 * 1024 * 1024 - 1, 1024 ** 3)).toBe(false);
  });
});

describe('updateRate', () => {
  it('starts at rate 0 on the first sample', () => {
    expect(updateRate(null, 1000, 5000)).toEqual({ bytes: 1000, ts: 5000, rateBps: 0 });
  });

  it('uses the instant rate for the first real interval', () => {
    const first = updateRate(null, 0, 0);
    const second = updateRate(first, 1000, 1000); // 1000 bytes in 1s
    expect(second.rateBps).toBe(1000);
  });

  it('smooths subsequent samples with an EMA', () => {
    const first = updateRate(null, 0, 0);
    const second = updateRate(first, 1000, 1000); // 1000 B/s
    const third = updateRate(second, 4000, 2000); // instant 3000 B/s
    expect(third.rateBps).toBeGreaterThan(1000);
    expect(third.rateBps).toBeLessThan(3000);
    expect(third.rateBps).toBeCloseTo(1000 * 0.7 + 3000 * 0.3);
  });

  it('ignores zero/negative time steps', () => {
    const first = updateRate(null, 0, 1000);
    expect(updateRate(first, 500, 1000)).toBe(first);
    expect(updateRate(first, 500, 999)).toBe(first);
  });
});

describe('formatBytes / formatRate', () => {
  it('formats across units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(150 * 1024)).toBe('150 KB');
    expect(formatBytes(Math.round(12.4 * 1024 ** 2))).toBe('12.4 MB');
    expect(formatBytes(Math.round(2.1 * 1024 ** 3))).toBe('2.1 GB');
  });

  it('handles junk defensively', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
  });

  it('formats rates as bytes per second', () => {
    expect(formatRate(1536)).toBe('1.5 KB/s');
  });
});

describe('dismissDelayMs', () => {
  it('matches the card-lifecycle matrix', () => {
    expect(dismissDelayMs('done', 'send')).toBe(6_000);
    expect(dismissDelayMs('done', 'receive')).toBe(30_000);
    expect(dismissDelayMs('declined', 'send')).toBe(8_000);
    expect(dismissDelayMs('cancelled', 'receive')).toBe(8_000);
    expect(dismissDelayMs('error', 'send')).toBe(10_000);
    expect(dismissDelayMs('transferring', 'send')).toBe(0);
    expect(dismissDelayMs('awaiting-accept', 'send')).toBe(0);
  });
});

describe('isTerminalStatus', () => {
  it('flags settled statuses only', () => {
    expect(isTerminalStatus('done')).toBe(true);
    expect(isTerminalStatus('declined')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('error')).toBe(true);
    expect(isTerminalStatus('transferring')).toBe(false);
    expect(isTerminalStatus('connecting')).toBe(false);
  });
});

describe('parseControlMessage', () => {
  it('parses every valid control type', () => {
    expect(parseControlMessage(JSON.stringify({ t: 'pause' }))).toEqual({ t: 'pause' });
    expect(parseControlMessage(JSON.stringify({ t: 'resume' }))).toEqual({ t: 'resume' });
    expect(parseControlMessage(JSON.stringify({ t: 'done' }))).toEqual({ t: 'done' });
    expect(parseControlMessage(JSON.stringify({ t: 'ack-done' }))).toEqual({ t: 'ack-done' });
    expect(parseControlMessage(JSON.stringify({ t: 'cancel' }))).toEqual({ t: 'cancel' });
  });

  it('carries a clamped reason on error frames', () => {
    expect(parseControlMessage(JSON.stringify({ t: 'error', reason: 'disk full' }))).toEqual({
      t: 'error',
      reason: 'disk full',
    });
    const long = parseControlMessage(JSON.stringify({ t: 'error', reason: 'x'.repeat(500) }));
    expect(long?.t).toBe('error');
    expect((long as { reason: string }).reason).toHaveLength(120);
    expect(parseControlMessage(JSON.stringify({ t: 'error' }))).toEqual({ t: 'error', reason: 'Peer error' });
  });

  it('ignores unknown types and malformed frames', () => {
    expect(parseControlMessage(JSON.stringify({ t: 'future-thing' }))).toBeNull();
    expect(parseControlMessage(JSON.stringify({ nope: 1 }))).toBeNull();
    expect(parseControlMessage('not json')).toBeNull();
    expect(parseControlMessage(JSON.stringify('done'))).toBeNull();
    expect(parseControlMessage(JSON.stringify(null))).toBeNull();
    expect(parseControlMessage(new ArrayBuffer(4))).toBeNull();
    expect(parseControlMessage(undefined)).toBeNull();
  });
});
