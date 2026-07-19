import { MAX_AVATAR_DATA_URL_LEN, MAX_BANNER_DATA_URL_LEN } from '@chickadee/shared';

export const PORT = Number(process.env.PORT ?? 8080);

/** Cap on a single inbound WS frame. The largest legitimate message is a Space
 *  banner or avatar data URL; everything else is tiny. Keeps a small headroom
 *  over the larger of the two caps. */
export const MAX_WS_PAYLOAD = Math.max(MAX_AVATAR_DATA_URL_LEN, MAX_BANNER_DATA_URL_LEN) + 8 * 1024;

/** Per-connection message rate limit (generous — well above WebRTC ICE trickle bursts). */
export const MSG_RATE_LIMIT = 200;
export const MSG_RATE_WINDOW_MS = 1000;

/**
 * Optional Origin allowlist (comma-separated env). The Electron client sends no
 * Origin, so an empty allowlist permits all (current behaviour); set it to lock
 * the hosted server to known origins. CSWSH risk is low here (no cookies/auth),
 * but this plus the rate limit + payload cap blunt browser-based resource abuse.
 */
export const ALLOWED_ORIGINS = (process.env.CHICKADEE_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Optional shared join secret. Rooms are otherwise reachable by anyone who knows
 * the (locally-generated, non-secret) spaceId, so set CHICKADEE_JOIN_SECRET on a
 * private deployment to require a matching `secret` in every `join`. Empty =
 * open server (default; the public client sends no secret).
 */
export const JOIN_SECRET = process.env.CHICKADEE_JOIN_SECRET ?? '';
