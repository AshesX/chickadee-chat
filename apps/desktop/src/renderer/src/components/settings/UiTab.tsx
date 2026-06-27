import { SettingsSlider } from '../SettingsSlider';
import type { SettingsModalProps } from './types';

type UiTabProps = Pick<
  SettingsModalProps,
  | 'theme' | 'onChangeTheme'
  | 'uiScale' | 'onChangeUiScale'
  | 'chatWidthScale' | 'onChangeChatWidthScale'
  | 'sidebarWidthScale' | 'onChangeSidebarWidthScale'
>;

export function UiTab({
  theme,
  onChangeTheme,
  uiScale,
  onChangeUiScale,
  chatWidthScale,
  onChangeChatWidthScale,
  sidebarWidthScale,
  onChangeSidebarWidthScale,
}: UiTabProps): React.JSX.Element {
  return (
    <>
      <div className="settings-row">
        <div className="settings-row__label">
          <span>Theme</span>
          <span className="settings-row__hint">Application color theme.</span>
        </div>
        <div className="seg-group">
          <button
            className={`seg-btn${theme === 'light' ? ' seg-btn--active' : ''}`}
            onClick={() => onChangeTheme('light')}
          >Light</button>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>UI Scale Slider</span>
          <span className="settings-row__hint">Adjust overall application size.</span>
        </div>
        <div className="mic-control-wrap" style={{ marginTop: '12px' }}>
          <SettingsSlider
            min={0.8}
            max={1.5}
            step={0.1}
            value={uiScale}
            onChange={onChangeUiScale}
            markers={[0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5]}
            labels={[
              { value: 0.8, text: '80%' },
              { value: 1.0, text: '100% (Default)' },
              { value: 1.2, text: '120%' },
              { value: 1.5, text: '150%' }
            ]}
            snapThreshold={0.05}
            commitOnRelease={true}
          />
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Chat Width Scale</span>
          <span className="settings-row__hint">Room chat panel width (100% - 200%).</span>
        </div>
        <div className="mic-control-wrap">
          <SettingsSlider
            min={1.0}
            max={2.0}
            step={0.05}
            value={chatWidthScale}
            onChange={onChangeChatWidthScale}
            markers={[1.0, 1.25, 1.5, 1.75, 2.0]}
            labels={[
              { value: 1.0, text: '100% (Default)' },
              { value: 1.25, text: '125%' },
              { value: 1.5, text: '150%' },
              { value: 1.75, text: '175%' },
              { value: 2.0, text: '200%' }
            ]}
            snapThreshold={0.04}
            commitOnRelease={false}
          />
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">
          <span>Sidebar Width Scale</span>
          <span className="settings-row__hint">Sidebar width (100% - 200%).</span>
        </div>
        <div className="mic-control-wrap">
          <SettingsSlider
            min={1.0}
            max={2.0}
            step={0.05}
            value={sidebarWidthScale}
            onChange={onChangeSidebarWidthScale}
            markers={[1.0, 1.25, 1.5, 1.75, 2.0]}
            labels={[
              { value: 1.0, text: '100% (Default)' },
              { value: 1.25, text: '125%' },
              { value: 1.5, text: '150%' },
              { value: 1.75, text: '175%' },
              { value: 2.0, text: '200%' }
            ]}
            snapThreshold={0.04}
            commitOnRelease={false}
          />
        </div>
      </div>
    </>
  );
}
