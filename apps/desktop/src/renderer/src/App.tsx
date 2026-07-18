import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { DEFAULT_ICE_SERVERS, capacityForType, type Room, type ThemeName } from '@chickadee/shared';
import { useSignaling } from './hooks/useSignaling';
import { usePeerMesh } from './hooks/usePeerMesh';
import { useRoomChat } from './hooks/useRoomChat';
import { useSpacePresence } from './hooks/useSpacePresence';
import { useSpaces, type AddSpaceResult } from './hooks/useSpaces';
import { useSpaceJoin } from './hooks/useSpaceJoin';
import { useAutoClearError } from './hooks/useAutoClearError';
import { useControlBarMenus } from './hooks/useControlBarMenus';
import { usePersistedState } from './hooks/usePersistedState';
import { useKeybindSync } from './hooks/useKeybindSync';
import { useVoiceActivation } from './hooks/useVoiceActivation';
import { useMediaDevices } from './hooks/useMediaDevices';
import { useSfxEvents } from './hooks/useSfxEvents';
import { useSfxSettings } from './hooks/useSfxSettings';
import { useTraySync } from './hooks/useTraySync';
import { usePeerVolumes, usePeerScreenVolumes } from './hooks/usePeerVolumes';
import { useStageSpotlight } from './hooks/useStageSpotlight';
import { useFileTransfers } from './hooks/useFileTransfers';
import { useSoundboardLibrary } from './hooks/useSoundboardLibrary';
import { useSoundboardPlayback } from './hooks/useSoundboardPlayback';
import { useSoundboardSync } from './hooks/useSoundboardSync';
import { useWindowFocus } from './hooks/useWindowFocus';
import { selectStage } from './lib/stageSelection';
import { SELF_COLOR, useUserColors } from './lib/userColors';
import { setOutputSink } from './lib/audioContext';
import { store } from './lib/settings';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { ControlBar } from './components/ControlBar';
import { ParticipantTile } from './components/ParticipantTile';
import { ScreenView } from './components/ScreenView';
import { ChatPanel, type ChatMessage } from './components/ChatPanel';
import { TransferTray } from './components/TransferTray';
import { formatBytes } from './webrtc/fileTransferPolicy';
import { ReactionPopover } from './components/ReactionPopover';
import { SoundboardPopover } from './components/SoundboardPopover';
import { UserContextMenu, type UserMenuTarget } from './components/UserContextMenu';
import { AudioDeviceMenu } from './components/AudioDeviceMenu';
import { InputModeMenu } from './components/InputModeMenu';
import { VideoMenu } from './components/VideoMenu';
import { Logo } from './components/Logo';
import { generateBadgeOverlay } from './lib/trayIcon';
import { Modal } from './components/Modal';
import { playSfx } from './lib/sfx';
import { AdvancedConnectionSettings } from './components/AdvancedConnectionSettings';

// Heavy, conditionally-mounted modals are code-split so their JS isn't parsed at
// cold start — each chunk loads the first time the modal opens. Named exports are
// adapted to the default-export shape React.lazy expects. Render sites are wrapped
// in <Suspense fallback={null}> (a modal popping in a frame late is imperceptible).
const ScreenSharePicker = lazy(() =>
  import('./components/ScreenSharePicker').then((m) => ({ default: m.ScreenSharePicker })),
);
const WelcomeWizard = lazy(() =>
  import('./components/WelcomeWizard').then((m) => ({ default: m.WelcomeWizard })),
);
const RoomModal = lazy(() => import('./components/RoomModal').then((m) => ({ default: m.RoomModal })));
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })),
);
const SpaceSettingsModal = lazy(() =>
  import('./components/SpaceSettingsModal').then((m) => ({ default: m.SpaceSettingsModal })),
);
import { speakChatMessage, cancelSpeech } from './lib/tts';
import { shouldSpeakChatMessage } from './lib/ttsTriggers';
import { initVoices } from './lib/voices';

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'room';
}

