// Pure crop/zoom math for AvatarCropModal (and any future image-crop surface).
// Takes plain sizes/numbers — no DOM Image or canvas — so it's unit-testable.

export interface Offset {
  x: number;
  y: number;
}

export interface ImageSize {
  naturalWidth: number;
  naturalHeight: number;
}

/** Users may zoom in to at most this multiple of the minimum (cover) scale. */
export const MAX_ZOOM_FACTOR = 6;

/**
 * On-screen half-width/half-height of the crop window, fit ("contain") within
 * the square canvas while preserving the output's aspect ratio. For a 1:1
 * output this resolves to the full padded half-extent on both axes.
 */
export function cropWindowHalfExtents(
  outputWidth: number,
  outputHeight: number,
  canvasSize: number,
  padding: number,
): { halfW: number; halfH: number } {
  const maxHalf = canvasSize / 2 - padding;
  const aspect = outputWidth / outputHeight;
  return aspect >= 1 ? { halfW: maxHalf, halfH: maxHalf / aspect } : { halfW: maxHalf * aspect, halfH: maxHalf };
}

/** The smallest scale at which the image still covers the whole crop window. */
export function minCropScale(imgSize: ImageSize, cropHalfW: number, cropHalfH: number): number {
  return Math.max((cropHalfW * 2) / imgSize.naturalWidth, (cropHalfH * 2) / imgSize.naturalHeight);
}

/**
 * Clamp a pan offset so the crop window (half-extents `cropHalfW`/`cropHalfH`)
 * never shows past the image's edges at the given `scale`.
 */
export function clampOffset(
  off: Offset,
  scale: number,
  imgSize: ImageSize,
  cropHalfW: number,
  cropHalfH: number,
): Offset {
  const halfImgW = (imgSize.naturalWidth * scale) / 2;
  const halfImgH = (imgSize.naturalHeight * scale) / 2;
  const maxX = Math.max(0, halfImgW - cropHalfW);
  const maxY = Math.max(0, halfImgH - cropHalfH);
  return {
    x: Math.max(-maxX, Math.min(maxX, off.x)),
    y: Math.max(-maxY, Math.min(maxY, off.y)),
  };
}

/**
 * The source rectangle (in natural image pixels) that the crop window covers at
 * the current scale/offset — what drawImage() copies into the output canvas.
 */
export function cropSourceRect(
  imgSize: ImageSize,
  scale: number,
  off: Offset,
  cropHalfW: number,
  cropHalfH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const cropCX = imgSize.naturalWidth / 2 - off.x / scale;
  const cropCY = imgSize.naturalHeight / 2 - off.y / scale;
  const cropRW = cropHalfW / scale;
  const cropRH = cropHalfH / scale;
  return { sx: cropCX - cropRW, sy: cropCY - cropRH, sw: cropRW * 2, sh: cropRH * 2 };
}
