import { DEFAULT_SLOTS, type SlotRect } from '../types';
import { CANVAS_4R_HEIGHT, CANVAS_4R_WIDTH, loadImage } from './canvasEngine';

export type CanvaCutoutMode = 'auto_cut_slots' | 'transparent_png' | 'chroma_key';
export type CanvaFitMode = 'fill' | 'cover' | 'contain';

export const MAX_OVERLAY_DATA_URL_LENGTH = 700000;

export interface CanvaImportOptions {
  cutoutMode: CanvaCutoutMode;
  fitMode: CanvaFitMode;
  chromaHex: string;
  chromaTolerance: number;
  chromaOnlyNearSlots: boolean;
}

export interface CanvaProcessResult {
  overlayDataUrl: string;
  width: number;
  height: number;
  byteLength: number;
  format: 'image/png' | 'image/webp';
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 255, g: 255, b: 255 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function isInsideAnySlotRegion(
  x: number,
  y: number,
  width: number,
  height: number,
  slots: SlotRect[],
  paddingPx: number
): boolean {
  for (const s of slots) {
    const left = s.x * width - paddingPx;
    const top = s.y * height - paddingPx;
    const right = (s.x + s.width) * width + paddingPx;
    const bottom = (s.y + s.height) * height + paddingPx;
    if (x >= left && x <= right && y >= top && y <= bottom) {
      return true;
    }
  }
  return false;
}

/**
 * Converts pixels matching `targetHex` (within Euclidean RGB distance `tolerance`) to transparent.
 * When `onlyNearSlots` is true, preserves white/colored illustrations outside the 6 photo window regions.
 */
export function applyChromaKeyToRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetHex: string,
  tolerance: number,
  onlyNearSlots = true,
  slots: SlotRect[] = DEFAULT_SLOTS
): void {
  const target = hexToRgb(targetHex);
  const safeTol = Math.max(4, Math.min(140, tolerance));
  const maxDistSq = safeTol * safeTol * 3;
  const featherStartDistSq = (safeTol * 0.72) ** 2 * 3;
  const slotPadPx = Math.round(Math.min(width, height) * 0.025);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (onlyNearSlots && !isInsideAnySlotRegion(x, y, width, height, slots, slotPadPx)) {
        continue;
      }

      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha === 0) continue;

      const dr = data[idx] - target.r;
      const dg = data[idx + 1] - target.g;
      const db = data[idx + 2] - target.b;
      const distSq = dr * dr + dg * dg + db * db;

      if (distSq <= featherStartDistSq) {
        data[idx + 3] = 0;
      } else if (distSq < maxDistSq) {
        const ratio =
          (distSq - featherStartDistSq) / Math.max(1, maxDistSq - featherStartDistSq);
        data[idx + 3] = Math.round(alpha * ratio);
      }
    }
  }
}

export function punchSlotWindows(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  slots: SlotRect[] = DEFAULT_SLOTS
): void {
  const scaleRadius = Math.round((20 * width) / CANVAS_4R_WIDTH);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000000';
  for (const s of slots) {
    ctx.beginPath();
    ctx.roundRect(
      s.x * width,
      s.y * height,
      s.width * width,
      s.height * height,
      scaleRadius
    );
    ctx.fill();
  }
  ctx.restore();
}

function drawFittedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dstW: number,
  dstH: number,
  fitMode: CanvaFitMode
) {
  if (fitMode === 'fill' || img.width <= 0 || img.height <= 0) {
    ctx.drawImage(img, 0, 0, dstW, dstH);
    return;
  }

  const srcRatio = img.width / img.height;
  const dstRatio = dstW / dstH;

  if (fitMode === 'cover') {
    let sx = 0;
    let sy = 0;
    let sw = img.width;
    let sh = img.height;
    if (srcRatio > dstRatio) {
      sw = img.height * dstRatio;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / dstRatio;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dstW, dstH);
    return;
  }

  // contain
  let dw = dstW;
  let dh = dstH;
  if (srcRatio > dstRatio) {
    dh = dstW / srcRatio;
  } else {
    dw = dstH * srcRatio;
  }
  const dx = (dstW - dw) / 2;
  const dy = (dstH - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/**
 * Compresses an overlay canvas so its Data URL reliably stays under Firestore's 750,000 byte limit
 * while keeping full alpha transparency.
 */
export function encodeOverlayWithinLimit(
  sourceCanvas: HTMLCanvasElement,
  maxDataUrlLen = MAX_OVERLAY_DATA_URL_LENGTH
): CanvaProcessResult {
  const tryEncode = (
    canvas: HTMLCanvasElement,
    mime: 'image/png' | 'image/webp',
    quality?: number
  ): string | null => {
    const url = quality !== undefined ? canvas.toDataURL(mime, quality) : canvas.toDataURL(mime);
    if (!url.startsWith(`data:${mime}`)) return null;
    return url;
  };

  const pngFull = tryEncode(sourceCanvas, 'image/png');
  if (pngFull && pngFull.length <= maxDataUrlLen) {
    return {
      overlayDataUrl: pngFull,
      width: sourceCanvas.width,
      height: sourceCanvas.height,
      byteLength: pngFull.length,
      format: 'image/png',
    };
  }

  const qualities = [0.92, 0.85, 0.76, 0.65];
  for (const q of qualities) {
    const webp = tryEncode(sourceCanvas, 'image/webp', q);
    if (webp && webp.length <= maxDataUrlLen) {
      return {
        overlayDataUrl: webp,
        width: sourceCanvas.width,
        height: sourceCanvas.height,
        byteLength: webp.length,
        format: 'image/webp',
      };
    }
  }

  // Fallback proportional downscale if image pixels are extremely dense
  const scales = [0.8, 0.65, 0.5];
  for (const scale of scales) {
    const w = Math.round(sourceCanvas.width * scale);
    const h = Math.round(sourceCanvas.height * scale);
    const scaled = document.createElement('canvas');
    scaled.width = w;
    scaled.height = h;
    const sctx = scaled.getContext('2d');
    if (!sctx) continue;
    sctx.drawImage(sourceCanvas, 0, 0, w, h);

    for (const q of [0.85, 0.72]) {
      const webp = tryEncode(scaled, 'image/webp', q);
      if (webp && webp.length <= maxDataUrlLen) {
        return {
          overlayDataUrl: webp,
          width: w,
          height: h,
          byteLength: webp.length,
          format: 'image/webp',
        };
      }
    }
    const pngScaled = tryEncode(scaled, 'image/png');
    if (pngScaled && pngScaled.length <= maxDataUrlLen) {
      return {
        overlayDataUrl: pngScaled,
        width: w,
        height: h,
        byteLength: pngScaled.length,
        format: 'image/png',
      };
    }
  }

  throw new Error(
    'Desain frame terlalu kompleks/besar (> 700 KB setelah kompresi). Coba kurangi detail tekstur lalu unggah ulang.'
  );
}

export async function processCanvaFrameSource(
  sourceDataUrl: string,
  options: CanvaImportOptions,
  slots: SlotRect[] = DEFAULT_SLOTS
): Promise<CanvaProcessResult> {
  const safeSlots = slots.length > 0 ? slots : DEFAULT_SLOTS;
  const img = await loadImage(sourceDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_4R_WIDTH;
  canvas.height = CANVAS_4R_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context tidak tersedia.');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFittedImage(ctx, img, canvas.width, canvas.height, options.fitMode);

  if (options.cutoutMode === 'auto_cut_slots') {
    punchSlotWindows(ctx, canvas.width, canvas.height, safeSlots);
  } else if (options.cutoutMode === 'chroma_key') {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyChromaKeyToRgba(
      imgData.data,
      canvas.width,
      canvas.height,
      options.chromaHex,
      options.chromaTolerance,
      options.chromaOnlyNearSlots,
      safeSlots
    );
    ctx.putImageData(imgData, 0, 0);
  }

  return encodeOverlayWithinLimit(canvas);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('File tidak dapat dibaca sebagai gambar.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Generates a downloadable 1205x1795 PNG template guide matching the selected number & layout of photo slots.
 */
export function generateCanvaTemplateGuidePng(slots: SlotRect[] = DEFAULT_SLOTS): string {
  const safeSlots = slots.length > 0 ? slots : DEFAULT_SLOTS;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_4R_WIDTH;
  canvas.height = CANVAS_4R_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#FDF7EE';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#6D1D3A';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(18, 18, canvas.width - 36, canvas.height - 36, 28);
  ctx.stroke();

  safeSlots.forEach((s, idx) => {
    const x = s.x * canvas.width;
    const y = s.y * canvas.height;
    const w = s.width * canvas.width;
    const h = s.height * canvas.height;

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 20);
    ctx.fill();

    ctx.save();
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = '#6D1D3A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 20);
    ctx.stroke();
    ctx.restore();

    const titleSize = Math.max(22, Math.min(36, Math.round(Math.min(w, h) * 0.1)));
    ctx.fillStyle = '#6D1D3A';
    ctx.font = `bold ${titleSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`AREA FOTO #${idx + 1}`, x + w / 2, y + h / 2 - 6);
    ctx.font = `${Math.max(16, Math.round(titleSize * 0.62))}px sans-serif`;
    ctx.fillStyle = '#61433B';
    ctx.fillText('(Biarkan kosong / kotak putih)', x + w / 2, y + h / 2 + titleSize * 0.85);
  });

  ctx.fillStyle = '#6D1D3A';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    `AREA LOGO / STIKER (${safeSlots.length} FOTO · 1205 x 1795 px)`,
    canvas.width / 2,
    1690
  );
  ctx.font = '22px sans-serif';
  ctx.fillStyle = '#61433B';
  ctx.fillText(
    'Timpa dengan desain Canva-mu -> Export PNG/JPG -> Upload ke Admin Whoops!',
    canvas.width / 2,
    1735
  );

  return canvas.toDataURL('image/png');
}
