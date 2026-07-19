import { DEFAULT_ICE_SERVERS } from '@chickadee/shared';
import {
  CHUNK_BYTES,
  CONNECT_TIMEOUT_MS,
  FINISH_TIMEOUT_MS,
  SEND_LOW_WATER,
  parseControlMessage,
  shouldEmitProgress,
  shouldPauseSend,
  type ControlMessage,
} from './fileTransferPolicy';
import { createReceiveQueue, type ReceiverIo } from './transferQueue';

/**
 * One dedicated RTCPeerConnection + DataChannel per file transfer — separate
 * from the media mesh's peerLink so a long transfer survives room switches and
 * mesh rebuilds, and reaches peers in other rooms. Roles are fixed (sender =
 * offerer, receiver = answerer), so unlike peerLink there is no perfect
 * negotiation and no glare to handle. Wire protocol: binary frames are file
 * chunks in order; string frames are JSON ControlMessages. No ICE restart —
 * a dropped transfer fails fast and the user retries.
 */

/** The payload half of a file-signal message (the hook adds to/transferId). */
export interface FileSignalPayload {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface FileLinkCallbacks {
  /** Cumulative bytes sent (sender) / written to disk (receiver). Throttled to ~4/s. */
  onProgress: (bytes: number) => void;
  /** Sender: receiver confirmed the finished file. Receiver: .part renamed. */
  onDone: () => void;
  /** Any fatal path: connect/finish timeout, connection lost, disk/read error, peer error. */
  onError: (reason: string) => void;
  /** The peer cancelled ({t:'cancel'} over the channel). */
  onPeerCancel: () => void;
}

export interface FileLink {
  /** Feed an inbound file-signal payload for this transfer (sdp or candidate). */
  handleSignal: (payload: FileSignalPayload) => Promise<void>;
  /** Local cancel: best-effort {t:'cancel'} to the peer, then silent teardown. */
  cancel: () => void;
  /** Silent teardown (terminal states, unmount). Idempotent; fires no callbacks. */
  close: () => void;
}

/** How long 'disconnected' may persist before the transfer is declared lost. */
const DISCONNECTED_GRACE_MS = 10_000;

interface LinkCore {
  pc: RTCPeerConnection;
  /** True once a terminal callback fired or teardown ran; gates every event. */
  isSettled: () => boolean;
  /** Mark settled without firing a callback (local cancel / teardown). */
  settle: () => void;
  fail: (reason: string) => void;
  sendControl: (msg: ControlMessage, dc: RTCDataChannel | null) => void;
  handleSignal: (payload: FileSignalPayload, onOffer?: () => Promise<void>) => Promise<void>;
  armConnectTimeout: () => void;
  clearConnectTimeout: () => void;
  setTimer: (ms: number, fn: () => void) => ReturnType<typeof setTimeout>;
  close: () => void;
  onClosed: (fn: () => void) => void;
}

/** The plumbing both roles share: PC setup, ICE trickle + buffering, liveness watch, timers. */
function createLinkCore(
  iceServers: RTCIceServer[],
  sendSignal: (payload: FileSignalPayload) => void,
  onError: (reason: string) => void,
): LinkCore {
  const pc = new RTCPeerConnection({ iceServers: iceServers ?? DEFAULT_ICE_SERVERS });

  let settled = false;
  let closed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const closedHooks: (() => void)[] = [];

  // Candidates that arrive before the remote description are buffered.
  let remoteSet = false;
  const pendingCandidates: RTCIceCandidateInit[] = [];

  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let disconnectedTimer: ReturnType<typeof setTimeout> | null = null;

  function setTimer(ms: number, fn: () => void): ReturnType<typeof setTimeout> {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  }

  function settle(): void {
    settled = true;
  }

  function fail(reason: string): void {
    if (settled) return;
    settled = true;
    onError(reason);
  }

  function sendControl(msg: ControlMessage, dc: RTCDataChannel | null): void {
    try {
      if (dc && dc.readyState === 'open') dc.send(JSON.stringify(msg));
    } catch {
      // Best effort — the peer's own PC-state watch is the ground truth.
    }
  }

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) sendSignal({ candidate: candidate.toJSON() });
  };

  pc.onconnectionstatechange = () => {
    if (settled) return;
    const state = pc.connectionState;
    if (state === 'failed' || state === 'closed') {
      fail('Connection lost');
    } else if (state === 'disconnected') {
      disconnectedTimer ??= setTimer(DISCONNECTED_GRACE_MS, () => {
        disconnectedTimer = null;
        if (pc.connectionState === 'disconnected') fail('Connection lost');
      });
    } else if (state === 'connected' && disconnectedTimer) {
      clearTimeout(disconnectedTimer);
      timers.delete(disconnectedTimer);
      disconnectedTimer = null;
    }
  };

  async function handleSignal(payload: FileSignalPayload, onOffer?: () => Promise<void>): Promise<void> {
    if (closed) return;
    try {
      if (payload.candidate) {
        if (remoteSet) await pc.addIceCandidate(payload.candidate);
        else pendingCandidates.push(payload.candidate);
        return;
      }
      if (!payload.sdp) return;
      await pc.setRemoteDescription(payload.sdp);
      remoteSet = true;
      for (const candidate of pendingCandidates.splice(0)) {
        try {
          await pc.addIceCandidate(candidate);
        } catch {
          // Stale candidates are harmless; the pair that works will connect.
        }
      }
      if (payload.sdp.type === 'offer') await onOffer?.();
    } catch (err) {
      console.error('[fileTransferLink] handleSignal failed', err);
      fail('Could not connect');
    }
  }

  return {
    pc,
    isSettled: () => settled,
    settle,
    fail,
    sendControl,
    handleSignal,
    armConnectTimeout(): void {
      connectTimer = setTimer(CONNECT_TIMEOUT_MS, () => fail('Could not connect'));
    },
    clearConnectTimeout(): void {
      if (connectTimer) {
        clearTimeout(connectTimer);
        timers.delete(connectTimer);
        connectTimer = null;
      }
    },
    setTimer,
    onClosed(fn: () => void): void {
      closedHooks.push(fn);
    },
    close(): void {
      if (closed) return;
      closed = true;
      settled = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.ondatachannel = null;
      pc.close();
      for (const fn of closedHooks) fn();
    },
  };
}

