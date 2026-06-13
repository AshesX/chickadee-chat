// Free a TCP port by killing whatever is LISTENING on it.
// Runs as `predev` so a stale signaling server (orphaned `bun` on :8080) doesn't
// block `npm run dev` with EADDRINUSE. Kills by port, not a fixed PID.
//
// Usage: node scripts/free-port.mjs [port]   (default 8080)

import { execSync } from 'node:child_process';

const port = process.argv[2] ?? '8080';

function pidsOnPort(p) {
  const pids = new Set();
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
      for (const line of out.split('\n')) {
        if (!line.includes('LISTENING')) continue;
        // Local address is the 2nd column; match the literal :<port> at its end.
        const cols = line.trim().split(/\s+/);
        const local = cols[1] ?? '';
        if (!local.endsWith(`:${p}`)) continue;
        const pid = cols[cols.length - 1];
        if (pid && pid !== '0') pids.add(pid);
      }
    } else {
      const out = execSync(`lsof -ti tcp:${p}`, { encoding: 'utf8' });
      for (const pid of out.split('\n').map((s) => s.trim()).filter(Boolean)) pids.add(pid);
    }
  } catch {
    // Nothing on the port, or the tool isn't available — treat as already free.
  }
  return [...pids];
}

const pids = pidsOnPort(port);
if (pids.length === 0) {
  // Port already free — nothing to do.
  process.exit(0);
}

for (const pid of pids) {
  try {
    if (process.platform === 'win32') execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    else execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    console.log(`Freed :${port} (killed PID ${pid})`);
  } catch {
    // Process already gone or not killable — ignore.
  }
}
