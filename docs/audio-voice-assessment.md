# Audio / Voice Implementation & Voice-Boost Feature — Technical Assessment

**Project:** Chickadee Chat (P2P voice/video/screen-share, ≤4 users/room)
**Audience:** Project management (go/no-go) + engineering (validation)
**Subject:** Current audio/voice pipeline, and the new **voice-boost** feature
(per-peer volume 0–200 % + "Normalize voices")
**Status of feature:** Implemented, type-checked, in the working tree — *not yet released*
**Date:** 2026-06-14 · **App version:** 0.1.0

---

## 1. Executive summary

The voice-boost feature lets a listener make any specific person louder (up to 200 %) and
optionally auto-level everyone ("Normalize voices"). It targets a real, common pain in
small-group voice chat — *the one friend who is always too quiet* — and fixes it **on the
listener's side**, without depending on that friend to fix their microphone.

**Verdict: worth shipping.** The feature is cheap to run, isolated in scope (local-only — no
servers, no bandwidth, no effect on other users), and addresses a genuine user need. The one
clipping risk (stacked volume gains distorting at extreme settings) has since been
**addressed** by a master output limiter (see §8) — what remains before release is a manual
QA pass.

| Dimension | Assessment |
|---|---|
| **User value** | High — solves the "quiet friend" problem listener-side |
| **Performance cost** | Negligible (adds 0 background loops; ~2 lightweight audio nodes/peer) |
| **Server / bandwidth cost** | None — entirely local to each client |
| **Blast radius** | Small — local-only; "Normalize" ships **on by default** |
| **Main risk** | Clipping/distortion at high gain — **addressed** by a master limiter (§8) |
| **Recommendation** | **Ship** (master limiter added); manual QA pass recommended |

---

## 2. Scope & terminology

- **Capture** → **Processing** → **Transmit** (send to peers) → **Receive** → **Playback**
  (what you hear). The voice-boost feature lives entirely in **Receive/Playback**.
- **Sender-side** control = changes what *you transmit* to everyone (e.g., your mic gain).
  **Listener-side** control = changes only *what you personally hear* (e.g., making one peer
  louder for yourself). The boost feature is **listener-side**.
- **Boost** = per-peer playback gain that can exceed 100 %. **Normalize** = an automatic
  leveler (compressor) applied to incoming voices.

---

## 3. Current audio/voice architecture

Chickadee uses **full-mesh WebRTC**: every client holds a direct peer connection to each
other client (≤3 connections at the 4-user cap). The signaling server only brokers the
handshake — **it never touches audio**, so none of this costs server CPU or bandwidth.

The audio path, traced from microphone to ear:

```
                          ┌─────────────────── YOUR CLIENT ───────────────────┐
  mic ──getUserMedia──▶ source ─▶ gain(mic vol) ─▶ expanderGain ─▶ streamDest ─┼──WebRTC──▶ peers
   (NS/EC/AGC on)                 │                                            │
                                  └─▶ analyser (tap) ──▶ VAD gate / noise expander / level meter
                          └────────────────────────────────────────────────────┘

                          ┌─────────────────── YOUR CLIENT ───────────────────┐
  peer ──WebRTC──▶ MediaStreamSource ─▶ [compressor ─▶ makeup] ─▶ gain(per-peer vol) ─▶ speakers
   (their voice)          (only if "Normalize" on)            (0–200% boost)            │
                          └────────────────────────────────────────────────────┘
```

### 3.1 Capture (local microphone)
`usePeerMesh.ts` → `ensureLocalStream()` calls `getUserMedia` with Chromium's built-in
constraints: **noise suppression (on)**, **echo cancellation (on)**, **automatic gain control
(on)**. AGC being on by default fixes many "too quiet" cases at the source, complemented by the listener-side
boost.

### 3.2 Local processing graph
`createMicProcessingGraph()` builds: **source → gain (your mic volume/boost) → analyser (tap)
→ expander gain → MediaStreamDestination**. The destination's track is what's sent to peers.
The **analyser** is a read-only tap *before* the transmit stage, so level-based logic always
sees the true mic signal even when transmission is gated shut.

