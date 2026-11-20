import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  DEFAULT_FRAMES,
  DEFAULT_PACKAGES,
  DEFAULT_STORE_SETTINGS,
} from '../constants/defaults';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import type {
  PhotoFrame,
  PhotoboothOrder,
  RawPhotoPayload,
  ServicePackage,
  StoreSettings,
  WorkflowStatus,
} from '../types';
import { chunkDataUrl, fitJpegDataUrlUnderLimit } from '../utils/canvasEngine';
import {
  decodeFrameFromFirestore,
  encodeFrameForFirestore,
} from '../utils/frameLayouts';
import {
  GDRIVE_CONFIG_PKG_ID,
  gdriveConfigToPackage,
} from '../utils/gdriveConfigSync';
import type { OrderGDriveLinkInfo } from './demoStore';

export function subscribeStoreSettings(
  onData: (settings: StoreSettings, existsInCloud: boolean) => void
): Unsubscribe {
  const path = 'settings/store';
  return onSnapshot(
    doc(db, 'settings', 'store'),
    (snap) => {
      if (snap.exists()) {
        onData(snap.data() as StoreSettings, true);
      } else {
        onData(DEFAULT_STORE_SETTINGS, false);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribePackages(
  onData: (packages: ServicePackage[], existsInCloud: boolean) => void
): Unsubscribe {
  const path = 'packages';
  const q = query(collection(db, path), orderBy('sortOrder', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        onData([], false);
      } else {
        const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ServicePackage, 'id'>) }));
        onData(items, true);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeFrames(
  onData: (frames: PhotoFrame[], existsInCloud: boolean) => void
): Unsubscribe {
  const path = 'frames';
  const q = query(collection(db, path), orderBy('sortOrder', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        onData([], false);
      } else {
        const items = snap.docs.map((d) =>
          decodeFrameFromFirestore({ id: d.id, ...(d.data() as Omit<PhotoFrame, 'id'>) })
        );
        onData(items, true);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export const DEFAULT_ORDERS_PAGE_SIZE = 25;

export function subscribeOrders(
  onData: (orders: PhotoboothOrder[]) => void,
  onError?: (err: unknown) => void,
  maxOrders = DEFAULT_ORDERS_PAGE_SIZE
): Unsubscribe {
  const path = 'orders';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(maxOrders));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PhotoboothOrder, 'id'>) }));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function fetchOrdersByDateRange(
  startDate: Date,
  endDate: Date
): Promise<PhotoboothOrder[]> {
  const path = 'orders';
  try {
    const q = query(
      collection(db, path),
      where('createdAt', '>=', Timestamp.fromDate(startDate)),
      where('createdAt', '<=', Timestamp.fromDate(endDate)),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PhotoboothOrder, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribeSingleOrder(
  orderId: string,
  onData: (order: PhotoboothOrder | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const path = `orders/${orderId}`;
  return onSnapshot(
    doc(db, 'orders', orderId),
    (snap) => {
      if (snap.exists()) {
        onData({ id: snap.id, ...(snap.data() as Omit<PhotoboothOrder, 'id'>) });
      } else {
        onData(null);
      }
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function seedInitialCatalogIfEmpty(): Promise<void> {
  try {
    const currentUser = auth.currentUser;
    if (currentUser?.uid && currentUser.email) {
      try {
        const adminRef = doc(db, 'admins', currentUser.uid);
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          await setDoc(adminRef, {
            email: currentUser.email.trim().slice(0, 120),
            role: 'admin',
            createdAt: serverTimestamp(),
          });
        }
      } catch {
        // Ignore if current database rules restrict self-registration after initial seed
      }
    }

    const settingsRef = doc(db, 'settings', 'store');
    const settingsSnap = await getDoc(settingsRef);
    const packagesSnap = await getDocs(collection(db, 'packages'));
    const framesSnap = await getDocs(collection(db, 'frames'));

    const batch = writeBatch(db);
    let hasWrites = false;

    if (!settingsSnap.exists()) {
      batch.set(settingsRef, {
        printAddonPrice: DEFAULT_STORE_SETTINGS.printAddonPrice,
        storeName: DEFAULT_STORE_SETTINGS.storeName,
        qrisLabel: DEFAULT_STORE_SETTINGS.qrisLabel,
        updatedAt: serverTimestamp(),
      });
      hasWrites = true;
    }

    if (packagesSnap.empty) {
      for (const pkg of DEFAULT_PACKAGES) {
        batch.set(doc(db, 'packages', pkg.id), {
          code: pkg.code,
          name: pkg.name,
          description: pkg.description,
          promoText: pkg.promoText,
          digitalPrice: pkg.digitalPrice,
          includesDoodle: pkg.includesDoodle,
          includesPrint: pkg.includesPrint,
          isActive: pkg.isActive,
          sortOrder: pkg.sortOrder,
          updatedAt: serverTimestamp(),
        });
      }
      hasWrites = true;
    }

    if (framesSnap.empty) {
      for (const fr of DEFAULT_FRAMES) {
        const encoded = encodeFrameForFirestore(fr);
        batch.set(doc(db, 'frames', fr.id), {
          name: fr.name,
          category: fr.category,
          type: fr.type,
          bg: encoded.bg,
          trim: encoded.trim,
          labelColor: encoded.labelColor,
          overlayImageData: encoded.overlayImageData,
          active: fr.active,
          sortOrder: fr.sortOrder,
          updatedAt: serverTimestamp(),
        });
      }
      hasWrites = true;
    }

    if (hasWrites) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/packages/frames');
  }
}

export type CloudOrderErrorKind =
  | 'offline'
  | 'timeout'
  | 'quota'
  | 'permission'
  | 'unknown';

export class CloudOrderSyncError extends Error {
  readonly kind: CloudOrderErrorKind;
  readonly causeError?: unknown;

  constructor(kind: CloudOrderErrorKind, message: string, causeError?: unknown) {
    super(message);
    this.name = 'CloudOrderSyncError';
    this.kind = kind;
    this.causeError = causeError;
  }
}

const ORDER_DOC_TIMEOUT_MS = 15000;
const MEDIA_BATCH_TIMEOUT_MS = 20000;
const MEDIA_WRITE_CONCURRENCY = 3;

function assertDeviceOnline(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CloudOrderSyncError(
      'offline',
      'Koneksi Wi-Fi booth sedang terputus. Sambungkan kembali Wi-Fi lalu tekan Coba Kirim Ulang ke Kasir. Foto kamu tetap aman.'
    );
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new CloudOrderSyncError('timeout', timeoutMessage));
    }, timeoutMs);

    promise.then(
      (val) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function toCloudOrderSyncError(error: unknown, stageLabel: string): CloudOrderSyncError {
  if (error instanceof CloudOrderSyncError) return error;

  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '').toLowerCase()
      : '';
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    code.includes('unavailable') ||
    msg.includes('client is offline') ||
    msg.includes('network')
  ) {
    return new CloudOrderSyncError(
      'offline',
      'Koneksi ke server kasir terputus saat mengirim foto. Periksa Wi-Fi booth lalu tekan Coba Kirim Ulang ke Kasir. Foto kamu tidak hilang.',
      error
    );
  }

  if (code.includes('resource-exhausted') || msg.includes('quota')) {
    return new CloudOrderSyncError(
      'quota',
      'Kuota server Firebase penuh untuk sementara. Mohon panggil penjaga kasir sebelum meninggalkan booth.',
      error
    );
  }

  if (code.includes('permission-denied') || msg.includes('missing or insufficient permissions')) {
    return new CloudOrderSyncError(
      'permission',
      'Server kasir menolak penyimpanan pesanan (izin/aturan database). Mohon panggil penjaga kasir.',
      error
    );
  }

  return new CloudOrderSyncError(
    'unknown',
    `Gagal ${stageLabel} ke layar kasir. Periksa Wi-Fi lalu tekan Coba Kirim Ulang ke Kasir.`,
    error
  );
}

export interface CreateOrderInput {
  orderId?: string;
  orderCode?: string;
  pkg: ServicePackage;
  frameId: string;
  wantsPrint: boolean;
  doodleNotes: string;
  totalAmount: number;
  fullPngDataUrl: string;
  previewThumbUrl: string;
  rawPhotos?: RawPhotoPayload[];
  onProgress?: (stage: string) => void;
}

export async function createPhotoboothOrder(input: CreateOrderInput): Promise<string> {
  assertDeviceOnline();

  const orderId =
    input.orderId || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const orderCode =
    input.orderCode || `WHP-${Math.floor(1000 + Math.random() * 9000)}`;
  const sanitizedNotes = input.doodleNotes.trim().slice(0, 300);

  let chunks = chunkDataUrl(input.fullPngDataUrl, 380000);
  if (chunks.length > 20) {
    // Fallback to compact preview if extremely dense PNG exceeds 20 chunks (~7.6MB)
    chunks = chunkDataUrl(input.previewThumbUrl, 380000);
  }

  input.onProgress?.('Mendaftarkan pesanan ke meja kasir...');
  try {
    await withTimeout(
      setDoc(doc(db, 'orders', orderId), {
        orderCode,
        packageId: input.pkg.id,
        packageName: input.pkg.name.slice(0, 80),
        frameId: input.frameId,
        includesDoodle: input.pkg.includesDoodle,
        wantsPrint: input.wantsPrint,
        doodleNotes: sanitizedNotes,
        totalAmount: Number(input.totalAmount),
        paymentStatus: 'PENDING_VERIFICATION',
        printStatus: input.wantsPrint ? 'QUEUED' : 'NOT_APPLICABLE',
        workflowStatus: 'Waiting for Payment',
        previewThumbUrl: input.previewThumbUrl.slice(0, 349000),
        originalChunks: chunks.length,
        finalChunks: 0,
        doodleDone: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      ORDER_DOC_TIMEOUT_MS,
      'Koneksi ke server kasir terlalu lambat atau terputus. Periksa Wi-Fi booth lalu tekan Coba Kirim Ulang ke Kasir. Foto kamu tetap aman.'
    );
  } catch (error) {
    console.error('Firestore order create failed:', error);
    throw toCloudOrderSyncError(error, 'mengirim pesanan');
  }

  try {
    for (let start = 0; start < chunks.length; start += MEDIA_WRITE_CONCURRENCY) {
      assertDeviceOnline();
      const batchSlice = chunks.slice(start, start + MEDIA_WRITE_CONCURRENCY);
      const uploadedSoFar = Math.min(start + batchSlice.length, chunks.length);
      input.onProgress?.(`Mengunggah foto 4R ke kasir (${uploadedSoFar}/${chunks.length})...`);

      await withTimeout(
        Promise.all(
          batchSlice.map((chunkData, offset) => {
            const idx = start + offset;
            return setDoc(doc(db, 'orders', orderId, 'media', `original_${idx}`), {
              kind: 'original',
              index: idx,
              totalChunks: chunks.length,
              data: chunkData,
              createdAt: serverTimestamp(),
            });
          })
        ),
        MEDIA_BATCH_TIMEOUT_MS,
        'Pengunggahan foto ke kasir terputus di tengah jalan. Periksa Wi-Fi lalu tekan Coba Kirim Ulang ke Kasir. Foto kamu tetap aman.'
      );
    }

    const fittedRaws: RawPhotoPayload[] = [];
    for (const r of (input.rawPhotos || []).slice(0, 19)) {
      if (!r.dataUrl) continue;
      const fittedUrl = await fitJpegDataUrlUnderLimit(r.dataUrl, 420000);
      if (fittedUrl.length > 0 && fittedUrl.length <= 440000) {
        fittedRaws.push({ filename: r.filename, dataUrl: fittedUrl });
      }
    }

    for (let start = 0; start < fittedRaws.length; start += MEDIA_WRITE_CONCURRENCY) {
      assertDeviceOnline();
      const batchSlice = fittedRaws.slice(start, start + MEDIA_WRITE_CONCURRENCY);
      const uploadedSoFar = Math.min(start + batchSlice.length, fittedRaws.length);
      input.onProgress?.(`Mengunggah pose asli (${uploadedSoFar}/${fittedRaws.length})...`);

      await withTimeout(
        Promise.all(
          batchSlice.map((item, offset) => {
            const idx = start + offset;
            return setDoc(doc(db, 'orders', orderId, 'media', `raw_${idx}`), {
              kind: 'original',
              index: idx,
              totalChunks: fittedRaws.length,
              data: item.dataUrl,
              createdAt: serverTimestamp(),
            });
          })
        ),
        MEDIA_BATCH_TIMEOUT_MS,
        'Pengunggahan foto pose terputus. Periksa Wi-Fi lalu tekan Coba Kirim Ulang ke Kasir. Foto kamu tetap aman.'
      );
    }
  } catch (error) {
    console.error('Firestore order media upload failed:', error);
    throw toCloudOrderSyncError(error, 'mengunggah file foto');
  }

  return orderId;
}

export async function fetchOrderRawPhotos(orderId: string): Promise<RawPhotoPayload[]> {
  try {
    const firstSnap = await getDoc(doc(db, 'orders', orderId, 'media', 'raw_0'));
    if (!firstSnap.exists()) return [];
    const firstData = firstSnap.data() as { data: string; totalChunks?: number };
    const total = Math.max(1, Math.min(20, Number(firstData.totalChunks || 1)));
    const results: RawPhotoPayload[] = [
      { filename: 'Pose-01.jpg', dataUrl: firstData.data },
    ];
    if (total > 1) {
      const rest = await Promise.all(
        Array.from({ length: total - 1 }, (_, i) =>
          getDoc(doc(db, 'orders', orderId, 'media', `raw_${i + 1}`))
        )
      );
      rest.forEach((snap, idx) => {
        if (snap.exists()) {
          results.push({
            filename: `Pose-${String(idx + 2).padStart(2, '0')}.jpg`,
            dataUrl: (snap.data() as { data: string }).data,
          });
        }
      });
    }
    return results;
  } catch {
    return [];
  }
}

export async function fetchOrderMediaDataUrl(
  orderId: string,
  kind: 'original' | 'final',
  chunkCount: number
): Promise<string | null> {
  if (chunkCount <= 0) return null;
  const path = `orders/${orderId}/media`;
  try {
    const snaps = await Promise.all(
      Array.from({ length: chunkCount }, (_, i) =>
        getDoc(doc(db, 'orders', orderId, 'media', `${kind}_${i}`))
      )
    );
    const parts: string[] = [];
    for (const s of snaps) {
      if (!s.exists()) return null;
      parts.push((s.data() as { data: string }).data);
    }
    return parts.join('');
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

const GDRIVE_META_DOC_ID = 'gdrive_meta';
const GDRIVE_PENDING_DOC_ID = 'gdrive_pending';

function parseGDriveMetaData(raw: unknown): OrderGDriveLinkInfo | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OrderGDriveLinkInfo>;
    if (!parsed.folderId || !parsed.folderUrl) return null;
    return {
      folderId: parsed.folderId,
      folderUrl: parsed.folderUrl,
      fileCount: Number(parsed.fileCount) || 0,
    };
  } catch {
    return null;
  }
}

// Stored in orders/{orderId}/media/{docId}; Booth writes write-once docs with kind='original' while paymentStatus is PENDING_VERIFICATION
export async function saveOrderGDriveMeta(
  orderId: string,
  info: OrderGDriveLinkInfo,
  options?: {
    kind?: 'original' | 'final';
    docId?: typeof GDRIVE_META_DOC_ID | typeof GDRIVE_PENDING_DOC_ID;
  }
): Promise<void> {
  const docId = options?.docId || GDRIVE_META_DOC_ID;
  const kind = options?.kind || 'final';
  const path = `orders/${orderId}/media/${docId}`;
  try {
    await setDoc(doc(db, 'orders', orderId, 'media', docId), {
      kind,
      index: 0,
      totalChunks: 1,
      data: JSON.stringify(info),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchOrderGDriveMeta(
  orderId: string
): Promise<OrderGDriveLinkInfo | null> {
  try {
    const snap = await getDoc(doc(db, 'orders', orderId, 'media', GDRIVE_META_DOC_ID));
    if (!snap.exists()) return null;
    return parseGDriveMetaData((snap.data() as { data?: unknown }).data);
  } catch {
    return null;
  }
}

export async function fetchOrderGDrivePending(
  orderId: string
): Promise<OrderGDriveLinkInfo | null> {
  try {
    const snap = await getDoc(doc(db, 'orders', orderId, 'media', GDRIVE_PENDING_DOC_ID));
    if (!snap.exists()) return null;
    return parseGDriveMetaData((snap.data() as { data?: unknown }).data);
  } catch {
    return null;
  }
}

export async function saveCloudGDriveConfig(
  webAppUrl: string,
  rootFolderId: string
): Promise<void> {
  const cleanUrl = webAppUrl.trim();
  if (!cleanUrl) {
    try {
      await deletePackage(GDRIVE_CONFIG_PKG_ID);
    } catch {
      // Ignore if absent
    }
    return;
  }
  await savePackage(gdriveConfigToPackage({ webAppUrl: cleanUrl, rootFolderId }));
}

export function subscribeOrderGDriveMeta(
  orderId: string,
  onData: (info: OrderGDriveLinkInfo | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'orders', orderId, 'media', GDRIVE_META_DOC_ID),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(parseGDriveMetaData((snap.data() as { data?: unknown }).data));
    },
    () => {
      onData(null);
    }
  );
}

export async function verifyOrderPayment(order: PhotoboothOrder): Promise<void> {
  const path = `orders/${order.id}`;
  const nextWorkflow: WorkflowStatus = order.includesDoodle
    ? 'Waiting for Doodle'
    : order.wantsPrint
      ? 'Ready to Print'
      : 'Ready for Download';

  try {
    await updateDoc(doc(db, 'orders', order.id), {
      paymentStatus: 'VERIFIED',
      workflowStatus: nextWorkflow,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function rejectOrderPayment(orderId: string): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      paymentStatus: 'REJECTED',
      workflowStatus: 'Payment Rejected',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateOrderWorkflow(
  orderId: string,
  workflowStatus: WorkflowStatus
): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      workflowStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveOrderDoodleResult(
  order: PhotoboothOrder,
  finalPngDataUrl: string,
  previewThumbUrl: string
): Promise<void> {
  const orderPath = `orders/${order.id}`;
  let chunks = chunkDataUrl(finalPngDataUrl, 380000);
  if (chunks.length > 20) {
    chunks = chunkDataUrl(previewThumbUrl, 380000);
  }

  try {
    for (let i = 0; i < chunks.length; i++) {
      await setDoc(doc(db, 'orders', order.id, 'media', `final_${i}`), {
        kind: 'final',
        index: i,
        totalChunks: chunks.length,
        data: chunks[i],
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${orderPath}/media`);
  }

  const nextWorkflow: WorkflowStatus = order.wantsPrint
    ? 'Ready to Print'
    : 'Ready for Download';

  try {
    await updateDoc(doc(db, 'orders', order.id), {
      doodleDone: true,
      finalChunks: chunks.length,
      previewThumbUrl: previewThumbUrl.slice(0, 349000),
      workflowStatus: nextWorkflow,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, orderPath);
  }
}

export async function markOrderPrinted(orderId: string): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      printStatus: 'PRINTED',
      workflowStatus: 'Completed',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveStoreSettings(settings: StoreSettings): Promise<void> {
  const path = 'settings/store';
  try {
    await setDoc(doc(db, 'settings', 'store'), {
      printAddonPrice: Math.max(0, Number(settings.printAddonPrice) || 0),
      storeName: settings.storeName.trim().slice(0, 80) || 'WHOOPS!',
      qrisLabel: settings.qrisLabel.trim().slice(0, 120) || 'QRIS STATIS WHOOPS!',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function savePackage(pkg: ServicePackage): Promise<void> {
  const path = `packages/${pkg.id}`;
  try {
    await setDoc(doc(db, 'packages', pkg.id), {
      code: pkg.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 40),
      name: pkg.name.trim().slice(0, 80) || 'PAKET',
      description: pkg.description.trim().slice(0, 300),
      promoText: pkg.promoText.trim().slice(0, 40),
      digitalPrice: Math.max(0, Number(pkg.digitalPrice) || 0),
      includesDoodle: Boolean(pkg.includesDoodle),
      includesPrint: Boolean(pkg.includesPrint),
      isActive: Boolean(pkg.isActive),
      sortOrder: Number(pkg.sortOrder) || 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deletePackage(packageId: string): Promise<void> {
  const path = `packages/${packageId}`;
  try {
    await deleteDoc(doc(db, 'packages', packageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveFrame(frame: PhotoFrame): Promise<void> {
  const path = `frames/${frame.id}`;
  const encoded = encodeFrameForFirestore(frame);
  try {
    await setDoc(doc(db, 'frames', frame.id), {
      name: frame.name.trim().slice(0, 100) || 'Frame Baru',
      category: frame.category.trim().slice(0, 50) || 'Custom',
      type: frame.type === 'image' ? 'image' : 'vector',
      bg: encoded.bg,
      trim: encoded.trim,
      labelColor: encoded.labelColor,
      overlayImageData: encoded.overlayImageData,
      active: Boolean(frame.active),
      sortOrder: Number(frame.sortOrder) || 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteFrame(frameId: string): Promise<void> {
  const path = `frames/${frameId}`;
  try {
    await deleteDoc(doc(db, 'frames', frameId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function isOrderReadyForCloudMediaPurge(
  order: PhotoboothOrder,
  gdriveFolderUrl?: string
): boolean {
  if (order.paymentStatus === 'REJECTED') return true;
  if (order.paymentStatus !== 'VERIFIED') return false;

  const hasGdrive = Boolean((gdriveFolderUrl || order.gdriveFolderUrl || '').trim());
  if (!hasGdrive) return false;
  if (order.includesDoodle && !order.doodleDone) return false;
  if (order.wantsPrint && order.printStatus !== 'PRINTED') return false;

  return true;
}

/**
 * Deletes heavy base64 chunks (`original_*`, `raw_*`, `final_*`, `gdrive_pending`)
 * from `orders/{orderId}/media` while keeping `gdrive_meta` intact.
 */
export async function purgeOrderCloudMedia(orderId: string): Promise<number> {
  try {
    const mediaCol = collection(db, 'orders', orderId, 'media');
    const snap = await getDocs(mediaCol);
    const docsToDelete = snap.docs.filter((d) => d.id !== GDRIVE_META_DOC_ID);
    if (docsToDelete.length === 0) return 0;

    const batch = writeBatch(db);
    for (const d of docsToDelete) {
      batch.delete(d.ref);
    }
    await batch.commit();
    return docsToDelete.length;
  } catch {
    return 0;
  }
}
