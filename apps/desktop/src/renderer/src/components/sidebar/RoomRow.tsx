import { VolumeX, Lock } from 'lucide-react';
import { capacityForType, sanitizeAvatarDataUrl, type Room } from '@chickadee/shared';
import type { SpaceUser } from '../../hooks/useSpacePresence';
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
  /** Whether this room is currently locked to new entrants (moderation). */
  locked?: boolean;
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
  locked = false,
}: RoomRowProps): React.JSX.Element {
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

  const renderAvatar = (u: SpaceUser): React.JSX.Element => {
    const uAvatar = sanitizeAvatarDataUrl(u.avatarUrl);
    const isSpeaking = u.id === 'self' ? selfSpeaking : speakingUserIds.has(u.id);
    // Click another user's avatar to mute/unmute them — active room only, never self.
    const muteClickable = active && u.id !== 'self';
    const muted = mutedUserIds.has(u.id);
    return (
      <div
        key={u.id}
        className={`avatar avatar--sm room-row__avatar${isSpeaking ? ' room-row__avatar--speaking' : ''}${muteClickable ? ' room-row__avatar--mutable' : ''}`}
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
      <button
        className="room-row__main"
        onClick={() => onSelectRoom(r.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(r, e.clientX, e.clientY);
        }}
      >
        <span className="room-row__icon"><RoomIcon name={r.icon} size={24} /></span>
        <span className="room-row__name">{r.label}</span>
        {locked && <Lock size={12} className="room-row__lock" aria-label="Room locked" />}
        {occupancy > 0 && (
          <span className={`room-row__count${full ? ' room-row__count--full' : ''}`}>
            {occupancy}/{cap}
          </span>
        )}
      </button>
      {active && roomUsers.length > 0 && (
        <div className="room-row__avatar-strip">
          {roomUsers.map(renderAvatar)}
        </div>
      )}
    </div>
  );
}
