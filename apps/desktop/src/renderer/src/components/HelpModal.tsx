import { Modal } from './Modal';

interface HelpModalProps {
  onClose: () => void;
}

const TIPS: string[] = [
  'Push-to-talk and mute/deafen hotkeys work system-wide — set them in Settings → Keybindings, and pick a key you’re not using in-game.',
  'Share a Space with friends using its invite code (Space banner → copy code) — no signup needed.',
  'Only one screen or camera can be the spotlighted "stage" at a time; screen shares claim it automatically, or spotlight your own camera from its tile.',
  'Watching the stage or someone’s camera is opt-in — click Watch to start receiving that video.',
  'Drag and drop a file onto someone’s name in the USERS list to send it directly, peer-to-peer.',
  'The Soundboard lets everyone in the room hear a clip instantly — enable it in Settings → Soundboard.',
  'Right-click a name to adjust their volume, silence them, or (for Space Owners/Moderators) moderate them.',
  'Your Space Owner (gold crown) can lock the Space or rooms, ban, and transfer ownership; each room also has a temporary Moderator (silver crown).',
];

export function HelpModal({ onClose }: HelpModalProps): React.JSX.Element {
  return (
    <Modal title="Help" onClose={onClose}>
      <ul className="help-modal__list">
        {TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </Modal>
  );
}
