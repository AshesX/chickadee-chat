import { describe, expect, it } from 'vitest';
import { evictOldest } from './soundboardPlayer';

// AudioBuffer isn't constructible in jsdom (no Web Audio API), so these tests
// exercise only the pure eviction logic — `as unknown as AudioBuffer` stands
// in for opaque cache values the function never actually reads.
function fakeBuffer(): AudioBuffer {
  return {} as unknown as AudioBuffer;
}

describe('evictOldest', () => {
  it('does nothing while at or under the cap', () => {
    const cache = new Map([
      ['a', fakeBuffer()],
      ['b', fakeBuffer()],
    ]);
    evictOldest(cache, 2);
    expect([...cache.keys()]).toEqual(['a', 'b']);
  });

  it('drops the oldest (first-inserted) entries once over the cap', () => {
    const cache = new Map([
      ['a', fakeBuffer()],
      ['b', fakeBuffer()],
      ['c', fakeBuffer()],
    ]);
    evictOldest(cache, 2);
    expect([...cache.keys()]).toEqual(['b', 'c']);
  });

  it('respects re-insertion order (a caller "touching" a key protects it)', () => {
    const cache = new Map([
      ['a', fakeBuffer()],
      ['b', fakeBuffer()],
    ]);
    // Simulate a touch: re-insert 'a' so it reads as most-recently-used.
    const touched = cache.get('a')!;
    cache.delete('a');
    cache.set('a', touched);
    cache.set('c', fakeBuffer());
    evictOldest(cache, 2);
    expect([...cache.keys()]).toEqual(['a', 'c']);
  });

  it('is a no-op on an empty cache', () => {
    const cache = new Map<string, AudioBuffer>();
    evictOldest(cache, 5);
    expect(cache.size).toBe(0);
  });
});
