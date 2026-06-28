import { Toggle } from './Toggle';
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
      <div className="settings-row">
        <div className="settings-row__label">
          <span>Launch on startup</span>
          <span className="hint">Start app when Windows boots.</span>
        </div>
        <Toggle on={launchOnStartup} onClick={() => onChangeLaunchOnStartup(!launchOnStartup)} />
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>When closing the window</span>
          <span className="hint">Minimize to tray keeps voice connected.</span>
        </div>
        <div className="seg-group">
          <button
            className={`seg-btn${closeBehavior === 'quit' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeCloseBehavior('quit')}
          >Quit app</button>
          <button
            className={`seg-btn${closeBehavior === 'tray' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeCloseBehavior('tray')}
          >Minimize to tray</button>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Always on top</span>
          <span className="hint">Pin window above other apps.</span>
        </div>
        <Toggle on={alwaysOnTop} onClick={() => onChangeAlwaysOnTop(!alwaysOnTop)} />
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Taskbar unread badge</span>
          <span className="hint">Show unread count on taskbar icon.</span>
        </div>
        <Toggle on={badgeNotificationsEnabled} onClick={() => onChangeBadgeNotificationsEnabled(!badgeNotificationsEnabled)} />
      </div>

      <hr className="settings-divider" />

      <div className="settings-row" style={{ marginTop: 'var(--s-2)' }}>
        <div className="settings-row__label">
          <span style={{ color: 'var(--red)', fontWeight: 'var(--fw-2)' }}>Reset Application Settings</span>
          <span className="hint">Restore settings to defaults. Profiles and Spaces are preserved.</span>
        </div>
        <button
          className="btn btn--danger"
          onClick={onResetSettings}
        >
          Reset Settings
        </button>
      </div>
    </>
  );
}
