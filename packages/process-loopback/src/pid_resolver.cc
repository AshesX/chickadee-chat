#include "pid_resolver.h"

#include <windows.h>

Napi::Value ResolvePidFromHwnd(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "resolvePidFromHwnd expects a numeric hwnd").ThrowAsJavaScriptException();
    return env.Null();
  }

  const int64_t raw = info[0].As<Napi::Number>().Int64Value();
  const HWND hwnd = reinterpret_cast<HWND>(static_cast<uintptr_t>(raw));

  DWORD pid = 0;
  const DWORD threadId = GetWindowThreadProcessId(hwnd, &pid);
  if (threadId == 0 || pid == 0) {
    return env.Null();
  }

  return Napi::Number::New(env, static_cast<double>(pid));
}
