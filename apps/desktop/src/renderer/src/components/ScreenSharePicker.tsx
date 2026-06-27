import { useEffect, useState } from 'react';
import type { ScreenSource } from '@chickadee/shared';

export interface ScreenSharePickerProps {
  onPick: (sourceId: string, withAudio: boolean) => void;
  onClose: () => void;
}

/**
 * Modal source picker. Lists the screens and windows enumerated by the main
 * process (over IPC) and lets the user choose one to share, optionally with
 * system/game audio.
 */
export function ScreenSharePicker({ onPick, onClose }: ScreenSharePickerProps): React.JSX.Element {
  const [sources, setSources] = useState<ScreenSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withAudio, setWithAudio] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!window.chickadee?.getScreenSources) {
      setError('Screen sharing is unavailable (preload bridge not loaded).');
      return;
    }
    window.chickadee
      .getScreenSources()
      .then((list) => {
        if (!cancelled) setSources(list);
      })
      .catch((err) => {
        console.error('getScreenSources failed', err);
        if (!cancelled) setError('Could not list screens/windows.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const screens = sources?.filter((s) => s.id.startsWith('screen:')) ?? [];
  const windows = sources?.filter((s) => !s.id.startsWith('screen:')) ?? [];

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel modal-panel--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel__head">
          <h2 className="modal-panel__title">Share a screen or window</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-panel__body">
          <label className="srcpicker__audio">
            <input
              type="checkbox"
              checked={withAudio}
              onChange={(e) => setWithAudio(e.target.checked)}
            />
            Share system / game audio
          </label>

          {error && <p className="error">{error}</p>}
          {!sources && !error && <p className="hint">Loading sources…</p>}

          {sources && (
            <>
              {renderGroup('Screens', screens, withAudio, onPick)}
              {renderGroup('Windows', windows, withAudio, onPick)}
              {sources.length === 0 && <p className="hint">No shareable sources found.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function renderGroup(
  title: string,
  list: ScreenSource[],
  withAudio: boolean,
  onPick: (id: string, withAudio: boolean) => void,
): React.JSX.Element | null {
  if (list.length === 0) return null;
  return (
    <section className="srcgroup">
      <h3 className="srcgroup__title">{title}</h3>
      <div className="srcgroup__grid">
        {list.map((source) => (
          <button
            key={source.id}
            className="srccard"
            onClick={() => onPick(source.id, withAudio)}
            title={source.name}
          >
            <img className="srccard__thumb" src={source.thumbnail} alt="" />
            <span className="srccard__name">
              {source.appIcon && <img className="srccard__icon" src={source.appIcon} alt="" />}
              {source.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