### 3.3 Transmit modes
Three input modes (`PersistedSettings.inputMode`): **open** (always live), **voice** (VAD,
`useVoiceActivation.ts` — opens/closes transmission on speech with attack/release/hysteresis),
and **push-to-talk** (global hotkey). Open mode also offers a **downward expander / soft noise
gate** (`useNoiseExpander.ts`) that fades background noise down between words. Both the VAD and
the expander run a small per-frame loop (see §5).

### 3.4 Transport
`webrtc/peerLink.ts` wraps one peer connection using the "perfect negotiation" pattern
(glare-safe). The processed audio track is attached once per peer; media flows directly P2P.

### 3.5 Receive & playback (per remote peer) — *where the boost lives*
Each remote person's tile (`components/ParticipantTile.tsx`) builds a **per-peer Web Audio
graph** on the shared audio context: **MediaStreamSource → [compressor → makeup gain] (only
when Normalize is on) → gain (per-peer volume) → output**. The on-screen `<video>` element is
muted so audio is heard *only* through this graph (which is what allows >100 % gain). On top of
per-peer gain there is a **master output volume**, a **Deafen** switch (silences everyone), and
**output-device selection** (`setSinkId`).

### 3.6 Supporting systems
- **Speaking indicators** (`useAudioActivity.ts`): drive the grid avatar rings, the sidebar
  avatar outlines, and the green voice-mode button. The path is **detect → edge-triggered
  relay → static render**, and is deliberately lean:
  - **Detect (self only):** one `AnalyserNode` (RMS, ~50 Hz, debounced with hysteresis)
    measures only the **local** mic, and **only in open-mic mode** — PTT/voice modes run no
    analyser (`selfSpeaking = transmitting`, the mic-live gate). Remote peers do **not** each
    run a meter; their state arrives off the wire. It deliberately uses its **own** audio
    context (independent mount/unmount lifecycle).
  - **Relay (not P2P media):** the resulting boolean is broadcast as the `speaking-state`
    mirror message over the **signaling WebSocket** (`App.tsx` → server `handleSpeakingState`
    → room). The send is **edge-triggered** (a `useEffect` keyed on the boolean), so it fires
    only on transitions — ~8/s worst case via the 120 ms debounce, far under the server's
    200 msg/s/conn rate limit.
  - **Render:** a static CSS class toggle (no per-frame animation), gated on window visibility.
  This was reviewed for performance and left as-is; the obvious alternatives (per-tile
  analysers, a continuous/interval broadcast, or deriving remote speaking from RTP
  `getSynchronizationSources().audioLevel` to drop the relay) were rejected as either
  regressions or non-trivial refactors with negligible savings.
- **Sound effects** (`lib/sfx.ts`): short synthesized tones (join/leave/mute/etc.) on the
  shared context.
- **Shared audio context** (`lib/audioContext.ts`): one shared context for the mic graph,
  per-peer playback, and SFX; the speaking-indicator meter is intentionally kept separate.
- **Chat text-to-speech** uses the browser Web Speech API — unrelated to this Web Audio path.

---

## 4. The voice-boost feature

Two related, **listener-side, local-only** capabilities:

### 4.1 Per-peer volume 0–200 %
A slider per person (`components/VolumePopover.tsx`) sets that person's playback gain from
0 % (mute) to 200 % (2× boost); the control turns orange above 100 %. The value is **persisted
by the friend's stable user ID** (`PersistedSettings.peerVolumes`), so "make Bob louder" sticks
across app restarts *and* across Bob reconnecting (which assigns him a new session ID). The
live in-memory map stays keyed by session ID for rendering; a small write-through + hydration
bridge in `App.tsx` keeps the two in sync without ever clobbering an in-session change.

### 4.2 "Normalize voices" (auto-level)
A single global toggle (`PersistedSettings.normalizeVoices`, **default on**, in Settings →
Audio → Processing). When on, each incoming voice passes through a **compressor + fixed makeup
gain** before the per-peer volume node — boosting quiet talkers and taming loud ones
automatically, with no per-person fiddling. Parameters: threshold −28 dB, ratio 4:1, attack
3 ms, release 250 ms, makeup ≈ 1.8× (~+5 dB).

