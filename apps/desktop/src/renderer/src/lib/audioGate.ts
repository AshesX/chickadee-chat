/** Min/max RMS (0..1) for the voice-activation & noise-gate threshold sliders. */
export const GATE_THRESHOLD_MIN = 0.01;
export const GATE_THRESHOLD_MAX = 0.3;
/** Mic meter is full-scale at the max threshold so the gate marker spans the whole meter. */
export const METER_FULL_SCALE = GATE_THRESHOLD_MAX;
/** Slider readout %: position of a threshold within [min, max]. */
export const thresholdToPct = (t: number): number =>
  Math.round(((t - GATE_THRESHOLD_MIN) / (GATE_THRESHOLD_MAX - GATE_THRESHOLD_MIN)) * 100);
