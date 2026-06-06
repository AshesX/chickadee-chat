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
