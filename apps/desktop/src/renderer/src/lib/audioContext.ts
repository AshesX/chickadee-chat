let _ctx: AudioContext | null = null;
let _masterBus: DynamicsCompressorNode | null = null;
let _desiredSinkId = '';

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_ctx) {
      _ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      // Honor an output device chosen before the context existed.
      applySink();
    }
    if (_ctx.state === 'suspended') void _ctx.resume();
    return _ctx;
  } catch (e) {
    console.error('Failed to create AudioContext:', e);
    return null;
  }
}

/**
 * Set the output device (speaker) for ALL locally-played audio. Because everything
 * funnels through the one shared context's destination, the sink is a single global
 * property — set it here once, not per-tile. Stored and re-applied on context
 * creation so a device chosen before any audio exists is still honored.
 */
export function setOutputSink(deviceId: string): void {
  _desiredSinkId = deviceId;
  applySink();
}

function applySink(): void {
  const ctx = _ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
  if (ctx?.setSinkId) void ctx.setSinkId(_desiredSinkId).catch(() => {});
}

/**
 * Shared master output bus: a brick-wall limiter that ALL locally-played audio
 * (per-peer voice + SFX) connects to instead of `ctx.destination`, so the summed
 * signal can't clip even with boosted/normalized voices and multiple talkers.
 * It's transparent at normal levels (no gain reduction until peaks approach
 * −1 dBFS). Created once; lives with the shared context (never closed).
 * New speaker-output nodes must connect here, NOT to `ctx.destination`.
 */
export function getMasterBus(): AudioNode | null {
  const ctx = getSharedAudioContext();
  if (!ctx) return null;
  if (!_masterBus) {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1; // catch peaks just below 0 dBFS
    limiter.knee.value = 0; // hard knee
    limiter.ratio.value = 20; // max ratio → limiting
    limiter.attack.value = 0.003; // fast
    limiter.release.value = 0.1;
    limiter.connect(ctx.destination);
    _masterBus = limiter;
  }
  return _masterBus;
}
