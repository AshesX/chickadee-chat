import { describe, expect, it } from 'vitest';
import { shouldAutoSyncFrom } from './soundboardTrust';

describe('shouldAutoSyncFrom', () => {
  it('follows whether custom sounds are enabled', () => {
    expect(shouldAutoSyncFrom('uid-a', { soundboardCustomEnabled: true })).toBe(true);
    expect(shouldAutoSyncFrom('uid-a', { soundboardCustomEnabled: false })).toBe(false);
  });

  it('is currently independent of which peer is asked (the seam, not per-sender trust yet)', () => {
    const opts = { soundboardCustomEnabled: true };
    expect(shouldAutoSyncFrom('uid-a', opts)).toBe(shouldAutoSyncFrom('uid-b', opts));
  });
});
