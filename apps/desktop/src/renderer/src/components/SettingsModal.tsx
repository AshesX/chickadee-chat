import { Fragment, useState, useEffect, useRef } from 'react';
import { User, Mic, Volume2, Sliders, X, Video, Monitor, MessageSquare, Search, Keyboard, Music2 } from 'lucide-react';
import { defaultSettings } from '@chickadee/shared';
import type { SettingsModalProps, TabId } from './settings/types';
import { SUBSECTIONS, TAB_LABELS, getSearchResults } from './settings/searchIndex';

// Sidebar nav structure: two titled groups of tabs. Labels come from TAB_LABELS
// (also used by the search breadcrumbs) so the two can't drift apart.
const NAV_SECTIONS: { title: string; tabs: { id: TabId; icon: typeof User }[] }[] = [
  { title: 'User Settings', tabs: [{ id: 'profile', icon: User }] },
  {
    title: 'App Settings',
    tabs: [
      { id: 'audio', icon: Mic },
      { id: 'video', icon: Video },
      { id: 'sfx', icon: Volume2 },
      { id: 'soundboard', icon: Music2 },
      { id: 'chat', icon: MessageSquare },
      { id: 'keybindings', icon: Keyboard },
      { id: 'ui', icon: Monitor },
      { id: 'app', icon: Sliders },
    ],
  },
];
import { useSharedMicMeter } from './settings/MicMeter';
import { ProfileTab } from './settings/ProfileTab';
import { AudioTab } from './settings/AudioTab';
import { VideoTab } from './settings/VideoTab';
import { SfxTab } from './settings/SfxTab';
import { SoundboardTab } from './settings/SoundboardTab';
import { ChatTab } from './settings/ChatTab';
import { UiTab } from './settings/UiTab';
import { KeybindingsTab } from './settings/KeybindingsTab';
import { AppTab } from './settings/AppTab';

export type { SettingsModalProps } from './settings/types';

