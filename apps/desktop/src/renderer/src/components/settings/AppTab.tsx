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
  | 'autoAcceptEnabled' | 'onChangeAutoAcceptEnabled'
  | 'autoAcceptUsers' | 'onRemoveTrustedUser'
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
  autoAcceptEnabled,
  onChangeAutoAcceptEnabled,
  autoAcceptUsers,
  onRemoveTrustedUser,
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

      <ToggleRow
        label="Auto-accept files from trusted users"
        hint="Transfers from trusted users skip the prompt and save straight to your Downloads folder."
        value={autoAcceptEnabled}
        onChange={onChangeAutoAcceptEnabled}
      />

      <SettingsRow
        label="Trusted users"
        hint={
          autoAcceptUsers.length > 0
            ? 'Files from these users are accepted automatically.'
            : 'Tick "Always accept" on an incoming-file prompt to trust someone.'
        }
      >
        {autoAcceptUsers.length > 0 ? (
          <div className="mod-banlist">
            {autoAcceptUsers.map((u) => (
              <div key={u.userId} className="mod-row">
                <span className="mod-row__label" title={u.userId}>
                  {u.displayName || u.userId}
                </span>
                <button className="seg-btn" onClick={() => onRemoveTrustedUser(u.userId)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </SettingsRow>

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
