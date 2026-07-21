/**
 * MediaStreamTrackGenerator (WebCodecs Insertable Streams for MediaStreamTrack)
 * isn't in TypeScript's lib.dom yet, though Chromium has shipped it for years.
 * Used by usePeerMesh.startScreenShare to synthesize a real MediaStreamTrack
 * from raw PCM frames delivered over IPC (native per-process audio capture) —
 * see ScreenAudioConstraints in webrtc/mediaConstraints.ts for the same kind
 * of lib.dom gap on an experimental capture constraint.
 */
declare global {
  interface MediaStreamTrackGeneratorInit {
    kind: 'audio' | 'video';
  }

  class MediaStreamTrackGenerator<T extends AudioData | VideoFrame = AudioData | VideoFrame> extends MediaStreamTrack {
    constructor(init: MediaStreamTrackGeneratorInit);
    readonly writable: WritableStream<T>;
  }
}

export {};
