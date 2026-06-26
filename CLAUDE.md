# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Chickadee Chat

Lightweight P2P desktop **voice / video / screen-share** app — "Discord Lite" — for small groups of **up to 4 users per video room, 8 per voice room**. Built to call friends and share a game screen. **Windows-first.** The media core, the "Midnight Gamer Lounge" UI, and a portable Windows build are all complete; the renderer's large files have been decomposed and a `vitest` unit-test net guards the pure logic.

## Current state

What the app does today:
- **Full-mesh P2P media:** mesh audio, video, and screen share (≤4 peers/room) with Windows system/game-audio capture (loopback). Configurable signaling URL + STUN/TURN, auto-reconnect + ICE restart.
- **Spaces & rooms:** Spaces group rooms; each room is `voice` (audio-only, 8-cap) or `video` (camera/screen, 4-cap). Spaces are invite-code shareable, with optional per-Space signaling URL + join secret.
- **Voice controls:** input modes — Open Mic / Voice activation (VAD) / Push-to-Talk; global **PTT / mute / deafen** hotkeys (hold or toggle), captured system-wide via `uiohook-napi` + Electron `before-input-event`. Noise **gate** (open-mic expander) vs. Chromium noise **suppression**; mic volume + boost; live mic meter.
- **Output / awareness:** per-peer volume 0–200% (persisted by `userId`) + click-to-silence; "Normalize voices" listener-side auto-level; deafen; output-device selection; speaking indicators; manual status (Online / Idle / DND).
- **Identity:** customizable avatars (canvas crop → 128×128 WebP, synced space-wide), accent colors, display name.
- **Chat:** room chat + emoji reactions over the signaling relay; optional text-to-speech read-aloud with synced per-user voice categories.
- **Shell:** frameless 3-zone lounge (sidebar + room header + grid/presentation + control bar); system tray; taskbar badges + desktop notifications for unread chat when unfocused; compact sidebar-dock mode; drag-resizable sidebar + chat; light/dark themes; custom SVG room icons. Settings persist to Electron `userData`.
- **Packaging:** portable Windows `.exe` via electron-builder.

**Not yet built / deferred:** code-signing (users get a SmartScreen warning), an NSIS installer + auto-update, macOS/Linux builds, and friends "invite to room" (needs a presence channel beyond the in-room model).

## Tech stack

- **Electron 42** (Chromium 148, via electron-vite) — desktop shell, main/preload/renderer split
- **React + TypeScript** — renderer UI
- **WebRTC** — full-mesh P2P media (no SFU). Up to 4 peers = ≤3 connections each
- **Bun + ws** — minimal WebSocket signaling server (brokers the handshake only; never touches media)

## Repo layout (npm workspaces)

```
packages/shared/      @chickadee/shared — signaling protocol + shared types (ESM, type-only on the desktop side)
apps/signaling/       @chickadee/signaling — ws server (bun, in-memory rooms, per-type cap)
apps/desktop/         @chickadee/desktop — Electron + React (CommonJS main/preload, ESM renderer)
scripts/smoke-test.mjs        automated signaling-protocol test
scripts/generate-icons.mjs    regenerates the app icon (resources/icon.ico) from the logo SVG
scripts/free-port.mjs         kills whatever is LISTENING on a port (runs as predev to free :8080)
```

## Commands

```bash
npm install            # root; installs all workspaces
npm run dev            # signaling server + desktop app together (predev frees :8080 first)
npm run dev:signaling  # server only (ws://localhost:8080)
npm run dev:desktop    # app only
npm run build          # build all workspaces
npm run dist           # build a portable Windows .exe → apps/desktop/release/
npm run typecheck      # type-check all workspaces
npm test               # vitest unit tests (pure logic; apps/desktop)
node scripts/smoke-test.mjs   # protocol test — start the server first
```

## Architecture

**Full mesh:** every peer holds a direct `RTCPeerConnection` to every other peer. The signaling server only relays SDP/ICE and presence; once connected, media flows directly P2P.

