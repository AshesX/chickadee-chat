import { describe, it, expect } from 'vitest';
import { enableOpusDtx } from './peerLink';

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
