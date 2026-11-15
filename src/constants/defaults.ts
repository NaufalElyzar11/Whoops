import type { PhotoFrame, ServicePackage, StoreSettings } from '../types';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'escincosusu11@gmail.com';

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  printAddonPrice: 10000,
  storeName: 'WHOOPS!',
  qrisLabel: 'QRIS STATIS WHOOPS!',
};

export const DEFAULT_PACKAGES: ServicePackage[] = [
  {
    id: 'pkg-1',
    code: 'PHOTO_ONLY',
    name: 'PHOTO ONLY',
    description: 'Hasil photobooth digital resolusi tinggi tanpa ilustrasi doodle.',
    promoText: '',
    digitalPrice: 10000,
    includesDoodle: false,
    includesPrint: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'pkg-2',
    code: 'PHOTO_DOODLE',
    name: 'PHOTO + DOODLE',
    description: 'Foto photobooth digambar secara manual dengan ilustrasi doodle custom (file digital).',
    promoText: 'CUSTOM ART',
    digitalPrice: 20000,
    includesDoodle: true,
    includesPrint: false,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'pkg-3',
    code: 'PHOTO_DOODLE_PRINT',
    name: 'PHOTO + DOODLE + PRINT',
    description: 'Paket lengkap: photobooth + doodle custom manual + file digital + cetak 4R Silky Doff.',
    promoText: 'BEST VALUE',
    digitalPrice: 20000,
    includesDoodle: true,
    includesPrint: true,
    isActive: true,
    sortOrder: 3,
  },
];

export const DEFAULT_FRAMES: PhotoFrame[] = [
  {
    id: 'f-1',
    name: 'WHOOPS! Burgundy Retro 6-Cut',
    category: 'Retro Classic',
    type: 'vector',
    bg: '#6D1D3A',
    trim: '#FDF7EE',
    labelColor: '#FDF7EE',
    overlayImageData: '',
    active: true,
    sortOrder: 1,
  },
  {
    id: 'f-2',
    name: 'Dusty Pink Seoul Mood',
    category: 'Cute Pastel',
    type: 'vector',
    bg: '#E4A3B3',
    trim: '#3A231E',
    labelColor: '#3A231E',
    overlayImageData: '',
    active: true,
    sortOrder: 2,
  },
  {
    id: 'f-3',
    name: 'Cream Nostalgia Studio',
    category: 'Minimalist',
    type: 'vector',
    bg: '#EFE2CE',
    trim: '#6D1D3A',
    labelColor: '#6D1D3A',
    overlayImageData: '',
    active: true,
    sortOrder: 3,
  },
];

export function rupiah(n: number | undefined | null): string {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

export function formatOrderTime(ts: unknown): string {
  if (!ts) return '-';
  try {
    if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
      return (ts as { toDate: () => Date }).toDate().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (typeof ts === 'string' || typeof ts === 'number') {
      return new Date(ts).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  } catch {
    return '-';
  }
  return '-';
}
