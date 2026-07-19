import { describe, expect, it } from 'vitest';
import { acceleratorToInputCode, acceleratorToKeyCode, hotkeyKeyDown, hotkeyKeyUp } from './hotkeyLogic';

const keymap = { F13: 100, ArrowUp: 57416, Space: 57 } as Record<string, number>;

describe('acceleratorToKeyCode', () => {
  it('maps arrow accelerators through their uiohook Arrow* names', () => {
    expect(acceleratorToKeyCode('Up', keymap)).toBe(57416);
  });

  it('maps named keys directly and unknown keys to null', () => {
    expect(acceleratorToKeyCode('F13', keymap)).toBe(100);
    expect(acceleratorToKeyCode('NoSuchKey', keymap)).toBeNull();
  });
});

describe('acceleratorToInputCode', () => {
  it('maps letters, digits, and arrows to KeyboardEvent codes', () => {
    expect(acceleratorToInputCode('V')).toBe('KeyV');
    expect(acceleratorToInputCode('3')).toBe('Digit3');
    expect(acceleratorToInputCode('Left')).toBe('ArrowLeft');
  });

  it('passes named keys through as-is', () => {
    expect(acceleratorToInputCode('F13')).toBe('F13');
    expect(acceleratorToInputCode('Space')).toBe('Space');
  });
});

describe('hotkey edges', () => {
  const holdHk = { mode: 'hold' as const, isHeld: false, onStart: 'start', onToggle: 'toggle', onStop: 'stop' };
  const toggleHk = { mode: 'toggle' as const, isHeld: false, onStart: 'start', onToggle: 'toggle', onStop: 'stop' };

  it('hold mode: down emits start, up emits stop', () => {
    const down = hotkeyKeyDown(holdHk);
    expect(down).toEqual({ emit: 'start', isHeld: true });
    expect(hotkeyKeyUp({ ...holdHk, isHeld: true })).toEqual({ emit: 'stop', isHeld: false });
  });

  it('toggle mode: down emits toggle, up emits nothing', () => {
    expect(hotkeyKeyDown(toggleHk)).toEqual({ emit: 'toggle', isHeld: true });
    expect(hotkeyKeyUp({ ...toggleHk, isHeld: true })).toEqual({ emit: null, isHeld: false });
  });

  it('swallows OS key-repeat (down while already held) and stray key-ups', () => {
    expect(hotkeyKeyDown({ ...holdHk, isHeld: true })).toEqual({ emit: null, isHeld: true });
    expect(hotkeyKeyUp(holdHk)).toEqual({ emit: null, isHeld: false });
  });

  it('a hold-mode hotkey without onStart falls back to onToggle on key-down', () => {
    expect(hotkeyKeyDown({ mode: 'hold', isHeld: false, onToggle: 'toggle' }).emit).toBe('toggle');
  });
});
