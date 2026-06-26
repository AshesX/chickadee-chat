import { Minus, Square, X } from 'lucide-react';

interface WindowControlsProps {
  /** Omit the maximize button (e.g. a fixed-size compact dock). Default true. */
  showMaximize?: boolean;
}

/** Custom min/max/close buttons for the frameless window. */
export function WindowControls({ showMaximize = true }: WindowControlsProps): React.JSX.Element {
  const wc = window.chickadee?.windowControls;
  return (
    <div className="winctl">
      <button className="winctl__btn" onClick={() => wc?.minimize()} aria-label="Minimize">
        <Minus size={15} />
      </button>
      {showMaximize && (
        <button className="winctl__btn" onClick={() => wc?.toggleMaximize()} aria-label="Maximize">
          <Square size={11} />
        </button>
      )}
      <button
        className="winctl__btn winctl__btn--close"
        onClick={() => wc?.close()}
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}
