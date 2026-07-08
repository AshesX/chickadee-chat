import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionStatus, MessageListener } from './useSignaling';

interface StagePeer {
  id: string;
  displayName: string;
}

export interface StageSpotlightArgs {
  status: ConnectionStatus;
  selfId: string | null;
  spotlightHolderId: string | null;
  claimSpotlight: (kind: 'screen' | 'camera', force?: boolean) => void;
  releaseSpotlight: () => void;
  subscribe: (listener: MessageListener) => () => void;
  sharingScreen: boolean;
  cameraEnabled: boolean;
  currentRoomId: string | null;
  peers: readonly StagePeer[];
}

export interface StageSpotlight {
  pendingTakeover: { kind: 'screen' | 'camera'; holderName: string } | null;
  cancelTakeover: () => void;
  confirmTakeover: () => void;
  spotlightCamera: () => void;
  unspotlight: () => void;
}

// Client side of the server-arbitrated single stage slot: claim/release intent,
// auto-claim on screen share, the take-over prompt, and the reconnect re-claim.
export function useStageSpotlight(args: StageSpotlightArgs): StageSpotlight {
  const {
    status,
    selfId,
    spotlightHolderId,
    claimSpotlight,
    releaseSpotlight,
    subscribe,
    sharingScreen,
    cameraEnabled,
    currentRoomId,
    peers,
  } = args;

  // Take-over prompt: set when our (non-force) claim lost to the current holder.
  const [pendingTakeover, setPendingTakeover] = useState<{ kind: 'screen' | 'camera'; holderName: string } | null>(null);
  // Our intent to hold the stage (survives a reconnect/room-switch, which clears
  // the server-side slot). Separate from the authoritative holder state.
  const desiredStageKindRef = useRef<'screen' | 'camera' | null>(null);

  // Peers mirrored into a ref so the subscribe handler below (attached once per
  // subscribe identity) can resolve the holder's display name without going stale.
  const peersRef = useRef(peers);
  peersRef.current = peers;

  const spotlightCamera = useCallback(() => {
    desiredStageKindRef.current = 'camera';
    claimSpotlight('camera');
  }, [claimSpotlight]);

  const unspotlight = useCallback(() => {
    desiredStageKindRef.current = null;
    releaseSpotlight();
  }, [releaseSpotlight]);

  const confirmTakeover = useCallback(() => {
    setPendingTakeover((p) => {
      if (p) {
        desiredStageKindRef.current = p.kind;
        claimSpotlight(p.kind, true);
      }
      return null;
    });
  }, [claimSpotlight]);

  const cancelTakeover = useCallback(() => setPendingTakeover(null), []);

  // Auto-claim the single room stage when a screen share starts (a thumbnail-sized
  // screen is unreadable); release it when the share stops if we still held it.
  const prevSharingRef = useRef(false);
  useEffect(() => {
    const was = prevSharingRef.current;
    prevSharingRef.current = sharingScreen;
    if (sharingScreen && !was) {
      desiredStageKindRef.current = 'screen';
      claimSpotlight('screen');
    } else if (!sharingScreen && was && desiredStageKindRef.current === 'screen') {
      desiredStageKindRef.current = null;
      releaseSpotlight();
    }
  }, [sharingScreen, claimSpotlight, releaseSpotlight]);

  // Turning the camera off while it holds the stage frees the stage.
  const prevCamStageRef = useRef(false);
  useEffect(() => {
    const was = prevCamStageRef.current;
    prevCamStageRef.current = cameraEnabled;
    if (!cameraEnabled && was && desiredStageKindRef.current === 'camera') {
      desiredStageKindRef.current = null;
      releaseSpotlight();
    }
  }, [cameraEnabled, releaseSpotlight]);

  // If someone else holds/took the stage, drop our own desire to hold it.
  useEffect(() => {
    if (spotlightHolderId != null && spotlightHolderId !== selfId) {
      desiredStageKindRef.current = null;
    }
  }, [spotlightHolderId, selfId]);

  // A blocked (non-force) claim replies `spotlight-busy` → offer to take over.
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === 'spotlight-busy') {
        const holder = peersRef.current.find((p) => p.id === msg.holderId);
        setPendingTakeover({
          kind: desiredStageKindRef.current ?? 'screen',
          holderName: holder?.displayName ?? 'Someone',
        });
      }
    });
  }, [subscribe]);

  // Re-claim the stage after a reconnect (new selfId) or room switch, which clears
  // the server-side slot but not our local media. No-op unless we still intend to hold it.
  useEffect(() => {
    if (status === 'connected' && currentRoomId && desiredStageKindRef.current) {
      claimSpotlight(desiredStageKindRef.current);
    }
  }, [selfId, currentRoomId, status, claimSpotlight]);

  return { pendingTakeover, cancelTakeover, confirmTakeover, spotlightCamera, unspotlight };
}
