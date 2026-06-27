import { describe, it, expect } from 'vitest';
import { enableOpusDtx, tuneOpusSdp } from './peerLink';

describe('enableOpusDtx', () => {
  it('appends usedtx=1 to an existing Opus fmtp line', () => {
    const sdp = ['v=0', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1'].join('\r\n');
    const out = enableOpusDtx(sdp);
    expect(out).toContain('a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1');
  });

  it('is idempotent — does not duplicate usedtx', () => {
    const sdp = ['a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;usedtx=1'].join('\r\n');
    const out = enableOpusDtx(sdp);
    expect(out).toBe(sdp);
    // and re-running our own output changes nothing
    expect(enableOpusDtx(enableOpusDtx(sdp))).toBe(sdp);
  });

  it('inserts an fmtp line when an Opus payload has none', () => {
    const sdp = ['a=rtpmap:111 opus/48000/2', 'a=rtpmap:96 VP8/90000'].join('\r\n');
    const out = enableOpusDtx(sdp).split('\r\n');
    const idx = out.indexOf('a=rtpmap:111 opus/48000/2');
    expect(out[idx + 1]).toBe('a=fmtp:111 usedtx=1');
  });

  it('returns the SDP unchanged when there is no Opus payload', () => {
    const sdp = ['v=0', 'a=rtpmap:96 VP8/90000', 'a=fmtp:96 max-fr=30'].join('\n');
    expect(enableOpusDtx(sdp)).toBe(sdp);
  });

  it('handles multiple Opus payload types', () => {
    const sdp = [
      'a=rtpmap:111 opus/48000/2',
      'a=fmtp:111 minptime=10',
      'a=rtpmap:63 opus/48000/2',
      'a=fmtp:63 minptime=10',
    ].join('\r\n');
    const out = enableOpusDtx(sdp);
    expect(out).toContain('a=fmtp:111 minptime=10;usedtx=1');
    expect(out).toContain('a=fmtp:63 minptime=10;usedtx=1');
  });
});

describe('tuneOpusSdp', () => {
  const base = ['v=0', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1'].join('\r\n');

  it('always applies DTX and preserves existing fmtp params', () => {
    const out = tuneOpusSdp(base, {});
    expect(out).toContain('a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1');
  });

  it('adds maxaveragebitrate when given', () => {
    const out = tuneOpusSdp(base, { maxAverageBitrate: 48000 });
    expect(out).toContain('useinbandfec=1');
    expect(out).toContain('usedtx=1');
    expect(out).toContain('maxaveragebitrate=48000');
  });

  it('rounds a fractional bitrate', () => {
    const out = tuneOpusSdp(base, { maxAverageBitrate: 24000.7 });
    expect(out).toContain('maxaveragebitrate=24001');
  });

  it('forces mono with stereo + sprop-stereo = 0', () => {
    const out = tuneOpusSdp(base, { mono: true });
    expect(out).toContain('stereo=0');
    expect(out).toContain('sprop-stereo=0');
  });

  it('is idempotent — re-tuning the same options changes nothing', () => {
    const opts = { maxAverageBitrate: 48000, mono: true };
    const once = tuneOpusSdp(base, opts);
    expect(tuneOpusSdp(once, opts)).toBe(once);
  });

  it('overrides a pre-existing managed value in place', () => {
    const sdp = ['a=rtpmap:111 opus/48000/2', 'a=fmtp:111 stereo=1;maxaveragebitrate=64000'].join('\r\n');
    const out = tuneOpusSdp(sdp, { maxAverageBitrate: 24000, mono: true });
    expect(out).toContain('stereo=0');
    expect(out).toContain('maxaveragebitrate=24000');
    expect(out).not.toContain('stereo=1');
    expect(out).not.toContain('maxaveragebitrate=64000');
  });

  it('inserts an fmtp line with the managed params when none exists', () => {
    const sdp = ['a=rtpmap:111 opus/48000/2', 'a=rtpmap:96 VP8/90000'].join('\r\n');
    const out = tuneOpusSdp(sdp, { maxAverageBitrate: 32000, mono: true }).split('\r\n');
    const idx = out.indexOf('a=rtpmap:111 opus/48000/2');
    expect(out[idx + 1]).toBe('a=fmtp:111 usedtx=1;maxaveragebitrate=32000;stereo=0;sprop-stereo=0');
  });

  it('returns the SDP unchanged when there is no Opus payload', () => {
    const sdp = ['v=0', 'a=rtpmap:96 VP8/90000'].join('\r\n');
    expect(tuneOpusSdp(sdp, { maxAverageBitrate: 48000, mono: true })).toBe(sdp);
  });
});
