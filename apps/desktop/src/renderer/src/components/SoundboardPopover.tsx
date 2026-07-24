import { useEffect, useMemo, useState } from 'react';
import type { Peer, SoundboardCategory, SoundboardLibraryClip } from '@chickadee/shared';
import { ChevronMenu } from './ChevronMenu';
import { PRESET_CLIPS } from '../lib/soundboardAssets';
import type { SoundboardClipSource } from '../lib/soundboardPlayer';

/** Global (not per-clip) UI cooldown — mirrors ReactionPopover's spam guard so mashing any tile can't fire faster than one clip/second. */
const SOUNDBOARD_COOLDOWN_MS = 1000;

interface SoundboardPopoverProps {
  /** This user's own clips currently in a SHARED category (see useSoundboardLibrary.activeOwnClips) — inactive clips never appear here. */
  ownClips: SoundboardLibraryClip[];
  ownCategories: SoundboardCategory[];
  peers: Peer[];
  presetsEnabled: boolean;
  /** Custom clips specifically — off hides both "My Sounds" and peers' clips; presets are unaffected. */
  customEnabled: boolean;
  onTrigger: (source: SoundboardClipSource, clipId: string) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

interface PeerClip {
  hash: string;
  name: string;
}

interface PeerCategoryGroup {
  key: string;
  peerName: string;
  category: string;
  clips: PeerClip[];
}

interface OwnCategoryGroup {
  categoryId: string;
  categoryName: string;
  clips: SoundboardLibraryClip[];
}

/**
 * One section per (peer, shared category) — e.g. "Alice: Party Sounds" —
 * so a peer's clips are always attributed, never pooled anonymously.
 * Deliberately NOT deduped across peers by hash (unlike the sync layer's
 * planMissingClipFetches, which dedupes fetches to one possessor per hash
 * for bandwidth — a display-layer concern, not this one): two peers sharing
 * byte-identical audio each get their own attributed section.
 */
function collectPeerCategoryGroups(peers: Peer[]): PeerCategoryGroup[] {
  const groups: PeerCategoryGroup[] = [];
  const byKey = new Map<string, PeerCategoryGroup>();
  for (const peer of peers) {
    for (const clip of peer.soundboardClips) {
      const key = `${peer.id}:${clip.category}`;
      let group = byKey.get(key);
      if (!group) {
        group = { key, peerName: peer.displayName, category: clip.category, clips: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      group.clips.push({ hash: clip.hash, name: clip.name });
    }
  }
  return groups;
}

/** Own active clips grouped by category (for a sub-header only when spanning more than one — see render). */
function collectOwnCategoryGroups(ownClips: SoundboardLibraryClip[], categories: SoundboardCategory[]): OwnCategoryGroup[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name] as const));
  const byId = new Map<string, OwnCategoryGroup>();
  const order: string[] = [];
  for (const clip of ownClips) {
    if (clip.categoryId === null) continue;
    let group = byId.get(clip.categoryId);
    if (!group) {
      group = { categoryId: clip.categoryId, categoryName: nameById.get(clip.categoryId) ?? 'Sounds', clips: [] };
      byId.set(clip.categoryId, group);
      order.push(clip.categoryId);
    }
    group.clips.push(clip);
  }
  return order.map((id) => byId.get(id)!);
}

/**
 * The Soundboard button's popover: presets (always playable, bundled in the
 * app, gated only by `presetsEnabled`) + your own active (shared-category)
 * clips (playable immediately — you made them) + other peers' shared clips,
 * attributed by peer and category (dimmed/no-op until this device has
 * actually synced their bytes — the cache.has() check below lights tiles up
 * as sync completes). "My Sounds" and peer sections are both gated by
 * `customEnabled`, independent of `presetsEnabled`.
 */
