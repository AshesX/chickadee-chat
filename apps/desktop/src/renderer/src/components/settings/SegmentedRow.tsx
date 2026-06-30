import { SegmentedGroup } from '../SegmentedGroup';
import { SettingsRow } from './SettingsRow';

/** A settings row whose control is a segmented (pill) button group. */
export function SegmentedRow<T extends string>({
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
  options: { value: T; label: React.ReactNode }[];
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <SettingsRow label={label} hint={hint} disabled={disabled}>
      <SegmentedGroup value={value} onChange={onChange} options={options} />
    </SettingsRow>
  );
}
