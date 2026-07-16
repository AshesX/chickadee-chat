// Signaling smoke test: verifies presence (welcome/peer-joined/peer-left), the
// unified hybrid room cap (8), the stage spotlight (claim/busy/take-over/release/
// leave-frees), the per-peer state broadcasts, and the moderation layer (room
// moderator derivation, kick/ban, room/space locks, ownership transfer, seed)
// against a running signaling server on ws://localhost:8080.
import { WebSocket } from 'ws';

const URL = 'ws://localhost:8080';
const ROOM = 'smoke';
const SPACE = 'smoke-space';

function client(displayName, { room = ROOM, userId = `uid-${displayName}`, spaceId = SPACE, rooms, bannerDataUrl } = {}) {
  const events = [];
  const ws = new WebSocket(URL);
  const ready = new Promise((resolve) => {
    ws.on('open', () => {
      const join = { type: 'join', spaceId, room, displayName };
      if (userId !== null) join.userId = userId;
      if (rooms) join.rooms = rooms;
      if (bannerDataUrl !== undefined) join.bannerDataUrl = bannerDataUrl;
      ws.send(JSON.stringify(join));
    });
    ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      events.push(msg);
      if (msg.type === 'welcome' || msg.type === 'room-full' || msg.type === 'join-denied') resolve(msg);
    });
  });
  return { ws, events, ready, displayName };
}

/** One-shot non-mutating existence probe over a throwaway socket. */
function checkSpace(spaceId) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'check-space', spaceId })));
    ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      if (msg.type === 'space-status' && msg.spaceId === spaceId) {
        ws.close();
        resolve(msg.exists);
      }
    });
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};

// check-space: an unknown space reports not-existing (no member is connected).
check('check-space on unknown space -> exists:false', (await checkSpace('no-such-space-xyz')) === false);

const a = client('Alpha');
const wa = await a.ready;
check('A joins empty room -> welcome with 0 peers', wa.type === 'welcome' && wa.peers.length === 0);

// check-space: with A connected, the space now reports existing.
check('check-space on live space -> exists:true', (await checkSpace(SPACE)) === true);

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
check('welcome carries voicePreference="" for existing peers', wb.peers[0].voicePreference === '');
check('welcome carries accentColor="" for existing peers', wb.peers[0].accentColor === '');
check('welcome carries wantsVideo=true for existing peers', wb.peers[0].wantsVideo === true);
check(
  'welcome carries empty videoSubscriptions for existing peers',
  Array.isArray(wb.peers[0].videoSubscriptions) && wb.peers[0].videoSubscriptions.length === 0,
);
check('welcome carries userId for existing peers', wb.peers[0].userId === 'uid-Alpha');

await wait(150);
check('A is notified B joined', a.events.some((e) => e.type === 'peer-joined' && e.peer.displayName === 'Bravo'));

const c = client('Charlie');
const wc = await c.ready;
const d = client('Delta');
const wd = await d.ready;
check('D is 4th peer -> welcome lists 3 existing', wd.type === 'welcome' && wd.peers.length === 3);

// Hybrid rooms hold up to 8 (unified cap; the golden-ratio media model keeps an
// 8-way video mesh safe). Fill peers 5..8, then a 9th is rejected.
const fillers = [];
for (let i = 5; i <= 8; i++) {
  const fc = client(`Fill${i}`, { userId: `uid-fill${i}` });
  fc.welcome = await fc.ready;
  fillers.push(fc);
}
check('hybrid room accepts a 5th peer (cap 8, not 4)', fillers[0].welcome.type === 'welcome');
check(
  'hybrid room 8th peer welcomed listing 7 existing',
  fillers[3].welcome.type === 'welcome' && fillers[3].welcome.peers.length === 7,
);
const e = client('Echo', { userId: 'uid-echo' });
const we = await e.ready;
check('hybrid room rejects a 9th peer with room-full (cap 8)', we.type === 'room-full');
for (const fc of fillers) fc.ws.close();
await wait(150);

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

// Phase 4b: stage spotlight (single slot, server-arbitrated).
c.ws.send(JSON.stringify({ type: 'claim-spotlight', kind: 'screen' }));
await wait(200);
const cStageScreen = (ev) => ev.type === 'spotlight-state' && ev.holderId === wc.selfId && ev.kind === 'screen';
check('A receives spotlight-state after C claims the stage', a.events.some(cStageScreen));
check('C receives its own spotlight-state (claimant confirmed)', c.events.some(cStageScreen));

// D tries to claim while C holds it -> spotlight-busy (only to D).
d.ws.send(JSON.stringify({ type: 'claim-spotlight', kind: 'camera' }));
await wait(200);
check('D receives spotlight-busy (stage held by C)', d.events.some((ev) => ev.type === 'spotlight-busy' && ev.holderId === wc.selfId));
check('A not sent a spotlight-state for the blocked claim', a.events.filter(cStageScreen).length === 1);

