import { SettingsSlider } from '../SettingsSlider';
import { MicLevelMeter } from './MicMeter';
import { SettingsRow } from './SettingsRow';

/**
 * A settings row whose control is a `SettingsSlider`. Three layouts:
 *  - with `meter`: slider + live mic meter stacked in a `.mic-control-wrap`,
 *  - `constrained` (no meter): slider in a width-capped `.slider-wrap`,
 *  - default: a bare full-width slider.
 */
export function SliderRow({
  label,
  hint,
  slider,
  meter,
  constrained = false,
  disabled,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  slider: React.ComponentProps<typeof SettingsSlider>;
  meter?: React.ComponentProps<typeof MicLevelMeter>;
  constrained?: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  let control: React.ReactNode;
  if (meter) {
    control = (
      <div className="mic-control-wrap">
        <SettingsSlider {...slider} />
        <MicLevelMeter {...meter} />
      </div>
    );
  } else {
    control = (
      <div className="slider-wrap">
        <SettingsSlider {...slider} />
      </div>
    );
  }

  return (
    <SettingsRow label={label} hint={hint} disabled={disabled}>
      {control}
    </SettingsRow>
  );
}
