import { useEffect, useMemo, useRef } from 'react';
import { EyeOff, Eye, Minimize2 } from 'lucide-react';
import { useAudioGraph } from '../hooks/useAudioGraph';
import { TileVolumeControl } from './TileVolumeControl';

export interface ScreenViewProps {
  /** Whose stream this is, for the label. */
  displayName: string;
  isSelf: boolean;
  /** What the stage is showing: a screen share or a spotlighted camera. */
  kind?: 'screen' | 'camera';
  /** The stage stream (screen/camera video + optional audio). */
  stream: MediaStream | null;
  /** False while the window is minimized/hidden; pauses video decode (audio kept). */
  windowVisible?: boolean;
  /** Remote only: leave this peer's stream (stop watching). */
  onLeave?: () => void;
  /** Self only: display names of peers currently watching our stream. */
  watcherNames?: string[];
  /** Self only: drop this stream off the stage (stop screen share / unspotlight camera). */
  onUnspotlight?: () => void;
  /**
   * Remote screen share only: this peer's screen-share audio gain (0–2,
   * already folded in deafen/master-output-volume) — independent of their
   * voice volume, which a camera has no separate audio track for anyway.
   */
  screenAudioVolume?: number;
  /** Remote screen share only: the raw 0–2 factor for the volume control's own display/mute detection. */
  screenAudioLevel?: number;
  onScreenAudioVolumeChange?: (v: number) => void;
  onToggleScreenAudioMute?: () => void;
}

/**
 * Large presentation view of the room stage — a shared screen or a spotlighted
 * camera. Uses object-fit: contain so the whole frame is visible (never cropped);
 * a self camera is mirrored. The `<video>` element itself is always muted (self
 * to avoid echoing our own captured audio, remote to avoid double-playing audio
 * that a Web Audio graph already routes elsewhere) — see the screen-audio graph
 * below for how a remote screen share's audio actually reaches the speakers.
 */
export function ScreenView({
  displayName,
  isSelf,
  kind = 'screen',
  stream,
  windowVisible = true,
  onLeave,
  watcherNames,
  onUnspotlight,
  screenAudioVolume,
  screenAudioLevel,
  onScreenAudioVolumeChange,
  onToggleScreenAudioMute,
}: ScreenViewProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);

  // While minimized/hidden, feed the element an audio-only stream so the shared
  // game/system audio keeps playing (it routes through this element, not a Web
  // Audio graph) while the video track is dropped and Chromium stops decoding it.
  const audioOnlyStream = useMemo(() => {
    if (!stream) return null;
    const audio = stream.getAudioTracks();
    return audio.length ? new MediaStream(audio) : null;
  }, [stream]);

  // Screen share usually arrives as a fresh stream object, but if loopback audio
  // lands on it before the screen video track, the video would be a late addition
  // to an already-bound srcObject (Chromium won't auto-paint it). Key on the video
  // track id and bind a fresh wrapper to force a repaint when it appears.
  const videoTrackId = stream?.getVideoTracks()[0]?.id ?? null;
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = windowVisible && stream ? new MediaStream(stream.getTracks()) : audioOnlyStream;
  }, [stream, videoTrackId, windowVisible, audioOnlyStream]);

  // Screen-share audio gets its own Web Audio gain graph (independent of voice
  // volume) so it can be muted/boosted 0–200%. A spotlighted CAMERA has no
  // separate audio track of its own — that peer's mic is already fully routed
  // through their (always-rendered) filmstrip tile via usePeerAudioGraph, so
  // building a second graph here would double-play their voice. The <video>
  // element below is unconditionally muted for both kinds; audio for a remote
  // screen share plays via this graph, and audio for a remote camera plays via
  // the filmstrip tile only.
  const routeScreenAudio = !isSelf && kind === 'screen';
  useAudioGraph({ stream, active: routeScreenAudio, volume: screenAudioVolume });
  const hasScreenAudio = routeScreenAudio && (stream?.getAudioTracks().length ?? 0) > 0;

  const label = kind === 'camera'
    ? (isSelf ? 'Your camera' : `${displayName}'s camera`)
    : (isSelf ? 'Your screen' : `${displayName}'s screen`);

  return (
    <div className="screen">
      <video
        ref={videoRef}
        className={`screen__video${isSelf && kind === 'camera' ? ' screen__video--mirror' : ''}`}
        autoPlay
        playsInline
        muted
      />
      <div className="screen__info">
        <span className="screen__label">{label}</span>
        {isSelf && watcherNames && watcherNames.length > 0 && (
          <span className="screen__watchers" title={watcherNames.join(', ')}>
            <Eye size={13} strokeWidth={2.5} />
            {watcherNames.join(', ')}
          </span>
        )}
      </div>
      {hasScreenAudio && onScreenAudioVolumeChange && (
        <TileVolumeControl
          displayName={`${displayName}'s screen audio`}
          peerVolume={screenAudioLevel ?? 1}
          onVolumeChange={onScreenAudioVolumeChange}
          onToggleMute={onToggleScreenAudioMute}
        />
      )}
      {isSelf && onUnspotlight && (
        <button
          type="button"
          className="screen__leave"
          onClick={onUnspotlight}
          title={kind === 'camera' ? 'Remove from stage' : 'Stop sharing'}
        >
          <Minimize2 size={14} strokeWidth={2.5} />
          {kind === 'camera' ? 'Unspotlight' : 'Stop sharing'}
        </button>
      )}
      {!isSelf && onLeave && (
        <button type="button" className="screen__leave" onClick={onLeave}>
          <EyeOff size={14} strokeWidth={2.5} />
          Stop watching
        </button>
      )}
    </div>
  );
}
