import { useEffect, useRef } from 'react';

const MIN_TOGGLE_MS = 120; // debounce rapid edge flips
const HANG_MS = 250; // hold the channel open briefly after speech drops
const HYSTERESIS = 0.7; // close at threshold * HYSTERESIS
const ATTACK_TC = 0.01; // fast ramp back to 0 dB so word onsets aren't clipped
const RELEASE_TC = 0.18; // slower fade down to the floor for a natural tail

interface UseNoiseExpanderOpts {
  /** Run only in open-mic mode with the toggle on, in a room, not deafened. */
  active: boolean;
  /** RMS speech threshold (0..1); the close threshold is threshold * HYSTERESIS. */
  threshold: number;
  /** Attenuation floor in dB (negative, e.g. -20). */
  reductionDb: number;
  /**
   * The mic analyser node, tapped on the gain node *before* the expander gain,
   * so it always carries the true pre-attenuation signal (reading post-expander
   * would feed back: attenuating would lower the level and lock the gate shut).
   */
  analyserNode: AnalyserNode | null;
  /** The expander gain node whose gain we ramp between the floor and 0 dB. */
  expanderGain: GainNode | null;
}

/**
 * Open-mic downward expander (soft noise gate): monitors the local mic's RMS
 * level and smoothly attenuates the transmitted signal toward a floor while the
 * level sits below the threshold, restoring to 0 dB when speech crosses above.
 * Unlike useVoiceActivation it never hard-mutes (track.enabled stays true) — it
 * only ramps a dedicated GainNode, so background noise is reduced, not cut. The
 * decision runs on rAF with hysteresis + hangtime; the gain itself interpolates
 * at audio rate via setTargetAtTime. While inactive the gain is reset to 0 dB.
 */
export function useNoiseExpander({
  active,
  threshold,
  reductionDb,
  analyserNode,
  expanderGain,
}: UseNoiseExpanderOpts): void {
  // Keep the latest values without restarting the analyser loop each change.
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;
  const reductionDbRef = useRef(reductionDb);
  reductionDbRef.current = reductionDb;

  useEffect(() => {
    if (!active || !analyserNode || !expanderGain) return;

    const ctx = expanderGain.context;
    const samples = new Uint8Array(analyserNode.fftSize);
    let raf = 0;
    let open = false;
    let lastToggle = 0;
    let belowSince = 0;

    // Start attenuated; the expander opens on the first detected speech.
    expanderGain.gain.setTargetAtTime(
      Math.pow(10, reductionDbRef.current / 20),
      ctx.currentTime,
      RELEASE_TC,
    );

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
      const floor = Math.pow(10, reductionDbRef.current / 20);

      if (!open) {
        if (rms > onLevel && now - lastToggle > MIN_TOGGLE_MS) {
          open = true;
          lastToggle = now;
          expanderGain.gain.setTargetAtTime(1, ctx.currentTime, ATTACK_TC);
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
            expanderGain.gain.setTargetAtTime(floor, ctx.currentTime, RELEASE_TC);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      // Reset to transparent so Voice/PTT modes aren't left attenuated.
      expanderGain.gain.setTargetAtTime(1, ctx.currentTime, ATTACK_TC);
    };
  }, [active, analyserNode, expanderGain]);
}
