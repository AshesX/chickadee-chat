/**
 * Pure media-constraint helpers shared by the peer mesh: resolution presets and
 * the local mic-processing graph. No React, no module state — safe to import
 * anywhere.
 */

export const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4K': { width: 3840, height: 2160 },
};

/** The mic getUserMedia audio constraints for a device + the user's DSP toggles. */
export function buildMicAudioConstraints(
  deviceId: string,
  echoCancellation: boolean,
  autoGainControl: boolean,
  noiseSuppression: boolean,
): MediaTrackConstraints {
  return {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation,
    autoGainControl,
    noiseSuppression,
  };
}

/**
 * True when a getUserMedia rejection looks like it was caused by a specific
 * `deviceId` constraint pointing at a device that no longer exists (unplugged
 * headset, Windows default-device swap) rather than "no mic at all" —
 * `OverconstrainedError`/`NotFoundError` are worth one retry against the
 * system default device; anything else (e.g. `NotAllowedError` permission
 * denial, `NotReadableError` device genuinely busy) is not.
 */
export function isStaleDeviceError(err: unknown): boolean {
  const name = err instanceof DOMException ? err.name : undefined;
  return name === 'OverconstrainedError' || name === 'NotFoundError';
}

/**
 * The camera/screen video capture constraints for a resolution preset +
 * framerate setting, falling back to `fallback` (a RESOLUTION_MAP key) for an
 * unknown preset and 30 fps for an unparsable framerate.
 */
export function buildVideoCaptureConstraints(
  resolution: string,
  framerate: string,
  fallback: string,
): MediaTrackConstraints {
  const res = RESOLUTION_MAP[resolution] || RESOLUTION_MAP[fallback];
  const fps = parseInt(framerate, 10) || 30;
  return {
    width: { ideal: res.width },
    height: { ideal: res.height },
    frameRate: { ideal: fps },
  };
}

const MIC_ANALYSER_FFT_SIZE = 256;

/**
 * Build the local mic processing chain on the shared AudioContext:
 *   source → gain → analyser (tap) → MediaStreamDestination
 * The analyser taps the post-gain signal, feeding voice-activation (VAD) and the
 * settings mic meter. Returns the nodes plus the processed wire stream.
 */
export function createMicProcessingGraph(
  ctx: AudioContext,
  rawStream: MediaStream,
  volume: number,
): { gainNode: GainNode; analyserNode: AnalyserNode; processedStream: MediaStream } {
  const source = ctx.createMediaStreamSource(rawStream);
  const gainNode = ctx.createGain();
  gainNode.gain.value = volume;
  const analyserNode = ctx.createAnalyser();
  analyserNode.fftSize = MIC_ANALYSER_FFT_SIZE;
  const destination = ctx.createMediaStreamDestination();

  source.connect(gainNode);
  gainNode.connect(analyserNode);
  gainNode.connect(destination);

  return { gainNode, analyserNode, processedStream: destination.stream };
}
