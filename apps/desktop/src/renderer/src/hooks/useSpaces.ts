import { useCallback, useState } from 'react';
import { DEFAULT_ROOMS, type BannedUser, type SpaceInfo, type Room } from '@chickadee/shared';
import { store } from '../lib/settings';
import { generateSpaceId, normalizeRooms, parseSpaceName } from '../lib/spaceOps';

/** Result of a create/join attempt. `'not-found'`/`'unreachable'` only occur for new-id joins. */
export type AddSpaceResult = { ok: true } | { ok: false; reason: 'not-found' | 'unreachable' };

export interface UseSpacesResult {
  spaces: SpaceInfo[];
  currentSpaceId: string | null;
  rooms: Room[];
  switchSpace: (spaceId: string) => void;
  /** Consolidated create/join handler for the space modals. */
  addSpace: (val: string, type: 'create' | 'join', customSignalingUrl?: string, joinSecret?: string) => Promise<AddSpaceResult>;
  deleteSpace: (spaceId: string, spaceName: string) => void;
  /** Initializes the first space during onboarding. */
  initFirstSpace: (val: string, action: 'create' | 'join', customSignalingUrl?: string, joinSecret?: string) => Promise<AddSpaceResult>;
  /** Updates settings for an existing space (supports renaming). */
  updateSpaceSettings: (spaceId: string, name: string, customSignalingUrl: string, joinSecret: string, precomputedId?: string) => string;
  /** Updates room list in state + persisted store. Used by createRoom/renameRoom/removeRoom/signaling sync. */
  updateRooms: (rooms: Room[]) => void;
  /** Applies a Space banner update (from a live `banner-state`/`welcome`, or a local owner edit) to state + persisted store. */
  updateSpaceBanner: (spaceId: string, bannerDataUrl: string | null) => void;
  /** Applies a Space owner update (from a live `owner-state`/`welcome`) to state + persisted store. */
  updateSpaceOwnerId: (spaceId: string, ownerId: string | null) => void;
  /**
   * Applies a Space moderation update (`ban-state`/`space-lock-state`/`welcome`
   * fields) to state + persisted store. Every member persists these — that's
   * what lets a (possibly newly transferred) owner re-seed the server after a
   * restart via `seed-moderation`.
   */
  updateSpaceModeration: (spaceId: string, patch: { bannedUsers?: BannedUser[]; locked?: boolean }) => void;
  /** Set right after creating a brand-new space, so the app can auto-send `claim-ownership` once connected. */
  pendingOwnerClaimSpaceId: string | null;
  clearPendingOwnerClaim: () => void;
}

