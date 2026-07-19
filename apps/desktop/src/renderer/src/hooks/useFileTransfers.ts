import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_BATCH_FILES,
  sanitizeFileOfferFiles,
  sanitizeFileOfferMeta,
  type ClientMessage,
  type PeerId,
  type SpacePresence,
} from '@chickadee/shared';
import type { MessageListener } from './useSignaling';
import {
  createReceiveLink,
  createSendLink,
  type FileLink,
} from '../webrtc/fileTransferLink';
import {
  OFFER_TIMEOUT_MS,
  dismissDelayMs,
  formatBytes,
  isTerminalStatus,
  makeBatchFileId,
  parseBatchFileId,
  updateRate,
  type RateSample,
  type TransferStatus,
} from '../webrtc/fileTransferPolicy';
import type { ReceiverIo } from '../webrtc/transferQueue';
import { store } from '../lib/settings';
import { notifyTransfer } from '../lib/notify';

/** One row in the floating transfer tray. */
export interface TransferCard {
  id: string;
  direction: 'send' | 'receive';
  peerName: string;
  /** Active file's name (batches update this as files progress). */
  fileName: string;
  /** Total bytes (batches: sum of all files). */
  size: number;
  bytesDone: number;
  rateBps: number;
  status: TransferStatus;
  /** Human-readable detail for error cards. */
  error?: string;
  /** Receive + done: "Show in folder" is available. */
  canReveal?: boolean;
  /** Batch only: 0-based index of the active file. */
  fileIndex?: number;
  /** Batch only: number of files (absent = single-file transfer). */
  fileCount?: number;
}

/** An inbound file-offer awaiting the user's accept/decline (drives the Modal). */
export interface IncomingOffer {
  transferId: string;
  fromPeerId: PeerId;
  /** Sender's stable userId ('' when presence couldn't resolve it — hides the trust checkbox). */
  fromUserId: string;
  fromName: string;
  /** Single file's name / the batch's first file name. */
  name: string;
  /** Total bytes (batches: recomputed sum, not the wire summary). */
  size: number;
  /** Present = multi-file batch. */
  files?: { name: string; size: number }[];
}

interface SendBatch {
  files: File[];
  to: PeerId;
  index: number;
  doneBytes: number;
  total: number;
}

interface RecvBatch {
  files: { name: string; size: number }[];
  from: PeerId;
  started: Set<number>;
  doneCount: number;
  doneBytes: number;
  total: number;
}

export interface FileTransfersArgs {
  spacePresence: SpacePresence[];
  send: (message: ClientMessage) => void;
  subscribe: (listener: MessageListener) => () => void;
  iceServers: RTCIceServer[];
  /** Gates the incoming-offer notification (only fired while unfocused). */
  windowFocused: boolean;
}

export interface FileTransfers {
  transfers: TransferCard[];
  /** Head of the incoming-offer queue (one prompt at a time), or null. */
  incomingOffer: IncomingOffer | null;
  /** Send file(s) to a space member; more than one file becomes a batch. */
  sendFilesTo: (userId: string, files: File[]) => void;
  acceptIncoming: () => void;
  declineIncoming: () => void;
  /** Cancel an active transfer/batch (card X while running). */
  cancel: (transferId: string) => void;
  /** Remove a settled card (card X when terminal / auto-dismiss). */
  dismiss: (transferId: string) => void;
  showInFolder: (transferId: string) => void;
}

