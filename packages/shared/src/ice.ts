/** ICE server defaults shared by main (buildConfig) and the renderer fallback. */

/**
 * STUN lets peers discover their public address; free and always included.
 * Two independent anycast providers so one provider's outage or rate-limit
 * can't sink candidate gathering for a pair that would connect fine directly.
 * Candidates trickle, so extra servers never delay the first offer — but each
 * one adds parallel binding chatter per negotiation, so keep the list short.
 */
export const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/**
 * Renderer fallback when the main process didn't supply a configured set.
 * STUN-only by design: the app is pure P2P, and the old free public TURN
 * default (OpenRelay) is defunct — every connection paid for 3 doomed relay
 * allocations per negotiation. Self-hosted TURN remains configurable via the
 * CHICKADEE_TURN_URL / CHICKADEE_TURN_USERNAME / CHICKADEE_TURN_CREDENTIAL
 * env vars (see README "Play over the internet").
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [...STUN_SERVERS];
