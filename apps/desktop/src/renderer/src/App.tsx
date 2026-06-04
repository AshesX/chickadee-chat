import { useMemo, useState, type FormEvent } from 'react';
import { MAX_PEERS_PER_ROOM } from '@chickadee/shared';
import { useSignaling } from './hooks/useSignaling';

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

  const [displayName, setDisplayName] = useState('');
  const [room, setRoom] = useState('lobby');

  const inCall = signaling.status === 'connected';
  const isBusy = signaling.status === 'connecting';

  function handleJoin(event: FormEvent): void {
    event.preventDefault();
    if (!displayName.trim()) return;
    signaling.join(room.trim() || 'lobby', displayName.trim());
  }

  // Self plus other peers, for the room count.
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
            <button className="btn--leave" onClick={signaling.leave}>
              Leave
            </button>
          </div>

          <ul className="peers">
            <li className="peer peer--self">
              <span className="peer__avatar">{avatarFor(displayName)}</span>
              <span className="peer__name">{displayName}</span>
              <span className="peer__tag">you</span>
            </li>
            {signaling.peers.map((peer) => (
              <li className="peer" key={peer.id}>
                <span className="peer__avatar">{avatarFor(peer.displayName)}</span>
                <span className="peer__name">{peer.displayName}</span>
              </li>
            ))}
          </ul>

          {signaling.peers.length === 0 && (
            <p className="hint">Waiting for others to join “{room}”…</p>
          )}
        </main>
      )}
    </div>
  );
}

function avatarFor(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
