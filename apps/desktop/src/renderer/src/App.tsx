import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_ICE_SERVERS, MAX_PEERS_PER_ROOM, type Room, type SpaceInfo, DEFAULT_ROOMS } from '@chickadee/shared';
import { useSignaling } from './hooks/useSignaling';
import { usePeerMesh } from './hooks/usePeerMesh';
import { useSessionTimer } from './hooks/useSessionTimer';
import { useRoomChat } from './hooks/useRoomChat';
import { useFriends } from './hooks/useFriends';
import { SELF_COLOR, useUserColors } from './lib/userColors';
import { store } from './lib/settings';
import { Sidebar } from './components/Sidebar';
import { RoomHeader } from './components/RoomHeader';
import { ControlBar } from './components/ControlBar';
import { ParticipantTile } from './components/ParticipantTile';
import { ScreenView } from './components/ScreenView';
import { ScreenSharePicker } from './components/ScreenSharePicker';
import { ChatPanel } from './components/ChatPanel';
import { VolumePopover } from './components/VolumePopover';
import { WelcomeWizard } from './components/WelcomeWizard';
import { RoomModal } from './components/RoomModal';
import { SettingsModal } from './components/SettingsModal';
import { Logo } from './components/Logo';
import { generateTrayIcon } from './lib/trayIcon';
import { Modal } from './components/Modal';
import { playSfx } from './lib/sfx';

interface ActiveScreen {
  key: string;
  displayName: string;
  isSelf: boolean;
  stream: MediaStream;
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'room';
}

function generateSpaceId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'space';
  const suffix = Math.random().toString(36).substring(2, 7);
  return `${slug}-${suffix}`;
}

