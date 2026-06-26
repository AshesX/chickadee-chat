# Chickadee Chat

Lightweight P2P desktop **voice / video / screen-share** app — a "Discord Lite" for small groups of **up to 4 people per room**. Built to call friends and share a game screen. Windows-first.

> Architecture, conventions, and detailed status live in [CLAUDE.md](CLAUDE.md).

## Key Features

- **P2P Audio & Video**: Direct WebRTC full-mesh connections (no media relay server) supporting up to 4 users per room.
- **Screen Share with Loopback Audio**: Native system and game audio loopback that automatically filters out incoming peer voices (`restrictOwnAudio`).
- **Global Hotkeys**: Push-to-Talk and Mute hotkeys that work system-wide even when the application is minimized or out-of-focus (powered by `uiohook-napi`).
- **Advanced Audio Controls**: Per-peer volume controls (0–200%) and "Normalize voices" (listener-side automatic volume leveling).
- **Customizable Avatars**: In-app crop tool with avatars synchronized space-wide over the signaling connection.
- **Chat Text-to-Speech (TTS)**: Web Speech API-driven read-aloud support for incoming room chat, with synchronized voice category preferences.
- **Resizable Layout & Compact Mode**: Drag-resizable sidebar and room chat panels, alongside a toggleable compact sidebar-dock.
- **SVG Room Icons**: In-app icon browser and filter for customizable room SVGs.


## Quick start (development)

```bash
npm install     # installs all workspaces
npm run dev     # signaling server (ws://localhost:8080) + desktop app together
```

Other scripts: `npm run dev:desktop`, `npm run dev:signaling`, `npm run build`, `npm run typecheck`, `npm test`.

> **npm 11 note:** dependency install scripts are allow-listed in `package.json` (`allowScripts`), so `npm install` automatically downloads Electron's binary. If you bump Electron or `uiohook-napi` and the app won't launch, re-approve with `npm approve-scripts <pkg> --allow-scripts-pin`.

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

To self-host, deploy from `apps/signaling/` (a `Dockerfile` is provided — build from the repo root; runs on Bun). See [.env.example](.env.example) for all supported keys.

### Security & access model

The signaling server only brokers the WebRTC handshake and presence — it never sees media. By design it is **open**: any client that knows a `spaceId` (which is generated locally and is **not a secret**) can join that space's rooms. For casual use among friends this is fine; for a private deployment, lock it down with these **server-side** env vars:

- `CHICKADEE_JOIN_SECRET` — require every client to present a matching shared secret in its `join` (clients read it from the same `.env` / `CHICKADEE_JOIN_SECRET`). Mismatches are rejected.
- `CHICKADEE_ALLOWED_ORIGINS` — comma-separated `Origin` allowlist (the desktop client sends none, so an empty value allows all).

The server also caps inbound frame size and rate-limits per connection to blunt resource-abuse, and validates/clamps all client-supplied fields (names, avatars, etc.). These mitigations reduce abuse but are **not** end-to-end encryption or authentication — treat a public signaling deployment accordingly.

### Play over the internet

Mesh P2P connects peers directly. Many home networks traverse with STUN alone (always configured), but **symmetric NAT** requires a **TURN relay** to forward media. The app falls back to a best-effort free public TURN, which is rate-limited and unreliable — for real internet play, run your own TURN (e.g. [coturn](https://github.com/coturn/coturn)) and set the `CHICKADEE_TURN_*` variables above.

## Testing

- **Unit Tests**: Run `npm test` to execute the Vitest suite covering pure offline logic (audio gates, keybind string conversion, SDP munging, voice preferences, and WebRTC mesh logic).
- **Signaling Smoke Test**: Run `node scripts/smoke-test.mjs` to exercise the signaling protocol (start the server first).
- **Manual Verification**: WebRTC media is verified manually with two instances in the same room (use headphones so each mic doesn't re-capture the other peer's voice from your speakers). Screen sharing with system audio no longer relays peers' voices back to them — the loopback capture sets `restrictOwnAudio` to drop our own output (requires Chromium 141+, i.e. Electron 39+).