// D forces a take-over -> stage transfers to D, broadcast to the room.
d.ws.send(JSON.stringify({ type: 'claim-spotlight', kind: 'camera', force: true }));
await wait(200);
const dStageCam = (ev) => ev.type === 'spotlight-state' && ev.holderId === wd.selfId && ev.kind === 'camera';
check('A receives spotlight-state after D takes over', a.events.some(dStageCam));
check('C is told D took the stage', c.events.some(dStageCam));

// D releases -> stage freed (holderId null).
d.ws.send(JSON.stringify({ type: 'release-spotlight' }));
await wait(200);
check('A receives spotlight-state(null) after D releases', a.events.some((ev) => ev.type === 'spotlight-state' && ev.holderId === null));

// Spotlight frees when the holder disconnects (in a separate room).
const STAGE_ROOMS = [{ id: 'stage-room', label: 'S', icon: 'sofa', type: 'hybrid' }];
const sg1 = client('StageG1', { room: 'stage-room', spaceId: 'stage-space', userId: 'uid-sg1', rooms: STAGE_ROOMS });
const wsg1 = await sg1.ready;
const sg2 = client('StageG2', { room: 'stage-room', spaceId: 'stage-space', userId: 'uid-sg2', rooms: STAGE_ROOMS });
await sg2.ready;
sg1.ws.send(JSON.stringify({ type: 'claim-spotlight', kind: 'screen' }));
await wait(150);
check('StageG2 sees StageG1 hold the stage', sg2.events.some((ev) => ev.type === 'spotlight-state' && ev.holderId === wsg1.selfId));
sg1.ws.close();
await wait(200);
check('stage freed (spotlight-state null) when the holder disconnects', sg2.events.some((ev) => ev.type === 'spotlight-state' && ev.holderId === null));
sg2.ws.close();
await wait(100);

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

// TTS voice preference mirror — C sets a voice, A/D told, C not echoed.
c.ws.send(JSON.stringify({ type: 'voice-state', voicePreference: 'uk-female' }));
await wait(200);
const cVoice = (ev) => ev.type === 'voice-state' && ev.from === wc.selfId && ev.voicePreference === 'uk-female';
check('A receives C voice-state', a.events.some(cVoice));
check('D receives C voice-state', d.events.some(cVoice));
check('C does not receive its own voice-state', !c.events.some((ev) => ev.type === 'voice-state'));

// Opt-in video sink mirror — C joins A (subscriptions:['uid-Alpha']) and stays
// undocked (wantsVideo:true); A/D told, C not echoed.
c.ws.send(JSON.stringify({ type: 'sink-state', subscriptions: ['uid-Alpha'], wantsVideo: true }));
await wait(200);
const cSink = (ev) =>
  ev.type === 'sink-state' &&
  ev.from === wc.selfId &&
  ev.wantsVideo === true &&
  Array.isArray(ev.subscriptions) &&
  ev.subscriptions.length === 1 &&
  ev.subscriptions[0] === 'uid-Alpha';
check('A receives C sink-state(subscriptions:[uid-Alpha], wantsVideo:true)', a.events.some(cSink));
check('D receives C sink-state(subscriptions:[uid-Alpha], wantsVideo:true)', d.events.some(cSink));
check('C does not receive its own sink-state', !c.events.some((ev) => ev.type === 'sink-state'));

// Accent color mirror — C sets a color, A/D told (space-wide), C not echoed.
c.ws.send(JSON.stringify({ type: 'accent-state', accentColor: '#8B5CF6' }));
await wait(200);
const cAccent = (ev) => ev.type === 'accent-state' && ev.from === wc.selfId && ev.accentColor === '#8b5cf6';
check('A receives C accent-state (lowercased)', a.events.some(cAccent));
check('D receives C accent-state', d.events.some(cAccent));
check('C does not receive its own accent-state', !c.events.some((ev) => ev.type === 'accent-state'));

// Invalid accent colors are sanitized to '' by the server.
c.ws.send(JSON.stringify({ type: 'accent-state', accentColor: 'red; drop table' }));
await wait(200);
check(
  'invalid accent-state is sanitized to ""',
  a.events.some((ev) => ev.type === 'accent-state' && ev.from === wc.selfId && ev.accentColor === ''),
);

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

// Phase 7: Space Owner (first-claim-wins) + Space Banner (owner-gated, sanitized).
// Uses a brand-new spaceId — spaceOwners/spaceBanners are never cleared (by design,
// see apps/signaling/src/index.ts), so this assumes a freshly-started server, same
// as the rest of this file.
const OWNER_SPACE = 'owner-banner-space';
const VALID_BANNER = 'data:image/webp;base64,aGVsbG8=';

