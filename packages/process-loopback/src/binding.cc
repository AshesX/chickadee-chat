#include <napi.h>

#include "loopback_capture.h"
#include "pid_resolver.h"

namespace {

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("resolvePidFromHwnd", Napi::Function::New(env, ResolvePidFromHwnd));
  exports.Set("start", Napi::Function::New(env, StartCapture));
  exports.Set("stop", Napi::Function::New(env, StopCapture));
  return exports;
}

}  // namespace

NODE_API_MODULE(process_loopback, Init)
