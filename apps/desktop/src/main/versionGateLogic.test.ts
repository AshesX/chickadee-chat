import { describe, expect, it } from 'vitest';
import { shouldWipe } from './versionGateLogic';

describe('shouldWipe', () => {
  it('wipes when no version was ever recorded (first run / pre-gate install)', () => {
    expect(shouldWipe(null, '0.4.0')).toBe(true);
  });

  it('wipes on any version change, up or down', () => {
    expect(shouldWipe('0.3.9', '0.4.0')).toBe(true);
    expect(shouldWipe('0.4.1', '0.4.0')).toBe(true);
  });

  it('skips the wipe when the recorded version matches', () => {
    expect(shouldWipe('0.4.0', '0.4.0')).toBe(false);
  });
});
