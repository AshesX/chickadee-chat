# Chickadee Chat

Lightweight P2P desktop **voice / video / screen-share** app — "Discord Lite" — for small groups of **up to 4 users per room**. Built to call friends and share a game screen.

## Status

Phases 1–4 complete and manually verified: presence, mesh **audio** (mute + speaking indicator), **video** (adaptive grid + camera toggle), and **screen share** (separate stream + Windows system audio, presentation layout).

Roadmap ahead:
- **Phase 5** — TURN server (cross-NAT internet play) + reconnection/resilience.
- **Phase 6** — UI improvements & quality-of-life changes.
- **Later** — packaging/distribution to `.exe` (electron-builder); intentionally deferred.

## Tech stack

- **Electron** (via electron-vite) — desktop shell, main/preload/renderer split
- **React + TypeScript** — renderer UI
- **WebRTC** — full-mesh P2P media (no SFU). Up to 4 peers = ≤3 connections each
- **Node + ws** — minimal WebSocket signaling server (brokers the handshake only; never touches media)

## Architecture

**Full mesh:** every peer holds a direct `RTCPeerConnection` to every other peer. The signaling server only relays SDP/ICE and presence; once connected, media flows directly P2P.

Renderer layers (each builds on the one below):
- `hooks/useSignaling.ts` — WebSocket transport: connection status, `selfId`, presence list (`peers`), `send()`, and `subscribe()` for raw inbound messages. Source of truth for **identity + per-peer mute/camera/screen flags**.
- `webrtc/peerLink.ts` — one `RTCPeerConnection`, **perfect-negotiation** pattern (polite/impolite, glare-safe). Manages senders: audio (at creation), `setLocalVideoTrack`, `setLocalScreenStream` (add-once then `replaceTrack`).
- `hooks/usePeerMesh.ts` — orchestrator: owns the local mic/camera/screen streams and a `peerLink` per peer (in refs; imperative WebRTC objects don't belong in React state). Exposes render snapshots (`remote` map) + `toggleMic`/`toggleCamera`/`startScreenShare`/`stopScreenShare`.
- UI: `App.tsx` (join form, room bar, grid vs. presentation layout), `components/ParticipantTile.tsx` (camera tile + avatar fallback + speaking ring), `components/ScreenView.tsx`, `components/ScreenSharePicker.tsx`, `components/ErrorBoundary.tsx`.

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
- **Dev `userData` is per-instance** (`temp/chickadee-dev-<pid>`, unpackaged only) so two clients run side-by-side without cache-lock errors.
- **Renderer accesses `window.chickadee` defensively** (optional chaining + guards); the `ErrorBoundary` surfaces any renderer throw instead of blanking.
- **STUN only today** (`stun:stun.l.google.com:19302`). Cross-NAT internet play needs **TURN** (Phase 5) — pure P2P fails behind symmetric NAT.

## Testing

- `scripts/smoke-test.mjs` covers the **signaling protocol only** (presence, 4-peer cap, mute/cam/screen broadcasts). Run the server, then the script.
- **WebRTC media can't be verified headlessly** — this environment can't launch the Electron GUI. Real audio/video/screen needs a **manual two-instance test, same room, with headphones** (mics + system-audio loopback echo otherwise).

## Constraints

`MAX_PEERS_PER_ROOM = 4` (full-mesh limit). Signaling is in-memory, single-process, no auth/persistence. Windows-first (system-audio loopback); other platforms fall back to video-only screen share.
