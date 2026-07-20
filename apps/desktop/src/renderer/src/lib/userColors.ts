/**
 * Eight per-user accent colors — one per seat of an 8-cap room, so every peer
 * gets a unique color. The local user is always index 0 (blaze). Every fill
 * carries near-black ink (>=4.6:1) and reads as a bold name on both themes'
 * chat cards. This is THE canonical identity palette — kept as curated quick
 * picks in the accent-color swatch grid; the *default* (unset) accent below
 * is no longer drawn from this list — see `userColor`.
 */
export const USER_COLORS = [
  '#ff6700', // Blaze (self)
  '#14a38f', // Teal
  '#1f9ec9', // Cyan
  '#3e76e8', // Blue
  '#8a63e8', // Violet
  '#c44bc0', // Magenta
  '#d9488c', // Pink
  '#3fa65c', // Green
] as const;
export const SELF_COLOR = USER_COLORS[0];

/**
 * A translucent variant of a solid color, for accent glows / ambient washes.
 * `percent` is the opacity (0–100). Uses `color-mix` so it reads clearly and works
 * with any CSS color, replacing cryptic hex-alpha suffixes like `${color}70`.
 */
export function withAlpha(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

/** Curated saturation/lightness band for auto-generated colors — vivid and
 *  on-brand next to the hand-picked USER_COLORS, whatever the hue. */
const AUTO_SATURATION = 65;
const AUTO_LIGHTNESS = 55;

/** HSL (0-360, 0-100, 0-100) to a `#rrggbb` hex string. */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number): string => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Stable char-code hash of a seed string into a hue (0-359). */
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

/**
 * Deterministic identity color for a user with no custom accent pick: a hash
 * of their stable `userId` into the curated hue band. Pure function of the
 * seed, so every client (including the user's own) computes the identical
 * color with zero network traffic — this is what keeps "auto" colors synced.
 */
export function userColor(seed: string): string {
  return hslToHex(hashHue(seed), AUTO_SATURATION, AUTO_LIGHTNESS);
}

/** A user's effective display color: their explicit pick, else the deterministic auto color. */
export function resolveAccentColor(accentColor: string | null | undefined, userId: string): string {
  return accentColor || userColor(userId);
}

/** A freshly rolled random color in the same curated band, for the profile "Random" button. */
export function randomAccentColor(): string {
  return hslToHex(Math.random() * 360, AUTO_SATURATION, AUTO_LIGHTNESS);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

/** WCAG relative luminance of an sRGB color. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const ON_ACCENT_LUMINANCE = relativeLuminance(hexToRgb('#070d0d'));
const ON_MEDIA_LUMINANCE = relativeLuminance(hexToRgb('#ffffff'));

/**
 * Which ink reads best on a given fill: the near-black `--on-accent` token or
 * the near-white `--on-media` token (both theme-invariant already), chosen by
 * actual contrast ratio against the fill rather than assuming dark ink always
 * wins — true once every fill was a hand-picked vivid `USER_COLORS` entry, no
 * longer true once fills can be any hue/lightness (auto-generated or a raw
 * custom pick from the `<input type="color">` picker).
 */
export function contrastInk(hex: string): string {
  const luminance = relativeLuminance(hexToRgb(hex));
  const darkInkContrast = contrastRatio(luminance, ON_ACCENT_LUMINANCE);
  const lightInkContrast = contrastRatio(luminance, ON_MEDIA_LUMINANCE);
  return lightInkContrast > darkInkContrast ? 'var(--on-media)' : 'var(--on-accent)';
}
