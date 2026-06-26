// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpaceJoin } from './useSpaceJoin';
import type { AddSpaceResult } from './useSpaces';

let addSpace: ReturnType<typeof vi.fn<(
  val: string,
  type: 'create' | 'join',
  customSignalingUrl?: string,
  joinSecret?: string,
) => Promise<AddSpaceResult>>>;

beforeEach(() => {
  addSpace = vi.fn(async () => ({ ok: true }) as AddSpaceResult);
});

describe('useSpaceJoin', () => {
  it('openCreateSpace opens the modal and resets the advanced fields', () => {
    const { result } = renderHook(() => useSpaceJoin(addSpace));
    act(() => {
      result.current.setCustomSignalingUrl('ws://x');
      result.current.setJoinSecret('shh');
      result.current.setAdvancedOpen(true);
    });
    act(() => result.current.openCreateSpace());
    expect(result.current.createSpaceOpen).toBe(true);
    expect(result.current.advancedOpen).toBe(false);
    expect(result.current.customSignalingUrl).toBe('');
    expect(result.current.joinSecret).toBe('');
  });

  it('submitCreateSpace no-ops on an empty name', () => {
    const { result } = renderHook(() => useSpaceJoin(addSpace));
    act(() => result.current.submitCreateSpace());
    expect(addSpace).not.toHaveBeenCalled();
  });

  it('submitCreateSpace creates, resets the name, and closes', () => {
    const { result } = renderHook(() => useSpaceJoin(addSpace));
    act(() => result.current.setNewSpaceName('My Space'));
    act(() => result.current.submitCreateSpace());
    expect(addSpace).toHaveBeenCalledWith('My Space', 'create', undefined, undefined);
    expect(result.current.newSpaceName).toBe('');
    expect(result.current.createSpaceOpen).toBe(false);
  });

  it('submitJoinSpace no-ops on an empty code', async () => {
    const { result } = renderHook(() => useSpaceJoin(addSpace));
    await act(async () => { await result.current.submitJoinSpace(); });
    expect(addSpace).not.toHaveBeenCalled();
  });

  it('submitJoinSpace clears + closes on success', async () => {
    const { result } = renderHook(() => useSpaceJoin(addSpace));
    act(() => { result.current.openJoinSpace(); result.current.setInviteCodeInput('my-code'); });
    await act(async () => { await result.current.submitJoinSpace(); });
    expect(addSpace).toHaveBeenCalledWith('my-code', 'join', undefined, undefined);
    expect(result.current.inviteCodeInput).toBe('');
    expect(result.current.joinSpaceOpen).toBe(false);
    expect(result.current.joinError).toBeNull();
  });

  it('submitJoinSpace surfaces the not-found message and stays open', async () => {
    addSpace.mockResolvedValueOnce({ ok: false, reason: 'not-found' });
    const { result } = renderHook(() => useSpaceJoin(addSpace));
    act(() => { result.current.openJoinSpace(); result.current.setInviteCodeInput('bad-code'); });
    await act(async () => { await result.current.submitJoinSpace(); });
    expect(result.current.joinError).toBe('That Space does not exist (or no one is currently in it).');
    expect(result.current.joinSpaceOpen).toBe(true);
    expect(result.current.inviteCodeInput).toBe('bad-code');
  });

  it('submitJoinSpace surfaces the unreachable message', async () => {
    addSpace.mockResolvedValueOnce({ ok: false, reason: 'unreachable' });
    const { result } = renderHook(() => useSpaceJoin(addSpace));
    act(() => { result.current.openJoinSpace(); result.current.setInviteCodeInput('any-code'); });
    await act(async () => { await result.current.submitJoinSpace(); });
    expect(result.current.joinError).toBe("Couldn't reach the signaling server — check your connection.");
  });
});
