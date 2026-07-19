// Pure Space/room-list helpers shared by useSpaces and the space-rename flow.

/** Slugify a Space name + random suffix into a shareable, collision-resistant id. */
export function generateSpaceId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'space';
  const suffix = Math.random().toString(36).substring(2, 7);
  return `${slug}-${suffix}`;
}

/** Reconstruct a display name from an invite code (drops the random suffix). */
export function parseSpaceName(code: string): string {
  const parsed = code
    .split('-')
    .slice(0, -1)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return parsed || 'Joined Space';
}
