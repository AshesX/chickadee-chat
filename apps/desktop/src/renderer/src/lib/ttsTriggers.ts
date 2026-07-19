// Pure decision logic for whether an incoming/self-sent chat message should be
// read aloud (useRoomChat/App own the message plumbing; this just decides).

export interface ChatTtsDecisionInput {
  chatTtsEnabled: boolean;
  isReaction: boolean;
  isSelf: boolean;
  windowFocused: boolean;
  speakOwnMessages: boolean;
  speakWhenFocused: boolean;
}

export function shouldSpeakChatMessage(input: ChatTtsDecisionInput): boolean {
  if (!input.chatTtsEnabled || input.isReaction) return false;
  if (input.isSelf && !input.speakOwnMessages) return false;
  if (input.windowFocused && !input.speakWhenFocused) return false;
  return true;
}
