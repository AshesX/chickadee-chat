import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_ICE_SERVERS, capacityForType, type Room, type RoomType, type ThemeName } from '@chickadee/shared';
import { useSignaling } from './hooks/useSignaling';
import { usePeerMesh } from './hooks/usePeerMesh';
import { useRoomChat } from './hooks/useRoomChat';
import { useSpacePresence } from './hooks/useSpacePresence';
import { useSpaces, type AddSpaceResult } from './hooks/useSpaces';
import { useKeybindSync } from './hooks/useKeybindSync';
import { useVoiceActivation } from './hooks/useVoiceActivation';
import { useAudioActivity } from './hooks/useAudioActivity';
import { useNoiseExpander } from './hooks/useNoiseExpander';
import { useMediaDevices } from './hooks/useMediaDevices';
import { useSfxEvents } from './hooks/useSfxEvents';
import { useTraySync } from './hooks/useTraySync';
import { SELF_COLOR, useUserColors } from './lib/userColors';
import { setOutputSink } from './lib/audioContext';
import { store } from './lib/settings';
import { Sidebar } from './components/Sidebar';
import { RoomHeader } from './components/RoomHeader';
import { ControlBar } from './components/ControlBar';
import { ParticipantTile } from './components/ParticipantTile';
import { ScreenView } from './components/ScreenView';
import { ScreenSharePicker } from './components/ScreenSharePicker';
import { ChatPanel, type ChatMessage } from './components/ChatPanel';
import { ReactionPopover } from './components/ReactionPopover';
import { AudioDeviceMenu } from './components/AudioDeviceMenu';
import { InputModeMenu } from './components/InputModeMenu';
import { VideoMenu } from './components/VideoMenu';
import { WelcomeWizard } from './components/WelcomeWizard';
import { RoomModal } from './components/RoomModal';
import { SettingsModal } from './components/SettingsModal';
import { Logo } from './components/Logo';
import { generateBadgeOverlay } from './lib/trayIcon';
import { Modal } from './components/Modal';
import { playSfx } from './lib/sfx';
import { SpaceSettingsModal } from './components/SpaceSettingsModal';
import { AdvancedConnectionSettings } from './components/AdvancedConnectionSettings';
import { speakChatMessage, cancelSpeech } from './lib/tts';
import { initVoices } from './lib/voices';

interface ActiveScreen {
  key: string;
  displayName: string;
  isSelf: boolean;
  stream: MediaStream;
  /** Stable userId of the sharer (remote only), so the viewer can leave the stream. */
  userId?: string;
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'room';
}

