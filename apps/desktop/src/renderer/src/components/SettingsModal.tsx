import { useState, useEffect, useRef } from 'react';
import { User, Mic, Volume2, Sliders, X, Video, Monitor, MessageSquare, Search, Keyboard } from 'lucide-react';
import { defaultSettings } from '@chickadee/shared';
import type { SettingsModalProps, TabId } from './settings/types';
import { SUBSECTIONS, TAB_LABELS, getSearchResults } from './settings/searchIndex';
import { useSharedMicMeter } from './settings/MicMeter';
import { ProfileTab } from './settings/ProfileTab';
import { AudioTab } from './settings/AudioTab';
import { VideoTab } from './settings/VideoTab';
import { SfxTab } from './settings/SfxTab';
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
  const version = window.chickadee?.appVersion || '0.3.1';

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
    props.onChangeMicVolume(defaults.micVolume);
    props.onChangeCameraFeatureEnabled(defaults.cameraFeatureEnabled);
    props.onChangeCameraResolution(defaults.cameraResolution);
    props.onChangeDefaultVideoAction(defaults.defaultVideoAction ?? 'screen');
    props.onChangeCameraFramerate(defaults.cameraFramerate);
    props.onChangeScreenResolution(defaults.screenResolution);
    props.onChangeScreenFramerate(defaults.screenFramerate);
    props.onChangeVideoQuality(defaults.videoQuality);
    props.onChangeUiScale(defaults.uiScale);
    props.onChangeChatFontScale(defaults.chatFontScale);
    props.onChangeChatPosition(defaults.chatPosition);
    props.onChangeChatWidthScale(defaults.chatWidthScale);
    props.onChangeSidebarWidthScale(defaults.sidebarWidthScale);
    props.onChangeChatTtsEnabled(defaults.chatTtsEnabled);
    props.onChangeChatTtsSpeakName(defaults.chatTtsSpeakName);
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
          <div className="settings-sidebar__search-wrap">
            <Search size={12} className="settings-sidebar__search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="settings-sidebar__search-input"
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
                className="settings-sidebar__search-clear"
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
          <div className="settings-sidebar__title">User Settings</div>
          <button
            className={`settings-sidebar__item${activeTab === 'profile' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <User size={15} />
            <span>My Profile</span>
          </button>
          {activeTab === 'profile' && (
            <div className="settings-sidebar__sub-items">
              {SUBSECTIONS.profile!.map((s) => (
                <button key={s.id} className="settings-sidebar__sub-item" onClick={() => scrollToSection(s.id)}>{s.label}</button>
              ))}
            </div>
          )}

          <div className="settings-sidebar__title">App Settings</div>
          <button
            className={`settings-sidebar__item${activeTab === 'audio' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('audio')}
          >
            <Mic size={15} />
            <span>Voice & Audio</span>
          </button>
          {activeTab === 'audio' && (
            <div className="settings-sidebar__sub-items">
              {SUBSECTIONS.audio!.map((s) => (
                <button key={s.id} className="settings-sidebar__sub-item" onClick={() => scrollToSection(s.id)}>{s.label}</button>
              ))}
            </div>
          )}
          <button
            className={`settings-sidebar__item${activeTab === 'video' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('video')}
          >
            <Video size={15} />
            <span>Video & Screen Share</span>
          </button>
          {activeTab === 'video' && (
            <div className="settings-sidebar__sub-items">
              {SUBSECTIONS.video!.map((s) => (
                <button key={s.id} className="settings-sidebar__sub-item" onClick={() => scrollToSection(s.id)}>{s.label}</button>
              ))}
            </div>
          )}
          <button
            className={`settings-sidebar__item${activeTab === 'sfx' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('sfx')}
          >
            <Volume2 size={15} />
            <span>Sound Effects</span>
          </button>
          <button
            className={`settings-sidebar__item${activeTab === 'chat' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare size={15} />
            <span>Chat Settings</span>
          </button>
          {activeTab === 'chat' && (
            <div className="settings-sidebar__sub-items">
              {SUBSECTIONS.chat!.map((s) => (
                <button key={s.id} className="settings-sidebar__sub-item" onClick={() => scrollToSection(s.id)}>{s.label}</button>
              ))}
            </div>
          )}
          <button
            className={`settings-sidebar__item${activeTab === 'keybindings' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('keybindings')}
          >
            <Keyboard size={15} />
            <span>Keybindings</span>
          </button>
          {activeTab === 'keybindings' && (
            <div className="settings-sidebar__sub-items">
              {SUBSECTIONS.keybindings!.map((s) => (
                <button key={s.id} className="settings-sidebar__sub-item" onClick={() => scrollToSection(s.id)}>{s.label}</button>
              ))}
            </div>
          )}
          <button
            className={`settings-sidebar__item${activeTab === 'ui' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('ui')}
          >
            <Monitor size={15} />
            <span>User Interface</span>
          </button>
          <button
            className={`settings-sidebar__item${activeTab === 'app' ? ' settings-sidebar__item--active' : ''}`}
            onClick={() => setActiveTab('app')}
          >
            <Sliders size={15} />
            <span>App Settings</span>
          </button>

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
            <h2 className="settings-content__title">
              {activeTab === 'profile' && 'My Profile'}
              {activeTab === 'audio' && 'Voice & Audio'}
              {activeTab === 'video' && 'Video & Screen Share'}
              {activeTab === 'sfx' && 'Sound Effects'}
              {activeTab === 'chat' && 'Chat Settings'}
              {activeTab === 'keybindings' && 'Keybindings'}
              {activeTab === 'ui' && 'User Interface'}
              {activeTab === 'app' && 'App Settings'}
            </h2>
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