const ownerA = client('OwnerA', { room: null, spaceId: OWNER_SPACE, userId: 'uid-owner-a', bannerDataUrl: null });
const wOwnerA = await ownerA.ready;
check('fresh space -> welcome ownerId is null', wOwnerA.ownerId === null);
check('fresh space -> welcome bannerDataUrl is null', wOwnerA.bannerDataUrl === null);

const ownerB = client('OwnerB', { room: null, spaceId: OWNER_SPACE, userId: 'uid-owner-b' });
await ownerB.ready;

ownerA.ws.send(JSON.stringify({ type: 'claim-ownership' }));
await wait(150);
const aIsOwner = (ev) => ev.type === 'owner-state' && ev.spaceId === OWNER_SPACE && ev.ownerId === 'uid-owner-a';
check('OwnerA (self) receives owner-state confirming itself as owner', ownerA.events.some(aIsOwner));
check('OwnerB receives owner-state naming OwnerA as owner', ownerB.events.some(aIsOwner));

// A later claim by someone else is a no-op — first-claim-wins, no take-over.
ownerB.ws.send(JSON.stringify({ type: 'claim-ownership' }));
await wait(150);
check(
  'a later claim by a non-owner does not change ownership',
  !ownerB.events.some((ev) => ev.type === 'owner-state' && ev.ownerId === 'uid-owner-b'),
);

// Non-owner set-banner is silently ignored — no banner-state broadcast at all.
const beforeBBanner = ownerA.events.length;
ownerB.ws.send(JSON.stringify({ type: 'set-banner', bannerDataUrl: VALID_BANNER }));
await wait(150);
check(
  'non-owner set-banner is silently ignored (no banner-state broadcast)',
  !ownerA.events.slice(beforeBBanner).some((ev) => ev.type === 'banner-state'),
);

// Owner's set-banner broadcasts to everyone, including self (self-confirm).
ownerA.ws.send(JSON.stringify({ type: 'set-banner', bannerDataUrl: VALID_BANNER }));
await wait(150);
const bannerSet = (ev) =>
  ev.type === 'banner-state' && ev.spaceId === OWNER_SPACE && ev.bannerDataUrl === VALID_BANNER && ev.updatedBy === 'uid-owner-a';
check('OwnerA (self) receives banner-state after setting', ownerA.events.some(bannerSet));
check('OwnerB receives banner-state after the owner sets it', ownerB.events.some(bannerSet));

// Invalid banner (bad scheme) sanitizes to null.
ownerA.ws.send(JSON.stringify({ type: 'set-banner', bannerDataUrl: 'javascript:alert(1)' }));
await wait(150);
check(
  'invalid banner is sanitized to null',
  ownerB.events.some((ev) => ev.type === 'banner-state' && ev.bannerDataUrl === null),
);

// Restore a known banner, then confirm a mid-joiner's welcome reflects owner + banner.
ownerA.ws.send(JSON.stringify({ type: 'set-banner', bannerDataUrl: VALID_BANNER }));
await wait(150);
const ownerC = client('OwnerC', { room: null, spaceId: OWNER_SPACE, userId: 'uid-owner-c' });
const wOwnerC = await ownerC.ready;
check('mid-joiner welcome reflects the claimed owner', wOwnerC.ownerId === 'uid-owner-a');
check('mid-joiner welcome reflects the current banner', wOwnerC.bannerDataUrl === VALID_BANNER);

// Regression guard: a same-space room-switch welcome must OMIT ownerId/bannerDataUrl
// entirely (not send them as null) — absence means "no update," since these fields
// are Space-scoped and must survive a room switch (unlike the room-scoped spotlight).
ownerC.ws.send(JSON.stringify({ type: 'join-room', room: 'some-room' }));
await wait(150);
const ownerCWelcomes = ownerC.events.filter((ev) => ev.type === 'welcome');
const roomSwitchWelcome = ownerCWelcomes[ownerCWelcomes.length - 1];
check(
  'room-switch welcome omits ownerId/bannerDataUrl entirely (not just null)',
  !('ownerId' in roomSwitchWelcome) && !('bannerDataUrl' in roomSwitchWelcome),
);

ownerA.ws.close();
ownerB.ws.close();
ownerC.ws.close();
await wait(100);

// Regression guard: a joiner with no locally-cached banner (bannerDataUrl: null)
// must not lock the Space's banner to "none" ahead of the real owner's own
// rejoin — this is exactly what happens after a signaling-server restart when
// a second client reconnects before the owner does.
const RACE_SPACE = 'banner-seed-race-space';
const bystander = client('Bystander', { room: null, spaceId: RACE_SPACE, userId: 'uid-bystander', bannerDataUrl: null });
await bystander.ready;
const raceOwner = client('RaceOwner', { room: null, spaceId: RACE_SPACE, userId: 'uid-race-owner', bannerDataUrl: VALID_BANNER });
const wRaceOwner = await raceOwner.ready;
check(
  "a banner-less joiner does not lock out a later joiner's real banner",
  wRaceOwner.bannerDataUrl === VALID_BANNER,
);
bystander.ws.close();
raceOwner.ws.close();
await wait(100);

