import { nextFlowControl } from './fileTransferPolicy';

/**
 * Receiver-side write queue for one file transfer. DataChannel `onmessage`
 * can't be blocked, so inbound chunks land here and a single-flight pump
 * drains them through awaited IPC writes; `nextFlowControl` decides when to
 * ask the sender to pause/resume so memory stays bounded when the disk is
 * slower than the network. No DOM/WebRTC/Electron types — the IO seam is
 * injected, which is what makes this unit-testable.
 */

/** The disk-IO seam (in production: the window.chickadee.fileTransfer IPC thunks). */
export interface ReceiverIo {
  write: (chunk: Uint8Array) => Promise<void>;
  /** Flush + rename .part to the final filename. */
  finish: () => Promise<void>;
  /** Destroy the stream + delete the .part file. */
  abort: () => Promise<void>;
}

export interface ReceiveQueueEvents {
  /** Forward to the sender as a {t:'pause'|'resume'} control frame. */
  onFlowControl: (action: 'pause' | 'resume') => void;
  /** Cumulative bytes flushed to disk (fires per chunk; throttle upstream). */
  onProgress: (bytesWritten: number) => void;
  /** All bytes written and the .part renamed — the transfer is truly complete. */
  onComplete: () => void;
  /** Fatal failure (disk error, byte-count mismatch, protocol violation). */
  onError: (reason: string) => void;
}

export interface ReceiveQueue {
  /** Enqueue an inbound binary frame (from dc.onmessage). */
  push: (chunk: ArrayBuffer) => void;
  /** The sender's {t:'done'} arrived; finalize once the queue drains. */
  markDone: () => void;
  /** Local/peer cancel: stop writing, destroy the stream, delete .part. Idempotent; emits no events. */
  abort: () => Promise<void>;
}

export function createReceiveQueue(size: number, io: ReceiverIo, ev: ReceiveQueueEvents): ReceiveQueue {
  const queue: ArrayBuffer[] = [];
  let queuedBytes = 0;
  let bytesReceived = 0;
  let bytesWritten = 0;
  let writing = false;
  let done = false;
  let settled = false;
  let pauseSent = false;

  function fail(reason: string): void {
    if (settled) return;
    settled = true;
    queue.length = 0;
    queuedBytes = 0;
    void io.abort().catch(() => undefined);
    ev.onError(reason);
  }

  function maybeFlowControl(): void {
    const action = nextFlowControl(queuedBytes, pauseSent);
    if (!action) return;
    pauseSent = action === 'pause';
    ev.onFlowControl(action);
  }

  async function pump(): Promise<void> {
    if (writing || settled) return;
    writing = true;
    try {
      while (queue.length > 0 && !settled) {
        const chunk = queue.shift() as ArrayBuffer;
        try {
          await io.write(new Uint8Array(chunk));
        } catch {
          fail('Write failed');
          return;
        }
        if (settled) return; // aborted while the write was in flight
        queuedBytes -= chunk.byteLength;
        bytesWritten += chunk.byteLength;
        ev.onProgress(bytesWritten);
        maybeFlowControl();
      }
      if (done && !settled) {
        if (bytesWritten !== size) {
          fail('Incomplete transfer');
          return;
        }
        try {
          await io.finish();
        } catch {
          fail('Finalize failed');
          return;
        }
        settled = true;
        ev.onComplete();
      }
    } finally {
      writing = false;
    }
  }

  return {
    push(chunk: ArrayBuffer): void {
      if (settled) return;
      // The channel is ordered, so data after 'done' or beyond the declared
      // size can only be a misbehaving sender.
      if (done || bytesReceived + chunk.byteLength > size) {
        fail('Protocol violation');
        return;
      }
      bytesReceived += chunk.byteLength;
      queue.push(chunk);
      queuedBytes += chunk.byteLength;
      maybeFlowControl();
      void pump();
    },
    markDone(): void {
      if (settled || done) return;
      done = true;
      void pump();
    },
    async abort(): Promise<void> {
      if (settled) return;
      settled = true;
      queue.length = 0;
      queuedBytes = 0;
      await io.abort().catch(() => undefined);
    },
  };
}
