// Pure decisions + constants for per-link connection health: silent-stall
// detection over getStats() packet counts, the restartIce → relink escalation
// ladder, and mesh↔presence reconciliation. Plain values in/out so everything
// here is unit-testable; usePeerMesh owns the timer, the RTCPeerConnections,
// and the getStats() calls.
//
// Why packets and not connectionState: an RTCPeerConnection can sit in
// 'connected' with dead RTP (NAT rebind, path death) — the ICE layer never
// notices. Opus DTX (always munged in, webrtc/sdp.ts) means even a MUTED peer
// emits comfort-noise packets (~2.5/s; mute is track.enabled=false, the sender
// stays), so a multi-second zero-delta in inbound-audio packets is transport
// death, never silence. The one exception is a link that has never received
// (peer with no mic sender): `hasReceived` gates the stall rule for it.

/** Cadence of the health tick (getStats poll per link). Interval, never rAF —
 * it must keep firing while minimized (backgroundThrottling:false covers it). */
export const HEALTH_TICK_MS = 2_000;
/** Zero packet advance for this long on a once-live link = silent stall. DTX
 * comfort noise is ~2.5 pkts/s, so 3 dead ticks is decisive. */
export const STALL_AFTER_MS = 6_000;
/** A link stuck in new/connecting this long never got its offer/answer through
 * (fire-and-forget relay) — relink instead of waiting forever. */
export const MESH_CONNECT_TIMEOUT_MS = 10_000;
/** How long an ICE restart gets to prove itself (packets resuming) before we
 * escalate to a relink. Covers the offer/answer round + connectivity checks. */
export const ICE_RESTART_VERIFY_MS = 8_000;
/** How long a relink (fresh pc, negotiation from scratch) gets to recover. */
export const RELINK_VERIFY_MS = 12_000;
/** Grace on disconnected/failed before relinking — peerLink's own restartIce
 * already fired on entering those states; give it time to work first. */
export const DEGRADED_RELINK_MS = 10_000;
/** Relink attempts before giving up ('failed' pill; a room switch or the next
 * welcome rebuild still recovers the pair). */
export const MAX_RELINK_ATTEMPTS = 3;
/** How long a link↔presence mismatch must persist before reconciliation acts.
 * Far beyond the fan-out-before-presence-update window in useSignaling. */
export const PRESENCE_GRACE_MS = 10_000;

export type HealthPhase = 'ok' | 'restarting' | 'relinking' | 'failed';
export type HealthAction = 'none' | 'restart-ice' | 'relink' | 'give-up';
/** Coarse per-peer signal for the UI (the tile's connection pill). */
export type HealthUi = 'ok' | 'recovering' | 'failed';

export interface LinkHealth {
  phase: HealthPhase;
  /** Deadline (ms) for the current recovery phase to prove itself; 0 when ok. */
  deadline: number;
  relinkAttempts: number;
  /** Last observed cumulative inbound-audio packet count. */
  packets: number;
  /** When `packets` last advanced (seeded to link creation). */
  lastAdvanceAt: number;
  /** True once any inbound audio ever arrived on this link (sticky across
   * relinks so stall recovery keeps demanding real packets, not just ICE). */
  hasReceived: boolean;
  /** First tick the pc was observed disconnected/failed/closed; null while
   * healthy. Times the degraded grace (lastAdvanceAt can't — a never-received
   * link would look "stalled since creation" and relink on the first blip). */
  degradedAt: number | null;
  createdAt: number;
}

export function initialHealth(now: number): LinkHealth {
  return {
    phase: 'ok',
    deadline: 0,
    relinkAttempts: 0,
    packets: 0,
    lastAdvanceAt: now,
    hasReceived: false,
    degradedAt: null,
    createdAt: now,
  };
}

/** Minimal shape of the RTCStats entries the extractor cares about. */
export interface StatsEntry {
  type?: string;
  kind?: string;
  packetsReceived?: number;
}

/**
 * Sum inbound-audio packets from a stats report (pass `[...report.values()]`).
 * Voice + screen-share audio are summed deliberately: any inbound RTP proves
 * the transport lives, and transport death is the failure mode we detect.
 */
export function sumInboundAudioPackets(entries: StatsEntry[]): number {
  let total = 0;
  for (const e of entries) {
    if (e.type === 'inbound-rtp' && e.kind === 'audio') total += e.packetsReceived ?? 0;
  }
  return total;
}

/**
 * The health reducer, run once per link per tick. Returns the next health
 * state plus the action the caller must dispatch:
 *  - 'restart-ice' → link.restartIce() (in-place, cheapest remedy)
 *  - 'relink'      → tear down + recreate the one link (fresh pc both sides)
 *  - 'give-up'     → stop trying; surface 'failed'
 * A relink resets the packet baseline (a fresh pc's counters restart at 0).
 * Recovery from ANY phase = packets advancing (regardless of the state label)
 * — or, for a link that has never received (no remote mic sender), reaching
 * 'connected' at all.
 */
