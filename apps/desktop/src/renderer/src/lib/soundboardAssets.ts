// Eagerly resolve all preset clips bundled in assets/soundboard-presets/ — same
// build, same bytes, same hash on every peer, so presets need no P2P sync at
// all (only custom clips do). Binary audio needs `?url` (a resolved asset URL
// Vite emits as a separate hashed file), unlike RoomIcon.tsx's `?raw` SVGs
// (text, inlined) — proven to resolve correctly in the packaged file://
// build the same way lib/trayIcon.ts's plain logo import already does.
const clipModules = import.meta.glob('../assets/soundboard-presets/*.{ogg,mp3}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface PresetClip {
  id: string;
  name: string;
  url: string;
}

/** 'air-horn' -> 'Air Horn' — a cosmetic display-name guess, not a slug/identity. */
export function prettifyName(id: string): string {
  const words = id.replace(/[_-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Sound';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function idFromPath(path: string): string {
  const filename = path.split('/').pop() ?? path;
  return filename.replace(/\.(ogg|mp3)$/, '');
}

export const PRESET_CLIPS: PresetClip[] = Object.keys(clipModules)
  .map((path) => {
    const id = idFromPath(path);
    return { id, name: prettifyName(id), url: clipModules[path] };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export function getPresetUrl(id: string): string | undefined {
  return PRESET_CLIPS.find((c) => c.id === id)?.url;
}
