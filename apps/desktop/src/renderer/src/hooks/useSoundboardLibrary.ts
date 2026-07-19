import { useCallback, useEffect, useState } from 'react';
import type { ClientMessage, SoundboardClipMeta, SoundboardLibraryClip } from '@chickadee/shared';

export interface SoundboardLibraryArgs {
  send: (message: ClientMessage) => void;
  /** Keeps a future reconnect's `join` payload current (useSignaling.setSoundboardClips). */
  setSoundboardClips: (clips: SoundboardClipMeta[]) => void;
  enabled: boolean;
}

export interface SoundboardLibrary {
  ownClips: SoundboardLibraryClip[];
  addFiles: () => void;
  removeClip: (hash: string) => void;
  openInboxFolder: () => void;
}

/**
 * Owns "my own" soundboard clips: mirrors the main-process library (ffmpeg
 * ingest output — see main/soundboardLibrary.ts) into React state, and keeps
 * it synced to peers via the manifest mirror pattern (CLAUDE.md Pattern 1,
 * like avatar-state) — both a live `send()` for the current connection and
 * the join-payload ref for the next one. Custom-clip BYTES are synced
 * separately (useSoundboardSync, Phase 5); this hook only ever moves small
 * {hash,name,durationMs} metadata.
 */
export function useSoundboardLibrary({ send, setSoundboardClips, enabled }: SoundboardLibraryArgs): SoundboardLibrary {
  const [ownClips, setOwnClips] = useState<SoundboardLibraryClip[]>([]);

  // Mirrors main's library regardless of `enabled` — Settings should still
  // list existing clips while the feature is toggled off, just not sync/play them.
  useEffect(() => {
    if (!window.chickadee) return;
    let cancelled = false;
    void window.chickadee.soundboard.listClips().then((clips) => {
      if (!cancelled) setOwnClips(clips);
    });
    return window.chickadee.soundboard.onManifestChanged((clips) => {
      setOwnClips(clips);
    });
  }, []);

  // Send-on-local-change (mirrors handleSaveAccent) + keep the join ref fresh.
  // Disabled sends/keeps an EMPTY manifest — an explicit retraction to already-
  // connected peers, not just a locally-hidden button.
  useEffect(() => {
    const meta: SoundboardClipMeta[] = enabled
      ? ownClips.map(({ hash, name, durationMs, sizeBytes }) => ({ hash, name, durationMs, sizeBytes }))
      : [];
    setSoundboardClips(meta);
    send({ type: 'soundboard-manifest-state', clips: meta });
  }, [enabled, ownClips, send, setSoundboardClips]);

  const addFiles = useCallback(() => {
    if (!enabled) return;
    void window.chickadee?.soundboard.addFiles();
  }, [enabled]);

  const removeClip = useCallback(
    (hash: string) => {
      if (!enabled) return;
      void window.chickadee?.soundboard.removeClip(hash);
    },
    [enabled],
  );

  const openInboxFolder = useCallback(() => {
    if (!enabled) return;
    void window.chickadee?.soundboard.openInbox();
  }, [enabled]);

  return { ownClips, addFiles, removeClip, openInboxFolder };
}