export interface SendLinkOptions {
  transferId: string;
  file: File;
  iceServers: RTCIceServer[];
  sendSignal: (payload: FileSignalPayload) => void;
  cb: FileLinkCallbacks;
}

/** Sender side: creates the DataChannel, offers, then pumps file chunks with backpressure. */
export function createSendLink(opts: SendLinkOptions): FileLink {
  const { file, sendSignal, cb } = opts;
  const core = createLinkCore(opts.iceServers, sendSignal, cb.onError);
  const { pc } = core;

  // Label is a debugging aid only — the whole PC belongs to this one transfer.
  const dc = pc.createDataChannel(opts.transferId);
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = SEND_LOW_WATER;

  let peerPaused = false;
  let doneSent = false;

  // One shared wake-up for everything that can unblock the pump: the SCTP
  // buffer draining, the receiver's resume, or teardown.
  let wake: (() => void) | null = null;
  const wakeUp = (): void => {
    wake?.();
    wake = null;
  };
  const waitForWake = (): Promise<void> =>
    new Promise((resolve) => {
      wake = resolve;
    });

  dc.onbufferedamountlow = wakeUp;

  dc.onmessage = ({ data }) => {
    const msg = parseControlMessage(data);
    if (!msg || core.isSettled()) return;
    switch (msg.t) {
      case 'pause':
        peerPaused = true;
        break;
      case 'resume':
        peerPaused = false;
        wakeUp();
        break;
      case 'ack-done':
        if (doneSent) {
          core.settle();
          cb.onDone();
        }
        break;
      case 'cancel':
        core.settle();
        wakeUp();
        cb.onPeerCancel();
        break;
      case 'error':
        core.fail(msg.reason);
        wakeUp();
        break;
      default:
        break;
    }
  };

  dc.onclose = () => {
    wakeUp();
    core.fail('Connection lost');
  };

  async function pump(): Promise<void> {
    let offset = 0;
    let lastTs = 0;
    let lastBytes = 0;
    while (offset < file.size) {
      if (core.isSettled()) return;
      if (shouldPauseSend(dc.bufferedAmount) || peerPaused) {
        await waitForWake();
        continue;
      }
      const end = Math.min(offset + CHUNK_BYTES, file.size);
      let buf: ArrayBuffer;
      try {
        buf = await file.slice(offset, end).arrayBuffer();
      } catch {
        core.fail('File changed or unreadable');
        return;
      }
      if (buf.byteLength !== end - offset) {
        core.fail('File changed or unreadable');
        return;
      }
      if (core.isSettled()) return;
      try {
        dc.send(buf);
      } catch {
        core.fail('Connection lost');
        return;
      }
      offset = end;
      const now = Date.now();
      if (shouldEmitProgress(lastTs, now, lastBytes, offset, file.size)) {
        lastTs = now;
        lastBytes = offset;
        cb.onProgress(offset);
      }
    }
    if (core.isSettled()) return;
    // All bytes are buffered locally; only the receiver's ack proves delivery.
    doneSent = true;
    core.sendControl({ t: 'done' }, dc);
    core.setTimer(FINISH_TIMEOUT_MS, () => core.fail('Peer did not confirm'));
  }

  dc.onopen = () => {
    core.clearConnectTimeout();
    void pump();
  };

  core.armConnectTimeout();
  core.onClosed(() => {
    dc.onopen = null;
    dc.onmessage = null;
    dc.onclose = null;
    dc.onbufferedamountlow = null;
    wakeUp();
  });

  // Fixed offerer role: create the offer as soon as the channel exists.
  void (async () => {
    try {
      await pc.setLocalDescription(await pc.createOffer());
      if (pc.localDescription) sendSignal({ sdp: pc.localDescription });
    } catch (err) {
      console.error('[fileTransferLink] offer failed', err);
      core.fail('Could not connect');
    }
  })();

  return {
    handleSignal: (payload) => core.handleSignal(payload),
    cancel(): void {
      core.sendControl({ t: 'cancel' }, dc);
      core.close();
    },
    close: core.close,
  };
}

