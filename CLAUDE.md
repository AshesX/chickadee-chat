# Chickadee Chat

Lightweight P2P desktop **voice / video / screen-share** app — "Discord Lite" — for small groups of **up to 4 users per room**. Built to call friends and share a game screen.

## Status

Phases 1–5 complete (media core): presence, mesh **audio**, **video**, **screen share**, and **connectivity/resilience** (configurable signaling URL + STUN/TURN, auto-reconnect + ICE restart, signaling Dockerfile).

**Phase 6 = "Midnight Gamer Lounge" redesign** (`chickadee-redesign-handoff.md` + `chickadee-redesign.jsx`), split into sub-phases on top of the media core:
- **6A — done (visual):** design system (`theme.css` tokens + animations, bundled Outfit font, lucide-react icons), 3-zone lounge layout (sidebar + header + grid/presentation + control bar), redesigned `ParticipantTile` (per-user colors, speaking ripples), rooms sidebar (switch = leave+join; only the current room shows a live count), first-run name modal → lounge entry, session timer, **frameless window** + custom window controls. New-feature buttons are stubbed; chat panel = local-echo shell; friends section empty.
- **6B — done (chat):** room chat + emoji reactions over the **signaling relay** (`useRoomChat`; `chat` = ephemeral relayed event), + **game-activity plumbing** (`game-state` mirror → `Peer.game` → tile tag) ready for 6D.
- **6C — done (friends + persistence):** prefs now live in Electron **`userData`** (`settings.json` read in main, handed to the renderer via the config bridge, written back over IPC; `lib/settings.ts`). Friends are auto-remembered by a **stable `userId`** (minted in main, sent on `join`, echoed on `Peer`) with **in-room presence** (`useFriends`: online + "in <room>" only for peers in your current room).
- **6D-i — done (voice controls):** true **push-to-talk** + **mute mic** global hotkeys with **hold** or **toggle** mode (persisted). Hold: mic live only while key physically held; toggle: press to unmute/mute. Powered by `uiohook-napi` (global OS hook, fires when app is out-of-focus/minimized) + Electron's `before-input-event` (fires when window is in focus — Chromium consumes keys before the OS hook fires). Both sources orchestrate via `updateUiohookState` in main to handle multiple binds gracefully. `backgroundThrottling:false` keeps the renderer responsive while minimized. Also: **noise suppression** via Chromium's `noiseSuppression` constraint, **mic volume + boost** via `GainNode` and live audio visualizer via `AnalyserNode`, and a **responsive Settings modal** (redesigned layout, subdivisions, key unbind affordance).
- **6D-ii — done (awareness/output):** **game detection** (main scans via Windows `tasklist` against `userData/games.json` → `game-detected` IPC → renderer broadcasts `game-state`; tile short tags + self-status/header full name), **per-peer volume** sliders (`VolumePopover`), **Deafen Mode** (mutes all incoming peer audio), **manual status overrides** (Online, Idle, DND broadcast via `status-state`), **taskbar/tray badges** and **desktop notifications** for unread chat messages when unfocused, and a **tray** (logo rasterized via canvas → main `Tray`; menu = show / current room / toggle mic / quit). **Phase 6 complete.**
- **Later** — packaging to `.exe` (electron-builder); intentionally deferred.

## Tech stack

- **Electron** (via electron-vite) — desktop shell, main/preload/renderer split
- **React + TypeScript** — renderer UI
- **WebRTC** — full-mesh P2P media (no SFU). Up to 4 peers = ≤3 connections each
- **Node + ws** — minimal WebSocket signaling server (brokers the handshake only; never touches media)

## Architecture

**Full mesh:** every peer holds a direct `RTCPeerConnection` to every other peer. The signaling server only relays SDP/ICE and presence; once connected, media flows directly P2P.

Main-process layers (`apps/desktop/src/main/`):
- `index.ts` — orchestrator: `loadDotEnv`, `buildConfig`, `createWindow`, app lifecycle. Calls each module's setup function after the BrowserWindow is created.
- `settings.ts` — `loadSettings`, `persistSettings`, `saveSettings`; hands settings to the renderer via `additionalArguments`.
- `gameDetection.ts` — `GameDef`, `DEFAULT_GAMES`, `loadGamesList`, `startGameDetection` (Windows `tasklist` poll → `game-detected` IPC).
- `hotkeys.ts` — PTT/mute module state, `registerPushToTalk`, `handleBeforeInput`. Exports `setHotkeyMainWindow(w)` so it can reference the BrowserWindow without circular imports.
- `tray.ts` — `configureTray`, `rebuildTrayMenu`, `destroyTray`. Exports `setTrayMainWindow(w)`.
- `screenShare.ts` — `configureScreenShare`; IPC handlers for `chickadee:get-screen-sources` / `chickadee:set-share-source`.

