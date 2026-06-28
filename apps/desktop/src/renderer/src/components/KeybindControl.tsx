import { KeybindRow } from './KeybindRow';

/**
 * Side-by-side Hold/Toggle mode (left) + key capture (right), used in the room
 * chevron menus for PTT, Mute, and Deafen so they match the Settings keybind UI.
 */
export function KeybindControl({
  mode,
  onChangeMode,
  value,
  onChange,
  clearLabel,
}: {
  mode: 'hold' | 'toggle';
  onChangeMode: (m: 'hold' | 'toggle') => void;
  value: string;
  onChange: (k: string) => void;
  clearLabel?: string;
}): React.JSX.Element {
  return (
    <div className="kb-control">
      <div className="kb-control__col">
        <div className="label">Mode</div>
        <div className="seg-group">
          <button
            type="button"
            className={`seg-btn${mode === 'hold' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeMode('hold')}
          >
            Hold
          </button>
          <button
            type="button"
            className={`seg-btn${mode === 'toggle' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeMode('toggle')}
          >
            Toggle
          </button>
        </div>
      </div>
      <div className="kb-control__col kb-control__col--key">
        <div className="label">Key</div>
        <KeybindRow value={value} onChange={onChange} clearLabel={clearLabel} />
      </div>
    </div>
  );
}
