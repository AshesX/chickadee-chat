function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draw a placeholder app/tray icon — a purple→blue gradient rounded square with
 * the bird glyph — and return it as a PNG data URL. Swap for the real logo when
 * available.
 */
export function generateTrayIcon(size = 32): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#7c3aed');
  grad.addColorStop(1, '#3b82f6');
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, size, size, size * 0.22);
  ctx.fill();

  ctx.font = `${Math.round(size * 0.6)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🐦', size / 2, size * 0.56);

  return canvas.toDataURL('image/png');
}
