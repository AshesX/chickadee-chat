// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useControlBarMenus } from './useControlBarMenus';

const rect = {} as DOMRect;

describe('useControlBarMenus', () => {
  it('starts with every menu closed and no anchors', () => {
    const { result } = renderHook(() => useControlBarMenus());
    const m = result.current;
    expect(m.inputMenuOpen).toBe(false);
    expect(m.outputMenuOpen).toBe(false);
    expect(m.inputModeMenuOpen).toBe(false);
    expect(m.videoMenuOpen).toBe(false);
    expect(m.reactionMenuOpen).toBe(false);
    expect(m.inputMenuAnchor).toBeNull();
  });

  it('opening a menu sets its anchor and opens only it', () => {
    const { result } = renderHook(() => useControlBarMenus());
    act(() => result.current.openInputMenu(rect));
    expect(result.current.inputMenuOpen).toBe(true);
    expect(result.current.inputMenuAnchor).toBe(rect);
    expect(result.current.outputMenuOpen).toBe(false);
    expect(result.current.videoMenuOpen).toBe(false);
    expect(result.current.reactionMenuOpen).toBe(false);
  });

  it('opening another menu closes the previous one (mutual exclusion)', () => {
    const { result } = renderHook(() => useControlBarMenus());
    act(() => result.current.openInputMenu(rect));
    act(() => result.current.openOutputMenu(rect));
    expect(result.current.inputMenuOpen).toBe(false);
    expect(result.current.outputMenuOpen).toBe(true);
  });

  it('closeInputMenu closes the input menu', () => {
    const { result } = renderHook(() => useControlBarMenus());
    act(() => result.current.openInputMenu(rect));
    act(() => result.current.closeInputMenu());
    expect(result.current.inputMenuOpen).toBe(false);
  });

  describe('reaction popover auto-close', () => {
    afterEach(() => vi.useRealTimers());

    it('closes after the 3s default grace', () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useControlBarMenus());
      act(() => result.current.openReactionMenu(rect));
      act(() => result.current.startReactionCloseTimeout());
      act(() => vi.advanceTimersByTime(2999));
      expect(result.current.reactionMenuOpen).toBe(true);
      act(() => vi.advanceTimersByTime(1));
      expect(result.current.reactionMenuOpen).toBe(false);
    });

    it('cancelReactionCloseTimeout keeps it open', () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useControlBarMenus());
      act(() => result.current.openReactionMenu(rect));
      act(() => result.current.startReactionCloseTimeout());
      act(() => result.current.cancelReactionCloseTimeout());
      act(() => vi.advanceTimersByTime(5000));
      expect(result.current.reactionMenuOpen).toBe(true);
    });

    it('hovering the popover shortens the next grace to 1s', () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useControlBarMenus());
      act(() => result.current.openReactionMenu(rect));
      act(() => result.current.handleReactionPopoverEnter());
      act(() => result.current.startReactionCloseTimeout());
      act(() => vi.advanceTimersByTime(1000));
      expect(result.current.reactionMenuOpen).toBe(false);
    });
  });
});
