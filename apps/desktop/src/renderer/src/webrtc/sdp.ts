// Pure SDP munging for Opus audio tuning. No WebRTC objects — string in,
// string out — so it stays unit-testable apart from the peerLink negotiation.

/** Options for {@link tuneOpusSdp}: bitrate cap + mono on top of always-on DTX. */
export interface OpusTuning {
  /** Opus `maxaveragebitrate` in bits/sec to cap the encoder; omit to leave uncapped. */
  maxAverageBitrate?: number;
  /** Force mono (`stereo=0;sprop-stereo=0`) — right for voice, halves audio bandwidth. */
  mono?: boolean;
}

/**
 * Tune Opus on every Opus m-line of a local SDP by merging fmtp params:
 *  - `usedtx=1` (always) — DTX stops full frames during silence (comfort noise
 *    covers the gap), cutting upstream bandwidth in a voice-first app.
 *  - `maxaveragebitrate=<n>` (when given) — caps the encoder so a busy voice
 *    room (up to 7 outbound audio streams each) stays within budget.
 *  - `stereo=0;sprop-stereo=0` (when `mono`) — mono voice halves audio bandwidth.
 *
 * There's no `setParameters()` equivalent for these, so we munge the SDP.
 * Original fmtp params (minptime, useinbandfec, …) keep their order; managed
 * keys are set in place if present, else appended, so the result is idempotent.
 * Returns the SDP unchanged if no Opus payload is found.
 */
export function tuneOpusSdp(sdp: string, opts: OpusTuning = {}): string {
  const lines = sdp.split(/\r\n|\n/);
  // Map every Opus payload type from its rtpmap line.
  const opusPts = new Set<string>();
  for (const line of lines) {
    const m = /^a=rtpmap:(\d+) opus\/48000/i.exec(line);
    if (m) opusPts.add(m[1]);
  }
  if (opusPts.size === 0) return sdp;

  // Build the managed key/value pairs to merge, in a stable append order.
  const managed: [string, string][] = [['usedtx', '1']];
  if (opts.maxAverageBitrate != null) {
    managed.push(['maxaveragebitrate', String(Math.round(opts.maxAverageBitrate))]);
  }
  if (opts.mono) {
    managed.push(['stereo', '0'], ['sprop-stereo', '0']);
  }

  const mergeParams = (params: string): string => {
    // Preserve original key order; set managed keys in place, else append.
    const parts = params.split(';').filter((p) => p.length > 0);
    const keyOf = (p: string): string => p.split('=')[0];
    for (const [k, v] of managed) {
      const idx = parts.findIndex((p) => keyOf(p) === k);
      if (idx >= 0) parts[idx] = `${k}=${v}`;
      else parts.push(`${k}=${v}`);
    }
    return parts.join(';');
  };

  const out: string[] = [];
  for (const line of lines) {
    const fmtp = /^a=fmtp:(\d+) (.*)$/.exec(line);
    if (fmtp && opusPts.has(fmtp[1])) {
      out.push(`a=fmtp:${fmtp[1]} ${mergeParams(fmtp[2])}`);
      continue;
    }
    out.push(line);
    // If an Opus payload has an rtpmap but no fmtp line, add one right after it.
    const rtpmap = /^a=rtpmap:(\d+) opus\/48000/i.exec(line);
    if (rtpmap && !sdp.includes(`a=fmtp:${rtpmap[1]} `)) {
      out.push(`a=fmtp:${rtpmap[1]} ${mergeParams('')}`);
    }
  }
  return out.join('\r\n');
}

/**
 * Backward-compatible shorthand: enable Opus DTX only (no bitrate/mono changes).
 * Kept as a named export for the existing unit tests and any callers that just
 * want DTX. New callers should prefer {@link tuneOpusSdp} with explicit options.
 */
export function enableOpusDtx(sdp: string): string {
  return tuneOpusSdp(sdp, {});
}
