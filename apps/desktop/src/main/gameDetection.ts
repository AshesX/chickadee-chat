import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import type { BrowserWindow } from 'electron';
import { app } from 'electron';

interface GameDef {
  name: string;
  short: string;
  processName: string;
}

const DEFAULT_GAMES: GameDef[] = [
  { name: 'Deep Rock Galactic', short: 'DRG', processName: 'fsd-win64' },
  { name: 'Helldivers 2', short: 'HD2', processName: 'helldivers2' },
  { name: 'Valheim', short: 'VLH', processName: 'valheim' },
  { name: 'Counter-Strike 2', short: 'CS2', processName: 'cs2' },
  { name: 'Elden Ring', short: 'ELD', processName: 'eldenring' },
  { name: 'Apex Legends', short: 'APX', processName: 'r5apex' },
  { name: 'Rocket League', short: 'RL', processName: 'rocketleague' },
  { name: 'Minecraft', short: 'MC', processName: 'javaw' },
  { name: 'Fortnite', short: 'FN', processName: 'fortniteclient-win64-shipping' },
  { name: 'Overwatch 2', short: 'OW', processName: 'overwatch' },
  { name: 'Stardew Valley', short: 'SDV', processName: 'stardew valley' },
  { name: 'Terraria', short: 'TER', processName: 'terraria' },
];

let gamesList: GameDef[] = DEFAULT_GAMES;
let lastGameShort: string | null = null;

export function loadGamesList(): void {
  const path = join(app.getPath('userData'), 'games.json');
  try {
    if (existsSync(path)) {
      gamesList = JSON.parse(readFileSync(path, 'utf8')) as GameDef[];
      return;
    }
    writeFileSync(path, JSON.stringify(DEFAULT_GAMES, null, 2));
  } catch (err) {
    console.error('games.json failed; using defaults', err);
    gamesList = DEFAULT_GAMES;
  }
}

function runningProcessNames(): Promise<Set<string>> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(new Set());
    exec('tasklist /fo csv /nh', { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(new Set());
      const names = new Set<string>();
      for (const line of stdout.split(/\r?\n/)) {
        const m = /^"([^"]+)"/.exec(line);
        if (!m) continue;
        let n = m[1].toLowerCase();
        if (n.endsWith('.exe')) n = n.slice(0, -4);
        names.add(n);
      }
      resolve(names);
    });
  });
}

async function detectGame(): Promise<{ name: string; short: string } | null> {
  const names = await runningProcessNames();
  if (names.size === 0) return null;
  for (const g of gamesList) {
    const pn = g.processName.toLowerCase();
    for (const n of names) {
      if (n.includes(pn)) return { name: g.name, short: g.short };
    }
  }
  return null;
}

export function startGameDetection(window: BrowserWindow): void {
  const scan = async (): Promise<void> => {
    const game = await detectGame();
    const short = game?.short ?? null;
    if (short !== lastGameShort) {
      lastGameShort = short;
      if (!window.isDestroyed()) window.webContents.send('chickadee:game-detected', game);
    }
  };
  setTimeout(() => void scan(), 4000);
  const interval = setInterval(() => void scan(), 30_000);
  window.on('closed', () => clearInterval(interval));
}
