import { describe, expect, it } from 'vitest';
import { SETTINGS_SEARCH_INDEX, SUBSECTIONS, getSearchResults } from './searchIndex';

describe('getSearchResults', () => {
  it('returns nothing for empty/whitespace queries', () => {
    expect(getSearchResults('')).toEqual([]);
    expect(getSearchResults('   ')).toEqual([]);
  });

  it('matches on label, case-insensitively', () => {
    const results = getSearchResults('AVATAR');
    expect(results.some((r) => r.label === 'Avatar')).toBe(true);
  });

  it('matches on keywords (e.g. slang not in the label)', () => {
    expect(getSearchResults('pfp').some((r) => r.label === 'Avatar')).toBe(true);
    expect(getSearchResults('ptt').some((r) => r.label === 'Input Mode')).toBe(true);
  });

  it('matches on description text', () => {
    expect(getSearchResults('windows boots').some((r) => r.label === 'Launch on Startup')).toBe(true);
  });

  it('caps the result list at 6', () => {
    expect(getSearchResults('e').length).toBeLessThanOrEqual(6);
  });
});

describe('search index integrity', () => {
  it('every entry with a sectionId points at a real sidebar subsection', () => {
    for (const entry of SETTINGS_SEARCH_INDEX) {
      if (!entry.sectionId) continue;
      const sections = SUBSECTIONS[entry.tab] ?? [];
      expect(
        sections.some((s) => s.id === entry.sectionId),
        `${entry.label} → ${entry.tab}/${entry.sectionId}`,
      ).toBe(true);
    }
  });
});
