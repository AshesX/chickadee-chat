# Idle-Performance Profiling Harness

Captures the runtime numbers behind the static performance audit's §4 — **where the
CPU/GPU cost lives across window states**: minimized (the original idle question)
*and* **visible/foreground**, since many users keep the app on a second monitor
during gameplay, where background throttling never applies and the full animation +
`backdrop-filter` blur cost is paid.

The harness is **inert unless `CHICKADEE_PROFILE` is set**, so it ships in every
build at zero cost when off. It is compiled into both dev and packaged builds, so
the same code profiles either — **profile the packaged `.exe` for representative
numbers** (dev mode inflates renderer CPU via React StrictMode double-render +
Vite HMR).

## What it records

Each run writes a folder `…/userData/profiling/<label>-<timestamp>/` (the exact
path is printed to the console on launch: `[profiler] writing session to …`):

| File | Contents | Audit item |
|---|---|---|
| `metrics.csv` | `app.getAppMetrics()` per-process CPU% + memory every 2 s, tagged `foreground`/`minimized`/`hidden`/`background` | §4.1 per-process split; §4.6 uiohook |
| `raf.csv` | renderer `requestAnimationFrame` callbacks/sec, with `hidden`/`focused` | §4.3 rAF rate backgrounded |
| `marks.csv` | one-off timing marks via `profileMark()` | (currently unused — see note) |
| `trace-*.json` | `contentTracing` paint/raster capture (Ctrl+Alt+P) — open in `chrome://tracing` or [perfetto](https://ui.perfetto.dev) | §4.2 paint while visible or minimized |

> **Note:** `marks.csv` was originally fed by the `tasklist` game-scan duration (§4.5), but **game detection was removed** in the optimization pass, so nothing currently calls `profileMark()` and `marks.csv` won't be written. The hook is left in place for future one-off timing marks.

**Window states** in `metrics.csv`: `foreground` (visible + focused), `background`
(**visible but unfocused — e.g. on a second monitor while a game has focus**),
`hidden` (occluded, not minimized), `minimized`. Only `minimized`/`hidden` get
Chromium's background throttling; `foreground` and `background` pay the **full**
animation + `backdrop-filter` cost. So the second-monitor-during-gameplay case logs
as `background` and is **not** helped by any "pause when hidden" optimization — it's
the case the visible/foreground scenarios below isolate.

**Not covered (deliberate):** §4.4 Opus DTX/silence behavior — capture manually
from `chrome://webrtc-internals` (outbound-rtp `bytesSent`/`packetsSent` slope
during silence) so nothing instruments the live WebRTC path.

> Historical (§4.5): the removed `tasklist` game-scan measured ≈ **358 ms avg** (300
> processes, 12 logical CPUs) statically and **433 ms avg / 715 ms max** under real
> game load — a periodic main-process burst every 30 s. **Removing game detection
> eliminated this burst entirely**, which is why `marks.csv` is no longer written.

## Environment variables

| Var | Effect |
|---|---|
| `CHICKADEE_PROFILE=1` | enables the harness |
| `CHICKADEE_PROFILE_LABEL=solo-min` | names the session folder (one per scenario = clean separation) |
| `CHICKADEE_PROFILE_INTERVAL=2000` | metrics sample interval in ms (default 2000) |

## Launch (PowerShell, Windows)

Packaged `.exe` (recommended):
```powershell
$env:CHICKADEE_PROFILE=1; $env:CHICKADEE_PROFILE_LABEL="solo-min"
& ".\Chickadee Chat-0.2.0-portable.exe"
```

Dev build:
```powershell
$env:CHICKADEE_PROFILE=1; $env:CHICKADEE_PROFILE_LABEL="solo-min"; npm run dev:desktop
```

Clear the vars before a normal run: `Remove-Item Env:CHICKADEE_PROFILE`.

## Scenarios — run one labelled session each, ~60 s

**Setup for the in-call runs:** get a 2nd participant into the same room — a second
instance (`$env:CHICKADEE_INSTANCE=1` before launch) or a real peer — for a
realistic mesh; voice-only, **nobody talking** unless noted.

_Alone:_
1. **solo-fg** — alone, window foreground (reference).
2. **solo-min** — alone, **minimized** (the core idle number).

_In call, minimized_ (background-throttling territory):
3. **call-ptt-min** — minimized, **Push-to-talk** (lightest: no VAD loop).
4. **call-voice-min** — minimized, **Voice-activation** (one VAD rAF loop).
5. **call-open-min** — minimized, **Open-mic + noise reduction** (two rAF loops).

_In call, visible_ (the majority case — background throttling does **not** apply, so
the full animation + `backdrop-filter` cost is paid):
6. **call-visible-fg** — in call, window visible **and focused** (logs `foreground`),
   your normal input mode. The reference for "what the app costs while I'm looking at it."
7. **call-2ndmon-game** — in call, window visible **on a second monitor while a game
   runs in focus**; play ~60 s (logs `background`). The literal "competing with my
   game" case. Press **Ctrl+Alt+P** mid-run for a paint/GPU trace to size the
   remaining GPU use against the game's. (As of the optimization pass the infinite
   animations are frozen while unfocused via `.app--unfocused`, so this should now be
   low — use it to confirm the win.)
   Optional: repeat per input mode (labels `call-2ndmon-game-ptt` / `-voice` / `-open`)
   to see which adds the most while gaming.

_Capture / stress:_
8. During any **minimized** scenario, press **Ctrl+Alt+P** for a ~10 s paint trace —
   compare it against #7's visible trace to see what throttling actually saves.
   (Traces are far larger for a visible window; open them in
   [perfetto](https://ui.perfetto.dev) if `chrome://tracing` struggles.)
9. **uiohook-test** — with a PTT keybind set, sit idle 30 s, then move the mouse
   vigorously / play a game 30 s. Compares the main-process PID's CPU (§4.6/U1).

## Report

```powershell
npm run profile:report                 # latest session, auto-discovered
node scripts/profile-report.mjs "<session dir>"   # a specific run
```

Prints the per-process CPU split **by window state** (foreground / background /
minimized), whole-app totals per state, the rAF rate hidden vs visible, and any
timing-mark stats (none now that game detection is removed). The GPU/renderer rows
are where the animation cost shows up — watch them in the visible
(`foreground`/`background`) scenarios, especially `background` vs `foreground` to
confirm the unfocused-animation gating dropped the cost.

**Reading the numbers:** `getAppMetrics` `percentCPUUsage` semantics vary by
platform/Electron version — **trust the deltas** (foreground vs minimized; and
`call-2ndmon-game` vs `call-visible-fg` for what gameplay adds while visible) over
absolutes, and calibrate by cross-checking one scenario's total against Windows Task
Manager → Details → CPU for the app's PIDs while that scenario runs.
