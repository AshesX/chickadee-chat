import { getSharedAudioContext, getMasterBus } from './audioContext';

export function playSfx(type: 'join' | 'leave' | 'mute' | 'unmute' | 'mute-other' | 'chat' | 'deafen' | 'undeafen' | 'transmit-open' | 'transmit-close', volume: number): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Create master volume node
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(volume, now);
  gainNode.connect(getMasterBus() ?? ctx.destination);

  switch (type) {
    case 'join': {
      // Ascending double tone
      // Tone 1: 440Hz (A4)
      const osc1 = ctx.createOscillator();
      const osc1Gain = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);
      osc1Gain.gain.setValueAtTime(0.3, now);
      osc1Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      
      osc1.connect(osc1Gain);
      osc1Gain.connect(gainNode);
      
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Tone 2: 554.37Hz (C#5) starting 0.1s later
      const osc2 = ctx.createOscillator();
      const osc2Gain = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(554.37, now + 0.1);
      osc2Gain.gain.setValueAtTime(0, now);
      osc2Gain.gain.setValueAtTime(0.3, now + 0.1);
      osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      
      osc2.connect(osc2Gain);
      osc2Gain.connect(gainNode);
      
      osc2.start(now + 0.1);
      osc2.stop(now + 0.3);
      break;
    }
    case 'leave': {
      // Descending double tone
      // Tone 1: 554.37Hz (C#5)
      const osc1 = ctx.createOscillator();
      const osc1Gain = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(554.37, now);
      osc1Gain.gain.setValueAtTime(0.3, now);
      osc1Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      
      osc1.connect(osc1Gain);
      osc1Gain.connect(gainNode);
      
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Tone 2: 440Hz (A4) starting 0.1s later
      const osc2 = ctx.createOscillator();
      const osc2Gain = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(440, now + 0.1);
      osc2Gain.gain.setValueAtTime(0, now);
      osc2Gain.gain.setValueAtTime(0.3, now + 0.1);
      osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      
      osc2.connect(osc2Gain);
      osc2Gain.connect(gainNode);
      
      osc2.start(now + 0.1);
      osc2.stop(now + 0.3);
      break;
    }
    case 'mute': {
      // Very short descending click
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
      oscGain.gain.setValueAtTime(0.5, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      
      osc.connect(oscGain);
      oscGain.connect(gainNode);
      
      osc.start(now);
      osc.stop(now + 0.08);
      break;
    }
    case 'unmute': {
      // Very short ascending chirp
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
      oscGain.gain.setValueAtTime(0.5, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      
      osc.connect(oscGain);
      oscGain.connect(gainNode);
      
      osc.start(now);
      osc.stop(now + 0.08);
      break;
    }
    case 'mute-other': {
      // Two quick muted "thunks" (triangle, low) — distinct from the self
      // mute/unmute sine chirps so muting someone else sounds different.
      const freqs = [330, 220];
      freqs.forEach((freq, i) => {
        const t = now + i * 0.07;
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        oscGain.gain.setValueAtTime(0, t);
        oscGain.gain.setValueAtTime(0.45, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(oscGain);
        oscGain.connect(gainNode);
        osc.start(t);
        osc.stop(t + 0.06);
      });
      break;
    }
    case 'chat': {
      // Gentle water bubble/pop
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
      oscGain.gain.setValueAtTime(0.3, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      
      osc.connect(oscGain);
      oscGain.connect(gainNode);
      
      osc.start(now);
      osc.stop(now + 0.08);
      break;
    }
    case 'deafen': {
      // Dual low-frequency descending sweeps
      const osc1 = ctx.createOscillator();
      const osc1Gain = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(300, now);
      osc1.frequency.exponentialRampToValueAtTime(100, now + 0.12);
      osc1Gain.gain.setValueAtTime(0.4, now);
      osc1Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      
      osc1.connect(osc1Gain);
      osc1Gain.connect(gainNode);
      osc1.start(now);
      osc1.stop(now + 0.12);

      const osc2 = ctx.createOscillator();
      const osc2Gain = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(250, now + 0.05);
      osc2.frequency.exponentialRampToValueAtTime(80, now + 0.2);
      osc2Gain.gain.setValueAtTime(0, now);
      osc2Gain.gain.setValueAtTime(0.4, now + 0.05);
      osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      
      osc2.connect(osc2Gain);
      osc2Gain.connect(gainNode);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.2);
      break;
    }
    case 'undeafen': {
      // Dual high-frequency ascending sweeps
      const osc1 = ctx.createOscillator();
      const osc1Gain = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(150, now);
      osc1.frequency.exponentialRampToValueAtTime(450, now + 0.12);
      osc1Gain.gain.setValueAtTime(0.4, now);
      osc1Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      
      osc1.connect(osc1Gain);
      osc1Gain.connect(gainNode);
      osc1.start(now);
      osc1.stop(now + 0.12);

      const osc2 = ctx.createOscillator();
      const osc2Gain = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(200, now + 0.05);
      osc2.frequency.exponentialRampToValueAtTime(600, now + 0.2);
      osc2Gain.gain.setValueAtTime(0, now);
      osc2Gain.gain.setValueAtTime(0.4, now + 0.05);
      osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      
      osc2.connect(osc2Gain);
      osc2Gain.connect(gainNode);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.2);
      break;
    }
    case 'transmit-open': {
      // Subtle quick ascending tick — shorter and quieter than unmute
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(650, now + 0.04);
      oscGain.gain.setValueAtTime(0.3, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(oscGain);
      oscGain.connect(gainNode);
      osc.start(now);
      osc.stop(now + 0.04);
      break;
    }
    case 'transmit-close': {
      // Subtle quick descending tick — shorter and quieter than mute
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(500, now + 0.04);
      oscGain.gain.setValueAtTime(0.3, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(oscGain);
      oscGain.connect(gainNode);
      osc.start(now);
      osc.stop(now + 0.04);
      break;
    }
  }
}
