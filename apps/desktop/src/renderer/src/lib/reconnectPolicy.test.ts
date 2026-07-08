import { describe, expect, it } from 'vitest';
import {
  MAX_RECONNECT_ATTEMPTS,
  MAX_RECONNECT_MS,
  PONG_TIMEOUT_MS,
  heartbeatExpired,
  reconnectDelayMs,
  reconnectExhausted,
} from './reconnectPolicy';

describe('reconnectDelayMs', () => {
  it('doubles from 1s and caps at 10s', () => {
    expect(reconnectDelayMs(1)).toBe(1_000);
    expect(reconnectDelayMs(2)).toBe(2_000);
    expect(reconnectDelayMs(3)).toBe(4_000);
    expect(reconnectDelayMs(4)).toBe(8_000);
    expect(reconnectDelayMs(5)).toBe(MAX_RECONNECT_MS);
    expect(reconnectDelayMs(10)).toBe(MAX_RECONNECT_MS);
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
