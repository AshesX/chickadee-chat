#include "loopback_capture.h"

#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <wrl/client.h>

#include <algorithm>
#include <atomic>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <thread>
#include <vector>

using Microsoft::WRL::ComPtr;

namespace {

constexpr WORD kChannels = 2;
constexpr DWORD kSampleRate = 48000;
constexpr WORD kBitsPerSample = 16;
// AUDCLNT_STREAMFLAGS_EVENTCALLBACK buffer duration, in 100-ns units (200ms).
constexpr REFERENCE_TIME kBufferDuration = 2000000;

std::mutex g_stateMutex;
std::atomic<bool> g_running{false};
std::thread g_captureThread;
HANDLE g_captureEvent = nullptr;
HANDLE g_stopEvent = nullptr;
HANDLE g_readyEvent = nullptr;
std::atomic<HRESULT> g_startResult{S_OK};
UINT32 g_blockAlign = kChannels * (kBitsPerSample / 8);
Napi::ThreadSafeFunction g_frameTsfn;
// Fired once if capture ends itself (see RunCaptureLoop) instead of via a
// deliberate stop() — so JS can notice its capture died instead of the
// audio just silently going quiet.
Napi::ThreadSafeFunction g_stoppedTsfn;

// Completion handler for the async `ActivateAudioInterfaceAsync` call. Only
// ever used synchronously (we block on `WaitForCompletion` before touching
// its result), so a plain manually-refcounted COM object is enough — no need
// to hand out multiple references.
//
// Must also implement IAgileObject: ActivateAudioInterfaceAsync's modern
// WinRT-flavored implementation requires the completion handler declare
// itself free-threaded (so it can be invoked from its MTA worker thread
// without apartment marshaling) — without it, the call fails synchronously
// with E_ILLEGAL_METHOD_CALL before any activation is even attempted.
class ActivateCompletionHandler : public IActivateAudioInterfaceCompletionHandler, public IAgileObject {
 public:
  ActivateCompletionHandler() : ref_(1) {
    event_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  }

  HRESULT __stdcall QueryInterface(REFIID riid, void** obj) override {
    if (riid == __uuidof(IUnknown) || riid == __uuidof(IActivateAudioInterfaceCompletionHandler)) {
      *obj = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
      AddRef();
      return S_OK;
    }
    if (riid == __uuidof(IAgileObject)) {
      *obj = static_cast<IAgileObject*>(this);
      AddRef();
      return S_OK;
    }
    *obj = nullptr;
    return E_NOINTERFACE;
  }

  ULONG __stdcall AddRef() override { return InterlockedIncrement(&ref_); }

  ULONG __stdcall Release() override {
    const LONG remaining = InterlockedDecrement(&ref_);
    if (remaining == 0) delete this;
    return remaining;
  }

  HRESULT __stdcall ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
    IUnknown* iface = nullptr;
    HRESULT hrActivate = S_OK;
    HRESULT hr = operation->GetActivateResult(&hrActivate, &iface);
    if (SUCCEEDED(hr)) hr = hrActivate;
    if (SUCCEEDED(hr) && iface) {
      hr = iface->QueryInterface(IID_PPV_ARGS(audioClient_.GetAddressOf()));
    }
    if (iface) iface->Release();
    result_ = hr;
    SetEvent(event_);
    return S_OK;
  }

  HRESULT WaitForCompletion(DWORD timeoutMs) {
    return WaitForSingleObject(event_, timeoutMs) == WAIT_OBJECT_0 ? S_OK : E_ABORT;
  }

  HRESULT Result() const { return result_; }
  ComPtr<IAudioClient> TakeAudioClient() { return audioClient_; }

  ~ActivateCompletionHandler() {
    if (event_) CloseHandle(event_);
  }

 private:
  LONG ref_;
  HANDLE event_ = nullptr;
  HRESULT result_ = S_OK;
  ComPtr<IAudioClient> audioClient_;
};

