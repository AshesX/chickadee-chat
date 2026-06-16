/**
 * Renderer-side profiling: measures the real requestAnimationFrame callback rate
 * and reports it once per second (with hidden/focused flags) to main, which logs
 * it to raf.csv. Inert unless window.chickadee.profile is set.
 *
 * This is the ONLY rAF loop the harness adds, and it exists purely to quantify
 * the cadence the static audit flagged: with backgroundThrottling:false, does
 * rAF keep firing at 60/144 Hz while the window is minimized? Reading
 * document.hidden / hasFocus() alongside the count answers that.
 */
export function initRendererProfiler(): void {
  const chick = window.chickadee;
  if (!chick?.profile) return;
  const report = chick.profileRaf;
  if (typeof report !== 'function') return;

  let frames = 0;
  const onFrame = (): void => {
    frames++;
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);

  setInterval(() => {
    const rafPerSec = frames;
    frames = 0;
    report({ rafPerSec, hidden: document.hidden, focused: document.hasFocus() });
  }, 1000);
}
