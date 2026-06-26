import { describe, it, expect } from 'vitest';
import { GATE_THRESHOLD_MIN, GATE_THRESHOLD_MAX, METER_FULL_SCALE, thresholdToPct } from './audioGate';

describe('audioGate', () => {
  it('meter full-scale equals the max threshold', () => {
    expect(METER_FULL_SCALE).toBe(GATE_THRESHOLD_MAX);
  });

  it('maps the range endpoints to 0% and 100%', () => {
    expect(thresholdToPct(GATE_THRESHOLD_MIN)).toBe(0);
    expect(thresholdToPct(GATE_THRESHOLD_MAX)).toBe(100);
  });

  it('maps the midpoint to ~50%', () => {
    const mid = GATE_THRESHOLD_MIN + (GATE_THRESHOLD_MAX - GATE_THRESHOLD_MIN) / 2;
    expect(thresholdToPct(mid)).toBe(50);
  });

  it('maps the default threshold (0.1) consistently', () => {
    // (0.1 - 0.01) / (0.3 - 0.01) * 100 = 31.03 -> 31
    expect(thresholdToPct(0.1)).toBe(31);
  });
});
