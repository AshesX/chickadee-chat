/**
 * @chickadee/shared — the contract between the desktop client and the
 * signaling server, split by domain and re-exported flat from this entry so
 * consumers keep importing from '@chickadee/shared':
 *
 *   capacity.ts  room types + the unified 8-cap
 *   sanitize.ts  input bounds + sanitizers (security-relevant, unit-tested)
 *   protocol.ts  Peer/Room + the ClientMessage/ServerMessage unions + parsers
 *   settings.ts  PersistedSettings schema + defaults (client-only)
 *   ice.ts       default STUN/TURN sets
 */
export * from './capacity';
export * from './sanitize';
export * from './protocol';
export * from './settings';
export * from './ice';
