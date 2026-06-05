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
node scripts/smoke-test.mjs   # signaling protocol test (start the server first)
```

By default the app connects to a local signaling server (`ws://localhost:8080`) and uses STUN plus a best-effort free public TURN — so two clients work on the same machine/LAN out of the box.

## Configuration

Copy `.env.example` to `.env` (loaded by the desktop app) to override defaults:

| Variable | Purpose |
|----------|---------|
| `CHICKADEE_SIGNALING_URL` | Signaling server URL (use `wss://` over the internet) |
| `CHICKADEE_TURN_URL` | Your TURN server URL(s), comma-separated (replaces the public default) |
| `CHICKADEE_TURN_USERNAME` / `CHICKADEE_TURN_CREDENTIAL` | TURN credentials |
| `PORT` | Signaling server listen port (default `8080`) |

## Play over the internet

To call friends across different networks you need two things publicly reachable:

1. **Signaling server.** Host it anywhere that gives you a TLS URL:
   ```bash
   docker build -f apps/signaling/Dockerfile -t chickadee-signaling .
   docker run -p 8080:8080 chickadee-signaling
   ```
   Or deploy to Render/Fly/a VPS. Put it behind HTTPS so clients use `wss://…`, then set `CHICKADEE_SIGNALING_URL=wss://your-host` on every client.

2. **TURN relay.** Symmetric NAT (common on home routers) blocks pure P2P. The bundled free public TURN is best-effort and may be rate-limited or down — for reliable play, run your own [coturn](https://github.com/coturn/coturn) (or use a hosted TURN) and set the `CHICKADEE_TURN_*` vars.

Calls auto-reconnect through brief network drops (WebSocket backoff + WebRTC ICE restart).

## Roadmap

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Scaffolding, signaling, presence | ✅ Done |
| 2 | WebRTC full-mesh + audio, mute, speaking indicator | ✅ Done |
| 3 | Video + adaptive grid + camera toggle | ✅ Done |
| 4 | Screen share (`desktopCapturer` + system audio) | ✅ Done |
| 5 | TURN config, public signaling, reconnection/ICE-restart | ✅ Done |
| 6 | UI improvements & quality-of-life | Next |
| Later | Packaging to `.exe` (electron-builder) | Deferred |
