import { SettingsRow } from './SettingsRow';
import { ToggleRow } from './ToggleRow';
import { SliderRow } from './SliderRow';
import type { SettingsModalProps } from './types';

type SoundboardTabProps = Pick<
  SettingsModalProps,
  | 'soundboardEnabled' | 'onChangeSoundboardEnabled'
  | 'soundboardVolume' | 'onChangeSoundboardVolume'
  | 'soundboardAutoSyncEnabled' | 'onChangeSoundboardAutoSyncEnabled'
  | 'soundboardOwnClips' | 'onAddSoundboardFiles' | 'onRemoveSoundboardClip' | 'onOpenSoundboardInbox'
>;

export function SoundboardTab({
  soundboardEnabled,
  onChangeSoundboardEnabled,
  soundboardVolume,
  onChangeSoundboardVolume,
  soundboardAutoSyncEnabled,
  onChangeSoundboardAutoSyncEnabled,
  soundboardOwnClips,
  onAddSoundboardFiles,
  onRemoveSoundboardClip,
  onOpenSoundboardInbox,
}: SoundboardTabProps): React.JSX.Element {
  return (
    <>
      <ToggleRow
        label="Enable Soundboard"
        hint="Adds the Sounds button next to React and turns on background sync."
        value={soundboardEnabled}
        onChange={onChangeSoundboardEnabled}
      />

      <SliderRow
        label="Soundboard volume"
        hint="Playback volume for triggered clips. >100% may distort."
        disabled={!soundboardEnabled}
        slider={{
          min: 0,
          max: 2,
          step: 0.05,
          value: soundboardVolume,
          onChange: onChangeSoundboardVolume,
          boostFrom: 1.0,
          markers: [0, 0.5, 1.0, 1.5, 2.0],
          labels: [
            { value: 0, text: '0%' },
            { value: 1.0, text: '100%' },
            { value: 2.0, text: '200%' },
          ],
        }}
      />

      <ToggleRow
        label="Auto-sync others' sounds"
        hint="Automatically download other room members' custom clips in the background so they play instantly when triggered."
        value={soundboardAutoSyncEnabled}
        onChange={onChangeSoundboardAutoSyncEnabled}
        disabled={!soundboardEnabled}
      />

      <hr className="settings-divider" />

      <SettingsRow
        label="Custom sounds"
        hint="Drop audio files into the sounds folder, or add them here. Trimmed to 5s and compressed automatically."
        disabled={!soundboardEnabled}
      >
        <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
          <button className="btn btn--ghost" onClick={onOpenSoundboardInbox} disabled={!soundboardEnabled}>
            Open folder
          </button>
          <button className="btn btn--primary" onClick={onAddSoundboardFiles} disabled={!soundboardEnabled}>
            Add Sound
          </button>
        </div>
      </SettingsRow>

      {soundboardOwnClips.length > 0 && (
        <SettingsRow label="My sounds" disabled={!soundboardEnabled}>
          <div className="mod-banlist">
            {soundboardOwnClips.map((clip) => (
              <div key={clip.hash} className="mod-row">
                <span className="mod-row__label" title={clip.name}>
                  {clip.name}
                </span>
                <button className="seg-btn" onClick={() => onRemoveSoundboardClip(clip.hash)} disabled={!soundboardEnabled}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </SettingsRow>
      )}
    </>
  );
}
