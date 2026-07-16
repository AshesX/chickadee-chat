import { useCallback, useEffect, useRef } from 'react';
import type { ClientMessage, ServerMessage } from '@chickadee/shared';
import { canPlayTrigger, isSenderMuted, shouldAcceptTrigger } from '../lib/soundboardTriggers';
import { playClip, type SoundboardClipSource } from '../lib/soundboardPlayer';

export interface SoundboardPlaybackArgs {
  subscribe: (listener: (message: ServerMessage) => void) => () => void;
  send: (message: ClientMessage) => void;
  enabled: boolean;
  volume: number;
  /** Live per-peer volume map (peer.id -> volume), the same one usePeerVolumes exposes; volume <= 0 means silenced. */
  volumes: Record<string, number>;
}

export interface SoundboardPlayback {
  /** Plays a clip locally immediately (optimistic, no network wait) and broadcasts the trigger. */
  triggerClip: (source: SoundboardClipSource, clipId: string) => void;
}

/**
 * Plays inbound soundboard triggers and exposes the local trigger action.
 * Concurrency (canPlayTrigger) applies to BOTH paths — rapid-clicking your
 * own tiles shouldn't stack unbounded sound any more than a spammy peer
 * should. The per-peer cooldown (shouldAcceptTrigger) only makes sense for
 * the inbound path — there's no "peer" to key a self-cooldown on for your
 * own clicks, and it would just make fast, intentional clicking feel broken.
 * The local mute gate (isSenderMuted) is inbound-only for the same reason:
 * a peer silenced via per-tile volume (volume <= 0) should be inaudible
 * everywhere, including their soundboard hits, not just their mic.
 */
export function useSoundboardPlayback({
  subscribe,
  send,
  enabled,
  volume,
  volumes,
}: SoundboardPlaybackArgs): SoundboardPlayback {
  const activeVoicesRef = useRef(0);
  const lastTriggerAtByPeerRef = useRef<Record<string, number>>({});
  // Refs so the subscribe effect below never needs to re-subscribe on a
  // setting change (mirrors useStageSpotlight/useSfxEvents's live-ref pattern).
  const enabledRef = useRef(enabled);
  const volumeRef = useRef(volume);
  const volumesRef = useRef(volumes);
  enabledRef.current = enabled;
  volumeRef.current = volume;
  volumesRef.current = volumes;

  const play = useCallback((source: SoundboardClipSource, clipId: string) => {
    activeVoicesRef.current += 1;
    void playClip(clipId, source, volumeRef.current, () => {
      activeVoicesRef.current = Math.max(0, activeVoicesRef.current - 1);
    });
  }, []);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type !== 'soundboard-trigger' || !enabledRef.current) return;
      if (isSenderMuted(msg.from, volumesRef.current)) return;
      if (!shouldAcceptTrigger(msg.from, Date.now(), lastTriggerAtByPeerRef.current)) return;
      lastTriggerAtByPeerRef.current[msg.from] = Date.now();
      if (!canPlayTrigger(activeVoicesRef.current)) return;
      play(msg.source, msg.clipId);
    });
  }, [subscribe, play]);

  const triggerClip = useCallback(
    (source: SoundboardClipSource, clipId: string) => {
      if (!enabled || !canPlayTrigger(activeVoicesRef.current)) return;
      play(source, clipId);
      send({ type: 'soundboard-trigger', source, clipId });
    },
    [enabled, play, send],
  );

  return { triggerClip };
}
