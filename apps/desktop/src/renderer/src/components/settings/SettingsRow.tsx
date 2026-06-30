/**
 * Layout shell for a settings row: a label + optional hint on the left, a control
 * (passed as children) on the right. Replaces the `settings-row` / `settings-row__label`
 * markup repeated across every tab. `disabled` dims + disables the row via `.is-disabled`.
 */
export function SettingsRow({
  label,
  hint,
  disabled = false,
  nested = false,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
  nested?: boolean;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={`settings-row${nested ? ' settings-row--nested' : ''}${disabled ? ' is-disabled' : ''}`}>
      <div className="settings-row__label">
        <span>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
