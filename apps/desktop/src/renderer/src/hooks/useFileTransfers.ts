import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
  isTerminalStatus,
  updateRate,
  type RateSample,
  type TransferStatus,
} from '../webrtc/fileTransferPolicy';
import type { ReceiverIo } from '../webrtc/transferQueue';

/** One row in the floating transfer tray. */
export interface TransferCard {
  id: string;
  direction: 'send' | 'receive';
  peerName: string;
  fileName: string;
  size: number;
  bytesDone: number;
  rateBps: number;
  status: TransferStatus;
  /** Human-readable detail for error cards. */
  error?: string;
  /** Receive + done: "Show in folder" is available. */
  canReveal?: boolean;
}

/** An inbound file-offer awaiting the user's accept/decline (drives the Modal). */
export interface IncomingOffer {
  transferId: string;
  fromPeerId: PeerId;
  fromName: string;
  name: string;
  size: number;
}

export interface FileTransfersArgs {
  spacePresence: SpacePresence[];
  send: (message: ClientMessage) => void;
  subscribe: (listener: MessageListener) => () => void;
  iceServers: RTCIceServer[];
}

export interface FileTransfers {
  transfers: TransferCard[];
  /** Head of the incoming-offer queue (one prompt at a time), or null. */
  incomingOffer: IncomingOffer | null;
  sendFileTo: (userId: string, file: File) => void;
  acceptIncoming: () => void;
  declineIncoming: () => void;
  /** Cancel an active transfer (card X while running). */
  cancel: (transferId: string) => void;
  /** Remove a settled card (card X when terminal / auto-dismiss). */
  dismiss: (transferId: string) => void;
  showInFolder: (transferId: string) => void;
}

/**
 * P2P file transfers between Space members. Owns the offer/accept handshake
 * over the signaling relay (file-* messages, space-wide + directed by session
 * id), one dedicated WebRTC link per transfer (webrtc/fileTransferLink.ts),
 * and the card list the TransferTray renders. Handshake messages address the
 * session ids captured at offer time — if a peer reconnects mid-handshake the
 * messages drop server-side and the offer/connect timeouts surface the
 * failure (accepted limitation); an already-open DataChannel is unaffected by
 * signaling churn, which is the point of the dedicated connection.
 */
