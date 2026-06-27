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
          <span className="settings-row__hint">Start app when Windows boots.</span>
        </div>
        <Toggle on={launchOnStartup} onClick={() => onChangeLaunchOnStartup(!launchOnStartup)} />
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>When closing the window</span>
          <span className="settings-row__hint">Minimize to tray keeps voice connected.</span>
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
          <span className="settings-row__hint">Pin window above other apps.</span>
        </div>
        <Toggle on={alwaysOnTop} onClick={() => onChangeAlwaysOnTop(!alwaysOnTop)} />
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Taskbar unread badge</span>
          <span className="settings-row__hint">Show unread count on taskbar icon.</span>
        </div>
        <Toggle on={badgeNotificationsEnabled} onClick={() => onChangeBadgeNotificationsEnabled(!badgeNotificationsEnabled)} />
      </div>

      <hr className="settings-divider" />

      <div className="settings-row" style={{ marginTop: '10px' }}>
        <div className="settings-row__label">
          <span style={{ color: 'var(--red)', fontWeight: 600 }}>Reset Application Settings</span>
          <span className="settings-row__hint">Restore settings to defaults. Profiles and Spaces are preserved.</span>
        </div>
        <button
          className="danger-action-btn"
          onClick={onResetSettings}
        >
          Reset Settings
        </button>
      </div>
    </>
  );
}
