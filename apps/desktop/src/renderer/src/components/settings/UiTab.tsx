import { SegmentedRow } from './SegmentedRow';
import { SliderRow } from './SliderRow';
import { ToggleRow } from './ToggleRow';
import type { SettingsModalProps } from './types';

type UiTabProps = Pick<
  SettingsModalProps,
  | 'theme' | 'onChangeTheme'
  | 'hideSpaceBanner' | 'onChangeHideSpaceBanner'
  | 'uiScale' | 'onChangeUiScale'
  | 'chatWidthScale' | 'onChangeChatWidthScale'
  | 'sidebarWidthScale' | 'onChangeSidebarWidthScale'
>;

export function UiTab({
  theme,
  onChangeTheme,
  hideSpaceBanner,
  onChangeHideSpaceBanner,
  uiScale,
  onChangeUiScale,
  chatWidthScale,
  onChangeChatWidthScale,
  sidebarWidthScale,
  onChangeSidebarWidthScale,
}: UiTabProps): React.JSX.Element {
  return (
    <>
      <SegmentedRow
        label="Theme"
        hint="Application color theme."
        value={theme}
        onChange={onChangeTheme}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />

      <ToggleRow
        label="Hide space banner image"
        hint="Show a compact, text-only space header instead of the banner photo."
        value={hideSpaceBanner}
        onChange={onChangeHideSpaceBanner}
      />

      <SliderRow
        label="UI Scale Slider"
        hint="Adjust overall application size."
        constrained
        slider={{
          min: 0.8,
          max: 1.5,
          step: 0.1,
          value: uiScale,
          onChange: onChangeUiScale,
          markers: [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5],
          labels: [
            { value: 0.8, text: '80%' },
            { value: 1.0, text: '100% (Default)' },
            { value: 1.2, text: '120%' },
            { value: 1.5, text: '150%' },
          ],
          snapThreshold: 0.05,
          commitOnRelease: true,
        }}
      />

      <SliderRow
        label="Chat Width Scale"
        hint="Room chat panel width (100% - 200%)."
        constrained
        slider={{
          min: 1.0,
          max: 2.0,
          step: 0.05,
          value: chatWidthScale,
          onChange: onChangeChatWidthScale,
          markers: [1.0, 1.25, 1.5, 1.75, 2.0],
          labels: [
            { value: 1.0, text: '100% (Default)' },
            { value: 1.25, text: '125%' },
            { value: 1.5, text: '150%' },
            { value: 1.75, text: '175%' },
            { value: 2.0, text: '200%' },
          ],
          snapThreshold: 0.04,
          commitOnRelease: false,
        }}
      />

      <SliderRow
        label="Sidebar Width Scale"
        hint="Sidebar width (100% - 200%)."
        constrained
        slider={{
          min: 1.0,
          max: 2.0,
          step: 0.05,
          value: sidebarWidthScale,
          onChange: onChangeSidebarWidthScale,
          markers: [1.0, 1.25, 1.5, 1.75, 2.0],
          labels: [
            { value: 1.0, text: '100% (Default)' },
            { value: 1.25, text: '125%' },
            { value: 1.5, text: '150%' },
            { value: 1.75, text: '175%' },
            { value: 2.0, text: '200%' },
          ],
          snapThreshold: 0.04,
          commitOnRelease: false,
        }}
      />
    </>
  );
}
