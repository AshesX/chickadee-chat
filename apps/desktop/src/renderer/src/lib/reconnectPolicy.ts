// Reconnect + heartbeat policy for the signaling connection. Pure math/predicates
// so the backoff curve and dead-socket detection are unit-testable; useSignaling
// owns the timers and sockets.

/** How often the client pings the server. */
export const PING_INTERVAL_MS = 15_000;
/** No pong for this long = dead/half-open socket → force-close and reconnect. */
export const PONG_TIMEOUT_MS = 35_000;
export const BASE_RECONNECT_MS = 1_000;
export const MAX_RECONNECT_MS = 10_000;
export const MAX_RECONNECT_ATTEMPTS = 10;

/** Exponential-backoff delay for reconnect attempt `attempt` (1-based), capped. */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(BASE_RECONNECT_MS * 2 ** (attempt - 1), MAX_RECONNECT_MS);
}

/** True once the attempt counter has exhausted the reconnect budget. */
export function reconnectExhausted(attempt: number): boolean {
  return attempt > MAX_RECONNECT_ATTEMPTS;
}

/** True when the heartbeat shows a dead socket (no pong within the timeout). */
export function heartbeatExpired(lastPongAt: number, now: number): boolean {
  return now - lastPongAt > PONG_TIMEOUT_MS;
}
