import { useState, useEffect } from 'react';
import { Plus, Settings, Trash2, ChevronDown, Copy, Check } from 'lucide-react';
import { sanitizeBannerDataUrl, type SpaceInfo } from '@chickadee/shared';
import { useDismissTimeout } from '../../hooks/useDismissTimeout';
import { SpaceContextMenu } from './SpaceContextMenu';


interface SpaceSwitcherProps {
  spaces: SpaceInfo[];
  activeSpaceId: string | null;
  onSelectSpace: (id: string) => void;
  onCreateSpace: () => void;
  onJoinSpace: () => void;
  onDeleteSpace: (id: string, name: string) => void;
  onSpaceSettings: (id: string) => void;
}

/**
 * The sidebar's space header: the current-space name (over its banner image,
 * when set) + dropdown switcher (with copy-code typewriter hover + settings/
 * delete actions). Owns its open/copied/hover state.
 */
export function SpaceSwitcher({
  spaces,
  activeSpaceId,
  onSelectSpace,
  onCreateSpace,
  onJoinSpace,
  onDeleteSpace,
  onSpaceSettings,
}: SpaceSwitcherProps): React.JSX.Element {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Per-space so the "copied" indicator can't appear on a different hovered space.
  const [copiedSpaceId, setCopiedSpaceId] = useState<string | null>(null);
  const [hoveredSpaceId, setHoveredSpaceId] = useState<string | null>(null);
  const [typedCode, setTypedCode] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ space: SpaceInfo; x: number; y: number } | null>(null);
  const activeSpace = spaces.find((s) => s.id === activeSpaceId);
  const safeBanner = activeSpace ? sanitizeBannerDataUrl(activeSpace.bannerDataUrl) : null;
  const [bannerLoaded, setBannerLoaded] = useState(false);
  // Reset the fade-in whenever the banner value changes (switching spaces, or the
  // banner being set/changed/cleared) so a stale "already loaded" state can't skip it.
  useEffect(() => {
    setBannerLoaded(false);
  }, [safeBanner]);

  const { arm: armClose, cancel: cancelCloseTimeout } = useDismissTimeout(() => setSwitcherOpen(false));

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
      onMouseLeave={() => armClose(1000)}
      onMouseEnter={cancelCloseTimeout}
    >
      <div className={`sidebar__space-header${safeBanner ? ' sidebar__space-header--banner' : ''}`}>
        {safeBanner && (
          <>
            <img
              key={safeBanner}
              src={safeBanner}
              alt=""
              decoding="async"
              className={`sidebar__space-header-banner-img${bannerLoaded ? ' sidebar__space-header-banner-img--loaded' : ''}`}
              onLoad={() => setBannerLoaded(true)}
            />
            <div className="sidebar__space-header-scrim" />
          </>
        )}
        <div className="space-info-wrap">
          <button
            className="space-switcher-btn"
            onClick={() => setSwitcherOpen(!switcherOpen)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (activeSpace) setCtxMenu({ space: activeSpace, x: e.clientX, y: e.clientY });
            }}
          >
            <div className="space-switcher-btn__meta">
              <span className={`space-switcher-btn__name${!activeSpace ? ' space-switcher-btn__name--empty' : ''}`}>
                {activeSpace?.name ?? 'Create / Join Space'}
              </span>
            </div>
            <ChevronDown
              size={12}
              className={`sidebar__section-chevron${!switcherOpen ? ' sidebar__section-chevron--collapsed' : ''}`}
            />
          </button>
        </div>
      </div>

      {switcherOpen && (
        <div
          className="menu-surface"
          style={{ position: 'absolute', top: safeBanner ? '177px' : '77px', left: 0, width: '100%', zIndex: 'var(--z-dropdown)', display: 'flex', flexDirection: 'column', border: 'none', borderRadius: 0, boxShadow: 'var(--sh-1)', clipPath: 'inset(0px 0px -40px 0px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {spaces.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', padding: 'var(--s-1) 0', maxHeight: '220px', overflowY: 'auto' }}>
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
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left', marginRight: 'var(--s-2)', fontFamily: 'var(--font-heading)' }}>
                        {copiedSpaceId === s.id ? (
                          <span
                            className="space-switcher-btn__name--code"
                            style={{
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
          <div style={{ padding: 'var(--s-1) var(--s-1) var(--s-2) var(--s-1)', display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' }}>
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

      {ctxMenu && (
        <SpaceContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onSpaceSettings={onSpaceSettings}
          onCopyCode={copySpaceCode}
          onDeleteSpace={onDeleteSpace}
        />
      )}
    </div>
  );
}
