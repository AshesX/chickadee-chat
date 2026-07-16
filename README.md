# Chickadee Chat

Lightweight peer-to-peer desktop **voice / video / screen-share** app — a "Discord Lite" for small groups of **up to 8 people per room**. Built for calling friends and sharing a game screen: no accounts, no media server — audio and video flow directly between peers over WebRTC. **Windows-first.**

Electron + React + TypeScript, with a minimal Bun WebSocket signaling server that only brokers the handshake.

> Architecture, conventions, and detailed project status live in [CLAUDE.md](CLAUDE.md).

## Features

### Calls & video

- **Full-mesh P2P media** — every peer connects directly to every other peer (up to 8 per room); the signaling server never touches media.
- **Hybrid rooms** — every room carries voice, cameras, and screen share; flow between them without switching rooms.
- **Stage spotlight** — one high-quality "stage" stream per room (a spotlighted screen *or* camera) while other cameras stay compressed thumbnails, so an 8-way call stays smooth on home connections. The layout adapts with it: **Voice Lounge** → **Gallery** → **Theater**.
- **Opt-in viewing & upload budget** — video only streams to people who click **Watch**, and outbound stage bitrate is capped by a configurable upload budget (Settings → Video) so a full room can't saturate your uplink.

### Screen share

- **Game & system audio** — Windows loopback capture shares what you hear, and `restrictOwnAudio` keeps your friends' own voices out of the share (no echo for them).
- **In-app source picker** — window/screen thumbnails with audio, resolution, and framerate options.

### Voice & audio

- **Voice activation or Push-to-Talk**, with global **PTT / mute / deafen hotkeys** (hold or toggle) that work system-wide — in-game and minimized.
- **Noise suppression**, mic volume + boost with a live meter.
- **Per-peer volume (0–200%)** with click-to-silence, "Normalize voices" auto-leveling, deafen, and output-device selection.

### Spaces, rooms & moderation

- **Spaces** group rooms and are shareable by invite code — optionally pointing at your own signaling server with a join secret.
- **Moderation** — a transferable **Space Owner** can kick, ban/unban, and lock rooms or the whole Space; an automatic **Room Moderator** (the longest-present member) covers kicks and room locks while the owner is away. All authority is enforced server-side.
- **Room governance** — the owner manages every room; each member can create one room of their own, validated by the server.

### Chat & file sharing

- **Room chat** with emoji reactions, unread taskbar badges, and desktop notifications — plus optional **text-to-speech read-aloud** with synced per-user voice preferences.
- **P2P file transfer** — send files to any online Space member from the sidebar (hover button or drag-and-drop), including multi-file batches (up to 32) behind a single accept prompt. Transfers stream over a dedicated WebRTC DataChannel: 2 GB+ files at flat memory, live progress cards (rate, cancel, "Show in folder"), and an optional auto-accept trust list that saves straight to Downloads.

### Identity & shell

- **Avatars** (in-app crop tool, synced space-wide), **accent colors**, and manual status (Online / Idle / DND).
- **Frameless lounge UI** — light/dark themes, system tray, compact sidebar-dock mode, drag-resizable sidebar and chat panels, and custom SVG room icons. Settings persist locally.

## Quick start (development)

```bash
npm install     # installs all workspaces
npm run dev     # signaling server (ws://localhost:8080) + desktop app together
```

Other scripts: `npm run dev:desktop`, `npm run dev:signaling`, `npm run build`, `npm run typecheck`, `npm test`.

> **npm 11 note:** dependency install scripts are allow-listed in `package.json` (`allowScripts`), so `npm install` automatically downloads Electron's binary and builds `uiohook-napi`. If you bump either package and the app won't launch, re-approve with `npm approve-scripts <pkg> --allow-scripts-pin`.

## Build a Windows `.exe`

Produces a **portable single executable** (no installer — double-click to run) via [electron-builder](https://www.electron.build/):

```bash
npm run dist                    # from the repo root
# or, from apps/desktop:        npm run dist:win
```

Output: `apps/desktop/release/Chickadee Chat-<version>-portable.exe`.

Notes:

- **Windows only.** The app relies on Windows-specific features (system-audio loopback for screen share, the global push-to-talk hook).
- The build is **unsigned**, so on first launch Windows SmartScreen shows a warning → click **More info → Run anyway**. (Code signing needs a certificate and is not set up.)
- The app icon is generated from `apps/desktop/src/renderer/src/assets/chickadee-logo.svg` into `apps/desktop/resources/icon.ico` (committed to the repo). To regenerate it after changing the logo: `npm run icons --workspace @chickadee/desktop`.

## Connecting to a signaling server

The desktop app needs a signaling server to broker the WebRTC handshake (it never relays media):

- **Packaged `.exe`** connects to the hosted server `wss://chickadee-signaling.onrender.com` by default.
- **Dev** (`npm run dev`) uses a local server at `ws://localhost:8080`.

To use a different server, override the URL with **either**:

- a system environment variable: `CHICKADEE_SIGNALING_URL=wss://your-host`, **or**
- a `.env` file placed **next to the `.exe`** (the portable build also searches parent dirs):

  ```env
  CHICKADEE_SIGNALING_URL=wss://your-host
  # optional TURN for symmetric-NAT / internet play (see below)
  CHICKADEE_TURN_URL=turns:your-turn-host:5349
  CHICKADEE_TURN_USERNAME=user
  CHICKADEE_TURN_CREDENTIAL=pass
  ```

Individual Spaces can also point at their own server (URL + join secret) from inside the app, in the Space's settings.

To self-host, deploy from `apps/signaling/` (a `Dockerfile` is provided — build from the repo root; runs on Bun). See [.env.example](.env.example) for all supported keys.

### Security & access model

The signaling server only brokers the WebRTC handshake and presence — it never sees media. By design it is **open**: any client that knows a `spaceId` (which is generated locally and is **not a secret**) can join that space's rooms. For casual use among friends this is fine; for a private deployment, lock it down with these **server-side** env vars:

- `CHICKADEE_JOIN_SECRET` — require every client to present a matching shared secret in its `join` (clients read it from the same `.env` / `CHICKADEE_JOIN_SECRET`). Mismatches are rejected.
- `CHICKADEE_ALLOWED_ORIGINS` — comma-separated `Origin` allowlist (the desktop client sends none, so an empty value allows all).

The server also caps inbound frame size, rate-limits per connection, and validates/clamps all client-supplied fields (names, avatars, room lists, file-offer metadata, and so on). Moderation authority (kicks, bans, locks) is checked server-side too. These mitigations reduce abuse but are **not** end-to-end encryption or authentication — treat a public signaling deployment accordingly.

### Play over the internet

Mesh P2P connects peers directly. Many home networks traverse with STUN alone (always configured), but **symmetric NAT** requires a **TURN relay** to forward media. The app falls back to a best-effort free public TURN, which is rate-limited and unreliable — for real internet play, run your own TURN (e.g. [coturn](https://github.com/coturn/coturn)) and set the `CHICKADEE_TURN_*` variables above.

## Testing

- **Unit tests** — `npm test` runs the Vitest suites in every workspace, covering the pure logic: WebRTC mesh and encoding decisions, signaling arbitration and moderation authority, sanitizers, settings migrations, file-transfer flow control, and more.
- **Signaling smoke test** — `node scripts/smoke-test.mjs` exercises the live protocol end-to-end (start the server first; the moderation phases expect a freshly-started server).
- **Manual media check** — WebRTC audio/video can't be verified headlessly. Run two app instances in the same room, with headphones so speakers don't feed back into microphones.
