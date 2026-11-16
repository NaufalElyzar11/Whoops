import {
  CANVAS_4R_HEIGHT,
  CANVAS_4R_WIDTH,
  DEFAULT_SLOTS,
  type CapturedPhoto,
  type FilterType,
  type PhotoFrame,
  type SlotAssignment,
} from '../types';
import { getFrameLayerOrder, getFrameSlots } from './frameLayouts';

export { CANVAS_4R_HEIGHT, CANVAS_4R_WIDTH };

// Match camera viewfinder & captures to each 4R frame slot so framing matches print 1:1
export const SLOT_ASPECT_RATIO =
  (DEFAULT_SLOTS[0].width * CANVAS_4R_WIDTH) / (DEFAULT_SLOTS[0].height * CANVAS_4R_HEIGHT);

export function getCssFilter(filter: FilterType, brightness: number): string {
  const b = Math.max(40, Math.min(160, 100 + brightness));
  switch (filter) {
    case 'bw':
      return `grayscale(100%) contrast(135%) brightness(${b}%)`;
    case 'grayscale':
      return `grayscale(100%) brightness(${b}%)`;
    case 'sepia':
      return `sepia(82%) contrast(105%) brightness(${b}%)`;
    case 'warm':
      return `sepia(24%) saturate(118%) brightness(${b + 3}%)`;
    case 'cool':
      return `saturate(95%) hue-rotate(12deg) contrast(104%) brightness(${b}%)`;
    case 'bright':
      return `brightness(${b + 14}%) contrast(102%)`;
    case 'contrast':
      return `contrast(128%) brightness(${b}%)`;
    default:
      return `brightness(${b}%)`;
  }
}

let cachedCtxFilterSupport: boolean | null = null;

// Probe whether CanvasRenderingContext2D.filter actually transforms pixels (old iPadOS Safari ignores it silently).
function supportsCanvasFilter(): boolean {
  if (cachedCtxFilterSupport !== null) return cachedCtxFilterSupport;
  try {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    const ctx = c.getContext('2d');
    if (!ctx || typeof ctx.filter !== 'string') {
      cachedCtxFilterSupport = false;
      return false;
    }
    ctx.filter = 'grayscale(100%)';
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 2, 2);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    cachedCtxFilterSupport = Math.abs(data[0] - data[1]) < 6;
  } catch {
    cachedCtxFilterSupport = false;
  }
  return cachedCtxFilterSupport;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function applyPixelFilterFallback(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  filter: FilterType,
  brightness: number
) {
  if (filter === 'original' && brightness === 0) return;
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;
  const bFactor = Math.max(40, Math.min(160, 100 + brightness + (filter === 'bright' ? 14 : filter === 'warm' ? 3 : 0))) / 100;
  const contrastFactor =
    filter === 'bw' ? 1.35 : filter === 'contrast' ? 1.28 : filter === 'sepia' ? 1.05 : filter === 'cool' ? 1.04 : filter === 'bright' ? 1.02 : 1;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    if (filter === 'bw' || filter === 'grayscale') {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum;
      g = lum;
      b = lum;
    } else if (filter === 'sepia') {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r * 0.18 + sr * 0.82;
      g = g * 0.18 + sg * 0.82;
      b = b * 0.18 + sb * 0.82;
    } else if (filter === 'warm') {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r * 0.76 + sr * 0.24 + 6;
      g = g * 0.76 + sg * 0.24 + 2;
      b = b * 0.76 + sb * 0.24 - 6;
    } else if (filter === 'cool') {
      r = r * 0.94 - 4;
      g = g * 0.98 + 2;
      b = b * 1.06 + 8;
    }

    if (contrastFactor !== 1) {
      r = (r - 128) * contrastFactor + 128;
      g = (g - 128) * contrastFactor + 128;
      b = (b - 128) * contrastFactor + 128;
    }

    d[i] = clampByte(r * bFactor);
    d[i + 1] = clampByte(g * bFactor);
    d[i + 2] = clampByte(b * bFactor);
  }

  ctx.putImageData(imgData, 0, 0);
}

