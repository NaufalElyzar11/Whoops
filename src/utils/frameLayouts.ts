import {
  CANVAS_4R_HEIGHT,
  CANVAS_4R_WIDTH,
  DEFAULT_SLOTS,
  type FrameLayoutId,
  type PhotoFrame,
  type SlotRect,
} from '../types';

export interface FrameLayoutPreset {
  id: Exclude<FrameLayoutId, 'custom'>;
  count: number;
  label: string;
  hint: string;
  slots: SlotRect[];
}

export const FRAME_LAYOUT_PRESETS: Record<
  Exclude<FrameLayoutId, 'custom'>,
  FrameLayoutPreset
> = {
  '6-grid': {
    id: '6-grid',
    count: 6,
    label: '6 Foto (Grid 2×3)',
    hint: 'Layout klasik 2 kolom × 3 baris',
    slots: DEFAULT_SLOTS,
  },
  '3-vertical': {
    id: '3-vertical',
    count: 3,
    label: '3 Foto (Susun Vertikal)',
    hint: '3 kotak lebar tersusun rapi ke bawah',
    slots: [
      { slotIndex: 0, x: 0.08, y: 0.055, width: 0.84, height: 0.255 },
      { slotIndex: 1, x: 0.08, y: 0.335, width: 0.84, height: 0.255 },
      { slotIndex: 2, x: 0.08, y: 0.615, width: 0.84, height: 0.255 },
    ],
  },
  '3-collage': {
    id: '3-collage',
    count: 3,
    label: '3 Foto (Kolase 1 + 2)',
    hint: '1 foto besar di atas, 2 foto di bawah',
    slots: [
      { slotIndex: 0, x: 0.065, y: 0.055, width: 0.87, height: 0.48 },
      { slotIndex: 1, x: 0.065, y: 0.56, width: 0.415, height: 0.3 },
      { slotIndex: 2, x: 0.52, y: 0.56, width: 0.415, height: 0.3 },
    ],
  },
  '4-grid': {
    id: '4-grid',
    count: 4,
    label: '4 Foto (Grid 2×2)',
    hint: '4 kotak foto seimbang (2 kolom × 2 baris)',
    slots: [
      { slotIndex: 0, x: 0.065, y: 0.065, width: 0.415, height: 0.38 },
      { slotIndex: 1, x: 0.52, y: 0.065, width: 0.415, height: 0.38 },
      { slotIndex: 2, x: 0.065, y: 0.475, width: 0.415, height: 0.38 },
      { slotIndex: 3, x: 0.52, y: 0.475, width: 0.415, height: 0.38 },
    ],
  },
  '4-strip': {
    id: '4-strip',
    count: 4,
    label: '4 Foto (Strip Vertikal)',
    hint: '4 foto berurutan ke bawah ala Korea',
    slots: [
      { slotIndex: 0, x: 0.14, y: 0.05, width: 0.72, height: 0.19 },
      { slotIndex: 1, x: 0.14, y: 0.26, width: 0.72, height: 0.19 },
      { slotIndex: 2, x: 0.14, y: 0.47, width: 0.72, height: 0.19 },
      { slotIndex: 3, x: 0.14, y: 0.68, width: 0.72, height: 0.19 },
    ],
  },
  '2-vertical': {
    id: '2-vertical',
    count: 2,
    label: '2 Foto (Atas - Bawah)',
    hint: '2 foto besar memanjang ke samping',
    slots: [
      { slotIndex: 0, x: 0.075, y: 0.06, width: 0.85, height: 0.38 },
      { slotIndex: 1, x: 0.075, y: 0.475, width: 0.85, height: 0.38 },
    ],
  },
  '2-grid': {
    id: '2-grid',
    count: 2,
    label: '2 Foto (Kiri - Kanan)',
    hint: '2 foto portrait berdampingan',
    slots: [
      { slotIndex: 0, x: 0.06, y: 0.08, width: 0.42, height: 0.76 },
      { slotIndex: 1, x: 0.52, y: 0.08, width: 0.42, height: 0.76 },
    ],
  },
  '1-hero': {
    id: '1-hero',
    count: 1,
    label: '1 Foto (Poster Besar)',
    hint: '1 bingkai foto besar memenuhi kertas 4R',
    slots: [{ slotIndex: 0, x: 0.07, y: 0.06, width: 0.86, height: 0.78 }],
  },
  '5-collage': {
    id: '5-collage',
    count: 5,
    label: '5 Foto (2 Atas + 3 Bawah)',
    hint: '2 foto atas, 3 foto di baris bawah',
    slots: [
      { slotIndex: 0, x: 0.065, y: 0.06, width: 0.415, height: 0.39 },
      { slotIndex: 1, x: 0.52, y: 0.06, width: 0.415, height: 0.39 },
      { slotIndex: 2, x: 0.065, y: 0.48, width: 0.27, height: 0.38 },
      { slotIndex: 3, x: 0.365, y: 0.48, width: 0.27, height: 0.38 },
      { slotIndex: 4, x: 0.665, y: 0.48, width: 0.27, height: 0.38 },
    ],
  },
  '8-grid': {
    id: '8-grid',
    count: 8,
    label: '8 Foto (Grid 2×4)',
    hint: '8 foto mini dalam 2 kolom × 4 baris',
    slots: [
      { slotIndex: 0, x: 0.065, y: 0.05, width: 0.415, height: 0.185 },
      { slotIndex: 1, x: 0.52, y: 0.05, width: 0.415, height: 0.185 },
      { slotIndex: 2, x: 0.065, y: 0.255, width: 0.415, height: 0.185 },
      { slotIndex: 3, x: 0.52, y: 0.255, width: 0.415, height: 0.185 },
      { slotIndex: 4, x: 0.065, y: 0.46, width: 0.415, height: 0.185 },
      { slotIndex: 5, x: 0.52, y: 0.46, width: 0.415, height: 0.185 },
      { slotIndex: 6, x: 0.065, y: 0.665, width: 0.415, height: 0.185 },
      { slotIndex: 7, x: 0.52, y: 0.665, width: 0.415, height: 0.185 },
    ],
  },
};