### 4.3 Properties worth noting for PM
- **No protocol/server/bandwidth impact** — nothing is transmitted; this only changes what the
  local user hears.
- **Enabled by default for the automatic part** — Normalize is on by default, so voices are
  leveled automatically out of the box.
- **Maintenance note:** the per-peer playback graph must use the audio *stream* as its source
  (`createMediaStreamSource`). An earlier attempt using the video *element*
  (`createMediaElementSource`) caused a startup crash and silent audio; that is fixed and now
  documented in `CLAUDE.md` to prevent regression.

---

## 5. Performance & overhead

**Bottom line: the feature's marginal cost is effectively zero.** Detail, at the 4-user cap
(so ≤3 remote peers per client):

**Audio-node count (native, C++-backed, cheap):**
- Local mic graph: ~5 nodes (always present, pre-existing).
- Per-peer playback: **2 nodes** with Normalize off (source + gain); **4 nodes** with Normalize
  on (adds compressor + makeup). ×3 peers = 6–12 nodes.
- Speaking-indicator meters: ~2 nodes/stream on the separate context.
- **Total steady state: ~25–30 native nodes.** Web Audio routinely handles hundreds to
  thousands; this is trivial.

**CPU (the figure that actually matters):**
- The only meaningful *ongoing* CPU in the audio system is the **per-frame level loops**
  (`requestAnimationFrame`) used by the VAD gate, the noise expander, and the per-stream
  speaking meters. These compute a small RMS each frame (~60 fps).
- **These loops pre-date the boost feature.** The boost and Normalize add **zero** new loops —
  a gain node and a compressor are native "set-and-forget" nodes with no JS in the audio path.
- ⇒ **Marginal CPU added by the voice-boost feature ≈ nil.** (The compressor is per-peer rather
  than one shared bus, which is a hair more work than a single instance, but still negligible.)

**Memory / disk:** the extra nodes are negligible; the persisted `peerVolumes` map grows by
roughly tens of bytes per remembered friend.

**Network / server:** **none.** Entirely listener-side.

> Numbers above are derived from the code (node graphs in `usePeerMesh.ts` and
> `ParticipantTile.tsx`), not from instrumented profiling. They are conservative; a profiling
> pass is listed in the QA checklist if PM wants hard measurements.

---

## 6. Downsides & risks (candid)

1. **Clipping at high gain — was the one real risk, now addressed.** Gains multiply along the
   chain (per-peer 0–2.0 × master 0–1.0, and with Normalize an extra ~1.8× makeup), and
   multiple peers' audio **sums** into a single output. Pushed hard — or with several people
   talking at once — the combined signal could exceed full scale and **hard-clip (audible
   distortion)**. **Resolved** (see §8): a single master limiter now caps the summed output, so
   no combination of settings can clip.
2. **"Normalize" is not true cross-peer normalization.** It compresses each voice toward *its
   own* curve with a *fixed* makeup gain — it reduces each person's dynamic range but does not
   guarantee two people end up at the *same* perceived loudness, and the fixed makeup can
   under- or over-shoot. It's a solid "good enough" leveler, not studio-grade normalization.
3. **Tone coloration.** Any compressor changes the character of a voice; some users prefer
   untouched audio. Mitigated by shipping **off by default**.
4. **Maintenance surface.** The per-peer graph rebuilds when a stream changes or Normalize is
   toggled; this lifecycle already produced one crash class (now fixed/documented) and remains
   a place future regressions can land.
5. **Echo when not on headphones.** Boosting incoming volume raises the chance your own mic
   re-captures speaker output; echo cancellation (on by default) mitigates but doesn't
   eliminate this.
6. **Platform API dependence.** Output-device selection relies on `setSinkId` (Chromium 110+);
   present in current Electron and degrades gracefully (falls back to the default device) if
   absent.
7. **UX overlap.** There are now three loudness-related controls (your mic gain, this per-peer
   boost/Normalize, and the separate sender-side AGC). Without a hint, users may be unsure
   *why* someone is quiet or which knob to turn. Minor; a one-line in-app hint addresses it.

---

## 7. Benefits

- Directly solves the **"one quiet friend"** problem — the most common voice-chat complaint in
  small groups — **without** relying on that person to change anything.
