import { useMemo, useState } from 'react';
import { DEFAULT_ICE_SERVERS, MAX_PEERS_PER_ROOM, type Room } from '@chickadee/shared';
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
import { NameModal } from './components/NameModal';
import { CreateRoomModal } from './components/CreateRoomModal';
import { SettingsModal } from './components/SettingsModal';

interface ActiveScreen {
  key: string;
  displayName: string;
  isSelf: boolean;
  stream: MediaStream;
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'room';
}

export function App(): React.JSX.Element {
  const signalingUrl = useMemo(() => window.chickadee?.signalingUrl ?? 'ws://localhost:8080', []);
  const iceServers = useMemo(() => window.chickadee?.iceServers ?? DEFAULT_ICE_SERVERS, []);
  const signaling = useSignaling(signalingUrl);
  const mesh = usePeerMesh(signaling, iceServers);
  const colors = useUserColors(signaling.peers.map((p) => p.id));
  const timer = useSessionTimer(signaling.status === 'connected');

  const userId = useMemo(() => store.getUserId(), []);
  const [displayName, setDisplayName] = useState(() => store.getName());
  const [rooms, setRooms] = useState<Room[]>(() => store.getRooms());
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(() => store.getChatVisible());
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noiseSuppressed, setNoiseSuppressed] = useState(true);
  const [pttOn, setPttOn] = useState(false);

  const chat = useRoomChat({ signaling, displayName, colors, roomId: currentRoomId });

  const nameNeeded = !displayName;
  const inRoom = currentRoomId !== null;
  const currentRoom = rooms.find((r) => r.id === currentRoomId) ?? null;
  const totalInRoom = inRoom ? signaling.peers.length + 1 : 0;
  const friends = useFriends(signaling.peers, userId, currentRoom?.label ?? null);

  function joinRoom(id: string): void {
    if (id === currentRoomId) return;
    setCurrentRoomId(id);
    mesh.prepareMedia();
    signaling.join(id, displayName, userId);
  }

  function leaveRoom(): void {
    signaling.leave();
    setCurrentRoomId(null);
  }

  function createRoom(label: string, icon: string): void {
    const id = slugify(label);
    setRooms((prev) => {
      const next = prev.some((r) => r.id === id) ? prev : [...prev, { id, label, icon }];
      store.setRooms(next);
      return next;
    });
    setCreateOpen(false);
    joinRoom(id);
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
        friends={friends}
        selfName={displayName}
        selfColor={SELF_COLOR}
        online={inRoom && signaling.status === 'connected'}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="main">
        <RoomHeader
          room={currentRoom}
          count={totalInRoom}
          maxCount={MAX_PEERS_PER_ROOM}
          status={signaling.status}
          timer={timer}
          noiseSuppressed={noiseSuppressed}
          onToggleNoise={() => setNoiseSuppressed((n) => !n)}
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
              onToggleMic={mesh.toggleMic}
              cameraEnabled={mesh.cameraEnabled}
              onToggleCamera={mesh.toggleCamera}
              sharingScreen={mesh.sharingScreen}
              onToggleShare={() =>
                mesh.sharingScreen ? mesh.stopScreenShare() : setPickerOpen(true)
              }
              pttOn={pttOn}
              onTogglePtt={() => setPttOn((p) => !p)}
              onVolume={() => {}}
              onSettings={() => setSettingsOpen(true)}
              onLeave={leaveRoom}
            />
          </>
        ) : (
          <div className="empty-lounge">
            <div className="empty-lounge__card">
              <div className="empty-lounge__bird">🐦</div>
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

      {nameNeeded && <NameModal onSubmit={saveName} />}
      {createOpen && <CreateRoomModal onCreate={createRoom} onClose={() => setCreateOpen(false)} />}
      {settingsOpen && (
        <SettingsModal
          displayName={displayName}
          onChangeName={saveName}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
