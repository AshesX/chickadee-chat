import { MAX_FILE_REASON_LEN, clampString } from '@chickadee/shared';

/**
 * Pure decisions + constants for P2P file transfers (chunking, flow control,
 * progress throttling, card lifecycle). Plain values in/out so everything here
 * is unit-testable; the stateful pumps live in transferQueue.ts and
 * fileTransferLink.ts.
 */

/** One DataChannel binary message = one file chunk. */
export const CHUNK_BYTES = 64 * 1024;
/** Sender stops slicing while dc.bufferedAmount is at/above this. */
export const SEND_HIGH_WATER = 8 * 1024 * 1024;
/** dc.bufferedAmountLowThreshold — resume slicing once buffered falls to this. */
export const SEND_LOW_WATER = 1 * 1024 * 1024;
/** Receiver asks the sender to pause once this much is queued for disk. */
export const RECV_QUEUE_HIGH = 16 * 1024 * 1024;
/** ...and to resume once the queue drains back down to this. */
export const RECV_QUEUE_LOW = 4 * 1024 * 1024;
/** How long the sender waits for an accept/decline before giving up. */
export const OFFER_TIMEOUT_MS = 60_000;
/** How long either side waits for the DataChannel to open after acceptance. */
export const CONNECT_TIMEOUT_MS = 30_000;
/** How long the sender waits after 'done' for the receiver's 'ack-done'. */
export const FINISH_TIMEOUT_MS = 30_000;

/** Lifecycle of one transfer card (send + receive unioned; see the state machines in useFileTransfers). */
export type TransferStatus =
  | 'awaiting-accept'
  | 'choosing-save'
  | 'connecting'
  | 'transferring'
  | 'finishing'
  | 'done'
  | 'declined'
  | 'cancelled'
  | 'error';

/** Statuses from which a transfer can no longer progress (card is settled). */
export function isTerminalStatus(status: TransferStatus): boolean {
  return status === 'done' || status === 'declined' || status === 'cancelled' || status === 'error';
}

/** JSON control messages exchanged as DataChannel string frames (binary frames = file chunks). */
export type ControlMessage =
  | { t: 'pause' }
  | { t: 'resume' }
  | { t: 'done' }
  | { t: 'ack-done' }
  | { t: 'cancel' }
  | { t: 'error'; reason: string };

const CONTROL_TYPES = new Set(['pause', 'resume', 'done', 'ack-done', 'cancel', 'error']);

/** Parse + validate an inbound DataChannel string frame; null = ignore (forward compat). */
export function parseControlMessage(data: unknown): ControlMessage | null {
  if (typeof data !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const t = (parsed as { t?: unknown }).t;
  if (typeof t !== 'string' || !CONTROL_TYPES.has(t)) return null;
  if (t === 'error') {
    const reason = clampString((parsed as { reason?: unknown }).reason, MAX_FILE_REASON_LEN);
    return { t: 'error', reason: reason || 'Peer error' };
  }
  return { t } as ControlMessage;
}

/**
 * Per-file transfer id inside a multi-file batch. Derived, never carried in
 * the offer — `file-signal` routing and main's save-stream map key on it.
 * The batch id is a UUID (no ':'), so the last colon is the separator.
 */
export function makeBatchFileId(batchId: string, index: number): string {
  return `${batchId}:${index}`;
}

/** Parse a derived batch-file id; null for plain (single-file) transfer ids. */
export function parseBatchFileId(id: string): { batchId: string; index: number } | null {
  const sep = id.lastIndexOf(':');
  if (sep <= 0 || sep === id.length - 1) return null;
  const digits = id.slice(sep + 1);
  if (!/^\d{1,3}$/.test(digits)) return null;
  return { batchId: id.slice(0, sep), index: Number(digits) };
}

/** Sender-side backpressure: stop slicing while the SCTP buffer is at/above high water. */
export function shouldPauseSend(bufferedAmount: number): boolean {
  return bufferedAmount >= SEND_HIGH_WATER;
}

/**
 * Receiver-side flow control with hysteresis: 'pause' once when the disk queue
 * crosses the high-water mark, 'resume' once when it drains to the low-water
 * mark, null in between (and null when the state wouldn't change).
 */
export function nextFlowControl(queuedBytes: number, pauseSent: boolean): 'pause' | 'resume' | null {
  if (!pauseSent && queuedBytes >= RECV_QUEUE_HIGH) return 'pause';
  if (pauseSent && queuedBytes <= RECV_QUEUE_LOW) return 'resume';
  return null;
}

const PROGRESS_MIN_INTERVAL_MS = 250;
const PROGRESS_MIN_DELTA_BYTES = 8 * 1024 * 1024;

/**
 * Throttle progress emission so React state updates stay ~4/s: emit on
 * completion, every >=250 ms, or every >=8 MiB, whichever comes first.
 */
export function shouldEmitProgress(
  lastTs: number,
  now: number,
  lastBytes: number,
  bytes: number,
  total: number,
): boolean {
  if (bytes >= total) return true;
  if (now - lastTs >= PROGRESS_MIN_INTERVAL_MS) return true;
  return bytes - lastBytes >= PROGRESS_MIN_DELTA_BYTES;
}

export interface RateSample {
  bytes: number;
  ts: number;
  rateBps: number;
}

const RATE_EMA_KEEP = 0.7;

/** EMA-smoothed transfer rate from successive progress samples (bytes cumulative, ts in ms). */
export function updateRate(prev: RateSample | null, bytes: number, ts: number): RateSample {
  if (!prev) return { bytes, ts, rateBps: 0 };
  const dtMs = ts - prev.ts;
  if (dtMs <= 0) return prev;
  const instant = ((bytes - prev.bytes) * 1000) / dtMs;
  const rateBps = prev.rateBps === 0 ? instant : prev.rateBps * RATE_EMA_KEEP + instant * (1 - RATE_EMA_KEEP);
  return { bytes, ts, rateBps };
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** "512 B", "12.4 MB", "2.1 GB" — one decimal below 100, whole numbers above. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  const text = value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
  return `${text} ${BYTE_UNITS[unit]}`;
}

/** "4.2 MB/s" from a bytes-per-second rate. */
export function formatRate(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

/**
 * Card auto-dismiss delay per terminal status (0 = keep until manually
 * dismissed — used for non-terminal statuses). Completed receives linger so
 * "Show in folder" stays reachable; completed sends get a short confirmation.
 */
export function dismissDelayMs(status: TransferStatus, direction: 'send' | 'receive'): number {
  switch (status) {
    case 'done':
      return direction === 'send' ? 6_000 : 30_000;
    case 'declined':
    case 'cancelled':
      return 8_000;
    case 'error':
      return 10_000;
    default:
      return 0;
  }
}
