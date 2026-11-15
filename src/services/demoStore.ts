import {
  DEFAULT_FRAMES,
  DEFAULT_PACKAGES,
  DEFAULT_STORE_SETTINGS,
} from '../constants/defaults';
import type {
  GoogleDriveConfig,
  PhotoFrame,
  PhotoboothOrder,
  RawPhotoPayload,
  ServicePackage,
  StoreSettings,
} from '../types';

export interface DemoStoreState {
  settings: StoreSettings;
  packages: ServicePackage[];
  frames: PhotoFrame[];
  orders: PhotoboothOrder[];
  hasCustomCatalog: boolean;
}

export interface DemoOrderMediaRecord {
  fullCompositePng: string;
  doodleFinalPng?: string;
  rawPhotos: RawPhotoPayload[];
}

export interface OrderGDriveLinkInfo {
  folderId: string;
  folderUrl: string;
  fileCount: number;
}

const DEMO_STATE_KEY = 'whoops_demo_state_v1';
const GDRIVE_CONFIG_KEY = 'whoops_gdrive_config_v1';
const GDRIVE_LINKS_KEY = 'whoops_order_gdrive_links_v1';
const CHANNEL_NAME = 'whoops_demo_sync_v1';
const IDB_NAME = 'whoops_booth_demo_db';
const IDB_STORE = 'orderMedia';

function getInitialDemoState(): DemoStoreState {
  return {
    settings: { ...DEFAULT_STORE_SETTINGS },
    packages: DEFAULT_PACKAGES.map((p) => ({ ...p })),
    frames: DEFAULT_FRAMES.map((f) => ({ ...f })),
    orders: [],
    hasCustomCatalog: false,
  };
}

export function loadDemoState(): DemoStoreState {
  try {
    const raw = localStorage.getItem(DEMO_STATE_KEY);
    if (!raw) return getInitialDemoState();
    const parsed = JSON.parse(raw) as Partial<DemoStoreState>;
    return {
      settings: parsed.settings || { ...DEFAULT_STORE_SETTINGS },
      packages: Array.isArray(parsed.packages) ? parsed.packages : DEFAULT_PACKAGES,
      frames: Array.isArray(parsed.frames) ? parsed.frames : DEFAULT_FRAMES,
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      hasCustomCatalog: Boolean(parsed.hasCustomCatalog),
    };
  } catch {
    return getInitialDemoState();
  }
}

let sharedChannel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!sharedChannel) sharedChannel = new BroadcastChannel(CHANNEL_NAME);
  return sharedChannel;
}

const localListeners = new Set<(state: DemoStoreState) => void>();

function persistAndBroadcast(next: DemoStoreState) {
  try {
    localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('Local demo storage write failed:', err);
  }
  localListeners.forEach((fn) => fn(next));
  try {
    getChannel()?.postMessage({ type: 'state-updated' });
  } catch {
    // Ignore closed channel
  }
}