export const SUPPORTED_SLOT_COUNTS = [1, 2, 3, 4, 5, 6, 8] as const;

export function getPresetsForSlotCount(count: number): FrameLayoutPreset[] {
  return Object.values(FRAME_LAYOUT_PRESETS).filter((p) => p.count === count);
}

export function getDefaultLayoutForCount(count: number): Exclude<FrameLayoutId, 'custom'> {
  if (count === 1) return '1-hero';
  if (count === 2) return '2-vertical';
  if (count === 3) return '3-vertical';
  if (count === 4) return '4-grid';
  if (count === 5) return '5-collage';
  if (count === 8) return '8-grid';
  return '6-grid';
}

export function cloneSlots(slots: SlotRect[]): SlotRect[] {
  return slots.map((s, idx) => ({
    slotIndex: idx,
    x: Number(s.x),
    y: Number(s.y),
    width: Number(s.width),
    height: Number(s.height),
  }));
}

export function normalizeSlots(raw: SlotRect[]): SlotRect[] {
  return raw.slice(0, 8).map((s, idx) => ({
    slotIndex: idx,
    x: Math.max(0.01, Math.min(0.95, Number(s.x) || 0.05)),
    y: Math.max(0.01, Math.min(0.95, Number(s.y) || 0.05)),
    width: Math.max(0.05, Math.min(0.98, Number(s.width) || 0.4)),
    height: Math.max(0.05, Math.min(0.98, Number(s.height) || 0.25)),
  }));
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const VECTOR_LAYOUT_PREFIX = 'WHOOPS_LAYOUT:';

function encodeUint62(val: number, len: number): string {
  const maxVal = 62 ** len - 1;
  let n = Math.max(0, Math.min(maxVal, Math.round(val)));
  let out = '';
  for (let i = 0; i < len; i++) {
    out = B62[n % 62] + out;
    n = Math.floor(n / 62);
  }
  return out;
}

function decodeUint62(str: string): number {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const idx = B62.indexOf(str[i]);
    if (idx < 0) return 0;
    n = n * 62 + idx;
  }
  return n;
}

