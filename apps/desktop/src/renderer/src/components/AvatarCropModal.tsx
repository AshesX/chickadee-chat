import { useCallback, useEffect, useRef, useState } from 'react';

const CANVAS_SIZE = 288;
const CIRCLE_RADIUS = 128;
const OUTPUT_SIZE = 128;

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
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

function clampOffset(off: Offset, scale: number, img: HTMLImageElement): Offset {
  const halfImgW = (img.naturalWidth * scale) / 2;
  const halfImgH = (img.naturalHeight * scale) / 2;
  const maxX = Math.max(0, halfImgW - CIRCLE_RADIUS);
  const maxY = Math.max(0, halfImgH - CIRCLE_RADIUS);
  return {
    x: Math.max(-maxX, Math.min(maxX, off.x)),
    y: Math.max(-maxY, Math.min(maxY, off.y)),
  };
}

export function AvatarCropModal({ onSave, onCancel }: AvatarCropModalProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef<Offset>({ x: 0, y: 0 });
  const minScaleRef = useRef(1);
  const isDraggingRef = useRef(false);

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

    // Darkened region outside the crop circle (even-odd rule cuts a hole).
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.arc(cx, cy, CIRCLE_RADIUS, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();

    // Circle border
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }, []);

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
          (CIRCLE_RADIUS * 2) / img.naturalWidth,
          (CIRCLE_RADIUS * 2) / img.naturalHeight,
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
    const newOff = clampOffset(offsetRef.current, newScale, imgRef.current);
    scaleRef.current = newScale;
    offsetRef.current = newOff;
    setScale(newScale);
    setOffset(newOff);
  };

  const handleZoomSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newScale = parseFloat(e.target.value);
    if (!imgRef.current) return;
    const newOff = clampOffset(offsetRef.current, newScale, imgRef.current);
    scaleRef.current = newScale;
    offsetRef.current = newOff;
    setScale(newScale);
    setOffset(newOff);
  };

  const handleSave = () => {
    const img = imgRef.current;
    if (!img) return;

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = OUTPUT_SIZE;
    outputCanvas.height = OUTPUT_SIZE;
    const outCtx = outputCanvas.getContext('2d');
    if (!outCtx) return;

    const sc = scaleRef.current;
    const off = offsetRef.current;
    const cropCX = img.naturalWidth / 2 - off.x / sc;
    const cropCY = img.naturalHeight / 2 - off.y / sc;
    const cropR = CIRCLE_RADIUS / sc;

    outCtx.drawImage(img, cropCX - cropR, cropCY - cropR, cropR * 2, cropR * 2, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    let dataUrl = outputCanvas.toDataURL('image/webp', 0.85);
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = outputCanvas.toDataURL('image/jpeg', 0.88);
    }
    onSave(dataUrl);
  };

  const minScale = minScaleRef.current;
  const maxScale = minScale * 6;

  return (
    <div className="avatar-crop-overlay" onClick={onCancel}>
      <div className="avatar-crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="avatar-crop-modal__title">Set Avatar</div>
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
          <button className="avatar-crop-btn avatar-crop-btn--cancel" onClick={onCancel}>
            Cancel
          </button>
          {imageSrc && (
            <button className="avatar-crop-btn avatar-crop-btn--save" onClick={handleSave}>
              Save Avatar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
