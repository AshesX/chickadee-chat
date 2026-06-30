import { describe, it, expect } from 'vitest';
import { withAlpha } from './userColors';

describe('withAlpha', () => {
  it('wraps a hex color in a color-mix with the given opacity percent', () => {
    expect(withAlpha('#f59e0b', 44)).toBe('color-mix(in srgb, #f59e0b 44%, transparent)');
  });

  it('works with CSS variable colors', () => {
    expect(withAlpha('var(--accent)', 5)).toBe('color-mix(in srgb, var(--accent) 5%, transparent)');
  });
});