Renderer layers (each builds on the one below):
- `hooks/useSignaling.ts` — WebSocket transport: connection status, `selfId`, presence list (`peers`), `send()`, and `subscribe()` for raw inbound messages. Source of truth for **identity + per-peer mute/camera/screen flags**. `applyPresenceUpdate(state, msg): SignalingState` is a module-private pure reducer handling all server-message state transitions.
- `webrtc/peerLink.ts` — one `RTCPeerConnection`, **perfect-negotiation** pattern (polite/impolite, glare-safe). Manages senders: audio (at creation), `setLocalVideoTrack`, `setLocalScreenStream` (add-once then `replaceTrack`).
- `hooks/usePeerMesh.ts` — orchestrator: owns the local mic/camera/screen streams and a `peerLink` per peer (in refs; imperative WebRTC objects don't belong in React state). Exposes render snapshots (`remote` map) + `toggleMic`/`toggleCamera`/`startScreenShare`/`stopScreenShare`.
- UI (Phase 6A lounge): `App.tsx` (~660 lines) orchestrates the 3-zone shell and delegates to focused hooks:
  - `hooks/useSpaces.ts` — owns `spaces`/`currentSpaceId`/`rooms` state + CRUD (`switchSpace`, `addSpace`, `deleteSpace`, `initFirstSpace`, `updateRooms`). `updateRooms` is `useCallback`-stable; all room list mutations route through it.
  - `hooks/useKeybindSync.ts` — PTT/mute IPC registration and toggle/hold subscriptions.
  - `hooks/useSfxEvents.ts` — join/leave/mute SFX effects; prev-value refs kept internally.
  - `hooks/useTraySync.ts` — tray icon (once on mount), room label sync, mute/deafen IPC.
  - `hooks/useKeyCapture.ts` + `lib/accelerator.ts` — keybind capture state and DOM key → Electron accelerator string, used by `SettingsModal`.
  - `lib/audioContext.ts` — shared `AudioContext` singleton used by `sfx.ts` and `usePeerMesh`.
  Components: `Sidebar.tsx` (rooms/friends/self-status; right-click context menu for rename/remove), `RoomHeader.tsx` (status badge, toggles, `WindowControls`), grid (`ParticipantTile`) vs. `ScreenView` presentation, `ControlBar.tsx`, `ChatPanel.tsx`, `VolumePopover`, `WelcomeWizard`, `RoomModal` (create + rename), `SettingsModal` (via sidebar cog only), `Modal`, `ErrorBoundary`. Design tokens in `theme.css`; `lib/userColors.ts` (per-session accent colors, self always gold), `lib/settings.ts` (Electron `userData` via the config bridge), `hooks/useSessionTimer.ts`.

## Repo layout (npm workspaces)

```
packages/shared/      @chickadee/shared — signaling protocol + shared types (ESM, type-only on the desktop side)
apps/signaling/       @chickadee/signaling — ws server (tsx, in-memory rooms, 4-peer cap)
apps/desktop/         @chickadee/desktop — Electron + React (CommonJS main/preload, ESM renderer)
scripts/smoke-test.mjs  automated signaling-protocol test
```

## Commands

```bash
npm install            # root; installs all workspaces
npm run dev            # signaling server + desktop app together
npm run dev:signaling  # server only (ws://localhost:8080)
npm run dev:desktop    # app only
npm run build          # build all workspaces
npm run typecheck      # type-check all workspaces
node scripts/smoke-test.mjs   # protocol test — start the server first
```

## Signaling protocol (`packages/shared/src/index.ts`)

`ClientMessage` (client→server) and `ServerMessage` (server→client) are **separate discriminated unions** (the server stamps `from`; clients only set `to`). Relayed WebRTC messages: `offer`/`answer`/`ice-candidate`. Room-wide broadcasts follow one **mirror pattern** — adding a new per-peer state means touching the same five places:

1. add a field to `Peer` + a `*-state` message to both unions (`packages/shared/src/index.ts`)
2. init the field + add a `handle*State` broadcast in `apps/signaling/src/index.ts`
3. add a `case` in `useSignaling.ts` to update `peers`
4. send it from `usePeerMesh.ts` on the local toggle
5. react to it in the mesh `subscribe` handler if it affects media

Existing examples: `muted` (mic-state), `cameraOn` (cam-state), `screenStreamId` (screen-state). Reuse this template.

## Key conventions & gotchas

- **Preload module format is load-bearing.** `apps/desktop/package.json` is **NOT** `"type": "module"`, so electron-vite emits **CommonJS** `out/main/index.js` and `out/preload/index.js`, and main loads `../preload/index.js`. If the package becomes ESM, the preload emits `index.mjs` and the path silently mismatches → **`window.chickadee` is `undefined`** (this caused the Phase 4 blank-screen bug). Keep main's preload path and the build output extension in sync.
- **Screen vs camera classification:** a sharer broadcasts its screen `MediaStream.id` via `screen-state`; the receiver matches incoming `ontrack` streams against it (`recomputeRemote` in `usePeerMesh.ts`), robust to message/track ordering. `welcome` carries `screenStreamId` so mid-share joiners classify correctly.
- **Screen capture path:** `desktopCapturer` (main only) lists sources over IPC for the picker; capture uses `getDisplayMedia()` fulfilled by `setDisplayMediaRequestHandler` in main, with `audio: 'loopback'` for Windows system/game audio. The legacy `getUserMedia({ chromeMediaSource })` path was unreliable.
- **Dev `userData` is per instance-slot** (`temp/chickadee-dev-<CHICKADEE_INSTANCE|0>`, unpackaged only): a fixed dir so settings persist across restarts, while a 2nd test instance (`CHICKADEE_INSTANCE=1`) stays isolated. (Was per-pid, which lost settings each launch.)
- **Renderer accesses `window.chickadee` defensively** (optional chaining + guards); the `ErrorBoundary` surfaces any renderer throw instead of blanking.
- **Runtime config flows main → preload via `additionalArguments`.** Main's `buildConfig()` reads env (`CHICKADEE_SIGNALING_URL`, `CHICKADEE_TURN_*`; `loadDotEnv()` walks up for a `.env`) and JSON-passes `{ signalingUrl, iceServers }` on `--chickadee-config=` in argv; the preload parses it and exposes both on `window.chickadee`. (Chosen over preload `process.env` for reliability.) Because main/preload now import runtime values from shared, `externalizeDepsPlugin({ exclude: ['@chickadee/shared'] })` bundles shared into them.
- **ICE: STUN + TURN, configurable.** `STUN_SERVERS` always; TURN from `CHICKADEE_TURN_*` env, else a best-effort free public default (`PUBLIC_TURN_SERVERS`). Symmetric-NAT internet play needs a real TURN — see README "Play over the internet".
- **Resilience:** `useSignaling` auto-reconnects (backoff, `reconnecting` status) and re-joins after a drop; an app-level `ping`/`pong` heartbeat detects half-open sockets (server also runs a ws-level heartbeat to drop dead peers). On the re-`welcome` (new `selfId`) `usePeerMesh` rebuilds all links and re-announces mic/cam/screen state. `peerLink` calls `restartIce()` on `failed` (glare-safe). Reconnect is *not* a terminal status, so local media survives the blip.
- **Signaling in prod runs via `tsx`** (not a `tsc` build) to avoid resolving shared's `.ts` entry; `apps/signaling/Dockerfile` builds from the **repo root** context.
- **Frameless window (6A):** `BrowserWindow({ frame: false })`; the sidebar logo + room header are drag regions (`-webkit-app-region: drag`) with `no-drag` on interactive children (`.pill`, `.winctl`); `window.chickadee.windowControls` → IPC → minimize/maximize/close. **Entry flow:** no join form — a first-run `NameModal` (name persisted in `userData` settings), then clicking a sidebar room calls `signaling.join(room, name, userId)` (switching rooms just re-joins; the server allows arbitrary room ids). Sidebar room counts are only known for the room you're in.
- **Shared AudioContext — do not close it in usePeerMesh:** `lib/audioContext.ts` holds the one `AudioContext` singleton shared between `sfx.ts` and `usePeerMesh`. When `usePeerMesh` tears down (leave/reconnect), it disconnects the `GainNode`/`AnalyserNode` but **must not call `audioCtx.close()`** — the SFX system needs the context to survive join/leave cycles. `useAudioActivity.ts` has its own separate singleton (speech detection; intentionally not merged).
- **Main-process module boundaries:** `main/index.ts` is now an orchestrator only — PTT/mute state lives in `main/hotkeys.ts`, tray in `main/tray.ts`, game scanning in `main/gameDetection.ts`. Each exports a `set*MainWindow(w)` setter called from `createWindow()` after the BrowserWindow is created; this is how the modules reference the window without circular imports.
- **`useSpaces` is the single writer for room persistence:** all room list mutations (`createRoom`, `renameRoom`, `removeRoom`, and the signaling `rooms-updated` sync effect) route through `useSpaces.updateRooms(next)`, which calls both `setRooms` (React state) and `store.setRooms` (disk). Do not call `store.setRooms` directly from App.tsx.
- **Phase 6 feature set is fully real.** Intentionally still absent: friends "invite to room" (needs a presence channel beyond the in-room model). Game detection is **Windows-only** (`tasklist`); other OSes report no game. PTT key is captured system-wide — pick a key not used in-game.
- **Branding:** the real logo lives at `apps/desktop/src/renderer/src/assets/chickadee-logo.svg` (bundled by Vite); shown via `components/Logo.tsx` in the sidebar, name modal, and empty-lounge, and rasterized to the system tray by `lib/trayIcon.ts` (canvas → PNG data URL → main `Tray`). No more placeholder emoji.
- **Remaining (post-Phase-6):** packaging/distribution to `.exe` (electron-builder); the window/taskbar/app icons (separate from the in-app + tray logo) are part of that packaging step.

## Testing

- `scripts/smoke-test.mjs` covers the **signaling protocol only** (presence, 4-peer cap, mute/cam/screen broadcasts). Run the server, then the script.
- **WebRTC media can't be verified headlessly** — this environment can't launch the Electron GUI. Real audio/video/screen needs a **manual two-instance test, same room, with headphones** (mics + system-audio loopback echo otherwise).

## Constraints

`MAX_PEERS_PER_ROOM = 4` (full-mesh limit). Signaling is in-memory, single-process, no auth/persistence. Windows-first (system-audio loopback); other platforms fall back to video-only screen share.
