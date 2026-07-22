import { describe, expect, it } from 'vitest';
import { buildMicAudioConstraints, buildVideoCaptureConstraints, isStaleDeviceError } from './mediaConstraints';

describe('buildMicAudioConstraints', () => {
  it('pins the exact device when one is chosen', () => {
    expect(buildMicAudioConstraints('mic-1', true, false, true)).toEqual({
      deviceId: { exact: 'mic-1' },
      echoCancellation: true,
      autoGainControl: false,
      noiseSuppression: true,
    });
  });

  it('leaves deviceId undefined (system default) when unset', () => {
    expect(buildMicAudioConstraints('', false, true, false).deviceId).toBeUndefined();
  });
});

describe('buildVideoCaptureConstraints', () => {
  it('maps a known preset + framerate', () => {
    expect(buildVideoCaptureConstraints('720p', '60', '1080p')).toEqual({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60 },
    });
  });

  it('falls back to the given preset for an unknown resolution', () => {
    expect(buildVideoCaptureConstraints('9000p', '30', '1080p')).toEqual({
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    });
  });

  it('falls back to 30 fps for an unparsable framerate', () => {
    expect(buildVideoCaptureConstraints('480p', 'auto', '720p').frameRate).toEqual({ ideal: 30 });
  });
});

describe('isStaleDeviceError', () => {
  it('flags OverconstrainedError (a vanished exact deviceId)', () => {
    expect(isStaleDeviceError(new DOMException('gone', 'OverconstrainedError'))).toBe(true);
  });

  it('flags NotFoundError (no matching device)', () => {
    expect(isStaleDeviceError(new DOMException('gone', 'NotFoundError'))).toBe(true);
  });

  it('does not flag a permission denial', () => {
    expect(isStaleDeviceError(new DOMException('denied', 'NotAllowedError'))).toBe(false);
  });

  it('does not flag a device-busy error', () => {
    expect(isStaleDeviceError(new DOMException('busy', 'NotReadableError'))).toBe(false);
  });

  it('does not flag a non-DOMException value', () => {
    expect(isStaleDeviceError(new Error('boom'))).toBe(false);
  });
});
