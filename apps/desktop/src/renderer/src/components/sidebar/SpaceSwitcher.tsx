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
          className="sidebar__collapse-btn"
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
        <div className="space-dropdown" onClick={(e) => e.stopPropagation()}>
          {spaces.length > 0 && (
            <div className="space-dropdown__list">
              {spaces.map((s) => {
                const isActive = s.id === activeSpaceId;
                return (
                  <div key={s.id} className={`space-dropdown__row${isActive ? ' space-dropdown__row--active' : ''}`}>
                    <button
                      className="space-dropdown__item-select"
                      onClick={() => {
                        onSelectSpace(s.id);
                        setSwitcherOpen(false);
                      }}
                    >
                      <span className="space-dropdown__item-name">
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
                      className="space-dropdown__item-settings"
                      onClick={(e) => {
                        e.stopPropagation();
                        copySpaceCode(s.id);
                      }}
                      onMouseEnter={() => setHoveredSpaceId(s.id)}
                      onMouseLeave={() => setHoveredSpaceId(null)}
                      title="Copy Space Code"
                    >
                      {copiedSpaceId === s.id ? <Check size={12} style={{ color: '#4ade80' }} /> : <Copy size={12} />}
                    </button>
                    <button
                      className="space-dropdown__item-settings"
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
                      className="space-dropdown__item-delete"
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
          <div className="space-dropdown__actions">
            <button
              className="space-dropdown__action-btn"
              onClick={() => {
                onCreateSpace();
                setSwitcherOpen(false);
              }}
            >
              <Plus size={12} />
              <span>Create Space</span>
            </button>
            <button
              className="space-dropdown__action-btn"
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
