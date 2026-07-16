import { describe, expect, it } from 'vitest';
import {
  MAX_CONCURRENT_SOUNDBOARD_VOICES,
  MIN_TRIGGER_GAP_MS_PER_PEER,
  canPlayTrigger,
  isSenderMuted,
  shouldAcceptTrigger,
} from './soundboardTriggers';

describe('canPlayTrigger', () => {
  it('allows play under the default cap', () => {
    expect(canPlayTrigger(0)).toBe(true);
    expect(canPlayTrigger(MAX_CONCURRENT_SOUNDBOARD_VOICES - 1)).toBe(true);
  });

  it('blocks at and above the default cap', () => {
    expect(canPlayTrigger(MAX_CONCURRENT_SOUNDBOARD_VOICES)).toBe(false);
    expect(canPlayTrigger(MAX_CONCURRENT_SOUNDBOARD_VOICES + 1)).toBe(false);
  });

  it('honors a custom cap', () => {
    expect(canPlayTrigger(1, 2)).toBe(true);
    expect(canPlayTrigger(2, 2)).toBe(false);
  });
});

describe('shouldAcceptTrigger', () => {
  it('accepts a peer with no prior trigger', () => {
    expect(shouldAcceptTrigger('peer-a', 1000, {})).toBe(true);
  });

  it('rejects a repeat trigger inside the cooldown window', () => {
    const lastAt = { 'peer-a': 1000 };
    expect(shouldAcceptTrigger('peer-a', 1000 + MIN_TRIGGER_GAP_MS_PER_PEER - 1, lastAt)).toBe(false);
  });

  it('accepts once the cooldown window has fully elapsed', () => {
    const lastAt = { 'peer-a': 1000 };
    expect(shouldAcceptTrigger('peer-a', 1000 + MIN_TRIGGER_GAP_MS_PER_PEER, lastAt)).toBe(true);
  });

  it('tracks peers independently', () => {
    const lastAt = { 'peer-a': 1000 };
    expect(shouldAcceptTrigger('peer-b', 1000, lastAt)).toBe(true);
  });
});

describe('isSenderMuted', () => {
  it('treats an unknown peer as unmuted (default volume 1)', () => {
    expect(isSenderMuted('peer-a', {})).toBe(false);
  });

  it('treats volume 0 as muted', () => {
    expect(isSenderMuted('peer-a', { 'peer-a': 0 })).toBe(true);
  });

  it('treats a negative volume as muted', () => {
    expect(isSenderMuted('peer-a', { 'peer-a': -1 })).toBe(true);
  });

  it('treats any positive volume as unmuted', () => {
    expect(isSenderMuted('peer-a', { 'peer-a': 0.01 })).toBe(false);
    expect(isSenderMuted('peer-a', { 'peer-a': 2 })).toBe(false);
  });

  it('tracks peers independently', () => {
    const volumes = { 'peer-a': 0 };
    expect(isSenderMuted('peer-b', volumes)).toBe(false);
  });
});
