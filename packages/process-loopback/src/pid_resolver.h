#pragma once

#include <napi.h>

// Resolves the owning process id for a window handle. JS signature:
//   resolvePidFromHwnd(hwnd: number): number | null
// `hwnd` is the numeric middle segment of an Electron desktopCapturer window
// source id ("window:<hwnd>:<flag>"), which is the raw Win32 HWND value.
Napi::Value ResolvePidFromHwnd(const Napi::CallbackInfo& info);
