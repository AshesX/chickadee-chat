// Text-to-speech for incoming chat messages via the browser's native Web Speech API.
// `speechSynthesis.speak()` maintains its own FIFO queue, so back-to-back messages are
// serialized automatically — we don't manage a queue ourselves.

import { resolveVoice, pitchForCategory } from './voices';

const MAX_LEN = 300; // don't read walls of text aloud

// Chromium can garbage-collect a SpeechSynthesisUtterance before it finishes speaking,
// which cuts playback off mid-sentence. Hold a strong reference to every in-flight
// utterance until it ends/errors so it survives GC.
const pending = new Set<SpeechSynthesisUtterance>();

function speakWith(text: string, voicePreference: string): void {
  const synth = window.speechSynthesis;
  if (!synth) return; // unsupported environment — fail silent

  const utterance = new SpeechSynthesisUtterance(text);
  const voice = resolveVoice(voicePreference);
  if (voice) utterance.voice = voice;
  // Pitch shift keeps male/female distinct even when both resolve to the same system voice.
  utterance.pitch = pitchForCategory(voicePreference);

  // Retain until done so GC can't collect it mid-speech (Chromium bug).
  pending.add(utterance);
  const release = (): void => void pending.delete(utterance);
  utterance.onend = release;
  utterance.onerror = release;

  // Chromium safeguard: the engine can get wedged in a "paused" state; nudge it before queueing.
  if (synth.paused) synth.resume();
  synth.speak(utterance);
}

/**
 * Speak a chat message using the sender's synced voice preference (category id; '' = system
 * default). With `speakName` (default) it reads "[senderName] says: [text]"; otherwise just the
 * text. No-ops if TTS is unavailable.
 */
export function speakChatMessage(senderName: string, text: string, voicePreference = '', speakName = true): void {
  const body = text.length > MAX_LEN ? `${text.slice(0, MAX_LEN)}, message truncated` : text;
  speakWith(speakName ? `${senderName} says: ${body}` : body, voicePreference);
}

/** Preview a voice category locally (for the Settings "Test" button) — fires immediately. */
export function previewVoice(voicePreference: string): void {
  window.speechSynthesis?.cancel(); // interrupt any previous preview
  pending.clear();
  speakWith('This is how your chat messages will sound to other people.', voicePreference);
}

/** Stop any in-progress and queued speech (e.g. when the window regains focus). */
export function cancelSpeech(): void {
  window.speechSynthesis?.cancel();
  pending.clear();
}
