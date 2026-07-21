import { describe, expect, it } from 'vitest';
import {
  COOLDOWN_RECONNECT_MS,
  MAX_RECONNECT_ATTEMPTS,
  MAX_RECONNECT_MS,
  ONLINE_PROBE_TIMEOUT_MS,
  PONG_TIMEOUT_MS,
  heartbeatExpired,
  reconnectDelayMs,
  reconnectExhausted,
} from './reconnectPolicy';

describe('reconnectDelayMs', () => {
  it('doubles from 1s and caps at 10s (random=1 gives the full step)', () => {
    expect(reconnectDelayMs(1, 1)).toBe(1_000);
    expect(reconnectDelayMs(2, 1)).toBe(2_000);
    expect(reconnectDelayMs(3, 1)).toBe(4_000);
    expect(reconnectDelayMs(4, 1)).toBe(8_000);
    expect(reconnectDelayMs(5, 1)).toBe(MAX_RECONNECT_MS);
    expect(reconnectDelayMs(10, 1)).toBe(MAX_RECONNECT_MS);
  });

  it('equal-jitter keeps every delay within [base/2, base]', () => {
    expect(reconnectDelayMs(1, 0)).toBe(500);
    expect(reconnectDelayMs(4, 0)).toBe(4_000);
    expect(reconnectDelayMs(10, 0)).toBe(MAX_RECONNECT_MS / 2);
    expect(reconnectDelayMs(3, 0.5)).toBe(3_000);
    const sampled = reconnectDelayMs(6);
    expect(sampled).toBeGreaterThanOrEqual(MAX_RECONNECT_MS / 2);
    expect(sampled).toBeLessThanOrEqual(MAX_RECONNECT_MS);
  });
});

describe('reconnectExhausted', () => {
  it('allows exactly MAX_RECONNECT_ATTEMPTS tries', () => {
    expect(reconnectExhausted(MAX_RECONNECT_ATTEMPTS)).toBe(false);
    expect(reconnectExhausted(MAX_RECONNECT_ATTEMPTS + 1)).toBe(true);
  });
});

describe('heartbeatExpired', () => {
  it('flips only after the pong timeout elapses', () => {
    const t0 = 100_000;
    expect(heartbeatExpired(t0, t0 + PONG_TIMEOUT_MS)).toBe(false);
    expect(heartbeatExpired(t0, t0 + PONG_TIMEOUT_MS + 1)).toBe(true);
  });
});

describe('cooldown + online-probe constants', () => {
  it('the post-exhaustion cooldown is well beyond the fast-burst cap', () => {
    expect(COOLDOWN_RECONNECT_MS).toBeGreaterThan(MAX_RECONNECT_MS);
  });

  it('the online-event probe is meaningfully faster than the passive heartbeat wait', () => {
    expect(ONLINE_PROBE_TIMEOUT_MS).toBeLessThan(PONG_TIMEOUT_MS);
  });
});
