// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSignaling } from './useSignaling';
import { COOLDOWN_RECONNECT_MS, MAX_RECONNECT_MS } from '../lib/reconnectPolicy';

/** Minimal controllable WebSocket stand-in — enough for connect()'s handler wiring. */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = 0;

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
  }

  send(_data: string): void {}

  close(): void {
    this.readyState = 3;
    const cb = this.onclose;
    this.onclose = null;
    cb?.();
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Drive a joined session through 11 failed connects — the point at which
 * MAX_RECONNECT_ATTEMPTS (10) is exhausted and the cooldown branch takes over. */
function driveToExhaustion(): void {
  for (let i = 0; i < 10; i++) {
    const current = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => current.close());
    act(() => {
      vi.advanceTimersByTime(MAX_RECONNECT_MS);
    });
  }
  const last = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  act(() => last.close());
}

describe('useSignaling reconnect-exhaustion recovery', () => {
  it('never gives up permanently — retries at COOLDOWN_RECONNECT_MS after the fast burst is exhausted', () => {
    const { result } = renderHook(() => useSignaling());
    act(() => result.current.join('space1', null, 'Name', 'user1', [], 'online'));
    expect(MockWebSocket.instances.length).toBe(1);

    driveToExhaustion();

    expect(result.current.status).toBe('error');
    const countAtExhaustion = MockWebSocket.instances.length;

    // No new attempt until the cooldown elapses.
    act(() => {
      vi.advanceTimersByTime(COOLDOWN_RECONNECT_MS - 1);
    });
    expect(MockWebSocket.instances.length).toBe(countAtExhaustion);

    // Cooldown elapses — the client retries on its own, indefinitely.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(MockWebSocket.instances.length).toBe(countAtExhaustion + 1);

    // And it keeps looping: exhaust again, cooldown again.
    driveToExhaustion();
    expect(result.current.status).toBe('error');
    const countAtSecondExhaustion = MockWebSocket.instances.length;
    act(() => {
      vi.advanceTimersByTime(COOLDOWN_RECONNECT_MS);
    });
    expect(MockWebSocket.instances.length).toBe(countAtSecondExhaustion + 1);
  });

  it('reconnect() no-ops with no should-be-connected session', () => {
    const { result } = renderHook(() => useSignaling());
    act(() => result.current.reconnect());
    expect(MockWebSocket.instances.length).toBe(0);
  });

  it('reconnect() no-ops after leave()', () => {
    const { result } = renderHook(() => useSignaling());
    act(() => result.current.join('space1', null, 'Name', 'user1', [], 'online'));
    act(() => result.current.leave());
    const countAfterLeave = MockWebSocket.instances.length;
    act(() => result.current.reconnect());
    expect(MockWebSocket.instances.length).toBe(countAfterLeave);
  });

  it('reconnect() skips the cooldown wait and retries immediately', () => {
    const { result } = renderHook(() => useSignaling());
    act(() => result.current.join('space1', null, 'Name', 'user1', [], 'online'));
    driveToExhaustion();
    expect(result.current.status).toBe('error');
    const countAtExhaustion = MockWebSocket.instances.length;

    act(() => result.current.reconnect());

    expect(MockWebSocket.instances.length).toBe(countAtExhaustion + 1);
    expect(result.current.status).toBe('reconnecting');

    // The pending cooldown timer was cancelled, not left to double-fire.
    act(() => {
      vi.advanceTimersByTime(COOLDOWN_RECONNECT_MS);
    });
    expect(MockWebSocket.instances.length).toBe(countAtExhaustion + 1);
  });
});