export function SoundboardPopover({
  ownClips,
  ownCategories,
  peers,
  presetsEnabled,
  customEnabled,
  onTrigger,
  onClose,
  anchorRect,
}: SoundboardPopoverProps): React.JSX.Element {
  const peerGroups = useMemo(() => collectPeerCategoryGroups(peers), [peers]);
  const ownGroups = useMemo(() => collectOwnCategoryGroups(ownClips, ownCategories), [ownClips, ownCategories]);
  const uniquePeerHashes = useMemo(() => [...new Set(peerGroups.flatMap((g) => g.clips.map((c) => c.hash)))], [peerGroups]);
  const [availableHashes, setAvailableHashes] = useState<Set<string>>(new Set());
  const [cooldown, setCooldown] = useState(false);

  function handleTrigger(source: SoundboardClipSource, clipId: string): void {
    if (cooldown) return;
    onTrigger(source, clipId);
    setCooldown(true);
    setTimeout(() => setCooldown(false), SOUNDBOARD_COOLDOWN_MS);
  }

  useEffect(() => {
    if (!window.chickadee || uniquePeerHashes.length === 0) {
      setAvailableHashes(new Set());
      return;
    }
    let cancelled = false;
    Promise.all(uniquePeerHashes.map((h) => window.chickadee!.soundboard.cache.has(h))).then((results) => {
      if (cancelled) return;
      const next = new Set<string>();
      uniquePeerHashes.forEach((h, i) => {
        if (results[i]) next.add(h);
      });
      setAvailableHashes(next);
    });
    return () => {
      cancelled = true;
    };
  }, [uniquePeerHashes]);

  const hasAnyClips = (presetsEnabled && PRESET_CLIPS.length > 0) || (customEnabled && (ownClips.length > 0 || peerGroups.length > 0));

  return (
    <ChevronMenu anchorRect={anchorRect} onClose={onClose} className="soundboard-pop menu-surface" snapToControlBar={true}>
      {!hasAnyClips && <div className="soundboard-pop__empty">No sounds yet — add some in Settings.</div>}

      {presetsEnabled && PRESET_CLIPS.length > 0 && (
        <>
          <div className="soundboard-pop__section-label">Presets</div>
          <div className="soundboard-pop__grid">
            {PRESET_CLIPS.map((clip) => (
              <button
                key={clip.id}
                className={`soundboard-pop__tile${cooldown ? ' soundboard-pop__tile--cooldown' : ''}`}
                title={cooldown ? 'Cooldown active...' : clip.name}
                disabled={cooldown}
                onClick={() => handleTrigger('preset', clip.id)}
              >
                {clip.name}
              </button>
            ))}
          </div>
        </>
      )}

      {customEnabled && ownClips.length > 0 && (
        <>
          <div className="soundboard-pop__section-label">My Sounds</div>
          {ownGroups.length > 1 ? (
            ownGroups.map((group) => (
              <div key={group.categoryId}>
                <div className="soundboard-pop__section-label soundboard-pop__section-label--sub">{group.categoryName}</div>
                <div className="soundboard-pop__grid">
                  {group.clips.map((clip) => (
                    <button
                      key={clip.hash}
                      className={`soundboard-pop__tile${cooldown ? ' soundboard-pop__tile--cooldown' : ''}`}
                      title={cooldown ? 'Cooldown active...' : clip.name}
                      disabled={cooldown}
                      onClick={() => handleTrigger('custom', clip.hash)}
                    >
                      {clip.name}
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="soundboard-pop__grid">
              {ownClips.map((clip) => (
                <button
                  key={clip.hash}
                  className={`soundboard-pop__tile${cooldown ? ' soundboard-pop__tile--cooldown' : ''}`}
                  title={cooldown ? 'Cooldown active...' : clip.name}
                  disabled={cooldown}
                  onClick={() => handleTrigger('custom', clip.hash)}
                >
                  {clip.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {customEnabled &&
        peerGroups.map((group) => (
          <div key={group.key}>
            <div className="soundboard-pop__section-label">
              {group.peerName}: {group.category}
            </div>
            <div className="soundboard-pop__grid">
              {group.clips.map((clip) => {
                const available = availableHashes.has(clip.hash);
                const disabled = !available || cooldown;
                const title = !available ? `${clip.name} — syncing…` : cooldown ? 'Cooldown active...' : clip.name;
                return (
                  <button
                    key={clip.hash}
                    className={`soundboard-pop__tile${available ? '' : ' soundboard-pop__tile--unavailable'}${cooldown ? ' soundboard-pop__tile--cooldown' : ''}`}
                    title={title}
                    disabled={disabled}
                    onClick={() => handleTrigger('custom', clip.hash)}
                  >
                    {clip.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
    </ChevronMenu>
  );
}