// File-transfer relay: directed, SPACE-scoped (crosses rooms — the whole point,
// since the sidebar USERS list is space-wide), sanitized, never cross-space.
const FT_SPACE = 'ft-space';
const ftA = client('FtSender', { room: 'ft-room-a', spaceId: FT_SPACE, userId: 'uid-ft-a' });
const wFtA = await ftA.ready;
const ftB = client('FtReceiver', { room: 'ft-room-b', spaceId: FT_SPACE, userId: 'uid-ft-b' });
const wFtB = await ftB.ready;
const ftX = client('FtStranger', { room: 'ft-room-x', spaceId: 'ft-other-space', userId: 'uid-ft-x' });
await ftX.ready;

// The key new capability: delivery across DIFFERENT rooms of the same space.
ftA.ws.send(JSON.stringify({ type: 'file-offer', to: wFtB.selfId, transferId: 'tr-1', name: 'video.mp4', size: 1048576 }));
await wait(200);
check(
  'file-offer relayed cross-room within the space with from stamped',
  ftB.events.some(
    (ev) => ev.type === 'file-offer' && ev.from === wFtA.selfId && ev.transferId === 'tr-1' && ev.name === 'video.mp4' && ev.size === 1048576,
  ),
);

// Decline round-trip back to the sender.
ftB.ws.send(JSON.stringify({ type: 'file-answer', to: wFtA.selfId, transferId: 'tr-1', accept: false }));
await wait(200);
check(
  'file-answer(decline) relayed back to the sender',
  ftA.events.some((ev) => ev.type === 'file-answer' && ev.from === wFtB.selfId && ev.transferId === 'tr-1' && ev.accept === false),
);

// file-signal payloads pass through verbatim (like offer/answer/ice-candidate).
ftA.ws.send(JSON.stringify({ type: 'file-signal', to: wFtB.selfId, transferId: 'tr-1', sdp: { type: 'offer', sdp: 'v=0 fake' } }));
await wait(200);
check(
  'file-signal sdp relayed verbatim',
  ftB.events.some(
    (ev) => ev.type === 'file-signal' && ev.from === wFtA.selfId && ev.transferId === 'tr-1' && ev.sdp && ev.sdp.type === 'offer' && ev.sdp.sdp === 'v=0 fake',
  ),
);

// Over-long cancel reason arrives clamped to 120 chars.
ftA.ws.send(JSON.stringify({ type: 'file-cancel', to: wFtB.selfId, transferId: 'tr-1', reason: 'r'.repeat(300) }));
await wait(200);
check(
  'file-cancel reason clamped to 120',
  ftB.events.some((ev) => ev.type === 'file-cancel' && ev.transferId === 'tr-1' && typeof ev.reason === 'string' && ev.reason.length === 120),
);

// Never relayed across spaces.
ftX.ws.send(JSON.stringify({ type: 'file-offer', to: wFtA.selfId, transferId: 'tr-x', name: 'x.bin', size: 1 }));
await wait(200);
check('file-offer NOT relayed across spaces', !ftA.events.some((ev) => ev.type === 'file-offer'));

// Invalid offers are dropped: bad size, empty name, missing transferId, self-send.
const ftBOffersBefore = ftB.events.filter((ev) => ev.type === 'file-offer').length;
ftA.ws.send(JSON.stringify({ type: 'file-offer', to: wFtB.selfId, transferId: 'tr-2', name: 'x.bin', size: -1 }));
ftA.ws.send(JSON.stringify({ type: 'file-offer', to: wFtB.selfId, transferId: 'tr-3', name: '', size: 10 }));
ftA.ws.send(JSON.stringify({ type: 'file-offer', to: wFtB.selfId, transferId: '', name: 'x.bin', size: 10 }));
ftA.ws.send(JSON.stringify({ type: 'file-offer', to: wFtA.selfId, transferId: 'tr-4', name: 'x.bin', size: 10 }));
await wait(200);
check(
  'invalid file-offers (bad size / empty name / missing id / self-send) are dropped',
  ftB.events.filter((ev) => ev.type === 'file-offer').length === ftBOffersBefore && !ftA.events.some((ev) => ev.type === 'file-offer'),
);

// Over-long file name arrives clamped to 160.
ftA.ws.send(JSON.stringify({ type: 'file-offer', to: wFtB.selfId, transferId: 'tr-5', name: 'n'.repeat(300), size: 10 }));
await wait(200);
check(
  'file-offer name clamped to 160',
  ftB.events.some((ev) => ev.type === 'file-offer' && ev.transferId === 'tr-5' && ev.name.length === 160),
);

