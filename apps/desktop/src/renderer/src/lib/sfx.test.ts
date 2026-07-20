import { describe, expect, it } from 'vitest';
import { CUSTOM_SFX_SLOTS } from '@chickadee/shared';
import { CUE_TO_SLOT, SFX_SLOTS, type SfxType } from './sfx';

// Every cue the app can play, kept in sync with SfxType by hand (there's no
// runtime array to derive it from) — this is the regression guard for a
// future cue addition that forgets to add itself to SFX_SLOTS.
const ALL_SFX_TYPES: SfxType[] = [
  'join', 'leave', 'mute', 'unmute', 'mute-other', 'chat', 'deafen', 'undeafen',
  'transmit-open', 'transmit-close', 'ptt-blocked', 'kicked', 'locked', 'unlocked',
  'ownership', 'spotlight-claim', 'spotlight-lose', 'screen-share-start',
  'screen-share-stop', 'transfer-done', 'transfer-failed', 'connection-warn',
  'connection-lost', 'connection-restored',
];

describe('SFX_SLOTS', () => {
  it('has an entry for every customizable slot, and no others', () => {
    expect(Object.keys(SFX_SLOTS).sort()).toEqual([...CUSTOM_SFX_SLOTS].sort());
  });

  it('covers every SfxType exactly once across all slots', () => {
    const all = Object.values(SFX_SLOTS).flat();
    expect(all.sort()).toEqual([...ALL_SFX_TYPES].sort());
    expect(new Set(all).size).toBe(all.length); // no duplicates
  });
});

describe('CUE_TO_SLOT', () => {
  it('is the exact inverse of SFX_SLOTS', () => {
    for (const [slot, cues] of Object.entries(SFX_SLOTS)) {
      for (const cue of cues) {
        expect(CUE_TO_SLOT[cue]).toBe(slot);
      }
    }
  });

  it('has an entry for every SfxType', () => {
    for (const type of ALL_SFX_TYPES) {
      expect(CUE_TO_SLOT[type]).toBeDefined();
    }
  });
});
