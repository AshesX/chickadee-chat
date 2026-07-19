import { SettingsRow } from './SettingsRow';
import { CustomSelect } from '../CustomSelect';

/** A settings row whose control is a CustomSelect (styled via `.settings-select`). */
export function SelectRow<T extends string>({
  label,
  hint,
  value,
  onChange,
  options,
  disabled,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <SettingsRow label={label} hint={hint} disabled={disabled}>
      <CustomSelect
        value={value}
        onChange={(val) => onChange(val as T)}
        options={options}
        className="settings-select"
      />
    </SettingsRow>
  );
}
