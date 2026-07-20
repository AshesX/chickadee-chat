import { FolderOpen, Play, RotateCcw } from 'lucide-react';
import type { CustomSfxSlot } from '@chickadee/shared';
import { Toggle } from './Toggle';
import { SettingsRow } from './SettingsRow';

/**
 * A ToggleRow for one of the 11 customizable SFX cue groups, with "Choose
 * file" / "Preview" / "Reset" icon buttons in the row's (widened) left
 * gutter — Preview/Reset only appear once a custom sound is set for this slot.
 */
export function SfxCueRow({
  label,
  hint,
  value,
  onChange,
  disabled,
  slot,
  hasCustom,
  busy,
  onChoose,
  onReset,
  onPreview,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  slot: CustomSfxSlot;
  hasCustom: boolean;
  busy: boolean;
  onChoose: (slot: CustomSfxSlot) => void;
  onReset: (slot: CustomSfxSlot) => void;
  onPreview: (slot: CustomSfxSlot) => void;
}): React.JSX.Element {
  return (
    <SettingsRow
      label={label}
      hint={hint}
      disabled={disabled}
      nested
      leading={
        <>
          <button
            className="icon-btn icon-btn--sm"
            title="Choose a custom sound"
            aria-label={`Choose a custom sound for ${label}`}
            onClick={() => onChoose(slot)}
            disabled={disabled || busy}
          >
            <FolderOpen size={14} />
          </button>
          {hasCustom && (
            <>
              <button
                className="icon-btn icon-btn--sm"
                title="Preview"
                aria-label={`Preview the custom sound for ${label}`}
                onClick={() => onPreview(slot)}
                disabled={disabled}
              >
                <Play size={14} />
              </button>
              <button
                className="icon-btn icon-btn--sm"
                title="Reset to default sound"
                aria-label={`Reset ${label} to the default sound`}
                onClick={() => onReset(slot)}
                disabled={disabled}
              >
                <RotateCcw size={14} />
              </button>
            </>
          )}
        </>
      }
    >
      <Toggle on={value} onClick={() => onChange(!value)} />
    </SettingsRow>
  );
}
