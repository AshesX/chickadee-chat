import { describe, expect, it } from 'vitest';
import { COMPACT_MAX_WIDTH, COMPACT_MIN_WIDTH, clampCompactWidth } from './windowSize';

describe('clampCompactWidth', () => {
  it('passes widths inside the dock range through (rounded)', () => {
    expect(clampCompactWidth(300)).toBe(300);
    expect(clampCompactWidth(300.6)).toBe(301);
  });

  it('clamps below the minimum dock width', () => {
    expect(clampCompactWidth(0)).toBe(COMPACT_MIN_WIDTH);
    expect(clampCompactWidth(-50)).toBe(COMPACT_MIN_WIDTH);
  });

  it('clamps above the 200% dock cap (the setResizable-less width guard)', () => {
    expect(clampCompactWidth(10_000)).toBe(COMPACT_MAX_WIDTH);
    expect(COMPACT_MAX_WIDTH).toBe(COMPACT_MIN_WIDTH * 2);
  });
});
