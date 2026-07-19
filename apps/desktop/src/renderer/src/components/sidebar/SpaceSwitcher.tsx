import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Lock, LockOpen, LogOut, Menu, Plus, Settings, Trash2, X } from 'lucide-react';
import { sanitizeBannerDataUrl, type SpaceInfo } from '@chickadee/shared';
import { useDismissTimeout } from '../../hooks/useDismissTimeout';

interface SpaceSwitcherProps {
  spaces: SpaceInfo[];
  activeSpaceId: string | null;
  onSelectSpace: (id: string) => void;
  onCreateSpace: () => void;
  onJoinSpace: () => void;
  onDeleteSpace: (id: string) => void;
  onSpaceSettings: (id: string) => void;
  /** Hide the space banner image and show a shorter, text-only header instead. */
  hideSpaceBanner: boolean;
  /** Owner-only Lock Space action in the banner's action row (active space only). */
  canLockSpace?: boolean;
  spaceLocked?: boolean;
  onToggleSpaceLock?: (locked: boolean) => void;
  /** Local stable userId — active-space owner check for "Leave" vs "Delete" labels. */
  myUserId: string;
}

/**
 * The sidebar's space header/banner: the active space's name (over its banner
 * image, when set) plus a hamburger button that reveals (a) an in-banner
 * action row for the active space — copy code (hover morphs the name into
 * the typewriter invite code), settings, lock (owner), delete/leave (inline
 * arm-then-confirm) — and (b) a Manage Spaces panel below the banner, in
 * normal flow, listing other spaces to switch to plus Create/Join Space.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [typedCode, setTypedCode] = useState('');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const activeSpace = spaces.find((s) => s.id === activeSpaceId);
  const otherSpaces = spaces.filter((s) => s.id !== activeSpaceId);
  const isOwned = !!myUserId && activeSpace?.ownerId === myUserId;
  const safeBanner = !hideSpaceBanner && activeSpace ? sanitizeBannerDataUrl(activeSpace.bannerDataUrl) : null;
  const [bannerLoaded, setBannerLoaded] = useState(false);
  // Reset the fade-in whenever the banner value changes (switching spaces, or the
  // banner being set/changed/cleared) so a stale "already loaded" state can't skip it.
  useEffect(() => {
    setBannerLoaded(false);
  }, [safeBanner]);

  const containerRef = useRef<HTMLDivElement>(null);

  const { arm: armDelete, cancel: cancelArmDelete } = useDismissTimeout(() => setDeleteArmed(false));
  const { arm: armMenuClose, cancel: cancelMenuClose } = useDismissTimeout(() => {
    setMenuOpen(false);
    setDeleteArmed(false);
  });

  // Close when clicking outside the header + manage panel container. Listens
  // for `click`, not `mousedown`: the Manage Spaces panel lives in normal
  // flow (it pushes ROOMS/USERS down, unlike the old absolutely-positioned
  // dropdown it replaced), so closing it reflows the sidebar. Closing on
  // mousedown moved that content out from under the cursor before the
  // browser's mouseup/click pairing resolved, so a click meant for e.g. a
  // room row landed on nothing. `click` fires after that pairing is already
  // resolved against the pre-close layout, and bubbles through the target's
  // own handler (attached closer to it in the tree) before it ever reaches
  // this document-level listener — so the click "goes through" and closes
  // the menu in one motion instead of just closing it.
  useEffect(() => {
    if (!menuOpen) return;

    function handleOutsideClick(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setDeleteArmed(false);
      }
    }

    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [menuOpen]);

  // `hovered` is set by the Copy button's onMouseEnter/onMouseLeave, but that
  // button only exists while the menu is open (`menuOpen && activeSpace`).
  // If the menu closes — for any of its several reasons: an explicit close
  // click, the outside-click handler, the hover auto-close timer — while the
  // cursor is still positioned over/near where the button was, React unmounts
  // it without ever firing onMouseLeave (there's no browser event for "the
  // element under your cursor just vanished"). Without this, `hovered` would
  // stay stuck true forever, permanently locking the name display on the
  // invite code instead of the space name. Forcing it false here whenever
  // the menu isn't open covers every close path in one place instead of
  // threading a reset through each of them individually.
  useEffect(() => {
    if (!menuOpen) {
      setHovered(false);
    }
  }, [menuOpen]);

  // Typewriter effect for the Copy Space Code hover.
  useEffect(() => {
    if (!hovered || !activeSpace) {
      setTypedCode('');
      return;
    }

    const fullText = activeSpace.id;
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
  }, [hovered, activeSpace]);

  function toggleMenu(e: React.MouseEvent): void {
    // Defense in depth: the outside-click-closes effect's own containment
    // check already excludes this button (it's inside the container), so
    // this click shouldn't reach it as an "outside click" regardless. But
    // opening and closing both route through this one state update, and a
    // stray document-level listener re-closing the menu in the same tick
    // (batched with this open) would silently net out to "nothing happened"
    // — stopping propagation here removes that whole class of race, rather
    // than relying solely on the containment check being right every time.
    e.stopPropagation();
    setMenuOpen((open) => !open);
    setDeleteArmed(false);
    cancelArmDelete();
    cancelMenuClose();
  }

  function copySpaceCode(): void {
    if (!activeSpace) return;
    if (window.chickadee?.writeClipboard) {
      void window.chickadee.writeClipboard(activeSpace.id);
    } else {
      navigator.clipboard.writeText(activeSpace.id);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleDeleteClick(): void {
    if (!activeSpace) return;
    if (deleteArmed) {
      cancelArmDelete();
      setDeleteArmed(false);
      setMenuOpen(false);
      onDeleteSpace(activeSpace.id);
    } else {
      setDeleteArmed(true);
      armDelete(4000);
    }
  }

  return (
    <div
      ref={containerRef}
      className="sidebar__space-header-container"
      onMouseLeave={() => { if (menuOpen) armMenuClose(3000); }}
      onMouseEnter={cancelMenuClose}
    >
      <div className={`sidebar__space-header${safeBanner ? ' sidebar__space-header--banner' : ''}${hideSpaceBanner ? ' sidebar__space-header--minimal' : ''}${menuOpen ? ' sidebar__space-header--open' : ''}`}>
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
              ref={(el) => { if (el?.complete && el.naturalWidth > 0 && !bannerLoaded) setBannerLoaded(true); }}
              src={safeBanner}
              alt=""
              decoding="async"
              className={`sidebar__space-header-banner-img${bannerLoaded ? ' sidebar__space-header-banner-img--loaded' : ''}`}
              onLoad={() => setBannerLoaded(true)}
            />
            <div className="sidebar__space-header-scrim" />
          </>
        )}

        <div className="space-header__menu">
          {menuOpen && activeSpace && (
            <div className="space-header__actions">
              <button
                className={`icon-btn icon-btn--sm icon-btn--danger space-header__delete-btn${deleteArmed ? ' space-header__delete-btn--armed' : ''}`}
                onClick={handleDeleteClick}
                title={isOwned ? 'Delete Space' : 'Leave Space'}
              >
                {deleteArmed ? (
                  <>
                    <AlertTriangle size={12} />
                    <span>{isOwned ? 'Confirm delete?' : 'Confirm leave?'}</span>
                  </>
                ) : isOwned ? (
                  <Trash2 size={12} />
                ) : (
                  <LogOut size={12} />
                )}
              </button>
              {canLockSpace && onToggleSpaceLock && (
                <button
                  className={`icon-btn icon-btn--sm${spaceLocked ? ' space-header__lock-btn--locked' : ''}`}
                  onClick={() => onToggleSpaceLock(!spaceLocked)}
                  title={spaceLocked ? 'Unlock Space' : 'Lock Space'}
                >
                  {spaceLocked ? <Lock size={12} /> : <LockOpen size={12} />}
                </button>
              )}
              <button
                className="icon-btn icon-btn--sm"
                onClick={copySpaceCode}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                title="Copy Space Code"
              >
                {copied ? <Check size={12} style={{ color: 'var(--green)' }} /> : <Copy size={12} />}
              </button>
              <button
                className="icon-btn icon-btn--sm"
                onClick={() => {
                  onSpaceSettings(activeSpace.id);
                  setMenuOpen(false);
                }}
                title="Space Settings"
              >
                <Settings size={12} />
              </button>
            </div>
          )}
          <button
            className="icon-btn space-header__menu-btn"
            onClick={toggleMenu}
            title={menuOpen ? 'Close menu' : 'Space menu'}
          >
            {menuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>

        <div className="space-info-wrap">
          <span className={`space-header__name${!activeSpace ? ' space-header__name--empty' : ''}`}>
            {copied ? (
              <span className="space-header__name--code" style={{ color: 'var(--green)' }}>copied</span>
            ) : hovered && typedCode ? (
              <span className="space-header__name--code">{typedCode}</span>
            ) : (
              activeSpace?.name ?? 'Create / Join Space'
            )}
          </span>
        </div>
      </div>

      <div className={`space-manage-panel${menuOpen ? ' space-manage-panel--open' : ''}`}>
        <div className="space-manage-panel__inner">
          <div className="space-manage-panel__card">
            {otherSpaces.length > 0 && (
              <div className="space-manage-panel__list">
                {otherSpaces.map((s) => (
                  <button
                    key={s.id}
                    className="menu-item"
                    onClick={() => {
                      onSelectSpace(s.id);
                      setMenuOpen(false);
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="space-manage-panel__footer">
              <button
                className="menu-item"
                onClick={() => {
                  onCreateSpace();
                  setMenuOpen(false);
                }}
              >
                <Plus size={12} />
                <span>Create Space</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  onJoinSpace();
                  setMenuOpen(false);
                }}
              >
                <Plus size={12} />
                <span>Join Space</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