// Multi-file batch offers: a valid batch relays with `files` intact (entries
// clamped); malformed batches are dropped whole.
ftA.ws.send(JSON.stringify({
  type: 'file-offer', to: wFtB.selfId, transferId: 'batch-1', name: 'a.mp4', size: 30,
  files: [{ name: 'a.mp4', size: 10 }, { name: 'x'.repeat(300), size: 20 }],
}));
await wait(200);
check(
  'batch file-offer relays with files intact and entry names clamped',
  ftB.events.some(
    (ev) => ev.type === 'file-offer' && ev.transferId === 'batch-1' && Array.isArray(ev.files) &&
      ev.files.length === 2 && ev.files[0].name === 'a.mp4' && ev.files[0].size === 10 && ev.files[1].name.length === 160,
  ),
);

const ftBBatchesBefore = ftB.events.filter((ev) => ev.type === 'file-offer').length;
ftA.ws.send(JSON.stringify({ type: 'file-offer', to: wFtB.selfId, transferId: 'batch-2', name: 'a', size: 1, files: [{ name: 'a', size: 1 }] }));
ftA.ws.send(JSON.stringify({ type: 'file-offer', to: wFtB.selfId, transferId: 'batch-3', name: 'a', size: 1, files: [] }));
ftA.ws.send(JSON.stringify({
  type: 'file-offer', to: wFtB.selfId, transferId: 'batch-4', name: 'a', size: 33,
  files: Array.from({ length: 33 }, (_, i) => ({ name: `f${i}`, size: 1 })),
}));
ftA.ws.send(JSON.stringify({
  type: 'file-offer', to: wFtB.selfId, transferId: 'batch-5', name: 'a', size: 2,
  files: [{ name: 'a', size: 1 }, { name: 'b', size: -1 }],
}));
await wait(200);
check(
  'invalid batches (1 entry / empty / 33 entries / one bad size) are dropped whole',
  ftB.events.filter((ev) => ev.type === 'file-offer').length === ftBBatchesBefore,
);

ftA.ws.close();
ftB.ws.close();
ftX.ws.close();
await wait(100);

// Phase 8: Moderation — room-moderator derivation + handoff, room locks (mod +
// authority checks), owner kick/ban/unban, space lock (newcomers only),
// ownership transfer, and the post-restart seed. Uses fresh space ids — the
// moderation maps are sticky by design (like spaceOwners), so this assumes a
// freshly-started server, same as the rest of this file.
const MOD_SPACE = 'mod-space';
const MOD_ROOM = 'mod-room';

// (1) Moderator = longest-present, passes on when the current mod leaves.
const m1 = client('ModOne', { room: MOD_ROOM, spaceId: MOD_SPACE, userId: 'uid-m1' });
const wm1 = await m1.ready;
check('first joiner welcome names self as moderator', wm1.moderatorId === wm1.selfId);
check('fresh space welcome carries spaceLocked:false', wm1.spaceLocked === false);
check('fresh space welcome carries empty lockedRooms/bannedUsers',
  Array.isArray(wm1.lockedRooms) && wm1.lockedRooms.length === 0 && Array.isArray(wm1.bannedUsers) && wm1.bannedUsers.length === 0);

const m2 = client('ModTwo', { room: MOD_ROOM, spaceId: MOD_SPACE, userId: 'uid-m2' });
const wm2 = await m2.ready;
check('second joiner welcome names the longest-present peer as moderator', wm2.moderatorId === wm1.selfId);

m1.ws.close();
await wait(200);
check('moderator passes to the next-longest-present on leave',
  m2.events.some((ev) => ev.type === 'moderator-state' && ev.holderId === wm2.selfId));

// (2) Room lock: the mod can lock; entry is denied; a plain member cannot lock.
m2.ws.send(JSON.stringify({ type: 'set-room-lock', room: MOD_ROOM, locked: true }));
await wait(150);
check('mod lock-room broadcasts room-lock-state (space-wide, incl. self)',
  m2.events.some((ev) => ev.type === 'room-lock-state' && ev.room === MOD_ROOM && ev.locked === true));

const m3a = client('ModThreeA', { room: MOD_ROOM, spaceId: MOD_SPACE, userId: 'uid-m3' });
const wm3a = await m3a.ready;
check('join into a locked room -> join-denied room-locked', wm3a.type === 'join-denied' && wm3a.reason === 'room-locked');
m3a.ws.close();

const m3 = client('ModThree', { room: null, spaceId: MOD_SPACE, userId: 'uid-m3' });
const wm3 = await m3.ready;
check('lobby join of the space still works while a room is locked', wm3.type === 'welcome');
check('lobby welcome lists the locked room', Array.isArray(wm3.lockedRooms) && wm3.lockedRooms.includes(MOD_ROOM));

const beforeM3Lock = m2.events.length;
m3.ws.send(JSON.stringify({ type: 'set-room-lock', room: MOD_ROOM, locked: false }));
await wait(150);
check('non-mod set-room-lock is silently ignored',
  !m2.events.slice(beforeM3Lock).some((ev) => ev.type === 'room-lock-state'));

