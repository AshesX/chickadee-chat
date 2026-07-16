import { useEffect, useMemo, useState } from 'react';
import type { Peer, SoundboardLibraryClip } from '@chickadee/shared';
import { ChevronMenu } from './ChevronMenu';
import { PRESET_CLIPS } from '../lib/soundboardAssets';
import type { SoundboardClipSource } from '../lib/soundboardPlayer';

interface SoundboardPopoverProps {
  ownClips: SoundboardLibraryClip[];
  peers: Peer[];
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
 * app) + your own custom clips (playable immediately — you made them) + other
 * peers' custom clips (dimmed/no-op until this device has actually synced
 * their bytes — background P2P sync isn't wired up yet, so these currently
 * always show as not-yet-available; once it lands, this same cache.has()
 * check will start lighting tiles up as sync completes, no changes needed here).
 */
export function SoundboardPopover({ ownClips, peers, onTrigger, onClose, anchorRect }: SoundboardPopoverProps): React.JSX.Element {
  const peerCustomClips = useMemo(() => collectPeerCustomClips(peers), [peers]);
  const [availableHashes, setAvailableHashes] = useState<Set<string>>(new Set());

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

  const hasAnyClips = PRESET_CLIPS.length > 0 || ownClips.length > 0 || peerCustomClips.length > 0;

  return (
    <ChevronMenu anchorRect={anchorRect} onClose={onClose} className="soundboard-pop menu-surface menu-surface--frosted">
      {!hasAnyClips && <div className="soundboard-pop__empty">No sounds yet — add some in Settings.</div>}

      {PRESET_CLIPS.length > 0 && (
        <>
          <div className="soundboard-pop__section-label">Presets</div>
          <div className="soundboard-pop__grid">
            {PRESET_CLIPS.map((clip) => (
              <button
                key={clip.id}
                className="soundboard-pop__tile"
                title={clip.name}
                onClick={() => onTrigger('preset', clip.id)}
              >
                {clip.name}
              </button>
            ))}
          </div>
        </>
      )}

      {ownClips.length > 0 && (
        <>
          <div className="soundboard-pop__section-label">My Sounds</div>
          <div className="soundboard-pop__grid">
            {ownClips.map((clip) => (
              <button
                key={clip.hash}
                className="soundboard-pop__tile"
                title={clip.name}
                onClick={() => onTrigger('custom', clip.hash)}
              >
                {clip.name}
              </button>
            ))}
          </div>
        </>
      )}

      {peerCustomClips.length > 0 && (
        <>
          <div className="soundboard-pop__section-label">Others&apos; Sounds</div>
          <div className="soundboard-pop__grid">
            {peerCustomClips.map((clip) => {
              const available = availableHashes.has(clip.hash);
              return (
                <button
                  key={clip.hash}
                  className={`soundboard-pop__tile${available ? '' : ' soundboard-pop__tile--unavailable'}`}
                  title={available ? clip.name : `${clip.name} — syncing…`}
                  disabled={!available}
                  onClick={() => onTrigger('custom', clip.hash)}
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
