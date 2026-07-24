import { useEffect, useState } from 'react';
import { AlertTriangle, GripVertical, Play } from 'lucide-react';
import type { SoundboardCategory, SoundboardLibraryClip, SoundboardStats } from '@chickadee/shared';
import { canShareCategory } from '@chickadee/shared';
import { useDismissTimeout } from '../../hooks/useDismissTimeout';
import { playClip } from '../../lib/soundboardPlayer';

/** Sentinel dropKey for the Uncategorized zone — distinct from any real category id (a randomUUID). */
const UNCATEGORIZED_KEY = 'uncategorized';

interface DragStart {
  hash: string;
  x: number;
  y: number;
}

interface DragTarget {
  categoryId: string | null;
  beforeHash: string | null;
  /** What to compare against for highlighting — a clip hash (row-precise) or a zone key. */
  highlightKey: string;
}

/**
 * Hit-test the element under (x, y) against the data attributes ClipDropZone
 * (data-soundboard-category) and ClipRow (data-soundboard-hash) render, to
 * resolve what a drop at this position would do. Landing on a row inserts
 * before it (within that row's own zone); landing on a zone's empty space
 * appends to its end; landing outside any zone is not a valid drop.
 */
function resolveDropTarget(x: number, y: number, draggingHash: string): DragTarget | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;

  const rowEl = el.closest<HTMLElement>('[data-soundboard-hash]');
  if (rowEl) {
    const hash = rowEl.dataset.soundboardHash!;
    // Hovering (or releasing without ever moving — the initial apply() call
    // below fires at the pointerdown position, which IS the dragged row's own
    // grip) over the row being dragged is a no-op, not "append to end of my
    // own category": without this, a plain click on the grip — no movement
    // at all — silently bumped that clip to the bottom of its list.
    if (hash === draggingHash) return null;
    const zoneEl = rowEl.closest<HTMLElement>('[data-soundboard-category]');
    const rawCategory = zoneEl?.dataset.soundboardCategory ?? UNCATEGORIZED_KEY;
    const categoryId = rawCategory === UNCATEGORIZED_KEY ? null : rawCategory;
    return { categoryId, beforeHash: hash, highlightKey: hash };
  }

  const zoneEl = el.closest<HTMLElement>('[data-soundboard-category]');
  if (zoneEl) {
    const rawCategory = zoneEl.dataset.soundboardCategory ?? UNCATEGORIZED_KEY;
    const categoryId = rawCategory === UNCATEGORIZED_KEY ? null : rawCategory;
    return { categoryId, beforeHash: null, highlightKey: rawCategory };
  }

  return null;
}

interface SoundboardManagerProps {
  clips: SoundboardLibraryClip[];
  categories: SoundboardCategory[];
  stats: SoundboardStats;
  disabled: boolean;
  soundboardVolume: number;
  onRemoveClip: (hash: string) => void;
  onCreateCategory: (name: string) => void;
  onRenameCategory: (id: string, name: string) => void;
  onDeleteCategory: (id: string) => void;
  onSetCategoryShared: (id: string, shared: boolean) => void;
  onMoveClip: (hash: string, categoryId: string | null, beforeHash: string | null) => void;
  onRenameClip: (hash: string, name: string) => void;
}

function clipsInCategory(clips: SoundboardLibraryClip[], categoryId: string | null): SoundboardLibraryClip[] {
  return clips.filter((c) => c.categoryId === categoryId);
}

/** Why sharing `categoryId` is currently blocked, or null if it's allowed — mirrors the main-process guard exactly (@chickadee/shared's canShareCategory) so the UI can never disagree with the enforced result. */
function blockedShareReason(clips: SoundboardLibraryClip[], categories: SoundboardCategory[], categoryId: string): string | null {
  const check = canShareCategory(clips, categories, categoryId);
  if (check.ok) return null;
  return check.reason === 'too-many-shared-categories'
    ? 'You can already share 2 categories — unshare one first.'
    : 'Sharing this would exceed the 12-clip active limit.';
}

