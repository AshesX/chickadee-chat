import { useEffect, useRef, useState } from 'react';
import { MicOff, VolumeX } from 'lucide-react';
import { useAudioActivity } from '../hooks/useAudioActivity';
import { getSharedAudioContext, getMasterBus } from '../lib/audioContext';

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
  /** Remote only: output volume 0–2 (default 1, where 2 = 200% boost). */
  volume?: number;
  /** Whether this participant is currently deafened. */
  deafened?: boolean;
  /** Preferred speaker deviceId (setSinkId), or '' for the system default. */
  outputDeviceId?: string;
  /** Remote only: auto-level incoming audio (compressor + makeup gain) to even out quiet/loud talkers. */
  normalize?: boolean;
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
  normalize,
}: ParticipantTileProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  // True once remote audio is routed through the Web Audio graph; mutes the <video>
  // element so audio isn't played twice. Stays false (element audible) if no AudioContext.
  const [audioRouted, setAudioRouted] = useState(false);
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

  // Build a per-peer Web Audio graph (remote only) so gain > 1.0 is possible.
  // Source from the MediaStream, not the <video> element: createMediaElementSource
  // binds the element permanently (crashes on StrictMode re-mount) and goes silent for
  // remote WebRTC streams in Chromium. createMediaStreamSource has neither problem.
  // When `normalize` is on, a compressor + makeup gain are inserted ahead of the manual
  // gain to auto-level quiet/loud talkers (listener-side, no dependence on the sender):
  //   normalize on:  source → compressor → makeup → gain → destination
  //   normalize off: source → gain → destination
  useEffect(() => {
    if (isSelf || !cameraStream) return;
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    const src = ctx.createMediaStreamSource(cameraStream);
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, volume ?? 1);
    let compressor: DynamicsCompressorNode | null = null;
    let makeup: GainNode | null = null;
    if (normalize) {
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -28;
      compressor.knee.value = 24;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      makeup = ctx.createGain();
      makeup.gain.value = 1.8; // ≈ +5 dB to recover compressed level
      src.connect(compressor);
      compressor.connect(makeup);
      makeup.connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(getMasterBus() ?? ctx.destination);
    sourceNodeRef.current = src;
    gainNodeRef.current = gain;
    setAudioRouted(true);
    return () => {
      src.disconnect();
      compressor?.disconnect();
      makeup?.disconnect();
      gain.disconnect();
      sourceNodeRef.current = null;
      gainNodeRef.current = null;
      setAudioRouted(false);
    };
  }, [cameraStream, isSelf, normalize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-peer output volume via GainNode (supports 0–2 for 0–200% boost).
  // cameraStream is a dep so the value re-applies after the graph rebuilds.
  useEffect(() => {
    if (gainNodeRef.current && !isSelf)
      gainNodeRef.current.gain.value = Math.max(0, volume ?? 1);
  }, [volume, isSelf, cameraStream]);

  // Route remote audio to the chosen output device via the shared AudioContext.
  useEffect(() => {
    if (isSelf) return;
    const ctx = getSharedAudioContext() as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    void ctx?.setSinkId?.(outputDeviceId ?? '').catch(() => {});
  }, [outputDeviceId, isSelf]);

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
        muted={isSelf || audioRouted}
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
