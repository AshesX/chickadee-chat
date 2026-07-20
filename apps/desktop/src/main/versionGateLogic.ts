/**
 * Pure decision logic for the beta version gate — kept free of any `electron`
 * import (mirrors windowSize.ts/hotkeyLogic.ts) so it's unit-testable;
 * versionGate.ts owns the session/filesystem wiring and calls into this.
 */

/**
 * Wipe when no recorded version exists (first run / pre-gate install) or it
 * differs from the current one. Beta policy: any version change — up or down —
 * resets local state to a clean baseline instead of migrating it.
 */
export function shouldWipe(lastRun: string | null, current: string): boolean {
  return lastRun !== current;
}