/**
 * The "sounds manager" in Settings → Soundboard: a lightweight category
 * organizer over the user's local clip library (up to 48 clips). Sharing is
 * whole-category (one Share/Unshare toggle per category, capped at 2 shared
 * categories / 12 active clips total — see @chickadee/shared's soundboard.ts)
 * — there's no per-clip enable switch.
 *
 * Clips move between categories, and reorder within one, via a CUSTOM
 * pointer-events drag (deliberately NOT native HTML5 drag-and-drop, which was
 * tried first and rejected: on Windows it invokes real OS drag-drop
 * machinery, which composites its own cursor decorations — a "no-drop" badge
 * that flickers over any pixel lacking a preventDefault'd dragover handler,
 * plus (with no custom drag image) a generic placeholder box — neither
 * controllable from the page, since they're drawn by the OS compositor
 * outside the window's own content, not fixable via dataTransfer/CSS). This
 * implementation instead starts on the grip's pointerdown, tracks the
 * pointer via window-level pointermove/up listeners (rAF-throttled), hit-
 * tests drop targets with `elementFromPoint` against the `data-soundboard-*`
 * attributes below, renders its own small fixed-position ghost (just the
 * grip icon, pointer-events:none so it doesn't shadow the hit-test), and
 * forces a `grabbing` cursor via a body class — full control, no native
 * drag-drop cursor artifacts of any kind.
 */
export function SoundboardManager({
  clips,
  categories,
  stats,
  disabled,
  soundboardVolume,
  onRemoveClip,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
  onSetCategoryShared,
  onMoveClip,
  onRenameClip,
}: SoundboardManagerProps): React.JSX.Element {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [dragStart, setDragStart] = useState<DragStart | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const uncategorized = clipsInCategory(clips, null);
  const draggingHash = dragStart?.hash ?? null;

  function handleCreate(): void {
    const name = newCategoryName.trim();
    if (!name) return;
    onCreateCategory(name);
    setNewCategoryName('');
  }

  function handleGripPointerDown(hash: string, e: React.PointerEvent): void {
    if (disabled || e.button !== 0) return;
    e.preventDefault(); // no native drag, no text selection
    setDragStart({ hash, x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    if (!dragStart) return;
    let target: { categoryId: string | null; beforeHash: string | null } | null = null;
    let rafId: number | null = null;
    let pending: { x: number; y: number } | null = null;

    function apply(x: number, y: number): void {
      const resolved = resolveDropTarget(x, y, dragStart!.hash);
      target = resolved ? { categoryId: resolved.categoryId, beforeHash: resolved.beforeHash } : null;
      setDragOverKey(resolved?.highlightKey ?? null);
      setDragPos({ x, y });
    }

    function onMove(e: PointerEvent): void {
      pending = { x: e.clientX, y: e.clientY };
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (pending) apply(pending.x, pending.y);
      });
    }

    function finish(): void {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (target) onMoveClip(dragStart!.hash, target.categoryId, target.beforeHash);
      setDragStart(null);
      setDragPos(null);
      setDragOverKey(null);
    }

    apply(dragStart.x, dragStart.y);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    document.body.classList.add('soundboard-manager-dragging');
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      document.body.classList.remove('soundboard-manager-dragging');
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // dragStart is only ever set once per gesture (a fresh object at pointerdown,
    // null at drag end) so it's a stable effect-identity, not a per-frame dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragStart, onMoveClip]);

  const dragContext = { draggingHash, dragOverKey, onGripPointerDown: handleGripPointerDown };

  return (
    <div className="soundboard-manager">
      <p className="hint">
        <strong className="soundboard-manager__stat">{stats.activeClipCount}/12</strong> active clips across{' '}
        <strong className="soundboard-manager__stat">{stats.sharedCategoryCount}/2</strong> shared categories (
        <strong className="soundboard-manager__stat">{clips.length}/48</strong> total clips)
      </p>

      <div className="mod-row">
        <input
          className="input mod-row__select"
          placeholder="New category name"
          value={newCategoryName}
          disabled={disabled}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
          }}
        />
        <button className="seg-btn" disabled={disabled || !newCategoryName.trim()} onClick={handleCreate}>
          Add Category
        </button>
      </div>

      {categories.map((category) => (
        <CategoryGroup
          key={category.id}
          category={category}
          clips={clipsInCategory(clips, category.id)}
          disabled={disabled}
          soundboardVolume={soundboardVolume}
          blockedReason={category.shared ? null : blockedShareReason(clips, categories, category.id)}
          onRemoveClip={onRemoveClip}
          onRenameClip={onRenameClip}
          onRenameCategory={onRenameCategory}
          onDeleteCategory={onDeleteCategory}
          onSetCategoryShared={onSetCategoryShared}
          {...dragContext}
        />
      ))}

      <div className="soundboard-manager__category">
        <div className="mod-row">
          <span className="mod-row__label">Uncategorized ({uncategorized.length})</span>
        </div>
        <ClipDropZone
          dropKey={UNCATEGORIZED_KEY}
          clips={uncategorized}
          disabled={disabled}
          soundboardVolume={soundboardVolume}
          onRemoveClip={onRemoveClip}
          onRenameClip={onRenameClip}
          {...dragContext}
        />
      </div>

      {draggingHash && dragPos && (
        <div className="soundboard-manager__drag-ghost" style={{ left: dragPos.x, top: dragPos.y }}>
          <GripVertical size={14} />
        </div>
      )}
    </div>
  );
}

