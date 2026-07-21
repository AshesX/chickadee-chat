import { describe, expect, it } from 'vitest';
import { parseHwndFromWindowSourceId } from './screenShareLogic';

describe('parseHwndFromWindowSourceId', () => {
  it('parses the hwnd out of a window source id', () => {
    expect(parseHwndFromWindowSourceId('window:262670:0')).toBe(262670);
    expect(parseHwndFromWindowSourceId('window:1641224:1')).toBe(1641224);
  });

  it('returns null for a screen source (no owning window)', () => {
    expect(parseHwndFromWindowSourceId('screen:0:0')).toBeNull();
  });

  it('returns null for a malformed id', () => {
    expect(parseHwndFromWindowSourceId('window:')).toBeNull();
    expect(parseHwndFromWindowSourceId('window:abc:0')).toBeNull();
    expect(parseHwndFromWindowSourceId('')).toBeNull();
  });
});
