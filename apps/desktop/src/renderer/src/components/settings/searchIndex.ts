import type { TabId, SearchEntry } from './types';

export const SETTINGS_SEARCH_INDEX: SearchEntry[] = [
  { label: 'Avatar', description: 'Set or change your profile picture', tab: 'profile', sectionId: 'section-avatar', keywords: ['photo', 'picture', 'image', 'crop', 'pfp'] },
  { label: 'Display Name', description: 'Change your name shown to others', tab: 'profile', sectionId: 'section-display-name', keywords: ['name', 'username', 'handle'] },
  { label: 'Input Device', description: 'Select your active microphone', tab: 'audio', sectionId: 'section-devices', keywords: ['microphone', 'mic', 'input', 'device'] },
  { label: 'Output Device', description: 'Select your speakers or headphones', tab: 'audio', sectionId: 'section-devices', keywords: ['speaker', 'headphones', 'output', 'device', 'playback'] },
  { label: 'Mic Volume', description: 'Adjust mic level and boost', tab: 'audio', sectionId: 'section-devices', keywords: ['gain', 'volume', 'boost', 'mic level'] },
  { label: 'Input Mode', description: 'Voice activation or Push-to-Talk', tab: 'audio', sectionId: 'section-input-mode', keywords: ['ptt', 'push to talk', 'voice activation', 'vad', 'transmit', 'sensitivity', 'threshold'] },
  { label: 'Push-to-Talk Key', description: 'System-wide hotkey for push-to-talk', tab: 'keybindings', sectionId: 'section-kb-voice', keywords: ['ptt', 'push to talk', 'keybind', 'hotkey', 'key', 'bind'] },
  { label: 'Mute Key', description: 'System-wide hotkey to mute/unmute mic', tab: 'keybindings', sectionId: 'section-kb-voice', keywords: ['mute', 'unmute', 'keybind', 'hotkey', 'key', 'bind'] },
  { label: 'Noise Suppression', description: 'Removes steady background noise while speaking', tab: 'audio', sectionId: 'section-processing', keywords: ['noise', 'background', 'suppress', 'filter', 'processing'] },
  { label: 'Echo Cancellation', description: 'Prevents mic from picking up speaker audio', tab: 'audio', sectionId: 'section-processing', keywords: ['echo', 'feedback', 'cancellation', 'processing'] },
  { label: 'Auto Gain Control', description: 'Automatically adjusts mic volume to a consistent level', tab: 'audio', sectionId: 'section-processing', keywords: ['agc', 'auto gain', 'automatic', 'level', 'processing'] },
  { label: 'Streaming Quality', description: 'Caps outbound bitrate for camera, screen, and voice', tab: 'video', sectionId: 'section-video-quality', keywords: ['quality', 'bitrate', 'bandwidth', 'data saver', 'cpu', 'performance', 'video', 'streaming'] },
  { label: 'Enable Camera', description: 'Turn the camera feature on or off', tab: 'video', sectionId: 'section-camera', keywords: ['camera', 'enable', 'disable', 'on', 'off', 'toggle', 'webcam', 'video'] },
  { label: 'Camera Resolution', description: 'Set streaming resolution for your camera', tab: 'video', sectionId: 'section-camera', keywords: ['camera', 'resolution', '720p', '1080p', '4k', 'quality', 'fps', 'framerate'] },
  { label: 'Screen Share Quality', description: 'Maximum resolution and framerate for screen sharing', tab: 'video', sectionId: 'section-screen-share', keywords: ['screen share', 'screen capture', 'resolution', 'framerate', 'fps', 'quality'] },
  { label: 'Default Video Button', description: 'Action when clicking Video button while inactive', tab: 'video', sectionId: 'section-video-default', keywords: ['default', 'video', 'camera', 'screen share', 'button'] },
  { label: 'Sound Effects', description: 'Enable or disable all audio cues', tab: 'sfx', keywords: ['sfx', 'sounds', 'audio cues', 'join', 'leave', 'beep', 'chime', 'notification'] },
  { label: 'SFX Volume', description: 'Sound effects volume', tab: 'sfx', keywords: ['sfx volume', 'sound effects volume', 'sounds'] },
  { label: 'Text-to-Speech', description: 'Speaks new messages when app is unfocused', tab: 'chat', sectionId: 'section-chat-settings', keywords: ['tts', 'text to speech', 'read aloud', 'voice', 'speak', 'speech'] },
  { label: 'Chat Voice', description: 'Your voice for others using TTS', tab: 'chat', sectionId: 'section-chat-settings', keywords: ['tts', 'voice', 'text to speech', 'preference', 'uk', 'female', 'male'] },
  { label: 'Chat Font Size', description: 'Chat message text size', tab: 'chat', sectionId: 'section-chat-settings', keywords: ['font', 'size', 'scale', 'text', 'chat', 'zoom'] },
  { label: 'Chat Width', description: 'Room chat panel width', tab: 'chat', sectionId: 'section-chat-settings', keywords: ['width', 'panel', 'chat', 'size', 'scale'] },
  { label: 'Chat Position', description: 'Dock chat to the left or right', tab: 'chat', sectionId: 'section-chat-settings', keywords: ['chat', 'position', 'left', 'right', 'layout', 'side'] },
  { label: 'Theme', description: 'Application color theme', tab: 'ui', keywords: ['theme', 'color', 'dark', 'light', 'swiss', 'alabaster', 'coffee', 'appearance', 'colours'] },
  { label: 'UI Scale', description: 'Adjust overall application size', tab: 'ui', keywords: ['scale', 'zoom', 'size', 'ui', 'interface', 'accessibility', 'dpi'] },
  { label: 'Launch on Startup', description: 'Start app when Windows boots', tab: 'app', keywords: ['startup', 'autostart', 'boot', 'launch', 'windows', 'login'] },
  { label: 'Minimize to Tray', description: 'Minimize to tray keeps voice connected', tab: 'app', keywords: ['tray', 'close', 'minimize', 'background', 'quit', 'system tray'] },
  { label: 'Always on Top', description: 'Pin window above other apps', tab: 'app', keywords: ['always on top', 'pin', 'window', 'focus', 'float'] },
  { label: 'Taskbar Badge', description: 'Show unread count on taskbar icon', tab: 'app', keywords: ['badge', 'taskbar', 'unread', 'notification', 'count'] },
  { label: 'Deafen Key', description: 'System-wide hotkey to deafen/undeafen', tab: 'keybindings', sectionId: 'section-kb-voice', keywords: ['deafen', 'keybind', 'hotkey', 'bind'] },
  { label: 'Camera Key', description: 'System-wide hotkey to toggle camera', tab: 'keybindings', sectionId: 'section-kb-video', keywords: ['camera', 'keybind', 'hotkey', 'video', 'bind'] },
  { label: 'Screen Share Key', description: 'System-wide hotkey to toggle screen share', tab: 'keybindings', sectionId: 'section-kb-video', keywords: ['screen share', 'keybind', 'hotkey', 'bind'] },
  { label: 'Chat Panel Key', description: 'System-wide hotkey to toggle chat', tab: 'keybindings', sectionId: 'section-kb-chat', keywords: ['chat', 'keybind', 'hotkey', 'bind'] },
  { label: 'TTS Toggle Key', description: 'System-wide hotkey to toggle TTS', tab: 'keybindings', sectionId: 'section-kb-chat', keywords: ['tts', 'keybind', 'hotkey', 'bind'] },
  { label: 'TTS Stop Key', description: 'System-wide hotkey to stop current TTS', tab: 'keybindings', sectionId: 'section-kb-chat', keywords: ['tts', 'stop', 'keybind', 'hotkey', 'bind'] },
];

