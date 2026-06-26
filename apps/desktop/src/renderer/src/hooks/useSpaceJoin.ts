import { useCallback, useState } from 'react';
import type { AddSpaceResult } from './useSpaces';

/**
 * Owns the Create-a-Space and Join-a-Space modal state (name/invite inputs, the
 * advanced connection fields, and the join in-flight/error flags) plus the submit
 * flows. `addSpace` is threaded in from `useSpaces`.
 */
export function useSpaceJoin(
  addSpace: (
    code: string,
    action: 'create' | 'join',
    customSignalingUrl?: string,
    joinSecret?: string,
  ) => Promise<AddSpaceResult>,
) {
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [joinSpaceOpen, setJoinSpaceOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [joinChecking, setJoinChecking] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customSignalingUrl, setCustomSignalingUrl] = useState('');
  const [joinSecret, setJoinSecret] = useState('');

  const openCreateSpace = useCallback(() => {
    setCreateSpaceOpen(true);
    setAdvancedOpen(false);
    setCustomSignalingUrl('');
    setJoinSecret('');
  }, []);

  const openJoinSpace = useCallback(() => {
    setJoinSpaceOpen(true);
    setAdvancedOpen(false);
    setCustomSignalingUrl('');
    setJoinSecret('');
  }, []);

  const closeCreateSpace = useCallback(() => setCreateSpaceOpen(false), []);
  const closeJoinSpace = useCallback(() => { setJoinSpaceOpen(false); setJoinError(null); }, []);

  /** Create-a-Space submit (button + Enter). No-ops on an empty name. */
  const submitCreateSpace = useCallback(() => {
    if (!newSpaceName.trim()) return;
    void addSpace(newSpaceName, 'create', customSignalingUrl.trim() || undefined, joinSecret || undefined);
    setNewSpaceName('');
    setCreateSpaceOpen(false);
  }, [addSpace, newSpaceName, customSignalingUrl, joinSecret]);

  /** Join-a-Space submit (button + Enter): validates existence, surfaces errors. */
  const submitJoinSpace = useCallback(async () => {
    const code = inviteCodeInput.trim();
    if (!code || joinChecking) return;
    setJoinError(null);
    setJoinChecking(true);
    const result = await addSpace(code, 'join', customSignalingUrl.trim() || undefined, joinSecret || undefined);
    setJoinChecking(false);
    if (result.ok) {
      setInviteCodeInput('');
      setJoinSpaceOpen(false);
      return;
    }
    setJoinError(
      result.reason === 'unreachable'
        ? "Couldn't reach the signaling server — check your connection."
        : 'That Space does not exist (or no one is currently in it).',
    );
  }, [addSpace, inviteCodeInput, joinChecking, customSignalingUrl, joinSecret]);

  return {
    createSpaceOpen, joinSpaceOpen,
    newSpaceName, setNewSpaceName,
    inviteCodeInput, setInviteCodeInput,
    joinChecking, joinError, setJoinError,
    advancedOpen, setAdvancedOpen,
    customSignalingUrl, setCustomSignalingUrl,
    joinSecret, setJoinSecret,
    openCreateSpace, openJoinSpace,
    closeCreateSpace, closeJoinSpace,
    submitCreateSpace, submitJoinSpace,
  };
}
