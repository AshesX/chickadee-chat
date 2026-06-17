import { useEffect, useState } from 'react';

/** One shared AudioContext for all analysers (browsers cap the number of contexts). */
let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  sharedContext ??= new AudioContext();
  if (sharedContext.state === 'suspended') void sharedContext.resume();
  return sharedContext;
}

// RMS thresholds with hysteresis so the indicator doesn't flicker on the edge.
const SPEAK_ON = 0.045;
const SPEAK_OFF = 0.025;
const MIN_TOGGLE_MS = 120;
// Cap the analyser+RMS work at ~50 Hz regardless of display refresh rate (rAF fires
// at 144/240 Hz on gamer hardware; a speaking indicator needs no finer resolution).
// rAF stays the scheduler so we keep its free throttling while minimized.
const COMPUTE_INTERVAL_MS = 20;

/**
 * Returns whether the given stream currently carries active speech, by
 * measuring its RMS audio level via a WebAudio AnalyserNode. Remote streams
 * must also be attached to an <audio> element for the analyser to receive
 * data (ParticipantTile does this); local mic streams work standalone.
 */
export function useAudioActivity(stream: MediaStream | null): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setSpeaking(false);
      return;
    }

    const ctx = getAudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let active = false;
    let lastToggle = 0;
    let lastCompute = 0; // timestamp of the last analyser read (throttle to ~50 Hz)

    const tick = (now: number) => {
      // Throttle the per-frame work; the MIN_TOGGLE_MS debounce below is
      // timestamp-based, so skipping frames between intervals is harmless.
      if (now - lastCompute < COMPUTE_INTERVAL_MS) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastCompute = now;

      analyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (let i = 0; i < samples.length; i++) {
        const centered = (samples[i] - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      const next = active ? rms > SPEAK_OFF : rms > SPEAK_ON;
      if (next !== active && now - lastToggle > MIN_TOGGLE_MS) {
        active = next;
        lastToggle = now;
        setSpeaking(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      analyser.disconnect();
      setSpeaking(false);
    };
  }, [stream]);

  return speaking;
}
