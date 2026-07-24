import { SettingsRow } from './SettingsRow';
import { ToggleRow } from './ToggleRow';
import { SliderRow } from './SliderRow';
import { SoundboardManager } from './SoundboardManager';
import type { SettingsModalProps } from './types';

type SoundboardTabProps = Pick<
  SettingsModalProps,
  | 'soundboardEnabled' | 'onChangeSoundboardEnabled'
  | 'soundboardButtonEnabled' | 'onChangeSoundboardButtonEnabled'
  | 'soundboardVolume' | 'onChangeSoundboardVolume'
  | 'soundboardPresetsEnabled' | 'onChangeSoundboardPresetsEnabled'
  | 'soundboardCustomEnabled' | 'onChangeSoundboardCustomEnabled'
  | 'soundboardOwnClips' | 'soundboardCategories' | 'soundboardStats'
  | 'onAddSoundboardFiles' | 'onRemoveSoundboardClip' | 'soundboardAddError'
  | 'onCreateSoundboardCategory' | 'onRenameSoundboardCategory' | 'onDeleteSoundboardCategory'
  | 'onSetSoundboardCategoryShared' | 'onMoveSoundboardClip' | 'onRenameSoundboardClip' | 'soundboardActionError'
>;

export function SoundboardTab({
  soundboardEnabled,
  onChangeSoundboardEnabled,
  soundboardButtonEnabled,
  onChangeSoundboardButtonEnabled,
  soundboardVolume,
  onChangeSoundboardVolume,
  soundboardPresetsEnabled,
  onChangeSoundboardPresetsEnabled,
  soundboardCustomEnabled,
  onChangeSoundboardCustomEnabled,
  soundboardOwnClips,
  soundboardCategories,
  soundboardStats,
  onAddSoundboardFiles,
  onRemoveSoundboardClip,
  soundboardAddError,
  onCreateSoundboardCategory,
  onRenameSoundboardCategory,
  onDeleteSoundboardCategory,
  onSetSoundboardCategoryShared,
  onMoveSoundboardClip,
  onRenameSoundboardClip,
  soundboardActionError,
}: SoundboardTabProps): React.JSX.Element {
  const customDisabled = !soundboardEnabled || !soundboardCustomEnabled;

  return (
    <>
      <ToggleRow
        label="Enable Soundboard"
        hint="Hear soundboard clips others trigger, and enables playing your own. Turns on background sync."
        value={soundboardEnabled}
        onChange={onChangeSoundboardEnabled}
      />

      <ToggleRow
        label="Show Soundboard button"
        hint="Show the Sounds button in the control bar. Turn off if you'd rather not trigger sounds yourself but still want to hear others'."
        value={soundboardButtonEnabled}
        onChange={onChangeSoundboardButtonEnabled}
        disabled={!soundboardEnabled}
      />

      <SliderRow
        label="Soundboard volume"
        hint="Playback volume for triggered clips."
        disabled={!soundboardEnabled}
        slider={{
          min: 0,
          max: 1,
          step: 0.05,
          value: soundboardVolume,
          onChange: onChangeSoundboardVolume,
          markers: [0, 0.5, 1.0],
          labels: [
            { value: 0, text: '0%' },
            { value: 0.5, text: '50%' },
            { value: 1.0, text: '100%' },
          ],
        }}
      />

      <ToggleRow
        label="Preset sounds"
        hint="Show the bundled preset clips. Turn off to only use your own custom sounds."
        value={soundboardPresetsEnabled}
        onChange={onChangeSoundboardPresetsEnabled}
        disabled={!soundboardEnabled}
      />

      <ToggleRow
        label="Enable custom sounds"
        hint="Play and share your own custom sound clips. Turn off to only use presets — your added clips stay saved but stop syncing to others."
        value={soundboardCustomEnabled}
        onChange={onChangeSoundboardCustomEnabled}
        disabled={!soundboardEnabled}
      />

      <hr className="settings-divider" />

      <SettingsRow
        label="Custom sounds"
        hint="Add your own sounds. Trimmed to 5s and compressed automatically."
        disabled={customDisabled}
      >
        <button className="btn btn--primary" onClick={onAddSoundboardFiles} disabled={customDisabled}>
          Add Sound
        </button>
      </SettingsRow>

      {soundboardAddError && <p className="field-error">{soundboardAddError}</p>}

      {soundboardActionError && <p className="field-error">{soundboardActionError}</p>}

      {soundboardOwnClips.length > 0 && (
        <SoundboardManager
          clips={soundboardOwnClips}
          categories={soundboardCategories}
          stats={soundboardStats}
          disabled={customDisabled}
          soundboardVolume={soundboardVolume}
          onRemoveClip={onRemoveSoundboardClip}
          onCreateCategory={onCreateSoundboardCategory}
          onRenameCategory={onRenameSoundboardCategory}
          onDeleteCategory={onDeleteSoundboardCategory}
          onSetCategoryShared={onSetSoundboardCategoryShared}
          onMoveClip={onMoveSoundboardClip}
          onRenameClip={onRenameSoundboardClip}
        />
      )}
    </>
  );
}