// Activates the special process-loopback virtual audio device, scoped to
// `pid` (and optionally its child processes) instead of the whole system
// mix — this is what keeps Chickadee's own locally-played peer audio out of
// the captured stream by construction, since it lives in a different process.
HRESULT ActivateProcessLoopback(DWORD pid, bool includeTree, ComPtr<IAudioClient>& outClient) {
  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = pid;
  params.ProcessLoopbackParams.ProcessLoopbackMode =
      includeTree ? PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
                  : PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT prop = {};
  prop.vt = VT_BLOB;
  prop.blob.cbSize = sizeof(params);
  prop.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  auto* handler = new ActivateCompletionHandler();
  IActivateAudioInterfaceAsyncOperation* asyncOp = nullptr;
  HRESULT hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &prop,
                                            handler, &asyncOp);
  if (FAILED(hr)) {
    handler->Release();
    if (asyncOp) asyncOp->Release();
    return hr;
  }

  hr = handler->WaitForCompletion(5000);
  if (asyncOp) asyncOp->Release();
  if (SUCCEEDED(hr)) hr = handler->Result();
  if (SUCCEEDED(hr)) outClient = handler->TakeAudioClient();
  handler->Release();

  if (SUCCEEDED(hr) && !outClient) hr = E_FAIL;
  return hr;
}

HRESULT InitializeCapture(ComPtr<IAudioClient>& client, ComPtr<IAudioCaptureClient>& outCapture,
                           HANDLE captureEvent, UINT32* outBlockAlign) {
  WAVEFORMATEX wfx = {};
  wfx.wFormatTag = WAVE_FORMAT_PCM;
  wfx.nChannels = kChannels;
  wfx.nSamplesPerSec = kSampleRate;
  wfx.wBitsPerSample = kBitsPerSample;
  wfx.nBlockAlign = static_cast<WORD>(wfx.nChannels * wfx.wBitsPerSample / 8);
  wfx.nAvgBytesPerSec = wfx.nSamplesPerSec * wfx.nBlockAlign;

  HRESULT hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED,
                                   AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                                   kBufferDuration, 0, &wfx, nullptr);
  if (FAILED(hr)) return hr;

  hr = client->SetEventHandle(captureEvent);
  if (FAILED(hr)) return hr;

  hr = client->GetService(IID_PPV_ARGS(outCapture.GetAddressOf()));
  if (FAILED(hr)) return hr;

  *outBlockAlign = wfx.nBlockAlign;
  return client->Start();
}

// Copies one WASAPI packet and hands it to the JS onFrame callback. Runs on
// the dedicated capture thread; the actual Buffer allocation happens back on
// the JS thread inside the ThreadSafeFunction callback.
void DeliverFrame(const BYTE* data, UINT32 numFrames, DWORD flags) {
  const size_t byteLen = static_cast<size_t>(numFrames) * g_blockAlign;
  auto* chunk = new std::vector<uint8_t>(byteLen);
  if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
    std::fill(chunk->begin(), chunk->end(), uint8_t{0});
  } else {
    std::memcpy(chunk->data(), data, byteLen);
  }

  g_frameTsfn.NonBlockingCall(chunk, [](Napi::Env env, Napi::Function callback, std::vector<uint8_t>* frame) {
    Napi::Buffer<uint8_t> buf = Napi::Buffer<uint8_t>::Copy(env, frame->data(), frame->size());
    delete frame;
    callback.Call({buf});
  });
}

