import { Toggle } from './Toggle';
import { SettingsRow } from './SettingsRow';

/** A settings row whose control is an on/off `Toggle`. */
export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
  nested,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  nested?: boolean;
}): React.JSX.Element {
  return (
    <SettingsRow label={label} hint={hint} disabled={disabled} nested={nested}>
      <Toggle on={value} onClick={() => onChange(!value)} />
    </SettingsRow>
  );
}
