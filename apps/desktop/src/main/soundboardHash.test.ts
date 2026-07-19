import { describe, expect, it } from 'vitest';
import { sha256Hex } from './soundboardHash';

describe('sha256Hex', () => {
  it('matches the known SHA-256 digest of the empty input', async () => {
    expect(await sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('matches the known SHA-256 digest of a fixed string', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is deterministic and lowercase hex, 64 chars', async () => {
    const bytes = new TextEncoder().encode('chickadee soundboard');
    const a = await sha256Hex(bytes);
    const b = await sha256Hex(bytes);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different input', async () => {
    const a = await sha256Hex(new TextEncoder().encode('clip-a'));
    const b = await sha256Hex(new TextEncoder().encode('clip-b'));
    expect(a).not.toBe(b);
  });
});
