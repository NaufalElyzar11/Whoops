import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  DEFAULT_FRAMES,
  DEFAULT_PACKAGES,
  DEFAULT_STORE_SETTINGS,
} from '../constants/defaults';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  PhotoFrame,
  PhotoboothOrder,
  RawPhotoPayload,
  ServicePackage,
  StoreSettings,
  WorkflowStatus,
} from '../types';
import { chunkDataUrl } from '../utils/canvasEngine';

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
        const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PhotoFrame, 'id'>) }));
        onData(items, true);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeOrders(
  onData: (orders: PhotoboothOrder[]) => void
): Unsubscribe {
  const path = 'orders';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PhotoboothOrder, 'id'>) }));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
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
        batch.set(doc(db, 'frames', fr.id), {
          name: fr.name,
          category: fr.category,
          type: fr.type,
          bg: fr.bg,
          trim: fr.trim,
          labelColor: fr.labelColor,
          overlayImageData: fr.overlayImageData,
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
}

export async function createPhotoboothOrder(input: CreateOrderInput): Promise<string> {
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

  const orderPath = `orders/${orderId}`;
  try {
    await setDoc(doc(db, 'orders', orderId), {
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
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, orderPath);
  }

  try {
    for (let i = 0; i < chunks.length; i++) {
      await setDoc(doc(db, 'orders', orderId, 'media', `original_${i}`), {
        kind: 'original',
        index: i,
        totalChunks: chunks.length,
        data: chunks[i],
        createdAt: serverTimestamp(),
      });
    }

    const validRaws = (input.rawPhotos || [])
      .filter((r) => r.dataUrl.length > 0 && r.dataUrl.length <= 440000)
      .slice(0, 19);

    for (let i = 0; i < validRaws.length; i++) {
      await setDoc(doc(db, 'orders', orderId, 'media', `raw_${i}`), {
        kind: 'original',
        index: i,
        totalChunks: validRaws.length,
        data: validRaws[i].dataUrl,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${orderPath}/media`);
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
  try {
    await setDoc(doc(db, 'frames', frame.id), {
      name: frame.name.trim().slice(0, 100) || 'Frame Baru',
      category: frame.category.trim().slice(0, 50) || 'Custom',
      type: frame.type === 'image' ? 'image' : 'vector',
      bg: frame.bg.slice(0, 20) || '#6D1D3A',
      trim: frame.trim.slice(0, 20) || '#FDF7EE',
      labelColor: frame.labelColor.slice(0, 20) || '#FDF7EE',
      overlayImageData: (frame.overlayImageData || '').slice(0, 750000),
      active: Boolean(frame.active),
      sortOrder: Number(frame.sortOrder) || 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
