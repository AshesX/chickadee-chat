#pragma once

#include <napi.h>

// start(pid: number, includeProcessTree: boolean, onFrame: (chunk: Buffer) => void,
//       onStopped: () => void): Promise<void>
// Resolves once WASAPI process-loopback capture is actually flowing; onFrame is
// then called repeatedly with interleaved 16-bit stereo 48kHz PCM chunks until
// stop() is called. onStopped fires once if capture ends itself instead (e.g.
// the target process died mid-capture) — never on a deliberate stop() call, so
// callers only need it to detect the unexpected case. Only one capture may be
// active at a time.
Napi::Value StartCapture(const Napi::CallbackInfo& info);

// stop(): Promise<void> — idempotent; resolves once the capture thread has
// fully torn down (safe to call start() again after it resolves).
Napi::Value StopCapture(const Napi::CallbackInfo& info);
