import { useEffect, useRef } from 'react';

const ATTACK_MS = 5; // open near-instantly once the level crosses the threshold
const HYSTERESIS = 0.7; // close at threshold * HYSTERESIS
// Run the gate at a steady ~50 Hz via setInterval — NOT requestAnimationFrame.
// rAF is tied to compositor frames, which stop when the window is minimized, so a
// rAF-driven VAD freezes in the background and voice drops out. setInterval keeps
// firing at full rate while minimized (Electron's backgroundThrottling:false), so
// the mic still opens when you talk with the app minimized. ~20 ms also matches the
// Opus 20 ms frame and caps the work below the display refresh rate (144/240 Hz).
const COMPUTE_INTERVAL_MS = 20;

interface UseVoiceActivationOpts {
  /** Run the gate only when in voice mode, in a room, and not paused/muted. */
  active: boolean;
  /** RMS open threshold (0..1); the close threshold is threshold * HYSTERESIS. */
  threshold: number;
  /** Hangover: how long (ms) to hold the gate open after the level drops, so
   *  trailing word-ends and short pauses aren't clipped. */
  releaseMs: number;
  /**
   * The mic analyser node from the processing graph. It sits on the gain node
   * *before* the transmit gate, so it always carries the live mic signal even
   * while the gate (track.enabled) is closed — reading the gated output stream
   * instead would only ever see silence and the gate could never open.
   */
  analyserNode: AnalyserNode | null;
  /** Drives the mic transmit state. */
  setMicEnabled: (on: boolean) => void;
}

/**
 * Voice-activation (open-mic) gate: monitors the local mic's RMS level and
 * opens/closes the transmit gate against a sensitivity threshold.
 *
 * Transitions are smoothed by two timings, both expressed as timestamp deltas
 * inside the single rAF loop (no setTimeout — nothing to leak):
 *   - Attack: open once the level has been above the threshold for ATTACK_MS
 *     (near-instant; the short window rejects single-frame transients like clicks).
 *   - Release/hangover: stay open until the level has been below the close
 *     threshold for `releaseMs` continuously — any speech in that window resets
 *     the timer and keeps the gate open, so brief pauses don't clip speech.
 *
 * Hysteresis (close threshold < open threshold) avoids chattering near the line.
 * setMicEnabled is called only on real open/close edges (and is itself a no-op
 * when unchanged), so there's no React state thrashing. While inactive (PTT/open
 * mode, deafened, or manually paused) the gate does nothing — the caller owns
 * the mic state in those cases.
 */
export function useVoiceActivation({
  active,
  threshold,
  releaseMs,
  analyserNode,
  setMicEnabled,
}: UseVoiceActivationOpts): void {
  // Keep the latest tunables without restarting the analyser loop each change.
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;
  const releaseMsRef = useRef(releaseMs);
  releaseMsRef.current = releaseMs;

  useEffect(() => {
    if (!active || !analyserNode) return;

    const samples = new Uint8Array(analyserNode.fftSize);
    let open = false;
    let aboveSince = 0; // when the level first rose above the open threshold (0 = below)
    let belowSince = 0; // when the level first fell below the close threshold (0 = above)

    // Start closed; the gate opens on the first detected speech.
    setMicEnabled(false);

    const tick = (): void => {
      const now = performance.now(); // setInterval gives no timestamp; the gate math is now-based
      analyserNode.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (let i = 0; i < samples.length; i++) {
        const centered = (samples[i] - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      const onLevel = thresholdRef.current;
      const offLevel = onLevel * HYSTERESIS;

      if (!open) {
        // Attack: open once we've been above threshold for ATTACK_MS.
        if (rms > onLevel) {
          if (aboveSince === 0) aboveSince = now;
          if (now - aboveSince >= ATTACK_MS) {
            open = true;
            belowSince = 0;
            setMicEnabled(true);
          }
        } else {
          aboveSince = 0;
        }
      } else {
        // Release/hangover: hold open until below threshold for releaseMs straight.
        if (rms > offLevel) {
          belowSince = 0; // speech resumes → cancel the pending close
        } else {
          if (belowSince === 0) belowSince = now;
          if (now - belowSince >= releaseMsRef.current) {
            open = false;
            aboveSince = 0;
            setMicEnabled(false);
          }
        }
      }
    };
    const id = setInterval(tick, COMPUTE_INTERVAL_MS);

    return () => {
      clearInterval(id);
    };
  }, [active, analyserNode, setMicEnabled]);
}
