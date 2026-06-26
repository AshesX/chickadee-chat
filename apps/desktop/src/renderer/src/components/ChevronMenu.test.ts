import { describe, it, expect } from 'vitest';
import { computeChevronPosition } from './ChevronMenu';

// Minimal DOMRect stub — computeChevronPosition only reads top/left/width.
const rect = (top: number, left: number, width: number): DOMRect =>
  ({ top, left, width } as DOMRect);

describe('computeChevronPosition', () => {
  it('centers the menu over the anchor and sits above it', () => {
    // anchor centered at x=500 (left 460, width 80 → center 500), width 280 → left 360
    const { left, bottom } = computeChevronPosition(rect(900, 460, 80), 280, 1000, 1000);
    expect(left).toBe(360);
    expect(bottom).toBe(1000 - 900 + 8); // 108
  });

  it('clamps to the left edge (min 8)', () => {
    // anchor near the left; centered would be negative → clamp to 8
    const { left } = computeChevronPosition(rect(900, 0, 40), 280, 1000, 1000);
    expect(left).toBe(8);
  });

  it('clamps to the right edge (max viewport - width - 8)', () => {
    // anchor near the right edge; centered would overflow → clamp
    const { left } = computeChevronPosition(rect(900, 980, 40), 280, 1000, 1000);
    expect(left).toBe(1000 - 280 - 8); // 712
  });

  it('derives bottom from the viewport height and anchor top', () => {
    const { bottom } = computeChevronPosition(rect(720, 100, 80), 240, 1280, 800);
    expect(bottom).toBe(800 - 720 + 8); // 88
  });
});
