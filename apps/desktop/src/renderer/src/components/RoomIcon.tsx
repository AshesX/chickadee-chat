import React from 'react';

// Eagerly load all SVGs in g:\Code\chickadee-chat\apps\desktop\src\renderer\src\assets\room-icons\
const svgModules = import.meta.glob('../assets/room-icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Extract and sort the list of available room icon names alphabetically
export const ROOM_ICONS = Object.keys(svgModules)
  .map((path) => {
    const parts = path.split('/');
    const filename = parts[parts.length - 1];
    return filename.replace('.svg', '');
  })
  .sort((a, b) => a.localeCompare(b));

/**
 * Retrieve raw SVG string for a given icon name.
 */
export function getSvgContent(name: string): string | undefined {
  const targetKey = Object.keys(svgModules).find((key) => key.endsWith(`/${name}.svg`));
  return targetKey ? svgModules[targetKey] : undefined;
}

interface RoomIconProps {
  name: string;
  size?: number;
  className?: string;
}

/**
 * Renders a custom room icon from the SVG files in assets/room-icons/.
 */
export function RoomIcon({ name, size = 24, className }: RoomIconProps): React.JSX.Element {
  const raw = getSvgContent(name);

  if (raw) {
    return (
      <span
        className={`room-icon-svg ${className || ''}`}
        style={{ width: size, height: size, display: 'inline-flex' }}
        dangerouslySetInnerHTML={{ __html: raw }}
      />
    );
  }

  // Fallback to text rendering (which will just be the string itself)
  return <span className={className}>{name}</span>;
}