/**
 * Packs custom 1..8 SlotRect coordinates into a <= 56 char ASCII string for Firestore's
 * strict 3x20-char (`bg`, `trim`, `labelColor`) allowlist when `type === 'image'`.
 */
function packCustomSlotsForImageMeta(slots: SlotRect[]): [string, string, string] {
  const safeSlots = normalizeSlots(slots);
  const count = safeSlots.length;
  const highPrecision = count <= 6;
  const maxUnit = highPrecision ? 3843 : 61;
  const charsPerCoord = highPrecision ? 2 : 1;

  let body = `${highPrecision ? 'C' : 'c'}${count}`;
  for (const s of safeSlots) {
    body +=
      encodeUint62(s.x * maxUnit, charsPerCoord) +
      encodeUint62(s.y * maxUnit, charsPerCoord) +
      encodeUint62(s.width * maxUnit, charsPerCoord) +
      encodeUint62(s.height * maxUnit, charsPerCoord);
  }

  return [
    body.slice(0, 20) || '#FDF7EE',
    body.slice(20, 40) || '#3A231E',
    body.slice(40, 60) || '#3A231E',
  ];
}

function unpackCustomSlotsFromImageMeta(
  bg: string,
  trim: string,
  labelColor: string
): SlotRect[] | null {
  const combined =
    bg +
    (trim.startsWith('#') ? '' : trim) +
    (labelColor.startsWith('#') ? '' : labelColor);
  if (!combined || (combined[0] !== 'C' && combined[0] !== 'c')) return null;

  const highPrecision = combined[0] === 'C';
  const count = Number.parseInt(combined[1] || '0', 10);
  if (!Number.isFinite(count) || count < 1 || count > 8) return null;

  const charsPerCoord = highPrecision ? 2 : 1;
  const maxUnit = highPrecision ? 3843 : 61;
  const payload = combined.slice(2);
  if (payload.length < count * 4 * charsPerCoord) return null;

  const result: SlotRect[] = [];
  for (let i = 0; i < count; i++) {
    const base = i * 4 * charsPerCoord;
    result.push({
      slotIndex: i,
      x: decodeUint62(payload.slice(base, base + charsPerCoord)) / maxUnit,
      y: decodeUint62(payload.slice(base + charsPerCoord, base + charsPerCoord * 2)) / maxUnit,
      width:
        decodeUint62(payload.slice(base + charsPerCoord * 2, base + charsPerCoord * 3)) /
        maxUnit,
      height:
        decodeUint62(payload.slice(base + charsPerCoord * 3, base + charsPerCoord * 4)) /
        maxUnit,
    });
  }
  return normalizeSlots(result);
}

function isPresetId(val: string): val is Exclude<FrameLayoutId, 'custom'> {
  return Object.prototype.hasOwnProperty.call(FRAME_LAYOUT_PRESETS, val);
}

/**
 * Encodes `layoutId` and optional `slots` strictly within Firestore `isValidFrame` field limits.
 */
export function encodeFrameForFirestore(frame: PhotoFrame): {
  bg: string;
  trim: string;
  labelColor: string;
  overlayImageData: string;
} {
  if (frame.type === 'vector') {
    let encodedOverlay = '';
    const hasCustomSlots = Boolean(frame.slots && frame.slots.length > 0);
    const hasCustomPreset = frame.layoutId && frame.layoutId !== '6-grid';
    if (hasCustomSlots || hasCustomPreset) {
      encodedOverlay =
        VECTOR_LAYOUT_PREFIX +
        JSON.stringify({
          layoutId: frame.layoutId || 'custom',
          slots: hasCustomSlots ? normalizeSlots(frame.slots!) : undefined,
        });
    }
    return {
      bg: frame.bg.slice(0, 20) || '#6D1D3A',
      trim: frame.trim.slice(0, 20) || '#FDF7EE',
      labelColor: frame.labelColor.slice(0, 20) || '#FDF7EE',
      overlayImageData: encodedOverlay.slice(0, 750000),
    };
  }

  // `frame.type === 'image'` (Canva overlay Data URL occupies `overlayImageData`)
  if (frame.layoutId && frame.layoutId !== 'custom' && isPresetId(frame.layoutId)) {
    return {
      bg: `L:${frame.layoutId}`.slice(0, 20),
      trim: '#3A231E',
      labelColor: '#3A231E',
      overlayImageData: (frame.overlayImageData || '').slice(0, 750000),
    };
  }

  if (frame.slots && frame.slots.length > 0) {
    const [mBg, mTrim, mLabel] = packCustomSlotsForImageMeta(frame.slots);
    return {
      bg: mBg,
      trim: mTrim,
      labelColor: mLabel,
      overlayImageData: (frame.overlayImageData || '').slice(0, 750000),
    };
  }

  return {
    bg: 'L:6-grid',
    trim: '#3A231E',
    labelColor: '#3A231E',
    overlayImageData: (frame.overlayImageData || '').slice(0, 750000),
  };
}