export function App(): React.JSX.Element {
  const iceServers = useMemo(() => window.chickadee?.iceServers ?? DEFAULT_ICE_SERVERS, []);
  const signaling = useSignaling();
  const [noiseSuppression, setNoiseSuppression] = useState(() => store.getNoiseSuppression());
  const [echoCancellation, setEchoCancellation] = useState(() => store.getEchoCancellation());
  const [autoGainControl, setAutoGainControl] = useState(() => store.getAutoGainControl());
  const [normalizeVoices, setNormalizeVoices] = useState(() => store.getNormalizeVoices());
  const [inputDeviceId, setInputDeviceId] = useState(() => store.getInputDeviceId());
  const [outputDeviceId, setOutputDeviceId] = useState(() => store.getOutputDeviceId());
  const [micVolume, setMicVolume] = useState(() => store.getMicVolume());
  const [outputVolume, setOutputVolume] = useState(() => store.getOutputVolume());
  const [cameraResolution, setCameraResolution] = useState(() => store.getCameraResolution());
  const [cameraFramerate, setCameraFramerate] = useState(() => store.getCameraFramerate());
  const [screenResolution, setScreenResolution] = useState(() => store.getScreenResolution());
  const [screenFramerate, setScreenFramerate] = useState(() => store.getScreenFramerate());
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(() => store.getAvatarDataUrl());
  const [localVoicePreference, setLocalVoicePreference] = useState(() => store.getVoicePreference());
  const [localAccentColor, setLocalAccentColor] = useState(() => store.getAccentColor());
  const userId = useMemo(() => store.getUserId(), []);
  const mesh = usePeerMesh(signaling, iceServers, noiseSuppression, micVolume, cameraResolution, cameraFramerate, screenResolution, screenFramerate, echoCancellation, autoGainControl, inputDeviceId, localAvatarUrl, localVoicePreference, localAccentColor, userId);
  const colors = useUserColors(signaling.peers.map((p) => p.id));

  const [displayName, setDisplayName] = useState(() => store.getName());
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const leaveRoom = useCallback(() => {
    signaling.joinRoom(null);
    setCurrentRoomId(null);
  }, [signaling.joinRoom]);
  const { spaces, currentSpaceId, rooms, switchSpace, addSpace, deleteSpace, initFirstSpace, updateRooms, updateSpaceSettings } =
    useSpaces(leaveRoom, signaling.verifySpace);

  const [chatOpen, setChatOpen] = useState(() => store.getChatVisible());
  const [compactMode, setCompactMode] = useState(() => store.getCompactMode());
  const [voiceSectionCollapsed, setVoiceSectionCollapsed] = useState(() => store.getVoiceSectionCollapsed());
  const [videoSectionCollapsed, setVideoSectionCollapsed] = useState(() => store.getVideoSectionCollapsed());
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
  const leaveAllVideo = useCallback(() => setVideoSubscriptions([]), []);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Room | null>(null);
  const [spaceSettingsTarget, setSpaceSettingsTarget] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inputMode, setInputMode] = useState<'open' | 'voice' | 'ptt'>(() => store.getInputMode());
  const [vadThreshold, setVadThreshold] = useState(() => store.getVadThreshold());
  const [vadReleaseMs, setVadReleaseMs] = useState(() => store.getVadReleaseMs());
  const [openMicNoiseReductionEnabled, setOpenMicNoiseReductionEnabled] = useState(() => store.getOpenMicNoiseReductionEnabled());
  const [openMicThreshold, setOpenMicThreshold] = useState(() => store.getOpenMicThreshold());
  const [openMicReductionDb, setOpenMicReductionDb] = useState(() => store.getOpenMicReductionDb());
  const [openMicReleaseMs, setOpenMicReleaseMs] = useState(() => store.getOpenMicReleaseMs());
  // Persistent mute intent — a single master switch that survives input-mode
  // switches (open/voice/PTT). The mic gate (mesh.micEnabled) is forced off while
  // muted, regardless of mode; modes only manage the gate when unmuted.
  const [micMuted, setMicMuted] = useState(false);
  const [pushToTalkKey, setPushToTalkKey] = useState(() => store.getPushToTalkKey());
  const [pttMode, setPttMode] = useState<'hold' | 'toggle'>(() => store.getPttMode());
  const [muteKey, setMuteKey] = useState(() => store.getMuteKey());
  const [muteMode, setMuteMode] = useState<'hold' | 'toggle'>(() => store.getMuteMode());
  const [deafenKey, setDeafenKey] = useState(() => store.getDeafenKey());
  const [deafenMode, setDeafenMode] = useState<'hold' | 'toggle'>(() => store.getDeafenMode());
  const [cameraKey, setCameraKey] = useState(() => store.getCameraKey());
  const [screenShareKey, setScreenShareKey] = useState(() => store.getScreenShareKey());
  const [chatPanelKey, setChatPanelKey] = useState(() => store.getChatPanelKey());
  const [ttsToggleKey, setTtsToggleKey] = useState(() => store.getTtsToggleKey());
  const [ttsStopKey, setTtsStopKey] = useState(() => store.getTtsStopKey());
  const [windowFocused, setWindowFocused] = useState(() => document.hasFocus());
  // Distinct from focus: false only while minimized/hidden (signalled from main).
  // Gates incoming video decode so frames nobody can see aren't decoded.
  const [windowVisible, setWindowVisible] = useState(true);
  const [volumes, setVolumes] = useState<Record<string, number>>({});

  // Manual per-peer volume: update the live (peerId-keyed) map and persist by stable userId
  // so a boost sticks across restarts/reconnects (a new peer.id is re-seeded on join below).
  const handleVolumeChange = useCallback(
    (peerId: string, volume: number) => {
      setVolumes((prev) => ({ ...prev, [peerId]: volume }));
      const uid = signaling.peers.find((p) => p.id === peerId)?.userId;
      if (uid) store.setPeerVolume(uid, volume);
    },
    [signaling.peers],
  );

  // Click-to-silence: mute = volume 0, remembering the pre-mute level (by peer.id,
  // session-only) so a later un-silence restores it. Reuses the volume persistence path.
  const lastNonZeroVolumeRef = useRef<Record<string, number>>({});
  // Live SFX config read by togglePeerMute (defined above the sfx state), so the
  // "mute other" cue plays for both compact avatars and full-view tiles.
  const muteOtherSfxRef = useRef({ enabled: false, on: true, volume: 0.25 });
  const togglePeerMute = useCallback(
    (peerId: string) => {
      const cur = volumes[peerId] ?? 1;
      if (cur > 0) {
        lastNonZeroVolumeRef.current[peerId] = cur;
        handleVolumeChange(peerId, 0);
      } else {
        handleVolumeChange(peerId, lastNonZeroVolumeRef.current[peerId] ?? 1);
      }
      const sfx = muteOtherSfxRef.current;
      if (sfx.enabled && sfx.on) playSfx('mute-other', sfx.volume);
    },
    [volumes, handleVolumeChange],
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
  const [inputMenuOpen, setInputMenuOpen] = useState(false);
  const [outputMenuOpen, setOutputMenuOpen] = useState(false);
  const [inputModeMenuOpen, setInputModeMenuOpen] = useState(false);
  const [videoMenuOpen, setVideoMenuOpen] = useState(false);
  const [inputMenuAnchor, setInputMenuAnchor] = useState<DOMRect | null>(null);
  const [outputMenuAnchor, setOutputMenuAnchor] = useState<DOMRect | null>(null);
  const [inputModeMenuAnchor, setInputModeMenuAnchor] = useState<DOMRect | null>(null);
  const [videoMenuAnchor, setVideoMenuAnchor] = useState<DOMRect | null>(null);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const [reactionMenuAnchor, setReactionMenuAnchor] = useState<DOMRect | null>(null);
  const [settingsInitialTab, setSettingsInitialTab] = useState('profile');
  const [sfxEnabled, setSfxEnabled] = useState(() => store.getSfxEnabled());
  const [sfxVolume, setSfxVolume] = useState(() => store.getSfxVolume());
  const [sfxJoinLeaveEnabled, setSfxJoinLeaveEnabled] = useState(() => store.getSfxJoinLeaveEnabled());
  const [sfxMuteEnabled, setSfxMuteEnabled] = useState(() => store.getSfxMuteEnabled());
  const [sfxMuteOtherEnabled, setSfxMuteOtherEnabled] = useState(() => store.getSfxMuteOtherEnabled());
  const [sfxTransmitEnabled, setSfxTransmitEnabled] = useState(() => store.getSfxTransmitEnabled());
  const [sfxChatEnabled, setSfxChatEnabled] = useState(() => store.getSfxChatEnabled());
  const [sfxDeafenEnabled, setSfxDeafenEnabled] = useState(() => store.getSfxDeafenEnabled());
  muteOtherSfxRef.current = { enabled: sfxEnabled, on: sfxMuteOtherEnabled, volume: sfxVolume };
  const [deafened, setDeafened] = useState(false);
  const lastJoinTimeRef = useRef<number>(0);
  const reactionCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionHasEnteredPopoverRef = useRef(false);

  const startReactionCloseTimeout = useCallback(() => {
    if (reactionCloseTimeoutRef.current) clearTimeout(reactionCloseTimeoutRef.current);
    const delay = reactionHasEnteredPopoverRef.current ? 1000 : 3000;
    reactionCloseTimeoutRef.current = setTimeout(() => {
      setReactionMenuOpen(false);
    }, delay);
  }, []);

  const cancelReactionCloseTimeout = useCallback(() => {
    if (reactionCloseTimeoutRef.current) {
      clearTimeout(reactionCloseTimeoutRef.current);
      reactionCloseTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (reactionMenuOpen) {
      reactionHasEnteredPopoverRef.current = false;
    } else {
      if (reactionCloseTimeoutRef.current) {
        clearTimeout(reactionCloseTimeoutRef.current);
        reactionCloseTimeoutRef.current = null;
      }
    }
  }, [reactionMenuOpen]);

  useEffect(() => {
    return () => {
      if (reactionCloseTimeoutRef.current) clearTimeout(reactionCloseTimeoutRef.current);
    };
  }, []);

  const [badgeNotificationsEnabled, setBadgeNotificationsEnabled] = useState(() => store.getBadgeNotificationsEnabled());
  const [unreadCount, setUnreadCount] = useState(0);
  const [selfStatus, setSelfStatus] = useState<'online' | 'idle' | 'dnd'>(() => store.getStatus());
  const [uiScale, setUiScale] = useState(() => store.getUiScale());
  const [chatFontScale, setChatFontScale] = useState(() => store.getChatFontScale());
  const [chatPosition, setChatPosition] = useState(() => store.getChatPosition());
  const [chatWidthScale, setChatWidthScale] = useState(() => store.getChatWidthScale());
  const [sidebarWidthScale, setSidebarWidthScale] = useState(() => store.getSidebarWidthScale());
  const [chatTtsEnabled, setChatTtsEnabled] = useState(() => store.getChatTtsEnabled());
  const [chatTtsSpeakName, setChatTtsSpeakName] = useState(() => store.getChatTtsSpeakName());
  const [theme, setTheme] = useState<ThemeName>(() => store.getTheme());
  const [launchOnStartup, setLaunchOnStartup] = useState(() => store.getLaunchOnStartup());
  const [closeBehavior, setCloseBehavior] = useState<'quit' | 'tray'>(() => store.getCloseBehavior());
  const [alwaysOnTop, setAlwaysOnTop] = useState(() => store.getAlwaysOnTop());
  const [defaultVideoAction, setDefaultVideoAction] = useState<'camera' | 'screen'>(() => store.getDefaultVideoAction());

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

  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [joinSpaceOpen, setJoinSpaceOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [joinChecking, setJoinChecking] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customSignalingUrl, setCustomSignalingUrl] = useState('');
  const [joinSecret, setJoinSecret] = useState('');

  const chat = useRoomChat({
    signaling,
    displayName,
    colors,
    roomId: currentRoomId,
    onNewMessage: handleNewMessage,
  });
  // In gated modes (PTT / voice activation) a live mic means we're transmitting.
  const transmitting = inputMode !== 'open' && mesh.micEnabled;
  // What the mic button reflects: the persistent mute intent, independent of mode
  // and of the transient transmit gate (so it doesn't flicker with VAD/PTT).
  const micButtonOn = !micMuted;
  // Unified local "speaking" value driving the self ripple AND the broadcast, so
  // every client renders an identical ripple. Open mic: RMS-detect the live mic.
  // Gated modes: the transmit gate already is the speaking signal.
  const selfAudioSpeaking = useAudioActivity(
    inputMode === 'open' && mesh.micEnabled ? mesh.localStream : null,
  );
  const selfSpeaking = inputMode === 'open' ? selfAudioSpeaking : transmitting;
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
  // Voice rooms are audio-only: hide camera/screen-share controls and ignore their keybinds.
  const allowVideo = (currentRoom?.type ?? 'video') === 'video';
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

  // Maintain a continuous space-level WebSocket connection to the signaling server
  useEffect(() => {
    if (currentSpaceId && displayName && userId) {
      const activeSpace = spaces.find((s) => s.id === currentSpaceId);
      const url = activeSpace?.customSignalingUrl || (window.chickadee?.signalingUrl ?? 'ws://localhost:8080');
      const secret = activeSpace?.joinSecret || '';
      signaling.join(currentSpaceId, currentRoomId, displayName, userId, rooms, selfStatus, localAvatarUrl, localVoicePreference, localAccentColor, secret, url);
    } else {
      signaling.leave();
    }
    // We only want to re-establish the connection if the space, user, or name changes.
    // Room movement and status updates are sent dynamically over the active socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpaceId, userId, displayName, spaces]);
  
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

  function createRoom(label: string, icon: string, type: RoomType): void {
    const id = slugify(label);
    const next = rooms.some((r) => r.id === id) ? rooms : [...rooms, { id, label, icon, type }];
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

  /** Shared async handler for the Join-a-Space modal (button + Enter). */
  async function submitJoinSpace(): Promise<void> {
    const code = inviteCodeInput.trim();
    if (!code || joinChecking) return;
    setJoinError(null);
    setJoinChecking(true);
    const result = await addSpace(code, 'join', customSignalingUrl.trim() || undefined, joinSecret || undefined);
    setJoinChecking(false);
    if (result.ok) {
      setInviteCodeInput('');
      setJoinSpaceOpen(false);
      return;
    }
    setJoinError(
      result.reason === 'unreachable'
        ? "Couldn't reach the signaling server — check your connection."
        : 'That Space does not exist (or no one is currently in it).',
    );
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

  function applyNormalizeVoices(on: boolean): void {
    setNormalizeVoices(on);
    store.setNormalizeVoices(on);
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

  const applyMicVolume = useCallback((vol: number) => {
    setMicVolume(vol);
    store.setMicVolume(vol);
  }, []);

  const applyOutputVolume = useCallback((vol: number) => {
    setOutputVolume(vol);
    store.setOutputVolume(vol);
  }, []);

  const applyCameraResolution = useCallback((res: string) => {
    setCameraResolution(res);
    store.setCameraResolution(res);
  }, []);

  const applyCameraFramerate = useCallback((fps: string) => {
    setCameraFramerate(fps);
    store.setCameraFramerate(fps);
  }, []);

  const applyScreenResolution = useCallback((res: string) => {
    setScreenResolution(res);
    store.setScreenResolution(res);
  }, []);

  const applyScreenFramerate = useCallback((fps: string) => {
    setScreenFramerate(fps);
    store.setScreenFramerate(fps);
  }, []);

  const applyUiScale = useCallback((scale: number) => {
    setUiScale(scale);
    store.setUiScale(scale);
  }, []);

  const applyChatFontScale = useCallback((scale: number) => {
    setChatFontScale(scale);
    store.setChatFontScale(scale);
  }, []);

  const applyChatPosition = useCallback((pos: 'left' | 'right') => {
    setChatPosition(pos);
    store.setChatPosition(pos);
  }, []);

  const applyChatWidthScale = useCallback((scale: number) => {
    setChatWidthScale(scale);
    store.setChatWidthScale(scale);
  }, []);

  // Live chat-panel resize from the drag handle: update state every move, persist
  // only on release (commit) so we don't write to disk on every pointermove.
  const handleChatResize = useCallback((scale: number, commit: boolean) => {
    const clamped = Math.max(1.0, Math.min(2.0, scale));
    setChatWidthScale(clamped);
    if (commit) store.setChatWidthScale(clamped);
  }, []);

  // Unified sidebar width: drives the CSS var in full view and the OS dock width
  // (via IPC) in compact view. Persist on commit only.
  const handleSidebarResize = useCallback(
    (scale: number, commit: boolean) => {
      const clamped = Math.max(1.0, Math.min(2.0, scale));
      setSidebarWidthScale(clamped);
      if (compactMode) {
        window.chickadee?.windowControls?.setWindowWidth?.(Math.round(260 * clamped));
      }
      if (commit) store.setSidebarWidthScale(clamped);
    },
    [compactMode],
  );

  const applyInputMode = useCallback((mode: 'open' | 'voice' | 'ptt') => {
    setInputMode(mode);
    store.setInputMode(mode);
    // Mute intent (micMuted) intentionally persists across mode switches — the
    // baseline mic-gating effect re-derives the transmit gate for the new mode.
  }, []);

  const cycleInputMode = useCallback(() => {
    const order = ['open', 'voice', 'ptt'] as const;
    applyInputMode(order[(order.indexOf(inputMode) + 1) % order.length]);
  }, [inputMode, applyInputMode]);

  const toggleCompactMode = useCallback(() => {
    setCompactMode((c) => {
      const next = !c;
      store.setCompactMode(next);
      return next;
    });
  }, []);

  const toggleVoiceSection = useCallback(() => {
    setVoiceSectionCollapsed((c) => {
      const next = !c;
      store.setVoiceSectionCollapsed(next);
      return next;
    });
  }, []);

  const toggleVideoSection = useCallback(() => {
    setVideoSectionCollapsed((c) => {
      const next = !c;
      store.setVideoSectionCollapsed(next);
      return next;
    });
  }, []);

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
      Math.round(260 * sidebarWidthScale),
    );
    // sidebarWidthScale intentionally omitted: the dock width is set on toggle and
    // updated live via setWindowWidth in handleSidebarResize while already compact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compactMode]);

  const applyVadThreshold = useCallback((threshold: number) => {
    setVadThreshold(threshold);
    store.setVadThreshold(threshold);
  }, []);

  const applyVadReleaseMs = useCallback((ms: number) => {
    setVadReleaseMs(ms);
    store.setVadReleaseMs(ms);
  }, []);

  const applyOpenMicNoiseReductionEnabled = useCallback((on: boolean) => {
    setOpenMicNoiseReductionEnabled(on);
    store.setOpenMicNoiseReductionEnabled(on);
  }, []);

  const applyOpenMicThreshold = useCallback((threshold: number) => {
    setOpenMicThreshold(threshold);
    store.setOpenMicThreshold(threshold);
  }, []);

  const applyOpenMicReductionDb = useCallback((db: number) => {
    setOpenMicReductionDb(db);
    store.setOpenMicReductionDb(db);
  }, []);

  const applyOpenMicReleaseMs = useCallback((ms: number) => {
    setOpenMicReleaseMs(ms);
    store.setOpenMicReleaseMs(ms);
  }, []);

  function applyPushToTalkKey(key: string): void {
    setPushToTalkKey(key);
    store.setPushToTalkKey(key);
  }

  function applyPttMode(mode: 'hold' | 'toggle'): void {
    setPttMode(mode);
    store.setPttMode(mode);
  }

  function applyMuteKey(key: string): void {
    setMuteKey(key);
    store.setMuteKey(key);
  }

  function applyMuteMode(mode: 'hold' | 'toggle'): void {
    setMuteMode(mode);
    store.setMuteMode(mode);
  }

  function applyDeafenKey(key: string): void {
    setDeafenKey(key);
    store.setDeafenKey(key);
  }

  function applyDeafenMode(mode: 'hold' | 'toggle'): void {
    setDeafenMode(mode);
    store.setDeafenMode(mode);
  }

  function applyCameraKey(key: string): void {
    setCameraKey(key);
    store.setCameraKey(key);
  }

  function applyScreenShareKey(key: string): void {
    setScreenShareKey(key);
    store.setScreenShareKey(key);
  }

  function applyChatPanelKey(key: string): void {
    setChatPanelKey(key);
    store.setChatPanelKey(key);
  }

  function applyTtsToggleKey(key: string): void {
    setTtsToggleKey(key);
    store.setTtsToggleKey(key);
  }

  function applyTtsStopKey(key: string): void {
    setTtsStopKey(key);
    store.setTtsStopKey(key);
  }

  function applySfxEnabled(on: boolean): void {
    setSfxEnabled(on);
    store.setSfxEnabled(on);
  }

  function applySfxVolume(vol: number): void {
    setSfxVolume(vol);
    store.setSfxVolume(vol);
  }

  function applySfxJoinLeaveEnabled(on: boolean): void {
    setSfxJoinLeaveEnabled(on);
    store.setSfxJoinLeaveEnabled(on);
  }

  function applySfxMuteEnabled(on: boolean): void {
    setSfxMuteEnabled(on);
    store.setSfxMuteEnabled(on);
  }

  function applySfxMuteOtherEnabled(on: boolean): void {
    setSfxMuteOtherEnabled(on);
    store.setSfxMuteOtherEnabled(on);
  }

  function applySfxTransmitEnabled(on: boolean): void {
    setSfxTransmitEnabled(on);
    store.setSfxTransmitEnabled(on);
  }

  function applySfxChatEnabled(on: boolean): void {
    setSfxChatEnabled(on);
    store.setSfxChatEnabled(on);
  }

  function applySfxDeafenEnabled(on: boolean): void {
    setSfxDeafenEnabled(on);
    store.setSfxDeafenEnabled(on);
  }

  function applyBadgeNotificationsEnabled(on: boolean): void {
    setBadgeNotificationsEnabled(on);
    store.setBadgeNotificationsEnabled(on);
  }

  function applyChatTtsEnabled(on: boolean): void {
    setChatTtsEnabled(on);
    store.setChatTtsEnabled(on);
    if (!on) cancelSpeech(); // stop any in-progress speech when disabled
  }

  function applyChatTtsSpeakName(on: boolean): void {
    setChatTtsSpeakName(on);
    store.setChatTtsSpeakName(on);
  }

  function applyTheme(next: ThemeName): void {
    setTheme(next);
    store.setTheme(next);
  }

  const applyDefaultVideoAction = useCallback((action: 'camera' | 'screen') => {
    setDefaultVideoAction(action);
    store.setDefaultVideoAction(action);
  }, []);

  function applyLaunchOnStartup(on: boolean): void {
    setLaunchOnStartup(on);
    store.setLaunchOnStartup(on);
    void window.chickadee?.setLoginItem?.(on);
  }

  function applyCloseBehavior(next: 'quit' | 'tray'): void {
    setCloseBehavior(next);
    store.setCloseBehavior(next);
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

  // Warm the TTS voice list on startup so the first spoken message resolves the right voice.
  useEffect(() => {
    initVoices();
  }, []);

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
    onCameraToggle: () => { if (allowVideo) mesh.toggleCamera(); },
    screenShareKey,
    onScreenShareToggle: () => {
      if (!allowVideo) return;
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

  // Open-mic downward expander: softly attenuates background noise between
  // speech instead of hard-gating. The mic stays live; only the gain ramps.
  useNoiseExpander({
    active: inputMode === 'open' && openMicNoiseReductionEnabled && inRoom,
    threshold: openMicThreshold,
    reductionDb: openMicReductionDb,
    releaseMs: openMicReleaseMs,
    analyserNode: mesh.analyserNode,
    expanderGain: mesh.expanderGainNode,
  });

  // Audio/video device lists for Settings and the chevron menus.
  const devices = useMediaDevices(inRoom || settingsOpen || inputMenuOpen || outputMenuOpen || videoMenuOpen);
  const hasCamera = devices.videoInputs.length > 0;
  const defaultAction = hasCamera ? defaultVideoAction : 'screen';

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
            onVolumeChange={(v) => handleVolumeChange(peer.id, v)}
            onToggleMute={() => togglePeerMute(peer.id)}
            deafened={peer.deafened}
            normalize={normalizeVoices}
            screenSharing={!!peer.screenStreamId}
            windowVisible={mediaVisible}
            subscribed={subscribed}
            onJoinVideo={() => joinVideo(peer.userId)}
            onLeaveVideo={() => leaveVideo(peer.userId)}
          />
        );
      })}
    </>
  );

  // Active screen shares: ours + any peer sharing.
  const activeScreens: ActiveScreen[] = [];
  if (mesh.sharingScreen && mesh.localScreenStream) {
    activeScreens.push({ key: 'self-screen', displayName, isSelf: true, stream: mesh.localScreenStream });
  }
  for (const peer of signaling.peers) {
    const subscribed = videoSubscriptions.includes(peer.userId);
    const screen = subscribed && peer.screenStreamId ? mesh.remote[peer.id]?.screenStream : null;
    if (screen) {
      activeScreens.push({ key: `${peer.id}-screen`, displayName: peer.displayName, isSelf: false, stream: screen, userId: peer.userId });
    }
  }
  const presenting = activeScreens.length > 0;
  // How many peers have joined our stream (their subscriptions include our userId).
  const selfWatcherCount = signaling.peers.filter((p) => p.videoSubscriptions?.includes(userId)).length;

  const errors = [mesh.micError, mesh.cameraError, mesh.screenError, signaling.error].filter(Boolean);

  return (
    <div
      className={`app${windowFocused ? '' : ' app--unfocused'}${compactMode ? ' app--compact' : ''}`}
      style={{ '--sidebar-width-scale': sidebarWidthScale } as React.CSSProperties}
    >
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
        onCreateSpace={() =>
          openExpanded(() => {
            setCreateSpaceOpen(true);
            setAdvancedOpen(false);
            setCustomSignalingUrl('');
            setJoinSecret('');
          })
        }
        onJoinSpace={() =>
          openExpanded(() => {
            setJoinSpaceOpen(true);
            setAdvancedOpen(false);
            setCustomSignalingUrl('');
            setJoinSecret('');
          })
        }
        onDeleteSpace={deleteSpace}
        onSpaceSettings={(id) => openExpanded(() => setSpaceSettingsTarget(id))}
        selfStatus={selfStatus}
        onChangeStatus={applyStatus}
        voiceCollapsed={voiceSectionCollapsed}
        videoCollapsed={videoSectionCollapsed}
        onToggleVoiceSection={toggleVoiceSection}
        onToggleVideoSection={toggleVideoSection}
        compact={compactMode}
        onToggleCompact={toggleCompactMode}
        widthScale={sidebarWidthScale}
        onResize={handleSidebarResize}
        micEnabled={micButtonOn}
        hasMic={!!mesh.localStream}
        onToggleMic={handleToggleMic}
        deafened={deafened}
        onToggleDeafen={toggleDeafen}
        inputMode={inputMode}
        onCycleInputMode={cycleInputMode}
        hasVideoSubs={videoSubscriptions.length > 0}
        onLeaveAllVideo={leaveAllVideo}
        selfSpeaking={selfSpeaking}
        speakingUserIds={speakingUserIds}
        mutedUserIds={mutedUserIds}
        onTogglePeerMute={togglePeerMuteByUserId}
        onLeaveRoom={leaveRoom}
      />

      <div className="main">
        <RoomHeader
          room={currentRoom}
          count={totalInRoom}
          maxCount={currentRoomCap}
          chatOpen={chatOpen}
          onToggleChat={toggleChat}
          hasSpace={currentSpaceId !== null}
        />

        {inRoom ? (
          <>
            <div className="content-area">
              {chatOpen && chatPosition === 'left' && (
                <ChatPanel messages={chat.messages} onSend={chat.sendChat} chatFontScale={chatFontScale} chatPosition={chatPosition} chatWidthScale={chatWidthScale} onResize={handleChatResize} />
              )}

              {presenting ? (
                <div className="presentation">
                  <div className="stage" data-count={Math.min(activeScreens.length, 4)}>
                    {activeScreens.map((s) => (
                      <ScreenView
                        key={s.key}
                        displayName={s.displayName}
                        isSelf={s.isSelf}
                        stream={s.stream}
                        outputDeviceId={outputDeviceId}
                        windowVisible={mediaVisible}
                        watcherCount={s.isSelf ? selfWatcherCount : undefined}
                        onLeave={s.userId ? () => leaveVideo(s.userId!) : undefined}
                      />
                    ))}
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
              onInputMenu={(rect) => { setInputMenuAnchor(rect); setInputMenuOpen(true); setOutputMenuOpen(false); setInputModeMenuOpen(false); setVideoMenuOpen(false); setReactionMenuOpen(false); }}
              allowVideo={allowVideo}
              cameraEnabled={mesh.cameraEnabled}
              onToggleCamera={mesh.toggleCamera}
              sharingScreen={mesh.sharingScreen}
              onToggleShare={() => {
                setVideoMenuOpen(false);
                setReactionMenuOpen(false);
                mesh.sharingScreen ? mesh.stopScreenShare() : setPickerOpen(true);
              }}
              onVideoMenu={(rect) => { setVideoMenuAnchor(rect); setVideoMenuOpen(true); setInputMenuOpen(false); setOutputMenuOpen(false); setInputModeMenuOpen(false); setReactionMenuOpen(false); }}
              defaultAction={defaultAction}
              inputMode={inputMode}
              onCycleInputMode={cycleInputMode}
              onInputModeMenu={(rect) => { setInputModeMenuAnchor(rect); setInputModeMenuOpen(true); setInputMenuOpen(false); setOutputMenuOpen(false); setVideoMenuOpen(false); setReactionMenuOpen(false); }}
              onReactMenu={(rect) => {
                setReactionMenuAnchor(rect);
                setReactionMenuOpen(true);
                setInputMenuOpen(false);
                setOutputMenuOpen(false);
                setInputModeMenuOpen(false);
                setVideoMenuOpen(false);
              }}
              onLeave={leaveRoom}
              deafened={deafened}
              onToggleDeafen={toggleDeafen}
              onOutputMenu={(rect) => { setOutputMenuAnchor(rect); setOutputMenuOpen(true); setInputMenuOpen(false); setInputModeMenuOpen(false); setVideoMenuOpen(false); setReactionMenuOpen(false); }}
              onMouseEnterReact={cancelReactionCloseTimeout}
              onMouseLeaveReact={startReactionCloseTimeout}
            />

            {inputMenuOpen && inputMenuAnchor && (
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
                onOpenVoiceSettings={() => { setInputMenuOpen(false); setSettingsInitialTab('audio'); setSettingsOpen(true); }}
                onClose={() => setInputMenuOpen(false)}
                anchorRect={inputMenuAnchor}
              />
            )}
            {outputMenuOpen && outputMenuAnchor && (
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
                onOpenVoiceSettings={() => { setOutputMenuOpen(false); setSettingsInitialTab('audio'); setSettingsOpen(true); }}
                onClose={() => setOutputMenuOpen(false)}
                anchorRect={outputMenuAnchor}
              />
            )}
            {inputModeMenuOpen && inputModeMenuAnchor && (
              <InputModeMenu
                inputMode={inputMode}
                onSwitchMode={applyInputMode}
                pttMode={pttMode}
                onChangePttMode={applyPttMode}
                pushToTalkKey={pushToTalkKey}
                onChangePushToTalkKey={applyPushToTalkKey}
                vadThreshold={vadThreshold}
                onChangeVadThreshold={applyVadThreshold}
                openMicNoiseReductionEnabled={openMicNoiseReductionEnabled}
                onToggleOpenMicNoiseReduction={() => applyOpenMicNoiseReductionEnabled(!openMicNoiseReductionEnabled)}
                openMicThreshold={openMicThreshold}
                onChangeOpenMicThreshold={applyOpenMicThreshold}
                onOpenVoiceSettings={() => { setInputModeMenuOpen(false); setSettingsInitialTab('audio'); setSettingsOpen(true); }}
                onClose={() => setInputModeMenuOpen(false)}
                anchorRect={inputModeMenuAnchor}
              />
            )}
            {videoMenuOpen && videoMenuAnchor && (
              <VideoMenu
                cameraEnabled={mesh.cameraEnabled}
                onToggleCamera={mesh.toggleCamera}
                sharingScreen={mesh.sharingScreen}
                onToggleShare={() => {
                  setVideoMenuOpen(false);
                  mesh.sharingScreen ? mesh.stopScreenShare() : setPickerOpen(true);
                }}
                cameraResolution={cameraResolution}
                onChangeCameraResolution={applyCameraResolution}
                cameraFramerate={cameraFramerate}
                onChangeCameraFramerate={applyCameraFramerate}
                screenResolution={screenResolution}
                onChangeScreenResolution={applyScreenResolution}
                screenFramerate={screenFramerate}
                onChangeScreenFramerate={applyScreenFramerate}
                onOpenVideoSettings={() => { setVideoMenuOpen(false); setSettingsInitialTab('video'); setSettingsOpen(true); }}
                onClose={() => setVideoMenuOpen(false)}
                anchorRect={videoMenuAnchor}
                hasCamera={hasCamera}
              />
            )}
            {reactionMenuOpen && reactionMenuAnchor && (
              <ReactionPopover
                onReact={chat.react}
                onClose={() => setReactionMenuOpen(false)}
                anchorRect={reactionMenuAnchor}
                onMouseEnter={() => {
                  cancelReactionCloseTimeout();
                  reactionHasEnteredPopoverRef.current = true;
                }}
                onMouseLeave={startReactionCloseTimeout}
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

        {errors.length > 0 && (
          <div className="toasts">
            {errors.map((e, i) => (
              <div key={i} className="toast">
                {e}
              </div>
            ))}
          </div>
        )}
      </div>

      {pickerOpen && (
        <ScreenSharePicker
          onPick={(id, withAudio) => {
            setPickerOpen(false);
            mesh.startScreenShare(id, withAudio);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {onboardingNeeded && <WelcomeWizard onSubmit={handleOnboardingSubmit} />}

      {createSpaceOpen && (
        <Modal title="Create a Space" onClose={() => setCreateSpaceOpen(false)}>
          <div className="field">
            <label className="field-label">Space Name</label>
            <input
              className="welcome__input"
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newSpaceName.trim()) {
                  void addSpace(newSpaceName, 'create', customSignalingUrl.trim() || undefined, joinSecret || undefined);
                  setNewSpaceName('');
                  setCreateSpaceOpen(false);
                }
              }}
              placeholder="e.g. Midnight Lounge"
              autoFocus
              maxLength={32}
            />
          </div>
          <AdvancedConnectionSettings
            customSignalingUrl={customSignalingUrl}
            setCustomSignalingUrl={setCustomSignalingUrl}
            joinSecret={joinSecret}
            setJoinSecret={setJoinSecret}
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
            onEnterKeyDown={() => {
              if (newSpaceName.trim()) {
                void addSpace(newSpaceName, 'create', customSignalingUrl.trim() || undefined, joinSecret || undefined);
                setNewSpaceName('');
                setCreateSpaceOpen(false);
              }
            }}
          />
          <button
            className="modal-action"
            onClick={() => {
              void addSpace(newSpaceName, 'create', customSignalingUrl.trim() || undefined, joinSecret || undefined);
              setNewSpaceName('');
              setCreateSpaceOpen(false);
            }}
            disabled={!newSpaceName.trim()}
          >
            Create Space
          </button>
        </Modal>
      )}

      {joinSpaceOpen && (
        <Modal title="Join a Space" onClose={() => { setJoinSpaceOpen(false); setJoinError(null); }}>
          <div className="field">
            <label className="field-label">Invite Code / Space ID</label>
            <input
              className="welcome__input"
              value={inviteCodeInput}
              onChange={(e) => { setInviteCodeInput(e.target.value); setJoinError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitJoinSpace();
              }}
              placeholder="e.g. midnight-lounge-7f8a3"
              autoFocus
              disabled={joinChecking}
            />
          </div>
          {joinError && <p className="field-error">{joinError}</p>}
          <AdvancedConnectionSettings
            customSignalingUrl={customSignalingUrl}
            setCustomSignalingUrl={setCustomSignalingUrl}
            joinSecret={joinSecret}
            setJoinSecret={setJoinSecret}
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
            onEnterKeyDown={() => void submitJoinSpace()}
          />
          <button
            className="modal-action"
            onClick={() => void submitJoinSpace()}
            disabled={!inviteCodeInput.trim() || joinChecking}
          >
            {joinChecking ? 'Checking…' : 'Join Space'}
          </button>
        </Modal>
      )}

      {createOpen && (
        <RoomModal
          title="Create a room"
          submitLabel="Create room"
          showTypePicker
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
          initialType={renameTarget.type}
          onSubmit={(label, icon) => renameRoom(renameTarget.id, label, icon)}
          onClose={() => setRenameTarget(null)}
        />
      )}
      {settingsOpen && (
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
          defaultVideoAction={defaultVideoAction}
          onChangeDefaultVideoAction={applyDefaultVideoAction}
          inputMode={inputMode}
          onChangeInputMode={applyInputMode}
          vadThreshold={vadThreshold}
          onChangeVadThreshold={applyVadThreshold}
          vadReleaseMs={vadReleaseMs}
          onChangeVadReleaseMs={applyVadReleaseMs}
          openMicNoiseReductionEnabled={openMicNoiseReductionEnabled}
          onChangeOpenMicNoiseReductionEnabled={applyOpenMicNoiseReductionEnabled}
          openMicThreshold={openMicThreshold}
          onChangeOpenMicThreshold={applyOpenMicThreshold}
          openMicReductionDb={openMicReductionDb}
          onChangeOpenMicReductionDb={applyOpenMicReductionDb}
          openMicReleaseMs={openMicReleaseMs}
          onChangeOpenMicReleaseMs={applyOpenMicReleaseMs}
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
      )}

      {spaceSettingsTarget && (
        <SpaceSettingsModal
          space={spaces.find(s => s.id === spaceSettingsTarget)!}
          onSave={(name, url, secret) => {
            const oldSpaceId = spaceSettingsTarget;
            const space = spaces.find(s => s.id === oldSpaceId);
            const isRename = space && space.name.trim().toLowerCase() !== name.trim().toLowerCase();

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
              
              updateSpaceSettings(oldSpaceId, name, url, secret, newSpaceId);
            } else {
              updateSpaceSettings(oldSpaceId, name, url, secret);
            }
            setSpaceSettingsTarget(null);
          }}
          onClose={() => setSpaceSettingsTarget(null)}
        />
      )}
    </div>
  );
}