interface DragContext {
  draggingHash: string | null;
  dragOverKey: string | null;
  onGripPointerDown: (hash: string, e: React.PointerEvent) => void;
}

interface CategoryGroupProps extends DragContext {
  category: SoundboardCategory;
  clips: SoundboardLibraryClip[];
  disabled: boolean;
  soundboardVolume: number;
  blockedReason: string | null;
  onRemoveClip: (hash: string) => void;
  onRenameClip: (hash: string, name: string) => void;
  onRenameCategory: (id: string, name: string) => void;
  onDeleteCategory: (id: string) => void;
  onSetCategoryShared: (id: string, shared: boolean) => void;
}

function CategoryGroup({
  category,
  clips,
  disabled,
  soundboardVolume,
  blockedReason,
  onRemoveClip,
  onRenameClip,
  onRenameCategory,
  onDeleteCategory,
  onSetCategoryShared,
  ...dragContext
}: CategoryGroupProps): React.JSX.Element {
  const [name, setName] = useState(category.name);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const { arm: armDelete, cancel: cancelArmDelete } = useDismissTimeout(() => setDeleteArmed(false));

  // Keep the local edit buffer in sync with confirmed renames (incl. this
  // device's own, once the main-process round trip lands) or another source
  // (there is none today, but this keeps the field from ever drifting stale).
  useEffect(() => {
    setName(category.name);
  }, [category.name]);

  function commitRename(): void {
    const trimmed = name.trim();
    if (trimmed && trimmed !== category.name) onRenameCategory(category.id, trimmed);
    else setName(category.name);
  }

  // Arm-then-confirm (mirrors the sidebar's Delete/Leave Space button):
  // one click grows this into a labeled danger state instead of a native
  // window.confirm(); a second click within the window (or the timeout
  // lapsing) resolves it.
  function handleDeleteClick(): void {
    if (deleteArmed) {
      cancelArmDelete();
      setDeleteArmed(false);
      onDeleteCategory(category.id);
    } else {
      setDeleteArmed(true);
      armDelete(4000);
    }
  }

  const shareBlocked = !category.shared && blockedReason !== null;

  return (
    <div className="soundboard-manager__category">
      <div className="mod-row">
        <input
          className="input mod-row__select"
          value={name}
          disabled={disabled}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <span className="hint" title={`${clips.length} clip${clips.length === 1 ? '' : 's'}`}>
          {clips.length}
        </span>
        <button
          className={`seg-btn ${category.shared ? 'seg-btn--soundboard-active' : 'seg-btn--soundboard-inactive'}`}
          disabled={disabled || shareBlocked}
          title={shareBlocked ? (blockedReason ?? undefined) : undefined}
          onClick={() => onSetCategoryShared(category.id, !category.shared)}
        >
          {category.shared ? 'Active' : 'Inactive'}
        </button>
        <button
          className={`seg-btn${deleteArmed ? ' seg-btn--armed-danger' : ''}`}
          disabled={disabled}
          title={deleteArmed ? undefined : `Delete category "${category.name}"? Its clips move to Uncategorized.`}
          onClick={handleDeleteClick}
        >
          {deleteArmed ? (
            <>
              <AlertTriangle size={12} />
              <span>Confirm delete?</span>
            </>
          ) : (
            'Delete'
          )}
        </button>
      </div>

      <ClipDropZone
        dropKey={category.id}
        clips={clips}
        disabled={disabled}
        soundboardVolume={soundboardVolume}
        onRemoveClip={onRemoveClip}
        onRenameClip={onRenameClip}
        {...dragContext}
      />
    </div>
  );
}

