// Summarize a Chickadee Chat profiling session (see PROFILING.md).
//
// Reads the CSVs the profiling harness writes (metrics.csv / raf.csv / marks.csv)
// and prints the per-process CPU split (foreground vs minimized), the rAF rate
// backgrounded vs visible, and the tasklist scan cost — the runtime numbers
// behind the static audit's §4. Pure Node, no deps, read-only.
//
// Usage:
//   node scripts/profile-report.mjs [session-dir]
//   - session-dir: a session-*/ folder (or a parent containing several);
//     if omitted, the latest session under known userData roots is used.
//   The harness logs the exact path on startup ("[profiler] writing session to …").
//
// CAVEAT: getAppMetrics percentCPUUsage semantics vary by platform/Electron
// version. Trust the foreground-vs-minimized DELTA; cross-check one scenario's
// total against Windows Task Manager per-PID CPU to calibrate absolutes.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

// ── Locate the session directory ─────────────────────────────────────────────

function dirsContainingMetrics(root) {
  if (!existsSync(root)) return [];
  const found = [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const d = join(root, e.name);
    if (existsSync(join(d, 'metrics.csv'))) found.push(d);
  }
  return found;
}

function candidateRoots() {
  const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
  return [
    // dev userData (main/index.ts: temp/chickadee-dev-<slot>)
    join(tmpdir(), 'chickadee-dev-0', 'profiling'),
    join(tmpdir(), 'chickadee-dev-1', 'profiling'),
    // packaged userData (productName / package name variants)
    join(appData, 'Chickadee Chat', 'profiling'),
    join(appData, '@chickadee', 'desktop', 'profiling'),
    join(appData, 'chickadee-desktop', 'profiling'),
  ];
}

function resolveSessionDir() {
  const arg = process.argv[2];
  if (arg) {
    if (existsSync(join(arg, 'metrics.csv'))) return arg;
    const inside = dirsContainingMetrics(arg);
    if (inside.length) return latest(inside);
    console.error(`No metrics.csv in "${arg}" or its immediate subdirectories.`);
    process.exit(1);
  }
  const all = candidateRoots().flatMap(dirsContainingMetrics);
  if (!all.length) {
    console.error(
      'No profiling sessions found. Pass the path the harness logged:\n' +
        '  node scripts/profile-report.mjs "<session dir>"\n' +
        'Searched:\n  ' + candidateRoots().join('\n  '),
    );
    process.exit(1);
  }
  return latest(all);
}

function latest(dirs) {
  return dirs.map((d) => [d, statSync(d).mtimeMs]).sort((a, b) => b[1] - a[1])[0][0];
}

// ── CSV parsing (harness strips commas from free-text, so split is safe) ──────

function parseCsv(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const cols = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    cols.forEach((c, i) => (row[c] = cells[i]));
    return row;
  });
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const p95 = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))];
};
const f2 = (n) => n.toFixed(2);

// Group window states into the two we care about; keep others labelled.
function bucket(state) {
  if (state === 'foreground') return 'foreground';
  if (state === 'minimized') return 'minimized';
  return state; // hidden / background / etc.
}

// ── Report ───────────────────────────────────────────────────────────────────

const dir = resolveSessionDir();
console.log(`\nProfiling report — ${dir}\n${'='.repeat(60)}`);