export function useFileTransfers(args: FileTransfersArgs): FileTransfers {
  const { send, subscribe, iceServers } = args;

  const [transfers, setTransfers] = useState<TransferCard[]>([]);
  const [offerQueue, setOfferQueue] = useState<IncomingOffer[]>([]);
  // True while the head offer is at the native Save dialog: hides the Modal
  // (one dialog at a time) and blocks the next offer from surfacing.
  const [deciding, setDeciding] = useState(false);

  // Live WebRTC links + per-transfer bookkeeping (imperative objects stay in
  // refs, mirroring usePeerMesh). All keyed by transferId.
  const linksRef = useRef(new Map<string, FileLink>());
  const filesRef = useRef(new Map<string, File>());
  const peerSessionRef = useRef(new Map<string, PeerId>());
  const ratesRef = useRef(new Map<string, RateSample>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Offers cancelled by the sender while our Save dialog was open. */
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

  /** Release everything a transfer holds (link, file, timers, rate state). */
  const cleanupTransfer = useCallback(
    (id: string) => {
      linksRef.current.get(id)?.close();
      linksRef.current.delete(id);
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

  /** Progress callback shared by both directions: rate EMA + status flip. */
  const handleProgress = useCallback(
    (id: string, size: number, bytes: number) => {
      const sample = updateRate(ratesRef.current.get(id) ?? null, bytes, Date.now());
      ratesRef.current.set(id, sample);
      patch(id, {
        bytesDone: bytes,
        rateBps: sample.rateBps,
        status: bytes >= size ? 'finishing' : 'transferring',
      });
    },
    [patch],
  );

  const sendFileTo = useCallback(
    (userId: string, file: File) => {
      const transferId = crypto.randomUUID();
      const presence = spacePresenceRef.current.find(
        (p) => p.peer.userId === userId && p.leftAt === undefined,
      );
      const card: TransferCard = {
        id: transferId,
        direction: 'send',
        peerName: presence?.peer.displayName ?? 'Unknown user',
        fileName: file.name || 'file',
        size: file.size,
        bytesDone: 0,
        rateBps: 0,
        status: 'awaiting-accept',
      };
      setTransfers((prev) => [...prev, card]);
      if (!presence) {
        settleCard(transferId, 'error', { error: 'User is offline' });
        return;
      }
      if (!sanitizeFileOfferMeta(file.name, file.size)) {
        settleCard(transferId, 'error', { error: 'Cannot send this file' });
        return;
      }
      peerSessionRef.current.set(transferId, presence.peer.id);
      filesRef.current.set(transferId, file);
      send({ type: 'file-offer', to: presence.peer.id, transferId, name: file.name, size: file.size });
      scheduleTimer(transferId, OFFER_TIMEOUT_MS, () => {
        sendCancelSignal(transferId, 'timed out');
        settleCard(transferId, 'error', { error: 'No response' });
      });
    },
    [send, scheduleTimer, sendCancelSignal, settleCard],
  );

  /** Wire a link's terminal callbacks into card state (shared by both roles). */
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

  const removeOffer = useCallback((id: string) => {
    setOfferQueue((prev) => prev.filter((o) => o.transferId !== id));
  }, []);

  const acceptIncoming = useCallback(() => {
    const offer = offerQueueRef.current[0];
    if (!offer || decidingRef.current) return;
    decidingRef.current = true;
    setDeciding(true);
    void (async () => {
      const id = offer.transferId;
      const bridge = window.chickadee?.fileTransfer;
      let path: string | null = null;
      if (bridge) {
        try {
          path = await bridge.beginSave(id, offer.name);
        } catch {
          path = null;
        }
      }
      const wasCancelled = cancelledWhileDecidingRef.current.delete(id);
      if (wasCancelled) {
        // Sender gave up while our Save dialog was open; the offer is already
        // out of the queue — just drop the freshly opened .part stream.
        if (path && bridge) void bridge.abortSave(id).catch(() => undefined);
      } else if (!path || !bridge) {
        // Dialog cancelled (or no preload bridge): treat as a decline.
        send({ type: 'file-answer', to: offer.fromPeerId, transferId: id, accept: false });
        removeOffer(id);
      } else {
        const io: ReceiverIo = {
          write: (chunk) => bridge.writeChunk(id, chunk),
          finish: async () => {
            await bridge.endSave(id);
          },
          abort: () => bridge.abortSave(id),
        };
        peerSessionRef.current.set(id, offer.fromPeerId);
        // Create the link before answering so the sender's SDP can't race the
        // handler registration.
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
        setTransfers((prev) => [
          ...prev,
          {
            id,
            direction: 'receive',
            peerName: offer.fromName,
            fileName: offer.name,
            size: offer.size,
            bytesDone: 0,
            rateBps: 0,
            status: 'connecting',
          },
        ]);
        send({ type: 'file-answer', to: offer.fromPeerId, transferId: id, accept: true });
        removeOffer(id);
      }
      decidingRef.current = false;
      setDeciding(false);
    })();
  }, [send, iceServers, linkCallbacks, removeOffer]);

  const declineIncoming = useCallback(() => {
    const offer = offerQueueRef.current[0];
    if (!offer || decidingRef.current) return;
    send({ type: 'file-answer', to: offer.fromPeerId, transferId: offer.transferId, accept: false });
    removeOffer(offer.transferId);
  }, [send, removeOffer]);

  const cancel = useCallback(
    (id: string) => {
      const link = linksRef.current.get(id);
      link?.cancel(); // best-effort {t:'cancel'} over the channel
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
          const id = msg.transferId;
          const known =
            offerQueueRef.current.some((o) => o.transferId === id) ||
            transfersRef.current.some((t) => t.id === id);
          if (known) return;
          const fromName =
            spacePresenceRef.current.find((p) => p.peer.id === msg.from)?.peer.displayName ??
            'Someone';
          setOfferQueue((prev) => [
            ...prev,
            { transferId: id, fromPeerId: msg.from, fromName, name: meta.name, size: meta.size },
          ]);
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
          const file = filesRef.current.get(id);
          const to = peerSessionRef.current.get(id);
          if (!file || !to) return;
          clearTimer(id); // the offer timeout
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
          const link = linksRef.current.get(msg.transferId);
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
          }
          break;
        }
        default:
          break;
      }
    });
  }, [subscribe, send, iceServers, linkCallbacks, patch, settleCard, clearTimer, removeOffer]);

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
    sendFileTo,
    acceptIncoming,
    declineIncoming,
    cancel,
    dismiss,
    showInFolder,
  };
}
