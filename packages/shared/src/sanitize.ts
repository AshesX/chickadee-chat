/**
 * Input bounds + sanitizers (enforced server-side; reused client-side for
 * defense in depth). Everything here is pure and side-effect free.
 */

/** Max length of a chat message / reaction. */
export const CHAT_MAX_LEN = 500;
/** Max length of a display name. */
export const MAX_DISPLAY_NAME_LEN = 32;
/** Max length of a TTS voice-category id. */
export const MAX_VOICE_PREF_LEN = 32;
/** Max length of an id-like field (userId / spaceId / roomId). */
export const MAX_ID_LEN = 128;
/**
 * Max length of an avatar data URL. A 128×128 WebP/JPEG is typically 10–30 KB
 * of base64; 256 KB is a generous ceiling that still stops amplification abuse.
 */
export const MAX_AVATAR_DATA_URL_LEN = 256 * 1024;

/**
 * Max length of a Space banner data URL. A ~960×320 hero banner covers far more
 * visible pixels than a 128×128 avatar, so it gets a larger ceiling — still a
 * bounded, generous cap that stops amplification abuse.
 */
export const MAX_BANNER_DATA_URL_LEN = 400 * 1024;

const IMAGE_DATA_URL_RE = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Validate an untrusted avatar value: must be a base64 PNG/JPEG/WebP data URL
 * within the size cap. Returns the value if valid, else null. Used by the
 * signaling server on intake and by the renderer before binding to an <img>.
 */
export function sanitizeAvatarDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length > MAX_AVATAR_DATA_URL_LEN) return null;
  return IMAGE_DATA_URL_RE.test(value) ? value : null;
}

/**
 * Validate an untrusted Space banner value the same way `sanitizeAvatarDataUrl`
 * does (reject-only, no truncation/resize). Used by the signaling server on
 * intake and by the renderer before binding to an <img>.
 */
export function sanitizeBannerDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length > MAX_BANNER_DATA_URL_LEN) return null;
  return IMAGE_DATA_URL_RE.test(value) ? value : null;
}

/** Coerce an untrusted value to a trimmed string capped at `max` chars (default '' on non-strings). */
export function clampString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

const ACCENT_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate an untrusted accent color: must be '' (unset → auto-assigned color) or
 * a `#rrggbb` hex string, else ''. Used by the signaling server on intake and by
 * the renderer before binding it into a CSS custom property.
 */
export function sanitizeAccentColor(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';
  return ACCENT_COLOR_RE.test(value) ? value.toLowerCase() : '';
}

/** Max length of a transferred file's display name (relayed space-wide). */
export const MAX_FILE_NAME_LEN = 160;
/** Ceiling on a declared file-transfer size — an anti-nonsense bound far above real use (64 GiB). */
export const MAX_FILE_SIZE_BYTES = 64 * 1024 ** 3;
/** Max length of a file-cancel reason string. */
export const MAX_FILE_REASON_LEN = 120;

/**
 * Validate a file-offer's untrusted name + size. Returns clamped values, or
 * null to reject the whole message (empty name, or a size that isn't a safe
 * non-negative integer within the cap). Used by the signaling server on intake
 * and by the receiving client for defense in depth.
 */
export function sanitizeFileOfferMeta(name: unknown, size: unknown): { name: string; size: number } | null {
  const safeName = clampString(name, MAX_FILE_NAME_LEN);
  if (!safeName) return null;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_SIZE_BYTES) {
    return null;
  }
  return { name: safeName, size };
}

// Reserved punctuation + control chars Windows filenames can't contain.
// eslint-disable-next-line no-control-regex -- stripping control chars is the point
const UNSAFE_FILENAME_CHARS_RE = /[\\/:*?"<>|\u0000-\u001f]/g;
const WINDOWS_RESERVED_BASENAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Make an untrusted filename safe to use as a Save-dialog defaultPath basename
 * on Windows: strip path separators, reserved punctuation, and control chars;
 * trim leading/trailing dots and spaces; prefix reserved device names
 * (CON, PRN, AUX, NUL, COM1-9, LPT1-9). '' collapses to 'download'. The native
 * Save dialog remains the final guard — this only shapes the suggestion.
 */
export function sanitizeSaveFileName(value: unknown): string {
  let name = clampString(value, MAX_FILE_NAME_LEN).replace(UNSAFE_FILENAME_CHARS_RE, '_');
  name = name.replace(/^[. ]+/, '').replace(/[. ]+$/, '');
  if (!name) return 'download';
  const base = name.split('.')[0] ?? '';
  return WINDOWS_RESERVED_BASENAME_RE.test(base) ? `_${name}` : name;
}

/** Cap on a Space's ban list — an anti-nonsense bound for an 8-person hangout app. */
export const MAX_BANNED_USERS = 200;

/**
 * Validate an untrusted ban-list seed (`seed-moderation`): must be an array of
 * `{userId, displayName}`-shaped entries. Clamps both fields, drops entries with
 * an empty userId, de-duplicates by userId (first wins), and caps the list.
 * Reject-only beyond that — never throws.
 */
export function sanitizeBannedUsers(value: unknown): { userId: string; displayName: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { userId: string; displayName: string }[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (out.length >= MAX_BANNED_USERS) break;
    if (!entry || typeof entry !== 'object') continue;
    const userId = clampString((entry as { userId?: unknown }).userId, MAX_ID_LEN);
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    out.push({
      userId,
      displayName: clampString((entry as { displayName?: unknown }).displayName, MAX_DISPLAY_NAME_LEN),
    });
  }
  return out;
}

/** The valid presence statuses. */
export const PRESENCE_STATUSES = ['online', 'idle', 'dnd'] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

/** Narrow an untrusted value to a PresenceStatus, defaulting to 'online'. */
export function sanitizeStatus(value: unknown): PresenceStatus {
  return PRESENCE_STATUSES.includes(value as PresenceStatus) ? (value as PresenceStatus) : 'online';
}
