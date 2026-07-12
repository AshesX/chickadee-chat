import { useState, useEffect } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { sanitizeBannerDataUrl, type SpaceInfo } from '@chickadee/shared';
import { useDismissTimeout } from '../../hooks/useDismissTimeout';
import { SIDEBAR_HEADER_HEIGHT_PX, SIDEBAR_HEADER_MINIMAL_HEIGHT_PX } from '../../lib/spaceHeader';
import { SpaceContextMenu } from './SpaceContextMenu';
import { SpaceRow } from './SpaceRow';


interface SpaceSwitcherProps {
  spaces: SpaceInfo[];
  activeSpaceId: string | null;
  onSelectSpace: (id: string) => void;
  onCreateSpace: () => void;
  onJoinSpace: () => void;
  onDeleteSpace: (id: string, name: string) => void;
  onSpaceSettings: (id: string) => void;
  /** Hide the space banner image and show a shorter, text-only header instead. */
  hideSpaceBanner: boolean;
  /** Owner-only Lock Space shortcut in the header context menu (active space only). */
  canLockSpace?: boolean;
  spaceLocked?: boolean;
  onToggleSpaceLock?: (locked: boolean) => void;
  /** Local stable userId — per-space owner check for "Leave" vs "Delete" labels. */
  myUserId: string;
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
  hideSpaceBanner,
  canLockSpace = false,
  spaceLocked = false,
  onToggleSpaceLock,
  myUserId,
}: SpaceSwitcherProps): React.JSX.Element {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Per-space so the "copied" indicator can't appear on a different hovered space.
  const [copiedSpaceId, setCopiedSpaceId] = useState<string | null>(null);
  const [hoveredSpaceId, setHoveredSpaceId] = useState<string | null>(null);
  const [typedCode, setTypedCode] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ space: SpaceInfo; x: number; y: number } | null>(null);
  const activeSpace = spaces.find((s) => s.id === activeSpaceId);
  const safeBanner = !hideSpaceBanner && activeSpace ? sanitizeBannerDataUrl(activeSpace.bannerDataUrl) : null;
  const headerHeight = hideSpaceBanner ? SIDEBAR_HEADER_MINIMAL_HEIGHT_PX : SIDEBAR_HEADER_HEIGHT_PX;
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
      <div className={`sidebar__space-header${safeBanner ? ' sidebar__space-header--banner' : ''}${hideSpaceBanner ? ' sidebar__space-header--minimal' : ''}`}>
        {safeBanner && (
          <>
            <img
              key={safeBanner}
              // A data: URI can finish decoding before (or right as) this ref
              // attaches, so `onLoad` alone can miss the event on a genuine
              // fresh page load — this happened to go unnoticed in day-to-day
              // dev testing because a Vite/React-Refresh hot-reload remount
              // doesn't hit the same race, masking it. The `.complete` check
              // catches the case `onLoad` missed; `onLoad` still covers a
              // slower/first-ever decode.
              ref={(el) => { if (el?.complete && el.naturalWidth > 0) setBannerLoaded(true); }}
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
            <ChevronDown
              size={16}
              strokeWidth={2.5}
              className={`sidebar__section-chevron${!switcherOpen ? ' sidebar__section-chevron--collapsed' : ''}`}
            />
            <div className="space-switcher-btn__meta">
              <span className={`space-switcher-btn__name${!activeSpace ? ' space-switcher-btn__name--empty' : ''}`}>
                {activeSpace?.name ?? 'Create / Join Space'}
              </span>
            </div>
          </button>
        </div>
      </div>

      {switcherOpen && (
        <div
          className="menu-surface"
          style={{ position: 'absolute', top: `${headerHeight + 1}px`, left: 0, width: '100%', zIndex: 'var(--z-dropdown)', display: 'flex', flexDirection: 'column', border: 'none', borderRadius: 0, boxShadow: 'var(--sh-1)', clipPath: 'inset(0px 0px -40px 0px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {spaces.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', padding: 'var(--s-1) 0', maxHeight: '220px', overflowY: 'auto' }}>
              {spaces.map((s) => (
                <SpaceRow
                  key={s.id}
                  space={s}
                  isActive={s.id === activeSpaceId}
                  copied={copiedSpaceId === s.id}
                  typedCode={hoveredSpaceId === s.id ? typedCode : null}
                  onSelect={() => {
                    onSelectSpace(s.id);
                    setSwitcherOpen(false);
                  }}
                  onCopy={() => copySpaceCode(s.id)}
                  onCopyHoverEnter={() => setHoveredSpaceId(s.id)}
                  onCopyHoverLeave={() => setHoveredSpaceId(null)}
                  onSettings={() => {
                    onSpaceSettings(s.id);
                    setSwitcherOpen(false);
                  }}
                  onDelete={() => onDeleteSpace(s.id, s.name)}
                  isOwned={!!myUserId && s.ownerId === myUserId}
                />
              ))}
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
          canLockSpace={canLockSpace && ctxMenu.space.id === activeSpaceId}
          spaceLocked={spaceLocked}
          onToggleSpaceLock={onToggleSpaceLock}
          isOwned={!!myUserId && ctxMenu.space.ownerId === myUserId}
        />
      )}
    </div>
  );
}
