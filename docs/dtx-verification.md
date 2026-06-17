# Opus DTX — verification note

Opus DTX (`usedtx=1`) was enabled by munging the local SDP in
[peerLink.ts](../apps/desktop/src/renderer/src/webrtc/peerLink.ts) (`enableOpusDtx`,
applied on both the offer and answer paths). With DTX the encoder stops sending full
frames during silence (its built-in comfort noise covers the gap). This note is the
manual capture procedure + a results table — **WebRTC media can't be verified headlessly**
(see CLAUDE.md "Testing"), so run this on a real two-instance call.

## Setup

1. Start the server, then two desktop instances in the **same room**, headphones on:
   ```powershell
   npm run dev
   # second instance, separate userData slot:
   $env:CHICKADEE_INSTANCE=1; npm run dev:desktop
   ```
2. In a **profiling build** (`CHICKADEE_PROFILE=1` — the test `.env` sets it), press
   **Ctrl+Alt+W** to open the WebRTC Internals window. It's a second window in the same
   Chromium process, so it sees this instance's live `RTCPeerConnection`s. (This frameless
   app has no address bar, so this shortcut is the only way in — see
   [PROFILING.md](../PROFILING.md) "Profiling shortcuts".)

## A. Confirm DTX is negotiated

In the WebRTC Internals window, expand the active `RTCPeerConnection`, open its
`setLocalDescription` event, and find the audio `a=fmtp:<pt>` line in the SDP.

**Pass:** the Opus `a=fmtp` line contains `usedtx=1`, existing params
(`minptime`, `useinbandfec`, …) are intact, and no `maxaveragebitrate` / bitrate field
was added or changed.

## B. Measure `bytesSent` / `packetsSent` during silence

In the WebRTC Internals window, select the **outbound-rtp (audio)** stat and watch the
`bytesSent`/`packetsSent` graphs. Compare the **talking** rate against a **silent**
period for each input mode.

> Reading it: with DTX engaged, the silent-period `packetsSent` slope should fall to
> near-zero (Opus emits only sparse keep-alive/CN frames) versus a steady ~50 pkt/s when
> talking. Use the **slope (rate)**, not the absolute counter.

### Results (fill in)

| Input mode | Talking (pkts/s, ~kbps) | Silent (pkts/s, ~kbps) | DTX engaged? |
|---|---|---|---|
| `ptt` (released = silent) | | | |
| `voice` (VAD closed = silent) | | | |
| `open` + noise reduction (quiet) | | | |

- **`voice` / `ptt`** are the primary success criteria — silent rate should drop to
  near-zero.
- **`open` mode** may drop only partially or not at all: the downward expander's floor
  (default −20 dB, [useNoiseExpander.ts](../apps/desktop/src/renderer/src/hooks/useNoiseExpander.ts))
  can sit above Opus's internal silence threshold, so the encoder still sees signal.
  **This is expected, not a bug** — record what you measured; do not change the expander.

## C. Speech-onset listening check

DTX's known edge case is a clipped first syllable after silence. In `voice` mode, pause,
then start talking — confirm the first word isn't cut. The ~20 ms attack in
[useVoiceActivation.ts](../apps/desktop/src/renderer/src/hooks/useVoiceActivation.ts)
(the VAD loop is throttled to ~50 Hz — still imperceptible) should prevent it.

**Result:** _(pass / clipped — describe)_

## Notes

- If DTX did **not** engage where expected, capture the negotiated fmtp line and the
  per-mode slopes above and flag it — don't silently tune around it.
- Bitrate behavior is unchanged by design; if `webrtc-internals` shows a different
  bitrate range than before, that's a regression to investigate.
