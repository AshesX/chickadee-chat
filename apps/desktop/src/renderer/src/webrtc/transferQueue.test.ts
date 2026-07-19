import { describe, expect, it, vi } from 'vitest';
import { createReceiveQueue, type ReceiveQueueEvents, type ReceiverIo } from './transferQueue';
import { RECV_QUEUE_HIGH, RECV_QUEUE_LOW } from './fileTransferPolicy';

/** Let queued microtasks/timers run so in-flight pump steps settle. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A ReceiverIo whose writes only settle when the test says so. */
function manualIo(): {
  io: ReceiverIo;
  writes: { chunk: Uint8Array; gate: Deferred }[];
  finish: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
} {
  const writes: { chunk: Uint8Array; gate: Deferred }[] = [];
  const finish = vi.fn(() => Promise.resolve());
  const abort = vi.fn(() => Promise.resolve());
  const io: ReceiverIo = {
    write: (chunk) => {
      const gate = deferred();
      writes.push({ chunk, gate });
      return gate.promise;
    },
    finish,
    abort,
  };
  return { io, writes, finish, abort };
}

function events(): ReceiveQueueEvents & {
  flow: ('pause' | 'resume')[];
  progress: number[];
  complete: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  const flow: ('pause' | 'resume')[] = [];
  const progress: number[] = [];
  const complete = vi.fn();
  const error = vi.fn();
  return {
    flow,
    progress,
    complete,
    error,
    onFlowControl: (a) => flow.push(a),
    onProgress: (b) => progress.push(b),
    onComplete: complete,
    onError: error,
  };
}

const chunk = (bytes: number): ArrayBuffer => new ArrayBuffer(bytes);

describe('createReceiveQueue', () => {
  it('writes strictly one at a time, in order, reporting cumulative progress', async () => {
    const { io, writes } = manualIo();
    const ev = events();
    const q = createReceiveQueue(30, io, ev);

    q.push(chunk(10));
    q.push(chunk(10));
    q.push(chunk(10));
    await flush();
    expect(writes).toHaveLength(1); // single-flight: later chunks wait

    writes[0].gate.resolve();
    await flush();
    expect(writes).toHaveLength(2);
    expect(ev.progress).toEqual([10]);

    writes[1].gate.resolve();
    await flush();
    writes[2].gate.resolve();
    await flush();
    expect(writes).toHaveLength(3);
    expect(ev.progress).toEqual([10, 20, 30]);
  });

  it('emits pause once over high water and resume once after draining', async () => {
    const eight = 8 * 1024 * 1024;
    expect(RECV_QUEUE_HIGH).toBe(2 * eight);
    expect(RECV_QUEUE_LOW).toBe(eight / 2);
    const { io, writes } = manualIo();
    const ev = events();
    const q = createReceiveQueue(eight * 3, io, ev);

    q.push(chunk(eight)); // in-flight, queued 8 MiB
    await flush();
    expect(ev.flow).toEqual([]);

    q.push(chunk(eight)); // queued 16 MiB = high water
    expect(ev.flow).toEqual(['pause']);

    q.push(chunk(eight)); // still paused: no repeat
    expect(ev.flow).toEqual(['pause']);

    writes[0].gate.resolve(); // queued 16 MiB
    await flush();
    writes[1].gate.resolve(); // queued 8 MiB — above low water, still quiet
    await flush();
    expect(ev.flow).toEqual(['pause']);

    writes[2].gate.resolve(); // queued 0 = below low water
    await flush();
    expect(ev.flow).toEqual(['pause', 'resume']);
  });

  it('completes only after the queue drains AND byte counts match', async () => {
    const { io, writes, finish } = manualIo();
    const ev = events();
    const q = createReceiveQueue(20, io, ev);

    q.push(chunk(10));
    q.push(chunk(10));
    q.markDone(); // arrives while writes are still pending
    await flush();
    expect(ev.complete).not.toHaveBeenCalled();

    writes[0].gate.resolve();
    await flush();
    expect(ev.complete).not.toHaveBeenCalled();

    writes[1].gate.resolve();
    await flush();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(ev.complete).toHaveBeenCalledTimes(1);
    expect(ev.error).not.toHaveBeenCalled();
  });

  it('completes a zero-byte transfer with no chunks', async () => {
    const { io, finish } = manualIo();
    const ev = events();
    const q = createReceiveQueue(0, io, ev);
    q.markDone();
    await flush();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(ev.complete).toHaveBeenCalledTimes(1);
  });

  it('errors on done with missing bytes and aborts the save', async () => {
    const { io, writes, abort, finish } = manualIo();
    const ev = events();
    const q = createReceiveQueue(30, io, ev);
    q.push(chunk(10));
    q.markDone();
    writes[0]?.gate.resolve();
    await flush();
    expect(ev.error).toHaveBeenCalledWith('Incomplete transfer');
    expect(abort).toHaveBeenCalledTimes(1);
    expect(finish).not.toHaveBeenCalled();
  });

  it('errors on bytes beyond the declared size and stops writing', async () => {
    const { io, writes, abort } = manualIo();
    const ev = events();
    const q = createReceiveQueue(15, io, ev);
    q.push(chunk(10));
    q.push(chunk(10)); // 20 > 15
    await flush();
    expect(ev.error).toHaveBeenCalledWith('Protocol violation');
    expect(abort).toHaveBeenCalledTimes(1);
    // Only the first chunk's write ever started; nothing new after the failure.
    expect(writes).toHaveLength(1);
    q.push(chunk(1));
    await flush();
    expect(writes).toHaveLength(1);
  });

  it('errors on data arriving after done', async () => {
    const { io } = manualIo();
    const ev = events();
    const q = createReceiveQueue(100, io, ev);
    q.push(chunk(10));
    q.markDone();
    q.push(chunk(10));
    await flush();
    expect(ev.error).toHaveBeenCalledWith('Protocol violation');
  });

  it('maps a rejected write to a Write failed error', async () => {
    const { io, writes, abort } = manualIo();
    const ev = events();
    const q = createReceiveQueue(20, io, ev);
    q.push(chunk(10));
    await flush();
    writes[0].gate.reject(new Error('disk full'));
    await flush();
    expect(ev.error).toHaveBeenCalledWith('Write failed');
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it('maps a rejected finish to a Finalize failed error', async () => {
    const { io } = manualIo();
    (io.finish as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('rename failed'));
    const ev = events();
    const q = createReceiveQueue(0, io, ev);
    q.markDone();
    await flush();
    expect(ev.error).toHaveBeenCalledWith('Finalize failed');
  });

  it('abort stops the pump, aborts IO exactly once, and emits no events', async () => {
    const { io, writes, abort } = manualIo();
    const ev = events();
    const q = createReceiveQueue(30, io, ev);
    q.push(chunk(10));
    q.push(chunk(10));
    await flush();

    await q.abort();
    await q.abort(); // idempotent
    writes[0].gate.resolve(); // in-flight write settles after the abort
    await flush();

    expect(abort).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(1); // second chunk never started
    expect(ev.progress).toEqual([]);
    expect(ev.complete).not.toHaveBeenCalled();
    expect(ev.error).not.toHaveBeenCalled();

    // Everything after an abort is ignored.
    q.push(chunk(10));
    q.markDone();
    await flush();
    expect(writes).toHaveLength(1);
    expect(ev.error).not.toHaveBeenCalled();
  });
});