- **Listener-side and local:** zero server load, zero bandwidth, and no effect on anyone else's
  experience — the safest possible blast radius for a media feature.
- **Cheap:** negligible CPU/memory, no new background loops.
- **Set-and-forget:** per-peer boosts persist by stable user ID across restarts/reconnects.
- **Complementary:** works alongside the existing sender-side AGC rather than replacing it.

---

## 8. Assessment & recommendations

**Overall: ship it.** The cost/benefit is strongly favorable — high-value, low-overhead,
small blast radius, and the automatic part is enabled by default for a premium out-of-the-box experience.

Ordered recommendations:

- **DONE: master output limiter added.** A single `DynamicsCompressorNode` brick-wall limiter
  (threshold −1 dBFS, ratio 20, fast attack) now sits on the shared output bus after the
  per-peer gains sum, via `getMasterBus()` in `lib/audioContext.ts` (per-peer playback and SFX
  both route through it). This caps the combined signal so no combination of boost + Normalize +
  simultaneous talkers can clip. Cost: ~1 node, no perceptible latency, negligible CPU — it
  converts the main risk from "can distort if pushed" to "safe at any setting."
- **SHOULD: run a manual QA pass** before release (see §9). There is no automated audio test —
  WebRTC media can't be verified headlessly — so a short scripted human pass is the safety net.
- **DONE: enable sender-side AGC by default.** Flipping `autoGainControl` on by default fixes many "too quiet" cases at the source, reducing how often the listener needs the boost at all.
- **CONSIDER: a one-line in-app hint** near the volume controls clarifying boost vs. Normalize
  vs. mic settings.
- **CONSIDER (low priority): adaptive makeup** for Normalize (derive makeup from measured gain
  reduction) only if users report uneven leveling. Not needed for launch.

---

## 9. Manual QA checklist for release

Two clients, same room, **on headphones** (open speakers cause mic echo/feedback that masks
results). Ideally test with a deliberately quiet talker and a loud one.

- [ ] Per-peer slider scales volume smoothly 0 → 200 %; 0 % fully mutes that person only.
- [ ] **Clipping check:** set a loud peer to 200 % (and again with Normalize on); have two
      people talk simultaneously — listen for distortion. (This is the case the master limiter
      protects.)
- [ ] Normalize on vs. off A/B: quiet talker becomes clearly more audible; no pumping/breathing
      artifacts; toggling reverts immediately.
- [ ] Persistence: set a peer to ~160 %, restart the app (and separately, have the peer
      leave+rejoin) — the boost returns at 160 %.
- [ ] Deafen silences everyone; undeafen restores per-peer levels.
- [ ] Output-device switch routes audio correctly; falling back to default works.

---

## Appendix — engineering reference index

| Area | File / symbol |
|---|---|
| Mic capture + constraints | `apps/desktop/src/renderer/src/hooks/usePeerMesh.ts` → `ensureLocalStream` |
| Local mic processing graph | `usePeerMesh.ts` → `createMicProcessingGraph` |
| Voice-activation (VAD) gate | `apps/desktop/src/renderer/src/hooks/useVoiceActivation.ts` |
| Open-mic noise expander | `apps/desktop/src/renderer/src/hooks/useNoiseExpander.ts` |
| Speaking-indicator meter | `apps/desktop/src/renderer/src/hooks/useAudioActivity.ts` |
| Per-peer playback graph + boost + Normalize | `apps/desktop/src/renderer/src/components/ParticipantTile.tsx` |
| Per-peer volume UI | `apps/desktop/src/renderer/src/components/VolumePopover.tsx` |
| Shared AudioContext | `apps/desktop/src/renderer/src/lib/audioContext.ts` |
| Sound effects | `apps/desktop/src/renderer/src/lib/sfx.ts` |
| WebRTC peer link | `apps/desktop/src/renderer/src/webrtc/peerLink.ts` |
| Settings (store + getters/setters) | `apps/desktop/src/renderer/src/lib/settings.ts` |
| Settings schema + defaults | `packages/shared/src/index.ts` (`peerVolumes`, `normalizeVoices`, `autoGainControl`) |
| Settings UI (toggles) | `apps/desktop/src/renderer/src/components/SettingsModal.tsx` |
