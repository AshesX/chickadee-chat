import { useState, useRef, useEffect } from 'react';
import { Plus, Settings, Trash2, ChevronDown, ChevronsLeft, Copy, Check } from 'lucide-react';
import type { SpaceInfo } from '@chickadee/shared';


interface SpaceSwitcherProps {
  spaces: SpaceInfo[];
  activeSpaceId: string | null;
  onSelectSpace: (id: string) => void;
  onCreateSpace: () => void;
  onJoinSpace: () => void;
  onDeleteSpace: (id: string, name: string) => void;
  onSpaceSettings: (id: string) => void;
  compact: boolean;
  onToggleCompact: () => void;
}

/**
 * The sidebar's space header: the current-space dropdown switcher (with copy-code
 * typewriter hover + settings/delete actions), the collapse-to-dock button, and
 * (in compact mode) the window controls. Owns its open/copied/hover state.
 */
export function SpaceSwitcher({
  spaces,
  activeSpaceId,
  onSelectSpace,
  onCreateSpace,
  onJoinSpace,
  onDeleteSpace,
  onSpaceSettings,
  compact,
  onToggleCompact,
}: SpaceSwitcherProps): React.JSX.Element {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Per-space so the "copied" indicator can't appear on a different hovered space.
  const [copiedSpaceId, setCopiedSpaceId] = useState<string | null>(null);
  const [hoveredSpaceId, setHoveredSpaceId] = useState<string | null>(null);
  const [typedCode, setTypedCode] = useState('');
  const activeSpace = spaces.find((s) => s.id === activeSpaceId);

  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startCloseTimeout(): void {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = setTimeout(() => {
      setSwitcherOpen(false);
    }, 1000);
  }

  function cancelCloseTimeout(): void {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Close when clicking outside of the switcher container
  useEffect(() => {
    if (!switcherOpen) return;

    function handleOutsideClick(e: MouseEvent): void {
      const container = document.getElementById('sidebar-space-header-container');
      if (container && !container.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [switcherOpen]);

  // Typewriter effect for Copy Space Code hover
  useEffect(() => {
    const hoveredSpace = spaces.find((s) => s.id === hoveredSpaceId);
    if (!hoveredSpace) {
      setTypedCode('');
      return;
    }

    const fullText = hoveredSpace.id;
    let index = 1;
    setTypedCode(fullText.substring(0, index));
    const interval = setInterval(() => {
      index++;
      setTypedCode(fullText.substring(0, index));
      if (index >= fullText.length) {
        clearInterval(interval);
      }
    }, 15);
    return () => clearInterval(interval);
  }, [hoveredSpaceId, spaces]);

  function copySpaceCode(spaceId: string): void {
    if (window.chickadee?.writeClipboard) {
      void window.chickadee.writeClipboard(spaceId);
    } else {
      navigator.clipboard.writeText(spaceId);
    }
    setCopiedSpaceId(spaceId);
    setTimeout(() => setCopiedSpaceId(null), 1500);
  }

  return (
    <div
      id="sidebar-space-header-container"
      className="sidebar__space-header-container"
      onMouseLeave={startCloseTimeout}
      onMouseEnter={cancelCloseTimeout}
    >
      <div className="sidebar__space-header">
        <div className="space-info-wrap">
          <button className="space-switcher-btn" onClick={() => setSwitcherOpen(!switcherOpen)}>
            <ChevronDown
              size={12}
              className={`sidebar__section-chevron${!switcherOpen ? ' sidebar__section-chevron--collapsed' : ''}`}
            />
            <div className="space-switcher-btn__meta">
              <span className={`space-switcher-btn__name${!activeSpace ? ' space-switcher-btn__name--empty' : ''}`}>
                {activeSpace?.name ?? 'Create / Join Space'}
              </span>
            </div>
          </button>
        </div>
        <button
          className="icon-btn sidebar__collapse-btn"
          onClick={onToggleCompact}
          title={compact ? 'Expand' : 'Collapse to sidebar'}
          aria-label={compact ? 'Expand' : 'Collapse to sidebar'}
        >
          <ChevronsLeft
            size={14}
            className={`sidebar__collapse-icon${compact ? ' sidebar__collapse-icon--flipped' : ''}`}
          />
        </button>
      </div>

      {switcherOpen && (
        <div 
          className="menu-surface" 
          style={{ position: 'absolute', top: '56px', left: '8px', width: 'calc(100% - 16px)', zIndex: 'var(--z-dropdown)', display: 'flex', flexDirection: 'column' }}
          onClick={(e) => e.stopPropagation()}
        >
          {spaces.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', padding: 'var(--s-1) 0', maxHeight: '220px', overflowY: 'auto', borderBottom: '1px solid var(--border)' }}>
              {spaces.map((s) => {
                const isActive = s.id === activeSpaceId;
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)', padding: 'var(--s-1) var(--s-2)' }}>
                    <button
                      className={`menu-item${isActive ? ' menu-item--active' : ''}`}
                      style={{ flex: 1, padding: 'var(--s-2)' }}
                      onClick={() => {
                        onSelectSpace(s.id);
                        setSwitcherOpen(false);
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left', marginRight: 'var(--s-2)' }}>
                        {copiedSpaceId === s.id ? (
                          <span
                            className="space-switcher-btn__name--code"
                            style={{
                              background: 'none',
                              WebkitTextFillColor: 'var(--green)',
                              color: 'var(--green)'
                            }}
                          >
                            copied
                          </span>
                        ) : hoveredSpaceId === s.id ? (
                          <span className="space-switcher-btn__name--code">
                            {typedCode}
                          </span>
                        ) : (
                          s.name
                        )}
                      </span>
                    </button>
                    <button
                      className="icon-btn icon-btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        copySpaceCode(s.id);
                      }}
                      onMouseEnter={() => setHoveredSpaceId(s.id)}
                      onMouseLeave={() => setHoveredSpaceId(null)}
                      title="Copy Space Code"
                    >
                      {copiedSpaceId === s.id ? <Check size={12} style={{ color: 'var(--green)' }} /> : <Copy size={12} />}
                    </button>
                    <button
                      className="icon-btn icon-btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSpaceSettings(s.id);
                        setSwitcherOpen(false);
                      }}
                      title="Space Settings"
                    >
                      <Settings size={12} />
                    </button>
                    <button
                      className="icon-btn icon-btn--sm icon-btn--danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSpace(s.id, s.name);
                      }}
                      title="Delete Space"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ padding: 'var(--s-1)', display: 'flex', flexDirection: 'column', gap: 'var(--s-1)', background: 'color-mix(in srgb, var(--tint) 4%, transparent)' }}>
            <button
              className="menu-item"
              onClick={() => {
                onCreateSpace();
                setSwitcherOpen(false);
              }}
            >
              <Plus size={12} />
              <span>Create Space</span>
            </button>
            <button
              className="menu-item"
              onClick={() => {
                onJoinSpace();
                setSwitcherOpen(false);
              }}
            >
              <Plus size={12} />
              <span>Join Space</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
