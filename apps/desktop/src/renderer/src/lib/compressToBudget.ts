/**
 * Step `encode(quality)` down through `qualitySteps` until the result fits
 * `maxLen` chars, then fall back to `downscale()` once if still over. Pure with
 * respect to its callbacks — callers pass real canvas-encoding functions;
 * tests inject fakes that return strings of a controlled length.
 */
export function compressToBudget(
  encode: (quality: number) => string,
  maxLen: number,
  qualitySteps: number[] = [0.85, 0.7, 0.55, 0.4],
  downscale?: () => string,
): string {
  let last = '';
  for (const quality of qualitySteps) {
    last = encode(quality);
    if (last.length <= maxLen) return last;
  }
  if (downscale) {
    const scaled = downscale();
    if (scaled.length <= maxLen) return scaled;
    last = scaled;
  }
  return last; // best-effort; caller's sanitizer still rejects if still over cap
}
