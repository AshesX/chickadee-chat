// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedState } from './usePersistedState';

describe('usePersistedState', () => {
  it('seeds the value from read()', () => {
    const read = vi.fn(() => 'init');
    const { result } = renderHook(() => usePersistedState(read, vi.fn()));
    expect(result.current[0]).toBe('init');
    expect(read).toHaveBeenCalledTimes(1); // lazy init, once
  });

  it('apply updates state and writes through', () => {
    const write = vi.fn();
    const { result } = renderHook(() => usePersistedState(() => 1, write));
    act(() => result.current[1](42));
    expect(result.current[0]).toBe(42);
    expect(write).toHaveBeenCalledWith(42);
  });

  it('keeps a stable apply identity across renders', () => {
    const write = vi.fn();
    const { result } = renderHook(() => usePersistedState(() => 0, write));
    const apply = result.current[1];
    act(() => result.current[1](1));
    expect(result.current[1]).toBe(apply);
  });
});