export function App(): React.JSX.Element {
  const iceServers = useMemo(() => window.chickadee?.iceServers ?? DEFAULT_ICE_SERVERS, []);
  const signaling = useSignaling();
  // Media-constraint settings with side effects (mesh.*) keep explicit apply handlers below;
  // plain persisted mirrors use usePersistedState (seed from store + persist on change).
  const [noiseSuppression, setNoiseSuppression] = useState(() => store.getNoiseSuppression());
  const [echoCancellation, setEchoCancellation] = useState(() => store.getEchoCancellation());
  const [autoGainControl, setAutoGainControl] = useState(() => store.getAutoGainControl());
  const [normalizeVoices, applyNormalizeVoices] = usePersistedState(store.getNormalizeVoices, store.setNormalizeVoices);
  const [inputDeviceId, setInputDeviceId] = useState(() => store.getInputDeviceId());
  const [outputDeviceId, setOutputDeviceId] = useState(() => store.getOutputDeviceId());
  const [micVolume, applyMicVolume] = usePersistedState(store.getMicVolume, store.setMicVolume);
  const [outputVolume, applyOutputVolume] = usePersistedState(store.getOutputVolume, store.setOutputVolume);

  const [cameraResolution, applyCameraResolution] = usePersistedState(store.getCameraResolution, store.setCameraResolution);
  const [cameraFramerate, applyCameraFramerate] = usePersistedState(store.getCameraFramerate, store.setCameraFramerate);
  const [screenResolution, applyScreenResolution] = usePersistedState(store.getScreenResolution, store.setScreenResolution);
  const [screenFramerate, applyScreenFramerate] = usePersistedState(store.getScreenFramerate, store.setScreenFramerate);
  const [videoQuality, applyVideoQuality] = usePersistedState(store.getVideoQuality, store.setVideoQuality);
  const [audioQuality, applyAudioQuality] = usePersistedState(store.getAudioQuality, store.setAudioQuality);
  const [uploadBudgetMbps, applyUploadBudgetMbps] = usePersistedState(store.getUploadBudgetMbps, store.setUploadBudgetMbps);
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(() => store.getAvatarDataUrl());
  const [localVoicePreference, setLocalVoicePreference] = useState(() => store.getVoicePreference());
  const [localAccentColor, setLocalAccentColor] = useState(() => store.getAccentColor());
  const userId = useMemo(() => store.getUserId(), []);
  // Which peers are watching OUR stage stream (their subscriptions include us) —
  // the count drives the adaptive upload budget for the high-quality stage
  // encoding; the names feed the "who's watching" display on the stage itself.
  const selfWatchers = useMemo(
    () => signaling.peers.filter((p) => p.videoSubscriptions?.includes(userId)),
    [signaling.peers, userId],
  );
  const selfWatcherCount = selfWatchers.length;
  // Which of our streams (if any) currently holds the room stage, per the
  // server-authoritative spotlight — 'stage' encoding for that kind, thumbnails else.
  const myStageKind: 'screen' | 'camera' | null =
    signaling.spotlightHolderId != null && signaling.spotlightHolderId === signaling.selfId
      ? signaling.spotlightKind
      : null;
  // The stage upload budget in bits/sec (0 = unlimited), from the user's Mbps setting.
  const uploadBudgetBps = uploadBudgetMbps > 0 ? uploadBudgetMbps * 1_000_000 : 0;
  const mesh = usePeerMesh(signaling, iceServers, noiseSuppression, micVolume, cameraResolution, cameraFramerate, screenResolution, screenFramerate, videoQuality, audioQuality, echoCancellation, autoGainControl, inputDeviceId, localAvatarUrl, localVoicePreference, localAccentColor, userId, myStageKind, selfWatcherCount, uploadBudgetBps);
  const colors = useUserColors(signaling.peers.map((p) => p.id));

  const [displayName, setDisplayName] = useState(() => store.getName());
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const leaveRoom = useCallback(() => {
    signaling.joinRoom(null);
    setCurrentRoomId(null);
  }, [signaling.joinRoom]);
  const {
    spaces,
    currentSpaceId,
    rooms,
    switchSpace,
    addSpace,
    deleteSpace,
    initFirstSpace,
    updateRooms,
    updateSpaceSettings,
    updateSpaceBanner,
    updateSpaceOwnerId,
    updateSpaceModeration,
    pendingOwnerClaimSpaceId,
    clearPendingOwnerClaim,
  } = useSpaces(leaveRoom, signaling.verifySpace, userId);
  const spaceJoin = useSpaceJoin(addSpace);

  const [chatOpen, setChatOpen] = useState(() => store.getChatVisible());
  const [compactMode, setCompactMode] = useState(() => store.getCompactMode());
  const [roomsSectionCollapsed, setRoomsSectionCollapsed] = useState(() => store.getRoomsSectionCollapsed());
  // Opt-in video: stable userIds whose video/screen we've joined ("Watch").
  // Session-only (cleared on room change); broadcast to the room via sink-state.
  const [videoSubscriptions, setVideoSubscriptions] = useState<string[]>([]);
  const joinVideo = useCallback(
    (uid: string) => setVideoSubscriptions((prev) => (prev.includes(uid) ? prev : [...prev, uid])),
    [],
  );
  const leaveVideo = useCallback(
    (uid: string) => setVideoSubscriptions((prev) => prev.filter((u) => u !== uid)),
    [],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Room | null>(null);
  const [spaceSettingsTarget, setSpaceSettingsTarget] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inputMode, applyInputMode] = usePersistedState<'voice' | 'ptt'>(store.getInputMode, store.setInputMode);
  const [vadThreshold, applyVadThreshold] = usePersistedState(store.getVadThreshold, store.setVadThreshold);
  const [vadReleaseMs, applyVadReleaseMs] = usePersistedState(store.getVadReleaseMs, store.setVadReleaseMs);
  // Persistent mute intent — a single master switch that survives input-mode
  // switches (open/voice/PTT). The mic gate (mesh.micEnabled) is forced off while
  // muted, regardless of mode; modes only manage the gate when unmuted.
  const [micMuted, setMicMuted] = useState(false);
  const [pushToTalkKey, applyPushToTalkKey] = usePersistedState(store.getPushToTalkKey, store.setPushToTalkKey);
  const [pttMode, applyPttMode] = usePersistedState<'hold' | 'toggle'>(store.getPttMode, store.setPttMode);
  const [muteKey, applyMuteKey] = usePersistedState(store.getMuteKey, store.setMuteKey);
  const [muteMode, applyMuteMode] = usePersistedState<'hold' | 'toggle'>(store.getMuteMode, store.setMuteMode);
  const [deafenKey, applyDeafenKey] = usePersistedState(store.getDeafenKey, store.setDeafenKey);
  const [deafenMode, applyDeafenMode] = usePersistedState<'hold' | 'toggle'>(store.getDeafenMode, store.setDeafenMode);
  const [cameraKey, applyCameraKey] = usePersistedState(store.getCameraKey, store.setCameraKey);
  const [screenShareKey, applyScreenShareKey] = usePersistedState(store.getScreenShareKey, store.setScreenShareKey);
  const [chatPanelKey, applyChatPanelKey] = usePersistedState(store.getChatPanelKey, store.setChatPanelKey);
  const [ttsToggleKey, applyTtsToggleKey] = usePersistedState(store.getTtsToggleKey, store.setTtsToggleKey);
  const [ttsStopKey, applyTtsStopKey] = usePersistedState(store.getTtsStopKey, store.setTtsStopKey);
  // SFX toggles/volume + the "mute other" cue (also threaded into usePeerVolumes).
  const {
    sfxEnabled,
    applySfxEnabled,
    sfxVolume,
    applySfxVolume,
    sfxJoinLeaveEnabled,
    applySfxJoinLeaveEnabled,
    sfxMuteEnabled,
    applySfxMuteEnabled,
    sfxMuteOtherEnabled,
    applySfxMuteOtherEnabled,
    sfxTransmitEnabled,
    applySfxTransmitEnabled,
    sfxChatEnabled,
    applySfxChatEnabled,
    sfxDeafenEnabled,
    applySfxDeafenEnabled,
    playMuteOtherCue,
  } = useSfxSettings();

  // Per-peer volume + click-to-silence (silence = volume 0, persisted by userId).
  const { volumes, handleVolumeChange, togglePeerMute, togglePeerMuteByUserId, mutedUserIds } =
    usePeerVolumes(signaling.peers, playMuteOtherCue);

  // Per-peer screen-share audio volume + click-to-silence — fully independent
  // of voice volume above (own persisted store, own live state).
  const {
    volumes: screenVolumes,
    handleVolumeChange: handleScreenVolumeChange,
    togglePeerMute: toggleScreenMute,
  } = usePeerScreenVolumes(signaling.peers);

  // Output device is a single global property of the shared audio context (all
  // playback funnels through it), so set the sink once here — not per-peer tile.
  useEffect(() => {
    setOutputSink(outputDeviceId ?? '');
  }, [outputDeviceId]);

  // Control-bar chevron popovers + reaction popover (open flags, anchors, timeouts).
  const menus = useControlBarMenus();

  const [settingsInitialTab, setSettingsInitialTab] = useState('profile');
  const [deafened, setDeafened] = useState(false);
  const lastJoinTimeRef = useRef<number>(0);

  const [badgeNotificationsEnabled, applyBadgeNotificationsEnabled] = usePersistedState(store.getBadgeNotificationsEnabled, store.setBadgeNotificationsEnabled);
  const [unreadCount, setUnreadCount] = useState(0);

  // File-transfer trust list. The store cache is what useFileTransfers reads at
  // offer time; this state mirror keeps the Settings list + modal checkbox live.
  const [autoAcceptEnabled, applyAutoAcceptEnabled] = usePersistedState(store.getAutoAcceptEnabled, store.setAutoAcceptEnabled);
  const [autoAcceptUsers, setAutoAcceptUsers] = useState(() => store.getAutoAcceptUsers());
  const handleTrustUser = useCallback((userId: string, displayName: string) => {
    store.addAutoAcceptUser(userId, displayName);
    setAutoAcceptUsers(store.getAutoAcceptUsers());
  }, []);
  const handleRemoveTrustedUser = useCallback((userId: string) => {
    store.removeAutoAcceptUser(userId);
    setAutoAcceptUsers(store.getAutoAcceptUsers());
  }, []);

  // Focus/visibility (gates animations + video decode). On focus gain: clear the
  // unread badge and stop any queued TTS backlog.
  const handleWindowFocus = useCallback(() => {
    setUnreadCount(0);
    cancelSpeech();
  }, []);
  const { windowFocused, windowVisible } = useWindowFocus(handleWindowFocus);
  const [selfStatus, setSelfStatus] = useState<'online' | 'idle' | 'dnd'>(() => store.getStatus());
  const [uiScale, applyUiScale] = usePersistedState(store.getUiScale, store.setUiScale);
  const [chatFontScale, applyChatFontScale] = usePersistedState(store.getChatFontScale, store.setChatFontScale);
  const [chatPosition, applyChatPosition] = usePersistedState<'left' | 'right'>(store.getChatPosition, store.setChatPosition);
  const [chatWidthScale, setChatWidthScale] = useState(() => store.getChatWidthScale());
  const [sidebarWidthScale, setSidebarWidthScale] = useState(() => store.getSidebarWidthScale());
  const [chatTtsEnabled, setChatTtsEnabled] = useState(() => store.getChatTtsEnabled());
  const [chatTtsSpeakName, applyChatTtsSpeakName] = usePersistedState(store.getChatTtsSpeakName, store.setChatTtsSpeakName);
  const [chatTtsSpeakOwnMessages, applyChatTtsSpeakOwnMessages] = usePersistedState(store.getChatTtsSpeakOwnMessages, store.setChatTtsSpeakOwnMessages);
  const [chatTtsSpeakWhenFocused, applyChatTtsSpeakWhenFocused] = usePersistedState(store.getChatTtsSpeakWhenFocused, store.setChatTtsSpeakWhenFocused);
  const [reactionsEnabled, applyReactionsEnabled] = usePersistedState(store.getReactionsEnabled, store.setReactionsEnabled);
  const [soundboardEnabled, applySoundboardEnabled] = usePersistedState(store.getSoundboardEnabled, store.setSoundboardEnabled);
  const [soundboardVolume, applySoundboardVolume] = usePersistedState(store.getSoundboardVolume, store.setSoundboardVolume);
  const [soundboardAutoSyncEnabled, applySoundboardAutoSyncEnabled] = usePersistedState(
    store.getSoundboardAutoSyncEnabled,
    store.setSoundboardAutoSyncEnabled,
  );
  const [theme, applyTheme] = usePersistedState<ThemeName>(store.getTheme, store.setTheme);
  const [hideSpaceBanner, applyHideSpaceBanner] = usePersistedState(store.getHideSpaceBanner, store.setHideSpaceBanner);
  const [launchOnStartup, setLaunchOnStartup] = useState(() => store.getLaunchOnStartup());
  const [closeBehavior, applyCloseBehavior] = usePersistedState<'quit' | 'tray'>(store.getCloseBehavior, store.setCloseBehavior);
  const [alwaysOnTop, setAlwaysOnTop] = useState(() => store.getAlwaysOnTop());
  const [activeVideoMode, setActiveVideoMode] = usePersistedState<'camera' | 'screen'>(store.getDefaultVideoAction, store.setDefaultVideoAction);

  // Apply initial UI scale and whenever it changes
  useEffect(() => {
    window.chickadee?.setZoomFactor?.(uiScale);
  }, [uiScale]);

  // Apply theme by toggling the data-theme attribute on <html>.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Apply always-on-top on mount and whenever it changes.
  useEffect(() => {
    void window.chickadee?.setAlwaysOnTop?.(alwaysOnTop);
  }, [alwaysOnTop]);

  // Read flags from the store (not React state) so these empty-deps callbacks stay stable.
  const handleNewMessage = useCallback((msg: ChatMessage) => {
    const focused = document.hasFocus();
    if (!focused) setUnreadCount((c) => c + 1);
    if (
      shouldSpeakChatMessage({
        chatTtsEnabled: store.getChatTtsEnabled(),
        isReaction: !!msg.isReaction,
        isSelf: false,
        windowFocused: focused,
        speakOwnMessages: store.getChatTtsSpeakOwnMessages(),
        speakWhenFocused: store.getChatTtsSpeakWhenFocused(),
      })
    ) {
      speakChatMessage(msg.senderName, msg.text, msg.voicePreference, store.getChatTtsSpeakName());
    }
  }, []);

  const handleSelfMessage = useCallback((msg: ChatMessage) => {
    if (
      shouldSpeakChatMessage({
        chatTtsEnabled: store.getChatTtsEnabled(),
        isReaction: false,
        isSelf: true,
        windowFocused: document.hasFocus(),
        speakOwnMessages: store.getChatTtsSpeakOwnMessages(),
        speakWhenFocused: store.getChatTtsSpeakWhenFocused(),
      })
    ) {
      // Own voice preference (not msg.voicePreference, which is only populated for peers).
      speakChatMessage(msg.senderName, msg.text, store.getVoicePreference(), store.getChatTtsSpeakName());
    }
  }, []);

  const chat = useRoomChat({
    signaling,
    displayName,
    colors,
    roomId: currentRoomId,
    onNewMessage: handleNewMessage,
    onSelfMessage: handleSelfMessage,
  });
  // Both modes (PTT / voice activation) gate the mic, so a live mic means we're
  // transmitting — which is also exactly the local "speaking" signal driving the
  // self ripple AND the broadcast (so every client renders an identical ripple).
  const transmitting = mesh.micEnabled;
  // What the mic button reflects: the persistent mute intent, independent of mode
  // and of the transient transmit gate (so it doesn't flicker with VAD/PTT).
  const micButtonOn = !micMuted;
  const selfSpeaking = transmitting;
  // Stable userIds of peers currently speaking — drives the compact sidebar's
  // per-avatar speaking outline (self handled separately via selfSpeaking).
  const speakingUserIds = useMemo(
    () => new Set(signaling.peers.filter((p) => p.speaking).map((p) => p.userId)),
    [signaling.peers],
  );

  const onboardingNeeded = !displayName;
  const inRoom = currentRoomId !== null;
  const currentRoom = rooms.find((r) => r.id === currentRoomId) ?? null;
  const currentRoomCap = capacityForType(currentRoom?.type);
  const totalInRoom = inRoom ? signaling.peers.length + 1 : 0;
  const rawUsers = useSpacePresence(signaling, signaling.rooms);

  // The USERS list shows only OTHER users — self has its own section at the
  // bottom of the sidebar, so listing self here would be redundant.
  const users = useMemo(
    () => rawUsers
      .filter((u) => u.id !== userId)
      .map((u) => ({ ...u, avatarUrl: u.avatarUrl ?? undefined })),
    [rawUsers, userId],
  );

  const handleSaveAvatar = useCallback(
    (dataUrl: string | null) => {
      setLocalAvatarUrl(dataUrl);
      store.setAvatarDataUrl(dataUrl);
      if (signaling.status === 'connected') {
        signaling.send({ type: 'avatar-state', avatarDataUrl: dataUrl });
      }
    },
    [signaling.status, signaling.send],
  );

  const applyVoicePreference = useCallback(
    (pref: string) => {
      setLocalVoicePreference(pref);
      store.setVoicePreference(pref);
      // Tell the room how to read our chat aloud (live update; also sent in join + on reconnect).
      if (signaling.status === 'connected') {
        signaling.send({ type: 'voice-state', voicePreference: pref });
      }
    },
    [signaling.status, signaling.send],
  );

  const handleSaveAccent = useCallback(
    (color: string) => {
      setLocalAccentColor(color);
      store.setAccentColor(color);
      // Sync our accent color space-wide so everyone recolors our tile/sidebar entry.
      if (signaling.status === 'connected') {
        signaling.send({ type: 'accent-state', accentColor: color });
      }
    },
    [signaling.status, signaling.send],
  );

  // Space Owner sets/clears the banner: persist locally immediately, and live-sync
  // only while connected to that same space (the server's owner check keys off
  // the current connection, so a sync while viewing another space would be a no-op anyway).
  const handleSaveBanner = useCallback(
    (spaceId: string, bannerDataUrl: string | null) => {
      updateSpaceBanner(spaceId, bannerDataUrl);
      if (spaceId === currentSpaceId && signaling.status === 'connected') {
        signaling.send({ type: 'set-banner', bannerDataUrl });
      }
    },
    [currentSpaceId, signaling.status, signaling.send, updateSpaceBanner],
  );

  const handleClaimOwnership = useCallback(
    (spaceId: string) => {
      if (spaceId === currentSpaceId && signaling.status === 'connected') {
        signaling.send({ type: 'claim-ownership' });
      }
    },
    [currentSpaceId, signaling.status, signaling.send],
  );

  // Our effective accent color: the chosen one, else the default self gold.
  const selfColor = localAccentColor || SELF_COLOR;

  // Connection params for the active space — depend on these (not the whole
  // `spaces` array) so editing/deleting OTHER spaces doesn't tear down + reconnect
  // the active call (signaling.join always closes the socket and rebuilds the mesh).
  const activeSpace = spaces.find((s) => s.id === currentSpaceId);
  const activeSpaceSignalingUrl = activeSpace?.customSignalingUrl || '';
  const activeSpaceJoinSecret = activeSpace?.joinSecret || '';

  // --- Moderation: local authority + action senders ---
  // Owner (gold) is space-wide and persisted; moderator (silver) is the current
  // room's longest-present member, known only for the room we're in (the server
  // broadcasts moderator-state room-scoped, like the spotlight).
  const ownerUserId = activeSpace?.ownerId ?? null;
  const amOwner = !!userId && ownerUserId === userId;
  const amModerator = signaling.selfId != null && signaling.moderatorId === signaling.selfId;
  const moderatorUserId = amModerator
    ? userId
    : signaling.peers.find((p) => p.id === signaling.moderatorId)?.userId ?? null;

  // Transient moderation notice (room-kick received, locked-room pre-block).
  const [modNotice, setModNotice] = useAutoClearError(4000);
  // Right-click moderation menu target (from a USERS row or a participant tile).
  // Inert for plain members, so unauthorized right-clicks never set state (the
  // render site re-checks the full per-target authority matrix anyway).
  const [userMenu, setUserMenu] = useState<UserMenuTarget | null>(null);
  const openUserMenu = useCallback(
    (targetUserId: string, name: string, x: number, y: number) => {
      if (!amOwner && !amModerator) return;
      setUserMenu({ userId: targetUserId, name, x, y });
    },
    [amOwner, amModerator],
  );

  // Thin senders — authority is enforced server-side (canModerate); the UI only
  // hides what the local user isn't allowed to do.
  const kickUser = useCallback(
    (targetUserId: string, scope: 'room' | 'space') => signaling.send({ type: 'kick-user', userId: targetUserId, scope }),
    [signaling.send],
  );
  const kickFromRoom = useCallback((targetUserId: string) => kickUser(targetUserId, 'room'), [kickUser]);
  const kickFromSpace = useCallback((targetUserId: string) => kickUser(targetUserId, 'space'), [kickUser]);
  const banUser = useCallback(
    (targetUserId: string) => signaling.send({ type: 'ban-user', userId: targetUserId }),
    [signaling.send],
  );
  const unbanUser = useCallback(
    (targetUserId: string) => signaling.send({ type: 'unban-user', userId: targetUserId }),
    [signaling.send],
  );
  const toggleRoomLock = useCallback(
    (roomId: string, locked: boolean) => signaling.send({ type: 'set-room-lock', room: roomId, locked }),
    [signaling.send],
  );
  const toggleSpaceLock = useCallback(
    (locked: boolean) => signaling.send({ type: 'set-space-lock', locked }),
    [signaling.send],
  );
  const transferOwnership = useCallback(
    (toUserId: string) => signaling.send({ type: 'transfer-ownership', toUserId }),
    [signaling.send],
  );

  // Room governance: the owner manages every room; a standard member manages
  // only the one room they created (Room.createdBy). Legacy/default rooms have
  // no stamp → owner-managed only. Mirrors the server's evaluateRoomsUpdate.
  const canManageRoom = useCallback(
    (room: Room): boolean => amOwner || (!!room.createdBy && room.createdBy === userId),
    [amOwner, userId],
  );

  // One seed per connection: once this connection confirms us as owner, restore
  // the server's (possibly restart-emptied) ban list + space lock from our
  // persisted copy. Idempotent server-side (apply-if-absent), so a duplicate or
  // late send is a harmless no-op.
  const seededModerationRef = useRef(false);
  useEffect(() => {
    if (signaling.status !== 'connected') seededModerationRef.current = false;
  }, [signaling.status]);

  // Maintain a continuous space-level WebSocket connection to the signaling server
  useEffect(() => {
    if (currentSpaceId && displayName && userId) {
      const url = activeSpaceSignalingUrl || (window.chickadee?.signalingUrl ?? 'ws://localhost:8080');
      signaling.join(currentSpaceId, currentRoomId, displayName, userId, rooms, selfStatus, localAvatarUrl, localVoicePreference, localAccentColor, activeSpaceJoinSecret, url, activeSpace?.bannerDataUrl ?? null);
    } else {
      signaling.leave();
    }
    // We only want to re-establish the connection if the space, user, or name changes,
    // or the current space's connection params change. Room movement and status updates
    // are sent dynamically over the active socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpaceId, userId, displayName, activeSpaceSignalingUrl, activeSpaceJoinSecret]);

  // Listen for space renames + owner/banner/moderation sync from other clients (and our own welcome).
  useEffect(() => {
    // Fires the one-shot moderation seed once a message confirms us as owner
    // on this connection (welcome.ownerId or a subsequent owner-state).
    const maybeSeedModeration = (confirmedOwnerId: string | null): void => {
      if (!currentSpaceId || seededModerationRef.current || !userId || confirmedOwnerId !== userId) return;
      const known = spaces.find((s) => s.id === currentSpaceId);
      signaling.send({
        type: 'seed-moderation',
        bannedUsers: known?.bannedUsers ?? [],
        locked: known?.locked ?? false,
      });
      seededModerationRef.current = true;
    };

    const unsubscribe = signaling.subscribe((msg) => {
      if (msg.type === 'space-renamed') {
        const { spaceId, newSpaceName } = msg;
        const existingSpace = spaces.find((s) => s.id === spaceId);
        if (existingSpace) {
          updateSpaceSettings(
            spaceId,
            newSpaceName,
            existingSpace.customSignalingUrl || '',
            existingSpace.joinSecret || ''
          );
        }
      } else if (msg.type === 'owner-state') {
        updateSpaceOwnerId(msg.spaceId, msg.ownerId);
        if (msg.spaceId === currentSpaceId) maybeSeedModeration(msg.ownerId);
      } else if (msg.type === 'banner-state') {
        updateSpaceBanner(msg.spaceId, msg.bannerDataUrl);
      } else if (msg.type === 'kicked') {
        // Space-scope is terminal and handled in the reducer; room-scope just
        // returns us to the lobby with a notice (the space connection survives).
        if (msg.scope === 'room') {
          leaveRoom();
          setModNotice('You were removed from the room.');
        }
      } else if (msg.type === 'ban-state') {
        if (msg.spaceId === currentSpaceId) {
          updateSpaceModeration(msg.spaceId, { bannedUsers: msg.bannedUsers });
        }
      } else if (msg.type === 'space-lock-state') {
        if (msg.spaceId === currentSpaceId) {
          updateSpaceModeration(msg.spaceId, { locked: msg.locked });
        }
      } else if (msg.type === 'welcome' && currentSpaceId) {
        // Fresh space-join only — a same-space room-switch welcome omits these
        // fields entirely, so `!== undefined` (not `?? null`) avoids wiping known
        // owner/banner state on ordinary room switches.
        if (msg.ownerId !== undefined) {
          const knownSpace = spaces.find((s) => s.id === currentSpaceId);
          if (msg.ownerId === null && knownSpace?.ownerId === userId) {
            // The signaling server's in-memory ownership record is gone (e.g. a
            // restart cleared it) but we're the space's recorded owner locally —
            // reclaim it instead of silently demoting ourselves to unowned.
            // First-claim-wins is already the trust model and nobody else has
            // claimed it, so this is uncontested; the resulting `owner-state`
            // reply applies the (re)confirmed ownerId.
            signaling.send({ type: 'claim-ownership' });
          } else {
            updateSpaceOwnerId(currentSpaceId, msg.ownerId);
            maybeSeedModeration(msg.ownerId);
          }
        }
        if (msg.bannerDataUrl !== undefined) updateSpaceBanner(currentSpaceId, msg.bannerDataUrl);
        // Same fresh-space-join-only convention: persist the moderation mirror
        // every member carries (what lets a future owner re-seed post-restart).
        if (msg.bannedUsers !== undefined || msg.spaceLocked !== undefined) {
          updateSpaceModeration(currentSpaceId, {
            ...(msg.bannedUsers !== undefined ? { bannedUsers: msg.bannedUsers } : {}),
            ...(msg.spaceLocked !== undefined ? { locked: msg.spaceLocked } : {}),
          });
        }
      }
    });
    return unsubscribe;
  }, [signaling.subscribe, spaces, updateSpaceSettings, updateSpaceOwnerId, updateSpaceBanner, updateSpaceModeration, currentSpaceId, userId, signaling.send, leaveRoom, setModNotice]);

  // One-shot: right after a brand-new space's first successful connection,
  // auto-claim ownership (guaranteed to win — the space is empty at this point).
  useEffect(() => {
    if (signaling.status === 'connected' && pendingOwnerClaimSpaceId && pendingOwnerClaimSpaceId === currentSpaceId) {
      signaling.send({ type: 'claim-ownership' });
      clearPendingOwnerClaim();
    }
  }, [signaling.status, pendingOwnerClaimSpaceId, currentSpaceId, signaling.send, clearPendingOwnerClaim]);

  const applyStatus = useCallback((status: 'online' | 'idle' | 'dnd') => {
    setSelfStatus(status);
    store.setStatus(status);
    if (signaling.status === 'connected') {
      signaling.send({ type: 'status-state', status });
    }
  }, [signaling.status, signaling.send]);

  function joinRoom(id: string): void {
    if (!currentSpaceId) return;

    if (id === currentRoomId) {
      // In compact mode the active row is easy to misclick; never leave on click
      // there (the dedicated Leave mini-button handles it). Full view unchanged.
      if (compactMode) return;
      if (Date.now() - lastJoinTimeRef.current < 600) {
        return;
      }
      leaveRoom();
      return;
    }

    // Block joining a locked room (server rejects too, as a backstop — and its
    // reject is terminal like room-full, so the pre-block is the friendly path).
    if (signaling.lockedRooms.includes(id) && !amOwner) {
      setModNotice('That room is locked.');
      return;
    }

    // Block joining a room that's already at capacity (server rejects too, as a backstop).
    const target = rooms.find((r) => r.id === id);
    const occupancy = users.filter((u) => u.roomId === id).length;
    if (target && occupancy >= capacityForType(target.type)) return;

    lastJoinTimeRef.current = Date.now();
    setCurrentRoomId(id);
    mesh.prepareMedia();
    signaling.joinRoom(id);
  }

  function createRoom(label: string, icon: string): void {
    // Belt to the onCreateRoom pre-check's suspenders: one created room per
    // standard member (the server enforces this too and would resync us back).
    if (!amOwner && rooms.some((r) => r.createdBy === userId)) {
      setModNotice('You already manage a room — delete it to create another.');
      setCreateOpen(false);
      return;
    }
    const id = slugify(label);
    const next = rooms.some((r) => r.id === id)
      ? rooms
      : [...rooms, { id, label, icon, type: 'hybrid' as const, ...(userId ? { createdBy: userId } : {}) }];
    updateRooms(next);
    setCreateOpen(false);
    if (signaling.status === 'connected' && currentSpaceId) {
      signaling.send({ type: 'update-rooms', spaceId: currentSpaceId, rooms: next });
    }
    joinRoom(id);
  }

  // Rename is cosmetic — the room `id` (signaling room) and `type` stay stable.
  function renameRoom(id: string, label: string, icon: string): void {
    const next = rooms.map((r) => (r.id === id ? { ...r, label, icon } : r));
    updateRooms(next);
    setRenameTarget(null);
    if (signaling.status === 'connected' && currentSpaceId) {
      signaling.send({ type: 'update-rooms', spaceId: currentSpaceId, rooms: next });
    }
  }

  function removeRoom(id: string): void {
    const next = rooms.filter((r) => r.id !== id);
    updateRooms(next);
    if (signaling.status === 'connected' && currentSpaceId) {
      signaling.send({ type: 'update-rooms', spaceId: currentSpaceId, rooms: next });
    }
    if (id === currentRoomId) leaveRoom();
  }

  async function handleOnboardingSubmit(name: string, val: string, action: 'create' | 'join', customSignalingUrl?: string, joinSecret?: string): Promise<AddSpaceResult> {
    const result = await initFirstSpace(val, action, customSignalingUrl, joinSecret);
    // Only commit the display name once the space is confirmed, so a failed join
    // doesn't leave the wizard in a half-applied state.
    if (result.ok) {
      store.setName(name);
      setDisplayName(name);
    }
    return result;
  }

  function toggleChat(): void {
    setChatOpen((v) => {
      store.setChatVisible(!v);
      return !v;
    });
  }

  function saveName(name: string): void {
    store.setName(name);
    setDisplayName(name);
  }

  function applyNoiseSuppression(on: boolean): void {
    setNoiseSuppression(on);
    store.setNoiseSuppression(on);
    mesh.setNoiseSuppression(on);
  }

  function applyEchoCancellation(on: boolean): void {
    setEchoCancellation(on);
    store.setEchoCancellation(on);
    mesh.setEchoCancellation(on);
  }

  function applyAutoGainControl(on: boolean): void {
    setAutoGainControl(on);
    store.setAutoGainControl(on);
    mesh.setAutoGainControl(on);
  }

  const applyInputDevice = useCallback((id: string) => {
    setInputDeviceId(id);
    store.setInputDeviceId(id);
    mesh.setInputDevice(id);
  }, [mesh.setInputDevice]);

  const applyOutputDevice = useCallback((id: string) => {
    setOutputDeviceId(id);
    store.setOutputDeviceId(id);
  }, []);

  // Live chat-panel resize from the drag handle: update state every move, persist
  // only on release (commit) so we don't write to disk on every pointermove.
  const handleChatResize = useCallback((scale: number, commit: boolean) => {
    const clamped = Math.max(1.0, Math.min(2.0, scale));
    setChatWidthScale(clamped);
    if (commit) store.setChatWidthScale(clamped);
  }, []);

  // Settings slider commits chat width directly (persist immediately).
  const applyChatWidthScale = useCallback((scale: number) => {
    setChatWidthScale(scale);
    store.setChatWidthScale(scale);
  }, []);

  // Compact + chat: docked width, but the room chat panel stays visible (video
  // grid/stage/control-bar hidden). Fully derived from existing state — no new
  // persisted flag — so collapsing while chat is open, toggling chat while
  // compact, and leaving the room all just fall out of this expression.
  const showCompactChat = compactMode && chatOpen && inRoom;

  // Unified sidebar width: drives the CSS var everywhere. In full view and
  // compact+chat it's a pure splitter (the sidebar/chat flex split absorbs the
  // change, window width untouched); in plain compact — where the sidebar IS
  // the whole window — it also drives the OS dock width via IPC. Persist on
  // commit only.
  const handleSidebarResize = useCallback(
    (scale: number, commit: boolean) => {
      const clamped = Math.max(1.0, Math.min(2.0, scale));
      setSidebarWidthScale(clamped);
      if (compactMode && !showCompactChat) {
        window.chickadee?.windowControls?.setWindowWidth?.(Math.round(280 * clamped));
      }
      if (commit) store.setSidebarWidthScale(clamped);
    },
    [compactMode, showCompactChat],
  );

  const cycleInputMode = useCallback(() => {
    const order = ['voice', 'ptt'] as const;
    applyInputMode(order[(order.indexOf(inputMode) + 1) % order.length]);
  }, [inputMode, applyInputMode]);

  const toggleCompactMode = useCallback(() => {
    setCompactMode((c) => {
      const next = !c;
      store.setCompactMode(next);
      return next;
    });
  }, []);

  const toggleRoomsSection = useCallback(() => {
    setRoomsSectionCollapsed((c) => {
      const next = !c;
      store.setRoomsSectionCollapsed(next);
      return next;
    });
  }, []);

  // Stage (spotlight) slot: claim/release intent, screen-share auto-claim,
  // take-over prompt, and the reconnect re-claim.
  const { pendingTakeover, cancelTakeover, confirmTakeover, spotlightCamera, unspotlight } =
    useStageSpotlight({
      status: signaling.status,
      selfId: signaling.selfId,
      spotlightHolderId: signaling.spotlightHolderId,
      claimSpotlight: signaling.claimSpotlight,
      releaseSpotlight: signaling.releaseSpotlight,
      subscribe: signaling.subscribe,
      sharingScreen: mesh.sharingScreen,
      cameraEnabled: mesh.cameraEnabled,
      currentRoomId,
      peers: signaling.peers,
    });

  // P2P file transfers to space members (USERS-row send button + drag-drop +
  // accept modal + the floating transfer tray).
  const fileTransfers = useFileTransfers({
    spacePresence: signaling.spacePresence,
    send: signaling.send,
    subscribe: signaling.subscribe,
    iceServers,
    windowFocused,
  });
  const { sendFilesTo } = fileTransfers;
  const incomingOffer = fileTransfers.incomingOffer;

  const soundboardLibrary = useSoundboardLibrary({
    send: signaling.send,
    setSoundboardClips: signaling.setSoundboardClips,
    enabled: soundboardEnabled,
  });
  const soundboardPlayback = useSoundboardPlayback({
    subscribe: signaling.subscribe,
    send: signaling.send,
    enabled: soundboardEnabled,
    volume: soundboardVolume,
    volumes,
  });
  useSoundboardSync({
    peers: signaling.peers,
    send: signaling.send,
    subscribe: signaling.subscribe,
    iceServers,
    enabled: soundboardEnabled,
    autoSyncEnabled: soundboardAutoSyncEnabled,
  });

  // Transient picker per gesture: input.click() must run synchronously inside
  // the user's click for Chromium to open the dialog; no persistent DOM node.
  const handleSendFileTo = useCallback(
    (userId: string) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true; // more than one selection becomes a batch
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        if (files.length > 0) sendFilesTo(userId, files);
      };
      input.click();
    },
    [sendFilesTo],
  );

  // OS files dropped on a USERS row (FriendRow validates online + Files-drag).
  const handleDropFiles = useCallback(
    (userId: string, files: File[]) => sendFilesTo(userId, files),
    [sendFilesTo],
  );

  // A drop that misses a USERS row must never navigate the window (Electron's
  // default opens the dropped file); main's will-navigate guard is the backstop.
  useEffect(() => {
    const prevent = (e: DragEvent): void => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  // "Always accept files from X" checkbox on the incoming prompt; resets per offer.
  const [trustSender, setTrustSender] = useState(false);
  const incomingOfferId = incomingOffer?.transferId ?? null;
  useEffect(() => setTrustSender(false), [incomingOfferId]);
  const handleAcceptIncoming = useCallback(() => {
    if (incomingOffer && trustSender && incomingOffer.fromUserId) {
      handleTrustUser(incomingOffer.fromUserId, incomingOffer.fromName);
    }
    fileTransfers.acceptIncoming();
  }, [incomingOffer, trustSender, handleTrustUser, fileTransfers.acceptIncoming]);

  // Sidebar actions open a real modal (Settings, Create/Rename Room, Space Settings,
  // Create/Join Space) that needs more width than the compact dock strip. Rather than
  // leave compact mode (which would re-show the room + re-decode video behind the
  // modal, and persist the exit), temporarily widen the OS window while any of them is
  // open — the app stays compact and snaps back to the dock on close.
  const overlayNeedsSpace =
    compactMode &&
    (settingsOpen ||
      createOpen ||
      renameTarget != null ||
      spaceSettingsTarget != null ||
      spaceJoin.createSpaceOpen ||
      spaceJoin.joinSpaceOpen);

  useEffect(() => {
    window.chickadee?.windowControls?.setOverlayExpand?.(overlayNeedsSpace);
  }, [overlayNeedsSpace]);

  useEffect(() => {
    window.chickadee?.windowControls?.setCompact?.(
      compactMode,
      Math.round(280 * sidebarWidthScale),
      showCompactChat ? Math.round(280 * chatWidthScale) : undefined,
    );
    // sidebarWidthScale/chatWidthScale intentionally omitted: the dock width is
    // set on toggle and updated live via setWindowWidth in handleSidebarResize
    // while already compact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compactMode, showCompactChat]);

  function applyChatTtsEnabled(on: boolean): void {
    setChatTtsEnabled(on);
    store.setChatTtsEnabled(on);
    if (!on) cancelSpeech(); // stop any in-progress speech when disabled
  }

  function applyLaunchOnStartup(on: boolean): void {
    setLaunchOnStartup(on);
    store.setLaunchOnStartup(on);
    void window.chickadee?.setLoginItem?.(on);
  }

  function applyAlwaysOnTop(on: boolean): void {
    setAlwaysOnTop(on);
    store.setAlwaysOnTop(on);
    void window.chickadee?.setAlwaysOnTop?.(on);
  }

  // Warm the TTS voice list only when read-aloud is on, so the first spoken message resolves
  // the right voice. When off, skip the getVoices() call + voiceschanged listener; re-runs
  // (and warms) if read-aloud is toggled on later. initVoices is idempotent.
  useEffect(() => {
    if (chatTtsEnabled) initVoices();
  }, [chatTtsEnabled]);

  // Update Electron badge count when unreadCount or badge setting changes.
  useEffect(() => {
    if (window.chickadee?.setBadge) {
      if (badgeNotificationsEnabled && unreadCount > 0) {
        const dataUrl = generateBadgeOverlay(unreadCount);
        void window.chickadee.setBadge(unreadCount, dataUrl);
      } else {
        void window.chickadee.setBadge(0, null);
      }
    }
  }, [unreadCount, badgeNotificationsEnabled]);

  const toggleDeafen = useCallback(() => {
    setDeafened((d) => {
      const nextDeaf = !d;
      if (store.getSfxEnabled() && store.getSfxDeafenEnabled()) {
        playSfx(nextDeaf ? 'deafen' : 'undeafen', store.getSfxVolume());
      }
      if (signaling.status === 'connected') {
        signaling.send({ type: 'deafen-state', deafened: nextDeaf });
      }
      return nextDeaf;
    });
  }, [signaling.status, signaling.send]);

  const handleToggleMic = useCallback(() => {
    // Flip the persistent mute intent; the baseline gating effect re-derives the
    // transmit gate per mode. Cut transmit immediately on mute so it feels instant.
    setMicMuted((m) => {
      const next = !m;
      if (next) mesh.setMicEnabled(false);
      return next;
    });
  }, [mesh.setMicEnabled]);

  // Acquire mic for test when settings is open, release if not in room when closed.
  useEffect(() => {
    if (settingsOpen) {
      mesh.prepareMedia();
    } else {
      if (!inRoom) {
        mesh.teardown();
      }
    }
  }, [settingsOpen, inRoom, mesh.prepareMedia, mesh.teardown]);

  // Broadcast our deafen state and status to the room (re-announces on join/reconnect).
  useEffect(() => {
    if (signaling.status === 'connected') {
      if (deafened) {
        signaling.send({ type: 'deafen-state', deafened: true });
      }
      signaling.send({ type: 'status-state', status: selfStatus });
    }
  }, [currentRoomId, signaling.status, signaling.send, deafened, selfStatus]);

  // Broadcast mute *intent* (not the per-frame VAD/PTT transmit gate) so remote
  // mute icons reflect a deliberate mute and don't flicker as the user talks.
  // Keyed on signaling.status so it re-announces on (re)connect.
  useEffect(() => {
    if (signaling.status === 'connected') {
      signaling.send({ type: 'mic-state', muted: !micButtonOn });
    }
  }, [micButtonOn, signaling.status, signaling.send]);

  // Broadcast our speaking state so peers render the same ripple we show locally.
  useEffect(() => {
    if (signaling.status === 'connected') {
      signaling.send({ type: 'speaking-state', speaking: selfSpeaking });
    }
  }, [selfSpeaking, signaling.status, signaling.send]);

  // Tell the room our video opt-in state: which peers we've joined (subscriptions)
  // and whether we're rendering video (false while docked, so senders pause our
  // subscribed video but keep its audio). Re-announces on (re)connect — keyed on
  // signaling.status — since the server resets us to default.
  useEffect(() => {
    if (signaling.status === 'connected') {
      signaling.send({ type: 'sink-state', subscriptions: videoSubscriptions, wantsVideo: !compactMode });
    }
  }, [videoSubscriptions, compactMode, signaling.status, signaling.send]);

  // Subscriptions are room-scoped: starting in a new room means re-opting-in.
  useEffect(() => {
    setVideoSubscriptions([]);
  }, [currentRoomId]);

  // Drop subscriptions to peers with nothing left to watch (stopped sharing /
  // camera off / left), so `subscribed` flips false and the Watch button
  // reappears when they share again. Also re-broadcasts the trimmed sink-state
  // (the effect above keys on videoSubscriptions), releasing the sender's track.
  useEffect(() => {
    setVideoSubscriptions((prev) => {
      const watchable = new Set(
        signaling.peers.filter((p) => p.screenStreamId || p.cameraOn).map((p) => p.userId),
      );
      const next = prev.filter((uid) => watchable.has(uid));
      return next.length === prev.length ? prev : next;
    });
  }, [signaling.peers]);

  // Keep local rooms in sync with the signaling server's room list for this Space.
  useEffect(() => {
    if (signaling.status === 'connected' && signaling.rooms) {
      updateRooms(signaling.rooms);
    }
  }, [signaling.rooms, signaling.status, updateRooms]);

  // Reset selected room if connection hits a terminal state (closed, room-full, kicked, or error)
  useEffect(() => {
    if (signaling.status === 'room-full' || signaling.status === 'kicked' || signaling.status === 'error' || signaling.status === 'closed') {
      setCurrentRoomId(null);
    }
  }, [signaling.status]);

  const peerIdsStr = useMemo(() => signaling.peers.map((p) => p.id).sort().join(','), [signaling.peers]);

  useSfxEvents({ sfxEnabled, sfxVolume, sfxJoinLeaveEnabled, sfxMuteEnabled, sfxTransmitEnabled, currentRoomId, peerIdsStr, micEnabled: mesh.micEnabled, micButtonOn, inputMode, inRoom });

  const onPttStart = useCallback(() => {
    mesh.setMicEnabled(true);
  }, [mesh.setMicEnabled]);

  const onPttStop = useCallback(() => {
    mesh.setMicEnabled(false);
  }, [mesh.setMicEnabled]);

  const onPttToggle = useCallback(() => {
    mesh.toggleMic();
  }, [mesh.toggleMic]);

  const onMuteStart = useCallback(() => {
    setMicMuted(true);
    mesh.setMicEnabled(false); // cut transmit immediately; the gating effect reasserts
  }, [mesh.setMicEnabled]);

  const onMuteStop = useCallback(() => {
    setMicMuted(false); // the baseline gating effect re-opens per the current mode
  }, []);

  const onMuteToggle = useCallback(() => {
    handleToggleMic();
  }, [handleToggleMic]);

  useKeybindSync({
    inputMode,
    muted: micMuted,
    pushToTalkKey,
    pttMode,
    muteKey,
    muteMode,
    onPttStart,
    onPttStop,
    onPttToggle,
    onMuteStart,
    onMuteStop,
    onMuteToggle,
    deafenKey,
    deafenMode,
    onDeafenStart: () => { if (!deafened) toggleDeafen(); },
    onDeafenStop: () => { if (deafened) toggleDeafen(); },
    onDeafenToggle: toggleDeafen,
    cameraKey,
    onCameraToggle: () => { mesh.toggleCamera(); },
    screenShareKey,
    onScreenShareToggle: () => {
      mesh.sharingScreen ? mesh.stopScreenShare() : setPickerOpen(true);
    },
    chatPanelKey,
    onChatPanelToggle: toggleChat,
    ttsToggleKey,
    onTtsToggle: () => applyChatTtsEnabled(!chatTtsEnabled),
    ttsStopKey,
    onTtsStop: cancelSpeech,
    localStream: mesh.localStream,
  });

  // Voice-activation gate (voice mode). Paused while manually muted (micMuted).
  // Reads the pre-gate analyser so it sees the live mic even while muted.
  useVoiceActivation({
    active: inputMode === 'voice' && inRoom && !micMuted,
    threshold: vadThreshold,
    releaseMs: vadReleaseMs,
    analyserNode: mesh.analyserNode,
    setMicEnabled: mesh.setMicEnabled,
  });

  // Audio/video device lists for Settings and the chevron menus.
  const devices = useMediaDevices(inRoom || settingsOpen || menus.inputMenuOpen || menus.outputMenuOpen || menus.videoMenuOpen);
  // Optimistic until the first device scan resolves, so the UI doesn't flash
  // "(No camera detected)" / disabled controls before enumerateDevices() returns.
  const hasCamera = !devices.scanned || devices.videoInputs.length > 0;
  // The camera is usable only when a device exists AND the feature is enabled in settings.
  const cameraAvailable = hasCamera;


  useTraySync({ currentRoomLabel: currentRoom?.label ?? null, handleToggleMic, toggleDeafen });

  // A tile/stream is only truly on-screen when the window is visible AND not docked
  // to the sidebar. Drives the incoming-video detach so a docked user stops decoding.
  const mediaVisible = windowVisible && !compactMode;

  // Camera tiles (self + peers), reused in grid and filmstrip layouts.
  const tiles = inRoom && (
    <>
      <ParticipantTile
        displayName={displayName}
        isSelf
        muted={!mesh.micEnabled}
        intentionallyMuted={!micButtonOn}
        cameraOn={mesh.cameraEnabled}
        cameraStream={mesh.localStream}
        cameraVideoId={mesh.localStream?.getVideoTracks()[0]?.id ?? null}
        color={selfColor}
        speaking={selfSpeaking}
        deafened={deafened}
        avatarUrl={localAvatarUrl}
        screenSharing={mesh.sharingScreen}
        windowVisible={mediaVisible}
        showSpotlightButton={mesh.cameraEnabled && myStageKind == null}
        onSpotlight={spotlightCamera}
        role={amOwner ? 'owner' : amModerator ? 'moderator' : null}
      />
      {signaling.peers.map((peer) => {
        const media = mesh.remote[peer.id];
        const subscribed = videoSubscriptions.includes(peer.userId);
        return (
          <ParticipantTile
            key={peer.id}
            displayName={peer.displayName}
            isSelf={false}
            muted={peer.muted}
            speaking={peer.speaking}
            cameraOn={peer.cameraOn}
            cameraStream={media?.cameraStream ?? null}
            cameraVideoId={media?.cameraVideoId ?? null}
            color={peer.accentColor || colors[peer.id] || SELF_COLOR}
            connectionState={media?.connectionState ?? 'new'}
            avatarUrl={peer.avatarDataUrl ?? null}
            volume={deafened ? 0 : (volumes[peer.id] ?? 1) * outputVolume}
            peerVolume={volumes[peer.id] ?? 1}
            peerId={peer.id}
            userId={peer.userId}
            onVolumeChange={handleVolumeChange}
            onToggleMute={togglePeerMute}
            deafened={peer.deafened}
            normalize={normalizeVoices}
            screenSharing={!!peer.screenStreamId}
            windowVisible={mediaVisible}
            subscribed={subscribed}
            onJoinVideo={joinVideo}
            onLeaveVideo={leaveVideo}
            role={peer.userId === ownerUserId ? 'owner' : peer.id === signaling.moderatorId ? 'moderator' : null}
            onUserContextMenu={openUserMenu}
          />
        );
      })}
    </>
  );

  // --- Stage (spotlight) derivation: at most ONE large tile per room ---
  // The decision (who's on stage, whether we've opted in, which stream kind) is
  // the pure, unit-tested selectStage; here we only resolve ids back to the live
  // Peer/MediaStream objects. Null source → large "Watch" placeholder.
  const stageSel = selectStage({
    myStageKind,
    spotlightHolderId: signaling.spotlightHolderId,
    spotlightKind: signaling.spotlightKind,
    peers: signaling.peers,
    subscribedUserIds: videoSubscriptions,
  });
  const isSelfStage = stageSel.isSelfStage;
  const theater = stageSel.theater;
  const stagePeer =
    stageSel.stagePeerId != null
      ? signaling.peers.find((p) => p.id === stageSel.stagePeerId) ?? null
      : null;
  const stageStream: MediaStream | null =
    stageSel.stageSource === 'local-screen'
      ? mesh.localScreenStream
      : stageSel.stageSource === 'local-camera'
        ? mesh.localStream
        : stageSel.stageSource === 'remote-screen'
          ? (stagePeer ? mesh.remote[stagePeer.id]?.screenStream ?? null : null)
          : stageSel.stageSource === 'remote-camera'
            ? (stagePeer ? mesh.remote[stagePeer.id]?.cameraStream ?? null : null)
            : null;
  const stageName = isSelfStage ? displayName : stagePeer?.displayName ?? '';
  const stageUserId = stagePeer?.userId;
  const stageAvatarUrl = isSelfStage ? localAvatarUrl : stagePeer?.avatarDataUrl ?? null;
  // Screen-share audio gain, independent of voice volume — only meaningful for a
  // remote peer's screen (a spotlighted camera has no separate audio track).
  const isRemoteScreenStage = !isSelfStage && stageSel.stageSource === 'remote-screen';
  const stageScreenAudioLevel = stagePeer ? screenVolumes[stagePeer.id] ?? 1 : 1;
  const stageScreenAudioVolume = deafened ? 0 : stageScreenAudioLevel * outputVolume;

  const errors = [mesh.micError, mesh.cameraError, mesh.screenError, signaling.error, modNotice].filter(Boolean);

  return (
    <div
      className={`app${windowFocused ? '' : ' app--unfocused'}${compactMode ? ' app--compact' : ''}${showCompactChat ? ' app--compact-chat' : ''}`}
      style={{ '--sidebar-width-scale': sidebarWidthScale } as React.CSSProperties}
    >
      <TitleBar
        chatOpen={chatOpen}
        onToggleChat={toggleChat}
        inRoom={inRoom}
        compact={compactMode}
        onToggleCompact={toggleCompactMode}
      />

      <div className="app-body">
        {chat.floats.map((f) => (
          <div key={f.id} className="float-reaction" style={{ left: `${f.x}%` }}>
            {f.emoji}
          </div>
        ))}

        <Sidebar
          rooms={rooms}
          currentRoomId={currentRoomId}
          onSelectRoom={joinRoom}
          onCreateRoom={() => {
            // One created room per standard member — say so instead of opening
            // a modal whose submit the server would bounce.
            if (!amOwner && rooms.some((r) => r.createdBy === userId)) {
              setModNotice('You already manage a room — delete it to create another.');
              return;
            }
            setCreateOpen(true);
          }}
          onRequestRename={(room) => setRenameTarget(room)}
          onRemoveRoom={removeRoom}
          canManageRoom={canManageRoom}
          myUserId={userId}
          users={users}
          selfName={displayName}
          selfColor={selfColor}
          selfAvatarUrl={localAvatarUrl}
          online={signaling.status === 'connected'}
          onOpenSettings={() => setSettingsOpen(true)}
          spaces={spaces}
          activeSpaceId={currentSpaceId}
          onSelectSpace={switchSpace}
          onCreateSpace={spaceJoin.openCreateSpace}
          onJoinSpace={spaceJoin.openJoinSpace}
          onDeleteSpace={deleteSpace}
          onSpaceSettings={(id) => setSpaceSettingsTarget(id)}
          selfStatus={selfStatus}
          onChangeStatus={applyStatus}
          roomsCollapsed={roomsSectionCollapsed}
          onToggleRoomsSection={toggleRoomsSection}
          hideSpaceBanner={hideSpaceBanner}
          compact={compactMode}
          compactChat={showCompactChat}
          widthScale={sidebarWidthScale}
          onResize={handleSidebarResize}
          micEnabled={micButtonOn}
          hasMic={!!mesh.localStream}
          onToggleMic={handleToggleMic}
          deafened={deafened}
          onToggleDeafen={toggleDeafen}
          inputMode={inputMode}
          onCycleInputMode={cycleInputMode}
          selfSpeaking={selfSpeaking}
          speakingUserIds={speakingUserIds}
          mutedUserIds={mutedUserIds}
          onTogglePeerMute={togglePeerMuteByUserId}
          onLeaveRoom={leaveRoom}
          onSendFile={handleSendFileTo}
          onDropFiles={handleDropFiles}
          ownerUserId={ownerUserId}
          moderatorUserId={moderatorUserId}
          amOwner={amOwner}
          amModerator={amModerator}
          lockedRoomIds={signaling.lockedRooms}
          onToggleRoomLock={signaling.status === 'connected' ? toggleRoomLock : undefined}
          spaceLocked={signaling.spaceLocked}
          onToggleSpaceLock={signaling.status === 'connected' ? toggleSpaceLock : undefined}
          onUserContextMenu={openUserMenu}
        />

        <div className="main">

        {inRoom ? (
          <>
            <div className="content-area">
              {chatOpen && chatPosition === 'left' && (
                <ChatPanel messages={chat.messages} onSend={chat.sendChat} chatFontScale={chatFontScale} chatPosition={chatPosition} chatWidthScale={chatWidthScale} onResize={compactMode ? undefined : handleChatResize} />
              )}

              {theater ? (
                <div className="presentation">
                  <div className="stage" data-count={1}>
                    {stageStream ? (
                      <ScreenView
                        key={`stage-${signaling.spotlightHolderId}`}
                        displayName={stageName}
                        isSelf={isSelfStage}
                        kind={signaling.spotlightKind ?? 'screen'}
                        stream={stageStream}
                        windowVisible={mediaVisible}
                        watcherNames={isSelfStage ? selfWatchers.map((p) => p.displayName) : undefined}
                        screenAudioVolume={isRemoteScreenStage ? stageScreenAudioVolume : undefined}
                        screenAudioLevel={isRemoteScreenStage ? stageScreenAudioLevel : undefined}
                        onScreenAudioVolumeChange={
                          isRemoteScreenStage && stagePeer
                            ? (v) => handleScreenVolumeChange(stagePeer.id, v)
                            : undefined
                        }
                        onToggleScreenAudioMute={
                          isRemoteScreenStage && stagePeer ? () => toggleScreenMute(stagePeer.id) : undefined
                        }
                        onLeave={!isSelfStage && stageUserId ? () => leaveVideo(stageUserId) : undefined}
                        onUnspotlight={
                          isSelfStage
                            ? signaling.spotlightKind === 'screen'
                              ? mesh.stopScreenShare
                              : unspotlight
                            : undefined
                        }
                      />
                    ) : (
                      <div className="screen stage__placeholder">
                        <div className="stage__placeholder-body">
                          <div className="avatar avatar--lg" style={{ background: stageAvatarUrl ? undefined : (stagePeer?.accentColor || colors[stagePeer?.id ?? ''] || SELF_COLOR) }}>
                            {stageAvatarUrl ? <img src={stageAvatarUrl} alt={stageName} /> : (stageName.trim().charAt(0).toUpperCase() || '?')}
                          </div>
                          <p>{stageName} is streaming</p>
                          {stageUserId && (
                            <button className="btn btn--primary" onClick={() => joinVideo(stageUserId)}>
                              <Play size={15} strokeWidth={2.5} fill="currentColor" /> Watch
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <ul className="filmstrip">{tiles}</ul>
                </div>
              ) : (
                <ul className="grid" data-count={Math.min(totalInRoom, currentRoomCap)}>
                  {tiles}
                </ul>
              )}

              {chatOpen && chatPosition === 'right' && (
                <ChatPanel messages={chat.messages} onSend={chat.sendChat} chatFontScale={chatFontScale} chatPosition={chatPosition} chatWidthScale={chatWidthScale} onResize={compactMode ? undefined : handleChatResize} />
              )}
            </div>

            <ControlBar
              micEnabled={micButtonOn}
              hasMic={!!mesh.localStream}
              onToggleMic={handleToggleMic}
              onInputMenu={menus.openInputMenu}
              cameraEnabled={mesh.cameraEnabled}
              onToggleCamera={mesh.toggleCamera}
              sharingScreen={mesh.sharingScreen}
              onToggleShare={() => {
                menus.closeVideoMenu();
                menus.closeReactionMenu();
                mesh.sharingScreen ? mesh.stopScreenShare() : setPickerOpen(true);
              }}
              onVideoMenu={menus.openVideoMenu}
              activeVideoMode={activeVideoMode}
              inputMode={inputMode}
              onCycleInputMode={cycleInputMode}
              onInputModeMenu={menus.openInputModeMenu}
              onReactMenu={menus.openReactionMenu}
              reactionsEnabled={reactionsEnabled}
              onSoundboardMenu={menus.openSoundboardMenu}
              soundboardEnabled={soundboardEnabled}
              onLeave={leaveRoom}
              deafened={deafened}
              onToggleDeafen={toggleDeafen}
              onOutputMenu={menus.openOutputMenu}
              onMouseEnterReact={menus.cancelReactionCloseTimeout}
              onMouseLeaveReact={menus.startReactionCloseTimeout}
              selfSpeaking={selfSpeaking}
            />

            {menus.inputMenuOpen && menus.inputMenuAnchor && (
              <AudioDeviceMenu
                mode="input"
                devices={devices.inputs}
                selectedDeviceId={inputDeviceId}
                onSelectDevice={(id) => { setInputDeviceId(id); store.setInputDeviceId(id); }}
                volume={micVolume}
                onChangeVolume={applyMicVolume}
                keybindLabel="Mute/Unmute key"
                keybindValue={muteKey}
                onChangeKeybind={applyMuteKey}
                keybindMode={muteMode}
                onChangeKeybindMode={applyMuteMode}
                onOpenVoiceSettings={() => { menus.closeInputMenu(); setSettingsInitialTab('audio'); setSettingsOpen(true); }}
                onClose={menus.closeInputMenu}
                anchorRect={menus.inputMenuAnchor}
              />
            )}
            {menus.outputMenuOpen && menus.outputMenuAnchor && (
              <AudioDeviceMenu
                mode="output"
                devices={devices.outputs}
                selectedDeviceId={outputDeviceId}
                onSelectDevice={(id) => { setOutputDeviceId(id); store.setOutputDeviceId(id); }}
                volume={outputVolume}
                onChangeVolume={applyOutputVolume}
                keybindLabel="Deafen/Undeafen key"
                keybindValue={deafenKey}
                onChangeKeybind={applyDeafenKey}
                keybindMode={deafenMode}
                onChangeKeybindMode={applyDeafenMode}
                onOpenVoiceSettings={() => { menus.closeOutputMenu(); setSettingsInitialTab('audio'); setSettingsOpen(true); }}
                onClose={menus.closeOutputMenu}
                anchorRect={menus.outputMenuAnchor}
              />
            )}
            {menus.inputModeMenuOpen && menus.inputModeMenuAnchor && (
              <InputModeMenu
                inputMode={inputMode}
                onSwitchMode={applyInputMode}
                pttMode={pttMode}
                onChangePttMode={applyPttMode}
                pushToTalkKey={pushToTalkKey}
                onChangePushToTalkKey={applyPushToTalkKey}
                vadThreshold={vadThreshold}
                onChangeVadThreshold={applyVadThreshold}
                onOpenVoiceSettings={() => { menus.closeInputModeMenu(); setSettingsInitialTab('audio'); setSettingsOpen(true); }}
                onClose={menus.closeInputModeMenu}
                anchorRect={menus.inputModeMenuAnchor}
              />
            )}
            {menus.videoMenuOpen && menus.videoMenuAnchor && (
              <VideoMenu

                cameraResolution={cameraResolution}
                onChangeCameraResolution={applyCameraResolution}
                cameraFramerate={cameraFramerate}
                onChangeCameraFramerate={applyCameraFramerate}
                screenResolution={screenResolution}
                onChangeScreenResolution={applyScreenResolution}
                screenFramerate={screenFramerate}
                onChangeScreenFramerate={applyScreenFramerate}
                onOpenVideoSettings={() => { menus.closeVideoMenu(); setSettingsInitialTab('video'); setSettingsOpen(true); }}
                onClose={menus.closeVideoMenu}
                anchorRect={menus.videoMenuAnchor}
                hasCamera={cameraAvailable}
                activeVideoMode={activeVideoMode}
                onSelectVideoMode={(mode) => {
                  if (mode === 'camera' && !cameraAvailable) {
                    mesh.setCameraError("No camera detected.");
                  } else {
                    setActiveVideoMode(mode);
                  }
                }}
              />
            )}
            {menus.reactionMenuOpen && menus.reactionMenuAnchor && (
              <ReactionPopover
                onReact={chat.react}
                onClose={menus.closeReactionMenu}
                anchorRect={menus.reactionMenuAnchor}
                onMouseEnter={menus.handleReactionPopoverEnter}
                onMouseLeave={menus.startReactionCloseTimeout}
              />
            )}
            {menus.soundboardMenuOpen && menus.soundboardMenuAnchor && (
              <SoundboardPopover
                ownClips={soundboardLibrary.ownClips}
                peers={signaling.peers}
                onTrigger={soundboardPlayback.triggerClip}
                onClose={menus.closeSoundboardMenu}
                anchorRect={menus.soundboardMenuAnchor}
              />
            )}
          </>
        ) : (
          <div className="empty-lounge">
            <div className="empty-lounge__card">
              <Logo size={72} className="empty-lounge__bird" />
              {currentSpaceId ? (
                <>
                  <h2>Pick a room to start</h2>
                  <p>Choose a room from the sidebar — or create your own.</p>
                </>
              ) : (
                <>
                  <h2>Chirp...? Aren't you forgetting something?</h2>
                  <p>Create or join a space to join a room!</p>
                </>
              )}
            </div>
          </div>
        )}

        {errors.length > 0 && (() => {
          const activeToastAnchor =
            (menus.videoMenuOpen && menus.videoMenuAnchor) ||
            (menus.inputMenuOpen && menus.inputMenuAnchor) ||
            (menus.outputMenuOpen && menus.outputMenuAnchor) ||
            (menus.inputModeMenuOpen && menus.inputModeMenuAnchor) ||
            (menus.reactionMenuOpen && menus.reactionMenuAnchor) ||
            (menus.soundboardMenuOpen && menus.soundboardMenuAnchor) || null;

          const toastStyle: React.CSSProperties | undefined = activeToastAnchor
            ? { left: `${activeToastAnchor.left + activeToastAnchor.width / 2}px` }
            : undefined;

          return (
            <div className="toasts" style={toastStyle}>
            {errors.map((e, i) => (
              <div key={i} className="toast">
                {e}
              </div>
            ))}
          </div>
          );
        })()}
      </div>
      </div>

      {pickerOpen && (
        <Suspense fallback={null}>
          <ScreenSharePicker
            onPick={(id, withAudio) => {
              setPickerOpen(false);
              mesh.startScreenShare(id, withAudio);
            }}
            onClose={() => setPickerOpen(false)}
          />
        </Suspense>
      )}

      {userMenu && signaling.status === 'connected' && (() => {
        // Mirror the server's canModerate matrix so unauthorized users never
        // see the menu (the server would silently no-op anyway).
        const targetIsSelf = userMenu.userId === userId;
        const targetIsOwner = ownerUserId != null && userMenu.userId === ownerUserId;
        const targetPresence = signaling.spacePresence.find((p) => p.peer.userId === userMenu.userId);
        const targetOnline = targetPresence != null && targetPresence.leftAt === undefined;
        const targetInARoom = targetOnline && targetPresence.roomId != null;
        const targetInMyRoom = inRoom && signaling.peers.some((p) => p.userId === userMenu.userId);
        const showKickRoom =
          !targetIsSelf && !targetIsOwner && (amOwner ? targetInARoom : amModerator && targetInMyRoom);
        const showKickSpace = amOwner && !targetIsSelf && targetOnline;
        const showBan = amOwner && !targetIsSelf;
        if (!showKickRoom && !showKickSpace && !showBan) return null;
        return (
          <UserContextMenu
            menu={userMenu}
            showKickRoom={showKickRoom}
            showKickSpace={showKickSpace}
            showBan={showBan}
            onKickFromRoom={kickFromRoom}
            onKickFromSpace={kickFromSpace}
            onBan={banUser}
            onClose={() => setUserMenu(null)}
          />
        );
      })()}

      {pendingTakeover && (
        <Modal title="Stage in use" onClose={cancelTakeover}>
          <p style={{ marginBottom: 'var(--s-4)' }}>
            {pendingTakeover.holderName} is streaming on the stage. Take it over?
          </p>
          <div style={{ display: 'flex', gap: 'var(--s-2)', justifyContent: 'flex-end' }}>
            <button className="btn btn--ghost" onClick={cancelTakeover}>Cancel</button>
            <button className="btn btn--primary" onClick={confirmTakeover}>Take over</button>
          </div>
        </Modal>
      )}

      {incomingOffer && (
        <Modal title={incomingOffer.files ? 'Incoming files' : 'Incoming file'} onClose={fileTransfers.declineIncoming}>
          <p style={{ marginBottom: incomingOffer.files ? 'var(--s-2)' : 'var(--s-4)' }}>
            {incomingOffer.fromName} wants to send you{' '}
            {incomingOffer.files ? (
              <>
                <strong>{incomingOffer.files.length} files</strong> ({formatBytes(incomingOffer.size)}).
              </>
            ) : (
              <>
                <strong>{incomingOffer.name}</strong> ({formatBytes(incomingOffer.size)}).
              </>
            )}
          </p>
          {incomingOffer.files && (
            <ul className="incoming-files">
              {incomingOffer.files.slice(0, 5).map((f, i) => (
                <li key={i}>
                  <span className="incoming-files__name">{f.name}</span>
                  <span className="incoming-files__size">{formatBytes(f.size)}</span>
                </li>
              ))}
              {incomingOffer.files.length > 5 && (
                <li className="incoming-files__more">+{incomingOffer.files.length - 5} more</li>
              )}
            </ul>
          )}
          {incomingOffer.fromUserId !== '' && (
            <label className="incoming-trust">
              <input
                type="checkbox"
                checked={trustSender}
                onChange={(e) => setTrustSender(e.target.checked)}
              />
              Always accept files from {incomingOffer.fromName}
            </label>
          )}
          <div style={{ display: 'flex', gap: 'var(--s-2)', justifyContent: 'flex-end' }}>
            <button className="btn btn--ghost" onClick={fileTransfers.declineIncoming}>Decline</button>
            <button className="btn btn--primary" onClick={handleAcceptIncoming}>Accept</button>
          </div>
        </Modal>
      )}

      <TransferTray
        transfers={fileTransfers.transfers}
        onCancel={fileTransfers.cancel}
        onDismiss={fileTransfers.dismiss}
        onShowInFolder={fileTransfers.showInFolder}
      />

      {onboardingNeeded && (
        <Suspense fallback={null}>
          <WelcomeWizard onSubmit={handleOnboardingSubmit} />
        </Suspense>
      )}

      {spaceJoin.createSpaceOpen && (
        <Modal title="Create a Space" onClose={spaceJoin.closeCreateSpace}>
          <div className="field">
            <label className="field-label">Space Name</label>
            <input
              className="welcome__input"
              value={spaceJoin.newSpaceName}
              onChange={(e) => spaceJoin.setNewSpaceName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') spaceJoin.submitCreateSpace();
              }}
              placeholder="e.g. Midnight Lounge"
              autoFocus
              maxLength={32}
            />
          </div>
          <AdvancedConnectionSettings
            customSignalingUrl={spaceJoin.customSignalingUrl}
            setCustomSignalingUrl={spaceJoin.setCustomSignalingUrl}
            joinSecret={spaceJoin.joinSecret}
            setJoinSecret={spaceJoin.setJoinSecret}
            advancedOpen={spaceJoin.advancedOpen}
            setAdvancedOpen={spaceJoin.setAdvancedOpen}
            onEnterKeyDown={spaceJoin.submitCreateSpace}
          />
          <button
            className="btn btn--primary"
            onClick={spaceJoin.submitCreateSpace}
            disabled={!spaceJoin.newSpaceName.trim()}
          >
            Create Space
          </button>
        </Modal>
      )}

      {spaceJoin.joinSpaceOpen && (
        <Modal title="Join a Space" onClose={spaceJoin.closeJoinSpace}>
          <div className="field">
            <label className="field-label">Invite Code / Space ID</label>
            <input
              className="welcome__input"
              value={spaceJoin.inviteCodeInput}
              onChange={(e) => { spaceJoin.setInviteCodeInput(e.target.value); spaceJoin.setJoinError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void spaceJoin.submitJoinSpace();
              }}
              placeholder="e.g. midnight-lounge-7f8a3"
              autoFocus
              disabled={spaceJoin.joinChecking}
            />
          </div>
          {spaceJoin.joinError && <p className="field-error">{spaceJoin.joinError}</p>}
          <AdvancedConnectionSettings
            customSignalingUrl={spaceJoin.customSignalingUrl}
            setCustomSignalingUrl={spaceJoin.setCustomSignalingUrl}
            joinSecret={spaceJoin.joinSecret}
            setJoinSecret={spaceJoin.setJoinSecret}
            advancedOpen={spaceJoin.advancedOpen}
            setAdvancedOpen={spaceJoin.setAdvancedOpen}
            onEnterKeyDown={() => void spaceJoin.submitJoinSpace()}
          />
          <button
            className="btn btn--primary"
            onClick={() => void spaceJoin.submitJoinSpace()}
            disabled={!spaceJoin.inviteCodeInput.trim() || spaceJoin.joinChecking}
          >
            {spaceJoin.joinChecking ? 'Checking…' : 'Join Space'}
          </button>
        </Modal>
      )}

      {(createOpen || renameTarget) && (
        <Suspense fallback={null}>
          {createOpen && (
            <RoomModal
              title="Create a room"
              submitLabel="Create room"
              onSubmit={createRoom}
              onClose={() => setCreateOpen(false)}
            />
          )}
          {renameTarget && (
            <RoomModal
              title="Rename room"
              submitLabel="Save"
              initialLabel={renameTarget.label}
              initialIcon={renameTarget.icon}
              onSubmit={(label, icon) => renameRoom(renameTarget.id, label, icon)}
              onClose={() => setRenameTarget(null)}
            />
          )}
        </Suspense>
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
        <SettingsModal
          initialTab={settingsInitialTab}
          hasCamera={hasCamera}
          displayName={displayName}
          onChangeName={saveName}
          noiseSuppression={noiseSuppression}
          onChangeNoiseSuppression={applyNoiseSuppression}
          echoCancellation={echoCancellation}
          onChangeEchoCancellation={applyEchoCancellation}
          autoGainControl={autoGainControl}
          onChangeAutoGainControl={applyAutoGainControl}
          normalizeVoices={normalizeVoices}
          onChangeNormalizeVoices={applyNormalizeVoices}
          inputDevices={devices.inputs}
          outputDevices={devices.outputs}
          inputDeviceId={inputDeviceId}
          onChangeInputDevice={applyInputDevice}
          outputDeviceId={outputDeviceId}
          onChangeOutputDevice={applyOutputDevice}

          inputMode={inputMode}
          onChangeInputMode={applyInputMode}
          vadThreshold={vadThreshold}
          onChangeVadThreshold={applyVadThreshold}
          vadReleaseMs={vadReleaseMs}
          onChangeVadReleaseMs={applyVadReleaseMs}
          theme={theme}
          onChangeTheme={applyTheme}
          launchOnStartup={launchOnStartup}
          onChangeLaunchOnStartup={applyLaunchOnStartup}
          closeBehavior={closeBehavior}
          onChangeCloseBehavior={applyCloseBehavior}
          alwaysOnTop={alwaysOnTop}
          onChangeAlwaysOnTop={applyAlwaysOnTop}
          pushToTalkKey={pushToTalkKey}
          onChangePushToTalkKey={applyPushToTalkKey}
          pttMode={pttMode}
          onChangePttMode={applyPttMode}
          muteKey={muteKey}
          onChangeMuteKey={applyMuteKey}
          muteMode={muteMode}
          onChangeMuteMode={applyMuteMode}
          deafenKey={deafenKey}
          onChangeDeafenKey={applyDeafenKey}
          deafenMode={deafenMode}
          onChangeDeafenMode={applyDeafenMode}
          cameraKey={cameraKey}
          onChangeCameraKey={applyCameraKey}
          screenShareKey={screenShareKey}
          onChangeScreenShareKey={applyScreenShareKey}
          chatPanelKey={chatPanelKey}
          onChangeChatPanelKey={applyChatPanelKey}
          ttsToggleKey={ttsToggleKey}
          onChangeTtsToggleKey={applyTtsToggleKey}
          ttsStopKey={ttsStopKey}
          onChangeTtsStopKey={applyTtsStopKey}
          sfxEnabled={sfxEnabled}
          onChangeSfxEnabled={applySfxEnabled}
          sfxVolume={sfxVolume}
          onChangeSfxVolume={applySfxVolume}
          sfxJoinLeaveEnabled={sfxJoinLeaveEnabled}
          onChangeSfxJoinLeaveEnabled={applySfxJoinLeaveEnabled}
          sfxMuteEnabled={sfxMuteEnabled}
          onChangeSfxMuteEnabled={applySfxMuteEnabled}
          sfxMuteOtherEnabled={sfxMuteOtherEnabled}
          onChangeSfxMuteOtherEnabled={applySfxMuteOtherEnabled}
          sfxTransmitEnabled={sfxTransmitEnabled}
          onChangeSfxTransmitEnabled={applySfxTransmitEnabled}
          sfxChatEnabled={sfxChatEnabled}
          onChangeSfxChatEnabled={applySfxChatEnabled}
          sfxDeafenEnabled={sfxDeafenEnabled}
          onChangeSfxDeafenEnabled={applySfxDeafenEnabled}
          badgeNotificationsEnabled={badgeNotificationsEnabled}
          onChangeBadgeNotificationsEnabled={applyBadgeNotificationsEnabled}
          autoAcceptEnabled={autoAcceptEnabled}
          onChangeAutoAcceptEnabled={applyAutoAcceptEnabled}
          autoAcceptUsers={autoAcceptUsers}
          onRemoveTrustedUser={handleRemoveTrustedUser}
          soundboardEnabled={soundboardEnabled}
          onChangeSoundboardEnabled={applySoundboardEnabled}
          soundboardVolume={soundboardVolume}
          onChangeSoundboardVolume={applySoundboardVolume}
          soundboardAutoSyncEnabled={soundboardAutoSyncEnabled}
          onChangeSoundboardAutoSyncEnabled={applySoundboardAutoSyncEnabled}
          soundboardOwnClips={soundboardLibrary.ownClips}
          onAddSoundboardFiles={soundboardLibrary.addFiles}
          onRemoveSoundboardClip={soundboardLibrary.removeClip}
          onOpenSoundboardInbox={soundboardLibrary.openInboxFolder}
          micVolume={micVolume}
          onChangeMicVolume={applyMicVolume}
          outputVolume={outputVolume}
          onChangeOutputVolume={applyOutputVolume}

          cameraResolution={cameraResolution}
          onChangeCameraResolution={applyCameraResolution}
          cameraFramerate={cameraFramerate}
          onChangeCameraFramerate={applyCameraFramerate}
          screenResolution={screenResolution}
          onChangeScreenResolution={applyScreenResolution}
          screenFramerate={screenFramerate}
          onChangeScreenFramerate={applyScreenFramerate}
          videoQuality={videoQuality}
          onChangeVideoQuality={applyVideoQuality}
          uploadBudgetMbps={uploadBudgetMbps}
          onChangeUploadBudgetMbps={applyUploadBudgetMbps}
          audioQuality={audioQuality}
          onChangeAudioQuality={applyAudioQuality}
          uiScale={uiScale}
          onChangeUiScale={applyUiScale}
          hideSpaceBanner={hideSpaceBanner}
          onChangeHideSpaceBanner={applyHideSpaceBanner}
          chatFontScale={chatFontScale}
          onChangeChatFontScale={applyChatFontScale}
          chatPosition={chatPosition}
          onChangeChatPosition={applyChatPosition}
          chatWidthScale={chatWidthScale}
          onChangeChatWidthScale={applyChatWidthScale}
          sidebarWidthScale={sidebarWidthScale}
          onChangeSidebarWidthScale={(s) => handleSidebarResize(s, true)}
          chatTtsEnabled={chatTtsEnabled}
          onChangeChatTtsEnabled={applyChatTtsEnabled}
          chatTtsSpeakName={chatTtsSpeakName}
          onChangeChatTtsSpeakName={applyChatTtsSpeakName}
          chatTtsSpeakOwnMessages={chatTtsSpeakOwnMessages}
          onChangeChatTtsSpeakOwnMessages={applyChatTtsSpeakOwnMessages}
          chatTtsSpeakWhenFocused={chatTtsSpeakWhenFocused}
          onChangeChatTtsSpeakWhenFocused={applyChatTtsSpeakWhenFocused}
          reactionsEnabled={reactionsEnabled}
          onChangeReactionsEnabled={applyReactionsEnabled}
          voicePreference={localVoicePreference}
          onChangeVoicePreference={applyVoicePreference}
          analyserNode={mesh.analyserNode}
          onClose={() => { setSettingsOpen(false); setSettingsInitialTab('profile'); }}
          avatarDataUrl={localAvatarUrl}
          selfColor={selfColor}
          onChangeAvatar={handleSaveAvatar}
          accentColor={localAccentColor}
          onChangeAccent={handleSaveAccent}
        />
        </Suspense>
      )}

      {spaceSettingsTarget && (() => {
        const space = spaces.find((s) => s.id === spaceSettingsTarget);
        if (!space) return null;
        // Moderation actions ride the live socket, so they're only actionable for
        // the space we're currently connected to (same live-only rule as set-banner).
        const isLive = spaceSettingsTarget === currentSpaceId && signaling.status === 'connected';
        const onlineMembers = isLive
          ? signaling.spacePresence
              .filter((p) => p.leftAt === undefined && p.peer.userId !== userId)
              .map((p) => ({ userId: p.peer.userId, name: p.peer.displayName }))
          : [];
        return (
          <Suspense fallback={null}>
          <SpaceSettingsModal
            space={space}
            myUserId={userId}
            onSaveBanner={handleSaveBanner}
            onClaimOwnership={handleClaimOwnership}
            isLive={isLive}
            spaceLocked={isLive ? signaling.spaceLocked : space.locked ?? false}
            onToggleSpaceLock={toggleSpaceLock}
            onlineMembers={onlineMembers}
            onTransferOwnership={transferOwnership}
            onUnban={unbanUser}
            onSave={(name, url, secret) => {
              const oldSpaceId = spaceSettingsTarget;
              const isRename = space.name.trim().toLowerCase() !== name.trim().toLowerCase();

              if (isRename && signaling.status === 'connected' && oldSpaceId === currentSpaceId) {
                signaling.send({
                  type: 'rename-space',
                  spaceId: oldSpaceId,
                  newSpaceName: name.trim()
                });
              }
              updateSpaceSettings(oldSpaceId, name, url, secret);
              setSpaceSettingsTarget(null);
            }}
            onClose={() => setSpaceSettingsTarget(null)}
          />
          </Suspense>
        );
      })()}
    </div>
  );
}