export const SUBSECTIONS: Partial<Record<string, { label: string; id: string }[]>> = {
  profile: [
    { label: 'Avatar', id: 'section-avatar' },
    { label: 'Display Name', id: 'section-display-name' },
  ],
  audio: [
    { label: 'Devices', id: 'section-devices' },
    { label: 'Input Mode', id: 'section-input-mode' },
    { label: 'Processing', id: 'section-processing' },
  ],
  video: [
    { label: 'Streaming Quality', id: 'section-video-quality' },
    { label: 'Default Button Action', id: 'section-video-default' },
    { label: 'Camera', id: 'section-camera' },
    { label: 'Screen Share', id: 'section-screen-share' },
  ],
  chat: [
    { label: 'Chat Settings', id: 'section-chat-settings' },
    { label: 'Keybindings', id: 'section-chat-keybindings' },
  ],
  keybindings: [
    { label: 'Voice & Audio', id: 'section-kb-voice' },
    { label: 'Video', id: 'section-kb-video' },
    { label: 'Chat', id: 'section-kb-chat' },
  ],
};

export const TAB_LABELS: Record<TabId, string> = {
  profile: 'My Profile', audio: 'Voice & Audio', video: 'Video & Screen Share',
  sfx: 'Sound Effects', chat: 'Chat Settings', ui: 'User Interface',
  app: 'App Settings', keybindings: 'Keybindings',
};

export function getSearchResults(query: string): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SETTINGS_SEARCH_INDEX.filter(({ label, description, keywords }) =>
    label.toLowerCase().includes(q) ||
    (description ?? '').toLowerCase().includes(q) ||
    keywords.some((k) => k.toLowerCase().includes(q))
  ).slice(0, 6);
}
