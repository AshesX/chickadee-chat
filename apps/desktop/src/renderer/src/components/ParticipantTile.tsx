import { useEffect, useRef } from 'react';
import { MicOff, VolumeX } from 'lucide-react';
import { useAudioActivity } from '../hooks/useAudioActivity';

export interface ParticipantTileProps {
  displayName: string;
  isSelf: boolean;
  muted: boolean;
  /** If provided, controls the mute icon independently of the audio-gate `muted` prop. */
  intentionallyMuted?: boolean;
  /** Whether this participant's camera is on (show video vs. avatar). */
  cameraOn: boolean;
  /** Camera+mic stream: local (muted preview) for self, remote otherwise. */
  cameraStream: MediaStream | null;
  /** This participant's assigned accent color. */
  color: string;
  /** Connection state for remote peers; omitted for self. */
  connectionState?: RTCPeerConnectionState;
  /** Abbreviated game name (top-right tag); omitted when none. */
  gameTag?: string;
  /** Self only: actively transmitting in push-to-talk mode. */
  transmitting?: boolean;
  /** Remote only: output volume 0–1 (default 1). */
  volume?: number;
  /** Whether this participant is currently deafened. */
  deafened?: boolean;
  /** Preferred speaker deviceId (setSinkId), or '' for the system default. */
  outputDeviceId?: string;
  /** Custom avatar data URL; shown instead of the letter initial when set. */
  avatarUrl?: string | null;
}

const CONN_LABEL: Partial<Record<RTCPeerConnectionState, string>> = {
  new: 'connecting…',
  connecting: 'connecting…',
  disconnected: 'reconnecting…',
  failed: 'connection lost',
  closed: 'disconnected',
};

export function ParticipantTile({
  displayName,
  isSelf,
  muted,
  intentionallyMuted,
  cameraOn,
  cameraStream,
  color,
  connectionState,
  gameTag,
  transmitting,
  volume,
  deafened,
  outputDeviceId,
  avatarUrl,
}: ParticipantTileProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioSpeaking = useAudioActivity(muted ? null : cameraStream);
  // Gated modes (voice/PTT): transmitting prop drives the ripple so it matches the VAD gate exactly.
  // Open mic + remote peers: transmitting is undefined → fall back to audio-activity detection.
  const speaking = transmitting !== undefined ? transmitting : audioSpeaking;
  const showMuteIcon = intentionallyMuted ?? muted;

  // The <video> is always mounted so remote audio plays even with camera off.
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.srcObject = cameraStream;
  }, [cameraStream]);

  // Per-peer output volume (remote tiles).
  useEffect(() => {
    const el = videoRef.current;
    if (el && !isSelf) el.volume = Math.max(0, Math.min(1, volume ?? 1));
  }, [volume, isSelf, cameraStream]);

  // Route remote audio to the chosen output device (remote tiles only).
  useEffect(() => {
    const el = videoRef.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el && !isSelf && typeof el.setSinkId === 'function') {
      void el.setSinkId(outputDeviceId ?? '').catch(() => {
        /* device may be gone; falls back to default */
      });
    }
  }, [outputDeviceId, isSelf, cameraStream]);

  const connNote = !isSelf && connectionState ? CONN_LABEL[connectionState] : undefined;
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';

  return (
    <li
      className={`tile${isSelf ? ' tile--self' : ''}${speaking ? ' tile--speaking' : ''}`}
    >
      <div
        className="tile__ambient"
        style={{ background: `radial-gradient(circle at 50% 62%, ${color}0d 0%, transparent 58%)` }}
      />

      <video
        ref={videoRef}
        className="tile__video"
        autoPlay
        playsInline
        muted={isSelf}
        style={{ visibility: cameraOn ? 'visible' : 'hidden' }}
      />

      {!cameraOn && (
        <div className="tile__center">
          {speaking && (
            <>
              <span className="tile__ripple" style={{ borderColor: '#22c55e55' }} />
              <span
                className="tile__ripple tile__ripple--2"
                style={{ borderColor: '#22c55e28' }}
              />
            </>
          )}
          <div
            className="tile__avatar"
            style={{
              background: avatarUrl ? undefined : `linear-gradient(145deg, ${color}ee, ${color}66)`,
              boxShadow: speaking ? '0 0 34px #22c55e70' : '0 4px 22px rgba(0,0,0,.55)',
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="tile__avatar-img" />
            ) : (
              initial
            )}
            {(deafened || showMuteIcon) && (
              <span className="tile__avatar-mute">
                {deafened && <VolumeX size={11} strokeWidth={2.5} />}
                {showMuteIcon && <MicOff size={11} strokeWidth={2.5} />}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="tile__badge">
        <span className="tile__badge-name">
          {displayName}
          {isSelf && ' (you)'}
        </span>
        {deafened && cameraOn && <VolumeX size={12} className="tile__badge-mute" />}
        {showMuteIcon && cameraOn && <MicOff size={12} className="tile__badge-mute" />}
      </div>

      {gameTag && <div className="tile__gametag">🎮 {gameTag}</div>}
      {connNote && <div className="tile__conn">{connNote}</div>}
    </li>
  );
}
