import { webcrypto } from 'node:crypto';

/**
 * SHA-256 content hash of arbitrary bytes, hex-encoded (lowercase, 64 chars).
 * Used as the soundboard cache's content-addressed key: local transcodes are
 * hashed on their compressed output (so identical audio dedups regardless of
 * source filename), and P2P-synced clips are re-hashed on receipt to verify
 * against the hash the sender claimed before being accepted into the cache.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await webcrypto.subtle.digest('SHA-256', bytes);
  return Buffer.from(digest).toString('hex');
}