export function buildFrameOverlaySvg(frame: PhotoFrame): string {
  const maskId = `cutout-${frame.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const slots = getFrameSlots(frame);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1205 1795">
    <defs>
      <mask id="${maskId}">
        <rect width="1205" height="1795" fill="white" />
        ${slots
          .map(
            (s) =>
              `<rect x="${s.x * 1205}" y="${s.y * 1795}" width="${s.width * 1205}" height="${s.height * 1795}" rx="20" fill="black" />`
          )
          .join('')}
      </mask>
    </defs>
    <rect width="1205" height="1795" fill="${frame.bg}" mask="url(#${maskId})" />
    <rect x="16" y="16" width="1173" height="1763" rx="28" fill="none" stroke="${frame.trim}" stroke-width="6" />
    ${slots
      .map(
        (s) =>
          `<rect x="${s.x * 1205}" y="${s.y * 1795}" width="${s.width * 1205}" height="${s.height * 1795}" rx="20" fill="none" stroke="${frame.trim}" stroke-width="5" />`
      )
      .join('')}
    <text x="602.5" y="1685" text-anchor="middle" font-family="Fredoka, ui-rounded, sans-serif" font-weight="700" font-size="64" fill="${frame.labelColor}">whoops!</text>
    <text x="602.5" y="1735" text-anchor="middle" font-family="Gaegu, cursive" font-size="34" fill="${frame.labelColor}">oops, we made a memory.</text>
  </svg>`;
}

export function createDemoPosePhoto(
  poseNum: number,
  targetRatio = SLOT_ASPECT_RATIO
): string {
  const palettes = [
    ['#F3D2DB', '#6D1D3A', 'Pose Ceria!'],
    ['#EFE2CE', '#3A231E', 'Finger Heart'],
    ['#E4A3B3', '#6D1D3A', 'Retro Cool'],
    ['#FDF7EE', '#8C2D4F', 'Bestie Vibes'],
    ['#F3D2DB', '#3A231E', 'Oops Haha!'],
    ['#DFCBB0', '#6D1D3A', 'Seoul Mood'],
  ];
  const [bg, fg, label] = palettes[(poseNum - 1) % palettes.length];
  const safeRatio = Math.max(0.5, Math.min(2.6, targetRatio));
  const c = document.createElement('canvas');
  c.width = 1000;
  c.height = Math.round(1000 / safeRatio);
  const ctx = c.getContext('2d');
  if (!ctx) return '';

  const cx = c.width / 2;
  const minDim = Math.min(c.width, c.height);
  const faceR = Math.round(minDim * 0.16);
  const faceY = Math.round(c.height * 0.41);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.fillStyle = fg + '1A';
  for (let x = 40; x < c.width; x += 48) {
    for (let y = 40; y < c.height; y += 48) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(cx, faceY, faceR, 0, Math.PI * 2);
  ctx.fill();

  const eyeOffX = faceR * 0.37;
  const eyeOffY = faceR * 0.17;
  const eyeR = Math.max(5, faceR * 0.11);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx - eyeOffX, faceY - eyeOffY, eyeR, 0, Math.PI * 2);
  ctx.arc(cx + eyeOffX, faceY - eyeOffY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = bg;
  ctx.lineWidth = Math.max(4, Math.round(faceR * 0.08));
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, faceY + faceR * 0.11, faceR * 0.37, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.fillStyle = fg;
  const fontPx = Math.max(28, Math.min(48, Math.round(minDim * 0.065)));
  ctx.font = `bold ${fontPx}px Fredoka, ui-rounded, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`#${poseNum} ${label}`, cx, Math.round(c.height * 0.82));

  return c.toDataURL('image/jpeg', 0.92);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function getCoverCropRect(srcW: number, srcH: number, targetRatio: number) {
  const srcRatio = srcW / srcH;
  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (srcRatio > targetRatio) {
    sw = srcH * targetRatio;
    sx = (srcW - sw) / 2;
  } else {
    sh = srcW / targetRatio;
    sy = (srcH - sh) / 2;
  }

  return { sx, sy, sw, sh };
}

/** Center-crops a live <video> frame to match the 4R slot aspect ratio so preview and print match 1:1. */
export function captureVideoSlotFrame(
  video: HTMLVideoElement,
  mirrored: boolean,
  targetRatio = SLOT_ASPECT_RATIO
): string {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return '';
  const { sx, sy, sw, sh } = getCoverCropRect(video.videoWidth, video.videoHeight, targetRatio);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw));
  c.height = Math.max(1, Math.round(sh));
  const ctx = c.getContext('2d');
  if (!ctx) return '';

  if (mirrored) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  mirrored: boolean
) {
  const { sx, sy, sw, sh } = getCoverCropRect(img.width, img.height, dw / dh);

  if (mirrored) {
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
  } else {
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }
}