const metrics = parseCsv(join(dir, 'metrics.csv'));
if (!metrics.length) {
  console.log('metrics.csv is empty — was CHICKADEE_PROFILE set while running?');
} else {
  const states = [...new Set(metrics.map((r) => bucket(r.windowState)))];
  const samples = metrics.length;
  const span = (num(metrics[metrics.length - 1].elapsedMs) - num(metrics[0].elapsedMs)) / 1000;
  console.log(`samples: ${samples} rows over ~${span.toFixed(0)}s · states: ${states.join(', ')}\n`);

  // Per-type CPU split by state.
  const types = [...new Set(metrics.map((r) => r.type))].sort();
  console.log('Per-process CPU% (mean / p95) and memory, by window state');
  console.log('-'.repeat(60));
  for (const t of types) {
    console.log(`\n  ${t}`);
    for (const st of states) {
      const rows = metrics.filter((r) => r.type === t && bucket(r.windowState) === st);
      if (!rows.length) continue;
      const cpu = rows.map((r) => num(r.cpuPercent));
      const wsMB = mean(rows.map((r) => num(r.workingSetKB))) / 1024;
      console.log(
        `    ${st.padEnd(12)} cpu mean ${f2(mean(cpu)).padStart(6)}%  p95 ${f2(p95(cpu)).padStart(6)}%  ` +
          `mem ${wsMB.toFixed(0)}MB  (${rows.length} rows)`,
      );
    }
  }

  // Whole-app total CPU per state: sum process CPU within each sample (by isoTime), then mean.
  console.log(`\n${'-'.repeat(60)}\nWhole-app total CPU% by state (sum of processes per sample)`);
  const bySample = new Map(); // isoTime -> { state, total }
  for (const r of metrics) {
    const k = r.isoTime;
    const cur = bySample.get(k) ?? { state: bucket(r.windowState), total: 0 };
    cur.total += num(r.cpuPercent);
    bySample.set(k, cur);
  }
  const totalsByState = {};
  for (const { state, total } of bySample.values()) (totalsByState[state] ??= []).push(total);
  for (const st of Object.keys(totalsByState)) {
    console.log(`  ${st.padEnd(12)} mean ${f2(mean(totalsByState[st])).padStart(6)}%  p95 ${f2(p95(totalsByState[st])).padStart(6)}%`);
  }
  if (totalsByState.foreground && totalsByState.minimized) {
    const fg = mean(totalsByState.foreground);
    const mn = mean(totalsByState.minimized);
    const pct = fg ? ((mn / fg) * 100).toFixed(0) : '—';
    console.log(`  → minimized is ${pct}% of foreground total (${f2(mn)}% vs ${f2(fg)}%)  [§4.1]`);
  }
}

// rAF rate.
const raf = parseCsv(join(dir, 'raf.csv'));
console.log(`\n${'-'.repeat(60)}\nrequestAnimationFrame rate  [§4.3]`);
if (!raf.length) {
  console.log('  raf.csv empty (renderer profiler off, or no renderer samples yet).');
} else {
  const hidden = raf.filter((r) => r.hidden === 'true').map((r) => num(r.rafPerSec));
  const visible = raf.filter((r) => r.hidden !== 'true').map((r) => num(r.rafPerSec));
  console.log(`  visible (hidden=false): mean ${f2(mean(visible))} fps  (${visible.length} samples)`);
  console.log(`  hidden  (hidden=true) : mean ${f2(mean(hidden))} fps  (${hidden.length} samples)`);
  if (hidden.length) {
    const verdict = mean(hidden) > 5
      ? 'rAF KEEPS firing while hidden → backgroundThrottling:false confirmed'
      : 'rAF throttles while hidden';
    console.log(`  → ${verdict}`);
  }
}

// Timing marks (tasklist).
const marks = parseCsv(join(dir, 'marks.csv'));
console.log(`\n${'-'.repeat(60)}\nTiming marks  [§4.5]`);
if (!marks.length) {
  console.log('  marks.csv empty (no scans recorded yet — the first scan runs ~4s after launch).');
} else {
  const labels = [...new Set(marks.map((r) => r.label))];
  for (const l of labels) {
    const ms = marks.filter((r) => r.label === l).map((r) => num(r.ms));
    console.log(`  ${l.padEnd(12)} count ${ms.length}  mean ${f2(mean(ms))}ms  max ${f2(Math.max(...ms))}ms`);
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log('Note: trust foreground-vs-minimized deltas; calibrate absolute CPU%');
console.log('against Windows Task Manager per-PID for one scenario.  §4.4 (Opus');
console.log('DTX) is manual — capture it from chrome://webrtc-internals.\n');
