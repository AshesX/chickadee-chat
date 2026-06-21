import { useEffect, useMemo, useRef } from 'react';
import { EyeOff, Eye } from 'lucide-react';

export interface ScreenViewProps {
  /** Whose screen this is, for the label. */
  displayName: string;
  isSelf: boolean;
  /** The screen-share stream (screen video + optional system audio). */
  stream: MediaStream | null;
  /** Preferred speaker deviceId (setSinkId), or '' for the system default. */
  outputDeviceId?: string;
  /** False while the window is minimized/hidden; pauses video decode (audio kept). */
  windowVisible?: boolean;
  /** Remote only: leave this peer's stream (stop watching). */
  onLeave?: () => void;
  /** Self only: how many peers are currently watching our stream. */
  watcherCount?: number;
}

/**
 * Large presentation view of a shared screen. Uses object-fit: contain so the
 * whole screen is visible (never cropped). Self is muted to avoid echoing our
 * own captured system audio; remote screens play their game audio.
 */
export function ScreenView({ displayName, isSelf, stream, outputDeviceId, windowVisible = true, onLeave, watcherCount }: ScreenViewProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);

  // While minimized/hidden, feed the element an audio-only stream so the shared
  // game/system audio keeps playing (it routes through this element, not a Web
  // Audio graph) while the video track is dropped and Chromium stops decoding it.
  const audioOnlyStream = useMemo(() => {
    if (!stream) return null;
    const audio = stream.getAudioTracks();
    return audio.length ? new MediaStream(audio) : null;
  }, [stream]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.srcObject = windowVisible ? stream : audioOnlyStream;
  }, [stream, windowVisible, audioOnlyStream]);

  // Route remote screen audio to the chosen output device (remote only).
  useEffect(() => {
    const el = videoRef.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el && !isSelf && typeof el.setSinkId === 'function') {
      void el.setSinkId(outputDeviceId ?? '').catch(() => {
        /* device may be gone; falls back to default */
      });
    }
  }, [outputDeviceId, isSelf, stream]);

  return (
    <div className="screen">
      <video ref={videoRef} className="screen__video" autoPlay playsInline muted={isSelf} />
      <span className="screen__label">
        {isSelf ? 'Your screen' : `${displayName}'s screen`}
      </span>
      {isSelf && typeof watcherCount === 'number' && watcherCount > 0 && (
        <span className="screen__watchers" title={`${watcherCount} watching`}>
          <Eye size={13} strokeWidth={2.5} />
          {watcherCount}
        </span>
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