**Main process** (`apps/desktop/src/main/`):
- `index.ts` — orchestrator: `loadDotEnv`, `buildConfig`, `createWindow`, app lifecycle; calls each module's setup after the BrowserWindow exists.
- `settings.ts` — `loadSettings`/`persistSettings`/`saveSettings`.
- `hotkeys.ts` — PTT/mute state, `registerPushToTalk`, `handleBeforeInput`.
- `tray.ts` — `configureTray`/`rebuildTrayMenu`/`destroyTray`.
- `screenShare.ts` — `desktopCapturer` source listing + `setDisplayMediaRequestHandler`.
- Each `main/` module exports a `set*MainWindow(w)` setter called from `createWindow()`, so it references the window without circular imports.

**Renderer** (each layer builds on the one below):
- `hooks/useSignaling.ts` — WebSocket transport: connection status, `selfId`, presence list (`peers`), `send()`, `subscribe()`. Source of truth for identity + per-peer mute/camera/screen flags. `applyPresenceUpdate(state, msg)` is a pure, **exported**, unit-tested reducer — keep it pure.
- `webrtc/peerLink.ts` — one `RTCPeerConnection`, **perfect-negotiation** (polite/impolite, glare-safe). Manages senders: audio at creation, `setLocalVideoTrack`, `setLocalScreenStream` (add-once then `replaceTrack`). `enableOpusDtx(sdp)` is pure SDP munging (unit-tested).
- `hooks/usePeerMesh.ts` — orchestrator: owns the local mic/camera/screen streams + a `peerLink` per peer (in refs — imperative WebRTC objects don't belong in React state); exposes the `remote` snapshot map + `toggleMic`/`toggleCamera`/`startScreenShare`/`stopScreenShare`. Pure helpers alongside it: `webrtc/mediaConstraints.ts` (`createMicProcessingGraph`, `RESOLUTION_MAP`), `webrtc/meshLogic.ts` (`deriveWants`, `classifyPeerStreams` — unit-tested), `hooks/useAutoClearError.ts` (the mic/camera/screen error toasts).
- `App.tsx` orchestrates the 3-zone shell and delegates to focused hooks:
  - `useSpaces` — `spaces`/`currentSpaceId`/`rooms` + CRUD; **single writer for room persistence** via `updateRooms`.
  - `useSpaceJoin` — Create/Join-a-Space modal state + submit flows.
  - `useControlBarMenus` — chevron + reaction popover open/anchor state + the reaction auto-close timeout.
  - `usePersistedState` — `[value, apply] = usePersistedState(store.getX, store.setX)`; collapses the persisted-setting mirrors.
  - `useKeybindSync` (PTT/mute IPC), `useSfxEvents`, `useTraySync`, `useKeyCapture` (+ `lib/accelerator.ts`), `useSpacePresence` (friends list), `useVoiceActivation` (VAD gate), `useNoiseExpander` (open-mic gate), `useAudioActivity` (self speaking), `useMediaDevices`, `useRoomChat`.
  - libs: `lib/audioContext.ts` (shared `AudioContext` + master-bus limiter + output sink), `lib/tts.ts` + `lib/voices.ts` (chat read-aloud), `lib/settings.ts` (`userData` store), `lib/userColors.ts`, `lib/sfx.ts`.
- **Components:** `Sidebar` (orchestrator; rooms/friends/self-status split into `components/sidebar/` — `SpaceSwitcher`, `RoomRow`, `SidebarSelf`, `RoomContextMenu`, `FriendRow` — + `hooks/useSidebarResize.ts`); `RoomHeader`; grid `ParticipantTile` (a thin shell over `hooks/usePeerAudioGraph.ts` + the hover `TileVolumeControl`) vs. `ScreenView` presentation; `ControlBar`; `ChatPanel`; the anchored popovers `AudioDeviceMenu`/`InputModeMenu`/`VideoMenu`/`ReactionPopover`/`EmojiPickerPopover` (all share the **`ChevronMenu`** primitive — backdrop + viewport-clamped positioning; host the inline `KeybindControl`/`KeybindRow` for PTT/Mute/Deafen); `WelcomeWizard`; `RoomModal`; `SpaceSettingsModal`; `SettingsModal` (shell only — its 8 tabs + primitives + search index live in `components/settings/`; opened via the sidebar cog); `ScreenSharePicker`; `AvatarCropModal`; `Logo`; `RoomIcon`; `Modal`; `ErrorBoundary`. Design tokens in `theme.css`.

## Signaling protocol (`packages/shared/src/index.ts`)

`ClientMessage` (client→server) and `ServerMessage` (server→client) are **separate discriminated unions** (the server stamps `from`; clients only set `to`). Relayed WebRTC messages: `offer`/`answer`/`ice-candidate`.

Room-wide broadcasts follow one **mirror pattern** — adding a new per-peer state means touching the same five places:

1. add a field to `Peer` + a `*-state` message to both unions (`packages/shared/src/index.ts`)
2. init the field + add a `handle*State` broadcast in `apps/signaling/src/index.ts`
3. add a `case` in `applyPresenceUpdate` (`useSignaling.ts`) to update `peers`
4. send it from `usePeerMesh.ts` / `App.tsx` on the local toggle
5. react to it in the mesh `subscribe` handler if it affects media

Examples: `muted` (mic-state), `cameraOn` (cam-state), `screenStreamId` (screen-state), `speaking` (speaking-state), `avatarDataUrl` (avatar-state, space-wide), `voicePreference` (voice-state, room-only), `accentColor` (accent-state, space-wide).

**Space-wide vs room-wide:** most mirror messages broadcast to the room only (`broadcast`); to reach all space members regardless of room, also call `broadcastSpace` (as `handleStatusState`/`handleAvatarState` do). The client applies room-level updates via `applyPresenceUpdate` (updates `peers[]`) and space-level updates via the `space-peer-update` case (updates `spacePresence[]`).

## Key conventions & gotchas

- **`signaling.join` is NOT idempotent.** Every call does `closeSocket()` → reset state to `connecting` → `connect()` (new socket → new `selfId` → `usePeerMesh` rebuilds the whole WebRTC mesh). So the space-level connection effect in `App.tsx` must depend on the **current space's** connection params (`activeSpaceSignalingUrl` / `activeSpaceJoinSecret`, derived just above it), **never the whole `spaces` array** — otherwise editing/deleting *another* space reconnects the active call. (`useSpaces` calls `setSpaces` on space CRUD but not on room edits, so room changes are safe.)
- **Space existence is liveness-based, gated only on new invite-code joins.** The server is in-memory, so a Space "exists" only while ≥1 member is connected (`spaceConnections.has(spaceId)`); it's resurrected from a joining client's local room list each time. A non-mutating `check-space` → `space-status` probe validates existence without joining (honors `CHICKADEE_JOIN_SECRET`). Only **brand-new invite-code joins** are gated (`useSpaces.addSpace`/`initFirstSpace` `await verifySpace` over a throwaway socket → `'exists' | 'not-found' | 'unreachable'`). **Known/locally-persisted Spaces (sidebar switch, reconnect) are never gated** — local persistence (`store.getSpaces()`) is what makes Created Spaces durable. `verifySpace` (in `useSignaling`) uses its own temp `WebSocket`, never `socketRef`, so it can't disturb the persistent connection.
- **Preload module format is load-bearing.** `apps/desktop/package.json` is **NOT** `"type": "module"`, so electron-vite emits **CommonJS** `out/main/index.js` + `out/preload/index.js`, and main loads `../preload/index.js`. If the package becomes ESM the preload emits `index.mjs`, the path silently mismatches, and **`window.chickadee` becomes `undefined`** (→ blank screen). Keep main's preload path and the build output extension in sync.
- **npm 11 gates install scripts (`allowScripts`).** A fresh `npm install` would otherwise skip Electron's postinstall (downloads `electron.exe`) and `uiohook-napi`'s native build, leaving the app unrunnable. Root `package.json` carries a **version-pinned** `allowScripts` allow-list so install runs them. **When you bump Electron or uiohook-napi, re-approve** via `npm approve-scripts <pkg> --allow-scripts-pin`. (Agent shells set `ELECTRON_RUN_AS_NODE=1`; clear it with `env -u ELECTRON_RUN_AS_NODE` to launch Electron rather than run it as Node.)
- **Renderer runs with `sandbox: true`** (`main/index.ts`). The preload uses only sandbox-safe APIs (`contextBridge`/`ipcRenderer`/`webFrame`) and reads config from `process.argv` (`additionalArguments`); `@chickadee/shared` is bundled in (pure TS, no node builtins). Adding a node builtin to the preload breaks it under the sandbox.
- **Runtime config flows main → preload in two channels.** `buildConfig()` reads env (`CHICKADEE_SIGNALING_URL`, `CHICKADEE_TURN_*`; `loadDotEnv()` walks up for a `.env`) and JSON-passes only the small fixed `{ signalingUrl, iceServers, appVersion }` on `--chickadee-config=` argv. **Persisted `settings` is delivered separately over the synchronous `chickadee:get-settings` IPC**, NOT argv — settings include the base64 `avatarDataUrl` and argv has a ~32 KB Windows limit that a larger avatar would overflow → silent fallback to `defaultSettings()`. Both arrive synchronously so `lib/settings.ts` can read `window.chickadee.settings` at module load. `externalizeDepsPlugin({ exclude: ['@chickadee/shared'] })` bundles shared into main/preload.
- **Renderer accesses `window.chickadee` defensively** (optional chaining + guards); the `ErrorBoundary` surfaces any renderer throw instead of blanking.
- **Packaged app defaults to the hosted signaling server** (`wss://chickadee-signaling.onrender.com`, chosen via `app.isPackaged` in `buildConfig`); overridable via env or a `.env` beside the exe. No in-app field for it yet.
- **Signaling in prod runs on Bun** — the `oven/bun` Docker image runs `apps/signaling/src/index.ts` directly (no `tsc`/build; Bun resolves shared's `.ts` entry). `apps/signaling/Dockerfile` builds from the **repo root** context.
- **ICE: STUN + TURN, configurable.** `STUN_SERVERS` always; TURN from `CHICKADEE_TURN_*` env, else a best-effort free public default. Symmetric-NAT internet play needs a real TURN (see README).
- **Resilience:** `useSignaling` auto-reconnects (backoff, `reconnecting` status) and re-joins after a drop; an app-level `ping`/`pong` heartbeat detects half-open sockets. On the re-`welcome` (new `selfId`) `usePeerMesh` rebuilds all links and re-announces mic/cam/screen state; `peerLink` calls `restartIce()` on `failed`. Reconnect is *not* a terminal status, so local media survives the blip.
- **Signaling hardening + access model.** The server is **open by default** (any client with a non-secret `spaceId` can join). It validates/clamps every client field via shared helpers (`sanitizeAvatarDataUrl` — 256 KB + image-mime, `clampString`, `sanitizeStatus`, `sanitizeAccentColor`), sets a WS `maxPayload`, and rate-limits per connection (200 msg/s). Two server-side env vars lock down private deployments: `CHICKADEE_JOIN_SECRET` (clients send a matching `secret` in `join`) and `CHICKADEE_ALLOWED_ORIGINS` (empty = allow all, since the Electron client sends no Origin). Avatars are re-validated client-side before any `<img src>`.
- **Spaces vs rooms — composite room IDs on the server.** The in-memory key is `${spaceId}:${roomId}`. The `join` message carries `spaceId`; clients only see bare `roomId` strings. `spacePresence`/`spaceConnections` track all peers in a space regardless of room (for the friends sidebar). Space metadata clears server-side when the last peer leaves.
- **`useSpaces` is the single writer for room persistence.** All room list mutations (`createRoom`/`renameRoom`/`removeRoom` + the `rooms-updated` sync effect) route through `useSpaces.updateRooms(next)`, which calls both `setRooms` (state) and `store.setRooms` (disk). Don't call `store.setRooms` directly from `App.tsx`.
- **Screen vs camera classification.** A sharer broadcasts its screen `MediaStream.id` via `screen-state`; the receiver matches incoming `ontrack` streams against it (`recomputeRemote` in `usePeerMesh.ts`), robust to message/track ordering (`welcome` carries `screenStreamId` for mid-share joiners). The id-matching decision is the pure, unit-tested `classifyPeerStreams` in `webrtc/meshLogic.ts` (last non-screen id wins); `recomputeRemote` looks the `MediaStream` objects back up so the `cameraStream` reference stays stable.
- **Screen capture path — keep the custom in-app picker.** `desktopCapturer` (main) lists sources over IPC; capture uses `getDisplayMedia()` fulfilled by `setDisplayMediaRequestHandler` in main, with `audio: 'loopback'` for Windows system audio. We use `ScreenSharePicker.tsx` (thumbnails + audio + resolution/fps) with `useSystemPicker: false`. **Don't migrate to Electron's native `useSystemPicker`** — it's macOS-15+-only and experimental (toggle-hang bug electron/electron#45306); on Windows the loopback handler already *is* the native system-audio path.
- **Screen-share audio excludes our own voices via `restrictOwnAudio`** (`usePeerMesh.startScreenShare`). Windows loopback captures the entire output mix — including incoming peer voices we play locally — which made remote peers hear themselves. Fix: request `audio: { restrictOwnAudio: true }` (feature-detected; Chromium 141+ / shipped here), which drops audio originating from our own document while keeping other processes' (the game's). **Do not** route peer voices off `ctx.destination` to "fix" this — `restrictOwnAudio` is the supported path.
- **Shared `AudioContext` — never close it in `usePeerMesh`.** `lib/audioContext.ts` holds the one `AudioContext` shared between `sfx.ts` and `usePeerMesh`. On teardown, `usePeerMesh` disconnects its `GainNode`/`AnalyserNode` but **must not call `audioCtx.close()`** — SFX needs the context to survive join/leave cycles. (`useAudioActivity` has its own separate singleton, intentionally not merged.)
- **Master output bus — connect locally-played audio to `getMasterBus()`, not `ctx.destination`.** `lib/audioContext.ts` exposes `getMasterBus()`, a single brick-wall limiter (`DynamicsCompressorNode`, −1 dBFS, ratio 20) wired once to `ctx.destination`. Everything heard locally (per-peer playback, SFX) connects to it so stacked gains + multiple talkers can't clip. The mic graph (→ `MediaStreamDestination` for WebRTC) and analyser taps intentionally bypass it. The output device is a single property of this one context: set once via `setOutputSink()` (one App effect on `outputDeviceId`), not per-tile.
- **Per-peer incoming-audio graph — use `createMediaStreamSource`, NOT `createMediaElementSource`.** `ParticipantTile` (via `usePeerAudioGraph`) routes each remote peer's audio through the shared context (for >100% gain + the normalize compressor) by sourcing from the **stream**, then muting the `<video>`. `createMediaElementSource` (1) **permanently binds** the element, so React `StrictMode`'s remount throws "already connected", and (2) yields **silence** for remote WebRTC streams in Chromium. The graph rebuild depends on `[cameraStream, isSelf, normalize]`; `cameraStream` identity is stable across camera on/off (`recomputeRemote` reuses the same object). Fallback if no `AudioContext`: `audioRouted` stays false, the `<video>` stays unmuted, and a separate effect applies `el.volume` (0–1) so per-peer volume + Deafen still work (no >100% boost).
- **Per-tile silence = volume 0 (no separate mute state).** The per-tile volume icon toggles silence by setting that peer's volume to `0`, restoring the prior level via a session `lastNonZeroVolumeRef` (per `peer.id`) in `App.tsx`. It routes through `handleVolumeChange`, so silence persists by `userId`. There is intentionally **no** per-peer mute flag — `pvMuted` is just `volume <= 0`.
- **Audio-decision loops run on `setInterval(~20 ms)`, NOT `requestAnimationFrame`.** `useVoiceActivation`, `useNoiseExpander`, and `useAudioActivity` each read an `AnalyserNode` + RMS on a fixed ~50 Hz timer (`COMPUTE_INTERVAL_MS`, timestamped via `performance.now()`). **They must NOT use rAF:** rAF stalls to near-zero when the window is **minimized**, which froze the VAD/expander and dropped background voice. `setInterval` keeps firing at full rate while minimized because `backgroundThrottling:false` protects timers (the same reason PTT/TTS work minimized). The cadence also caps analyser work below the display refresh rate. Gate math is timestamp-based, so cadence affects responsiveness, not correctness.
- **Animations are gated on window focus.** The app pays full animation/paint cost when **visible but unfocused** (e.g. 2nd monitor while a game has focus). `App.tsx` tracks `windowFocused` via `window` focus/blur and toggles `.app--unfocused` on the root; CSS under that class freezes infinite animations (e.g. the presence-dot pulse) while leaving **static** cues intact. Use `window` focus/blur (or main's `isMinimized()`), **not** `document.hidden` — it doesn't flip when the Electron window is merely minimized. New continuous animations should animate `transform`/`opacity` and be gatable under `.app--unfocused`.
- **Speaking cue is one static, accent-colored visual (no ripple).** `ParticipantTile` sets `--accent`/`--accent-glow` CSS vars from the peer's color; `.tile__avatar::after` draws a ring + glow (camera off) and `.tile--speaking` a border + glow (camera on), toggled by `showSpeaking = speaking && windowVisible` (never renders while minimized). It's a static opacity toggle — do not reintroduce a continuously-animated speaking effect.
- **Speaking detection is already lean — don't regress it.** (1) Detection is a single self-only analyser (`useAudioActivity`), and **only in open-mic mode** — PTT/voice modes use `selfSpeaking = transmitting`. Remote peers run no analyser; their state arrives off the wire. (2) The broadcast is **edge-triggered**: the `speaking-state` send is a `useEffect` keyed on the boolean (~8/s worst case via 120 ms debounce), over the signaling WebSocket — not P2P media. (3) Render is a static CSS class toggle. Anti-patterns: do **not** add a per-remote-tile analyser, and do **not** make the broadcast continuous/interval-based.
- **Accent color is a synced profile attribute (mirror pattern, space-wide).** `Peer.accentColor` + `PersistedSettings.accentColor` (`''` = unset). When set it's the user's accent everywhere (avatar gradient/ambient + speaking ring/glow + sidebar entry); when `''` it falls back to the auto color — `useUserColors` (grid) / `SELF_COLOR` gold for self / `userColor(userId)` hash for the sidebar. `App.tsx handleSaveAccent` sends it live; `reannounceLocalState` re-sends on reconnect.
- **Avatar sync is signaling-only, not DataChannel.** `Peer.avatarDataUrl` flows through the signaling server (sent in `join`, included in every `welcome`/`peer-joined`/`space-presence`/`space-peer-update`; live changes via `avatar-state`; re-sent by `reannounceLocalState` on reconnect). **Do not add DataChannels for avatar transfer** — the relay works space-wide (across rooms) while DataChannels are room-only. The local avatar is read from `store.getAvatarDataUrl()`/`localAvatarUrl` as the immediate ground truth; the signaling copy lags one round-trip.
- **Chat TTS (Web Speech) gotchas — `lib/tts.ts` + `lib/voices.ts`.** `speechSynthesis.speak()` self-queues, so messages serialize without a custom queue. Two Chromium quirks handled deliberately: (1) in-flight utterances are held in a module-level `Set` until `onend`/`onerror` so GC can't cut playback off; (2) the `voiceschanged` listener is attached exactly once with an idempotent refresh (voices load async). Gender matching is **heuristic** (no gender field): `voicePreference` syncs a generic **category id**, never a system voice name, + a pitch shift differentiates male/female. The picker controls **how others hear you** — gated by each *listener's* own `chatTtsEnabled`, so it stays enabled regardless of your own read-aloud toggle.
- **Frameless window.** `BrowserWindow({ frame: false })`; the sidebar logo + room header are drag regions (`-webkit-app-region: drag`) with `no-drag` on interactive children; `window.chickadee.windowControls` → IPC → minimize/maximize/close. **Entry flow:** no join form — a first-run `NameModal` (name persisted in `userData`), then clicking a sidebar room calls `signaling.join(...)`. Sidebar room counts are only known for the room you're in. **PTT keys are captured system-wide — pick a key not used in-game.**
- **`win.setResizable()` resets min/max size on Windows — never call it to enforce a width cap.** The compact-dock cap (`COMPACT_MAX_WIDTH` 520) is enforced via `setMaximumSize` + the constructor `maxWidth`, never `setResizable` (calling it after `setMaximumSize` silently wipes the constraints → the sidebar stretches infinitely). The window is created `resizable: true` once; compact handlers only `setMinimumSize`/`setMaximumSize`. Belt-and-suspenders: a `will-resize` listener re-clamps width to `clampCompactWidth` while compact (catches Aero snap / double-click-maximize); the compact width IPCs (`window-set-compact`, `window-set-width`) clamp too.
- **Boost sliders restyle the native range (`-webkit-` only).** `SettingsSlider`'s `boostFrom` prop switches to `.settings-slider--boost`, painting a two-tone track (purple ≤100%, orange >100%) via `::-webkit-slider-runnable-track`; this **replaces** the native `accent-color`. The room chevron-menu + per-tile sliders use the simpler whole-bar `accentColor: orange when >100%` instead.
- **Room SVG icons.** Custom SVGs load dynamically from `apps/desktop/src/renderer/src/assets/room-icons/` via Vite `import.meta.glob` (`query: '?raw'`) in `components/RoomIcon.tsx`, rendered inline with `dangerouslySetInnerHTML` and styled `fill: currentColor !important` so they match active/hover/dimmed text. `RoomModal.tsx` lists them with a search filter.
- **Branding:** the logo lives at `apps/desktop/src/renderer/src/assets/chickadee-logo.svg` (bundled by Vite); shown via `components/Logo.tsx` and rasterized to the tray by `lib/trayIcon.ts` (canvas → PNG data URL → main `Tray`).
- **Dev `userData` is per instance-slot** (`temp/chickadee-dev-<CHICKADEE_INSTANCE|0>`, unpackaged only): a fixed dir so settings persist across restarts, while a 2nd test instance (`CHICKADEE_INSTANCE=1`) stays isolated.
- **Orphaned signaling server on `:8080`:** `concurrently` on Windows doesn't reliably kill the `bun --watch` child on Ctrl-C, so a stale server can keep `:8080` bound. The root `predev` script (`node scripts/free-port.mjs 8080`) frees it before each `dev`; run it manually if you hit the port outside `npm run dev`.
- **Game detection was removed** (Windows `tasklist` scanner + `game-state` mirror) for performance — **do not reintroduce a `game-state` mirror message** expecting it to exist.

## Testing

- **`npm test` — `vitest` unit tests** for the renderer's **pure logic** (`apps/desktop`, node env by default; `*.test.ts`/`*.test.tsx` colocated next to source; standalone `vitest.config.ts`, no electron/React plugin). Covers `lib/audioGate`, `lib/accelerator`, `webrtc/peerLink.enableOpusDtx`, `lib/voices`, the exported `applyPresenceUpdate` reducer, `webrtc/meshLogic` (`deriveWants`/`classifyPeerStreams`), `components/ChevronMenu` (`computeChevronPosition`), and the extracted hooks `useControlBarMenus`/`usePersistedState`/`useSpaceJoin` (these opt into jsdom per-file via `// @vitest-environment jsdom` + `@testing-library/react`). Keep new pure helpers testable: take plain values (ids/booleans), not DOM objects or refs — `meshLogic.ts` is the model (the hook keeps the `MediaStream`s + refs).
- `scripts/smoke-test.mjs` covers the **signaling protocol only** (presence, per-type caps, mute/cam/screen/voice broadcasts + chat relay). Start the server, then run the script.
- **WebRTC media can't be verified headlessly** — this environment can't launch the Electron GUI. Real audio/video/screen needs a **manual two-instance test, same room, with headphones** (mics + system-audio loopback echo otherwise).
- **CI** (`.github/workflows/ci.yml`) runs `npm ci --ignore-scripts` → typecheck → `npm test` → smoke test on every PR + push to `main`.

## Constraints

Per-room cap is type-based: **4** for `video` rooms (full-mesh limit), **8** for `voice`. Signaling is in-memory, single-process, no auth/persistence. Windows-first (system-audio loopback); other platforms fall back to video-only screen share.
