let _ctx: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    _ctx ??= new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (_ctx.state === 'suspended') void _ctx.resume();
    return _ctx;
  } catch (e) {
    console.error('Failed to create AudioContext:', e);
    return null;
  }
}
