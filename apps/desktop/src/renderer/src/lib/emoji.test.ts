import { describe, expect, it } from 'vitest';
import { graphemes } from './emoji';

// Compound emoji built from code points so file encoding can't skew the test.
const ZWJ = 0x200d;
const FAMILY = String.fromCodePoint(0x1f468, ZWJ, 0x1f469, ZWJ, 0x1f467); // man+ZWJ+woman+ZWJ+girl
const FLAG_NL = String.fromCodePoint(0x1f1f3, 0x1f1f1); // two regional indicators
const THUMBS_TONED = String.fromCodePoint(0x1f44d, 0x1f3fb); // thumbs up + skin tone

describe('graphemes', () => {
  it('keeps ZWJ sequences, flags, and skin-tone emoji whole (Array.from splits them)', () => {
    expect(graphemes(FAMILY)).toEqual([FAMILY]);
    expect(graphemes(FLAG_NL)).toEqual([FLAG_NL]);
    expect(graphemes(THUMBS_TONED)).toEqual([THUMBS_TONED]);
    // Sanity: the naive split really does shred these (guards against a
    // regression back to Array.from being invisible).
    expect(Array.from(FAMILY).length).toBeGreaterThan(1);
  });

  it('splits adjacent emoji and plain text per perceived character', () => {
    expect(graphemes(`${FAMILY}${FLAG_NL}`)).toEqual([FAMILY, FLAG_NL]);
    expect(graphemes('ab')).toEqual(['a', 'b']);
    expect(graphemes('')).toEqual([]);
  });
});
