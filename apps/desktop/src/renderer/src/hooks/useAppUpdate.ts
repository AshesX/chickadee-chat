import { useEffect, useState } from 'react';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface AppUpdateState {
  status: UpdateStatus;
  version: string | null;
  percent: number;
  error: string | null;
}

const IDLE_STATE: AppUpdateState = { status: 'idle', version: null, percent: 0, error: null };

export interface AppUpdateActions {
  check: () => void;
  download: () => void;
  install: () => void;
  /** Hides the floating card for this update (available/downloaded only — not mid-download). */
  dismiss: () => void;
}

/**
 * Bridges the main-process electron-updater (main/autoUpdate.ts) into renderer
 * state. A no-op on portable/dev builds — window.chickadee.update is still
 * present (preload always defines it) but main never emits any of these
 * events there, so status just stays 'idle' forever.
 */
export function useAppUpdate(): AppUpdateState & AppUpdateActions {
  const [state, setState] = useState<AppUpdateState>(IDLE_STATE);

  useEffect(() => {
    const update = window.chickadee?.update;
    if (!update) return;
    const unsubs = [
      update.onChecking(() => setState((s) => ({ ...s, status: 'checking', error: null }))),
      update.onAvailable(({ version }) =>
        setState((s) => ({ ...s, status: 'available', version, error: null })),
      ),
      update.onNotAvailable(() => setState((s) => ({ ...s, status: 'not-available', error: null }))),
      update.onError((message) => setState((s) => ({ ...s, status: 'error', error: message }))),
      update.onDownloadProgress(({ percent }) =>
        setState((s) => ({ ...s, status: 'downloading', percent })),
      ),
      update.onDownloaded(({ version }) =>
        setState((s) => ({ ...s, status: 'downloaded', version, percent: 100 })),
      ),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  return {
    ...state,
    check: () => window.chickadee?.update?.check(),
    download: () => {
      setState((s) => ({ ...s, status: 'downloading', percent: 0 }));
      void window.chickadee?.update?.download();
    },
    install: () => window.chickadee?.update?.install(),
    dismiss: () => setState((s) => (s.status === 'downloading' ? s : IDLE_STATE)),
  };
}
