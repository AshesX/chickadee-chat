export type StageKind = 'screen' | 'camera';

export type StageSource =
  | 'local-screen'
  | 'local-camera'
  | 'remote-screen'
  | 'remote-camera'
  | null;

interface StagePeerRef {
  id: string;
  userId: string;
}

export interface StageSelection {
  isSelfStage: boolean;
  stagePeerId: string | null;
  stageSubscribed: boolean;
  stageSource: StageSource;
  theater: boolean;
}

// Stage (spotlight) derivation: at most ONE large tile per room.
// 0 active videos → Voice Lounge; videos but no spotlight → Gallery (both `.grid`);
// someone spotlighted → Theater (`.presentation`: one stage tile + filmstrip).
// Viewing stays opt-in even for the stage: a non-subscriber gets stageSource null
// (→ large "Watch" placeholder), so non-watchers never pull the stream.
export function selectStage(args: {
  myStageKind: StageKind | null;
  spotlightHolderId: string | null;
  spotlightKind: StageKind | null;
  peers: readonly StagePeerRef[];
  subscribedUserIds: readonly string[];
}): StageSelection {
  const { myStageKind, spotlightHolderId, spotlightKind, peers, subscribedUserIds } = args;

  const isSelfStage = myStageKind != null;
  const stagePeer =
    spotlightHolderId != null && !isSelfStage
      ? peers.find((p) => p.id === spotlightHolderId) ?? null
      : null;
  const stageSubscribed = stagePeer ? subscribedUserIds.includes(stagePeer.userId) : true;
  const stageSource: StageSource = isSelfStage
    ? spotlightKind === 'screen'
      ? 'local-screen'
      : 'local-camera'
    : stagePeer && stageSubscribed
      ? spotlightKind === 'screen'
        ? 'remote-screen'
        : 'remote-camera'
      : null;

  return {
    isSelfStage,
    stagePeerId: stagePeer?.id ?? null,
    stageSubscribed,
    stageSource,
    theater: isSelfStage || stagePeer != null,
  };
}