export function decodeFrameFromFirestore(raw: PhotoFrame): PhotoFrame {
  if (Array.isArray(raw.slots) && raw.slots.length > 0) {
    return {
      ...raw,
      slots: normalizeSlots(raw.slots),
      layoutId: raw.layoutId || 'custom',
    };
  }

  if (raw.type === 'vector' && raw.overlayImageData?.startsWith(VECTOR_LAYOUT_PREFIX)) {
    try {
      const parsed = JSON.parse(raw.overlayImageData.slice(VECTOR_LAYOUT_PREFIX.length)) as {
        layoutId?: FrameLayoutId;
        slots?: SlotRect[];
      };
      const layoutId =
        parsed.layoutId && (parsed.layoutId === 'custom' || isPresetId(parsed.layoutId))
          ? parsed.layoutId
          : '6-grid';
      const slots =
        Array.isArray(parsed.slots) && parsed.slots.length > 0
          ? normalizeSlots(parsed.slots)
          : layoutId !== 'custom'
            ? cloneSlots(FRAME_LAYOUT_PRESETS[layoutId].slots)
            : cloneSlots(DEFAULT_SLOTS);
      return {
        ...raw,
        overlayImageData: '',
        layoutId,
        slots,
      };
    } catch {
      return { ...raw, layoutId: '6-grid', slots: cloneSlots(DEFAULT_SLOTS) };
    }
  }

  if (raw.type === 'image') {
    if (raw.bg?.startsWith('L:')) {
      const candidate = raw.bg.slice(2);
      if (isPresetId(candidate)) {
        return {
          ...raw,
          layoutId: candidate,
          slots: cloneSlots(FRAME_LAYOUT_PRESETS[candidate].slots),
        };
      }
    }
    const unpacked = unpackCustomSlotsFromImageMeta(
      raw.bg || '',
      raw.trim || '',
      raw.labelColor || ''
    );
    if (unpacked) {
      return {
        ...raw,
        layoutId: 'custom',
        slots: unpacked,
      };
    }
  }

  if (raw.layoutId && raw.layoutId !== 'custom' && isPresetId(raw.layoutId)) {
    return {
      ...raw,
      layoutId: raw.layoutId,
      slots: cloneSlots(FRAME_LAYOUT_PRESETS[raw.layoutId].slots),
    };
  }

  return {
    ...raw,
    layoutId: raw.layoutId || '6-grid',
    slots: cloneSlots(DEFAULT_SLOTS),
  };
}

export function getFrameSlots(frame?: PhotoFrame | null): SlotRect[] {
  if (!frame) return DEFAULT_SLOTS;
  if (Array.isArray(frame.slots) && frame.slots.length > 0) {
    return frame.slots;
  }
  const decoded = decodeFrameFromFirestore(frame);
  return decoded.slots && decoded.slots.length > 0 ? decoded.slots : DEFAULT_SLOTS;
}

export function getFrameSlotCount(frame?: PhotoFrame | null): number {
  return getFrameSlots(frame).length;
}

export function getSlotAspectRatio(frame?: PhotoFrame | null): number {
  const slots = getFrameSlots(frame);
  const first = slots[0] || DEFAULT_SLOTS[0];
  const raw = (first.width * CANVAS_4R_WIDTH) / Math.max(1, first.height * CANVAS_4R_HEIGHT);
  return Math.max(0.5, Math.min(2.6, raw));
}
