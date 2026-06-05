# Chickadee Chat — UI Redesign Handoff
**For:** Claude Code (coding agent)
**Project:** Chickadee Chat — Electron voice/video app for co-op gamers (max 4 players)
**Scope:** Full UI redesign + new feature additions
**Reference prototype:** `chickadee-redesign.jsx` (included alongside this document — render it to see the target state)

---

## 1. Context & Goals

The current app is functional but bare-bones. The redesign targets:

- A **"Midnight Gamer Lounge"** aesthetic: very dark navy, glassmorphic panels, purple-to-blue brand gradient
- Matching the brand identity of the logo (purple/blue gradient chickadee bird)
- Gamer-first features: speaking indicators, game activity display, rooms, friends list, quick reactions
- Lightweight feel preserved — no heavy frameworks, keep it performant

The target audience is small groups (2–4 players) playing co-op games together.

---

## 2. Design System

### 2.1 Color Tokens

Define these as CSS custom properties on `:root` (or in a dedicated `theme.css`):

```css
:root {
  --bg:          #06060f;   /* Page background */
  --panel:       #0a0a1c;   /* Sidebar, header, footer panels */
  --card:        #0e0e23;   /* Video tiles, chat panel */
  --border:      #171736;   /* All dividers and borders */
  --dim:         #353570;   /* Muted/secondary text, inactive labels */
  --text:        #e0deef;   /* Primary text */
  --text-sub:    #aeaccc;   /* Secondary text (chat messages) */

  /* Brand gradient — use on logo, active states, send button */
  --gradient:    linear-gradient(135deg, #7c3aed, #3b82f6);

  /* Status colors */
  --online:      #22c55e;
  --idle:        #f59e0b;
  --offline:     #404070;

  /* Action colors */
  --danger:      #ef4444;
  --danger-glow: rgba(239, 68, 68, 0.26);
  --active-bg:   rgba(139, 92, 246, 0.18);
  --active-border: rgba(139, 92, 246, 0.38);
  --active-text: #c4b5fd;

  /* Per-user accent colors (assign on join, persist per session) */
  --user-1: #f59e0b;   /* warm gold   */
  --user-2: #8b5cf6;   /* purple      */
  --user-3: #3b82f6;   /* blue        */
  --user-4: #ec4899;   /* pink        */
}
```

### 2.2 Typography