export function createThumbnailFromCanvas(sourceCanvas: HTMLCanvasElement): string {
  const thumb = document.createElement('canvas');
  thumb.width = 400;
  thumb.height = Math.round((400 * CANVAS_4R_HEIGHT) / CANVAS_4R_WIDTH);
  const tctx = thumb.getContext('2d');
  if (!tctx) return '';
  tctx.drawImage(sourceCanvas, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL('image/jpeg', 0.78);
}

export async function buildComposite4R(
  photos: CapturedPhoto[],
  assignments: SlotAssignment[],
  frame: PhotoFrame
): Promise<{ fullPngDataUrl: string; previewThumbUrl: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_4R_WIDTH;
  canvas.height = CANVAS_4R_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const canUseCssFilter = supportsCanvasFilter();
  const layerOrder = getFrameLayerOrder(frame);
  const isPhotosOnTop = frame.type === 'image' && layerOrder === 'photos-on-top';

  const drawFrameArtwork = async () => {
    if (frame.type === 'image' && frame.overlayImageData) {
      const frameImg = await loadImage(frame.overlayImageData);
      ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
    } else {
      const svgBlob = new Blob([buildFrameOverlaySvg(frame)], {
        type: 'image/svg+xml;charset=utf-8',
      });
      const svgUrl = URL.createObjectURL(svgBlob);
      try {
        const frameImg = await loadImage(svgUrl);
        ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
    }
  };

  if (isPhotosOnTop) {
    await drawFrameArtwork();
  }

  const cornerRadius = frame.type === 'image' ? 0 : 20;
  const slots = getFrameSlots(frame);
  for (const s of slots) {
    const assign = assignments.find((a) => a.slotIndex === s.slotIndex);
    const photo = assign?.photoId ? photos.find((p) => p.id === assign.photoId) : null;
    if (!photo || !assign) continue;

    const img = await loadImage(photo.dataUrl);
    const dx = Math.floor(s.x * canvas.width);
    const dy = Math.floor(s.y * canvas.height);
    const dw = Math.ceil(s.width * canvas.width);
    const dh = Math.ceil(s.height * canvas.height);

    ctx.save();
    if (cornerRadius > 0) {
      ctx.beginPath();
      ctx.roundRect(dx, dy, dw, dh, cornerRadius);
      ctx.clip();
    } else {
      ctx.beginPath();
      ctx.rect(dx, dy, dw, dh);
      ctx.clip();
    }

    if (canUseCssFilter) {
      ctx.filter = getCssFilter(assign.filter, assign.brightness);
      drawCoverImage(ctx, img, dx, dy, dw, dh, assign.mirrored);
    } else {
      const slotCanvas = document.createElement('canvas');
      slotCanvas.width = dw;
      slotCanvas.height = dh;
      const sctx = slotCanvas.getContext('2d');
      if (sctx) {
        drawCoverImage(sctx, img, 0, 0, dw, dh, assign.mirrored);
        applyPixelFilterFallback(sctx, dw, dh, assign.filter, assign.brightness);
        ctx.drawImage(slotCanvas, dx, dy, dw, dh);
      } else {
        drawCoverImage(ctx, img, dx, dy, dw, dh, assign.mirrored);
      }
    }

    ctx.restore();
  }

  if (!isPhotosOnTop) {
    await drawFrameArtwork();
  }

  const fullPngDataUrl = canvas.toDataURL('image/png');
  const previewThumbUrl = createThumbnailFromCanvas(canvas);
  return { fullPngDataUrl, previewThumbUrl };
}

export async function compositeDoodleOntoOriginal(
  originalDataUrl: string,
  doodleLayerDataUrl: string | null,
  uploadedFullOrOverlayUrl: string | null
): Promise<{ fullPngDataUrl: string; previewThumbUrl: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_4R_WIDTH;
  canvas.height = CANVAS_4R_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const baseImg = await loadImage(originalDataUrl);
  ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

  if (uploadedFullOrOverlayUrl) {
    const uploadedImg = await loadImage(uploadedFullOrOverlayUrl);
    ctx.drawImage(uploadedImg, 0, 0, canvas.width, canvas.height);
  }

  if (doodleLayerDataUrl) {
    const doodleImg = await loadImage(doodleLayerDataUrl);
    ctx.drawImage(doodleImg, 0, 0, canvas.width, canvas.height);
  }

  return {
    fullPngDataUrl: canvas.toDataURL('image/png'),
    previewThumbUrl: createThumbnailFromCanvas(canvas),
  };
}

export function chunkDataUrl(dataUrl: string, chunkSize = 380000): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < dataUrl.length; i += chunkSize) {
    chunks.push(dataUrl.slice(i, i + chunkSize));
  }
  return chunks;
}
