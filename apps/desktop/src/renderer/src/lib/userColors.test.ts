import { describe, it, expect } from 'vitest';
import { contrastInk, hslToHex, randomAccentColor, resolveAccentColor, userColor, withAlpha } from './userColors';

describe('withAlpha', () => {
  it('wraps a hex color in a color-mix with the given opacity percent', () => {
    expect(withAlpha('#f59e0b', 44)).toBe('color-mix(in srgb, #f59e0b 44%, transparent)');
  });

  it('works with CSS variable colors', () => {
    expect(withAlpha('var(--accent)', 5)).toBe('color-mix(in srgb, var(--accent) 5%, transparent)');
  });
});

describe('hslToHex', () => {
  it('converts known primary hues at full saturation', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
  });

  it('converts achromatic lightness extremes regardless of hue/saturation', () => {
    expect(hslToHex(0, 0, 0)).toBe('#000000');
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
  });

  it('wraps out-of-range hues the same as their in-range equivalent', () => {
    expect(hslToHex(360, 100, 50)).toBe(hslToHex(0, 100, 50));
    expect(hslToHex(-10, 100, 50)).toBe(hslToHex(350, 100, 50));
  });
});

describe('userColor', () => {
  it('is deterministic for a given seed', () => {
    expect(userColor('user-abc')).toBe(userColor('user-abc'));
  });

  it('returns a valid hex color', () => {
    expect(userColor('user-abc')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('differs for different seeds (not a constant)', () => {
    expect(userColor('user-abc')).not.toBe(userColor('user-xyz'));
  });
});

describe('resolveAccentColor', () => {
  it('prefers an explicit accent color over the auto color', () => {
    expect(resolveAccentColor('#123456', 'user-abc')).toBe('#123456');
  });

  it('falls back to the deterministic auto color when unset', () => {
    expect(resolveAccentColor('', 'user-abc')).toBe(userColor('user-abc'));
    expect(resolveAccentColor(null, 'user-abc')).toBe(userColor('user-abc'));
    expect(resolveAccentColor(undefined, 'user-abc')).toBe(userColor('user-abc'));
  });

  it('agrees with itself regardless of who is asking — same userId, same color', () => {
    // This is the property that keeps "what color is user X" in sync across every
    // client without any network round-trip: it's a pure function of their userId.
    const seenBySelf = resolveAccentColor('', 'user-abc');
    const seenByAPeer = resolveAccentColor('', 'user-abc');
    expect(seenBySelf).toBe(seenByAPeer);
  });
});

describe('randomAccentColor', () => {
  it('returns a valid hex color', () => {
    expect(randomAccentColor()).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('contrastInk', () => {
  it('picks near-black ink for a light fill', () => {
    expect(contrastInk('#ffffff')).toBe('var(--on-accent)');
  });

  it('picks near-white ink for a dark fill', () => {
    expect(contrastInk('#000000')).toBe('var(--on-media)');
  });

  it('picks near-black ink for blaze orange (the documented 2.9:1-vs-6.7:1 case)', () => {
    // Matches the ratios already called out in CLAUDE.md: white-on-#FF6700 is 2.9:1
    // (too low), near-black wins by a wide margin.
    expect(contrastInk('#ff6700')).toBe('var(--on-accent)');
  });
});