export function evaluateHealth(
  h: LinkHealth,
  connectionState: RTCPeerConnectionState,
  packetsNow: number,
  now: number,
): { next: LinkHealth; action: HealthAction } {
  const advanced = packetsNow > h.packets;
  const degraded =
    connectionState === 'disconnected' ||
    connectionState === 'failed' ||
    connectionState === 'closed';
  const degradedAt = degraded ? (h.degradedAt ?? now) : null;
  const tracked: LinkHealth =
    advanced || degradedAt !== h.degradedAt
      ? {
          ...h,
          degradedAt,
          ...(advanced ? { packets: packetsNow, lastAdvanceAt: now, hasReceived: true } : {}),
        }
      : h;

  const relink = (): { next: LinkHealth; action: HealthAction } => ({
    next: {
      ...tracked,
      phase: 'relinking',
      deadline: now + RELINK_VERIFY_MS,
      relinkAttempts: tracked.relinkAttempts + 1,
      packets: 0,
      lastAdvanceAt: now,
      degradedAt: null,
    },
    action: 'relink',
  });

  // Recovery exits every phase, including 'failed' (spontaneous recovery).
  // Packet advance alone is proof — connectionState can read 'connecting'
  // mid-ICE-restart while media still flows on the old pair. A link that has
  // never received (no remote mic sender) proves itself by reaching
  // 'connected' at all.
  if (advanced || (connectionState === 'connected' && !tracked.hasReceived)) {
    if (tracked.phase === 'ok' && tracked.relinkAttempts === 0) {
      return { next: tracked, action: 'none' };
    }
    return { next: { ...tracked, phase: 'ok', deadline: 0, relinkAttempts: 0 }, action: 'none' };
  }

  switch (tracked.phase) {
    case 'ok': {
      // Never-established: the offer/answer was lost in the fire-and-forget
      // relay and the pc will wait forever — rebuild the pair.
      if (
        (connectionState === 'new' || connectionState === 'connecting') &&
        !tracked.hasReceived &&
        now - tracked.createdAt >= MESH_CONNECT_TIMEOUT_MS
      ) {
        return relink();
      }
      // Silent stall: 'connected' but packets froze → ICE restart first.
      if (
        connectionState === 'connected' &&
        tracked.hasReceived &&
        now - tracked.lastAdvanceAt >= STALL_AFTER_MS
      ) {
        return {
          next: { ...tracked, phase: 'restarting', deadline: now + ICE_RESTART_VERIFY_MS },
          action: 'restart-ice',
        };
      }
      // Degraded and not healing: peerLink's own restartIce fired on entry to
      // these states; if the pc hasn't recovered after the grace, relink.
      if (degraded && tracked.degradedAt !== null && now - tracked.degradedAt >= DEGRADED_RELINK_MS) {
        return relink();
      }
      return { next: tracked, action: 'none' };
    }
    case 'restarting':
      if (now >= tracked.deadline) return relink();
      return { next: tracked, action: 'none' };
    case 'relinking':
      if (now >= tracked.deadline) {
        if (tracked.relinkAttempts >= MAX_RELINK_ATTEMPTS) {
          return { next: { ...tracked, phase: 'failed', deadline: 0 }, action: 'give-up' };
        }
        return relink();
      }
      return { next: tracked, action: 'none' };
    case 'failed':
      return { next: tracked, action: 'none' };
  }
}

/**
 * Reconcile the link map against the presence list: a link whose peer vanished
 * (missed peer-left) should close; a peer with no link (lost relink offer)
 * should get one. Mismatches must persist for PRESENCE_GRACE_MS before we act —
 * mesh listeners see messages before presence state updates, so instantaneous
 * disagreement is normal. `pending` carries first-seen timestamps between
 * ticks; matched/actioned entries drop out automatically.
 */
export function reconcileMesh(
  linkIds: string[],
  peerIds: string[],
  pending: Record<string, number>,
  now: number,
): { close: string[]; create: string[]; nextPending: Record<string, number> } {
  const links = new Set(linkIds);
  const peers = new Set(peerIds);
  const close: string[] = [];
  const create: string[] = [];
  const nextPending: Record<string, number> = {};
  for (const id of links) {
    if (peers.has(id)) continue;
    const since = pending[`close:${id}`] ?? now;
    if (now - since >= PRESENCE_GRACE_MS) close.push(id);
    else nextPending[`close:${id}`] = since;
  }
  for (const id of peers) {
    if (links.has(id)) continue;
    const since = pending[`create:${id}`] ?? now;
    if (now - since >= PRESENCE_GRACE_MS) create.push(id);
    else nextPending[`create:${id}`] = since;
  }
  return { close, create, nextPending };
}

/** Collapse the phase to what the tile pill needs. */
export function deriveHealthUi(phase: HealthPhase): HealthUi {
  if (phase === 'restarting' || phase === 'relinking') return 'recovering';
  if (phase === 'failed') return 'failed';
  return 'ok';
}
