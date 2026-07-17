import { useEffect, useMemo, useRef } from 'react';
import { useAudioGraph } from './useAudioGraph';

interface PeerAudioGraphOptions {
  /** Camera+mic stream: local (muted preview) for self, remote otherwise. */
  cameraStream: MediaStream | null;
  /** Remote only: id of the camera video track on `cameraStream` (forces a re-bind). */
  cameraVideoId?: string | null;
  isSelf: boolean;
  /** Remote only: output volume 0–2 (default 1, where 2 = 200% boost). */
  volume?: number;
  /** Remote only: auto-level incoming audio (compressor + makeup gain). */
  normalize?: boolean;
  /** False while minimized/hidden; detaches video to stop decode (keeps audio sunk). */
  windowVisible: boolean;
}

/**
 * Owns a remote peer's incoming-audio plumbing for a `ParticipantTile`: the
 * `<video>` srcObject binding, the per-peer Web Audio graph (via `useAudioGraph`,
 * so gain > 1.0 is possible), and the no-AudioContext fallback. Returns the
 * `videoRef` to attach to the element and `audioRouted` (true once audio plays
 * through the graph, so the element should be muted).
 */
export function usePeerAudioGraph({
  cameraStream,
  cameraVideoId,
  isSelf,
  volume,
  normalize,
  windowVisible,
}: PeerAudioGraphOptions): {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioRouted: boolean;
} {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Audio-only view of the stream, used while hidden (see the srcObject effect).
  const audioOnlyStream = useMemo(() => {
    if (!cameraStream) return null;
    const audio = cameraStream.getAudioTracks();
    return audio.length ? new MediaStream(audio) : null;
  }, [cameraStream]);

  // The <video> is always mounted so remote audio plays even with camera off.
  // While the window is minimized/hidden, swap in an audio-only stream (NOT null):
  // Chromium stops decoding the video track nobody can see, but the remote audio
  // track stays sunk to a playing media element. That matters because the per-peer
  // Web Audio graph sources from the MediaStream via createMediaStreamSource,
  // and Chromium only produces samples for a remote WebRTC track while it's still
  // consumed by a media element — detaching to null silenced all peers in compact/
  // minimized mode. (Self preview is muted; this is harmless for it.) Mirrors ScreenView.
  //
  // cameraVideoId is a dep so we re-bind when a gated video track arrives on the
  // existing (audio-only) stream object — its msid is shared with the mic, so the
  // `cameraStream` reference doesn't change, and Chromium won't start painting a
  // track added to an already-bound srcObject on its own. We bind a fresh wrapper
  // of the current tracks (a new object) to force the repaint; the audio graph
  // keeps sourcing from the stable `cameraStream` prop, so it never rebuilds.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject =
      windowVisible && cameraStream ? new MediaStream(cameraStream.getTracks()) : audioOnlyStream;
  }, [cameraStream, cameraVideoId, windowVisible, audioOnlyStream]);

  const { audioRouted } = useAudioGraph({ stream: cameraStream, active: !isSelf, volume, normalize });

  // Fallback when the Web Audio graph isn't wired (no AudioContext): apply volume +
  // Deafen (volume 0) directly on the <video> so they still work. Near-dead-code in
  // practice — Electron always provides an AudioContext — but it keeps Deafen correct
  // instead of silently playing at full volume. When audioRouted, the element is muted
  // and the gain node owns volume, so this is a no-op.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || isSelf || audioRouted) return;
    el.volume = Math.max(0, Math.min(1, volume ?? 1));
  }, [volume, isSelf, audioRouted]);

  return { videoRef, audioRouted };
}
