// Reconnect + heartbeat policy for the signaling connection. Pure math/predicates
// so the backoff curve and dead-socket detection are unit-testable; useSignaling
// owns the timers and sockets.

/** How often the client pings the server. */
export const PING_INTERVAL_MS = 8_000;
/**
 * No pong for this long = dead/half-open socket → force-close and reconnect.
 * WS rides TCP, so a live connection never loses frames — this only guards
 * half-open sockets. 2× the ping interval still tolerates suspend blips
 * without a spurious close (which would cost a full mesh rebuild). Kept
 * tighter than the old 2.5x/25s pairing now that the `online`-event handler
 * covers the fast path for OS-visible network transitions — this timeout's
 * remaining job is the long tail neither a clean close nor an `online` event
 * ever fires for (an ISP-side blackhole, a NAT silently dropping the mapping).
 */
export const PONG_TIMEOUT_MS = 16_000;
export const BASE_RECONNECT_MS = 1_000;
export const MAX_RECONNECT_MS = 10_000;
export const MAX_RECONNECT_ATTEMPTS = 10;
/**
 * Once the fast exponential burst above is exhausted, keep retrying forever at
 * this slow, indefinite cadence rather than giving up permanently — an outage
 * longer than the ~85s burst (router reboot, ISP blip, long suspend) is common
 * and shouldn't strand the user with no automatic recovery path.
 */
export const COOLDOWN_RECONNECT_MS = 60_000;
/**
 * How long an `online` event gets to prove a seemingly-open socket is actually
 * live (via a ping/pong round trip) before we force-close it and let the
 * normal reconnect path take over. Deliberately far below PONG_TIMEOUT_MS —
 * the whole point is short-circuiting that longer passive wait.
 */
export const ONLINE_PROBE_TIMEOUT_MS = 4_000;

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
