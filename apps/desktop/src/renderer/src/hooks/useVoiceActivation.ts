import { useEffect, useRef } from 'react';

const MIN_TOGGLE_MS = 120; // debounce rapid edge flips
const HANG_MS = 250; // keep the gate open briefly after speech drops
const HYSTERESIS = 0.7; // close gate at threshold * HYSTERESIS

interface UseVoiceActivationOpts {
  /** Run the gate only when in voice mode, in a room, not deafened, not paused. */
  active: boolean;
  /** RMS open threshold (0..1); the close threshold is threshold * HYSTERESIS. */
  threshold: number;
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
 * opens/closes the transmit gate against a sensitivity threshold, with
 * hysteresis + a short hangtime so brief pauses don't clip speech. While
 * inactive (PTT/open mode, deafened, or manually paused via the mic button) the
 * gate does nothing — the caller owns the mic state in those cases.
 */
export function useVoiceActivation({
  active,
  threshold,
  analyserNode,
  setMicEnabled,
}: UseVoiceActivationOpts): void {
  // Keep the latest threshold without restarting the analyser loop each change.
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;

  useEffect(() => {
    if (!active || !analyserNode) return;

    const samples = new Uint8Array(analyserNode.fftSize);
    let raf = 0;
    let open = false;
    let lastToggle = 0;
    let belowSince = 0;

    // Start closed; the gate opens on the first detected speech.
    setMicEnabled(false);

    const tick = (now: number): void => {
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
        if (rms > onLevel && now - lastToggle > MIN_TOGGLE_MS) {
          open = true;
          lastToggle = now;
          setMicEnabled(true);
        }
      } else {
        if (rms > offLevel) {
          belowSince = 0;
        } else {
          if (belowSince === 0) belowSince = now;
          if (now - belowSince > HANG_MS && now - lastToggle > MIN_TOGGLE_MS) {
            open = false;
            lastToggle = now;
            belowSince = 0;
            setMicEnabled(false);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [active, analyserNode, setMicEnabled]);
}
