import { useEffect, useMemo, useState } from 'react';
import type { Peer, SoundboardLibraryClip } from '@chickadee/shared';
import { ChevronMenu } from './ChevronMenu';
import { PRESET_CLIPS } from '../lib/soundboardAssets';
import type { SoundboardClipSource } from '../lib/soundboardPlayer';

/** Global (not per-clip) UI cooldown — mirrors ReactionPopover's spam guard so mashing any tile can't fire faster than one clip/second. */
const SOUNDBOARD_COOLDOWN_MS = 1000;

interface SoundboardPopoverProps {
  ownClips: SoundboardLibraryClip[];
  peers: Peer[];
  presetsEnabled: boolean;
  /** Custom clips specifically — off hides both "My Sounds" and "Others' Sounds"; presets are unaffected. */
  customEnabled: boolean;
  onTrigger: (source: SoundboardClipSource, clipId: string) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

interface PeerCustomClip {
  hash: string;
  name: string;
}

/** Peer-advertised custom clips, deduped by hash (same clip shared by two peers shows once). */
function collectPeerCustomClips(peers: Peer[]): PeerCustomClip[] {
  const byHash = new Map<string, PeerCustomClip>();
  for (const peer of peers) {
    for (const clip of peer.soundboardClips) {
      if (!byHash.has(clip.hash)) byHash.set(clip.hash, { hash: clip.hash, name: clip.name });
    }
  }
  return [...byHash.values()];
}

/**
 * The Soundboard button's popover: presets (always playable, bundled in the
 * app, gated only by `presetsEnabled`) + your own custom clips (playable
 * immediately — you made them) + other peers' custom clips (dimmed/no-op
 * until this device has actually synced their bytes — the cache.has() check
 * below lights tiles up as sync completes). "My Sounds" and "Others' Sounds"
 * are both gated by `customEnabled`, independent of `presetsEnabled`.
 */
export function SoundboardPopover({ ownClips, peers, presetsEnabled, customEnabled, onTrigger, onClose, anchorRect }: SoundboardPopoverProps): React.JSX.Element {
  const peerCustomClips = useMemo(() => collectPeerCustomClips(peers), [peers]);
  const [availableHashes, setAvailableHashes] = useState<Set<string>>(new Set());
  const [cooldown, setCooldown] = useState(false);

  function handleTrigger(source: SoundboardClipSource, clipId: string): void {
    if (cooldown) return;
    onTrigger(source, clipId);
    setCooldown(true);
    setTimeout(() => setCooldown(false), SOUNDBOARD_COOLDOWN_MS);
  }

  useEffect(() => {
    if (!window.chickadee || peerCustomClips.length === 0) {
      setAvailableHashes(new Set());
      return;
    }
    let cancelled = false;
    Promise.all(peerCustomClips.map((c) => window.chickadee!.soundboard.cache.has(c.hash))).then((results) => {
      if (cancelled) return;
      const next = new Set<string>();
      peerCustomClips.forEach((c, i) => {
        if (results[i]) next.add(c.hash);
      });
      setAvailableHashes(next);
    });
    return () => {
      cancelled = true;
    };
  }, [peerCustomClips]);

  const hasAnyClips = (presetsEnabled && PRESET_CLIPS.length > 0) || (customEnabled && (ownClips.length > 0 || peerCustomClips.length > 0));

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
        </>
      )}

      {customEnabled && peerCustomClips.length > 0 && (
        <>
          <div className="soundboard-pop__section-label">Others&apos; Sounds</div>
          <div className="soundboard-pop__grid">
            {peerCustomClips.map((clip) => {
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
        </>
      )}
    </ChevronMenu>
  );
}
