import { useEffect, useRef } from 'react';

export interface ScreenViewProps {
  /** Whose screen this is, for the label. */
  displayName: string;
  isSelf: boolean;
  /** The screen-share stream (screen video + optional system audio). */
  stream: MediaStream | null;
}

/**
 * Large presentation view of a shared screen. Uses object-fit: contain so the
 * whole screen is visible (never cropped). Self is muted to avoid echoing our
 * own captured system audio; remote screens play their game audio.
 */
export function ScreenView({ displayName, isSelf, stream }: ScreenViewProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.srcObject = stream;
  }, [stream]);

  return (
    <div className="screen">
      <video ref={videoRef} className="screen__video" autoPlay playsInline muted={isSelf} />
      <span className="screen__label">
        {isSelf ? 'Your screen' : `${displayName}'s screen`}
      </span>
    </div>
  );
}
