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
// Run at ~50 Hz via setInterval — NOT requestAnimationFrame. This drives the
// broadcast speaking indicator in open-mic mode (App.tsx selfSpeaking), and rAF
// stalls when the window is minimized (it's compositor-driven), which would freeze
// the indicator peers see while you're minimized. setInterval keeps firing in the
// background (backgroundThrottling:false). ~20 ms also caps it below the refresh rate.
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
    let active = false;
    let lastToggle = 0;

    const tick = () => {
      const now = performance.now(); // setInterval gives no timestamp; the debounce is now-based
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
    };
    const id = setInterval(tick, COMPUTE_INTERVAL_MS);

    return () => {
      clearInterval(id);
      source.disconnect();
      analyser.disconnect();
      setSpeaking(false);
    };
  }, [stream]);

  return speaking;
}
