import { describe, it, expect } from 'vitest';
import { compressToBudget } from './compressToBudget';

describe('compressToBudget', () => {
  it('returns the first quality step that fits the budget', () => {
    const sizesByQuality: Record<number, number> = { 0.85: 500, 0.7: 200, 0.55: 100, 0.4: 50 };
    const encode = (q: number) => 'x'.repeat(sizesByQuality[q]);
    const result = compressToBudget(encode, 300);
    expect(result.length).toBe(200); // 0.85 (500) is over budget, 0.7 (200) fits
  });

  it('returns the highest-quality encode when it already fits', () => {
    const encode = () => 'x'.repeat(10);
    const result = compressToBudget(encode, 300);
    expect(result.length).toBe(10);
  });

  it('falls back to downscale when every quality step is still over budget', () => {
    const encode = () => 'x'.repeat(1000);
    const downscale = () => 'x'.repeat(150);
    const result = compressToBudget(encode, 300, [0.85, 0.7], downscale);
    expect(result.length).toBe(150);
  });

  it('returns the downscaled result even if it is still over budget (best-effort)', () => {
    const encode = () => 'x'.repeat(1000);
    const downscale = () => 'x'.repeat(900);
    const result = compressToBudget(encode, 300, [0.85], downscale);
    expect(result.length).toBe(900);
  });

  it('returns the last quality-step result when no downscale is provided and all are over budget', () => {
    const sizesByQuality: Record<number, number> = { 0.85: 500, 0.4: 400 };
    const encode = (q: number) => 'x'.repeat(sizesByQuality[q]);
    const result = compressToBudget(encode, 300, [0.85, 0.4]);
    expect(result.length).toBe(400);
  });
});