// Drains all WASAPI packets currently available. Returns false if capture
// should stop — either a checked HRESULT failure, or (caught here) a
// structured exception. A process-loopback session is tied to its target
// process, and when that process dies mid-capture (e.g. it crashes) WASAPI
// isn't guaranteed to fail cleanly — GetBuffer can hand back a pointer into
// memory that's no longer valid. This runs on a background thread with no
// other safety net, and this native module runs in-process inside Electron's
// main process, so an uncaught fault here would crash the whole app, not
// just this capture. No C++ objects with destructors are declared in this
// function, so it's safe to mix with __try/__except (MSVC disallows the two
// in a frame that requires C++ object unwinding).
bool DrainAvailablePackets(IAudioCaptureClient* captureClient) {
  __try {
    UINT32 packetLength = 0;
    if (FAILED(captureClient->GetNextPacketSize(&packetLength))) return false;

    while (packetLength != 0) {
      BYTE* data = nullptr;
      UINT32 numFrames = 0;
      DWORD flags = 0;
      if (FAILED(captureClient->GetBuffer(&data, &numFrames, &flags, nullptr, nullptr))) return false;
      if (numFrames > 0) DeliverFrame(data, numFrames, flags);
      captureClient->ReleaseBuffer(numFrames);

      if (FAILED(captureClient->GetNextPacketSize(&packetLength))) return false;
    }
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}

void RunCaptureLoop(IAudioClient* audioClient, IAudioCaptureClient* captureClient) {
  HANDLE waitHandles[2] = {g_captureEvent, g_stopEvent};
  while (g_running.load()) {
    const DWORD wait = WaitForMultipleObjects(2, waitHandles, FALSE, 200);
    if (wait == WAIT_OBJECT_0 + 1) break;  // stop() requested
    if (wait != WAIT_OBJECT_0) continue;   // timeout — re-check g_running

    if (!DrainAvailablePackets(captureClient)) {
      g_running.store(false);
      g_stoppedTsfn.NonBlockingCall();
      break;
    }
  }
  __try {
    audioClient->Stop();
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    // Best-effort: the session may already be invalid if its target process
    // died mid-capture; nothing to do but avoid crashing on the way out.
  }
}

// Entry point for the dedicated capture thread: owns its own COM apartment
// for its whole lifetime (activation, WASAPI calls, and the capture loop all
// run here) so no COM object ever crosses threads without its own apartment.
void CaptureThreadMain(DWORD pid, bool includeTree) {
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(hr)) {
    g_startResult.store(hr);
    SetEvent(g_readyEvent);
    return;
  }

  ComPtr<IAudioClient> audioClient;
  ComPtr<IAudioCaptureClient> captureClient;
  hr = ActivateProcessLoopback(pid, includeTree, audioClient);
  if (SUCCEEDED(hr)) {
    hr = InitializeCapture(audioClient, captureClient, g_captureEvent, &g_blockAlign);
  }

  g_startResult.store(hr);
  SetEvent(g_readyEvent);

  if (SUCCEEDED(hr)) {
    RunCaptureLoop(audioClient.Get(), captureClient.Get());
  }

  audioClient.Reset();
  captureClient.Reset();
  CoUninitialize();
}

class WaitForReadyWorker : public Napi::AsyncWorker {
 public:
  WaitForReadyWorker(Napi::Env env, Napi::Promise::Deferred deferred)
      : Napi::AsyncWorker(env), deferred_(deferred) {}

  void Execute() override {
    const DWORD wait = WaitForSingleObject(g_readyEvent, 6000);
    if (wait != WAIT_OBJECT_0) {
      SetError("timed out waiting for process-loopback capture to start");
      return;
    }
    if (FAILED(g_startResult.load())) {
      char message[96];
      snprintf(message, sizeof(message), "process-loopback activation failed (hr=0x%08lX)",
                static_cast<unsigned long>(g_startResult.load()));
      SetError(message);
    }
  }

  void OnOK() override { deferred_.Resolve(Env().Undefined()); }

  void OnError(const Napi::Error& e) override {
    // Startup failed (or timed out) — the capture thread has already exited
    // (or will momentarily); clean up so a retry isn't blocked by stale state.
    std::lock_guard<std::mutex> lock(g_stateMutex);
    g_running.store(false);
    if (g_captureThread.joinable()) g_captureThread.join();
    if (g_captureEvent) { CloseHandle(g_captureEvent); g_captureEvent = nullptr; }
    if (g_stopEvent) { CloseHandle(g_stopEvent); g_stopEvent = nullptr; }
    if (g_readyEvent) { CloseHandle(g_readyEvent); g_readyEvent = nullptr; }
    g_frameTsfn.Release();
    g_stoppedTsfn.Release();
    deferred_.Reject(e.Value());
  }

