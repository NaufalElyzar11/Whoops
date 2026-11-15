import {
  DEFAULT_SLOTS,
  type CapturedPhoto,
  type FilterType,
  type PhotoFrame,
  type SlotAssignment,
} from '../types';

export const CANVAS_4R_WIDTH = 1205;
export const CANVAS_4R_HEIGHT = 1795;

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

export function buildFrameOverlaySvg(frame: PhotoFrame): string {
  const maskId = `cutout-${frame.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1205 1795">
    <defs>
      <mask id="${maskId}">
        <rect width="1205" height="1795" fill="white" />
        ${DEFAULT_SLOTS.map(
          (s) =>
            `<rect x="${s.x * 1205}" y="${s.y * 1795}" width="${s.width * 1205}" height="${s.height * 1795}" rx="20" fill="black" />`
        ).join('')}
      </mask>
    </defs>
    <rect width="1205" height="1795" fill="${frame.bg}" mask="url(#${maskId})" />
    <rect x="16" y="16" width="1173" height="1763" rx="28" fill="none" stroke="${frame.trim}" stroke-width="6" />
    ${DEFAULT_SLOTS.map(
      (s) =>
        `<rect x="${s.x * 1205}" y="${s.y * 1795}" width="${s.width * 1205}" height="${s.height * 1795}" rx="20" fill="none" stroke="${frame.trim}" stroke-width="5" />`
    ).join('')}
    <text x="602.5" y="1685" text-anchor="middle" font-family="Fredoka, ui-rounded, sans-serif" font-weight="700" font-size="64" fill="${frame.labelColor}">whoops!</text>
    <text x="602.5" y="1735" text-anchor="middle" font-family="Gaegu, cursive" font-size="34" fill="${frame.labelColor}">oops, we made a memory.</text>
  </svg>`;
}

export function createDemoPosePhoto(poseNum: number): string {
  const palettes = [
    ['#F3D2DB', '#6D1D3A', 'Pose Ceria!'],
    ['#EFE2CE', '#3A231E', 'Finger Heart'],
    ['#E4A3B3', '#6D1D3A', 'Retro Cool'],
    ['#FDF7EE', '#8C2D4F', 'Bestie Vibes'],
    ['#F3D2DB', '#3A231E', 'Oops Haha!'],
    ['#DFCBB0', '#6D1D3A', 'Seoul Mood'],
  ];
  const [bg, fg, label] = palettes[(poseNum - 1) % palettes.length];
  const c = document.createElement('canvas');
  c.width = 960;
  c.height = 720;
  const ctx = c.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);

  // Subtle decorative retro grid dots
  ctx.fillStyle = fg + '1A';
  for (let x = 40; x < c.width; x += 48) {
    for (let y = 40; y < c.height; y += 48) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Cute smiley illustration
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(480, 310, 140, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(428, 286, 16, 0, Math.PI * 2);
  ctx.arc(532, 286, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = bg;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(480, 326, 52, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.fillStyle = fg;
  ctx.font = 'bold 48px Fredoka, ui-rounded, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`#${poseNum} ${label}`, 480, 570);

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

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  mirrored: boolean
) {
  const imgRatio = img.width / img.height;
  const targetRatio = dw / dh;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;

  if (imgRatio > targetRatio) {
    sw = img.height * targetRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / targetRatio;
    sy = (img.height - sh) / 2;
  }

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

  for (const s of DEFAULT_SLOTS) {
    const assign = assignments.find((a) => a.slotIndex === s.slotIndex);
    const photo = assign?.photoId ? photos.find((p) => p.id === assign.photoId) : null;
    if (!photo || !assign) continue;

    const img = await loadImage(photo.dataUrl);
    const dx = s.x * canvas.width;
    const dy = s.y * canvas.height;
    const dw = s.width * canvas.width;
    const dh = s.height * canvas.height;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(dx, dy, dw, dh, 20);
    ctx.clip();
    ctx.filter = getCssFilter(assign.filter, assign.brightness);
    drawCoverImage(ctx, img, dx, dy, dw, dh, assign.mirrored);
    ctx.restore();
  }

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

  // Export crisp 300 DPI 4R PNG (and lightweight JPEG thumb for Firestore order doc)
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
