# Chickadee Chat

A lightweight peer-to-peer (P2P) desktop voice/video/screen-share app — "Discord Lite" — for small groups of up to **4 users per session**.

## Tech stack

- **Desktop wrapper:** Electron (via [electron-vite](https://electron-vite.org))
- **Frontend:** React + TypeScript
- **P2P engine:** WebRTC (full-mesh topology)
- **Signaling:** minimal Node.js + WebSocket server (brokers SDP offers/answers + ICE candidates only)

## Architecture

For 4 users we use a **full mesh**: each peer holds a direct WebRTC connection to every other peer (max 3 connections/peer, 6 per room). The signaling server never touches media — it only relays the initial handshake. Once peers connect, audio/video flows directly P2P.

## Monorepo layout

```
chickadee-chat/
├── packages/
│   └── shared/        @chickadee/shared — signaling message contracts (used by client + server)
└── apps/
    ├── desktop/       @chickadee/desktop — Electron + React app
    └── signaling/     @chickadee/signaling — WebSocket signaling server
```

## Getting started

```bash
npm install          # installs all workspaces

npm run dev          # runs signaling server + desktop app together
# or individually:
npm run dev:signaling
npm run dev:desktop

npm run typecheck    # type-check all workspaces
```

## Roadmap

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Scaffolding, signaling server, shared types, "peers see each other join a room" | ✅ Done |
| 2 | WebRTC full-mesh + audio | Next |
| 3 | Video + UI grid + mute/camera toggles | Later |
| 4 | Screen share (`desktopCapturer`) | Later |
| 5 | TURN relay, reconnection, packaging | Later |

> **Note:** Phase 1 includes no WebRTC media yet — it establishes the signaling backbone. The signaling protocol already defines `offer`/`answer`/`ice-candidate` messages so Phase 2 plugs in cleanly.
