// Text-to-speech for incoming chat messages via the browser's native Web Speech API.
// `speechSynthesis.speak()` maintains its own FIFO queue, so back-to-back messages are
// serialized automatically — we don't manage a queue ourselves.

const MAX_LEN = 300; // don't read walls of text aloud

/** Speak a chat message as "[senderName] says: [text]". No-ops if TTS is unavailable. */
export function speakChatMessage(senderName: string, text: string): void {
  const synth = window.speechSynthesis;
  if (!synth) return; // unsupported environment — fail silent

  const body = text.length > MAX_LEN ? `${text.slice(0, MAX_LEN)}, message truncated` : text;
  const utterance = new SpeechSynthesisUtterance(`${senderName} says: ${body}`);

  // Chromium safeguard: the engine can get wedged in a "paused" state; nudge it before queueing.
  if (synth.paused) synth.resume();
  synth.speak(utterance);
}

/** Stop any in-progress and queued speech (e.g. when the window regains focus). */
export function cancelSpeech(): void {
  window.speechSynthesis?.cancel();
}
