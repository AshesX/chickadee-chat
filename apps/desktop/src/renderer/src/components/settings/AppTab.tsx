import { SettingsRow } from './SettingsRow';
import { ToggleRow } from './ToggleRow';
import { SegmentedRow } from './SegmentedRow';
import type { SettingsModalProps } from './types';

type AppTabProps = Pick<
  SettingsModalProps,
  | 'launchOnStartup' | 'onChangeLaunchOnStartup'
  | 'closeBehavior' | 'onChangeCloseBehavior'
  | 'alwaysOnTop' | 'onChangeAlwaysOnTop'
  | 'badgeNotificationsEnabled' | 'onChangeBadgeNotificationsEnabled'
> & {
  onResetSettings: () => void;
};

export function AppTab({
  launchOnStartup,
  onChangeLaunchOnStartup,
  closeBehavior,
  onChangeCloseBehavior,
  alwaysOnTop,
  onChangeAlwaysOnTop,
  badgeNotificationsEnabled,
  onChangeBadgeNotificationsEnabled,
  onResetSettings,
}: AppTabProps): React.JSX.Element {
  return (
    <>
      <ToggleRow
        label="Launch on startup"
        hint="Start app when Windows boots."
        value={launchOnStartup}
        onChange={onChangeLaunchOnStartup}
      />

      <SegmentedRow
        label="When closing the window"
        hint="Minimize to tray keeps voice connected."
        value={closeBehavior}
        onChange={onChangeCloseBehavior}
        options={[
          { value: 'quit', label: 'Quit app' },
          { value: 'tray', label: 'Minimize to tray' },
        ]}
      />

      <ToggleRow
        label="Always on top"
        hint="Pin window above other apps."
        value={alwaysOnTop}
        onChange={onChangeAlwaysOnTop}
      />

      <ToggleRow
        label="Taskbar unread badge"
        hint="Show unread count on taskbar icon."
        value={badgeNotificationsEnabled}
        onChange={onChangeBadgeNotificationsEnabled}
      />

      <hr className="settings-divider" />

      <SettingsRow
        label={<span style={{ color: 'var(--red)', fontWeight: 'var(--fw-2)' }}>Reset Application Settings</span>}
        hint="Restore settings to defaults. Profiles and Spaces are preserved."
      >
        <button className="btn btn--danger" onClick={onResetSettings}>
          Reset Settings
        </button>
      </SettingsRow>
    </>
  );
}
