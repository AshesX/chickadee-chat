import { useMemo, useState, type FormEvent } from 'react';
import { MAX_PEERS_PER_ROOM } from '@chickadee/shared';
import { useSignaling } from './hooks/useSignaling';
import { usePeerMesh } from './hooks/usePeerMesh';
import { ParticipantTile } from './components/ParticipantTile';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  'room-full': 'Room full',
  error: 'Connection error',
  closed: 'Disconnected',
};

export function App(): React.JSX.Element {
  const signalingUrl = useMemo(
    () => window.chickadee?.signalingUrl ?? 'ws://localhost:8080',
    [],
  );
  const signaling = useSignaling(signalingUrl);
  const mesh = usePeerMesh(signaling);

  const [displayName, setDisplayName] = useState('');
  const [room, setRoom] = useState('lobby');

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
              <button className="btn--leave" onClick={signaling.leave}>
                Leave
              </button>
            </div>
          </div>

          {mesh.micError && <p className="error">{mesh.micError}</p>}

          <ul className="peers">
            <ParticipantTile
              displayName={displayName}
              isSelf
              muted={!mesh.micEnabled}
              stream={mesh.localStream}
            />
            {signaling.peers.map((peer) => {
              const media = mesh.remote[peer.id];
              return (
                <ParticipantTile
                  key={peer.id}
                  displayName={peer.displayName}
                  isSelf={false}
                  muted={peer.muted}
                  stream={media?.stream ?? null}
                  connectionState={media?.connectionState ?? 'new'}
                />
              );
            })}
          </ul>

          {signaling.peers.length === 0 && (
            <p className="hint">Waiting for others to join “{room}”…</p>
          )}
        </main>
      )}
    </div>
  );
}