export function useSpaces(
  clearRoom: () => void,
  verifySpace: (spaceId: string, signalingUrl: string, secret?: string) => Promise<'exists' | 'not-found' | 'unreachable'>,
  userId: string,
): UseSpacesResult {
  function resolveSignalingUrl(customSignalingUrl?: string): string {
    return customSignalingUrl || (window.chickadee?.signalingUrl ?? 'ws://localhost:8080');
  }

  const [spaces, setSpaces] = useState<SpaceInfo[]>(() => store.getSpaces());
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(() => store.getActiveSpaceId());
  const [rooms, setRooms] = useState<Room[]>(() => store.getRooms());
  const [pendingOwnerClaimSpaceId, setPendingOwnerClaimSpaceId] = useState<string | null>(null);
  const clearPendingOwnerClaim = useCallback(() => setPendingOwnerClaimSpaceId(null), []);

  function switchSpace(spaceId: string): void {
    clearRoom();
    store.setActiveSpaceId(spaceId);
    setCurrentSpaceId(spaceId);
    const active = store.getSpaces().find((s) => s.id === spaceId);
    setRooms(active ? normalizeRooms(active.rooms) : []);
  }

  async function addSpace(val: string, type: 'create' | 'join', customSignalingUrl?: string, joinSecret?: string): Promise<AddSpaceResult> {
    let spaceId: string;
    let spaceName: string;

    if (type === 'create') {
      const name = val.trim();
      if (!name) return { ok: true };
      spaceId = generateSpaceId(name);
      spaceName = name;
    } else {
      spaceId = val.trim();
      if (!spaceId) return { ok: true };
      // Already a known (locally-persisted) space — just switch to it; the server
      // resurrects it from our local room list. Never gated on existence.
      if (spaces.some((s) => s.id === spaceId)) {
        switchSpace(spaceId);
        return { ok: true };
      }
      // Brand-new id: confirm someone is actually in this space before joining,
      // so a typo'd code doesn't silently spin up a new empty space.
      const result = await verifySpace(spaceId, resolveSignalingUrl(customSignalingUrl), joinSecret);
      if (result !== 'exists') return { ok: false, reason: result };
      spaceName = parseSpaceName(spaceId);
    }

    const newSpace: SpaceInfo = {
      id: spaceId,
      name: spaceName,
      rooms: DEFAULT_ROOMS,
      customSignalingUrl,
      joinSecret,
      ...(type === 'create' ? { ownerId: userId } : {}),
    };
    const nextSpaces = [...spaces, newSpace];
    store.setSpaces(nextSpaces);
    setSpaces(nextSpaces);
    switchSpace(spaceId);
    if (type === 'create') setPendingOwnerClaimSpaceId(spaceId);
    return { ok: true };
  }

  function deleteSpace(spaceId: string, spaceName: string): void {
    const confirmed = window.confirm(
      `Are you sure you want to delete the Space "${spaceName}"? All customized rooms and history will be lost locally.`,
    );
    if (!confirmed) return;

    const nextSpaces = spaces.filter((s) => s.id !== spaceId);
    store.setSpaces(nextSpaces);
    setSpaces(nextSpaces);

    if (spaceId === currentSpaceId) {
      if (nextSpaces.length > 0) {
        switchSpace(nextSpaces[0].id);
      } else {
        clearRoom();
        store.setActiveSpaceId(null);
        setCurrentSpaceId(null);
        setRooms([]);
      }
    }
  }

  async function initFirstSpace(val: string, action: 'create' | 'join', customSignalingUrl?: string, joinSecret?: string): Promise<AddSpaceResult> {
    let spaceId = val;
    let spaceName = val;
    if (action === 'create') {
      spaceId = generateSpaceId(val);
    } else {
      // First-run join by invite code: gate on the space actually being live.
      const result = await verifySpace(spaceId, resolveSignalingUrl(customSignalingUrl), joinSecret);
      if (result !== 'exists') return { ok: false, reason: result };
      spaceName = parseSpaceName(val);
    }
    const newSpace: SpaceInfo = {
      id: spaceId,
      name: spaceName,
      rooms: DEFAULT_ROOMS,
      customSignalingUrl,
      joinSecret,
      ...(action === 'create' ? { ownerId: userId } : {}),
    };
    store.setSpaces([newSpace]);
    store.setActiveSpaceId(spaceId);
    setSpaces([newSpace]);
    setCurrentSpaceId(spaceId);
    setRooms(DEFAULT_ROOMS);
    if (action === 'create') setPendingOwnerClaimSpaceId(spaceId);
    return { ok: true };
  }

  const updateRooms = useCallback((nextRooms: Room[]): void => {
    setRooms(nextRooms);
    store.setRooms(nextRooms);
  }, []);

  const updateSpaceSettings = useCallback((spaceId: string, name: string, customSignalingUrl: string, joinSecret: string, precomputedId?: string): string => {
    const spaceToRename = spaces.find(s => s.id === spaceId);
    let newSpaceId = spaceId;
    if (spaceToRename && spaceToRename.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
      newSpaceId = precomputedId || generateSpaceId(name);
    }

    const nextSpaces = spaces.map(s => {
      if (s.id === spaceId) {
        return {
          ...s,
          id: newSpaceId,
          name: name.trim(),
          customSignalingUrl,
          joinSecret,
        };
      }
      return s;
    });

    store.setSpaces(nextSpaces);
    setSpaces(nextSpaces);

    if (spaceId === currentSpaceId) {
      store.setActiveSpaceId(newSpaceId);
      setCurrentSpaceId(newSpaceId);
      if (spaceToRename) {
        setRooms(normalizeRooms(spaceToRename.rooms));
      }
    }

    return newSpaceId;
  }, [spaces, currentSpaceId]);

  const updateSpaceBanner = useCallback((spaceId: string, bannerDataUrl: string | null): void => {
    setSpaces((prev) => {
      const next = prev.map((s) => (s.id === spaceId ? { ...s, bannerDataUrl } : s));
      store.setSpaces(next);
      return next;
    });
  }, []);

  const updateSpaceOwnerId = useCallback((spaceId: string, ownerId: string | null): void => {
    setSpaces((prev) => {
      const next = prev.map((s) => (s.id === spaceId ? { ...s, ownerId } : s));
      store.setSpaces(next);
      return next;
    });
  }, []);

  const updateSpaceModeration = useCallback((spaceId: string, patch: { bannedUsers?: BannedUser[]; locked?: boolean }): void => {
    setSpaces((prev) => {
      const next = prev.map((s) => (s.id === spaceId ? { ...s, ...patch } : s));
      store.setSpaces(next);
      return next;
    });
  }, []);

  return {
    spaces,
    currentSpaceId,
    rooms,
    switchSpace,
    addSpace,
    deleteSpace,
    initFirstSpace,
    updateRooms,
    updateSpaceSettings,
    updateSpaceBanner,
    updateSpaceOwnerId,
    updateSpaceModeration,
    pendingOwnerClaimSpaceId,
    clearPendingOwnerClaim,
  };
}
