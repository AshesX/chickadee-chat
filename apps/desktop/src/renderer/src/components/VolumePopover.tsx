import type { Peer, PeerId } from '@chickadee/shared';

interface VolumePopoverProps {
  peers: Peer[];
  colors: Record<PeerId, string>;
  volumes: Record<PeerId, number>;
  onChange: (peerId: PeerId, volume: number) => void;
  onClose: () => void;
  anchorRect: DOMRect;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/** Floating per-peer output-volume sliders, anchored above the control bar. */
export function VolumePopover({
  peers,
  colors,
  volumes,
  onChange,
  onClose,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: VolumePopoverProps): React.JSX.Element {
  const menuWidth = 290;
  const gap = 8;

  const bottom = window.innerHeight - anchorRect.top + gap;
  const rawLeft = anchorRect.left + anchorRect.width / 2 - menuWidth / 2;
  const left = Math.max(8, Math.min(rawLeft, window.innerWidth - menuWidth - 8));

  return (
    <div className="popover-backdrop" onClick={onClose}>
      <div
        className="volume-pop"
        style={{ bottom, left, width: menuWidth }}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="volume-pop__head">Volume</div>
        {peers.length === 0 && <p className="volume-pop__empty">No one else here.</p>}
        {peers.map((p) => {
          const color = colors[p.id] ?? '#8a8ac0';
          const v = volumes[p.id] ?? 1;
          const pct = Math.round(v * 100);
          const boosted = v > 1;
          return (
            <div key={p.id} className="volume-row">
              <span
                className="volume-row__avatar"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}66)` }}
              >
                {p.displayName.trim().charAt(0).toUpperCase() || '?'}
              </span>
              <span className="volume-row__name">{p.displayName}</span>
              <datalist id={`vticks-${p.id}`}>
                <option value={100} />
              </datalist>
              <input
                className="volume-row__slider"
                type="range"
                list={`vticks-${p.id}`}
                min={0}
                max={200}
                value={pct}
                style={{ accentColor: boosted ? '#f59e0b' : '#8b5cf6' }}
                onChange={(e) => onChange(p.id, Number(e.target.value) / 100)}
              />
              <span className={`volume-row__pct${boosted ? ' volume-row__pct--boost' : ''}`}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
