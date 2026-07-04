import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { DEFAULT_ICE_SERVERS, capacityForType, type Room, type ThemeName } from '@chickadee/shared';
import { useSignaling } from './hooks/useSignaling';
import { usePeerMesh } from './hooks/usePeerMesh';
import { useRoomChat } from './hooks/useRoomChat';
import { useSpacePresence } from './hooks/useSpacePresence';
import { useSpaces, type AddSpaceResult } from './hooks/useSpaces';
import { useSpaceJoin } from './hooks/useSpaceJoin';
import { useControlBarMenus } from './hooks/useControlBarMenus';
import { usePersistedState } from './hooks/usePersistedState';
import { useKeybindSync } from './hooks/useKeybindSync';
import { useVoiceActivation } from './hooks/useVoiceActivation';
import { useMediaDevices } from './hooks/useMediaDevices';
import { useSfxEvents } from './hooks/useSfxEvents';
import { useTraySync } from './hooks/useTraySync';
import { SELF_COLOR, useUserColors } from './lib/userColors';
import { setOutputSink } from './lib/audioContext';
import { store } from './lib/settings';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { ControlBar } from './components/ControlBar';
import { ParticipantTile } from './components/ParticipantTile';
import { ScreenView } from './components/ScreenView';
import { ChatPanel, type ChatMessage } from './components/ChatPanel';
import { ReactionPopover } from './components/ReactionPopover';
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
  // How many peers are watching OUR stage stream (their subscriptions include us) —
  // drives the adaptive upload budget for the high-quality stage encoding.
  const selfWatcherCount = useMemo(
    () => signaling.peers.filter((p) => p.videoSubscriptions?.includes(userId)).length,
    [signaling.peers, userId],
  );
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
  const { spaces, currentSpaceId, rooms, switchSpace, addSpace, deleteSpace, initFirstSpace, updateRooms, updateSpaceSettings } =
    useSpaces(leaveRoom, signaling.verifySpace);
  const spaceJoin = useSpaceJoin(addSpace);

  const [chatOpen, setChatOpen] = useState(() => store.getChatVisible());
  const [compactMode, setCompactMode] = useState(() => store.getCompactMode());
  const [roomsSectionCollapsed, setRoomsSectionCollapsed] = useState(() => store.getRoomsSectionCollapsed());
  // Spotlight (stage) take-over prompt: set when our claim lost to the current holder.
  const [pendingTakeover, setPendingTakeover] = useState<{ kind: 'screen' | 'camera'; holderName: string } | null>(null);
  // Our intent to hold the stage (survives a reconnect/room-switch, which clears the
  // server-side slot). Separate from the authoritative `myStageKind` above.
  const desiredStageKindRef = useRef<'screen' | 'camera' | null>(null);
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
  const [windowFocused, setWindowFocused] = useState(() => document.hasFocus());
  // Distinct from focus: false only while minimized/hidden (signalled from main).
  // Gates incoming video decode so frames nobody can see aren't decoded.
  const [windowVisible, setWindowVisible] = useState(true);
  const [volumes, setVolumes] = useState<Record<string, number>>({});

  // Mirror peers + volumes into refs so the per-tile callbacks below can stay
  // identity-stable (deps []). signaling.peers gets a fresh array reference on
  // every presence update (including each peer's speaking edge), so a callback
  // depending on it would change identity ~constantly and defeat ParticipantTile's
  // React.memo — exactly the high-frequency churn the memo exists to skip.
  const peersRef = useRef(signaling.peers);
  peersRef.current = signaling.peers;
  const volumesRef = useRef(volumes);
  volumesRef.current = volumes;

  // Manual per-peer volume: update the live (peerId-keyed) map and persist by stable userId
  // so a boost sticks across restarts/reconnects (a new peer.id is re-seeded on join below).
  const handleVolumeChange = useCallback(
    (peerId: string, volume: number) => {
      setVolumes((prev) => ({ ...prev, [peerId]: volume }));
      const uid = peersRef.current.find((p) => p.id === peerId)?.userId;
      if (uid) store.setPeerVolume(uid, volume);
    },
    [],
  );

  // Click-to-silence: mute = volume 0, remembering the pre-mute level (by peer.id,
  // session-only) so a later un-silence restores it. Reuses the volume persistence path.
  const lastNonZeroVolumeRef = useRef<Record<string, number>>({});
  // Live SFX config read by togglePeerMute (defined above the sfx state), so the
  // "mute other" cue plays for both compact avatars and full-view tiles.
  const muteOtherSfxRef = useRef({ enabled: false, on: true, volume: 0.25 });
  const togglePeerMute = useCallback(
    (peerId: string) => {
      const cur = volumesRef.current[peerId] ?? 1;
      if (cur > 0) {
        lastNonZeroVolumeRef.current[peerId] = cur;
        handleVolumeChange(peerId, 0);
      } else {
        handleVolumeChange(peerId, lastNonZeroVolumeRef.current[peerId] ?? 1);
      }
      const sfx = muteOtherSfxRef.current;
      if (sfx.enabled && sfx.on) playSfx('mute-other', sfx.volume);
    },
    [handleVolumeChange],
  );

  // Stable userIds of peers we've silenced (volume 0) — drives the compact avatar
  // mute overlay; plus a userId→session-id bridge so the sidebar can mute by userId.
  const mutedUserIds = useMemo(
    () => new Set(signaling.peers.filter((p) => (volumes[p.id] ?? 1) <= 0).map((p) => p.userId)),
    [signaling.peers, volumes],
  );
  const togglePeerMuteByUserId = useCallback(
    (uid: string) => {
      const pid = signaling.peers.find((p) => p.userId === uid)?.id;
      if (pid) togglePeerMute(pid);
    },
    [signaling.peers, togglePeerMute],
  );

  // Hydrate per-peer volume from persisted (userId-keyed) values when peers appear.
  // Fill-missing-only so an in-session edit is never clobbered.
  useEffect(() => {
    const saved = store.getPeerVolumes();
    setVolumes((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of signaling.peers) {
        if (p.id in next) continue;
        const v = p.userId ? saved[p.userId] : undefined;
        if (v !== undefined) {
          next[p.id] = v;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [signaling.peers]);

  // Output device is a single global property of the shared audio context (all
  // playback funnels through it), so set the sink once here — not per-peer tile.
  useEffect(() => {
    setOutputSink(outputDeviceId ?? '');
  }, [outputDeviceId]);

  // Control-bar chevron popovers + reaction popover (open flags, anchors, timeouts).
  const menus = useControlBarMenus();

  const [settingsInitialTab, setSettingsInitialTab] = useState('profile');
  const [sfxEnabled, applySfxEnabled] = usePersistedState(store.getSfxEnabled, store.setSfxEnabled);
  const [sfxVolume, applySfxVolume] = usePersistedState(store.getSfxVolume, store.setSfxVolume);
  const [sfxJoinLeaveEnabled, applySfxJoinLeaveEnabled] = usePersistedState(store.getSfxJoinLeaveEnabled, store.setSfxJoinLeaveEnabled);
  const [sfxMuteEnabled, applySfxMuteEnabled] = usePersistedState(store.getSfxMuteEnabled, store.setSfxMuteEnabled);
  const [sfxMuteOtherEnabled, applySfxMuteOtherEnabled] = usePersistedState(store.getSfxMuteOtherEnabled, store.setSfxMuteOtherEnabled);
  const [sfxTransmitEnabled, applySfxTransmitEnabled] = usePersistedState(store.getSfxTransmitEnabled, store.setSfxTransmitEnabled);
  const [sfxChatEnabled, applySfxChatEnabled] = usePersistedState(store.getSfxChatEnabled, store.setSfxChatEnabled);
  const [sfxDeafenEnabled, applySfxDeafenEnabled] = usePersistedState(store.getSfxDeafenEnabled, store.setSfxDeafenEnabled);
  muteOtherSfxRef.current = { enabled: sfxEnabled, on: sfxMuteOtherEnabled, volume: sfxVolume };
  const [deafened, setDeafened] = useState(false);
  const lastJoinTimeRef = useRef<number>(0);

  const [badgeNotificationsEnabled, applyBadgeNotificationsEnabled] = usePersistedState(store.getBadgeNotificationsEnabled, store.setBadgeNotificationsEnabled);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selfStatus, setSelfStatus] = useState<'online' | 'idle' | 'dnd'>(() => store.getStatus());
  const [uiScale, applyUiScale] = usePersistedState(store.getUiScale, store.setUiScale);
  const [chatFontScale, applyChatFontScale] = usePersistedState(store.getChatFontScale, store.setChatFontScale);
  const [chatPosition, applyChatPosition] = usePersistedState<'left' | 'right'>(store.getChatPosition, store.setChatPosition);
  const [chatWidthScale, setChatWidthScale] = useState(() => store.getChatWidthScale());
  const [sidebarWidthScale, setSidebarWidthScale] = useState(() => store.getSidebarWidthScale());
  const [chatTtsEnabled, setChatTtsEnabled] = useState(() => store.getChatTtsEnabled());
  const [chatTtsSpeakName, applyChatTtsSpeakName] = usePersistedState(store.getChatTtsSpeakName, store.setChatTtsSpeakName);
  const [theme, applyTheme] = usePersistedState<ThemeName>(store.getTheme, store.setTheme);
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

  const handleNewMessage = useCallback((msg: ChatMessage) => {
    if (document.hasFocus()) return;
    setUnreadCount((c) => c + 1);
    // Read the flag from the store (not React state) so this empty-deps callback stays stable.
    if (store.getChatTtsEnabled() && !msg.isReaction) {
      speakChatMessage(msg.senderName, msg.text, msg.voicePreference, store.getChatTtsSpeakName());
    }
  }, []);

  const chat = useRoomChat({
    signaling,
    displayName,
    colors,
    roomId: currentRoomId,
    onNewMessage: handleNewMessage,
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

  // Our effective accent color: the chosen one, else the default self gold.
  const selfColor = localAccentColor || SELF_COLOR;

  // Connection params for the active space — depend on these (not the whole
  // `spaces` array) so editing/deleting OTHER spaces doesn't tear down + reconnect
  // the active call (signaling.join always closes the socket and rebuilds the mesh).
  const activeSpace = spaces.find((s) => s.id === currentSpaceId);
  const activeSpaceSignalingUrl = activeSpace?.customSignalingUrl || '';
  const activeSpaceJoinSecret = activeSpace?.joinSecret || '';

  // Maintain a continuous space-level WebSocket connection to the signaling server
  useEffect(() => {
    if (currentSpaceId && displayName && userId) {
      const url = activeSpaceSignalingUrl || (window.chickadee?.signalingUrl ?? 'ws://localhost:8080');
      signaling.join(currentSpaceId, currentRoomId, displayName, userId, rooms, selfStatus, localAvatarUrl, localVoicePreference, localAccentColor, activeSpaceJoinSecret, url);
    } else {
      signaling.leave();
    }
    // We only want to re-establish the connection if the space, user, or name changes,
    // or the current space's connection params change. Room movement and status updates
    // are sent dynamically over the active socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpaceId, userId, displayName, activeSpaceSignalingUrl, activeSpaceJoinSecret]);

  // Listen for space renames from other clients
  useEffect(() => {
    const unsubscribe = signaling.subscribe((msg) => {
      if (msg.type === 'space-renamed') {
        const { spaceId, newSpaceId, newSpaceName } = msg;
        const exists = spaces.some((s) => s.id === spaceId);
        if (exists) {
          const existingSpace = spaces.find((s) => s.id === spaceId);
          if (existingSpace) {
            updateSpaceSettings(
              spaceId,
              newSpaceName,
              existingSpace.customSignalingUrl || '',
              existingSpace.joinSecret || '',
              newSpaceId
            );
          }
        }
      }
    });
    return unsubscribe;
  }, [signaling.subscribe, spaces, updateSpaceSettings]);

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
    const id = slugify(label);
    const next = rooms.some((r) => r.id === id) ? rooms : [...rooms, { id, label, icon, type: 'hybrid' as const }];
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

  // Unified sidebar width: drives the CSS var in full view and the OS dock width
  // (via IPC) in compact view. Persist on commit only.
  const handleSidebarResize = useCallback(
    (scale: number, commit: boolean) => {
      const clamped = Math.max(1.0, Math.min(2.0, scale));
      setSidebarWidthScale(clamped);
      if (compactMode) {
        window.chickadee?.windowControls?.setWindowWidth?.(Math.round(280 * clamped));
      }
      if (commit) store.setSidebarWidthScale(clamped);
    },
    [compactMode],
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

  // --- Spotlight (stage) actions ---
  const spotlightCamera = useCallback(() => {
    desiredStageKindRef.current = 'camera';
    signaling.claimSpotlight('camera');
  }, [signaling.claimSpotlight]);

  const unspotlight = useCallback(() => {
    desiredStageKindRef.current = null;
    signaling.releaseSpotlight();
  }, [signaling.releaseSpotlight]);

  const confirmTakeover = useCallback(() => {
    setPendingTakeover((p) => {
      if (p) {
        desiredStageKindRef.current = p.kind;
        signaling.claimSpotlight(p.kind, true);
      }
      return null;
    });
  }, [signaling.claimSpotlight]);

  // Sidebar actions that open a real modal (Settings, Create/Rename Room, Space
  // Settings, Create/Join Space) need real screen space, so expand the window
  // first if it's currently docked to the compact sidebar-only strip.
  const openExpanded = useCallback(
    (action: () => void) => {
      if (compactMode) {
        setCompactMode(false);
        store.setCompactMode(false);
      }
      action();
    },
    [compactMode],
  );

  useEffect(() => {
    window.chickadee?.windowControls?.setCompact?.(
      compactMode,
      Math.round(280 * sidebarWidthScale),
    );
    // sidebarWidthScale intentionally omitted: the dock width is set on toggle and
    // updated live via setWindowWidth in handleSidebarResize while already compact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compactMode]);

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

  // Reset unread count when window gets focus; also stop any queued TTS backlog.
  // Track focus state too: when the window is unfocused (e.g. on a 2nd monitor
  // while a game has focus) we freeze the per-frame CSS animations via .app--unfocused.
  useEffect(() => {
    const handleFocus = (): void => {
      setWindowFocused(true);
      setUnreadCount(0);
      cancelSpeech();
    };
    const handleBlur = (): void => setWindowFocused(false);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Track minimized/hidden state from main so we can pause incoming video decode.
  useEffect(() => {
    return window.chickadee?.onWindowVisibilityChange?.(setWindowVisible);
  }, []);

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

  // Auto-claim the single room stage when a screen share starts (a thumbnail-sized
  // screen is unreadable); release it when the share stops if we still held it.
  const prevSharingRef = useRef(false);
  useEffect(() => {
    const was = prevSharingRef.current;
    prevSharingRef.current = mesh.sharingScreen;
    if (mesh.sharingScreen && !was) {
      desiredStageKindRef.current = 'screen';
      signaling.claimSpotlight('screen');
    } else if (!mesh.sharingScreen && was && desiredStageKindRef.current === 'screen') {
      desiredStageKindRef.current = null;
      signaling.releaseSpotlight();
    }
  }, [mesh.sharingScreen, signaling.claimSpotlight, signaling.releaseSpotlight]);

  // Turning the camera off while it holds the stage frees the stage.
  const prevCamStageRef = useRef(false);
  useEffect(() => {
    const was = prevCamStageRef.current;
    prevCamStageRef.current = mesh.cameraEnabled;
    if (!mesh.cameraEnabled && was && desiredStageKindRef.current === 'camera') {
      desiredStageKindRef.current = null;
      signaling.releaseSpotlight();
    }
  }, [mesh.cameraEnabled, signaling.releaseSpotlight]);

  // If someone else holds/took the stage, drop our own desire to hold it.
  useEffect(() => {
    if (signaling.spotlightHolderId != null && signaling.spotlightHolderId !== signaling.selfId) {
      desiredStageKindRef.current = null;
    }
  }, [signaling.spotlightHolderId, signaling.selfId]);

  // A blocked (non-force) claim replies `spotlight-busy` → offer to take over.
  useEffect(() => {
    return signaling.subscribe((msg) => {
      if (msg.type === 'spotlight-busy') {
        const holder = peersRef.current.find((p) => p.id === msg.holderId);
        setPendingTakeover({
          kind: desiredStageKindRef.current ?? 'screen',
          holderName: holder?.displayName ?? 'Someone',
        });
      }
    });
  }, [signaling.subscribe]);

  // Re-claim the stage after a reconnect (new selfId) or room switch, which clears
  // the server-side slot but not our local media. No-op unless we still intend to hold it.
  useEffect(() => {
    if (signaling.status === 'connected' && currentRoomId && desiredStageKindRef.current) {
      signaling.claimSpotlight(desiredStageKindRef.current);
    }
  }, [signaling.selfId, currentRoomId, signaling.status, signaling.claimSpotlight]);

  // Keep local rooms in sync with the signaling server's room list for this Space.
  useEffect(() => {
    if (signaling.status === 'connected' && signaling.rooms) {
      updateRooms(signaling.rooms);
    }
  }, [signaling.rooms, signaling.status, updateRooms]);

  // Reset selected room if connection hits a terminal state (closed, room-full, or error)
  useEffect(() => {
    if (signaling.status === 'room-full' || signaling.status === 'error' || signaling.status === 'closed') {
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
          />
        );
      })}
    </>
  );

  // --- Stage (spotlight) derivation: at most ONE large tile per room ---
  // 0 active videos → Voice Lounge; videos but no spotlight → Gallery (both `.grid`);
  // someone spotlighted → Theater (`.presentation`: one stage tile + filmstrip).
  const isSelfStage = myStageKind != null;
  const stagePeer =
    signaling.spotlightHolderId != null && !isSelfStage
      ? signaling.peers.find((p) => p.id === signaling.spotlightHolderId) ?? null
      : null;
  const stageSubscribed = stagePeer ? videoSubscriptions.includes(stagePeer.userId) : true;
  // The stage stream (null for a peer we haven't opted into → large "Watch" placeholder).
  const stageStream: MediaStream | null = isSelfStage
    ? signaling.spotlightKind === 'screen'
      ? mesh.localScreenStream
      : mesh.localStream
    : stagePeer && stageSubscribed
      ? signaling.spotlightKind === 'screen'
        ? mesh.remote[stagePeer.id]?.screenStream ?? null
        : mesh.remote[stagePeer.id]?.cameraStream ?? null
      : null;
  const theater = isSelfStage || stagePeer != null;
  const stageName = isSelfStage ? displayName : stagePeer?.displayName ?? '';
  const stageUserId = stagePeer?.userId;
  const stageAvatarUrl = isSelfStage ? localAvatarUrl : stagePeer?.avatarDataUrl ?? null;

  const errors = [mesh.micError, mesh.cameraError, mesh.screenError, signaling.error].filter(Boolean);

  return (
    <div
      className={`app${windowFocused ? '' : ' app--unfocused'}${compactMode ? ' app--compact' : ''}`}
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
          onCreateRoom={() => openExpanded(() => setCreateOpen(true))}
          onRequestRename={(room) => openExpanded(() => setRenameTarget(room))}
          onRemoveRoom={removeRoom}
          users={users}
          selfName={displayName}
          selfColor={selfColor}
          selfAvatarUrl={localAvatarUrl}
          online={signaling.status === 'connected'}
          onOpenSettings={() => openExpanded(() => setSettingsOpen(true))}
          spaces={spaces}
          activeSpaceId={currentSpaceId}
          onSelectSpace={switchSpace}
          onCreateSpace={() => openExpanded(spaceJoin.openCreateSpace)}
          onJoinSpace={() => openExpanded(spaceJoin.openJoinSpace)}
          onDeleteSpace={deleteSpace}
          onSpaceSettings={(id) => openExpanded(() => setSpaceSettingsTarget(id))}
          selfStatus={selfStatus}
          onChangeStatus={applyStatus}
          roomsCollapsed={roomsSectionCollapsed}
          onToggleRoomsSection={toggleRoomsSection}
          compact={compactMode}
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
        />

        <div className="main">

        {inRoom ? (
          <>
            <div className="content-area">
              {chatOpen && chatPosition === 'left' && (
                <ChatPanel messages={chat.messages} onSend={chat.sendChat} chatFontScale={chatFontScale} chatPosition={chatPosition} chatWidthScale={chatWidthScale} onResize={handleChatResize} />
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
                        outputDeviceId={outputDeviceId}
                        windowVisible={mediaVisible}
                        watcherCount={isSelfStage ? selfWatcherCount : undefined}
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
                          <p>{stageName} is presenting</p>
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
                <ChatPanel messages={chat.messages} onSend={chat.sendChat} chatFontScale={chatFontScale} chatPosition={chatPosition} chatWidthScale={chatWidthScale} onResize={handleChatResize} />
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
            (menus.reactionMenuOpen && menus.reactionMenuAnchor) || null;

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

      {pendingTakeover && (
        <Modal title="Stage in use" onClose={() => setPendingTakeover(null)}>
          <p style={{ marginBottom: 'var(--s-4)' }}>
            {pendingTakeover.holderName} is presenting on the stage. Take it over?
          </p>
          <div style={{ display: 'flex', gap: 'var(--s-2)', justifyContent: 'flex-end' }}>
            <button className="btn btn--ghost" onClick={() => setPendingTakeover(null)}>Cancel</button>
            <button className="btn btn--primary" onClick={confirmTakeover}>Take over</button>
          </div>
        </Modal>
      )}

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
        return (
          <Suspense fallback={null}>
          <SpaceSettingsModal
            space={space}
            onSave={(name, url, secret, iconDataUrl) => {
              const oldSpaceId = spaceSettingsTarget;
              const isRename = space.name.trim().toLowerCase() !== name.trim().toLowerCase();

              if (isRename && signaling.status === 'connected' && oldSpaceId === currentSpaceId) {
                const tempSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'space';
                const suffix = Math.random().toString(36).substring(2, 7);
                const newSpaceId = `${tempSlug}-${suffix}`;

                signaling.send({
                  type: 'rename-space',
                  spaceId: oldSpaceId,
                  newSpaceId,
                  newSpaceName: name.trim()
                });

                updateSpaceSettings(oldSpaceId, name, url, secret, iconDataUrl, newSpaceId);
              } else {
                updateSpaceSettings(oldSpaceId, name, url, secret, iconDataUrl);
              }
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
