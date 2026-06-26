/**
 * Pure decision logic for the peer mesh, lifted out of usePeerMesh so it can be
 * unit-tested without WebRTC/DOM. These functions take plain values (ids,
 * booleans) — the imperative hook keeps the MediaStream objects and refs.
 */

/**
 * What a viewer wants from us, derived from their opt-in state against our own
 * userId: screen audio while they're subscribed to us; video while subscribed
 * AND rendering (not docked). Camera + screen video move together.
 */
export function deriveWants(
  subscriptions: string[] | undefined,
  wantsVideo: boolean,
  localUserId: string,
): { video: boolean; screenAudio: boolean } {
  const subscribed = !!subscriptions && subscriptions.includes(localUserId);
  return { screenAudio: subscribed, video: subscribed && wantsVideo };
}

/**
 * Sort a peer's received stream ids into camera vs screen slots, matching the
 * screen by the id the peer announced (via screen-state / welcome). Non-screen
 * ids fall to camera; if several arrive, the last one wins (preserving the
 * original Map-iteration assignment order). `screenId` undefined = no screen.
 */
export function classifyPeerStreams(
  streamIds: string[],
  screenId: string | undefined,
): { cameraStreamId: string | null; screenStreamId: string | null } {
  let cameraStreamId: string | null = null;
  let screenStreamId: string | null = null;
  for (const id of streamIds) {
    if (screenId && id === screenId) screenStreamId = id;
    else cameraStreamId = id;
  }
  return { cameraStreamId, screenStreamId };
}
