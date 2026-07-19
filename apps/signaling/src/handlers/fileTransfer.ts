import {
  MAX_FILE_REASON_LEN,
  MAX_ID_LEN,
  clampString,
  sanitizeFileOfferFiles,
  sanitizeFileOfferMeta,
  type ClientMessage,
} from '@chickadee/shared';
import { send, spaceConnections, type Connection } from '../state';

type FileRelayMessage = Extract<
  ClientMessage,
  { type: 'file-offer' | 'file-answer' | 'file-signal' | 'file-cancel' }
>;

/**
 * Directed SPACE-scoped relay for the file-transfer handshake — unlike the
 * room-scoped `relay()` in room.ts, the target is looked up across the whole
 * space so a transfer can reach a peer in another room (the sidebar USERS list
 * is space-wide). Stateless: the server never tracks transfers, it only stamps
 * `from` and forwards. Invalid fields or unknown targets drop silently,
 * matching `relay()`'s behavior; the sender's own timeout is its feedback.
 * `file-signal` payloads (SDP/ICE) are relayed verbatim and never inspected,
 * like `offer`/`answer`/`ice-candidate`.
 */
export function relayFileMessage(conn: Connection, msg: FileRelayMessage): void {
  const to = clampString(msg.to, MAX_ID_LEN);
  const transferId = clampString(msg.transferId, MAX_ID_LEN);
  if (!to || !transferId || to === conn.peer.id) return;
  const target = spaceConnections.get(conn.space)?.get(to);
  if (!target) return;

  switch (msg.type) {
    case 'file-offer': {
      const meta = sanitizeFileOfferMeta(msg.name, msg.size);
      if (!meta) return;
      // A batch offer must be wholly valid (2..MAX_BATCH_FILES clean entries);
      // one bad entry drops the offer rather than shrinking it.
      let files: { name: string; size: number }[] | undefined;
      if (msg.files !== undefined) {
        const sanitized = sanitizeFileOfferFiles(msg.files);
        if (!sanitized) return;
        files = sanitized;
      }
      send(target.socket, {
        type: 'file-offer',
        from: conn.peer.id,
        transferId,
        name: meta.name,
        size: meta.size,
        ...(files ? { files } : {}),
      });
      break;
    }
    case 'file-answer':
      send(target.socket, {
        type: 'file-answer',
        from: conn.peer.id,
        transferId,
        accept: Boolean(msg.accept),
      });
      break;
    case 'file-signal':
      send(target.socket, {
        type: 'file-signal',
        from: conn.peer.id,
        transferId,
        sdp: msg.sdp,
        candidate: msg.candidate,
      });
      break;
    case 'file-cancel': {
      const reason = clampString(msg.reason, MAX_FILE_REASON_LEN);
      send(target.socket, {
        type: 'file-cancel',
        from: conn.peer.id,
        transferId,
        ...(reason ? { reason } : {}),
      });
      break;
    }
  }
}
