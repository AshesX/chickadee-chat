// Generic, cross-platform TTS voice categories. Web Speech voice *names* are
// platform-specific (Windows "Microsoft David/Zira…", macOS "Alex/Samantha…") and the API
// exposes no gender field, so peers sync a generic category *id* and each receiver maps it
// to the closest locally-installed voice (by lang + a name heuristic) plus a pitch hint.

export interface VoiceCategory {
  /** Stable id synced between peers and persisted in settings. */
  id: string;
  /** Human label shown in the picker. */
  label: string;
  /** BCP-47 language prefix matched against `SpeechSynthesisVoice.lang`. */
  lang: string;
  /** Drives the name heuristic and the pitch fallback. */
  gender: 'male' | 'female';
}

/** '' (empty id) = "System Default": no preference, use the engine's default voice. */
export const VOICE_CATEGORIES: VoiceCategory[] = [
  { id: 'us-female', label: 'US English — Female', lang: 'en-US', gender: 'female' },
  { id: 'us-male', label: 'US English — Male', lang: 'en-US', gender: 'male' },
  { id: 'uk-female', label: 'UK English — Female', lang: 'en-GB', gender: 'female' },
  { id: 'uk-male', label: 'UK English — Male', lang: 'en-GB', gender: 'male' },
  { id: 'au-female', label: 'Australian English — Female', lang: 'en-AU', gender: 'female' },
  { id: 'au-male', label: 'Australian English — Male', lang: 'en-AU', gender: 'male' },
  { id: 'in-female', label: 'Indian English — Female', lang: 'en-IN', gender: 'female' },
  { id: 'in-male', label: 'Indian English — Male', lang: 'en-IN', gender: 'male' },
];

// The API gives us only `name`/`lang`, so infer gender from known voice names across
// Windows (Microsoft …), macOS, and Chrome/Google voices. Extend freely.
const FEMALE_HINTS = [
  'female', 'zira', 'hazel', 'susan', 'linda', 'heera', 'catherine', 'samantha', 'victoria',
  'karen', 'serena', 'kate', 'moira', 'tessa', 'fiona', 'veena', 'aria', 'jenny', 'michelle',
  'sonia', 'eva', 'anna', 'paulina', 'amelie', 'hortense', 'nora',
];
const MALE_HINTS = [
  'male', 'david', 'mark', 'george', 'james', 'richard', 'ravi', 'alex', 'daniel', 'fred',
  'tom', 'lee', 'oliver', 'guy', 'william', 'arthur', 'gordon', 'aaron', 'rishi', 'thomas',
];

function inferGender(name: string): 'male' | 'female' | null {
  const n = name.toLowerCase();
  // Check female first: "female" contains the substring "male".
  if (FEMALE_HINTS.some((h) => n.includes(h))) return 'female';
  if (MALE_HINTS.some((h) => n.includes(h))) return 'male';
  return null;
}

function normalizeLang(lang: string): string {
  return lang.toLowerCase().replace(/_/g, '-');
}

let voicesCache: SpeechSynthesisVoice[] = [];
let listenerAttached = false;

function refreshVoices(): void {
  const list = window.speechSynthesis?.getVoices() ?? [];
  if (list.length) voicesCache = list; // keep the last non-empty list
}

/**
 * Cached voice list. Voices load asynchronously in Chromium (empty on first call), so we
 * attach a `voiceschanged` listener exactly once (it can fire repeatedly; `refreshVoices`
 * is idempotent — it just overwrites the cache) and warm the cache on demand.
 */
function getVoices(): SpeechSynthesisVoice[] {
  const synth = window.speechSynthesis;
  if (!synth) return [];
  if (!listenerAttached) {
    listenerAttached = true;
    synth.addEventListener('voiceschanged', refreshVoices);
  }
  if (!voicesCache.length) refreshVoices();
  return voicesCache;
}

/** Eagerly warm the voice cache + attach the listener (call once at app startup). */
export function initVoices(): void {
  getVoices();
}

/**
 * Map a synced category id to the closest installed voice:
 * exact-lang match → any English voice → any voice; within that pool prefer a gender-name match.
 * Returns `undefined` for '' / unknown id (caller falls back to the engine default).
 */
export function resolveVoice(id: string): SpeechSynthesisVoice | undefined {
  if (!id) return undefined;
  const cat = VOICE_CATEGORIES.find((c) => c.id === id);
  if (!cat) return undefined;

  const voices = getVoices();
  if (!voices.length) return undefined;

  const want = normalizeLang(cat.lang);
  let pool = voices.filter((v) => normalizeLang(v.lang).startsWith(want));
  if (!pool.length) pool = voices.filter((v) => normalizeLang(v.lang).startsWith('en'));
  if (!pool.length) pool = voices;

  return pool.find((v) => inferGender(v.name) === cat.gender) ?? pool[0];
}

/** Pitch hint so categories stay distinct even when they resolve to the same underlying voice. */
export function pitchForCategory(id: string): number {
  const cat = VOICE_CATEGORIES.find((c) => c.id === id);
  if (!cat) return 1;
  return cat.gender === 'male' ? 0.85 : 1.15;
}