export function subscribeDemoState(cb: (state: DemoStoreState) => void): () => void {
  cb(loadDemoState());
  localListeners.add(cb);

  const onStorage = (e: StorageEvent) => {
    if (e.key === DEMO_STATE_KEY) cb(loadDemoState());
  };
  const ch = getChannel();
  const onChannelMsg = () => cb(loadDemoState());

  window.addEventListener('storage', onStorage);
  ch?.addEventListener('message', onChannelMsg);

  return () => {
    localListeners.delete(cb);
    window.removeEventListener('storage', onStorage);
    ch?.removeEventListener('message', onChannelMsg);
  };
}

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDemoOrderMedia(
  orderId: string,
  media: DemoOrderMediaRecord
): Promise<void> {
  const db = await openMediaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(media, orderId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDemoOrderMedia(
  orderId: string
): Promise<DemoOrderMediaRecord | null> {
  try {
    const db = await openMediaDb();
    return await new Promise<DemoOrderMediaRecord | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(orderId);
      req.onsuccess = () => resolve((req.result as DemoOrderMediaRecord | undefined) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function updateDemoOrderDoodleMedia(
  orderId: string,
  doodleFinalPng: string
): Promise<void> {
  const existing = await getDemoOrderMedia(orderId);
  await saveDemoOrderMedia(orderId, {
    fullCompositePng: existing?.fullCompositePng || doodleFinalPng,
    rawPhotos: existing?.rawPhotos || [],
    doodleFinalPng,
  });
}

export interface CreateDemoOrderInput {
  orderId?: string;
  orderCode?: string;
  pkg: ServicePackage;
  frameId: string;
  wantsPrint: boolean;
  doodleNotes: string;
  totalAmount: number;
  previewThumbUrl: string;
  fullPngDataUrl: string;
  rawPhotos: RawPhotoPayload[];
}

export async function createDemoOrder(input: CreateDemoOrderInput): Promise<PhotoboothOrder> {
  const orderId =
    input.orderId || `ord-demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const orderCode =
    input.orderCode || `WHP-${Math.floor(1000 + Math.random() * 9000)}`;

  await saveDemoOrderMedia(orderId, {
    fullCompositePng: input.fullPngDataUrl,
    rawPhotos: input.rawPhotos,
  });

  const nowIso = new Date().toISOString();
  const newOrder: PhotoboothOrder = {
    id: orderId,
    orderCode,
    packageId: input.pkg.id,
    packageName: input.pkg.name,
    frameId: input.frameId,
    includesDoodle: input.pkg.includesDoodle,
    wantsPrint: input.wantsPrint,
    doodleNotes: input.doodleNotes.trim().slice(0, 300),
    totalAmount: Number(input.totalAmount),
    paymentStatus: 'PENDING_VERIFICATION',
    printStatus: input.wantsPrint ? 'QUEUED' : 'NOT_APPLICABLE',
    workflowStatus: 'Waiting for Payment',
    previewThumbUrl: input.previewThumbUrl,
    originalChunks: 1,
    finalChunks: 0,
    doodleDone: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const state = loadDemoState();
  const deduped = state.orders.filter((o) => o.id !== orderId);
  persistAndBroadcast({
    ...state,
    orders: [newOrder, ...deduped],
  });

  return newOrder;
}

export function updateDemoOrder(
  orderId: string,
  patch: Partial<PhotoboothOrder>
): void {
  const state = loadDemoState();
  const nextOrders = state.orders.map((o) =>
    o.id === orderId ? { ...o, ...patch, updatedAt: new Date().toISOString() } : o
  );
  persistAndBroadcast({ ...state, orders: nextOrders });
}

export function saveDemoSettings(settings: StoreSettings): void {
  const state = loadDemoState();
  persistAndBroadcast({ ...state, settings, hasCustomCatalog: true });
}

export function saveDemoPackage(pkg: ServicePackage): void {
  const state = loadDemoState();
  const exists = state.packages.some((p) => p.id === pkg.id);
  const nextPackages = exists
    ? state.packages.map((p) => (p.id === pkg.id ? pkg : p))
    : [...state.packages, pkg];
  nextPackages.sort((a, b) => a.sortOrder - b.sortOrder);
  persistAndBroadcast({ ...state, packages: nextPackages, hasCustomCatalog: true });
}

export function deleteDemoPackage(packageId: string): void {
  const state = loadDemoState();
  persistAndBroadcast({
    ...state,
    packages: state.packages.filter((p) => p.id !== packageId),
    hasCustomCatalog: true,
  });
}

export function saveDemoFrame(frame: PhotoFrame): void {
  const state = loadDemoState();
  const exists = state.frames.some((f) => f.id === frame.id);
  const nextFrames = exists
    ? state.frames.map((f) => (f.id === frame.id ? frame : f))
    : [...state.frames, frame];
  nextFrames.sort((a, b) => a.sortOrder - b.sortOrder);
  persistAndBroadcast({ ...state, frames: nextFrames, hasCustomCatalog: true });
}

export function getGDriveConfig(): GoogleDriveConfig {
  try {
    const raw = localStorage.getItem(GDRIVE_CONFIG_KEY);
    if (!raw) return { webAppUrl: '', secretKey: '', rootFolderId: '' };
    const parsed = JSON.parse(raw) as Partial<GoogleDriveConfig>;
    return {
      webAppUrl: parsed.webAppUrl || '',
      secretKey: parsed.secretKey || '',
      rootFolderId: parsed.rootFolderId || '',
    };
  } catch {
    return { webAppUrl: '', secretKey: '', rootFolderId: '' };
  }
}

export function saveGDriveConfig(config: GoogleDriveConfig): void {
  localStorage.setItem(GDRIVE_CONFIG_KEY, JSON.stringify(config));
}

export function getOrderGDriveLinkMap(): Record<string, OrderGDriveLinkInfo> {
  try {
    const raw = localStorage.getItem(GDRIVE_LINKS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, OrderGDriveLinkInfo>;
  } catch {
    return {};
  }
}

export function saveOrderGDriveLink(
  orderId: string,
  info: OrderGDriveLinkInfo
): Record<string, OrderGDriveLinkInfo> {
  const map = getOrderGDriveLinkMap();
  const next = { ...map, [orderId]: info };
  try {
    localStorage.setItem(GDRIVE_LINKS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota issues
  }
  return next;
}
