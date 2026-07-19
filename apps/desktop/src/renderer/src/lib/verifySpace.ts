import { parseServerMessage } from '@chickadee/shared';

export type SpaceVerifyResult = 'exists' | 'not-found' | 'unreachable';

const VERIFY_TIMEOUT_MS = 8_000;

/**
 * Non-mutating Space existence probe over a throwaway socket — deliberately
 * independent of useSignaling's persistent connection (its own WebSocket, never
 * socketRef) so probing can't disturb an active call. Resolves
 * 'exists'/'not-found' from the server's `space-status` reply, or 'unreachable'
 * if the server can't be reached within the timeout.
 */
export function verifySpace(
  spaceId: string,
  signalingUrl: string,
  secret?: string,
): Promise<SpaceVerifyResult> {
  return new Promise((resolve) => {
    let settled = false;
    let probe: WebSocket;
    const finish = (result: SpaceVerifyResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Detach handlers before closing so a late close/error can't re-resolve.
      probe.onopen = null;
      probe.onmessage = null;
      probe.onerror = null;
      probe.onclose = null;
      try {
        probe.close();
      } catch {
        /* already closing */
      }
      resolve(result);
    };

    const timer = setTimeout(() => finish('unreachable'), VERIFY_TIMEOUT_MS);

    try {
      probe = new WebSocket(signalingUrl);
    } catch {
      clearTimeout(timer);
      resolve('unreachable');
      return;
    }

    probe.onopen = () => {
      probe.send(JSON.stringify({ type: 'check-space', spaceId, secret: secret || (window.chickadee?.joinSecret ?? '') }));
    };
    probe.onmessage = (event) => {
      const msg = parseServerMessage(String(event.data));
      if (msg && msg.type === 'space-status' && msg.spaceId === spaceId) {
        finish(msg.exists ? 'exists' : 'not-found');
      }
    };
    probe.onerror = () => finish('unreachable');
    probe.onclose = () => finish('unreachable');
  });
}
