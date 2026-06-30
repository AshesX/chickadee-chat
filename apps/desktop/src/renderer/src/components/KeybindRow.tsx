import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { toAccelerator } from '../lib/accelerator';

/**
 * Click-to-capture keybind control, identical in look + behavior to the
 * Settings → Keybindings rows (shares the .keybind-row / .rebind / .unbind-btn
 * classes). Click the button, press a key to rebind; the X clears it.
 */
export function KeybindRow({
  value,
  onChange,
  clearLabel = 'keybind',
}: {
  value: string;
  onChange: (k: string) => void;
  clearLabel?: string;
}): React.JSX.Element {
  const [capturing, setCapturing] = useState(false);

  const handleKeyDown = (e: KeyboardEvent): void => {
    e.preventDefault();
    const accel = toAccelerator(e);
    if (accel) {
      onChange(accel);
      setCapturing(false);
    }
  };

  return (
    <div className="keybind-row">
      <button
        type="button"
        className={`rebind${capturing ? ' rebind--active' : ''}`}
        onClick={() => setCapturing(true)}
        onBlur={() => setCapturing(false)}
        onKeyDown={capturing ? handleKeyDown : undefined}
      >
        {capturing ? 'Press a key…' : value || 'Unbound'}
      </button>
      {value && (
        <button
          type="button"
          className="btn btn--danger-soft unbind-btn"
          onClick={() => onChange('')}
          title="Clear keybind"
          aria-label={`Clear ${clearLabel}`}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
