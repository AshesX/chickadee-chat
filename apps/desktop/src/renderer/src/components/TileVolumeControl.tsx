import { VolumeX, Volume2 } from 'lucide-react';
import { SettingsSlider } from './SettingsSlider';

interface TileVolumeControlProps {
  displayName: string;
  /** This peer's raw per-listener volume factor 0–2 (drives the hover slider). */
  peerVolume: number;
  /** Set this peer's per-listener volume. */
  onVolumeChange: (v: number) => void;
  /** Toggle silence for this peer (click the volume icon). */
  onToggleMute?: () => void;
}

/**
 * Per-listener volume control on a remote `ParticipantTile`: a corner icon that
 * reveals a slider on hover. Edits this peer's raw volume factor; master/deafen
 * apply separately. Clicking the icon toggles silence.
 */
export function TileVolumeControl({
  displayName,
  peerVolume,
  onVolumeChange,
  onToggleMute,
}: TileVolumeControlProps): React.JSX.Element {
  const pvPct = Math.round(peerVolume * 100);
  const pvBoosted = peerVolume > 1;
  const pvMuted = peerVolume <= 0;

  return (
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
  );
}
