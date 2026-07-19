/**
 * Cheap synchronous FNV-1a string hash (hex-encoded, 32-bit). Not
 * cryptographic — intended for change-detection (e.g. "did this Space banner
 * actually change"), where collisions are inconsequential. Synchronous by
 * design: Web Crypto's SubtleCrypto digest is async, and callers here (crop
 * modal save flows) are synchronous.
 */
export function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
