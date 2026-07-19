/**
 * Split text into user-perceived characters (grapheme clusters). `Array.from`
 * / spread split by Unicode code point, which shreds compound emoji — ZWJ
 * sequences (👨‍👩‍👧), flags (🇳🇱 = two regional indicators), skin-tone and
 * variation-selector modifiers — into broken pieces. `Intl.Segmenter`'s
 * default granularity is 'grapheme', which keeps them whole.
 */
export function graphemes(text: string): string[] {
  return [...new Intl.Segmenter().segment(text)].map((s) => s.segment);
}
