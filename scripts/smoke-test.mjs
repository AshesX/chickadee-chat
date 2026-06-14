// Signaling smoke test: verifies presence (welcome/peer-joined/peer-left), the
// 4-peer room cap, and Phase 2 mute broadcast (mic-state) against a running
// signaling server on ws://localhost:8080.
import { WebSocket } from 'ws';

const URL = 'ws://localhost:8080';
const ROOM = 'smoke';
const SPACE = 'smoke-space';

function client(displayName, { room = ROOM, userId = `uid-${displayName}`, spaceId = SPACE } = {}) {
  const events = [];
  const ws = new WebSocket(URL);
  const ready = new Promise((resolve) => {
    ws.on('open', () => {
      const join = { type: 'join', spaceId, room, displayName };
      if (userId !== null) join.userId = userId;
      ws.send(JSON.stringify(join));
    });
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

// Phase 5: heartbeat ping -> pong.
a.ws.send(JSON.stringify({ type: 'ping' }));
await wait(100);
check('A ping -> pong', a.events.some((ev) => ev.type === 'pong'));

const b = client('Bravo');
const wb = await b.ready;
check('B joins -> welcome lists A', wb.type === 'welcome' && wb.peers.length === 1 && wb.peers[0].displayName === 'Alpha');
check('welcome carries muted=false for existing peers', wb.peers[0].muted === false);
check('welcome carries cameraOn=false for existing peers', wb.peers[0].cameraOn === false);
check('welcome carries screenStreamId=null for existing peers', wb.peers[0].screenStreamId === null);
check('welcome carries game=null for existing peers', wb.peers[0].game === null);
check('welcome carries voicePreference="" for existing peers', wb.peers[0].voicePreference === '');
check('welcome carries userId for existing peers', wb.peers[0].userId === 'uid-Alpha');

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

// Phase 2b: C starts speaking; A and D should be told, C should not echo.
c.ws.send(JSON.stringify({ type: 'speaking-state', speaking: true }));
await wait(200);
const fromCSpk = (ev) => ev.type === 'speaking-state' && ev.from === wc.selfId && ev.speaking === true;
check('A receives C speaking-state(true)', a.events.some(fromCSpk));
check('D receives C speaking-state(true)', d.events.some(fromCSpk));
check('C does not receive its own speaking-state', !c.events.some((ev) => ev.type === 'speaking-state'));

// Phase 3: C turns camera on; A and D should be told, C should not echo.
c.ws.send(JSON.stringify({ type: 'cam-state', on: true }));
await wait(200);
const fromCCam = (ev) => ev.type === 'cam-state' && ev.from === wc.selfId && ev.on === true;
check('A receives C cam-state(on)', a.events.some(fromCCam));
check('D receives C cam-state(on)', d.events.some(fromCCam));
check('C does not receive its own cam-state', !c.events.some((ev) => ev.type === 'cam-state'));

// Phase 4: C starts then stops screen share; A and D should be told, C never echoed.
c.ws.send(JSON.stringify({ type: 'screen-state', streamId: 'stream-123' }));
await wait(200);
const fromCShareOn = (ev) =>
  ev.type === 'screen-state' && ev.from === wc.selfId && ev.streamId === 'stream-123';
check('A receives C screen-state(on)', a.events.some(fromCShareOn));
check('D receives C screen-state(on)', d.events.some(fromCShareOn));

c.ws.send(JSON.stringify({ type: 'screen-state', streamId: null }));
await wait(200);
const fromCShareOff = (ev) =>
  ev.type === 'screen-state' && ev.from === wc.selfId && ev.streamId === null;
check('A receives C screen-state(off)', a.events.some(fromCShareOff));
check('C does not receive its own screen-state', !c.events.some((ev) => ev.type === 'screen-state'));

// Phase 6B: chat relay (ephemeral) — A sends, C/D receive, A is not echoed.
a.ws.send(JSON.stringify({ type: 'chat', text: 'hello room' }));
await wait(200);
const aChat = (ev) => ev.type === 'chat' && ev.from === wa.selfId && ev.text === 'hello room';
check('C receives A chat', c.events.some(aChat));
check('D receives A chat', d.events.some(aChat));
check('A does not receive its own chat', !a.events.some((ev) => ev.type === 'chat'));

a.ws.send(JSON.stringify({ type: 'chat', text: '🔥', reaction: true }));
await wait(200);
check(
  'C receives A reaction (reaction:true)',
  c.events.some((ev) => ev.type === 'chat' && ev.reaction === true && ev.text === '🔥'),
);

// Phase 6B: game-state mirror — C announces, A/D told, C not echoed.
c.ws.send(JSON.stringify({ type: 'game-state', game: 'DRG' }));
await wait(200);
const cGame = (ev) => ev.type === 'game-state' && ev.from === wc.selfId && ev.game === 'DRG';
check('A receives C game-state', a.events.some(cGame));
check('D receives C game-state', d.events.some(cGame));
check('C does not receive its own game-state', !c.events.some((ev) => ev.type === 'game-state'));

// TTS voice preference mirror — C sets a voice, A/D told, C not echoed.
c.ws.send(JSON.stringify({ type: 'voice-state', voicePreference: 'uk-female' }));
await wait(200);
const cVoice = (ev) => ev.type === 'voice-state' && ev.from === wc.selfId && ev.voicePreference === 'uk-female';
check('A receives C voice-state', a.events.some(cVoice));
check('D receives C voice-state', d.events.some(cVoice));
check('C does not receive its own voice-state', !c.events.some((ev) => ev.type === 'voice-state'));

// Phase 6C: a join without userId still gets a non-empty userId (server fallback).
const f1 = client('Foxtrot', { room: 'fb', userId: null });
await f1.ready;
const f2 = client('Golf', { room: 'fb' });
const wf2 = await f2.ready;
check(
  'missing userId falls back to a non-empty id',
  typeof wf2.peers[0].userId === 'string' && wf2.peers[0].userId.length > 0,
);
f1.ws.close();
f2.ws.close();

// Space presence and room switching tests
const clientA = client('SpaceAlpha', { room: null, userId: 'uid-s-alpha' });
const wa_space = await clientA.ready;
check('SpaceAlpha joins space with room null -> welcome with 0 peers', wa_space.type === 'welcome' && wa_space.peers.length === 0);

clientA.ws.send(JSON.stringify({ type: 'join-room', room: 'room-1' }));
await wait(150);
check('SpaceAlpha receives space-presence snapshot', clientA.events.some((ev) => ev.type === 'space-presence'));
const welcomeEvents = clientA.events.filter((ev) => ev.type === 'welcome');
check('SpaceAlpha receives welcome for room-1 after join-room', welcomeEvents.length === 2 && welcomeEvents[1].peers.length === 0);

const clientB = client('SpaceBravo', { room: 'room-1', userId: 'uid-s-bravo' });
const wb_space = await clientB.ready;
check('SpaceBravo joins room-1 directly -> welcome lists SpaceAlpha', wb_space.type === 'welcome' && wb_space.peers.length === 1 && wb_space.peers[0].displayName === 'SpaceAlpha');

await wait(150);
check('SpaceAlpha notified SpaceBravo joined room-1', clientA.events.some((ev) => ev.type === 'peer-joined' && ev.peer.displayName === 'SpaceBravo'));

clientA.ws.send(JSON.stringify({ type: 'join-room', room: null }));
await wait(150);
check('SpaceBravo notified SpaceAlpha left room-1', clientB.events.some((ev) => ev.type === 'peer-left'));
const welcomeEventsA = clientA.events.filter((ev) => ev.type === 'welcome');
check('SpaceAlpha receives empty welcome after leaving room', welcomeEventsA.length === 3 && welcomeEventsA[2].peers.length === 0);

clientA.ws.close();
clientB.ws.close();

// Input validation: a valid avatar passes through; an invalid one is nulled.
const VALID_AVATAR = 'data:image/png;base64,iVBORw0KGgo=';
c.ws.send(JSON.stringify({ type: 'avatar-state', avatarDataUrl: VALID_AVATAR }));
await wait(150);
check(
  'A receives C valid avatar unchanged',
  a.events.some((ev) => ev.type === 'avatar-state' && ev.from === wc.selfId && ev.avatarDataUrl === VALID_AVATAR),
);

c.ws.send(JSON.stringify({ type: 'avatar-state', avatarDataUrl: 'javascript:alert(1)' }));
await wait(150);
check(
  'A receives C invalid avatar sanitized to null',
  a.events.some((ev) => ev.type === 'avatar-state' && ev.from === wc.selfId && ev.avatarDataUrl === null),
);

// Input validation: an over-long display name is capped (<= 32 chars).
const longName = client('X'.repeat(100), { room: 'cap-room', spaceId: 'cap-space' });
await longName.ready;
const capPeer = client('CapPeer', { room: 'cap-room', spaceId: 'cap-space' });
const wCap = await capPeer.ready;
check('over-long displayName capped to 32 chars', wCap.peers[0].displayName.length <= 32);
longName.ws.close();
capPeer.ws.close();

// Input validation: a join without spaceId is rejected (no welcome / no room-full).
const noSpace = new WebSocket(URL);
let noSpaceReplied = false;
noSpace.on('open', () => noSpace.send(JSON.stringify({ type: 'join', room: 'x', displayName: 'NoSpace' })));
noSpace.on('message', () => { noSpaceReplied = true; });
await wait(200);
check('join without spaceId is rejected (no reply)', noSpaceReplied === false);
noSpace.close();

for (const cl of [a, c, d, e]) cl.ws.close();
await wait(100);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
