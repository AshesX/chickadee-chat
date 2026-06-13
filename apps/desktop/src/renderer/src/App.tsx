import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_ICE_SERVERS, MAX_PEERS_PER_ROOM, type Room } from '@chickadee/shared';
import { useSignaling } from './hooks/useSignaling';
import { usePeerMesh } from './hooks/usePeerMesh';
import { useSessionTimer } from './hooks/useSessionTimer';
import { useRoomChat } from './hooks/useRoomChat';
import { useSpacePresence } from './hooks/useSpacePresence';
import { useSpaces } from './hooks/useSpaces';
import { useKeybindSync } from './hooks/useKeybindSync';
import { useVoiceActivation } from './hooks/useVoiceActivation';
import { useNoiseExpander } from './hooks/useNoiseExpander';
import { useMediaDevices } from './hooks/useMediaDevices';
import { useSfxEvents } from './hooks/useSfxEvents';
import { useTraySync } from './hooks/useTraySync';
import { SELF_COLOR, useUserColors } from './lib/userColors';
import { store } from './lib/settings';
import { Sidebar } from './components/Sidebar';
import { RoomHeader } from './components/RoomHeader';
import { ControlBar } from './components/ControlBar';
import { ParticipantTile } from './components/ParticipantTile';
import { ScreenView } from './components/ScreenView';
import { ScreenSharePicker } from './components/ScreenSharePicker';
import { ChatPanel, type ChatMessage } from './components/ChatPanel';
import { VolumePopover } from './components/VolumePopover';
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
import { speakChatMessage, cancelSpeech } from './lib/tts';
import { initVoices } from './lib/voices';

interface ActiveScreen {
  key: string;
  displayName: string;
  isSelf: boolean;
  stream: MediaStream;
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'room';
}

