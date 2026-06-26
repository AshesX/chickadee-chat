import { useEffect, useRef } from 'react';
import { METER_FULL_SCALE } from '../../lib/audioGate';

/**
 * A single rAF loop reads `analyserNode.getByteTimeDomainData` once per frame and
 * writes the level to every registered meter bar. This avoids having multiple
 * `MicLevelMeter`s each poll the same AnalyserNode — two readers on one node
 * starve each other.
 */
export function useSharedMicMeter(
  analyserNode: AnalyserNode | null,
  bars: React.MutableRefObject<Set<HTMLDivElement>>,
): void {
  useEffect(() => {
    if (!analyserNode) {
      bars.current.forEach((b) => {
        b.style.width = '0%';
      });
      return;
    }

    const dataArray = new Uint8Array(analyserNode.fftSize);
    let animationFrameId: number;

    const updateMeter = (): void => {
      analyserNode.getByteTimeDomainData(dataArray);

      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const centered = (dataArray[i] - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);

      // Normalize RMS relative to the meter's full-scale (the max gate threshold).
      const percentage = Math.min(100, Math.round((rms / METER_FULL_SCALE) * 100));
      // Clip warning if boosted audio is excessively high (clipping begins above ~0.95)
      const className = `mic-meter__fill${rms > 0.95 ? ' mic-meter__fill--clipping' : ''}`;

      // Read the live Set each frame so a meter that mounts later (the
      // conditional voice section) is picked up immediately.
      bars.current.forEach((b) => {
        b.style.width = `${percentage}%`;
        b.className = className;
      });

      animationFrameId = requestAnimationFrame(updateMeter);
    };

    updateMeter();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyserNode, bars]);
}

/** Renders one meter bar and registers it with the shared reader above. */
export function MicLevelMeter({
  bars,
  online,
  threshold,
}: {
  bars: React.MutableRefObject<Set<HTMLDivElement>>;
  online: boolean;
  threshold?: number;
}): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const set = bars.current;
    set.add(el);
    return () => {
      set.delete(el);
    };
  }, [bars]);

  const markerPosition = threshold !== undefined ? Math.min(100, (threshold / METER_FULL_SCALE) * 100) : null;

  return (
    <div className="mic-meter">
      <div className="mic-meter__track">
        <div ref={barRef} className="mic-meter__fill" />
        {markerPosition !== null && (
          <div
            className="mic-meter__gate-marker"
            style={{ left: `${markerPosition}%` }}
            title={`Gate Threshold: ${Math.round(markerPosition)}%`}
          />
        )}
      </div>
      <span className="mic-meter__label">
        {online ? 'Live input' : 'Mic offline'}
      </span>
    </div>
  );
}
