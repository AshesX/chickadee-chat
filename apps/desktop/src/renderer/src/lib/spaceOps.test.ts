import { describe, expect, it } from 'vitest';
import { generateSpaceId, parseSpaceName } from './spaceOps';

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