export function App(): React.JSX.Element {
  const signalingUrl = useMemo(() => window.chickadee?.signalingUrl ?? 'ws://localhost:8080', []);
  const iceServers = useMemo(() => window.chickadee?.iceServers ?? DEFAULT_ICE_SERVERS, []);
  const signaling = useSignaling(signalingUrl);
  const [noiseSuppression, setNoiseSuppression] = useState(() => store.getNoiseSuppression());
  const mesh = usePeerMesh(signaling, iceServers, noiseSuppression);
  const colors = useUserColors(signaling.peers.map((p) => p.id));
  const timer = useSessionTimer(signaling.status === 'connected');

  const userId = useMemo(() => store.getUserId(), []);
  const [displayName, setDisplayName] = useState(() => store.getName());
  const [spaces, setSpaces] = useState<SpaceInfo[]>(() => store.getSpaces());
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(() => store.getActiveSpaceId());
  const [rooms, setRooms] = useState<Room[]>(() => store.getRooms());
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(() => store.getChatVisible());
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Room | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pttEnabled, setPttEnabled] = useState(() => store.getPttEnabled());
  const [pushToTalkKey, setPushToTalkKey] = useState(() => store.getPushToTalkKey());
  const [pttMode, setPttMode] = useState<'hold' | 'toggle'>(() => store.getPttMode());
  const [game, setGame] = useState<{ name: string; short: string } | null>(null);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(() => store.getSfxEnabled());
  const [sfxVolume, setSfxVolume] = useState(() => store.getSfxVolume());
  const [deafened, setDeafened] = useState(false);
  const preDeafenMicRef = useRef<boolean>(true);
  const micEnabledRef = useRef(mesh.micEnabled);
  useEffect(() => {
    micEnabledRef.current = mesh.micEnabled;
  }, [mesh.micEnabled]);

  // New Space modals
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [joinSpaceOpen, setJoinSpaceOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  const chat = useRoomChat({ signaling, displayName, colors, roomId: currentRoomId });
  const transmitting = pttEnabled && mesh.micEnabled;

  const onboardingNeeded = !displayName || !currentSpaceId;
  const inRoom = currentRoomId !== null;
  const currentRoom = rooms.find((r) => r.id === currentRoomId) ?? null;
  const totalInRoom = inRoom ? signaling.peers.length + 1 : 0;
  const friends = useFriends(signaling.peers, userId, currentRoom?.label ?? null);

  function joinRoom(id: string): void {
    if (id === currentRoomId || !currentSpaceId) return;
    setCurrentRoomId(id);
    mesh.prepareMedia();
    signaling.join(currentSpaceId, id, displayName, userId, rooms);
  }

  function leaveRoom(): void {
    signaling.leave();
    setCurrentRoomId(null);
  }

  function createRoom(label: string, icon: string): void {
    const id = slugify(label);
    const next = rooms.some((r) => r.id === id) ? rooms : [...rooms, { id, label, icon }];
    setRooms(next);
    store.setRooms(next);
    setCreateOpen(false);
    if (signaling.status === 'connected' && currentSpaceId) {
      signaling.send({ type: 'update-rooms', spaceId: currentSpaceId, rooms: next });
    }
    joinRoom(id);
  }

  // Rename is cosmetic — the room `id` (signaling room) stays stable.
  function renameRoom(id: string, label: string, icon: string): void {
    const next = rooms.map((r) => (r.id === id ? { ...r, label, icon } : r));
    setRooms(next);
    store.setRooms(next);
    setRenameTarget(null);
    if (signaling.status === 'connected' && currentSpaceId) {
      signaling.send({ type: 'update-rooms', spaceId: currentSpaceId, rooms: next });
    }
  }

  function removeRoom(id: string): void {
    const next = rooms.filter((r) => r.id !== id);
    setRooms(next);
    store.setRooms(next);
    if (signaling.status === 'connected' && currentSpaceId) {
      signaling.send({ type: 'update-rooms', spaceId: currentSpaceId, rooms: next });
    }
    if (id === currentRoomId) leaveRoom();
  }

  function switchSpace(spaceId: string): void {
    leaveRoom();
    store.setActiveSpaceId(spaceId);
    setCurrentSpaceId(spaceId);
    
    // Update local state rooms list for the newly selected Space
    const active = store.getSpaces().find((s) => s.id === spaceId);
    const nextRooms = active ? active.rooms : [];
    setRooms(nextRooms);
  }

  function handleOnboardingSubmit(name: string, val: string, action: 'create' | 'join'): void {
    store.setName(name);
    setDisplayName(name);

    let spaceId = val;
    let spaceName = val;
    if (action === 'create') {
      spaceId = generateSpaceId(val);
    } else {
      let parsedName = val.split('-').slice(0, -1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      if (!parsedName) parsedName = 'Joined Space';
      spaceName = parsedName;
    }

    const newSpace: SpaceInfo = { id: spaceId, name: spaceName, rooms: DEFAULT_ROOMS };
    const nextSpaces = [newSpace];
    store.setSpaces(nextSpaces);
    setSpaces(nextSpaces);
    
    store.setActiveSpaceId(spaceId);
    setCurrentSpaceId(spaceId);
    setRooms(DEFAULT_ROOMS);
  }

  function deleteSpace(spaceId: string, spaceName: string): void {
    const confirmDelete = window.confirm(`Are you sure you want to delete the Space "${spaceName}"? All customized rooms and history will be lost locally.`);
    if (!confirmDelete) return;

    const nextSpaces = spaces.filter((s) => s.id !== spaceId);
    store.setSpaces(nextSpaces);
    setSpaces(nextSpaces);

    if (spaceId === currentSpaceId) {
      if (nextSpaces.length > 0) {
        switchSpace(nextSpaces[0].id);
      } else {
        // No spaces left, trigger onboarding
        leaveRoom();
        store.setActiveSpaceId(null);
        setCurrentSpaceId(null);
        setRooms([]);
      }
    }
  }

  function toggleChat(): void {
    setChatOpen((v) => {
      store.setChatVisible(!v);
      return !v;
    });
  }

  function saveName(name: string): void {
    store.setName(name);
    setDisplayName(name);
  }

  function applyNoiseSuppression(on: boolean): void {
    setNoiseSuppression(on);
    store.setNoiseSuppression(on);
    mesh.setNoiseSuppression(on);
  }

  function applyPttEnabled(on: boolean): void {
    setPttEnabled(on);
    store.setPttEnabled(on);
  }

  function applyPushToTalkKey(key: string): void {
    setPushToTalkKey(key);
    store.setPushToTalkKey(key);
  }

  function applyPttMode(mode: 'hold' | 'toggle'): void {
    setPttMode(mode);
    store.setPttMode(mode);
  }

  function applySfxEnabled(on: boolean): void {
    setSfxEnabled(on);
    store.setSfxEnabled(on);
  }

  function applySfxVolume(vol: number): void {
    setSfxVolume(vol);
    store.setSfxVolume(vol);
  }

  const toggleDeafen = useCallback(() => {
    setDeafened((d) => {
      const nextDeaf = !d;
      if (store.getSfxEnabled()) {
        playSfx(nextDeaf ? 'deafen' : 'undeafen', store.getSfxVolume());
      }
      if (signaling.status === 'connected') {
        signaling.send({ type: 'deafen-state', deafened: nextDeaf });
      }
      if (nextDeaf) {
        preDeafenMicRef.current = micEnabledRef.current;
        if (micEnabledRef.current) {
          mesh.setMicEnabled(false);
        }
      } else {
        mesh.setMicEnabled(preDeafenMicRef.current);
      }
      return nextDeaf;
    });
  }, [signaling.status, signaling.send, mesh.setMicEnabled]);

  const handleToggleMic = useCallback(() => {
    if (deafened) {
      toggleDeafen();
    } else {
      mesh.toggleMic();
    }
  }, [deafened, toggleDeafen, mesh.toggleMic]);

  // Keep track of peers in room to play join/leave sounds
  const peerIdsStr = useMemo(() => signaling.peers.map((p) => p.id).sort().join(','), [signaling.peers]);
  const prevPeerIdsRef = useRef<string>('');
  const prevRoomIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sfxEnabled) {
      prevPeerIdsRef.current = peerIdsStr;
      prevRoomIdRef.current = currentRoomId;
      return;
    }

    // 1. Room join/leave for the local user
    if (currentRoomId !== prevRoomIdRef.current) {
      if (currentRoomId && !prevRoomIdRef.current) {
        playSfx('join', sfxVolume);
      } else if (!currentRoomId && prevRoomIdRef.current) {
        playSfx('leave', sfxVolume);
      }
      prevRoomIdRef.current = currentRoomId;
      prevPeerIdsRef.current = peerIdsStr;
      return;
    }

    // 2. Peer join/leave for others (only if we are currently in a room)
    if (currentRoomId) {
      const prevPeers = prevPeerIdsRef.current ? prevPeerIdsRef.current.split(',').filter(Boolean) : [];
      const currentPeers = peerIdsStr ? peerIdsStr.split(',').filter(Boolean) : [];

      if (currentPeers.length > prevPeers.length) {
        playSfx('join', sfxVolume);
      } else if (currentPeers.length < prevPeers.length) {
        playSfx('leave', sfxVolume);
      }
    }

    prevPeerIdsRef.current = peerIdsStr;
    prevRoomIdRef.current = currentRoomId;
  }, [currentRoomId, peerIdsStr, sfxEnabled, sfxVolume]);

  const prevMicEnabledRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (prevMicEnabledRef.current === null) {
      prevMicEnabledRef.current = mesh.micEnabled;
      return;
    }
    if (mesh.micEnabled !== prevMicEnabledRef.current) {
      if (inRoom && sfxEnabled) {
        playSfx(mesh.micEnabled ? 'unmute' : 'mute', sfxVolume);
      }
      prevMicEnabledRef.current = mesh.micEnabled;
    }
  }, [mesh.micEnabled, inRoom, sfxEnabled, sfxVolume]);

  // (Un)register the global PTT hotkey whenever enabled/key/mode changes.
  useEffect(() => {
    void window.chickadee?.setPushToTalk?.({ enabled: pttEnabled, key: pushToTalkKey, mode: pttMode });
  }, [pttEnabled, pushToTalkKey, pttMode]);

  // In PTT mode the mic starts muted until the hotkey activates it.
  useEffect(() => {
    if (pttEnabled && mesh.localStream) mesh.setMicEnabled(false);
  }, [pttEnabled, mesh.localStream, mesh.setMicEnabled]);

  // Toggle mode: each key press flips mic on/off.
  useEffect(() => {
    if (pttMode !== 'toggle') return;
    return window.chickadee?.onPushToTalk?.(() => mesh.toggleMic());
  }, [pttMode, mesh.toggleMic]);

  // Hold mode: mic on while key held, off on release.
  useEffect(() => {
    if (pttMode !== 'hold') return;
    const unsubStart = window.chickadee?.onPttStart?.(() => mesh.setMicEnabled(true));
    const unsubStop = window.chickadee?.onPttStop?.(() => mesh.setMicEnabled(false));
    return () => { unsubStart?.(); unsubStop?.(); };
  }, [pttMode, mesh.setMicEnabled]);

  // Detected game (from the main-process scanner).
  useEffect(() => {
    return window.chickadee?.onGameDetected?.((g) => setGame(g));
  }, []);

  // Broadcast our game short-tag and deafen state to the room (re-announces on join/reconnect).
  useEffect(() => {
    if (signaling.status === 'connected') {
      signaling.send({ type: 'game-state', game: game?.short ?? null });
      if (deafened) {
        signaling.send({ type: 'deafen-state', deafened: true });
      }
    }
  }, [game, currentRoomId, signaling.status, signaling.send, deafened]);

  // Keep local rooms in sync with the signaling server's room list for this Space
  useEffect(() => {
    if (signaling.status === 'connected' && signaling.rooms) {
      setRooms(signaling.rooms);
      store.setRooms(signaling.rooms);
    }
  }, [signaling.rooms, signaling.status]);

  // Tray: generate the icon once, keep the room label current, and wire mute.
  useEffect(() => {
    void generateTrayIcon().then((url) => {
      if (url) window.chickadee?.setTrayIcon?.(url);
    });
  }, []);
  useEffect(() => {
    window.chickadee?.setTrayRoom?.(currentRoom?.label ?? null);
  }, [currentRoom?.label]);
  useEffect(() => {
    return window.chickadee?.onTrayMute?.(() => handleToggleMic());
  }, [handleToggleMic]);
  useEffect(() => {
    return window.chickadee?.onTrayDeafen?.(() => toggleDeafen());
  }, [toggleDeafen]);

  // Camera tiles (self + peers), reused in grid and filmstrip layouts.
  const tiles = inRoom && (
    <>
      <ParticipantTile
        displayName={displayName}
        isSelf
        muted={!mesh.micEnabled}
        cameraOn={mesh.cameraEnabled}
        cameraStream={mesh.localStream}
        color={SELF_COLOR}
        transmitting={transmitting}
        gameTag={game?.short}
        deafened={deafened}
      />
      {signaling.peers.map((peer) => {
        const media = mesh.remote[peer.id];
        return (
          <ParticipantTile
            key={peer.id}
            displayName={peer.displayName}
            isSelf={false}
            muted={peer.muted}
            cameraOn={peer.cameraOn}
            cameraStream={media?.cameraStream ?? null}
            color={colors[peer.id] ?? SELF_COLOR}
            connectionState={media?.connectionState ?? 'new'}
            gameTag={peer.game ?? undefined}
            volume={deafened ? 0 : (volumes[peer.id] ?? 1)}
            deafened={peer.deafened}
          />
        );
      })}
    </>
  );

  // Active screen shares: ours + any peer sharing.
  const activeScreens: ActiveScreen[] = [];
  if (mesh.sharingScreen && mesh.localScreenStream) {
    activeScreens.push({ key: 'self-screen', displayName, isSelf: true, stream: mesh.localScreenStream });
  }
  for (const peer of signaling.peers) {
    const screen = peer.screenStreamId ? mesh.remote[peer.id]?.screenStream : null;
    if (screen) {
      activeScreens.push({ key: `${peer.id}-screen`, displayName: peer.displayName, isSelf: false, stream: screen });
    }
  }
  const presenting = activeScreens.length > 0;

  const errors = [mesh.micError, mesh.cameraError, mesh.screenError, signaling.error].filter(Boolean);

  return (
    <div className="app">
      {chat.floats.map((f) => (
        <div key={f.id} className="float-reaction" style={{ left: `${f.x}%` }}>
          {f.emoji}
        </div>
      ))}

      <Sidebar
        rooms={rooms}
        currentRoomId={currentRoomId}
        currentRoomCount={totalInRoom}
        onSelectRoom={joinRoom}
        onCreateRoom={() => setCreateOpen(true)}
        onRequestRename={(room) => setRenameTarget(room)}
        onRemoveRoom={removeRoom}
        friends={friends}
        selfName={displayName}
        selfColor={SELF_COLOR}
        online={inRoom && signaling.status === 'connected'}
        selfGame={game?.name}
        onOpenSettings={() => setSettingsOpen(true)}
        spaces={spaces}
        activeSpaceId={currentSpaceId}
        onSelectSpace={switchSpace}
        onCreateSpace={() => setCreateSpaceOpen(true)}
        onJoinSpace={() => setJoinSpaceOpen(true)}
        onDeleteSpace={deleteSpace}
      />

      <div className="main">
        <RoomHeader
          room={currentRoom}
          count={totalInRoom}
          maxCount={MAX_PEERS_PER_ROOM}
          status={signaling.status}
          timer={timer}
          game={game?.name}
          noiseSuppressed={noiseSuppression}
          onToggleNoise={() => applyNoiseSuppression(!noiseSuppression)}
          chatOpen={chatOpen}
          onToggleChat={toggleChat}
        />

        {inRoom ? (
          <>
            <div className="content-area">
              {presenting ? (
                <div className="presentation">
                  <div className="stage" data-count={Math.min(activeScreens.length, 4)}>
                    {activeScreens.map((s) => (
                      <ScreenView key={s.key} displayName={s.displayName} isSelf={s.isSelf} stream={s.stream} />
                    ))}
                  </div>
                  <ul className="filmstrip">{tiles}</ul>
                </div>
              ) : (
                <ul className="grid" data-count={Math.min(totalInRoom, MAX_PEERS_PER_ROOM)}>
                  {tiles}
                </ul>
              )}

              {chatOpen && (
                <ChatPanel messages={chat.messages} onSend={chat.sendChat} onReact={chat.react} />
              )}
            </div>

            <ControlBar
              micEnabled={mesh.micEnabled}
              hasMic={!!mesh.localStream}
              onToggleMic={handleToggleMic}
              cameraEnabled={mesh.cameraEnabled}
              onToggleCamera={mesh.toggleCamera}
              sharingScreen={mesh.sharingScreen}
              onToggleShare={() =>
                mesh.sharingScreen ? mesh.stopScreenShare() : setPickerOpen(true)
              }
              pttOn={pttEnabled}
              onTogglePtt={() => applyPttEnabled(!pttEnabled)}
              transmitting={transmitting}
              onVolume={() => setVolumeOpen((v) => !v)}
              onLeave={leaveRoom}
              deafened={deafened}
              onToggleDeafen={toggleDeafen}
            />

            {volumeOpen && (
              <VolumePopover
                peers={signaling.peers}
                colors={colors}
                volumes={volumes}
                onChange={(peerId, volume) => setVolumes((prev) => ({ ...prev, [peerId]: volume }))}
                onClose={() => setVolumeOpen(false)}
              />
            )}
          </>
        ) : (
          <div className="empty-lounge">
            <div className="empty-lounge__card">
              <Logo size={72} className="empty-lounge__bird" />
              <h2>Pick a room to start</h2>
              <p>Choose a room from the sidebar — or create your own — to drop into the lounge.</p>
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="toasts">
            {errors.map((e, i) => (
              <div key={i} className="toast">
                {e}
              </div>
            ))}
          </div>
        )}
      </div>

      {pickerOpen && (
        <ScreenSharePicker
          onPick={(id, withAudio) => {
            setPickerOpen(false);
            mesh.startScreenShare(id, withAudio);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {onboardingNeeded && <WelcomeWizard onSubmit={handleOnboardingSubmit} />}

      {createSpaceOpen && (
        <Modal title="Create a Space" onClose={() => setCreateSpaceOpen(false)}>
          <div className="field">
            <label className="field-label">Space Name</label>
            <input
              className="welcome__input"
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newSpaceName.trim()) {
                  const name = newSpaceName.trim();
                  const spaceId = generateSpaceId(name);
                  const newSpace: SpaceInfo = { id: spaceId, name, rooms: DEFAULT_ROOMS };
                  const nextSpaces = [...spaces, newSpace];
                  store.setSpaces(nextSpaces);
                  setSpaces(nextSpaces);
                  switchSpace(spaceId);
                  setNewSpaceName('');
                  setCreateSpaceOpen(false);
                }
              }}
              placeholder="e.g. Midnight Lounge"
              autoFocus
              maxLength={32}
            />
          </div>
          <button
            className="modal-action"
            onClick={() => {
              const name = newSpaceName.trim();
              if (!name) return;
              const spaceId = generateSpaceId(name);
              const newSpace: SpaceInfo = { id: spaceId, name, rooms: DEFAULT_ROOMS };
              const nextSpaces = [...spaces, newSpace];
              store.setSpaces(nextSpaces);
              setSpaces(nextSpaces);
              switchSpace(spaceId);
              setNewSpaceName('');
              setCreateSpaceOpen(false);
            }}
            disabled={!newSpaceName.trim()}
          >
            Create Space
          </button>
        </Modal>
      )}

      {joinSpaceOpen && (
        <Modal title="Join a Space" onClose={() => setJoinSpaceOpen(false)}>
          <div className="field">
            <label className="field-label">Invite Code / Space ID</label>
            <input
              className="welcome__input"
              value={inviteCodeInput}
              onChange={(e) => setInviteCodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inviteCodeInput.trim()) {
                  const code = inviteCodeInput.trim();
                  let parsedName = code.split('-').slice(0, -1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                  if (!parsedName) parsedName = 'Joined Space';
                  if (spaces.some(s => s.id === code)) {
                    switchSpace(code);
                  } else {
                    const newSpace: SpaceInfo = { id: code, name: parsedName, rooms: DEFAULT_ROOMS };
                    const nextSpaces = [...spaces, newSpace];
                    store.setSpaces(nextSpaces);
                    setSpaces(nextSpaces);
                    switchSpace(code);
                  }
                  setInviteCodeInput('');
                  setJoinSpaceOpen(false);
                }
              }}
              placeholder="e.g. midnight-lounge-7f8a3"
              autoFocus
            />
          </div>
          <button
            className="modal-action"
            onClick={() => {
              const code = inviteCodeInput.trim();
              if (!code) return;
              let parsedName = code.split('-').slice(0, -1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              if (!parsedName) parsedName = 'Joined Space';
              if (spaces.some(s => s.id === code)) {
                switchSpace(code);
              } else {
                const newSpace: SpaceInfo = { id: code, name: parsedName, rooms: DEFAULT_ROOMS };
                const nextSpaces = [...spaces, newSpace];
                store.setSpaces(nextSpaces);
                setSpaces(nextSpaces);
                switchSpace(code);
              }
              setInviteCodeInput('');
              setJoinSpaceOpen(false);
            }}
            disabled={!inviteCodeInput.trim()}
          >
            Join Space
          </button>
        </Modal>
      )}
      {createOpen && (
        <RoomModal
          title="Create a room"
          submitLabel="Create room"
          onSubmit={createRoom}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {renameTarget && (
        <RoomModal
          title="Rename room"
          submitLabel="Save"
          initialLabel={renameTarget.label}
          initialIcon={renameTarget.icon}
          onSubmit={(label, icon) => renameRoom(renameTarget.id, label, icon)}
          onClose={() => setRenameTarget(null)}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          displayName={displayName}
          onChangeName={saveName}
          noiseSuppression={noiseSuppression}
          onChangeNoiseSuppression={applyNoiseSuppression}
          pttEnabled={pttEnabled}
          onChangePttEnabled={applyPttEnabled}
          pushToTalkKey={pushToTalkKey}
          onChangePushToTalkKey={applyPushToTalkKey}
          pttMode={pttMode}
          onChangePttMode={applyPttMode}
          sfxEnabled={sfxEnabled}
          onChangeSfxEnabled={applySfxEnabled}
          sfxVolume={sfxVolume}
          onChangeSfxVolume={applySfxVolume}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
