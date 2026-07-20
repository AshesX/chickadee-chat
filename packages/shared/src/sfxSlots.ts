/**
 * The 11 customizable local-SFX slots (one per Settings → Sound Effects
 * toggle-group row). Shared between main (file storage/validation) and the
 * renderer (cue→slot mapping) so the literal id list can't drift between them.
 */
export const CUSTOM_SFX_SLOTS = [
  'joinLeave',
  'mute',
  'muteOther',
  'transmit',
  'chat',
  'deafen',
  'moderation',
  'spotlight',
  'screenShare',
  'transfer',
  'connection',
] as const;

export type CustomSfxSlot = (typeof CUSTOM_SFX_SLOTS)[number];
