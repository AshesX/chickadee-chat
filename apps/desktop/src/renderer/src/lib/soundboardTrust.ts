/**
 * Whether custom soundboard clips from `peerUserId` should be auto-downloaded
 * in the background. Resolved decision: fully automatic, gated only by the
 * master auto-sync toggle — clips are tiny (~80KB), inert, and playback spam
 * is already independently guarded (concurrency cap, per-peer cooldown), so
 * gating sync itself would mostly just silently break the feature for
 * untrusted peers. Kept as an explicit seam, not inlined at the call site: if
 * that decision is ever revisited, swapping in the existing file-transfer
 * trust list (autoAcceptEnabled/autoAcceptUsers) is a one-line change here,
 * not a redesign of useSoundboardSync.
 */
export function shouldAutoSyncFrom(
  _peerUserId: string,
  opts: { soundboardAutoSyncEnabled: boolean },
): boolean {
  return opts.soundboardAutoSyncEnabled;
}
