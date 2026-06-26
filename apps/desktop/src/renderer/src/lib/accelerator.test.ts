import { describe, it, expect } from 'vitest';
import type { KeyboardEvent } from 'react';
import { toAccelerator } from './accelerator';

// toAccelerator only reads `e.key`, so a bare `{ key }` is a sufficient mock.
const acc = (key: string): string | null => toAccelerator({ key } as KeyboardEvent);

describe('toAccelerator', () => {
  it('maps space to "Space"', () => {
    expect(acc(' ')).toBe('Space');
    expect(acc('Spacebar')).toBe('Space');
  });

  it('passes through function keys F1–F24 and rejects out-of-range', () => {
    expect(acc('F1')).toBe('F1');
    expect(acc('F12')).toBe('F12');
    expect(acc('F24')).toBe('F24');
    expect(acc('F25')).toBeNull();
  });

  it('upper-cases single alphanumeric keys', () => {
    expect(acc('a')).toBe('A');
    expect(acc('Z')).toBe('Z');
    expect(acc('5')).toBe('5');
  });

  it('maps arrow keys to short names', () => {
    expect(acc('ArrowUp')).toBe('Up');
    expect(acc('ArrowDown')).toBe('Down');
    expect(acc('ArrowLeft')).toBe('Left');
    expect(acc('ArrowRight')).toBe('Right');
  });

  it('passes through named navigation keys and CapsLock', () => {
    expect(acc('Tab')).toBe('Tab');
    expect(acc('Insert')).toBe('Insert');
    expect(acc('Delete')).toBe('Delete');
    expect(acc('Home')).toBe('Home');
    expect(acc('End')).toBe('End');
    expect(acc('CapsLock')).toBe('CapsLock');
  });

  it('rejects lone modifiers and unsupported keys', () => {
    expect(acc('Shift')).toBeNull();
    expect(acc('Control')).toBeNull();
    expect(acc('Alt')).toBeNull();
    expect(acc('Escape')).toBeNull();
  });
});
