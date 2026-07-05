import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_AVATAR_DATA_URL_LEN } from '@chickadee/shared';
import { compressToBudget } from '../lib/compressToBudget';

const CANVAS_SIZE = 288;
/** Padding (px) between the on-screen crop window and the canvas edge. */
const CROP_WINDOW_PADDING = 16;

interface DragState {
  startX: number;
  startY: number;
  startOffX: number;
  startOffY: number;
}

interface Offset {
  x: number;
  y: number;
}

export interface AvatarCropModalProps {
  /** Output image width in px. Default 128 (today's avatar size). */
  outputWidth?: number;
  /** Output image height in px. Default 128 (today's avatar size). */
  outputHeight?: number;
  title?: string;
  saveLabel?: string;
  /** Byte-budget (base64 data-URL char length) to compress toward. Default matches the avatar cap. */
  maxDataUrlLen?: number;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

/**
 * On-screen half-width/half-height of the crop window, fit ("contain") within
 * the square canvas while preserving the output's aspect ratio. For the
 * default 128x128 (1:1) output this resolves to 128/128 — identical to the
 * previous fixed circular-crop radius.
 */
function cropWindowHalfExtents(outputWidth: number, outputHeight: number): { halfW: number; halfH: number } {
  const maxHalf = CANVAS_SIZE / 2 - CROP_WINDOW_PADDING;
  const aspect = outputWidth / outputHeight;
  return aspect >= 1 ? { halfW: maxHalf, halfH: maxHalf / aspect } : { halfW: maxHalf * aspect, halfH: maxHalf };
}

/**
 * Clamp a pan offset so the crop window (half-extents `cropHalfW`/`cropHalfH`)
 * never shows past the image's edges at the given `scale`. Takes plain
 * width/height rather than a full HTMLImageElement so it's testable without a
 * DOM Image.
 */
export function clampOffset(
  off: Offset,
  scale: number,
  imgSize: { naturalWidth: number; naturalHeight: number },
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

export function AvatarCropModal({
  outputWidth = 128,
  outputHeight = 128,
  title = 'Set Avatar',
  saveLabel = 'Save Avatar',
  maxDataUrlLen = MAX_AVATAR_DATA_URL_LEN,
  onSave,
  onCancel,
}: AvatarCropModalProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef<Offset>({ x: 0, y: 0 });
  const minScaleRef = useRef(1);
  const isDraggingRef = useRef(false);

  const { halfW: cropHalfW, halfH: cropHalfH } = cropWindowHalfExtents(outputWidth, outputHeight);
  const cropCornerRadius = Math.min(cropHalfW, cropHalfH) * 0.5;

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Keep refs in sync so canvas draw callbacks see latest values.
  scaleRef.current = scale;
  offsetRef.current = offset;
  isDraggingRef.current = isDragging;

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    const sc = scaleRef.current;
    const off = offsetRef.current;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Image
    const imgW = img.naturalWidth * sc;
    const imgH = img.naturalHeight * sc;
    ctx.drawImage(img, cx + off.x - imgW / 2, cy + off.y - imgH / 2, imgW, imgH);

    // Darkened region outside the crop area (even-odd rule cuts a hole).
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.roundRect(cx - cropHalfW, cy - cropHalfH, cropHalfW * 2, cropHalfH * 2, cropCornerRadius);
    ctx.fill('evenodd');
    ctx.restore();

    // Crop border
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - cropHalfW, cy - cropHalfH, cropHalfW * 2, cropHalfH * 2, cropCornerRadius);
    ctx.stroke();
    ctx.restore();
  }, [cropHalfW, cropHalfH, cropCornerRadius]);

  useEffect(() => {
    drawCanvas();
  }, [scale, offset, drawCanvas]);

  const loadFile = (file: File): void => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        const minSc = Math.max(
          (cropHalfW * 2) / img.naturalWidth,
          (cropHalfH * 2) / img.naturalHeight,
        );
        minScaleRef.current = minSc;
        scaleRef.current = minSc;
        offsetRef.current = { x: 0, y: 0 };
        setScale(minSc);
        setOffset({ x: 0, y: 0 });
        setImageSrc(src);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imgRef.current) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffX: offsetRef.current.x,
      startOffY: offsetRef.current.y,
    };
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || !imgRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newOff = clampOffset(
      { x: dragRef.current.startOffX + dx, y: dragRef.current.startOffY + dy },
      scaleRef.current,
      imgRef.current,
      cropHalfW,
      cropHalfH,
    );
    offsetRef.current = newOff;
    setOffset(newOff);
  };

  const handleMouseUp = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!imgRef.current) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const minSc = minScaleRef.current;
    const newScale = Math.max(minSc, Math.min(scaleRef.current * factor, minSc * 6));
    const newOff = clampOffset(offsetRef.current, newScale, imgRef.current, cropHalfW, cropHalfH);
    scaleRef.current = newScale;
    offsetRef.current = newOff;
    setScale(newScale);
    setOffset(newOff);
  };

  const handleZoomSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newScale = parseFloat(e.target.value);
    if (!imgRef.current) return;
    const newOff = clampOffset(offsetRef.current, newScale, imgRef.current, cropHalfW, cropHalfH);
    scaleRef.current = newScale;
    offsetRef.current = newOff;
    setScale(newScale);
    setOffset(newOff);
  };

  const handleSave = () => {
    const img = imgRef.current;
    if (!img) return;

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    const outCtx = outputCanvas.getContext('2d');
    if (!outCtx) return;

    const sc = scaleRef.current;
    const off = offsetRef.current;
    const cropCX = img.naturalWidth / 2 - off.x / sc;
    const cropCY = img.naturalHeight / 2 - off.y / sc;
    const cropRW = cropHalfW / sc;
    const cropRH = cropHalfH / sc;

    outCtx.drawImage(img, cropCX - cropRW, cropCY - cropRH, cropRW * 2, cropRH * 2, 0, 0, outputWidth, outputHeight);

    const encodeCanvas = (canvas: HTMLCanvasElement, quality: number): string => {
      const dataUrl = canvas.toDataURL('image/webp', quality);
      return dataUrl.startsWith('data:image/webp') ? dataUrl : canvas.toDataURL('image/jpeg', quality);
    };

    const downscale = (): string => {
      const smallCanvas = document.createElement('canvas');
      smallCanvas.width = Math.max(1, Math.round(outputWidth / 2));
      smallCanvas.height = Math.max(1, Math.round(outputHeight / 2));
      const smallCtx = smallCanvas.getContext('2d');
      if (!smallCtx) return encodeCanvas(outputCanvas, 0.4);
      smallCtx.drawImage(outputCanvas, 0, 0, smallCanvas.width, smallCanvas.height);
      return encodeCanvas(smallCanvas, 0.6);
    };

    const dataUrl = compressToBudget((quality) => encodeCanvas(outputCanvas, quality), maxDataUrlLen, undefined, downscale);
    onSave(dataUrl);
  };

  const minScale = minScaleRef.current;
  const maxScale = minScale * 6;

  return (
    <div
      className="backdrop backdrop--scrim backdrop--nested"
      onClick={onCancel}
    >
      <div className="avatar-crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="avatar-crop-modal__title">{title}</div>
        <div className="avatar-crop-modal__hint">
          {imageSrc ? 'Drag to reposition · Scroll or slider to zoom' : 'Choose an image to get started'}
        </div>

        {!imageSrc ? (
          <label className="avatar-crop-dropzone">
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) loadFile(file);
              }}
            />
            <div className="avatar-crop-dropzone__icon">📷</div>
            <div className="avatar-crop-dropzone__text">Click to choose a photo</div>
            <div className="avatar-crop-dropzone__subtext">JPG, PNG, GIF, WebP</div>
          </label>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="avatar-crop-canvas"
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            />

            <div className="avatar-crop-zoom-row">
              <span className="avatar-crop-zoom-label">−</span>
              <input
                type="range"
                className="avatar-crop-zoom"
                min={minScale}
                max={maxScale}
                step={(maxScale - minScale) / 200}
                value={scale}
                onChange={handleZoomSlider}
              />
              <span className="avatar-crop-zoom-label">+</span>
            </div>

            <label className="avatar-crop-change-link">
              Choose a different photo
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) loadFile(file);
                }}
              />
            </label>
          </>
        )}

        <div className="avatar-crop-actions">
          <button className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          {imageSrc && (
            <button className="btn btn--primary" onClick={handleSave}>
              {saveLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