m2.ws.send(JSON.stringify({ type: 'set-room-lock', room: MOD_ROOM, locked: false }));
await wait(150);
m3.ws.send(JSON.stringify({ type: 'join-room', room: MOD_ROOM }));
await wait(150);
check('room entry works again after the mod unlocks',
  m3.events.filter((ev) => ev.type === 'welcome').length === 2);

// (3) Owner authority: claim, then a cross-room kick-from-room.
const modOwner = client('ModOwner', { room: null, spaceId: MOD_SPACE, userId: 'uid-mod-owner' });
await modOwner.ready;
modOwner.ws.send(JSON.stringify({ type: 'claim-ownership' }));
await wait(150);

// A mod's space-scoped actions are denied (m2 is mod but not owner).
const beforeModBan = m2.events.length;
m2.ws.send(JSON.stringify({ type: 'ban-user', userId: 'uid-m3' }));
m2.ws.send(JSON.stringify({ type: 'kick-user', userId: 'uid-m3', scope: 'space' }));
await wait(150);
check('mod ban-user / kick-space are silently ignored',
  !m2.events.slice(beforeModBan).some((ev) => ev.type === 'ban-state') &&
  !m3.events.some((ev) => ev.type === 'kicked'));

modOwner.ws.send(JSON.stringify({ type: 'kick-user', userId: 'uid-m3', scope: 'room' }));
await wait(200);
check('room-kick target receives kicked scope:room with the bare room id',
  m3.events.some((ev) => ev.type === 'kicked' && ev.scope === 'room' && ev.room === MOD_ROOM));
check('room-kick target gets an empty-peers lobby welcome (space connection survives)',
  m3.events.filter((ev) => ev.type === 'welcome').length === 3 &&
  m3.events.filter((ev) => ev.type === 'welcome')[2].peers.length === 0);
check('room broadcasts peer-left for the kicked member',
  m2.events.some((ev) => ev.type === 'peer-left' && ev.peerId === wm3.selfId));

// (4) Ban: target is closed out, evicted from the roster, and denied on rejoin.
modOwner.ws.send(JSON.stringify({ type: 'ban-user', userId: 'uid-m3' }));
await wait(250);
check('ban target receives kicked scope:space reason:banned',
  m3.events.some((ev) => ev.type === 'kicked' && ev.scope === 'space' && ev.reason === 'banned'));
check('ban target socket is closed by the server', m3.ws.readyState === WebSocket.CLOSED || m3.ws.readyState === WebSocket.CLOSING);
check('bystanders receive ban-state listing the banned user',
  m2.events.some((ev) => ev.type === 'ban-state' && ev.bannedUsers?.some((b) => b.userId === 'uid-m3' && b.displayName === 'ModThree')));
check('bystanders receive space-peer-remove for the banned user',
  m2.events.some((ev) => ev.type === 'space-peer-remove' && ev.userId === 'uid-m3'));

const m3banned = client('ModThreeBanned', { room: null, spaceId: MOD_SPACE, userId: 'uid-m3' });
const wm3banned = await m3banned.ready;
check('banned userId rejoin -> join-denied banned', wm3banned.type === 'join-denied' && wm3banned.reason === 'banned');
m3banned.ws.close();

modOwner.ws.send(JSON.stringify({ type: 'unban-user', userId: 'uid-m3' }));
await wait(150);
check('unban broadcasts ban-state without the user',
  m2.events.some((ev) => ev.type === 'ban-state' && Array.isArray(ev.bannedUsers) && !ev.bannedUsers.some((b) => b.userId === 'uid-m3')));

const m3back = client('ModThreeBack', { room: null, spaceId: MOD_SPACE, userId: 'uid-m3' });
const wm3back = await m3back.ready;
check('unbanned userId can rejoin', wm3back.type === 'welcome');

// (5) Space lock: newcomers denied; recently-present members and the owner get in.
modOwner.ws.send(JSON.stringify({ type: 'set-space-lock', locked: true }));
await wait(150);
check('space-lock-state broadcast to members',
  m2.events.some((ev) => ev.type === 'space-lock-state' && ev.spaceId === MOD_SPACE && ev.locked === true));

const newcomer = client('Newcomer', { room: null, spaceId: MOD_SPACE, userId: 'uid-brand-new' });
const wNewcomer = await newcomer.ready;
check('locked space rejects a brand-new userId -> join-denied space-locked',
  wNewcomer.type === 'join-denied' && wNewcomer.reason === 'space-locked');
newcomer.ws.close();

m3back.ws.close();
await wait(150);
const m3return = client('ModThreeReturn', { room: null, spaceId: MOD_SPACE, userId: 'uid-m3' });
const wm3return = await m3return.ready;
check('locked space admits a recently-present (<10 min) member', wm3return.type === 'welcome');
check('locked space welcome carries spaceLocked:true', wm3return.spaceLocked === true);
m3return.ws.close();

