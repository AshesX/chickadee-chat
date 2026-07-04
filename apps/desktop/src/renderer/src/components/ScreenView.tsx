import { useEffect, useMemo, useRef } from 'react';
import { EyeOff, Eye, Minimize2 } from 'lucide-react';

export interface ScreenViewProps {
  /** Whose stream this is, for the label. */
  displayName: string;
  isSelf: boolean;
  /** What the stage is showing: a screen share or a spotlighted camera. */
  kind?: 'screen' | 'camera';
  /** The stage stream (screen/camera video + optional audio). */
  stream: MediaStream | null;
  /** Preferred speaker deviceId (setSinkId), or '' for the system default. */
  outputDeviceId?: string;
  /** False while the window is minimized/hidden; pauses video decode (audio kept). */
  windowVisible?: boolean;
  /** Remote only: leave this peer's stream (stop watching). */
  onLeave?: () => void;
  /** Self only: how many peers are currently watching our stream. */
  watcherCount?: number;
  /** Self only: drop this stream off the stage (stop screen share / unspotlight camera). */
  onUnspotlight?: () => void;
}

/**
 * Large presentation view of the room stage — a shared screen or a spotlighted
 * camera. Uses object-fit: contain so the whole frame is visible (never cropped);
 * a self camera is mirrored. Self is muted to avoid echoing our own captured audio;
 * remote streams play their audio.
 */
export function ScreenView({ displayName, isSelf, kind = 'screen', stream, outputDeviceId, windowVisible = true, onLeave, watcherCount, onUnspotlight }: ScreenViewProps): React.JSX.Element {
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

  // Route remote screen audio to the chosen output device (remote only).
  useEffect(() => {
    const el = videoRef.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el && !isSelf && typeof el.setSinkId === 'function') {
      void el.setSinkId(outputDeviceId ?? '').catch(() => {
        /* device may be gone; falls back to default */
      });
    }
  }, [outputDeviceId, isSelf, stream]);

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
        muted={isSelf}
      />
      <span className="screen__label">{label}</span>
      {isSelf && typeof watcherCount === 'number' && watcherCount > 0 && (
        <span className="screen__watchers" title={`${watcherCount} watching`}>
          <Eye size={13} strokeWidth={2.5} />
          {watcherCount}
        </span>
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
