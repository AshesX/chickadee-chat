/** ICE server defaults shared by main (buildConfig) and the renderer fallback. */

/** STUN lets peers discover their public address; free and always included. */
export const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

/**
 * Free public TURN relay (OpenRelay) used as a best-effort default so cross-NAT
 * play works out of the box. It is rate-limited and may be down — for reliable
 * internet play, override it with your own coturn/hosted TURN via the
 * CHICKADEE_TURN_URL / CHICKADEE_TURN_USERNAME / CHICKADEE_TURN_CREDENTIAL env
 * vars (see README "Play over the internet").
 */
export const PUBLIC_TURN_SERVERS: RTCIceServer[] = [
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

/** Renderer fallback when the main process didn't supply a configured set. */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [...STUN_SERVERS, ...PUBLIC_TURN_SERVERS];
