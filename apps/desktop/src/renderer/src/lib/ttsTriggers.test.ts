import { describe, expect, it } from 'vitest';
import { shouldSpeakChatMessage } from './ttsTriggers';

const base = {
  chatTtsEnabled: true,
  isReaction: false,
  isSelf: false,
  windowFocused: false,
  speakOwnMessages: true,
  speakWhenFocused: true,
};

describe('shouldSpeakChatMessage', () => {
  it('speaks a peer message when TTS is on and unfocused', () => {
    expect(shouldSpeakChatMessage(base)).toBe(true);
  });

  it('never speaks when the master toggle is off', () => {
    expect(shouldSpeakChatMessage({ ...base, chatTtsEnabled: false })).toBe(false);
  });

  it('never speaks reactions', () => {
    expect(shouldSpeakChatMessage({ ...base, isReaction: true })).toBe(false);
  });

  it('suppresses self messages when speakOwnMessages is off', () => {
    expect(shouldSpeakChatMessage({ ...base, isSelf: true, speakOwnMessages: false })).toBe(false);
  });

  it('still speaks peer messages when speakOwnMessages is off', () => {
    expect(shouldSpeakChatMessage({ ...base, isSelf: false, speakOwnMessages: false })).toBe(true);
  });

  it('speaks self messages when speakOwnMessages is on', () => {
    expect(shouldSpeakChatMessage({ ...base, isSelf: true, speakOwnMessages: true })).toBe(true);
  });

  it('suppresses everything while focused when speakWhenFocused is off', () => {
    expect(shouldSpeakChatMessage({ ...base, windowFocused: true, speakWhenFocused: false })).toBe(false);
  });

  it('still speaks while focused when speakWhenFocused is on', () => {
    expect(shouldSpeakChatMessage({ ...base, windowFocused: true, speakWhenFocused: true })).toBe(true);
  });

  it('speaks while unfocused regardless of speakWhenFocused', () => {
    expect(shouldSpeakChatMessage({ ...base, windowFocused: false, speakWhenFocused: false })).toBe(true);
  });
});