**Font:** [Outfit](https://fonts.google.com/specimen/Outfit) — import via Google Fonts.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap">
```

Apply globally:
```css
body {
  font-family: 'Outfit', -apple-system, sans-serif;
  font-size: 14px;
  color: var(--text);
  background: var(--bg);
}
```

Scale:
| Use | Size | Weight |
|-----|------|--------|
| Room title | 15px | 700 |
| Section labels (ROOMS, FRIENDS) | 9px | 700, `letter-spacing: 0.11em`, uppercase |
| Room/friend names | 12px | 500–600 |
| Subtext (game activity, timestamps) | 10px | 400 |
| Tile name badge | 11px | 600 |
| Control button labels | 9px | 500 |
| Chat message text | 12px | 400 |
| Chat sender name | 11px | 700 |

### 2.3 Spacing & Radius

```css
--radius-tile:    16px;   /* video tiles */
--radius-panel:   14px;   /* chat panel  */
--radius-badge:   8px;    /* name badges */
--radius-pill:    99px;   /* status pills */
--radius-btn:     10px;   /* control buttons */
--gap-grid:       10px;   /* video grid gap */
--gap-layout:     14px;   /* main layout padding */
```

### 2.4 Scrollbar

```css
::-webkit-scrollbar { width: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #22224e; border-radius: 99px; }
```

---

## 3. CSS Animations

Define these globally — referenced by components throughout:

```css
/* Double-staggered ripple for speaking indicator */
@keyframes ripple {
  0%   { transform: scale(1);    opacity: 0.55; }
  100% { transform: scale(1.9);  opacity: 0; }
}

/* Emoji floating up on reaction send */
@keyframes floatUp {
  0%   { opacity: 1; transform: translateY(0)     scale(1);   }
  100% { opacity: 0; transform: translateY(-88px) scale(2.3); }
}

/* Chat panel slide in from right */
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(14px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* New chat message bounce */
@keyframes msgIn {
  from { opacity: 0; transform: translateY(7px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}

/* Online presence dot pulse */
@keyframes dotPulse {
  0%, 100% { box-shadow: 0 0 4px var(--online); }
  50%       { box-shadow: 0 0 10px var(--online), 0 0 18px rgba(34,197,94,0.27); }
}
```

---

## 4. Layout Architecture

Replace the current single-panel layout with this three-zone structure:

```
┌─────────────────────────────────────────────────────────────────┐
│ [Sidebar 200px]  │  [Main content — flex:1]                      │
│                  │  ┌─────────────────────────────────────────┐  │
│  Logo            │  │ Room Header                             │  │
│  ─────────────   │  │ (room name · count · timer · badges)    │  │
│  ROOMS           │  ├───────────────────────┬─────────────────┤  │
│  🏠 Lobby     4  │  │                       │  Chat Panel     │  │
│  ⚔️ Dungeon Run  │  │   2×2 Video Grid      │  (collapsible)  │  │
│  🎮 Chill Zone   │  │   flex:1              │  250px          │  │
│  + Create Room   │  │                       │                 │  │
│  ─────────────   │  ├───────────────────────┴─────────────────┤  │
│  FRIENDS - 2     │  │ Control Bar (centered)                  │  │
│  Blaze  online   │  │ [Mute][Cam][Share][PTT][Vol][Settings]  │  │
│  Wren   idle     │  │                          [Leave]        │  │
│  ─────────────   │  └─────────────────────────────────────────┘  │
│  [Self status]   │                                               │
└─────────────────────────────────────────────────────────────────┘
```

CSS layout skeleton:

```css
.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
  position: relative; /* for floating emoji reactions */
}

.sidebar {
  width: 200px;
  flex-shrink: 0;
  background: var(--panel);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.room-header {
  flex-shrink: 0;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 10px;
}

.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  padding: var(--gap-layout);
  gap: 12px;
}

.video-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: var(--gap-grid);
}

.control-bar {
  flex-shrink: 0;
  padding: 10px 20px 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.22);
}
```

---

## 5. Component Specifications

### 5.1 Sidebar

**Structure:** logo → rooms section → friends section → self-status footer

**Logo:**
```html
<div class="sidebar-logo">
  <span class="bird-icon">🐦</span>
  <span class="wordmark">Chickadee <span class="wordmark-gradient">CHAT</span></span>
</div>
```
```css
.wordmark-gradient {
  background: linear-gradient(90deg, #a78bfa, #60a5fa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

**Room rows:**
- Default: transparent bg, dim text
- Active: `background: linear-gradient(135deg, rgba(139,92,246,.22), rgba(59,130,246,.13))`, border `rgba(139,92,246,.32)`, text `#c4b5fd`, weight 700
- Participant count badge: `background: #4c1d95`, text `#ddd6fe`, borderRadius pill
- Hover: `background: rgba(139,92,246,.14)`

**Friends list:**
- Avatar circle with user color gradient, initials
- Presence dot (bottom-right of avatar): color from `STCOLOR` map, `animation: dotPulse` for online status, `border: 2px solid var(--panel)`
- Status text below name in `var(--dim)`
- Offline friends: name text uses `var(--dim)` instead of `#d0cee8`

**Self-status footer (pinned to bottom):**
```css
.sidebar-self {
  padding: 10px 12px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.32);
  margin-top: auto;
}
```
- Shows current user's avatar, name, and game activity (read from Electron's process watcher — see §7)
- Settings gear icon at far right

---

### 5.2 Room Header

Left cluster: room name + participant count badge + subtext (game name · session timer)

Right cluster (flex with gap):
1. **Noise Suppression toggle** — pill button, toggles on/off
   - On: `background: rgba(34,197,94,.1)`, `border: rgba(34,197,94,.25)`, text `#4ade80`
   - Off: dim styling
2. **Connected badge** — always-on indicator with pulsing dot
3. **Chat toggle** — shows/hides chat panel (see §5.4)
   - Active: `background: rgba(139,92,246,.16)`, `border: rgba(139,92,246,.3)`, text `#c4b5fd`

**Session timer:** Count up from `00:00` when the user joins a room. Display format: `mm:ss`. Reset on Leave.

---

### 5.3 Video Tiles

Each of the 4 participant tiles shares this structure:

```
┌──────────────────────────────────┐  ← borderRadius: 16px
│                        [🎮 DRG] │  ← game tag, top-right, 9px
│                                  │
│         ○○○ (ripple rings)       │
│           [ R ]  ← avatar        │
│         ○○○ (ripple rings)       │
│                                  │
│  ● Rain (you)                    │  ← name badge, bottom-left
└──────────────────────────────────┘
```

**Speaking state** (active when user's audio level crosses threshold):

```css
.tile--speaking {
  border: 2px solid var(--user-color);
  box-shadow: 0 0 34px rgba(var(--user-color-rgb), 0.12),
              inset 0 0 70px rgba(var(--user-color-rgb), 0.04);
}
```

Two staggered ripple rings (position: absolute, width/height: 92px centered on avatar):
```css
.ripple-1 { animation: ripple 1.3s ease-out infinite; }
.ripple-2 { animation: ripple 1.3s ease-out infinite; animation-delay: 0.45s; }
```
Both rings: `border: 2px solid {userColor}55` and `{userColor}28` respectively.

**Avatar circle:**
- 68×68px, borderRadius 50%
- Background: `linear-gradient(145deg, {userColor}ee, {userColor}66)`
- Speaking: `box-shadow: 0 0 34px {userColor}70`
- Not speaking: `box-shadow: 0 4px 22px rgba(0,0,0,.55)`
- Initial letter, fontWeight 800, 26px, white

**Mute indicator on avatar:** When user is muted, a 20×20px red circle appears bottom-right of the avatar circle with a mute emoji or icon, bordered by the card color.

**Name badge (bottom-left):**
- `background: rgba(0,0,0,.83)`, `borderRadius: 8px`, `padding: 3px 9px`
- When speaking: 5px color dot (same as user's hue) with `box-shadow: 0 0 7px {userColor}` appears before the name

**Game tag (top-right):**
- `background: rgba(0,0,0,.72)`, `borderRadius: 5px`, `padding: 2px 6px`, `fontSize: 9px`
- Shows abbreviated game name — read from Electron's active process detection (see §7)
- Hide if no game detected

**Ambient glow (non-interactive):**
```css
.tile-ambient {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 62%, {userColor}0d 0%, transparent 58%);
  pointer-events: none;
}
```

---

### 5.4 Chat Panel

Shown/hidden via the Chat toggle in the header. Animate in with `slideInRight .2s ease`. Width: 250px.

```
┌─────────────────────────┐
│  ROOM CHAT              │  ← 9px, uppercase, letter-spacing
├─────────────────────────┤
│  [message history]      │  ← flex:1, overflow-y: auto
│  ...                    │
├─────────────────────────┤
│  🔥 😂 👍 ❤️ 🎉 💀     │  ← reaction strip
├─────────────────────────┤
│  [input field]  [→]     │  ← send row
└─────────────────────────┘
```

**Messages:**
- New message: `animation: msgIn .15s ease`
- Sender name: user's `--user-color`, fontWeight 700, 11px
- Timestamp: `#1a1a4a`, 9px (very dim)
- Message text: `var(--text-sub)`, 12px, lineHeight 1.5
- Emoji reactions (rx: true): fontSize 22px instead of 12px

**Reaction strip:** 6 emoji buttons with hover scale + bg effect:
```css
.rx:hover { transform: scale(1.45); background: rgba(139,92,246,.28); }
```

**Send button:**
```css
.send-btn {
  width: 28px; height: 28px;
  background: var(--gradient);
  border-radius: 7px;
}
```

**Floating emoji reactions:** When a reaction is sent, spawn an absolutely-positioned element at a random x position (18–82% of the app width), bottom ~80px, with `animation: floatUp 1.8s ease-out forwards`, `fontSize: 30px`. Remove from DOM after animation completes.

---

### 5.5 Control Bar

Centered row of buttons. Two groups separated by a 1px vertical divider (`height: 36px`, `background: var(--border)`).

**Group 1 (feature buttons):** Mute, Camera, Share Screen, Push-to-Talk, Volume, Settings

Each button:
```css
.ctrl-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 13px;
  min-width: 54px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border);
  background: rgba(255,255,255,.04);
  cursor: pointer;
  transition: all .15s;
}
.ctrl-btn:hover  { transform: translateY(-2px); filter: brightness(1.12); }
.ctrl-btn:active { transform: scale(.92); }
```

State variants:
| State | Background | Border | Label color |
|-------|-----------|--------|------------|
| Default | `rgba(255,255,255,.04)` | `#171736` | `var(--dim)` |
| Active (on) | `rgba(139,92,246,.18)` | `rgba(139,92,246,.38)` | `#c4b5fd` |
| Danger (muted) | `rgba(239,68,68,.18)` | `rgba(239,68,68,.38)` | `#f87171` |
| Fade (settings) | same as default | same | `#171740` (near invisible) |

**Group 2 (Leave):**
```css
.leave-btn {
  background: linear-gradient(135deg, #991b1b, #ef4444);
  border: none;
  border-radius: var(--radius-btn);
  padding: 10px 22px;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 0 26px rgba(239,68,68,.26);
}
```

**Button icon size:** 17px. **Label size:** 9px.

**Full button list and default labels:**
| Icon | Label (off) | Label (on) | Notes |
|------|------------|-----------|-------|
| mic / mic-off | Mute | Unmute | Danger state when muted |
| video / video-off | Camera | Stop Cam | |
| screen-share / screen-share-off | Share | Stop Share | |
| mic (PTT) | Push-Talk | PTT On | |
| volume-2 | Volume | Volume | Opens volume slider popover |
| settings | Settings | Settings | Faded when off, opens settings |

Use Lucide icons (already available in Electron) or emoji as fallbacks.

---

## 6. New Features to Implement

### 6.1 Rooms System

Replace the single hard-coded "lobby" with a rooms model:

- Rooms are created/joined locally (no server needed for LAN/P2P — use existing connection model)
- Show up to ~6 rooms in the sidebar (scroll if more)
- Active room shows participant count badge
- "Create Room" button at the bottom of the list — prompts for a room name and icon (emoji picker or preset list)
- Switching rooms should disconnect from the current room and connect to the new one

### 6.2 Friends List (Sidebar)

- Shows peers the user has previously connected with (persist in `userData` via Electron's `app.getPath('userData')` + a JSON store)
- 3 statuses: **online** (green, pulsing dot), **idle** (amber, static dot), **offline** (dim, no pulse)
- Show the room they're in as the status subtitle if online
- "Invite to room" action on hover/right-click context menu

### 6.3 Room Chat

- In-session text chat visible to all participants in the room
- Messages sync over the existing P2P channel — extend the data protocol to include a `type: 'chat'` message type
- Timestamps in `HH:MM` format
- Emoji reaction strip: 🔥 😂 👍 ❤️ 🎉 💀 — sends the emoji as a chat message AND triggers the floating animation
- Chat history clears on leaving the room (ephemeral)
- Chat panel hidden by default on first run; toggled via the header button; persist preference in settings

### 6.4 Session Timer

- Count up in `mm:ss` from the moment the user successfully joins a room
- Display inline in the room header subtext row: `Deep Rock Galactic · ⏱ 04:32`
- Reset to `00:00` on leave and re-join

### 6.5 Noise Suppression Toggle

- Toggle button in the room header: "Noise Suppressed" (on) / "Noise Off" (off)
- Default: **on**
- Implementation: use the Web Audio API `AudioWorkletProcessor` or integrate [RNNoise](https://github.com/mozilla/rnnoise) via WASM (good Electron-compatible option)
- If no noise suppression library is available yet, stub the toggle as a UI-only feature with a "Coming soon" tooltip — don't block the rest of the redesign

### 6.6 Push-to-Talk Mode

- When PTT is enabled, the mic is muted by default
- Holding a configurable hotkey (default: **Space** — but make it rebindable in Settings) temporarily unmutes
- While PTT key is held: show the Mute button in active (green) state and display a "🎙 Transmitting…" indicator in the tile's name badge
- Register the hotkey globally via Electron's `globalShortcut` so it works even when the app is not focused (important for in-game use)
- Releasing the key re-mutes immediately

### 6.7 Game Activity Detection

- On app start and periodically (every 30s), scan running processes via a small Node.js helper:
  ```js
  // Use 'ps-list' npm package or platform-specific commands
  // Match against a curated games list (JSON file the user can extend)
  ```
- Display the detected game in:
  - The self-status area at the bottom of the sidebar
  - Each participant's tile game tag (top-right corner, abbreviated)
  - The room header subtext
- If no game is detected, omit the game display rather than showing a placeholder
- Broadcast detected game name to other participants over the existing data channel (`type: 'gameActivity'`)

### 6.8 Per-User Color Assignment

- When a participant joins a session, assign them one of 4 accent colors in order: `#f59e0b`, `#8b5cf6`, `#3b82f6`, `#ec4899`
- The local user is always assigned color 1 (`#f59e0b`)
- Colors persist for the session duration and are used for:
  - Avatar circle gradient
  - Speaking ring/glow color
  - Chat sender name color
  - Speaking dot in name badge

---

## 7. Electron-Specific Implementation Notes

### 7.1 Window Chrome

- Remove the default title bar (`titleBarStyle: 'hidden'` or `frame: false`) and implement a custom drag region:
  ```css
  .sidebar-logo {
    -webkit-app-region: drag;
  }
  .sidebar-logo button,
  .sidebar-logo input {
    -webkit-app-region: no-drag;
  }
  ```
- Add standard macOS traffic light buttons OR custom min/max/close buttons for Windows/Linux (top-right of sidebar or overlay)

### 7.2 Global Shortcut (Push-to-Talk)

```js
const { globalShortcut } = require('electron');

// Register in main process, after window is ready
globalShortcut.register('Space', () => {
  mainWindow.webContents.send('ptt-key-down');
});
// Handle key release via 'keyup' in renderer (Space key release)
// Note: globalShortcut doesn't have a keyup equivalent — 
// register Space keydown globally, but listen for keyup in the renderer
```

### 7.3 Process Detection (Game Activity)

```js
// In main process — use child_process or 'ps-list'
const psList = require('ps-list');

async function detectGame(gameList) {
  const processes = await psList();
  const names = processes.map(p => p.name.toLowerCase());
  return gameList.find(g => names.some(n => n.includes(g.processName))) || null;
}
// IPC bridge: call from renderer, respond via ipcMain.handle('detect-game', ...)
```

Maintain a `games.json` file in the app's `userData` directory (pre-seeded with common titles, user-editable):
```json
[
  { "name": "Deep Rock Galactic", "short": "DRG", "processName": "fsd-win64" },
  { "name": "Helldivers 2",       "short": "HD2", "processName": "helldivers2" },
  { "name": "Valheim",            "short": "VLH", "processName": "valheim" }
]
```

### 7.4 Persist Settings

Use Electron's `app.getPath('userData')` + a simple JSON file (or `electron-store` if already a dependency):

Settings to persist:
- `theme` (dark only for now, leave hook for future)
- `noiseSuppression` (boolean, default true)
- `pushToTalkKey` (string, default 'Space')
- `chatPanelVisible` (boolean, default false)
- `rooms` (array of room objects)
- `friends` (array of peer objects)
- `gameList` (array, as above)

### 7.5 Tray Icon

Consider adding a system tray icon (using the chickadee bird asset) that shows current room and allows quick mute toggle even when the window is minimized — useful mid-game.

---

## 8. Background Ambiance

Add a very subtle radial glow to the app background — this provides depth without hurting performance:

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: radial-gradient(
    ellipse 55% 50% at 32% 48%,
    rgba(139, 92, 246, 0.07) 0%,
    transparent 70%
  );
  pointer-events: none;
  z-index: 0;
}
```

All layout elements should have `position: relative; z-index: 1` or higher to render above this layer.

---

## 9. Interaction Polish

These small details make the UI feel alive — implement them alongside the structural changes:

| Element | Hover | Active/Click |
|---------|-------|-------------|
| Room rows | `rgba(139,92,246,.14)` bg | scale(0.96) |
| Control buttons | translateY(-2px) + brightness(1.12) | scale(0.92) |
| Reaction emoji | scale(1.45) + purple bg | — |
| Send button | opacity 0.88 | scale(0.93) |
| Leave button | brightness(1.1) | scale(0.94) |
| Sidebar items | `rgba(139,92,246,.14)` bg | scale(0.96) |

All transitions: `transition: all 0.15s ease`

---

## 10. Implementation Order (Suggested)

1. **CSS tokens + fonts + global animations** — establish the design system first
2. **Layout skeleton** — sidebar + main + header + control bar (no logic yet)
3. **Video tile redesign** — most impactful single change; speaking animation
4. **Control bar** — new buttons, states, Leave button
5. **Room sidebar** — rooms list + create room
6. **Room chat panel** — toggle, messages, reactions
7. **Friends list** — sidebar friends section + presence dots
8. **Session timer** — trivial, add to header
9. **Noise suppression toggle** — UI + wiring (or stub)
10. **Push-to-Talk** — global shortcut + UI state
11. **Game activity detection** — process scanner + badge display
12. **Settings persistence** — tie preferences to electron-store / JSON
13. **Tray icon** — nice-to-have, implement last

---

## 11. Assets

- **Logo / bird icon:** Use the existing app logo asset (purple/blue gradient chickadee). The `🐦` emoji is used as a fallback in the prototype — replace with the actual logo image in the final app.
- **Font:** Outfit via Google Fonts (requires internet on first load) or bundle the font files in `assets/fonts/` for fully offline use.
- **Icons:** Use Lucide icons (lightweight, tree-shakable) for control bar and UI icons. The prototype uses emoji as placeholders — replace with proper SVG icons for production.

---

*End of handoff. The `chickadee-redesign.jsx` prototype is fully interactive and reflects all the above specifications — use it as the primary visual reference when uncertain about any styling or layout detail.*
