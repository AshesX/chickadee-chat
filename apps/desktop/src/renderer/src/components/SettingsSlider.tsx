import { useState, useEffect } from 'react';

/**
 * Range slider with magnetic marker snapping, optional discrete detents, optional
 * commit-on-release, and an optional two-tone "boost" track (fill colour up to
 * `boostFrom`, a second colour beyond it via the `--fill`/`--boost`/`--thumb` CSS
 * vars on `.settings-slider--boost`). Used by the Settings modal and the control-bar
 * chevron volume menus so both look and behave identically.
 */
export function SettingsSlider({
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  markers = [],
  labels = [],
  snapThreshold = 0.03,
  commitOnRelease = false,
  snapValues,
  boostFrom,
}: {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (val: number) => void;
  markers?: number[];
  labels?: { value: number; text: string }[];
  snapThreshold?: number;
  commitOnRelease?: boolean;
  /** When provided, the slider only lands on these exact values, rendered as
   *  uniformly spaced detents (index-based). Overrides min/max/step/markers. */
  snapValues?: number[];
  /** When set (non-discrete sliders only), the filled track turns orange for the
   *  portion of the value above this point — a visual cue that it's beyond normal. */
  boostFrom?: number;
}): React.JSX.Element {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    if (commitOnRelease) {
      setLocalValue(value);
    }
  }, [value, commitOnRelease]);

  const discrete = snapValues != null && snapValues.length > 0;

  // Index of the stop closest to a value (tolerates legacy/off-grid values).
  const nearestIndex = (v: number): number => {
    if (!discrete) return 0;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < snapValues.length; i++) {
      const d = Math.abs(snapValues[i] - v);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  // Horizontal position (0..100%) of a value: by index in discrete mode (even
  // detents), by linear interpolation otherwise.
  const posPercent = (v: number): number =>
    discrete ? (nearestIndex(v) / (snapValues.length - 1)) * 100 : ((v - min) / (max - min)) * 100;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = parseFloat(e.target.value);

    if (discrete) {
      const idx = Math.min(snapValues.length - 1, Math.max(0, Math.round(val)));
      val = snapValues[idx];
    } else {
      // Magnetic snap
      for (const m of markers) {
        if (Math.abs(m - val) <= snapThreshold) {
          val = m;
          break;
        }
      }
    }

    if (commitOnRelease) {
      setLocalValue(val);
    } else {
      onChange(val);
    }
  };

  const handleCommit = () => {
    if (commitOnRelease && localValue !== value) {
      onChange(localValue);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (commitOnRelease && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
      handleCommit();
    }
  };

  const displayValue = commitOnRelease ? localValue : value;
  const clampPct = (p: number): number => Math.max(0, Math.min(100, p));
  const fillPct = clampPct(posPercent(displayValue));
  const boostPct = boostFrom != null && !discrete ? clampPct(posPercent(boostFrom)) : 100;
  
  const customStyle = {
    '--fill': `${fillPct}%`,
    '--boost': `${boostPct}%`,
    '--thumb': boostFrom != null && !discrete && displayValue > boostFrom ? 'var(--red)' : 'var(--orange)',
  } as React.CSSProperties;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="mic-slider-container">
        <input
          type="range"
          min={discrete ? 0 : min}
          max={discrete ? snapValues.length - 1 : max}
          step={discrete ? 1 : step}
          value={discrete ? nearestIndex(commitOnRelease ? localValue : value) : commitOnRelease ? localValue : value}
          onChange={handleChange}
          onPointerUp={commitOnRelease ? handleCommit : undefined}
          onKeyUp={commitOnRelease ? handleKeyUp : undefined}
          onBlur={commitOnRelease ? handleCommit : undefined}
          className="settings-slider"
          style={customStyle}
        />
        {(discrete ? snapValues : markers).map((m) => {
          const percent = posPercent(m);
          // Thumb is ~16px diameter (8px radius)
          const leftCalc = `calc(${percent}% + ${8 - (percent / 100) * 16}px)`;
          return (
            <div
              key={m}
              className="mic-slider-tick"
              style={{ left: leftCalc }}
            />
          );
        })}
      </div>
      {labels.length > 0 && (
        <div className="mic-slider-labels" style={{ position: 'relative', height: '14px', marginTop: '-6px' }}>
          {labels.map((l) => {
            const percent = posPercent(l.value);
            const leftCalc = `calc(${percent}% + ${8 - (percent / 100) * 16}px)`;
            return (
              <span
                key={l.value}
                className="mic-slider-labels__center"
                style={{ left: leftCalc }}
              >
                {l.text}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
