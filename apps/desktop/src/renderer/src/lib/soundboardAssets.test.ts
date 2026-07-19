import { describe, expect, it } from 'vitest';
import { PRESET_CLIPS, getPresetUrl, prettifyName } from './soundboardAssets';

describe('prettifyName', () => {
  it('title-cases kebab- and snake_case ids', () => {
    expect(prettifyName('air-horn')).toBe('Air Horn');
    expect(prettifyName('sad_trombone')).toBe('Sad Trombone');
  });

  it('handles a single word', () => {
    expect(prettifyName('beep')).toBe('Beep');
  });

  it('falls back to a generic name for an empty/symbol-only id', () => {
    expect(prettifyName('')).toBe('Sound');
    expect(prettifyName('---')).toBe('Sound');
  });
});

describe('PRESET_CLIPS (bundled assets/soundboard-presets/*.mp3 via import.meta.glob)', () => {
  it('discovers the preset clips with resolved URLs, sorted by name', () => {
    const ids = PRESET_CLIPS.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining(['air-horn', 'buzzer', 'crickets', 'fart', 'sad-violin', 'trombone']),
    );
    for (const clip of PRESET_CLIPS) {
      expect(typeof clip.url).toBe('string');
      expect(clip.url.length).toBeGreaterThan(0);
    }
    const names = PRESET_CLIPS.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('getPresetUrl resolves a known id and returns undefined for an unknown one', () => {
    expect(getPresetUrl('air-horn')).toBe(PRESET_CLIPS.find((c) => c.id === 'air-horn')?.url);
    expect(getPresetUrl('does-not-exist')).toBeUndefined();
  });
});