 private:
  Napi::Promise::Deferred deferred_;
};

class StopWorker : public Napi::AsyncWorker {
 public:
  StopWorker(Napi::Env env, Napi::Promise::Deferred deferred) : Napi::AsyncWorker(env), deferred_(deferred) {}

  void Execute() override {
    std::lock_guard<std::mutex> lock(g_stateMutex);
    if (g_captureThread.joinable()) g_captureThread.join();
    if (g_captureEvent) { CloseHandle(g_captureEvent); g_captureEvent = nullptr; }
    if (g_stopEvent) { CloseHandle(g_stopEvent); g_stopEvent = nullptr; }
    if (g_readyEvent) { CloseHandle(g_readyEvent); g_readyEvent = nullptr; }
  }

  void OnOK() override {
    g_frameTsfn.Release();
    g_stoppedTsfn.Release();
    deferred_.Resolve(Env().Undefined());
  }

  void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

 private:
  Napi::Promise::Deferred deferred_;
};

}  // namespace

Napi::Value StartCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::lock_guard<std::mutex> lock(g_stateMutex);

  if (g_running.load() || g_captureThread.joinable()) {
    Napi::Error::New(env, "process-loopback capture is already running or still stopping")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (info.Length() < 4 || !info[0].IsNumber() || !info[1].IsBoolean() || !info[2].IsFunction() ||
      !info[3].IsFunction()) {
    Napi::TypeError::New(
        env,
        "expected (pid: number, includeProcessTree: boolean, onFrame: (chunk: Buffer) => void, "
        "onStopped: () => void)")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const DWORD pid = static_cast<DWORD>(info[0].As<Napi::Number>().Uint32Value());
  const bool includeTree = info[1].As<Napi::Boolean>().Value();
  Napi::Function onFrame = info[2].As<Napi::Function>();
  Napi::Function onStopped = info[3].As<Napi::Function>();

  g_frameTsfn = Napi::ThreadSafeFunction::New(env, onFrame, "ProcessLoopbackFrame", 0, 1);
  g_stoppedTsfn = Napi::ThreadSafeFunction::New(env, onStopped, "ProcessLoopbackStopped", 0, 1);

  g_captureEvent = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  g_stopEvent = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  g_readyEvent = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  g_startResult.store(S_OK);
  g_running.store(true);

  g_captureThread = std::thread(CaptureThreadMain, pid, includeTree);

  auto deferred = Napi::Promise::Deferred::New(env);
  (new WaitForReadyWorker(env, deferred))->Queue();
  return deferred.Promise();
}

Napi::Value StopCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto deferred = Napi::Promise::Deferred::New(env);

  const bool wasRunning = g_running.exchange(false);
  bool hasThreadToClean;
  {
    std::lock_guard<std::mutex> lock(g_stateMutex);
    hasThreadToClean = g_captureThread.joinable();
  }

  // Nothing to do: never started, or a previous stop() already cleaned up.
  if (!wasRunning && !hasThreadToClean) {
    deferred.Resolve(env.Undefined());
    return deferred.Promise();
  }

  // The capture thread can also self-stop (a WASAPI failure, or a caught
  // fault in DrainAvailablePackets — e.g. its target process died mid-
  // capture) without this function ever being called, in which case
  // wasRunning is already false here. There's no thread left to wake with
  // g_stopEvent in that case, but StopWorker must still run: skipping it
  // would leave the thread unjoined and its handles/ThreadSafeFunction
  // unreleased, and g_captureThread permanently "joinable" — which would
  // fail every future start() with "already running or still stopping".
  if (wasRunning && g_stopEvent) SetEvent(g_stopEvent);

  (new StopWorker(env, deferred))->Queue();
  return deferred.Promise();
}
