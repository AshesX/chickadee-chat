import type { LucideIcon } from 'lucide-react';
import { Radio, AudioLines, Hand } from 'lucide-react';

export type InputMode = 'open' | 'voice' | 'ptt';

/** One icon per input mode so the mode is recognizable at a glance even
    without the text label next to it (e.g. the compact-mode mini button). */
export const INPUT_MODE_ICONS: Record<InputMode, LucideIcon> = {
  open: Radio,
  voice: AudioLines,
  ptt: Hand,
};
