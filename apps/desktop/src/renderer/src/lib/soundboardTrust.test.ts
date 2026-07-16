import { describe, expect, it } from 'vitest';
import { shouldAutoSyncFrom } from './soundboardTrust';

describe('shouldAutoSyncFrom', () => {
  it('follows the master auto-sync toggle', () => {
    expect(shouldAutoSyncFrom('uid-a', { soundboardAutoSyncEnabled: true })).toBe(true);
    expect(shouldAutoSyncFrom('uid-a', { soundboardAutoSyncEnabled: false })).toBe(false);
  });

  it('is currently independent of which peer is asked (the seam, not per-sender trust yet)', () => {
    const opts = { soundboardAutoSyncEnabled: true };
    expect(shouldAutoSyncFrom('uid-a', opts)).toBe(shouldAutoSyncFrom('uid-b', opts));
  });
});
