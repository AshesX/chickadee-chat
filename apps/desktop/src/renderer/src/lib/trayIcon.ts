import logoUrl from '../assets/chickadee-logo.svg';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Rasterize the Chickadee logo into a PNG data URL for the system tray. Drawn
 * at the logo's full square viewBox (no crop) so it isn't distorted.
 */
export async function generateTrayIcon(size = 32): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  try {
    const img = await loadImage(logoUrl);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, size, size);
  } catch {
    return '';
  }
  return canvas.toDataURL('image/png');
}

/**
 * Generate a small red circle badge with a white number count inside.
 * Returns a PNG data URL suitable for a Windows taskbar overlay icon.
 */
export function generateBadgeOverlay(count: number, size = 16): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Red circle badge
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ef4444'; // Tailwind Red 500
  ctx.fill();

  // White text count
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const text = count > 99 ? '99+' : String(count);
  // Scale down font for longer text
  ctx.font = `bold ${text.length > 2 ? '7px' : '9px'} sans-serif`;
  
  // Minor vertical adjustment to align numbers beautifully
  ctx.fillText(text, size / 2, size / 2 + 0.5);

  return canvas.toDataURL('image/png');
}