interface ClipDropZoneProps extends DragContext {
  /** Identifies this zone — a category id, or UNCATEGORIZED_KEY — both for dragOverKey highlighting and as the data-soundboard-category hit-test attribute. */
  dropKey: string;
  clips: SoundboardLibraryClip[];
  disabled: boolean;
  soundboardVolume: number;
  onRemoveClip: (hash: string) => void;
  onRenameClip: (hash: string, name: string) => void;
}

/** One category's (or Uncategorized's) clip list — always rendered, even empty, so it's always a valid drop target. */
function ClipDropZone({
  dropKey,
  clips,
  disabled,
  soundboardVolume,
  onRemoveClip,
  onRenameClip,
  draggingHash,
  dragOverKey,
  onGripPointerDown,
}: ClipDropZoneProps): React.JSX.Element {
  return (
    <div
      className={`mod-banlist soundboard-manager__clips${dragOverKey === dropKey ? ' soundboard-manager__clips--drop' : ''}`}
      data-soundboard-category={dropKey}
    >
      {clips.length === 0 ? (
        <p className="soundboard-manager__empty-hint">Drag sounds here</p>
      ) : (
        clips.map((clip) => (
          <ClipRow
            key={clip.hash}
            clip={clip}
            disabled={disabled}
            soundboardVolume={soundboardVolume}
            onRemoveClip={onRemoveClip}
            onRenameClip={onRenameClip}
            isDragging={draggingHash === clip.hash}
            isDragOver={dragOverKey === clip.hash}
            onGripPointerDown={onGripPointerDown}
          />
        ))
      )}
    </div>
  );
}

interface ClipRowProps {
  clip: SoundboardLibraryClip;
  disabled: boolean;
  soundboardVolume: number;
  onRemoveClip: (hash: string) => void;
  onRenameClip: (hash: string, name: string) => void;
  isDragging: boolean;
  isDragOver: boolean;
  onGripPointerDown: (hash: string, e: React.PointerEvent) => void;
}

function ClipRow({
  clip,
  disabled,
  soundboardVolume,
  onRemoveClip,
  onRenameClip,
  isDragging,
  isDragOver,
  onGripPointerDown,
}: ClipRowProps): React.JSX.Element {
  const [name, setName] = useState(clip.name);

  useEffect(() => {
    setName(clip.name);
  }, [clip.name]);

  function commitRename(): void {
    const trimmed = name.trim();
    if (trimmed && trimmed !== clip.name) onRenameClip(clip.hash, trimmed);
    else setName(clip.name);
  }

  return (
    <div
      className={`mod-row soundboard-manager__clip-row${isDragging ? ' soundboard-manager__clip-row--dragging' : ''}${isDragOver ? ' soundboard-manager__clip-row--drop' : ''}`}
      data-soundboard-hash={clip.hash}
    >
      <span
        className={`soundboard-manager__grip${disabled ? ' soundboard-manager__grip--disabled' : ''}`}
        title="Drag to reorder or move to another category"
        aria-label={`Drag ${clip.name}`}
        onPointerDown={(e) => onGripPointerDown(clip.hash, e)}
      >
        <GripVertical size={14} />
      </span>
      <input
        className="input mod-row__label"
        value={name}
        disabled={disabled}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <button
        className="icon-btn icon-btn--sm"
        title="Preview"
        aria-label={`Preview ${clip.name}`}
        disabled={disabled}
        onClick={() => void playClip(clip.hash, 'custom', soundboardVolume)}
      >
        <Play size={14} />
      </button>
      <button className="seg-btn" disabled={disabled} onClick={() => onRemoveClip(clip.hash)}>
        Remove
      </button>
    </div>
  );
}