export interface ReceiveLinkOptions {
  transferId: string;
  size: number;
  /** Disk IO seam — in production the window.chickadee.fileTransfer IPC thunks. */
  io: ReceiverIo;
  iceServers: RTCIceServer[];
  sendSignal: (payload: FileSignalPayload) => void;
  cb: FileLinkCallbacks;
}

/** Receiver side: answers the offer, streams inbound chunks to disk via the receive queue. */
export function createReceiveLink(opts: ReceiveLinkOptions): FileLink {
  const { sendSignal, cb } = opts;
  const core = createLinkCore(opts.iceServers, sendSignal, cb.onError);
  const { pc } = core;

  let dc: RTCDataChannel | null = null;
  let lastTs = 0;
  let lastBytes = 0;

  const queue = createReceiveQueue(opts.size, opts.io, {
    onFlowControl: (action) => core.sendControl({ t: action }, dc),
    onProgress: (bytes) => {
      const now = Date.now();
      if (shouldEmitProgress(lastTs, now, lastBytes, bytes, opts.size)) {
        lastTs = now;
        lastBytes = bytes;
        cb.onProgress(bytes);
      }
    },
    onComplete: () => {
      if (core.isSettled()) return;
      core.sendControl({ t: 'ack-done' }, dc);
      core.settle();
      cb.onDone();
    },
    onError: (reason) => {
      core.sendControl({ t: 'error', reason }, dc);
      core.fail(reason);
    },
  });

  pc.ondatachannel = ({ channel }) => {
    dc = channel;
    dc.binaryType = 'arraybuffer';
    core.clearConnectTimeout();
    dc.onmessage = ({ data }) => {
      if (core.isSettled()) return;
      if (typeof data !== 'string') {
        queue.push(data as ArrayBuffer);
        return;
      }
      const msg = parseControlMessage(data);
      if (!msg) return;
      switch (msg.t) {
        case 'done':
          queue.markDone();
          break;
        case 'cancel':
          core.settle();
          void queue.abort();
          cb.onPeerCancel();
          break;
        case 'error':
          core.fail(msg.reason);
          void queue.abort();
          break;
        default:
          break; // pause/resume are sender-bound
      }
    };
    dc.onclose = () => {
      if (core.isSettled()) return;
      core.fail('Connection lost');
      void queue.abort();
    };
  };

  core.armConnectTimeout();
  core.onClosed(() => {
    if (dc) {
      dc.onmessage = null;
      dc.onclose = null;
    }
    // Idempotent: settles the queue and deletes the .part unless it completed.
    void queue.abort();
  });

  return {
    handleSignal: (payload) =>
      core.handleSignal(payload, async () => {
        await pc.setLocalDescription(await pc.createAnswer());
        if (pc.localDescription) sendSignal({ sdp: pc.localDescription });
      }),
    cancel(): void {
      core.sendControl({ t: 'cancel' }, dc);
      core.close();
    },
    close: core.close,
  };
}
