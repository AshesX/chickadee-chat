import { describe, it, expect } from 'vitest';
import { fnv1aHash } from './hash';

describe('fnv1aHash', () => {
  it('is deterministic for the same input', () => {
    expect(fnv1aHash('hello world')).toBe(fnv1aHash('hello world'));
  });

  it('differs for distinct inputs', () => {
    const hashes = new Set(['a', 'b', 'hello', 'hello ', 'data:image/webp;base64,abc'].map(fnv1aHash));
    expect(hashes.size).toBe(5);
  });

  it('handles the empty string', () => {
    expect(fnv1aHash('')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('always returns fixed-length hex output', () => {
    expect(fnv1aHash('x')).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1aHash('a'.repeat(500_000))).toMatch(/^[0-9a-f]{8}$/);
  });
});
