import { useEffect, useRef, useState } from 'react';
import { MicOff, VolumeX, Volume2, Play, EyeOff } from 'lucide-react';
import { sanitizeAvatarDataUrl } from '@chickadee/shared';
import { getSharedAudioContext, getMasterBus } from '../lib/audioContext';
import { SettingsSlider } from './SettingsSlider';

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
  /** Whether this participant is currently speaking (drives the ripple); synced from the wire. */
  speaking?: boolean;
  /** Remote only: output volume 0–2 (default 1, where 2 = 200% boost). */
  volume?: number;
  /** Remote only: this peer's raw per-listener volume factor 0–2 (drives the hover slider). */
  peerVolume?: number;
  /** Remote only: set this peer's per-listener volume (presence enables the hover control). */
  onVolumeChange?: (v: number) => void;
  /** Remote only: toggle silence for this peer (click the volume icon). */
  onToggleMute?: () => void;
  /** Whether this participant is currently deafened. */
  deafened?: boolean;
  /** Remote only: auto-level incoming audio (compressor + makeup gain) to even out quiet/loud talkers. */
  normalize?: boolean;
  /** Custom avatar data URL; shown instead of the letter initial when set. */
  avatarUrl?: string | null;
  /** Whether this participant is currently sharing their screen (drives the frame cue). */
  screenSharing?: boolean;
  /** False while the window is minimized/hidden; detaches video to stop decode. */
  windowVisible?: boolean;
  /** Remote only: whether we've opted into ("joined") this peer's video/screen. */
  subscribed?: boolean;
  /** Remote only: join this peer's video (Watch). */
  onJoinVideo?: () => void;
  /** Remote only: leave this peer's video (stop watching). */
  onLeaveVideo?: () => void;
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
  speaking = false,
  volume,
  peerVolume,
  onVolumeChange,
  onToggleMute,
  deafened,
  avatarUrl,
  normalize,
  screenSharing = false,
  windowVisible = true,
  subscribed = false,
  onJoinVideo,
  onLeaveVideo,
}: ParticipantTileProps): React.JSX.Element {
  // Validate peer-supplied avatar data URLs before rendering (defense in depth;
  // the server already sanitizes, but never trust an <img src> from the wire).
  const safeAvatarUrl = sanitizeAvatarDataUrl(avatarUrl);
  const videoRef = useRef<HTMLVideoElement>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  // True once remote audio is routed through the Web Audio graph; mutes the <video>
  // element so audio isn't played twice. Stays false (element audible) if no AudioContext.
  const [audioRouted, setAudioRouted] = useState(false);
  // `speaking` is computed by the owner (App.tsx) and synced over the signaling
  // relay (Peer.speaking) so every client renders an identical cue. Gate on
  // windowVisible so the speaking ring/glow never renders while minimized.
  const showMuteIcon = intentionallyMuted ?? muted;
  const showSpeaking = speaking && windowVisible;
  // Opt-in video: we only render a peer's camera/screen once we've joined them
  // (self always sees its own). Un-joined peers show their avatar + a Watch button.
  const showVideo = cameraOn && (isSelf || subscribed);
  const mediaShown = showVideo || (screenSharing && (isSelf || subscribed));
  // Two mutually-exclusive cues: tiles actually showing video/screen get the
  // rectangular frame outline; avatar (voice-only / un-joined) tiles get the ring.
  const showFrame = showSpeaking && mediaShown;
  const showAvatarRing = showSpeaking && !mediaShown;
  // Watch (join) appears when this peer has video available but we haven't joined.
  const showWatch = !isSelf && !subscribed && (cameraOn || screenSharing);

  // The <video> is always mounted so remote audio plays even with camera off.
  // While the window is minimized/hidden, detach the stream so Chromium stops
  // decoding video nobody can see. Safe for audio: remote audio plays through the
  // Web Audio graph below (sourced from the MediaStream), and the self preview is
  // muted — neither depends on the element's srcObject.
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.srcObject = windowVisible ? cameraStream : null;
  }, [cameraStream, windowVisible]);

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

  // Fallback when the Web Audio graph isn't wired (no AudioContext): apply volume +
  // Deafen (volume 0) directly on the <video> so they still work. Near-dead-code in
  // practice — Electron always provides an AudioContext — but it keeps Deafen correct
  // instead of silently playing at full volume. When audioRouted, the element is muted
  // and the gain node owns volume, so this is a no-op.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || isSelf || audioRouted) return;
    el.volume = Math.max(0, Math.min(1, volume ?? 1));
  }, [volume, isSelf, audioRouted]);

  const connNote = !isSelf && connectionState ? CONN_LABEL[connectionState] : undefined;
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';

  // Per-listener volume control (remote peers only): a corner icon that reveals a
  // slider on hover. Edits this peer's raw volume factor; master/deafen apply separately.
  const showVolumeControl = !isSelf && onVolumeChange != null;
  const pv = peerVolume ?? 1;
  const pvPct = Math.round(pv * 100);
  const pvBoosted = pv > 1;
  const pvMuted = pv <= 0;

  return (
    <li
      className={`tile${isSelf ? ' tile--self' : ''}${showFrame ? ' tile--speaking' : ''}`}
      style={{ '--accent': color, '--accent-glow': `${color}70` } as React.CSSProperties}
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
        style={{ visibility: showVideo ? 'visible' : 'hidden' }}
      />

      {!showVideo && (
        <div className="tile__center">
          <div
            className={`tile__avatar${showAvatarRing ? ' tile__avatar--speaking' : ''}`}
            style={{
              background: safeAvatarUrl ? undefined : `linear-gradient(145deg, ${color}ee, ${color}66)`,
            }}
          >
            {safeAvatarUrl ? (
              <img src={safeAvatarUrl} alt={displayName} className="tile__avatar-img" />
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
        {deafened && showVideo && <VolumeX size={12} className="tile__badge-mute" />}
        {showMuteIcon && showVideo && <MicOff size={12} className="tile__badge-mute" />}
      </div>

      {connNote && <div className="tile__conn">{connNote}</div>}

      {showVolumeControl && (
        <div className={`tile__volume${pvBoosted ? ' tile__volume--boost' : ''}${pvMuted ? ' tile__volume--muted' : ''}`}>
          <button
            type="button"
            className="tile__volume-icon-btn"
            onClick={onToggleMute}
            title={pvMuted ? `Unmute ${displayName}` : `Mute ${displayName}`}
            aria-label={pvMuted ? `Unmute ${displayName}` : `Mute ${displayName}`}
          >
            {pvMuted ? <VolumeX size={15} strokeWidth={2.5} /> : <Volume2 size={15} />}
          </button>
          <SettingsSlider
            min={0}
            max={200}
            step={5}
            value={pvPct}
            boostFrom={100}
            onChange={(v) => onVolumeChange(v / 100)}
            markers={[100]}
          />
          <span className="tile__volume-pct">{pvMuted ? 'Muted' : `${pvPct}%`}</span>
        </div>
      )}

      {showWatch && (
        <button type="button" className="tile__watch" onClick={onJoinVideo}>
          <Play size={15} strokeWidth={2.5} fill="currentColor" />
          Watch
        </button>
      )}

      {!isSelf && subscribed && showVideo && (
        <button
          type="button"
          className="tile__leave"
          onClick={onLeaveVideo}
          title={`Stop watching ${displayName}`}
          aria-label={`Stop watching ${displayName}`}
        >
          <EyeOff size={14} strokeWidth={2.5} />
        </button>
      )}
    </li>
  );
}