modOwner.ws.send(JSON.stringify({ type: 'set-space-lock', locked: false }));
await wait(150);

// (6) Transfer of ownership: new owner gains set-banner, old owner loses it.
modOwner.ws.send(JSON.stringify({ type: 'transfer-ownership', toUserId: 'uid-m2' }));
await wait(150);
const m2IsOwner = (ev) => ev.type === 'owner-state' && ev.spaceId === MOD_SPACE && ev.ownerId === 'uid-m2';
check('transfer broadcasts owner-state naming the new owner (both ends)',
  modOwner.events.some(m2IsOwner) && m2.events.some(m2IsOwner));

const beforeOldOwnerBanner = m2.events.length;
modOwner.ws.send(JSON.stringify({ type: 'set-banner', bannerDataUrl: VALID_BANNER }));
await wait(150);
check('old owner set-banner is a no-op after the transfer',
  !m2.events.slice(beforeOldOwnerBanner).some((ev) => ev.type === 'banner-state'));

m2.ws.send(JSON.stringify({ type: 'set-banner', bannerDataUrl: VALID_BANNER }));
await wait(150);
check('new owner set-banner broadcasts banner-state',
  modOwner.events.some((ev) => ev.type === 'banner-state' && ev.updatedBy === 'uid-m2'));

m2.ws.close();
m3.ws.close();
modOwner.ws.close();
await wait(100);

// (7) Seed: on a fresh space, the confirmed owner's persisted bans + lock are
// adopted; a non-owner's seed is ignored.
const SEED_SPACE = 'seed-space';
const seedOwner = client('SeedOwner', { room: null, spaceId: SEED_SPACE, userId: 'uid-seed-owner' });
await seedOwner.ready;
seedOwner.ws.send(JSON.stringify({ type: 'claim-ownership' }));
await wait(150);
seedOwner.ws.send(JSON.stringify({
  type: 'seed-moderation',
  bannedUsers: [{ userId: 'uid-seed-banned', displayName: 'Banned Guy' }],
  locked: true,
}));
await wait(150);

const seedBanned = client('SeedBanned', { room: null, spaceId: SEED_SPACE, userId: 'uid-seed-banned' });
const wSeedBanned = await seedBanned.ready;
check('seeded ban denies the banned userId on join', wSeedBanned.type === 'join-denied' && wSeedBanned.reason === 'banned');
seedBanned.ws.close();

const seedNewcomer = client('SeedNewcomer', { room: null, spaceId: SEED_SPACE, userId: 'uid-seed-new' });
const wSeedNewcomer = await seedNewcomer.ready;
check('seeded space lock denies a newcomer', wSeedNewcomer.type === 'join-denied' && wSeedNewcomer.reason === 'space-locked');
seedNewcomer.ws.close();
seedOwner.ws.close();
await wait(100);

const SEED2_SPACE = 'seed-space-2';
const s2Owner = client('Seed2Owner', { room: null, spaceId: SEED2_SPACE, userId: 'uid-s2-owner' });
await s2Owner.ready;
s2Owner.ws.send(JSON.stringify({ type: 'claim-ownership' }));
await wait(150);
const s2NonOwner = client('Seed2NonOwner', { room: null, spaceId: SEED2_SPACE, userId: 'uid-s2-other' });
await s2NonOwner.ready;
s2NonOwner.ws.send(JSON.stringify({
  type: 'seed-moderation',
  bannedUsers: [{ userId: 'uid-s2-victim', displayName: 'Victim' }],
  locked: true,
}));
await wait(150);
const s2Victim = client('Seed2Victim', { room: null, spaceId: SEED2_SPACE, userId: 'uid-s2-victim' });
const wS2Victim = await s2Victim.ready;
check("a non-owner's seed-moderation is ignored (victim joins fine)", wS2Victim.type === 'welcome');
s2Owner.ws.close();
s2NonOwner.ws.close();
s2Victim.ws.close();
await wait(100);

// Phase 9: Room/space governance — update-rooms is validated server-side
// (owner manages everything; a member holds ONE self-created room), the wire
// spaceId is ignored, and rename-space is owner-gated. Fresh space ids again.
const GOV_SPACE = 'gov-space';
const GOV_ROOMS = [{ id: 'general', label: 'General', icon: 'chat-bubble', type: 'hybrid' }];

const govOwner = client('GovOwner', { room: null, spaceId: GOV_SPACE, userId: 'uid-gov-owner', rooms: GOV_ROOMS });
await govOwner.ready;
const govUser = client('GovUser', { room: null, spaceId: GOV_SPACE, userId: 'uid-gov-user' });
await govUser.ready;

