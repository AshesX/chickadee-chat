import { useEffect, useRef, useState } from 'react';
import { getSharedAudioContext, getMasterBus } from '../lib/audioContext';

interface AudioGraphOptions {
  /** The stream to source audio from. */
  stream: MediaStream | null;
  /** False for a local/self stream, or whenever this stream's audio shouldn't route here. */
  active: boolean;
  /** Output volume 0–2 (default 1, where 2 = 200% boost). */
  volume?: number;
  /** Auto-level incoming audio (compressor + makeup gain) — a voice-loudness feature. */
  normalize?: boolean;
}

/**
 * Stream-agnostic Web Audio plumbing shared by `usePeerAudioGraph` (voice) and
 * `ScreenView` (screen-share audio): builds a per-stream gain graph so gain > 1.0
 * is possible, applies live gain updates without rebuilding the graph, and
 * reports whether audio is routed (so the caller knows to mute its own
 * `<video>` element and avoid double playback). Does not touch the DOM —
 * callers own their own `<video>`/srcObject binding.
 */
export function useAudioGraph({ stream, active, volume, normalize }: AudioGraphOptions): {
  audioRouted: boolean;
} {
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const [audioRouted, setAudioRouted] = useState(false);

  // Build the graph (source → [compressor→makeup if normalize] → gain → master bus).
  // Source from the MediaStream, not a <video> element: createMediaElementSource
  // binds the element permanently (crashes on StrictMode re-mount) and goes silent
  // for remote WebRTC streams in Chromium. createMediaStreamSource has neither problem.
  useEffect(() => {
    if (!active || !stream) return;
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    const src = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, volume ?? 1);
    let compressor: DynamicsCompressorNode | null = null;
    let makeup: GainNode | null = null;
    if (normalize) {
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -28;
      compressor.knee.value = 24;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      makeup = ctx.createGain();
      makeup.gain.value = 1.8; // ≈ +5 dB to recover compressed level
      src.connect(compressor);
      compressor.connect(makeup);
      makeup.connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(getMasterBus() ?? ctx.destination);
    sourceNodeRef.current = src;
    gainNodeRef.current = gain;
    setAudioRouted(true);
    return () => {
      src.disconnect();
      compressor?.disconnect();
      makeup?.disconnect();
      gain.disconnect();
      sourceNodeRef.current = null;
      gainNodeRef.current = null;
      setAudioRouted(false);
    };
  }, [stream, active, normalize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-stream output volume via GainNode (supports 0–2 for 0–200% boost).
  // stream is a dep so the value re-applies after the graph rebuilds.
  useEffect(() => {
    if (gainNodeRef.current && active) gainNodeRef.current.gain.value = Math.max(0, volume ?? 1);
  }, [volume, active, stream]);

  return { audioRouted };
}
