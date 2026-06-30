/**
 * Shared segmented (pill) button group — the `.seg-group` / `.seg-btn` markup that
 * was hand-rolled in the settings tabs, the room chevron menus, and the welcome
 * wizard. Generic over the value union so each call site keeps its own string type.
 */
export function SegmentedGroup<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
}): React.JSX.Element {
  return (
    <div className={`seg-group${className ? ` ${className}` : ''}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`seg-btn${value === opt.value ? ' seg-btn--active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