export function App(): React.JSX.Element {
  const signalingUrl = useMemo(() => window.chickadee?.signalingUrl ?? 'ws://localhost:8080', []);
  const iceServers = useMemo(() => window.chickadee?.iceServers ?? DEFAULT_ICE_SERVERS, []);
  const signaling = useSignaling(signalingUrl);
  const [noiseSuppression, setNoiseSuppression] = useState(() => store.getNoiseSuppression());
  const [echoCancellation, setEchoCancellation] = useState(() => store.getEchoCancellation());
  const [autoGainControl, setAutoGainControl] = useState(() => store.getAutoGainControl());
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
  const mesh = usePeerMesh(signaling, iceServers, noiseSuppression, micVolume, cameraResolution, cameraFramerate, screenResolution, screenFramerate, echoCancellation, autoGainControl, inputDeviceId, localAvatarUrl, localVoicePreference);
  const colors = useUserColors(signaling.peers.map((p) => p.id));
  const timer = useSessionTimer(signaling.status === 'connected');

  const userId = useMemo(() => store.getUserId(), []);
  const [displayName, setDisplayName] = useState(() => store.getName());
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const leaveRoom = useCallback(() => {
    signaling.joinRoom(null);
    setCurrentRoomId(null);
  }, [signaling.joinRoom]);
  const { spaces, currentSpaceId, rooms, switchSpace, addSpace, deleteSpace, initFirstSpace, updateRooms } =
    useSpaces(leaveRoom);

  const [chatOpen, setChatOpen] = useState(() => store.getChatVisible());
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Room | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inputMode, setInputMode] = useState<'open' | 'voice' | 'ptt'>(() => store.getInputMode());
  const [vadThreshold, setVadThreshold] = useState(() => store.getVadThreshold());
  const [vadReleaseMs, setVadReleaseMs] = useState(() => store.getVadReleaseMs());
  const [openMicNoiseReductionEnabled, setOpenMicNoiseReductionEnabled] = useState(() => store.getOpenMicNoiseReductionEnabled());
  const [openMicThreshold, setOpenMicThreshold] = useState(() => store.getOpenMicThreshold());
  const [openMicReductionDb, setOpenMicReductionDb] = useState(() => store.getOpenMicReductionDb());
  // In voice mode the mic button pauses VAD (master mute) rather than toggling directly.
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [pushToTalkKey, setPushToTalkKey] = useState(() => store.getPushToTalkKey());
  const [pttMode, setPttMode] = useState<'hold' | 'toggle'>(() => store.getPttMode());
  const [muteKey, setMuteKey] = useState(() => store.getMuteKey());
  const [muteMode, setMuteMode] = useState<'hold' | 'toggle'>(() => store.getMuteMode());
  const [game, setGame] = useState<{ name: string; short: string } | null>(null);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [volumeOpen, setVolumeOpen] = useState(false);
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
  const [sfxTransmitEnabled, setSfxTransmitEnabled] = useState(() => store.getSfxTransmitEnabled());
  const [sfxChatEnabled, setSfxChatEnabled] = useState(() => store.getSfxChatEnabled());
  const [sfxDeafenEnabled, setSfxDeafenEnabled] = useState(() => store.getSfxDeafenEnabled());
  const [deafened, setDeafened] = useState(false);
  const lastJoinTimeRef = useRef<number>(0);
  const [badgeNotificationsEnabled, setBadgeNotificationsEnabled] = useState(() => store.getBadgeNotificationsEnabled());
  const [unreadCount, setUnreadCount] = useState(0);
  const [selfStatus, setSelfStatus] = useState<'online' | 'idle' | 'dnd'>(() => store.getStatus());
  const [uiScale, setUiScale] = useState(() => store.getUiScale());
  const [chatFontScale, setChatFontScale] = useState(() => store.getChatFontScale());
  const [chatPosition, setChatPosition] = useState(() => store.getChatPosition());
  const [chatWidthScale, setChatWidthScale] = useState(() => store.getChatWidthScale());
  const [chatTtsEnabled, setChatTtsEnabled] = useState(() => store.getChatTtsEnabled());
  const [chatTtsSpeakName, setChatTtsSpeakName] = useState(() => store.getChatTtsSpeakName());
  const [theme, setTheme] = useState<'midnight' | 'classic' | 'oled'>(() => store.getTheme());
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

  const chat = useRoomChat({
    signaling,
    displayName,
    colors,
    roomId: currentRoomId,
    onNewMessage: handleNewMessage,
  });
  // In gated modes (PTT / voice activation) a live mic means we're transmitting.
  const transmitting = inputMode !== 'open' && mesh.micEnabled;
  // What the mic button reflects: in voice mode it's the master-pause state.
  const micButtonOn = inputMode === 'voice' ? !voiceMuted : mesh.micEnabled;

  const onboardingNeeded = !displayName;
  const inRoom = currentRoomId !== null;
  const currentRoom = rooms.find((r) => r.id === currentRoomId) ?? null;
  const totalInRoom = inRoom ? signaling.peers.length + 1 : 0;
  const rawUsers = useSpacePresence(signaling, signaling.rooms);

  // Override self's avatar with the local value (immediate, no round-trip wait).
  // Peer avatars come from signaling state (Peer.avatarDataUrl), populated space-wide.
  const users = useMemo(
    () => rawUsers.map((u) => ({
      ...u,
      avatarUrl: (u.id === userId ? localAvatarUrl : u.avatarUrl) ?? undefined,
    })),
    [rawUsers, userId, localAvatarUrl],
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

  // Maintain a continuous space-level WebSocket connection to the signaling server
  useEffect(() => {
    if (currentSpaceId && displayName && userId) {
      signaling.join(currentSpaceId, currentRoomId, displayName, userId, rooms, selfStatus, localAvatarUrl, localVoicePreference);
    } else {
      signaling.leave();
    }
    // We only want to re-establish the connection if the space, user, or name changes.
    // Room movement and status updates are sent dynamically over the active socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpaceId, userId, displayName]);

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
      if (Date.now() - lastJoinTimeRef.current < 600) {
        return;
      }
      leaveRoom();
      return;
    }

    lastJoinTimeRef.current = Date.now();
    setCurrentRoomId(id);
    mesh.prepareMedia();
    signaling.joinRoom(id);
  }

  function createRoom(label: string, icon: string): void {
    const id = slugify(label);
    const next = rooms.some((r) => r.id === id) ? rooms : [...rooms, { id, label, icon }];
    updateRooms(next);
    setCreateOpen(false);
    if (signaling.status === 'connected' && currentSpaceId) {
      signaling.send({ type: 'update-rooms', spaceId: currentSpaceId, rooms: next });
    }
    joinRoom(id);
  }

  // Rename is cosmetic — the room `id` (signaling room) stays stable.
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

  function handleOnboardingSubmit(name: string, val: string, action: 'create' | 'join'): void {
    store.setName(name);
    setDisplayName(name);
    initFirstSpace(val, action);
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

  const applyInputMode = useCallback((mode: 'open' | 'voice' | 'ptt') => {
    setInputMode(mode);
    store.setInputMode(mode);
    setVoiceMuted(false); // reset the voice-mode pause when switching modes
  }, []);

  const cycleInputMode = useCallback(() => {
    const order = ['open', 'voice', 'ptt'] as const;
    applyInputMode(order[(order.indexOf(inputMode) + 1) % order.length]);
  }, [inputMode, applyInputMode]);

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

  function applyTheme(next: 'midnight' | 'classic' | 'oled'): void {
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
  useEffect(() => {
    const handleFocus = (): void => {
      setUnreadCount(0);
      cancelSpeech();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
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
    if (inputMode === 'voice') {
      // Master mute: pause/resume the VAD gate instead of toggling directly.
      setVoiceMuted((m) => {
        const next = !m;
        if (next) mesh.setMicEnabled(false);
        return next;
      });
      return;
    }
    mesh.toggleMic();
  }, [mesh.toggleMic, mesh.setMicEnabled, inputMode]);

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

  // Detected game (from the main-process scanner).
  useEffect(() => {
    return window.chickadee?.onGameDetected?.((g) => setGame(g));
  }, []);

  // Broadcast our game short-tag, deafen state, and status to the room (re-announces on join/reconnect).
  useEffect(() => {
    if (signaling.status === 'connected') {
      signaling.send({ type: 'game-state', game: game?.short ?? null });
      if (deafened) {
        signaling.send({ type: 'deafen-state', deafened: true });
      }
      signaling.send({ type: 'status-state', status: selfStatus });
    }
  }, [game, currentRoomId, signaling.status, signaling.send, deafened, selfStatus]);

  // Keep local rooms in sync with the signaling server's room list for this Space.
  useEffect(() => {
    if (signaling.status === 'connected' && signaling.rooms) {
      updateRooms(signaling.rooms);
    }
  }, [signaling.rooms, signaling.status, updateRooms]);

  const peerIdsStr = useMemo(() => signaling.peers.map((p) => p.id).sort().join(','), [signaling.peers]);

  useSfxEvents({ sfxEnabled, sfxVolume, sfxJoinLeaveEnabled, sfxMuteEnabled, sfxTransmitEnabled, currentRoomId, peerIdsStr, micEnabled: mesh.micEnabled, micButtonOn, inputMode, inRoom });

  useKeybindSync({
    inputMode,
    pushToTalkKey,
    pttMode,
    muteKey,
    muteMode,
    setMicEnabled: mesh.setMicEnabled,
    toggleMic: mesh.toggleMic,
    localStream: mesh.localStream,
  });

  // Voice-activation gate (open-mic mode). Paused while manually muted (voiceMuted).
  // Reads the pre-gate analyser so it sees the live mic even while muted.
  useVoiceActivation({
    active: inputMode === 'voice' && inRoom && !voiceMuted,
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
    analyserNode: mesh.analyserNode,
    expanderGain: mesh.expanderGainNode,
  });

  // Audio/video device lists for Settings and the chevron menus.
  const devices = useMediaDevices(inRoom || settingsOpen || inputMenuOpen || outputMenuOpen || videoMenuOpen);
  const hasCamera = devices.videoInputs.length > 0;
  const defaultAction = hasCamera ? defaultVideoAction : 'screen';

  useTraySync({ currentRoomLabel: currentRoom?.label ?? null, handleToggleMic, toggleDeafen });

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
        color={SELF_COLOR}
        transmitting={inputMode !== 'open' ? transmitting : undefined}
        gameTag={game?.short}
        deafened={deafened}
        avatarUrl={localAvatarUrl}
      />
      {signaling.peers.map((peer) => {
        const media = mesh.remote[peer.id];
        return (
          <ParticipantTile
            key={peer.id}
            displayName={peer.displayName}
            isSelf={false}
            muted={peer.muted}
            cameraOn={peer.cameraOn}
            cameraStream={media?.cameraStream ?? null}
            color={colors[peer.id] ?? SELF_COLOR}
            connectionState={media?.connectionState ?? 'new'}
            avatarUrl={peer.avatarDataUrl ?? null}
            gameTag={peer.game ?? undefined}
            volume={deafened ? 0 : Math.min(1, (volumes[peer.id] ?? 1) * outputVolume)}
            deafened={peer.deafened}
            outputDeviceId={outputDeviceId}
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
    const screen = peer.screenStreamId ? mesh.remote[peer.id]?.screenStream : null;
    if (screen) {
      activeScreens.push({ key: `${peer.id}-screen`, displayName: peer.displayName, isSelf: false, stream: screen });
    }
  }
  const presenting = activeScreens.length > 0;

  const errors = [mesh.micError, mesh.cameraError, mesh.screenError, signaling.error].filter(Boolean);

  return (
    <div className="app">
      {chat.floats.map((f) => (
        <div key={f.id} className="float-reaction" style={{ left: `${f.x}%` }}>
          {f.emoji}
        </div>
      ))}

      <Sidebar
        rooms={rooms}
        currentRoomId={currentRoomId}
        currentRoomCount={totalInRoom}
        onSelectRoom={joinRoom}
        onCreateRoom={() => setCreateOpen(true)}
        onRequestRename={(room) => setRenameTarget(room)}
        onRemoveRoom={removeRoom}
        users={users}
        selfName={displayName}
        selfColor={SELF_COLOR}
        selfAvatarUrl={localAvatarUrl}
        online={signaling.status === 'connected'}
        selfGame={game?.name}
        onOpenSettings={() => setSettingsOpen(true)}
        spaces={spaces}
        activeSpaceId={currentSpaceId}
        onSelectSpace={switchSpace}
        onCreateSpace={() => setCreateSpaceOpen(true)}
        onJoinSpace={() => setJoinSpaceOpen(true)}
        onDeleteSpace={deleteSpace}
        selfStatus={selfStatus}
        onChangeStatus={applyStatus}
      />

      <div className="main">
        <RoomHeader
          room={currentRoom}
          count={totalInRoom}
          maxCount={MAX_PEERS_PER_ROOM}
          timer={timer}
          game={game?.name}
          chatOpen={chatOpen}
          onToggleChat={toggleChat}
          hasSpace={currentSpaceId !== null}
        />

        {inRoom ? (
          <>
            <div className="content-area">
              {chatOpen && chatPosition === 'left' && (
                <ChatPanel messages={chat.messages} onSend={chat.sendChat} chatFontScale={chatFontScale} chatPosition={chatPosition} chatWidthScale={chatWidthScale} />
              )}

              {presenting ? (
                <div className="presentation">
                  <div className="stage" data-count={Math.min(activeScreens.length, 4)}>
                    {activeScreens.map((s) => (
                      <ScreenView key={s.key} displayName={s.displayName} isSelf={s.isSelf} stream={s.stream} outputDeviceId={outputDeviceId} />
                    ))}
                  </div>
                  <ul className="filmstrip">{tiles}</ul>
                </div>
              ) : (
                <ul className="grid" data-count={Math.min(totalInRoom, MAX_PEERS_PER_ROOM)}>
                  {tiles}
                </ul>
              )}

              {chatOpen && chatPosition === 'right' && (
                <ChatPanel messages={chat.messages} onSend={chat.sendChat} chatFontScale={chatFontScale} chatPosition={chatPosition} chatWidthScale={chatWidthScale} />
              )}
            </div>

            <ControlBar
              micEnabled={micButtonOn}
              hasMic={!!mesh.localStream}
              onToggleMic={handleToggleMic}
              onInputMenu={(rect) => { setInputMenuAnchor(rect); setInputMenuOpen(true); setOutputMenuOpen(false); setInputModeMenuOpen(false); setVideoMenuOpen(false); setReactionMenuOpen(false); }}
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
              onVolume={() => { setVolumeOpen((v) => !v); setReactionMenuOpen(false); }}
              onReactMenu={(rect) => {
                setReactionMenuAnchor(rect);
                setReactionMenuOpen(true);
                setInputMenuOpen(false);
                setOutputMenuOpen(false);
                setInputModeMenuOpen(false);
                setVideoMenuOpen(false);
                setVolumeOpen(false);
              }}
              onLeave={leaveRoom}
              deafened={deafened}
              onToggleDeafen={toggleDeafen}
              onOutputMenu={(rect) => { setOutputMenuAnchor(rect); setOutputMenuOpen(true); setInputMenuOpen(false); setInputModeMenuOpen(false); setVideoMenuOpen(false); setReactionMenuOpen(false); }}
            />

            {volumeOpen && (
              <VolumePopover
                peers={signaling.peers}
                colors={colors}
                volumes={volumes}
                onChange={(peerId, volume) => setVolumes((prev) => ({ ...prev, [peerId]: volume }))}
                onClose={() => setVolumeOpen(false)}
              />
            )}
            {inputMenuOpen && inputMenuAnchor && (
              <AudioDeviceMenu
                mode="input"
                devices={devices.inputs}
                selectedDeviceId={inputDeviceId}
                onSelectDevice={(id) => { setInputDeviceId(id); store.setInputDeviceId(id); }}
                volume={micVolume}
                onChangeVolume={applyMicVolume}
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
                vadThreshold={vadThreshold}
                onChangeVadThreshold={applyVadThreshold}
                openMicNoiseReductionEnabled={openMicNoiseReductionEnabled}
                onToggleOpenMicNoiseReduction={() => applyOpenMicNoiseReductionEnabled(!openMicNoiseReductionEnabled)}
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
                  addSpace(newSpaceName, 'create');
                  setNewSpaceName('');
                  setCreateSpaceOpen(false);
                }
              }}
              placeholder="e.g. Midnight Lounge"
              autoFocus
              maxLength={32}
            />
          </div>
          <button
            className="modal-action"
            onClick={() => {
              addSpace(newSpaceName, 'create');
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
        <Modal title="Join a Space" onClose={() => setJoinSpaceOpen(false)}>
          <div className="field">
            <label className="field-label">Invite Code / Space ID</label>
            <input
              className="welcome__input"
              value={inviteCodeInput}
              onChange={(e) => setInviteCodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inviteCodeInput.trim()) {
                  addSpace(inviteCodeInput, 'join');
                  setInviteCodeInput('');
                  setJoinSpaceOpen(false);
                }
              }}
              placeholder="e.g. midnight-lounge-7f8a3"
              autoFocus
            />
          </div>
          <button
            className="modal-action"
            onClick={() => {
              addSpace(inviteCodeInput, 'join');
              setInviteCodeInput('');
              setJoinSpaceOpen(false);
            }}
            disabled={!inviteCodeInput.trim()}
          >
            Join Space
          </button>
        </Modal>
      )}

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
          sfxEnabled={sfxEnabled}
          onChangeSfxEnabled={applySfxEnabled}
          sfxVolume={sfxVolume}
          onChangeSfxVolume={applySfxVolume}
          sfxJoinLeaveEnabled={sfxJoinLeaveEnabled}
          onChangeSfxJoinLeaveEnabled={applySfxJoinLeaveEnabled}
          sfxMuteEnabled={sfxMuteEnabled}
          onChangeSfxMuteEnabled={applySfxMuteEnabled}
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
          chatTtsEnabled={chatTtsEnabled}
          onChangeChatTtsEnabled={applyChatTtsEnabled}
          chatTtsSpeakName={chatTtsSpeakName}
          onChangeChatTtsSpeakName={applyChatTtsSpeakName}
          voicePreference={localVoicePreference}
          onChangeVoicePreference={applyVoicePreference}
          analyserNode={mesh.analyserNode}
          onClose={() => { setSettingsOpen(false); setSettingsInitialTab('profile'); }}
          avatarDataUrl={localAvatarUrl}
          selfColor={SELF_COLOR}
          onChangeAvatar={handleSaveAvatar}
        />
      )}
    </div>
  );
}
