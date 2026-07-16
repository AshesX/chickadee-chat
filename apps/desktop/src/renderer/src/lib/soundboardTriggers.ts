// Pure decision logic for inbound soundboard triggers (the style of
// sfxTriggers.ts) — hooks.useSoundboardPlayback owns the active-voice count
// and the per-peer timestamp map, and calls into these before playing anything.

/** Hard cap on simultaneous soundboard voices — spam/abuse guard, not a UX choice. */
export const MAX_CONCURRENT_SOUNDBOARD_VOICES = 6;
/** Minimum spacing between accepted triggers from the same peer. */
export const MIN_TRIGGER_GAP_MS_PER_PEER = 250;

/** Concurrency cap: a newest trigger is dropped (not queued) once at the cap. */
export function canPlayTrigger(activeVoices: number, max: number = MAX_CONCURRENT_SOUNDBOARD_VOICES): boolean {
  return activeVoices < max;
}

/**
 * Receiver-side per-peer cooldown — defense in depth independent of whatever
 * cooldown the sender's own UI claims to enforce, since a modified client
 * could ignore its own.
 */
export function shouldAcceptTrigger(
  fromPeerId: string,
  now: number,
  lastTriggerAtByPeer: Record<string, number>,
): boolean {
  const last = lastTriggerAtByPeer[fromPeerId];
  return last === undefined || now - last >= MIN_TRIGGER_GAP_MS_PER_PEER;
}

/**
 * Local mute gate: usePeerVolumes has no separate mute flag — silence is just
 * volume <= 0 (see its pvMuted convention) — so a peer silenced that way
 * should be inaudible everywhere, including their soundboard triggers, not
 * just their mic.
 */
export function isSenderMuted(fromPeerId: string, volumes: Record<string, number>): boolean {
  return (volumes[fromPeerId] ?? 1) <= 0;
}
