import {
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  VideoOff,
  VolumeX,
  PhoneOff,
} from 'lucide-react';
import { capacityForType, sanitizeAvatarDataUrl, type Room } from '@chickadee/shared';
import type { SpaceUser } from '../../hooks/useSpacePresence';
import { INPUT_MODE_ICONS } from '../../lib/inputModeIcons';
import { RoomIcon } from '../RoomIcon';

interface RoomRowProps {
  room: Room;
  currentRoomId: string | null;
  users: SpaceUser[];
  selfName: string;
  selfInitial: string;
  selfColor: string;
  selfStatus: 'online' | 'idle' | 'dnd';
  selfAvatarUrl?: string | null;
  selfSpeaking: boolean;
  speakingUserIds: Set<string>;
  mutedUserIds: Set<string>;
  onTogglePeerMute: (userId: string) => void;
  onSelectRoom: (id: string) => void;
  onContextMenu: (room: Room, x: number, y: number) => void;
  compact: boolean;
  micEnabled: boolean;
  hasMic: boolean;
  onToggleMic: () => void;
  deafened: boolean;
  onToggleDeafen: () => void;
  inputMode: 'open' | 'voice' | 'ptt';
  onCycleInputMode: () => void;
  hasVideoSubs: boolean;
  onLeaveAllVideo: () => void;
  onLeaveRoom: () => void;
}

export function RoomRow({
  room: r,
  currentRoomId,
  users,
  selfName,
  selfInitial,
  selfColor,
  selfStatus,
  selfAvatarUrl,
  selfSpeaking,
  speakingUserIds,
  mutedUserIds,
  onTogglePeerMute,
  onSelectRoom,
  onContextMenu,
  compact,
  micEnabled,
  hasMic,
  onToggleMic,
  deafened,
  onToggleDeafen,
  inputMode,
  onCycleInputMode,
  hasVideoSubs,
  onLeaveAllVideo,
  onLeaveRoom,
}: RoomRowProps): React.JSX.Element {
  const InputModeIcon = INPUT_MODE_ICONS[inputMode];
  const active = r.id === currentRoomId;

  const roomUsers = users.filter((u) => u.roomId === r.id);
  if (active) {
    roomUsers.unshift({
      id: 'self',
      name: selfName,
      initial: selfInitial,
      color: selfColor,
      status: selfStatus,
      where: '',
      roomId: r.id,
      avatarUrl: selfAvatarUrl || undefined,
    });
  }

  const cap = capacityForType(r.type);
  const occupancy = roomUsers.length;
  const full = occupancy >= cap;
  // Active (joined) room, both modes: avatars get a dedicated full-width strip
  // below the name (fits the whole roster incl. self); non-active rooms keep the
  // lightweight inline cluster (4 + "+N").
  const useStrip = active;

  const renderAvatar = (u: SpaceUser): React.JSX.Element => {
    const uAvatar = sanitizeAvatarDataUrl(u.avatarUrl);
    const isSpeaking = u.id === 'self' ? selfSpeaking : speakingUserIds.has(u.id);
    // Click another user's avatar to mute/unmute them — active room only, never self.
    const muteClickable = active && u.id !== 'self';
    const muted = mutedUserIds.has(u.id);
    return (
      <div
        key={u.id}
        className={`room-row__avatar${isSpeaking ? ' room-row__avatar--speaking' : ''}${muteClickable ? ' room-row__avatar--mutable' : ''}`}
        style={{
          ...(uAvatar ? {} : { background: u.color }),
          '--avatar-accent': u.color,
        } as React.CSSProperties}
        {...(muteClickable
          ? {
              role: 'button',
              title: muted ? `Unmute ${u.name}` : `Mute ${u.name}`,
              'aria-label': muted ? `Unmute ${u.name}` : `Mute ${u.name}`,
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                onTogglePeerMute(u.id);
              },
            }
          : {})}
      >
        {uAvatar ? <img src={uAvatar} alt={u.name} /> : u.initial}
        {muteClickable && muted && (
          <span className="room-row__avatar-mute">
            <VolumeX size={11} strokeWidth={2.5} />
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      key={r.id}
      className={`room-row${active ? ' room-row--active' : ''}${full && !active ? ' room-row--full' : ''}`}
    >
      {active && (
        <div className="room-row__bg-icon">
          <RoomIcon name={r.icon} size={100} />
        </div>
      )}
      <button
        className="room-row__main"
        onClick={() => onSelectRoom(r.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(r, e.clientX, e.clientY);
        }}
      >
        <span className="room-row__icon"><RoomIcon name={r.icon} size={18} /></span>
        <span className="room-row__name">{r.label}</span>
        {!useStrip && roomUsers.length > 0 && (
          <div className="room-row__avatars">
            {roomUsers.slice(0, 4).map(renderAvatar)}
            {roomUsers.length > 4 && (
              <div className="room-row__avatar" style={{ background: 'var(--border)' }}>
                +{roomUsers.length - 4}
              </div>
            )}
          </div>
        )}
        {occupancy > 0 && (
          <span className={`room-row__count${full ? ' room-row__count--full' : ''}`}>
            {occupancy}/{cap}
          </span>
        )}
      </button>
      {useStrip && roomUsers.length > 0 && (
        <div className="room-row__avatar-strip">{roomUsers.map(renderAvatar)}</div>
      )}
      {compact && active && (
        <div className="room-row__mini-controls">
          <button
            className={`room-row__mini-btn${micEnabled ? '' : ' room-row__mini-btn--danger'}`}
            onClick={onToggleMic}
            disabled={!hasMic}
            title={micEnabled ? 'Mute' : 'Unmute'}
            aria-label={micEnabled ? 'Mute' : 'Unmute'}
          >
            {micEnabled ? <Mic size={14} /> : <MicOff size={14} />}
          </button>
          <button
            className={`room-row__mini-btn${deafened ? ' room-row__mini-btn--danger' : ''}`}
            onClick={onToggleDeafen}
            title={deafened ? 'Undeafen' : 'Deafen'}
            aria-label={deafened ? 'Undeafen' : 'Deafen'}
          >
            {deafened ? <HeadphoneOff size={14} /> : <Headphones size={14} />}
          </button>
          <button
            className={`room-row__mini-btn${selfSpeaking ? ' room-row__mini-btn--speaking' : ''}`}
            onClick={onCycleInputMode}
            title={inputMode === 'ptt' ? 'Push-Talk' : inputMode === 'voice' ? 'Voice' : 'Open Mic'}
            aria-label="Cycle input mode"
          >
            <InputModeIcon size={14} />
          </button>
          {hasVideoSubs && (
            <button
              className="room-row__mini-btn room-row__mini-btn--end room-row__mini-btn--danger"
              onClick={onLeaveAllVideo}
              title="Leave video"
              aria-label="Leave video"
            >
              <VideoOff size={14} />
            </button>
          )}
          <button
            className="room-row__mini-btn room-row__mini-btn--end room-row__mini-btn--danger"
            onClick={onLeaveRoom}
            title="Leave room"
            aria-label="Leave room"
          >
            <PhoneOff size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
