import { KeybindRow } from './KeybindRow';
import { SegmentedGroup } from './SegmentedGroup';

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
        <SegmentedGroup
          value={mode}
          onChange={onChangeMode}
          options={[
            { value: 'hold', label: 'Hold' },
            { value: 'toggle', label: 'Toggle' },
          ]}
        />
      </div>
      <div className="kb-control__col kb-control__col--key">
        <div className="label">Key</div>
        <KeybindRow value={value} onChange={onChange} clearLabel={clearLabel} />
      </div>
    </div>
  );
}
