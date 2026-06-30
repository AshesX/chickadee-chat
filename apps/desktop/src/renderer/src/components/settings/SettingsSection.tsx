/**
 * A settings subsection heading. The `id` is the scroll-target used by the settings
 * search/jump index. Standardizes spacing so tabs don't hand-roll inline `marginTop`.
 */
export function SettingsSection({ id, title }: { id?: string; title: React.ReactNode }): React.JSX.Element {
  return (
    <div id={id} className="settings-subdivision">
      {title}
    </div>
  );
}
