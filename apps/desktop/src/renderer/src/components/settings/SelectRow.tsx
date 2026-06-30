import { SettingsRow } from './SettingsRow';

/** A settings row whose control is a native `<select>` (styled via `.settings-select`). */
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
      <select className="settings-select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </SettingsRow>
  );
}
