// Signaling smoke test: verifies presence (welcome/peer-joined/peer-left), the
// 4-peer room cap, and Phase 2 mute broadcast (mic-state) against a running
// signaling server on ws://localhost:8080.
import { WebSocket } from 'ws';

const URL = 'ws://localhost:8080';
const ROOM = 'smoke';

function client(displayName) {
  const events = [];
  const ws = new WebSocket(URL);
  const ready = new Promise((resolve) => {
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', room: ROOM, displayName })));
    ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      events.push(msg);
      if (msg.type === 'welcome' || msg.type === 'room-full') resolve(msg);
    });
  });
  return { ws, events, ready, displayName };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};

const a = client('Alpha');
const wa = await a.ready;
check('A joins empty room -> welcome with 0 peers', wa.type === 'welcome' && wa.peers.length === 0);

const b = client('Bravo');
const wb = await b.ready;
check('B joins -> welcome lists A', wb.type === 'welcome' && wb.peers.length === 1 && wb.peers[0].displayName === 'Alpha');
check('welcome carries muted=false for existing peers', wb.peers[0].muted === false);
check('welcome carries cameraOn=false for existing peers', wb.peers[0].cameraOn === false);

await wait(150);
check('A is notified B joined', a.events.some((e) => e.type === 'peer-joined' && e.peer.displayName === 'Bravo'));

const c = client('Charlie');
const wc = await c.ready;
const d = client('Delta');
const wd = await d.ready;
check('D is 4th peer -> welcome lists 3 existing', wd.type === 'welcome' && wd.peers.length === 3);

const e = client('Echo');
const we = await e.ready;
check('E is 5th peer -> rejected with room-full', we.type === 'room-full');

// B leaves; remaining peers should get peer-left for B.
b.ws.close();
await wait(200);
check('A notified B left', a.events.some((ev) => ev.type === 'peer-left' && ev.peerId === wb.selfId));

// Phase 2: C mutes; A and D should be told, C should not receive its own echo.
c.ws.send(JSON.stringify({ type: 'mic-state', muted: true }));
await wait(200);
const fromCMic = (ev) => ev.type === 'mic-state' && ev.from === wc.selfId && ev.muted === true;
check('A receives C mic-state(muted)', a.events.some(fromCMic));
check('D receives C mic-state(muted)', d.events.some(fromCMic));
check('C does not receive its own mic-state', !c.events.some((ev) => ev.type === 'mic-state'));

// Phase 3: C turns camera on; A and D should be told, C should not echo.
c.ws.send(JSON.stringify({ type: 'cam-state', on: true }));
await wait(200);
const fromCCam = (ev) => ev.type === 'cam-state' && ev.from === wc.selfId && ev.on === true;
check('A receives C cam-state(on)', a.events.some(fromCCam));
check('D receives C cam-state(on)', d.events.some(fromCCam));
check('C does not receive its own cam-state', !c.events.some((ev) => ev.type === 'cam-state'));

for (const cl of [a, c, d, e]) cl.ws.close();
await wait(100);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
