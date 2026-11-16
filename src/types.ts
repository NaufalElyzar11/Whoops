export const CANVAS_4R_WIDTH = 1205;
export const CANVAS_4R_HEIGHT = 1795;

export interface SlotRect {
  slotIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_SLOTS: SlotRect[] = [
  { slotIndex: 0, x: 0.065, y: 0.06, width: 0.415, height: 0.255 },
  { slotIndex: 1, x: 0.52,  y: 0.06, width: 0.415, height: 0.255 },
  { slotIndex: 2, x: 0.065, y: 0.34, width: 0.415, height: 0.255 },
  { slotIndex: 3, x: 0.52,  y: 0.34, width: 0.415, height: 0.255 },
  { slotIndex: 4, x: 0.065, y: 0.62, width: 0.415, height: 0.255 },
  { slotIndex: 5, x: 0.52,  y: 0.62, width: 0.415, height: 0.255 },
];

export type FilterType =
  | 'original'
  | 'bw'
  | 'grayscale'
  | 'sepia'
  | 'warm'
  | 'cool'
  | 'bright'
  | 'contrast';

export const FILTER_NAMES: Record<FilterType, string> = {
  original: 'Original',
  bw: 'Black & White',
  grayscale: 'Grayscale',
  sepia: 'Sepia',
  warm: 'Warm',
  cool: 'Cool',
  bright: 'Bright',
  contrast: 'Contrast',
};

export interface CapturedPhoto {
  id: string;
  dataUrl: string;
}

export interface SlotAssignment {
  slotIndex: number;
  photoId: string | null;
  filter: FilterType;
  brightness: number;
  mirrored: boolean;
}

export interface StoreSettings {
  printAddonPrice: number;
  storeName: string;
  qrisLabel: string;
  updatedAt?: unknown;
}

export interface ServicePackage {
  id: string;
  code: string;
  name: string;
  description: string;
  promoText: string;
  digitalPrice: number;
  includesDoodle: boolean;
  includesPrint: boolean;
  isActive: boolean;
  sortOrder: number;
  updatedAt?: unknown;
}

export type DiscountType = 'fixed' | 'percent';

export interface VoucherCode {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  description: string;
  isActive: boolean;
}

export type FrameLayoutId =
  | '1-hero'
  | '2-vertical'
  | '2-grid'
  | '3-vertical'
  | '3-collage'
  | '4-grid'
  | '4-strip'
  | '5-collage'
  | '6-grid'
  | '8-grid'
  | 'custom';

export type FrameLayerOrder = 'frame-on-top' | 'photos-on-top';

export interface PhotoFrame {
  id: string;
  name: string;
  category: string;
  type: 'vector' | 'image';
  bg: string;
  trim: string;
  labelColor: string;
  overlayImageData: string;
  active: boolean;
  sortOrder: number;
  layoutId?: FrameLayoutId;
  slots?: SlotRect[];
  layerOrder?: FrameLayerOrder;
  updatedAt?: unknown;
}

export type PaymentStatus = 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
export type PrintStatus = 'NOT_APPLICABLE' | 'QUEUED' | 'PRINTED';
export type WorkflowStatus =
  | 'Waiting for Payment'
  | 'Waiting for Doodle'
  | 'In Progress'
  | 'Doodle Completed'
  | 'Ready for Download'
  | 'Ready to Print'
  | 'Completed'
  | 'Payment Rejected';

export interface PhotoboothOrder {
  id: string;
  orderCode: string;
  packageId: string;
  packageName: string;
  frameId: string;
  includesDoodle: boolean;
  wantsPrint: boolean;
  doodleNotes: string;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  printStatus: PrintStatus;
  workflowStatus: WorkflowStatus;
  previewThumbUrl: string;
  originalChunks: number;
  finalChunks: number;
  doodleDone: boolean;
  gdriveFolderUrl?: string;
  gdriveFolderId?: string;
  gdriveUploadedCount?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RawPhotoPayload {
  filename: string;
  dataUrl: string;
}

export interface GoogleDriveConfig {
  webAppUrl: string;
  secretKey: string;
  rootFolderId: string;
}

export type AppMode = 'booth' | 'admin';
export type AdminTab = 'orders' | 'doodle' | 'print' | 'packages' | 'frames';
export type BoothStep =
  | 'welcome'
  | 'service'
  | 'frame'
  | 'camera'
  | 'editor'
  | 'preview'
  | 'checkout';
