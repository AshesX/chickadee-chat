import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_ICE_SERVERS, MAX_PEERS_PER_ROOM, type Room } from '@chickadee/shared';
import { useSignaling } from './hooks/useSignaling';
import { usePeerMesh } from './hooks/usePeerMesh';
import { useSessionTimer } from './hooks/useSessionTimer';
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
import { SpaceSettingsModal } from './components/SpaceSettingsModal';
import { AdvancedConnectionSettings } from './components/AdvancedConnectionSettings';
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
  const mesh = usePeerMesh(signaling, iceServers, noiseSuppression, micVolume, cameraResolution, cameraFramerate, screenResolution, screenFramerate, echoCancellation, autoGainControl, inputDeviceId, localAvatarUrl, localVoicePreference, localAccentColor);
  const colors = useUserColors(signaling.peers.map((p) => p.id));
  const timer = useSessionTimer(signaling.status === 'connected');

  const userId = useMemo(() => store.getUserId(), []);
  const [displayName, setDisplayName] = useState(() => store.getName());
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const leaveRoom = useCallback(() => {
    signaling.joinRoom(null);
    setCurrentRoomId(null);
  }, [signaling.joinRoom]);
  const { spaces, currentSpaceId, rooms, switchSpace, addSpace, deleteSpace, initFirstSpace, updateRooms, updateSpaceSettings } =
    useSpaces(leaveRoom, signaling.verifySpace);

  const [chatOpen, setChatOpen] = useState(() => store.getChatVisible());
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
  // In voice mode the mic button pauses VAD (master mute) rather than toggling directly.
  const [voiceMuted, setVoiceMuted] = useState(false);
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
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [inputMenuOpen, setInputMenuOpen] = useState(false);
  const [outputMenuOpen, setOutputMenuOpen] = useState(false);
  const [inputModeMenuOpen, setInputModeMenuOpen] = useState(false);
  const [videoMenuOpen, setVideoMenuOpen] = useState(false);
  const [inputMenuAnchor, setInputMenuAnchor] = useState<DOMRect | null>(null);
  const [outputMenuAnchor, setOutputMenuAnchor] = useState<DOMRect | null>(null);
  const [inputModeMenuAnchor, setInputModeMenuAnchor] = useState<DOMRect | null>(null);
  const [videoMenuAnchor, setVideoMenuAnchor] = useState<DOMRect | null>(null);
  const [volumeMenuAnchor, setVolumeMenuAnchor] = useState<DOMRect | null>(null);
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

  const volumeCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeHasEnteredPopoverRef = useRef(false);

  const startVolumeCloseTimeout = useCallback(() => {
    if (volumeCloseTimeoutRef.current) clearTimeout(volumeCloseTimeoutRef.current);
    const delay = volumeHasEnteredPopoverRef.current ? 1000 : 3000;
    volumeCloseTimeoutRef.current = setTimeout(() => {
      setVolumeOpen(false);
    }, delay);
  }, []);

  const cancelVolumeCloseTimeout = useCallback(() => {
    if (volumeCloseTimeoutRef.current) {
      clearTimeout(volumeCloseTimeoutRef.current);
      volumeCloseTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (volumeOpen) {
      volumeHasEnteredPopoverRef.current = false;
    } else {
      if (volumeCloseTimeoutRef.current) {
        clearTimeout(volumeCloseTimeoutRef.current);
        volumeCloseTimeoutRef.current = null;
      }
    }
  }, [volumeOpen]);

  useEffect(() => {
    return () => {
      if (reactionCloseTimeoutRef.current) clearTimeout(reactionCloseTimeoutRef.current);
      if (volumeCloseTimeoutRef.current) clearTimeout(volumeCloseTimeoutRef.current);
    };
  }, []);

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
  // What the mic button reflects: in voice mode it's the master-pause state.
  const micButtonOn = inputMode === 'voice' ? !voiceMuted : mesh.micEnabled;
  // Unified local "speaking" value driving the self ripple AND the broadcast, so
  // every client renders an identical ripple. Open mic: RMS-detect the live mic.
  // Gated modes: the transmit gate already is the speaking signal.
  const selfAudioSpeaking = useAudioActivity(
    inputMode === 'open' && mesh.micEnabled ? mesh.localStream : null,
  );
  const selfSpeaking = inputMode === 'open' ? selfAudioSpeaking : transmitting;

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
    if (inputMode === 'voice') {
      setVoiceMuted(true);
      mesh.setMicEnabled(false);
    } else {
      mesh.setMicEnabled(false);
    }
  }, [inputMode, mesh.setMicEnabled]);

  const onMuteStop = useCallback(() => {
    if (inputMode === 'voice') {
      setVoiceMuted(false);
    } else {
      mesh.setMicEnabled(true);
    }
  }, [inputMode, mesh.setMicEnabled]);

  const onMuteToggle = useCallback(() => {
    handleToggleMic();
  }, [handleToggleMic]);

  useKeybindSync({
    inputMode,
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
    onCameraToggle: mesh.toggleCamera,
    screenShareKey,
    onScreenShareToggle: () => { mesh.sharingScreen ? mesh.stopScreenShare() : setPickerOpen(true); },
    chatPanelKey,
    onChatPanelToggle: toggleChat,
    ttsToggleKey,
    onTtsToggle: () => applyChatTtsEnabled(!chatTtsEnabled),
    ttsStopKey,
    onTtsStop: cancelSpeech,
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
    releaseMs: openMicReleaseMs,
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
        color={selfColor}
        speaking={selfSpeaking}
        deafened={deafened}
        avatarUrl={localAvatarUrl}
        screenSharing={mesh.sharingScreen}
        windowVisible={windowVisible}
      />
      {signaling.peers.map((peer) => {
        const media = mesh.remote[peer.id];
        return (
          <ParticipantTile
            key={peer.id}
            displayName={peer.displayName}
            isSelf={false}
            muted={peer.muted}
            speaking={peer.speaking}
            cameraOn={peer.cameraOn}
            cameraStream={media?.cameraStream ?? null}
            color={peer.accentColor || colors[peer.id] || SELF_COLOR}
            connectionState={media?.connectionState ?? 'new'}
            avatarUrl={peer.avatarDataUrl ?? null}
            volume={deafened ? 0 : (volumes[peer.id] ?? 1) * outputVolume}
            deafened={peer.deafened}
            normalize={normalizeVoices}
            screenSharing={!!peer.screenStreamId}
            windowVisible={windowVisible}
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
    <div className={`app${windowFocused ? '' : ' app--unfocused'}`}>
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
        selfColor={selfColor}
        selfAvatarUrl={localAvatarUrl}
        online={signaling.status === 'connected'}
        onOpenSettings={() => setSettingsOpen(true)}
        spaces={spaces}
        activeSpaceId={currentSpaceId}
        onSelectSpace={switchSpace}
        onCreateSpace={() => {
          setCreateSpaceOpen(true);
          setAdvancedOpen(false);
          setCustomSignalingUrl('');
          setJoinSecret('');
        }}
        onJoinSpace={() => {
          setJoinSpaceOpen(true);
          setAdvancedOpen(false);
          setCustomSignalingUrl('');
          setJoinSecret('');
        }}
        onDeleteSpace={deleteSpace}
        onSpaceSettings={(id) => setSpaceSettingsTarget(id)}
        selfStatus={selfStatus}
        onChangeStatus={applyStatus}
      />

      <div className="main">
        <RoomHeader
          room={currentRoom}
          count={totalInRoom}
          maxCount={MAX_PEERS_PER_ROOM}
          timer={timer}
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
                      <ScreenView key={s.key} displayName={s.displayName} isSelf={s.isSelf} stream={s.stream} outputDeviceId={outputDeviceId} windowVisible={windowVisible} />
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
              onInputMenu={(rect) => { setInputMenuAnchor(rect); setInputMenuOpen(true); setOutputMenuOpen(false); setInputModeMenuOpen(false); setVideoMenuOpen(false); setReactionMenuOpen(false); setVolumeOpen(false); }}
              cameraEnabled={mesh.cameraEnabled}
              onToggleCamera={mesh.toggleCamera}
              sharingScreen={mesh.sharingScreen}
              onToggleShare={() => {
                setVideoMenuOpen(false);
                setReactionMenuOpen(false);
                mesh.sharingScreen ? mesh.stopScreenShare() : setPickerOpen(true);
              }}
              onVideoMenu={(rect) => { setVideoMenuAnchor(rect); setVideoMenuOpen(true); setInputMenuOpen(false); setOutputMenuOpen(false); setInputModeMenuOpen(false); setReactionMenuOpen(false); setVolumeOpen(false); }}
              defaultAction={defaultAction}
              inputMode={inputMode}
              onCycleInputMode={cycleInputMode}
              onInputModeMenu={(rect) => { setInputModeMenuAnchor(rect); setInputModeMenuOpen(true); setInputMenuOpen(false); setOutputMenuOpen(false); setVideoMenuOpen(false); setReactionMenuOpen(false); setVolumeOpen(false); }}
              onVolume={(rect) => { setVolumeMenuAnchor(rect); setVolumeOpen((v) => !v); setReactionMenuOpen(false); setInputMenuOpen(false); setOutputMenuOpen(false); setInputModeMenuOpen(false); setVideoMenuOpen(false); }}
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
              onOutputMenu={(rect) => { setOutputMenuAnchor(rect); setOutputMenuOpen(true); setInputMenuOpen(false); setInputModeMenuOpen(false); setVideoMenuOpen(false); setReactionMenuOpen(false); setVolumeOpen(false); }}
              onMouseEnterReact={cancelReactionCloseTimeout}
              onMouseLeaveReact={startReactionCloseTimeout}
              onMouseEnterVolume={cancelVolumeCloseTimeout}
              onMouseLeaveVolume={startVolumeCloseTimeout}
            />

            {volumeOpen && volumeMenuAnchor && (
              <VolumePopover
                peers={signaling.peers}
                colors={colors}
                volumes={volumes}
                onChange={handleVolumeChange}
                onClose={() => setVolumeOpen(false)}
                anchorRect={volumeMenuAnchor}
                onMouseEnter={() => {
                  cancelVolumeCloseTimeout();
                  volumeHasEnteredPopoverRef.current = true;
                }}
                onMouseLeave={startVolumeCloseTimeout}
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