// Unowned space is strict: a member can't touch the legacy room list yet.
const beforeUnowned = govOwner.events.length;
govUser.ws.send(JSON.stringify({ type: 'update-rooms', spaceId: GOV_SPACE, rooms: [{ ...GOV_ROOMS[0], label: 'Hax' }] }));
await wait(150);
check('unowned space: member rename of a legacy room is denied (strict until claimed)',
  !govOwner.events.slice(beforeUnowned).some((ev) => ev.type === 'rooms-updated'));
check('denied update-rooms resyncs the sender with the authoritative list',
  govUser.events.some((ev) => ev.type === 'rooms-updated' && ev.rooms.length === 1 && ev.rooms[0].label === 'General'));

govOwner.ws.send(JSON.stringify({ type: 'claim-ownership' }));
await wait(150);

// Non-owner rename-space is a silent no-op; the owner's goes through.
govUser.ws.send(JSON.stringify({ type: 'rename-space', spaceId: GOV_SPACE, newSpaceId: 'hax-space', newSpaceName: 'Hax' }));
await wait(150);
check('non-owner rename-space is silently ignored',
  !govOwner.events.some((ev) => ev.type === 'space-renamed'));
govOwner.ws.send(JSON.stringify({ type: 'rename-space', spaceId: GOV_SPACE, newSpaceId: 'gov-space-2', newSpaceName: 'Gov 2' }));
await wait(150);
check('owner rename-space broadcasts space-renamed',
  govUser.events.some((ev) => ev.type === 'space-renamed' && ev.newSpaceId === 'gov-space-2'));

// Member creates their one room; server stamps createdBy (spoof ignored), and
// the wire spaceId is ignored in favor of the connection's space.
govUser.ws.send(JSON.stringify({
  type: 'update-rooms',
  spaceId: 'some-other-space',
  rooms: [...GOV_ROOMS, { id: 'my-room', label: 'My Room', icon: 'sofa', type: 'hybrid', createdBy: 'uid-spoofed' }],
}));
await wait(150);
const myRoomAdded = (ev) =>
  ev.type === 'rooms-updated' && ev.spaceId === GOV_SPACE &&
  ev.rooms.some((r) => r.id === 'my-room' && r.createdBy === 'uid-gov-user');
check('member add of one room broadcasts, keyed to the CONNECTION space, creator-stamped (spoof ignored)',
  govOwner.events.some(myRoomAdded) && govUser.events.some(myRoomAdded));

// A second created room is denied; renaming their own room is fine; touching
// the legacy room or the whole list stays denied.
const beforeSecond = govOwner.events.length;
govUser.ws.send(JSON.stringify({
  type: 'update-rooms', spaceId: GOV_SPACE,
  rooms: [...GOV_ROOMS, { id: 'my-room', label: 'My Room', icon: 'sofa' }, { id: 'second', label: 'Second', icon: 'sofa' }],
}));
await wait(150);
check('member is limited to ONE created room (second add denied)',
  !govOwner.events.slice(beforeSecond).some((ev) => ev.type === 'rooms-updated'));

govUser.ws.send(JSON.stringify({
  type: 'update-rooms', spaceId: GOV_SPACE,
  rooms: [...GOV_ROOMS, { id: 'my-room', label: 'Renamed Mine', icon: 'sofa' }],
}));
await wait(150);
check('member may rename their own created room',
  govOwner.events.some((ev) => ev.type === 'rooms-updated' && ev.rooms.some((r) => r.id === 'my-room' && r.label === 'Renamed Mine')));

const beforeWipe = govOwner.events.length;
govUser.ws.send(JSON.stringify({ type: 'update-rooms', spaceId: GOV_SPACE, rooms: [] }));
await wait(150);
check('member cannot remove the legacy room (wipe denied)',
  !govOwner.events.slice(beforeWipe).some((ev) => ev.type === 'rooms-updated'));

// The owner can remove the member's room; the freed quota lets them create again.
govOwner.ws.send(JSON.stringify({ type: 'update-rooms', spaceId: GOV_SPACE, rooms: GOV_ROOMS }));
await wait(150);
check('owner may remove a member-created room',
  govUser.events.some((ev) => ev.type === 'rooms-updated' && ev.rooms.length === 1 && ev.rooms[0].id === 'general'));
govUser.ws.send(JSON.stringify({
  type: 'update-rooms', spaceId: GOV_SPACE,
  rooms: [...GOV_ROOMS, { id: 'my-room-2', label: 'Mine Again', icon: 'sofa' }],
}));
await wait(150);
check('quota frees after removal — member may create again',
  govOwner.events.some((ev) => ev.type === 'rooms-updated' && ev.rooms.some((r) => r.id === 'my-room-2' && r.createdBy === 'uid-gov-user')));

govOwner.ws.close();
govUser.ws.close();
await wait(100);

for (const cl of [a, c, d, e]) cl.ws.close();
await wait(100);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
