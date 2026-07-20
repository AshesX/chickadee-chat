/**
 * Input bounds + sanitizers (enforced server-side; reused client-side for
 * defense in depth). Everything here is pure and side-effect free.
 */
import { CUSTOM_SFX_SLOTS, type CustomSfxSlot } from './sfxSlots';

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

/** Max files in one multi-file transfer batch. */
export const MAX_BATCH_FILES = 32;

/**
 * Validate a batch offer's untrusted `files` list. Returns the sanitized
 * entries, or null to reject the whole offer: a batch must be 2..MAX_BATCH_FILES
 * entries (a single file uses the plain offer shape) and every entry must pass
 * `sanitizeFileOfferMeta` — one bad entry rejects the batch rather than
 * silently shrinking it.
 */
export function sanitizeFileOfferFiles(value: unknown): { name: string; size: number }[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_BATCH_FILES) return null;
  const out: { name: string; size: number }[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const meta = sanitizeFileOfferMeta(
      (entry as { name?: unknown }).name,
      (entry as { size?: unknown }).size,
    );
    if (!meta) return null;
    out.push(meta);
  }
  return out;
}

/**
 * Windows-Explorer-style collision suffix: "clip.mp4" + 2 → "clip (2).mp4".
 * Splits at the LAST dot; extension-less names and leading-dot names append
 * instead. Callers loop n = 2, 3, … until the name is free.
 */
export function suffixedFileName(name: string, n: number): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name} (${n})`;
  return `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
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

const SOUNDBOARD_HASH_RE = /^[0-9a-f]{64}$/;

/**
 * Validate an untrusted soundboard clip hash: must be a lowercase 64-char hex
 * SHA-256 digest. Used wherever a hash is turned into a cache filename (main
 * process IPC) or a signaling field, so a malformed value can never reach a
 * filesystem path (path-traversal defense) or a wire message.
 */
export function sanitizeSoundboardHash(value: unknown): string | null {
  return typeof value === 'string' && SOUNDBOARD_HASH_RE.test(value) ? value : null;
}

/** Max length of a soundboard clip's display name (relayed space-wide). */
export const MAX_SOUNDBOARD_CLIP_NAME_LEN = 80;
/** Cap on one peer's advertised custom-clip library — an anti-nonsense bound. */
export const MAX_SOUNDBOARD_CLIPS = 200;
/** Ceiling on a clip's declared duration — the 5s ingest trim plus generous slack. */
export const MAX_SOUNDBOARD_DURATION_MS = 5_500;
/** Ceiling on a clip's declared byte size — 128kbps*5.5s is ~88KB; generous slack for container overhead. */
export const MAX_SOUNDBOARD_CLIP_SIZE_BYTES = 256 * 1024;

/**
 * Validate one untrusted soundboard clip manifest entry. Returns the
 * sanitized `{hash, name, durationMs, sizeBytes}`, or null to drop just this
 * entry (unlike a file-offer batch, a manifest is an additive/resilient list,
 * not a one-shot transactional offer, so one bad entry doesn't reject the rest).
 */
export function sanitizeSoundboardClipMeta(
  value: unknown,
): { hash: string; name: string; durationMs: number; sizeBytes: number } | null {
  if (!value || typeof value !== 'object') return null;
  const hash = sanitizeSoundboardHash((value as { hash?: unknown }).hash);
  if (!hash) return null;
  const name = clampString((value as { name?: unknown }).name, MAX_SOUNDBOARD_CLIP_NAME_LEN);
  if (!name) return null;
  const durationMs = (value as { durationMs?: unknown }).durationMs;
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0 || durationMs > MAX_SOUNDBOARD_DURATION_MS) {
    return null;
  }
  const sizeBytes = (value as { sizeBytes?: unknown }).sizeBytes;
  if (
    typeof sizeBytes !== 'number' ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 0 ||
    sizeBytes > MAX_SOUNDBOARD_CLIP_SIZE_BYTES
  ) {
    return null;
  }
  return { hash, name, durationMs, sizeBytes };
}

/**
 * Validate an untrusted soundboard manifest (`soundboard-manifest-state`):
 * drops malformed entries, de-duplicates by hash (first wins), and caps the
 * list — styled after `sanitizeBannedUsers`, not `sanitizeFileOfferFiles`.
 */
export function sanitizeSoundboardClips(
  value: unknown,
): { hash: string; name: string; durationMs: number; sizeBytes: number }[] {
  if (!Array.isArray(value)) return [];
  const out: { hash: string; name: string; durationMs: number; sizeBytes: number }[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (out.length >= MAX_SOUNDBOARD_CLIPS) break;
    const meta = sanitizeSoundboardClipMeta(entry);
    if (!meta || seen.has(meta.hash)) continue;
    seen.add(meta.hash);
    out.push(meta);
  }
  return out;
}

/** Max hashes in one soundboard-fetch-request — mirrors MAX_BATCH_FILES. */
export const MAX_SOUNDBOARD_FETCH_HASHES = 32;

/**
 * Validate an untrusted soundboard-fetch-request hash list: drops malformed
 * entries, de-duplicates, and caps the list. Reject-only beyond that — never
 * throws, and (like the manifest) never rejects the whole request over one bad hash.
 */
export function sanitizeSoundboardFetchHashes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (out.length >= MAX_SOUNDBOARD_FETCH_HASHES) break;
    const hash = sanitizeSoundboardHash(entry);
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);
    out.push(hash);
  }
  return out;
}

/** The valid soundboard clip sources. */
export const SOUNDBOARD_TRIGGER_SOURCES = ['preset', 'custom'] as const;
export type SoundboardTriggerSource = (typeof SOUNDBOARD_TRIGGER_SOURCES)[number];

/** Narrow an untrusted value to a SoundboardTriggerSource, or null if invalid. */
export function sanitizeSoundboardTriggerSource(value: unknown): SoundboardTriggerSource | null {
  return SOUNDBOARD_TRIGGER_SOURCES.includes(value as SoundboardTriggerSource)
    ? (value as SoundboardTriggerSource)
    : null;
}

/**
 * Narrow an untrusted value to a CustomSfxSlot, or null if invalid. Used by
 * main's custom-SFX IPC handlers before the value ever touches a filesystem
 * path (path-traversal defense, same role as sanitizeSoundboardHash).
 */
export function sanitizeCustomSfxSlot(value: unknown): CustomSfxSlot | null {
  return CUSTOM_SFX_SLOTS.includes(value as CustomSfxSlot) ? (value as CustomSfxSlot) : null;
}

/** The valid presence statuses. */
export const PRESENCE_STATUSES = ['online', 'idle', 'dnd'] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

/** Narrow an untrusted value to a PresenceStatus, defaulting to 'online'. */
export function sanitizeStatus(value: unknown): PresenceStatus {
  return PRESENCE_STATUSES.includes(value as PresenceStatus) ? (value as PresenceStatus) : 'online';
}
