import { Check, Copy, Settings, Trash2 } from 'lucide-react';
import type { SpaceInfo } from '@chickadee/shared';

interface SpaceRowProps {
  space: SpaceInfo;
  isActive: boolean;
  /** True right after this space's code was copied (shows the "copied" flash). */
  copied: boolean;
  /** The typewriter-partial invite code while the copy button is hovered, else null. */
  typedCode: string | null;
  onSelect: () => void;
  onCopy: () => void;
  onCopyHoverEnter: () => void;
  onCopyHoverLeave: () => void;
  onSettings: () => void;
  onDelete: () => void;
}

/**
 * One space in the switcher dropdown: select button (whose label morphs into
 * the typewriter invite code / "copied" flash) + copy/settings/delete actions.
 */
export function SpaceRow({
  space,
  isActive,
  copied,
  typedCode,
  onSelect,
  onCopy,
  onCopyHoverEnter,
  onCopyHoverLeave,
  onSettings,
  onDelete,
}: SpaceRowProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)', padding: 'var(--s-1) var(--s-2)' }}>
      <button
        className={`menu-item${isActive ? ' menu-item--active' : ''}`}
        style={{ flex: 1, padding: 'var(--s-2)' }}
        onClick={onSelect}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left', marginRight: 'var(--s-2)' }}>
          {copied ? (
            <span className="space-switcher-btn__name--code" style={{ color: 'var(--green)' }}>
              copied
            </span>
          ) : typedCode != null ? (
            <span className="space-switcher-btn__name--code">{typedCode}</span>
          ) : (
            space.name
          )}
        </span>
      </button>
      <button
        className="icon-btn icon-btn--sm"
        onClick={(e) => {
          e.stopPropagation();
          onCopy();
        }}
        onMouseEnter={onCopyHoverEnter}
        onMouseLeave={onCopyHoverLeave}
        title="Copy Space Code"
      >
        {copied ? <Check size={12} style={{ color: 'var(--green)' }} /> : <Copy size={12} />}
      </button>
      <button
        className="icon-btn icon-btn--sm"
        onClick={(e) => {
          e.stopPropagation();
          onSettings();
        }}
        title="Space Settings"
      >
        <Settings size={12} />
      </button>
      <button
        className="icon-btn icon-btn--sm icon-btn--danger"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete Space"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
