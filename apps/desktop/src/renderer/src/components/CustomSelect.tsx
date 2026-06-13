import { useState, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
}

export function CustomSelect({
  value,
  onChange,
  options,
  className,
}: CustomSelectProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? '';

  function handleOpen(): void {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuStyle({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
    setOpen(true);
  }

  function handleSelect(val: string): void {
    onChange(val);
    setOpen(false);
  }

  return (
    <div className={`custom-select${className ? ` ${className}` : ''}`}>
      <button
        ref={triggerRef}
        className="custom-select__trigger"
        onClick={handleOpen}
        type="button"
      >
        <span className="custom-select__trigger-label">{selectedLabel}</span>
        <ChevronDown size={11} />
      </button>

      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} />
          <ul className="custom-select__menu" style={menuStyle}>
            {options.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  className={`custom-select__option${opt.value === value ? ' custom-select__option--active' : ''}`}
                  onClick={() => handleSelect(opt.value)}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
