import { Minus, Square, X } from 'lucide-react';

/** Custom min/max/close buttons for the frameless window. */
export function WindowControls(): React.JSX.Element {
  const wc = window.chickadee?.windowControls;
  return (
    <div className="winctl">
      <button className="winctl__btn" onClick={() => wc?.minimize()} aria-label="Minimize">
        <Minus size={15} />
      </button>
      <button className="winctl__btn" onClick={() => wc?.toggleMaximize()} aria-label="Maximize">
        <Square size={11} />
      </button>
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
