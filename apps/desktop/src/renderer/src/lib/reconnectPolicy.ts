// Reconnect + heartbeat policy for the signaling connection. Pure math/predicates
// so the backoff curve and dead-socket detection are unit-testable; useSignaling
// owns the timers and sockets.

/** How often the client pings the server. */
export const PING_INTERVAL_MS = 10_000;
/**
 * No pong for this long = dead/half-open socket → force-close and reconnect.
 * WS rides TCP, so a live connection never loses frames — this only guards
 * half-open sockets. 2.5× the ping interval still tolerates suspend blips
 * without a spurious close (which would cost a full mesh rebuild).
 */
export const PONG_TIMEOUT_MS = 25_000;
export const BASE_RECONNECT_MS = 1_000;
export const MAX_RECONNECT_MS = 10_000;
export const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Equal-jitter exponential backoff for reconnect attempt `attempt` (1-based):
 * half the capped exponential step is fixed, half randomized, so clients
 * dropped by the same server blip don't all retry in lockstep (thundering
 * herd). `random` is injectable for deterministic tests.
 */
export function reconnectDelayMs(attempt: number, random: number = Math.random()): number {
  const base = Math.min(BASE_RECONNECT_MS * 2 ** (attempt - 1), MAX_RECONNECT_MS);
  return base / 2 + random * (base / 2);
}

/** True once the attempt counter has exhausted the reconnect budget. */
export function reconnectExhausted(attempt: number): boolean {
  return attempt > MAX_RECONNECT_ATTEMPTS;
}

/** True when the heartbeat shows a dead socket (no pong within the timeout). */
export function heartbeatExpired(lastPongAt: number, now: number): boolean {
  return now - lastPongAt > PONG_TIMEOUT_MS;
}
