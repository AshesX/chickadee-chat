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
  leading,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
  nested?: boolean;
  /** Optional controls rendered in the row's left gutter, before the label (e.g. per-cue "choose file" buttons). Widen the row's inset via `settings-row--wide` when used. */
  leading?: React.ReactNode;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={`settings-row${nested ? ' settings-row--nested' : ''}${leading ? ' settings-row--wide' : ''}${disabled ? ' is-disabled' : ''}`}
    >
      {leading && <div className="settings-row__leading">{leading}</div>}
      <div className="settings-row__label">
        <span>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
