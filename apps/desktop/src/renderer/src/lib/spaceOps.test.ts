import { describe, expect, it } from 'vitest';
import { generateSpaceId, normalizeRooms, parseSpaceName } from './spaceOps';

describe('normalizeRooms', () => {
  it('maps legacy voice/video/undefined types to hybrid, preserving other fields', () => {
    const rooms = [
      { id: 'a', label: 'A', icon: 'i', type: 'voice' as const },
      { id: 'b', label: 'B', icon: 'j', type: 'video' as const },
      { id: 'c', label: 'C', icon: 'k' },
    ];
    expect(normalizeRooms(rooms)).toEqual([
      { id: 'a', label: 'A', icon: 'i', type: 'hybrid' },
      { id: 'b', label: 'B', icon: 'j', type: 'hybrid' },
      { id: 'c', label: 'C', icon: 'k', type: 'hybrid' },
    ]);
  });
});

describe('generateSpaceId', () => {
  it('slugifies the name and appends a 5-char suffix', () => {
    expect(generateSpaceId('Midnight Lounge!!')).toMatch(/^midnight-lounge-[a-z0-9]{1,5}$/);
  });

  it('falls back to "space" for names with no usable characters', () => {
    expect(generateSpaceId('!!!')).toMatch(/^space-[a-z0-9]{1,5}$/);
  });

  it('strips leading/trailing separators (whitespace included)', () => {
    expect(generateSpaceId('  My Space  ')).toMatch(/^my-space-[a-z0-9]{1,5}$/);
  });
});

describe('parseSpaceName', () => {
  it('title-cases the code words, dropping the random suffix', () => {
    expect(parseSpaceName('midnight-lounge-7f8a3')).toBe('Midnight Lounge');
  });

  it('falls back for codes without a name part', () => {
    expect(parseSpaceName('7f8a3')).toBe('Joined Space');
  });
});
