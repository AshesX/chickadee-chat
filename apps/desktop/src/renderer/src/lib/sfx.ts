import { getSharedAudioContext, getMasterBus } from './audioContext';

export type SfxType =
  | 'join'
  | 'leave'
  | 'mute'
  | 'unmute'
  | 'mute-other'
  | 'chat'
  | 'deafen'
  | 'undeafen'
  | 'transmit-open'
  | 'transmit-close';

/** One synthesized tone: an oscillator with an exponential-decay gain envelope. */
interface Tone {
  /** Oscillator wave shape. */
  type?: OscillatorType;
  /** Start frequency (Hz). */
  freq: number;
  /** Optional exponential frequency sweep target (Hz). */
  rampTo?: number;
  /** Sweep length (s); defaults to the tone duration. */
  rampTime?: number;
  /** Start offset (s) from the cue's start, for multi-tone sequences. */
  at?: number;
  /** Envelope length (s): peak → silence, then the oscillator stops. */
  duration: number;
  /** Envelope peak gain. */
  peak: number;
}

/**
 * The synth recipe per cue. Values are exact translations of the original
 * hand-rolled oscillators — tweak sounds here, not in playTone.
 */
const RECIPES: Record<SfxType, Tone[]> = {
  // Ascending double tone: A4 then C#5.
  join: [
    { freq: 440, duration: 0.15, peak: 0.3 },
    { freq: 554.37, at: 0.1, duration: 0.2, peak: 0.3 },
  ],
  // Descending double tone: C#5 then A4.
  leave: [
    { freq: 554.37, duration: 0.15, peak: 0.3 },
    { freq: 440, at: 0.1, duration: 0.2, peak: 0.3 },
  ],
  // Very short descending click.
  mute: [{ freq: 400, rampTo: 150, duration: 0.08, peak: 0.5 }],
  // Very short ascending chirp.
  unmute: [{ freq: 300, rampTo: 800, duration: 0.08, peak: 0.5 }],
  // Two quick muted "thunks" (triangle, low) — distinct from the self
  // mute/unmute sine chirps so muting someone else sounds different.
  'mute-other': [
    { type: 'triangle', freq: 330, duration: 0.06, peak: 0.45 },
    { type: 'triangle', freq: 220, at: 0.07, duration: 0.06, peak: 0.45 },
  ],
  // Gentle water bubble/pop (fast sweep, slightly longer tail).
  chat: [{ freq: 600, rampTo: 1200, rampTime: 0.05, duration: 0.08, peak: 0.3 }],
  // Dual low-frequency descending sweeps.
  deafen: [
    { freq: 300, rampTo: 100, duration: 0.12, peak: 0.4 },
    { freq: 250, rampTo: 80, at: 0.05, duration: 0.15, peak: 0.4 },
  ],
  // Dual ascending sweeps.
  undeafen: [
    { freq: 150, rampTo: 450, duration: 0.12, peak: 0.4 },
    { freq: 200, rampTo: 600, at: 0.05, duration: 0.15, peak: 0.4 },
  ],
  // Subtle quick ascending tick — shorter and quieter than unmute.
  'transmit-open': [{ freq: 500, rampTo: 650, duration: 0.04, peak: 0.3 }],
  // Subtle quick descending tick — shorter and quieter than mute.
  'transmit-close': [{ freq: 650, rampTo: 500, duration: 0.04, peak: 0.3 }],
};

function playTone(ctx: AudioContext, out: AudioNode, now: number, tone: Tone): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = now + (tone.at ?? 0);

  osc.type = tone.type ?? 'sine';
  osc.frequency.setValueAtTime(tone.freq, start);
  if (tone.rampTo != null) {
    osc.frequency.exponentialRampToValueAtTime(tone.rampTo, start + (tone.rampTime ?? tone.duration));
  }

  // Delayed tones hold silence until their start so nothing leaks early.
  if (tone.at) gain.gain.setValueAtTime(0, now);
  gain.gain.setValueAtTime(tone.peak, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + tone.duration);

  osc.connect(gain);
  gain.connect(out);
  osc.start(start);
  osc.stop(start + tone.duration);
}

export function playSfx(type: SfxType, volume: number): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Cue-level volume node (the user's SFX volume), into the master bus limiter.
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(volume, now);
  gainNode.connect(getMasterBus() ?? ctx.destination);

  for (const tone of RECIPES[type]) playTone(ctx, gainNode, now, tone);
}