export function SettingsModal(props: SettingsModalProps): React.JSX.Element {
  const { displayName, initialTab, onClose, onChangeName, analyserNode } = props;

  const [name, setName] = useState(displayName);
  const [activeTab, setActiveTab] = useState<TabId>((initialTab as TabId) ?? 'profile');
  const [versionCopied, setVersionCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const version = window.chickadee?.appVersion || '0.4.0';

  function scrollToSection(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleSearchResultClick(entry: { tab: TabId; sectionId?: string }): void {
    setActiveTab(entry.tab);
    setSearchQuery('');
    setHighlightedIndex(-1);
    if (entry.sectionId) {
      setTimeout(() => scrollToSection(entry.sectionId!), 0);
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    const results = getSearchResults(searchQuery);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && results[highlightedIndex]) {
        handleSearchResultClick(results[highlightedIndex]);
      }
    } else if (e.key === 'Escape' && searchQuery) {
      e.stopPropagation();
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  }

  function copyVersion(): void {
    if (window.chickadee?.writeClipboard) {
      void window.chickadee.writeClipboard(version);
    } else {
      void navigator.clipboard.writeText(version);
    }
    setVersionCopied(true);
    setTimeout(() => setVersionCopied(false), 1500);
  }

  // One shared analyser reader feeds every mic-level bar (see useSharedMicMeter).
  const micBars = useRef<Set<HTMLDivElement>>(new Set());
  useSharedMicMeter(activeTab === 'audio' ? analyserNode : null, micBars);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function commitName(): void {
    const trimmed = name.trim();
    if (trimmed) onChangeName(trimmed);
  }

  function resetAppSettings(): void {
    const defaults = defaultSettings();
    props.onChangeNoiseSuppression(defaults.noiseSuppression);
    props.onChangeEchoCancellation(defaults.echoCancellation);
    props.onChangeAutoGainControl(defaults.autoGainControl);
    props.onChangeNormalizeVoices(defaults.normalizeVoices);
    props.onChangeInputDevice(defaults.inputDeviceId);
    props.onChangeOutputDevice(defaults.outputDeviceId);
    props.onChangeInputMode(defaults.inputMode);
    props.onChangeVadThreshold(defaults.vadThreshold);
    props.onChangeVadReleaseMs(defaults.vadReleaseMs);
    props.onChangeTheme(defaults.theme);
    props.onChangeHideSpaceBanner(defaults.hideSpaceBanner);
    props.onChangeLaunchOnStartup(defaults.launchOnStartup);
    props.onChangeCloseBehavior(defaults.closeBehavior);
    props.onChangeAlwaysOnTop(defaults.alwaysOnTop);
    props.onChangePushToTalkKey(defaults.pushToTalkKey);
    props.onChangePttMode(defaults.pttMode);
    props.onChangeMuteKey(defaults.muteKey);
    props.onChangeMuteMode(defaults.muteMode);
    props.onChangeSfxEnabled(defaults.sfxEnabled);
    props.onChangeSfxVolume(defaults.sfxVolume);
    props.onChangeSfxJoinLeaveEnabled(defaults.sfxJoinLeaveEnabled);
    props.onChangeSfxMuteEnabled(defaults.sfxMuteEnabled);
    props.onChangeSfxMuteOtherEnabled(defaults.sfxMuteOtherEnabled);
    props.onChangeSfxTransmitEnabled(defaults.sfxTransmitEnabled);
    props.onChangeSfxChatEnabled(defaults.sfxChatEnabled);
    props.onChangeSfxDeafenEnabled(defaults.sfxDeafenEnabled);
    props.onChangeBadgeNotificationsEnabled(defaults.badgeNotificationsEnabled);
    props.onChangeSoundboardEnabled(defaults.soundboardEnabled);
    props.onChangeSoundboardVolume(defaults.soundboardVolume);
    props.onChangeMicVolume(defaults.micVolume);

    props.onChangeCameraResolution(defaults.cameraResolution);
    props.onChangeCameraFramerate(defaults.cameraFramerate);
    props.onChangeScreenResolution(defaults.screenResolution);
    props.onChangeScreenFramerate(defaults.screenFramerate);
    props.onChangeVideoQuality(defaults.videoQuality);
    props.onChangeUploadBudgetMbps(defaults.uploadBudgetMbps);
    props.onChangeAudioQuality(defaults.audioQuality);
    props.onChangeUiScale(defaults.uiScale);
    props.onChangeChatFontScale(defaults.chatFontScale);
    props.onChangeChatPosition(defaults.chatPosition);
    props.onChangeChatWidthScale(defaults.chatWidthScale);
    props.onChangeSidebarWidthScale(defaults.sidebarWidthScale);
    props.onChangeChatTtsEnabled(defaults.chatTtsEnabled);
    props.onChangeChatTtsSpeakName(defaults.chatTtsSpeakName);
    props.onChangeChatTtsSpeakOwnMessages(defaults.chatTtsSpeakOwnMessages);
    props.onChangeChatTtsSpeakWhenFocused(defaults.chatTtsSpeakWhenFocused);
    props.onChangeReactionsEnabled(defaults.reactionsEnabled);
    props.onChangeVoicePreference(defaults.voicePreference);
    props.onChangeDeafenKey(defaults.deafenKey);
    props.onChangeDeafenMode(defaults.deafenMode);
    props.onChangeCameraKey(defaults.cameraKey);
    props.onChangeScreenShareKey(defaults.screenShareKey);
    props.onChangeChatPanelKey(defaults.chatPanelKey);
    props.onChangeTtsToggleKey(defaults.ttsToggleKey);
    props.onChangeTtsStopKey(defaults.ttsStopKey);
  }

  const searchResults = getSearchResults(searchQuery);
  const showResults = searchFocused && searchQuery.trim().length > 0;

  return (
    <div className="backdrop backdrop--scrim backdrop--modal" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>

        {/* Left Sidebar Menu */}
        <div className="settings-sidebar">
          <div className="search-field__wrap settings-sidebar__search-wrap">
            <Search size={12} className="search-field__icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="search-field__input"
              placeholder="Search settings…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setHighlightedIndex(-1); }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 120)}
              onKeyDown={handleSearchKeyDown}
              aria-label="Search settings"
            />
            {searchQuery && (
              <button
                className="search-field__clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setSearchQuery(''); setHighlightedIndex(-1); searchInputRef.current?.focus(); }}
                aria-label="Clear search"
              >
                <X size={10} />
              </button>
            )}
            {showResults && (
              <div className="settings-sidebar__search-results menu-surface">
                {searchResults.length === 0 ? (
                  <div className="settings-sidebar__search-empty">No results</div>
                ) : (
                  searchResults.map((entry, i) => (
                    <button
                      key={`${entry.tab}-${entry.label}`}
                      className={`settings-sidebar__search-result${i === highlightedIndex ? ' settings-sidebar__search-result--highlighted' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSearchResultClick(entry)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                    >
                      <span className="settings-sidebar__search-result-label">{entry.label}</span>
                      <span className="settings-sidebar__search-result-breadcrumb">
                        {TAB_LABELS[entry.tab]}
                        {entry.sectionId
                          ? ` › ${SUBSECTIONS[entry.tab]?.find((s) => s.id === entry.sectionId)?.label ?? ''}`
                          : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="settings-sidebar__nav">
          {NAV_SECTIONS.map((group) => (
            <Fragment key={group.title}>
              <div className="settings-sidebar__title">{group.title}</div>
              {group.tabs.map(({ id, icon: Icon }) => (
                <Fragment key={id}>
                  <button
                    className={`settings-sidebar__item${activeTab === id ? ' settings-sidebar__item--active' : ''}`}
                    onClick={() => setActiveTab(id)}
                  >
                    <Icon size={15} />
                    <span>{TAB_LABELS[id]}</span>
                  </button>
                  {activeTab === id && SUBSECTIONS[id] && (
                    <div className="settings-sidebar__sub-items">
                      {SUBSECTIONS[id]!.map((s) => (
                        <button key={s.id} className="settings-sidebar__sub-item" onClick={() => scrollToSection(s.id)}>{s.label}</button>
                      ))}
                    </div>
                  )}
                </Fragment>
              ))}
            </Fragment>
          ))}
          </div>

          <div className="settings-sidebar__footer">
            <button
              className="settings-sidebar__version-btn"
              onClick={copyVersion}
              title="Copy Version"
            >
              {versionCopied ? 'Copied!' : `v${version}`}
            </button>
          </div>
        </div>

        {/* Right Content Panel */}
        <div className="settings-content">
          <div className="settings-content__head">
            <h2 className="settings-content__title">{TAB_LABELS[activeTab]}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close settings">
              <X size={18} />
            </button>
          </div>

          <div className="settings-content__body">
            {activeTab === 'profile' && (
              <ProfileTab {...props} name={name} setName={setName} commitName={commitName} />
            )}
            {activeTab === 'audio' && (
              <AudioTab {...props} micBars={micBars} />
            )}
            {activeTab === 'video' && <VideoTab {...props} />}
            {activeTab === 'sfx' && <SfxTab {...props} />}
            {activeTab === 'soundboard' && <SoundboardTab {...props} />}
            {activeTab === 'chat' && <ChatTab {...props} />}
            {activeTab === 'ui' && <UiTab {...props} />}
            {activeTab === 'keybindings' && (
              <KeybindingsTab {...props} />
            )}
            {activeTab === 'app' && <AppTab {...props} onResetSettings={resetAppSettings} />}
          </div>

          <div className="settings-content__foot">
            <button className="btn btn--primary" onClick={() => { commitName(); onClose(); }}>
              Done
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
