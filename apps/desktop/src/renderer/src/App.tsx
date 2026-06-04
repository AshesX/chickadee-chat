import { useMemo, useState, type FormEvent } from 'react';
import { MAX_PEERS_PER_ROOM } from '@chickadee/shared';
import { useSignaling } from './hooks/useSignaling';
import { usePeerMesh } from './hooks/usePeerMesh';
import { ParticipantTile } from './components/ParticipantTile';
import { ScreenView } from './components/ScreenView';
import { ScreenSharePicker } from './components/ScreenSharePicker';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  'room-full': 'Room full',
  error: 'Connection error',
  closed: 'Disconnected',
};

interface ActiveScreen {
  key: string;
  displayName: string;
  isSelf: boolean;
  stream: MediaStream;
}

export function App(): React.JSX.Element {
  const signalingUrl = useMemo(
    () => window.chickadee?.signalingUrl ?? 'ws://localhost:8080',
    [],
  );
  const signaling = useSignaling(signalingUrl);
  const mesh = usePeerMesh(signaling);

  const [displayName, setDisplayName] = useState('');
  const [room, setRoom] = useState('lobby');
  const [pickerOpen, setPickerOpen] = useState(false);

  const inCall = signaling.status === 'connected';
  const isBusy = signaling.status === 'connecting';

  function handleJoin(event: FormEvent): void {
    event.preventDefault();
    const name = displayName.trim();
    if (!name) return;
    mesh.prepareMedia(); // kick off mic acquisition so the prompt shows now
    signaling.join(room.trim() || 'lobby', name);
  }

  const totalInRoom = inCall ? signaling.peers.length + 1 : 0;

  // Camera tiles (self + peers), reused in both grid and filmstrip layouts.
  const tiles = inCall && (
    <>
      <ParticipantTile
        displayName={displayName}
        isSelf
        muted={!mesh.micEnabled}
        cameraOn={mesh.cameraEnabled}
        cameraStream={mesh.localStream}
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
            connectionState={media?.connectionState ?? 'new'}
          />
        );
      })}
    </>
  );

  // Active screen shares: ours plus any peer currently sharing.
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

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">🐦 Chickadee Chat</h1>
        <span className={`badge badge--${signaling.status}`}>
          {STATUS_LABEL[signaling.status] ?? signaling.status}
        </span>
      </header>

      {!inCall ? (
        <form className="join" onSubmit={handleJoin}>
          <label className="field">
            <span>Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Robin"
              autoFocus
              maxLength={32}
            />
          </label>

          <label className="field">
            <span>Room</span>
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="lobby"
              maxLength={32}
            />
          </label>

          <button type="submit" disabled={isBusy || !displayName.trim()}>
            {isBusy ? 'Joining…' : 'Join room'}
          </button>

          {signaling.error && <p className="error">{signaling.error}</p>}
          <p className="hint">Signaling: {signalingUrl}</p>
        </form>
      ) : (
        <main className="room">
          <div className="room__bar">
            <div>
              <h2 className="room__name">Room: {room}</h2>
              <p className="room__count">
                {totalInRoom} / {MAX_PEERS_PER_ROOM} in room
              </p>
            </div>
            <div className="room__actions">
              <button
                className={`btn--mic${mesh.micEnabled ? '' : ' btn--mic-off'}`}
                onClick={mesh.toggleMic}
                disabled={!mesh.localStream}
                title={mesh.localStream ? '' : 'No microphone'}
              >
                {mesh.micEnabled ? '🎙️ Mute' : '🔇 Unmute'}
              </button>
              <button
                className={`btn--cam${mesh.cameraEnabled ? ' btn--cam-on' : ''}`}
                onClick={mesh.toggleCamera}
              >
                {mesh.cameraEnabled ? '📷 Stop video' : '📹 Start video'}
              </button>
              <button
                className={`btn--share${mesh.sharingScreen ? ' btn--share-on' : ''}`}
                onClick={() =>
                  mesh.sharingScreen ? mesh.stopScreenShare() : setPickerOpen(true)
                }
              >
                {mesh.sharingScreen ? '🛑 Stop sharing' : '🖥️ Share screen'}
              </button>
              <button className="btn--leave" onClick={signaling.leave}>
                Leave
              </button>
            </div>
          </div>

          {mesh.micError && <p className="error">{mesh.micError}</p>}
          {mesh.cameraError && <p className="error">{mesh.cameraError}</p>}
          {mesh.screenError && <p className="error">{mesh.screenError}</p>}

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

          {signaling.peers.length === 0 && !presenting && (
            <p className="hint">Waiting for others to join “{room}”…</p>
          )}
        </main>
      )}

      {pickerOpen && (
        <ScreenSharePicker
          onPick={(id, withAudio) => {
            setPickerOpen(false);
            mesh.startScreenShare(id, withAudio);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
