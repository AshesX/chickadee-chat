import { useCallback, useEffect, useState } from 'react';
import type { ClientMessage, SoundboardCategory, SoundboardClipMeta, SoundboardLibraryClip } from '@chickadee/shared';
import { activeClips, computeSoundboardStats, deriveSharedClipMeta, type SoundboardStats } from '@chickadee/shared';
import { useAutoClearError } from './useAutoClearError';

export interface SoundboardLibraryArgs {
  send: (message: ClientMessage) => void;
  /** Keeps a future reconnect's `join` payload current (useSignaling.setSoundboardClips). */
  setSoundboardClips: (clips: SoundboardClipMeta[]) => void;
  enabled: boolean;
  /** Custom clips specifically — off stops syncing them out and stops adding new ones, without deleting what's already local. */
  customEnabled: boolean;
}

export interface SoundboardLibrary {
  /** The user's full local library, up to 48 clips regardless of category/shared state — what Settings' sounds manager lists. */
  ownClips: SoundboardLibraryClip[];
  categories: SoundboardCategory[];
  /** Clips in a currently-shared category — what the trigger popover shows and what's advertised to peers. */
  activeOwnClips: SoundboardLibraryClip[];
  stats: SoundboardStats;
  addFiles: () => void;
  removeClip: (hash: string) => void;
  addError: string | null;
  createCategory: (name: string) => void;
  renameCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;
  setCategoryShared: (id: string, shared: boolean) => void;
  /** Move a clip to a category (null = Uncategorized) and/or reposition it — drag position IS clip order. `beforeHash: null` appends to the end. */
  moveClip: (hash: string, categoryId: string | null, beforeHash: string | null) => void;
  renameClip: (hash: string, name: string) => void;
  /** Surfaces why a category/move action was blocked (e.g. hit the active-clip or shared-category cap). */
  actionError: string | null;
}

const CAP_ERROR_MESSAGES: Record<string, string> = {
  'too-many-shared-categories': 'You can already share 2 categories — unshare one first.',
  'too-many-active-clips': 'That would exceed the 12 active-clip limit — remove or move some clips first.',
};

/**
 * Owns "my own" soundboard clips + categories: mirrors the main-process
 * library (ffmpeg ingest output — see main/soundboardLibrary.ts) into React
 * state, and keeps the SHARED subset synced to peers via the manifest mirror
 * pattern (CLAUDE.md Pattern 1, like avatar-state) — both a live `send()`
 * for the current connection and the join-payload ref for the next one.
 * Sharing is whole-category (SoundboardCategory.shared) — see
 * @chickadee/shared's soundboard.ts for the cap math this hook delegates to
 * via the main-process IPC handlers, which enforce it authoritatively.
 * Custom-clip BYTES are synced separately (useSoundboardSync); this hook
 * only ever moves small metadata.
 */
export function useSoundboardLibrary({ send, setSoundboardClips, enabled, customEnabled }: SoundboardLibraryArgs): SoundboardLibrary {
  const [library, setLibrary] = useState<{ clips: SoundboardLibraryClip[]; categories: SoundboardCategory[] }>({
    clips: [],
    categories: [],
  });
  const [addError, setAddError] = useAutoClearError();
  const [actionError, setActionError] = useAutoClearError();

  // Mirrors main's library regardless of `enabled` — Settings should still
  // list existing clips while the feature is toggled off, just not sync/play them.
  useEffect(() => {
    if (!window.chickadee) return;
    let cancelled = false;
    void window.chickadee.soundboard.listLibrary().then((lib) => {
      if (!cancelled) setLibrary(lib);
    });
    return window.chickadee.soundboard.onLibraryChanged((lib) => {
      setLibrary(lib);
    });
  }, []);

  // Send-on-local-change (mirrors handleSaveAccent) + keep the join ref fresh.
  // Disabled (either flag) sends/keeps an EMPTY manifest — an explicit
  // retraction to already-connected peers, not just a locally-hidden button.
  // Only SHARED-category clips are ever advertised, regardless of flags.
  useEffect(() => {
    const meta: SoundboardClipMeta[] = enabled && customEnabled ? deriveSharedClipMeta(library.clips, library.categories) : [];
    setSoundboardClips(meta);
    send({ type: 'soundboard-manifest-state', clips: meta });
  }, [enabled, customEnabled, library, send, setSoundboardClips]);

  const addFiles = useCallback(() => {
    if (!enabled || !customEnabled) return;
    void window.chickadee?.soundboard.addFiles().then((result) => {
      if (result?.errors.length) setAddError(result.errors.join('\n'));
    });
  }, [enabled, customEnabled, setAddError]);

  const removeClip = useCallback(
    (hash: string) => {
      if (!enabled) return;
      void window.chickadee?.soundboard.removeClip(hash);
    },
    [enabled],
  );

  const createCategory = useCallback(
    (name: string) => {
      if (!enabled) return;
      void window.chickadee?.soundboard.createCategory(name).then((result) => {
        if (!result?.ok) {
          setActionError(
            result?.error === 'too-many-categories' ? "You've reached the category limit." : 'Enter a category name.',
          );
        }
      });
    },
    [enabled, setActionError],
  );

  const renameCategory = useCallback(
    (id: string, name: string) => {
      if (!enabled) return;
      void window.chickadee?.soundboard.renameCategory(id, name).then((result) => {
        if (!result?.ok) setActionError('Enter a category name.');
      });
    },
    [enabled, setActionError],
  );

  const deleteCategory = useCallback(
    (id: string) => {
      if (!enabled) return;
      void window.chickadee?.soundboard.deleteCategory(id);
    },
    [enabled],
  );

  const setCategoryShared = useCallback(
    (id: string, shared: boolean) => {
      if (!enabled) return;
      void window.chickadee?.soundboard.setCategoryShared(id, shared).then((result) => {
        if (!result?.ok && result?.error) setActionError(CAP_ERROR_MESSAGES[result.error]);
      });
    },
    [enabled, setActionError],
  );

  const moveClip = useCallback(
    (hash: string, categoryId: string | null, beforeHash: string | null) => {
      if (!enabled) return;
      void window.chickadee?.soundboard.moveClip(hash, categoryId, beforeHash).then((result) => {
        if (!result?.ok && result?.error) setActionError(CAP_ERROR_MESSAGES[result.error]);
      });
    },
    [enabled, setActionError],
  );

  const renameClip = useCallback(
    (hash: string, name: string) => {
      if (!enabled) return;
      void window.chickadee?.soundboard.renameClip(hash, name).then((result) => {
        if (!result?.ok) setActionError('Enter a sound name.');
      });
    },
    [enabled, setActionError],
  );

  return {
    ownClips: library.clips,
    categories: library.categories,
    activeOwnClips: activeClips(library.clips, library.categories),
    stats: computeSoundboardStats(library.clips, library.categories),
    addFiles,
    removeClip,
    addError,
    createCategory,
    renameCategory,
    deleteCategory,
    setCategoryShared,
    moveClip,
    renameClip,
    actionError,
  };
}