/**
 * P2P file transfers between Space members. Owns the offer/accept handshake
 * over the signaling relay (file-* messages, space-wide + directed by session
 * id), one dedicated WebRTC link per FILE (webrtc/fileTransferLink.ts — the
 * engine stays single-file), and the card list the TransferTray renders.
 *
 * Multi-file batches are pure orchestration: one offer/answer keyed by the
 * batch id, then the files run sequentially over independent links keyed by
 * DERIVED ids `${batchId}:${index}` (see fileTransferPolicy.makeBatchFileId).
 * First failure aborts the remainder. Receive links are created lazily when a
 * file's first `file-signal` arrives; their save streams open lazily in main
 * against the one folder the receiver authorized.
 *
 * Offers from trusted users (Settings → App → File sharing) skip the prompt
 * and save straight to Downloads; any failure to start the dialog-less save
 * falls back to the normal prompt, never a silent decline.
 *
 * Handshake messages address the session ids captured at offer time — if a
 * peer reconnects mid-handshake the messages drop server-side and the
 * offer/connect timeouts surface the failure (accepted limitation); an
 * already-open DataChannel is unaffected by signaling churn, which is the
 * point of the dedicated connection.
 */
export function useFileTransfers(args: FileTransfersArgs): FileTransfers {
  const { send, subscribe, iceServers } = args;

  const [transfers, setTransfers] = useState<TransferCard[]>([]);
  const [offerQueue, setOfferQueue] = useState<IncomingOffer[]>([]);
  // True while the head offer is at a native dialog (Save As / folder pick):
  // hides the Modal (one dialog at a time) and blocks the next offer.
  const [deciding, setDeciding] = useState(false);

  // Live WebRTC links + per-transfer bookkeeping (imperative objects stay in
  // refs, mirroring usePeerMesh). Links keyed by transferId — for batches,
  // by the derived per-file id.
  const linksRef = useRef(new Map<string, FileLink>());
  const filesRef = useRef(new Map<string, File>());
  const sendBatchesRef = useRef(new Map<string, SendBatch>());
  const recvBatchesRef = useRef(new Map<string, RecvBatch>());
  const peerSessionRef = useRef(new Map<string, PeerId>());
  const ratesRef = useRef(new Map<string, RateSample>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Offers cancelled by the sender while our save/folder dialog was open. */
  const cancelledWhileDecidingRef = useRef(new Set<string>());
  const decidingRef = useRef(false);

  // Mirrored so the once-attached subscribe handler and async flows read fresh
  // values without re-subscribing (useStageSpotlight's peersRef pattern).
  const spacePresenceRef = useRef(args.spacePresence);
  spacePresenceRef.current = args.spacePresence;
  const transfersRef = useRef(transfers);
  transfersRef.current = transfers;
  const offerQueueRef = useRef(offerQueue);
  offerQueueRef.current = offerQueue;
  const windowFocusedRef = useRef(args.windowFocused);
  windowFocusedRef.current = args.windowFocused;

  const scheduleTimer = useCallback((id: string, ms: number, fn: () => void) => {
    const existing = timersRef.current.get(id);
    if (existing) clearTimeout(existing);
    timersRef.current.set(
      id,
      setTimeout(() => {
        timersRef.current.delete(id);
        fn();
      }, ms),
    );
  }, []);

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  /** Single writer for card updates; terminal states win over later patches. */
  const patch = useCallback((id: string, partial: Partial<TransferCard>) => {
    setTransfers((prev) =>
      prev.map((t) => (t.id === id && !isTerminalStatus(t.status) ? { ...t, ...partial } : t)),
    );
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setTransfers((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer],
  );

  /** Release everything a transfer holds (links, files, timers, batch state). */
  const cleanupTransfer = useCallback(
    (id: string) => {
      linksRef.current.get(id)?.close();
      linksRef.current.delete(id);
      // Batch: close every derived per-file link and drop the folder authorization.
      if (sendBatchesRef.current.has(id) || recvBatchesRef.current.has(id)) {
        const prefix = `${id}:`;
        for (const [linkId, link] of [...linksRef.current]) {
          if (linkId.startsWith(prefix)) {
            link.close();
            linksRef.current.delete(linkId);
          }
        }
        sendBatchesRef.current.delete(id);
        if (recvBatchesRef.current.delete(id)) {
          void window.chickadee?.fileTransfer?.releaseBatch(id).catch(() => undefined);
        }
      }
      filesRef.current.delete(id);
      peerSessionRef.current.delete(id);
      ratesRef.current.delete(id);
      clearTimer(id);
    },
    [clearTimer],
  );

  /** Move a card to a terminal status, clean up, and arm its auto-dismiss. */
  const settleCard = useCallback(
    (id: string, status: TransferStatus, extra?: Partial<TransferCard>) => {
      const card = transfersRef.current.find((t) => t.id === id);
      if (card && isTerminalStatus(card.status)) return; // already settled
      cleanupTransfer(id);
      patch(id, { ...extra, status });
      const delay = dismissDelayMs(status, card?.direction ?? 'send');
      if (delay > 0) scheduleTimer(id, delay, () => dismiss(id));
    },
    [cleanupTransfer, patch, scheduleTimer, dismiss],
  );

  /** Best-effort file-cancel over signaling (pre-channel phases + backup). */
  const sendCancelSignal = useCallback(
    (id: string, reason?: string) => {
      const to = peerSessionRef.current.get(id);
      if (to) send({ type: 'file-cancel', to, transferId: id, ...(reason ? { reason } : {}) });
    },
    [send],
  );

  /** Progress callback shared by all transfers: rate EMA + status flip. `bytes` is cumulative. */
  const handleProgress = useCallback(
    (id: string, totalSize: number, bytes: number, extra?: Partial<TransferCard>) => {
      const sample = updateRate(ratesRef.current.get(id) ?? null, bytes, Date.now());
      ratesRef.current.set(id, sample);
      patch(id, {
        ...extra,
        bytesDone: bytes,
        rateBps: sample.rateBps,
        status: bytes >= totalSize ? 'finishing' : 'transferring',
      });
    },
    [patch],
  );

  const sendFilesTo = useCallback(
    (userId: string, files: File[]) => {
      if (files.length === 0) return;
      const transferId = crypto.randomUUID();
      const presence = spacePresenceRef.current.find(
        (p) => p.peer.userId === userId && p.leftAt === undefined,
      );
      const isBatch = files.length > 1;
      const total = files.reduce((sum, f) => sum + f.size, 0);
      const card: TransferCard = {
        id: transferId,
        direction: 'send',
        peerName: presence?.peer.displayName ?? 'Unknown user',
        fileName: files[0].name || 'file',
        size: total,
        bytesDone: 0,
        rateBps: 0,
        status: 'awaiting-accept',
        ...(isBatch ? { fileIndex: 0, fileCount: files.length } : {}),
      };
      setTransfers((prev) => [...prev, card]);
      if (!presence) {
        settleCard(transferId, 'error', { error: 'User is offline' });
        return;
      }
      if (files.length > MAX_BATCH_FILES || files.some((f) => !sanitizeFileOfferMeta(f.name, f.size))) {
        settleCard(transferId, 'error', {
          error: isBatch ? `Cannot send these files (max ${MAX_BATCH_FILES})` : 'Cannot send this file',
        });
        return;
      }
      peerSessionRef.current.set(transferId, presence.peer.id);
      if (isBatch) {
        sendBatchesRef.current.set(transferId, {
          files,
          to: presence.peer.id,
          index: 0,
          doneBytes: 0,
          total,
        });
        send({
          type: 'file-offer',
          to: presence.peer.id,
          transferId,
          name: files[0].name,
          size: total,
          files: files.map((f) => ({ name: f.name, size: f.size })),
        });
      } else {
        filesRef.current.set(transferId, files[0]);
        send({ type: 'file-offer', to: presence.peer.id, transferId, name: files[0].name, size: files[0].size });
      }
      scheduleTimer(transferId, OFFER_TIMEOUT_MS, () => {
        sendCancelSignal(transferId, 'timed out');
        settleCard(transferId, 'error', { error: 'No response' });
      });
    },
    [send, scheduleTimer, sendCancelSignal, settleCard],
  );

  /** Wire a single-file link's callbacks into card state (v1 path, unchanged). */
  const linkCallbacks = useCallback(
    (id: string, size: number, extraOnDone?: Partial<TransferCard>) => ({
      onProgress: (bytes: number) => handleProgress(id, size, bytes),
      onDone: () => settleCard(id, 'done', { bytesDone: size, ...extraOnDone }),
      onError: (reason: string) => {
        sendCancelSignal(id, reason);
        settleCard(id, 'error', { error: reason });
      },
      onPeerCancel: () => settleCard(id, 'cancelled'),
    }),
    [handleProgress, settleCard, sendCancelSignal],
  );

  /** Start the send batch's next file over a fresh derived-id link (sequential). */
  const startNextBatchFile = useCallback(
    function startNext(batchId: string): void {
      const batch = sendBatchesRef.current.get(batchId);
      if (!batch) return;
      const file = batch.files[batch.index];
      if (!file) return;
      const fileId = makeBatchFileId(batchId, batch.index);
      const link = createSendLink({
        transferId: fileId,
        file,
        iceServers,
        sendSignal: (payload) =>
          send({ type: 'file-signal', to: batch.to, transferId: fileId, ...payload }),
        cb: {
          onProgress: (bytes) => {
            const b = sendBatchesRef.current.get(batchId);
            if (!b) return;
            handleProgress(batchId, b.total, b.doneBytes + bytes, {
              fileIndex: b.index,
              fileName: file.name,
            });
          },
          onDone: () => {
            const b = sendBatchesRef.current.get(batchId);
            if (!b) return;
            linksRef.current.get(fileId)?.close();
            linksRef.current.delete(fileId);
            b.doneBytes += file.size;
            b.index += 1;
            if (b.index >= b.files.length) {
              settleCard(batchId, 'done', { bytesDone: b.doneBytes });
            } else {
              patch(batchId, { bytesDone: b.doneBytes, fileIndex: b.index, fileName: b.files[b.index].name });
              startNext(batchId);
            }
          },
          onError: (reason) => {
            sendCancelSignal(batchId, reason);
            settleCard(batchId, 'error', { error: reason });
          },
          onPeerCancel: () => settleCard(batchId, 'cancelled'),
        },
      });
      linksRef.current.set(fileId, link);
    },
    [iceServers, send, handleProgress, settleCard, patch, sendCancelSignal],
  );

  /**
   * Lazily create the receive link for one batch file when its first
   * file-signal arrives. Synchronous — the save stream itself opens lazily in
   * main on the first write (or at finish, for zero-byte files), so there is
   * no SDP-vs-registration race and no pile of idle PeerConnections.
   */
  const createBatchReceiveLink = useCallback(
    (batchId: string, index: number, fileId: string): FileLink | null => {
      const batch = recvBatchesRef.current.get(batchId);
      const bridge = window.chickadee?.fileTransfer;
      const meta = batch?.files[index];
      if (!batch || !bridge || !meta || batch.started.has(index)) return null;
      batch.started.add(index);
      let opened = false;
      const ensureStream = async (): Promise<void> => {
        if (opened) return;
        const name = await bridge.beginBatchFileSave(batchId, fileId, meta.name);
        if (name == null) throw new Error('save rejected');
        opened = true;
      };
      const io: ReceiverIo = {
        write: async (chunk) => {
          await ensureStream();
          return bridge.writeChunk(fileId, chunk);
        },
        finish: async () => {
          await ensureStream(); // zero-byte file: no writes ever happened
          await bridge.endSave(fileId);
        },
        abort: () => (opened ? bridge.abortSave(fileId) : Promise.resolve()),
      };
      const link = createReceiveLink({
        transferId: fileId,
        size: meta.size,
        io,
        iceServers,
        sendSignal: (payload) =>
          send({ type: 'file-signal', to: batch.from, transferId: fileId, ...payload }),
        cb: {
          onProgress: (bytes) => {
            const b = recvBatchesRef.current.get(batchId);
            if (!b) return;
            handleProgress(batchId, b.total, b.doneBytes + bytes, { fileIndex: index, fileName: meta.name });
          },
          onDone: () => {
            const b = recvBatchesRef.current.get(batchId);
            if (!b) return;
            linksRef.current.get(fileId)?.close();
            linksRef.current.delete(fileId);
            b.doneCount += 1;
            b.doneBytes += meta.size;
            if (b.doneCount >= b.files.length) {
              settleCard(batchId, 'done', { bytesDone: b.doneBytes, canReveal: true });
            } else {
              patch(batchId, { bytesDone: b.doneBytes });
            }
          },
          onError: (reason) => {
            sendCancelSignal(batchId, reason);
            settleCard(batchId, 'error', { error: reason });
          },
          onPeerCancel: () => settleCard(batchId, 'cancelled'),
        },
      });
      linksRef.current.set(fileId, link);
      return link;
    },
    [iceServers, send, handleProgress, settleCard, patch, sendCancelSignal],
  );

  const removeOffer = useCallback((id: string) => {
    setOfferQueue((prev) => prev.filter((o) => o.transferId !== id));
  }, []);

  /** Queue an offer for the manual prompt; notify if the window is unfocused. */
  const enqueueOffer = useCallback((offer: IncomingOffer) => {
    setOfferQueue((prev) => [...prev, offer]);
    if (!windowFocusedRef.current) {
      notifyTransfer(
        'Incoming file',
        offer.files
          ? `${offer.fromName} wants to send you ${offer.files.length} files (${formatBytes(offer.size)})`
          : `${offer.fromName} wants to send you ${offer.name} (${formatBytes(offer.size)})`,
      );
    }
  }, []);

  /** Register the accepted receive side of an offer and answer the sender. */
  const startReceive = useCallback(
    (offer: IncomingOffer) => {
      const id = offer.transferId;
      peerSessionRef.current.set(id, offer.fromPeerId);
      setTransfers((prev) => [
        ...prev,
        {
          id,
          direction: 'receive',
          peerName: offer.fromName,
          fileName: offer.files ? offer.files[0].name : offer.name,
          size: offer.size,
          bytesDone: 0,
          rateBps: 0,
          status: 'connecting',
          ...(offer.files ? { fileIndex: 0, fileCount: offer.files.length } : {}),
        },
      ]);
      send({ type: 'file-answer', to: offer.fromPeerId, transferId: id, accept: true });
    },
    [send],
  );

  /**
   * Trusted-sender path: authorize the dialog-less save, then accept without
   * prompting. Any failure falls back to the manual prompt (never a silent
   * decline).
   */
  const autoAccept = useCallback(
    async (offer: IncomingOffer) => {
      const bridge = window.chickadee?.fileTransfer;
      const id = offer.transferId;
      let ok = false;
      if (bridge) {
        try {
          if (offer.files) {
            ok = (await bridge.authorizeAutoBatch(id)) != null;
            if (ok) {
              recvBatchesRef.current.set(id, {
                files: offer.files,
                from: offer.fromPeerId,
                started: new Set(),
                doneCount: 0,
                doneBytes: 0,
                total: offer.size,
              });
            }
          } else {
            ok = (await bridge.beginAutoSave(id, offer.name)) != null;
            if (ok) {
              const io: ReceiverIo = {
                write: (chunk) => bridge.writeChunk(id, chunk),
                finish: async () => {
                  await bridge.endSave(id);
                },
                abort: () => bridge.abortSave(id),
              };
              linksRef.current.set(
                id,
                createReceiveLink({
                  transferId: id,
                  size: offer.size,
                  io,
                  iceServers,
                  sendSignal: (payload) =>
                    send({ type: 'file-signal', to: offer.fromPeerId, transferId: id, ...payload }),
                  cb: linkCallbacks(id, offer.size, { canReveal: true }),
                }),
              );
            }
          }
        } catch {
          ok = false;
        }
      }
      if (!ok) {
        enqueueOffer(offer);
        return;
      }
      startReceive(offer);
      notifyTransfer(
        'Receiving files',
        offer.files
          ? `Receiving ${offer.files.length} files from ${offer.fromName} (${formatBytes(offer.size)})`
          : `Receiving ${offer.name} from ${offer.fromName} (${formatBytes(offer.size)})`,
      );
    },
    [iceServers, send, linkCallbacks, enqueueOffer, startReceive],
  );

  const acceptIncoming = useCallback(() => {
    const offer = offerQueueRef.current[0];
    if (!offer || decidingRef.current) return;
    decidingRef.current = true;
    setDeciding(true);
    void (async () => {
      const id = offer.transferId;
      const bridge = window.chickadee?.fileTransfer;
      // Authorize the destination behind the native dialog: Save As for a
      // single file, one folder pick for a batch.
      let authorized = false;
      let batchDirOk = false;
      if (bridge) {
        try {
          if (offer.files) {
            batchDirOk = (await bridge.beginBatchSave(id)) != null;
            authorized = batchDirOk;
          } else {
            authorized = (await bridge.beginSave(id, offer.name)) != null;
          }
        } catch {
          authorized = false;
        }
      }
      const wasCancelled = cancelledWhileDecidingRef.current.delete(id);
      if (wasCancelled) {
        // Sender gave up while our dialog was open; the offer is already out
        // of the queue — drop whatever authorization we just acquired.
        if (authorized && bridge) {
          void (offer.files ? bridge.releaseBatch(id) : bridge.abortSave(id)).catch(() => undefined);
        }
      } else if (!authorized) {
        // Dialog cancelled (or no preload bridge): treat as a decline.
        send({ type: 'file-answer', to: offer.fromPeerId, transferId: id, accept: false });
        removeOffer(id);
      } else {
        if (offer.files && batchDirOk) {
          recvBatchesRef.current.set(id, {
            files: offer.files,
            from: offer.fromPeerId,
            started: new Set(),
            doneCount: 0,
            doneBytes: 0,
            total: offer.size,
          });
        } else if (!offer.files && bridge) {
          const io: ReceiverIo = {
            write: (chunk) => bridge.writeChunk(id, chunk),
            finish: async () => {
              await bridge.endSave(id);
            },
            abort: () => bridge.abortSave(id),
          };
          // Create the link before answering so the sender's SDP can't race
          // the handler registration.
          linksRef.current.set(
            id,
            createReceiveLink({
              transferId: id,
              size: offer.size,
              io,
              iceServers,
              sendSignal: (payload) =>
                send({ type: 'file-signal', to: offer.fromPeerId, transferId: id, ...payload }),
              cb: linkCallbacks(id, offer.size, { canReveal: true }),
            }),
          );
        }
        startReceive(offer);
        removeOffer(id);
      }
      decidingRef.current = false;
      setDeciding(false);
    })();
  }, [send, iceServers, linkCallbacks, removeOffer, startReceive]);

  const declineIncoming = useCallback(() => {
    const offer = offerQueueRef.current[0];
    if (!offer || decidingRef.current) return;
    send({ type: 'file-answer', to: offer.fromPeerId, transferId: offer.transferId, accept: false });
    removeOffer(offer.transferId);
  }, [send, removeOffer]);

  const cancel = useCallback(
    (id: string) => {
      // Cancel the live channel(s): the plain link for singles, the active
      // derived-id link for batches ({t:'cancel'} rides the open channel).
      const prefix = `${id}:`;
      for (const [linkId, link] of linksRef.current) {
        if (linkId === id || linkId.startsWith(prefix)) link.cancel();
      }
      sendCancelSignal(id, 'cancelled');
      settleCard(id, 'cancelled');
    },
    [sendCancelSignal, settleCard],
  );

  const showInFolder = useCallback((id: string) => {
    void window.chickadee?.fileTransfer?.showInFolder(id).catch(() => undefined);
  }, []);

  // The signaling side of the handshake. Attached once per subscribe identity;
  // everything mutable is read through refs.
  useEffect(() => {
    return subscribe((msg) => {
      switch (msg.type) {
        case 'file-offer': {
          const meta = sanitizeFileOfferMeta(msg.name, msg.size);
          if (!meta) return;
          let files: { name: string; size: number }[] | undefined;
          if (msg.files !== undefined) {
            const sanitized = sanitizeFileOfferFiles(msg.files);
            if (!sanitized) return;
            files = sanitized;
          }
          const id = msg.transferId;
          const known =
            offerQueueRef.current.some((o) => o.transferId === id) ||
            transfersRef.current.some((t) => t.id === id);
          if (known) return;
          const presence = spacePresenceRef.current.find((p) => p.peer.id === msg.from);
          const offer: IncomingOffer = {
            transferId: id,
            fromPeerId: msg.from,
            fromUserId: presence?.peer.userId ?? '',
            fromName: presence?.peer.displayName ?? 'Someone',
            name: meta.name,
            size: files ? files.reduce((sum, f) => sum + f.size, 0) : meta.size,
            files,
          };
          const trusted =
            offer.fromUserId !== '' &&
            store.getAutoAcceptEnabled() &&
            store.getAutoAcceptUsers().some((u) => u.userId === offer.fromUserId);
          if (trusted) {
            void autoAccept(offer);
          } else {
            enqueueOffer(offer);
          }
          break;
        }
        case 'file-answer': {
          const id = msg.transferId;
          const card = transfersRef.current.find((t) => t.id === id);
          if (!card || card.direction !== 'send' || card.status !== 'awaiting-accept') return;
          if (!msg.accept) {
            settleCard(id, 'declined');
            return;
          }
          clearTimer(id); // the offer timeout
          if (sendBatchesRef.current.has(id)) {
            patch(id, { status: 'connecting' });
            startNextBatchFile(id);
            return;
          }
          const file = filesRef.current.get(id);
          const to = peerSessionRef.current.get(id);
          if (!file || !to) return;
          linksRef.current.set(
            id,
            createSendLink({
              transferId: id,
              file,
              iceServers,
              sendSignal: (payload) => send({ type: 'file-signal', to, transferId: id, ...payload }),
              cb: linkCallbacks(id, file.size),
            }),
          );
          patch(id, { status: 'connecting' });
          break;
        }
        case 'file-signal': {
          const id = msg.transferId;
          let link = linksRef.current.get(id);
          if (!link) {
            // A batch file's first signal creates its receive link on demand.
            const parsed = parseBatchFileId(id);
            if (parsed) link = createBatchReceiveLink(parsed.batchId, parsed.index, id) ?? undefined;
          }
          if (link) void link.handleSignal({ sdp: msg.sdp, candidate: msg.candidate });
          break;
        }
        case 'file-cancel': {
          const id = msg.transferId;
          if (offerQueueRef.current.some((o) => o.transferId === id)) {
            if (decidingRef.current && offerQueueRef.current[0]?.transferId === id) {
              cancelledWhileDecidingRef.current.add(id);
            }
            removeOffer(id);
            return;
          }
          if (transfersRef.current.some((t) => t.id === id)) {
            settleCard(id, 'cancelled');
            return;
          }
          // A derived per-file id maps to its batch's card.
          const parsed = parseBatchFileId(id);
          if (parsed && transfersRef.current.some((t) => t.id === parsed.batchId)) {
            settleCard(parsed.batchId, 'cancelled');
          }
          break;
        }
        default:
          break;
      }
    });
  }, [
    subscribe,
    send,
    iceServers,
    linkCallbacks,
    patch,
    settleCard,
    clearTimer,
    removeOffer,
    autoAccept,
    enqueueOffer,
    startNextBatchFile,
    createBatchReceiveLink,
  ]);

  // Teardown on unmount: close every live link (receivers abort their .part
  // via the link's own close path) and drop all timers.
  useEffect(() => {
    const links = linksRef.current;
    const timers = timersRef.current;
    return () => {
      for (const link of links.values()) link.close();
      links.clear();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  return {
    transfers,
    incomingOffer: deciding ? null : (offerQueue[0] ?? null),
    sendFilesTo,
    acceptIncoming,
    declineIncoming,
    cancel,
    dismiss,
    showInFolder,
  };
}
