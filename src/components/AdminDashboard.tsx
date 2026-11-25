import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import appsScriptCodeRaw from '../../google-apps-script/Code.gs?raw';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  HelpCircle,
  Loader2,
  LogIn,
  LogOut,
  Package,
  PenTool,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { getAdminAccessUrl, getBoothBaseUrl } from '../App';
import {
  DEFAULT_FRAMES,
  DEFAULT_PACKAGES,
  DEFAULT_STORE_SETTINGS,
  formatOrderTime,
  rupiah,
} from '../constants/defaults';
import { activeFirebaseConfig, auth, googleProvider } from '../firebase';
import {
  deleteDemoFrame,
  deleteDemoPackage,
  getDemoOrderMedia,
  getGDriveConfig,
  getOrderGDriveLinkMap,
  loadDemoState,
  saveDemoFrame,
  saveDemoPackage,
  saveDemoSettings,
  saveGDriveConfig,
  saveOrderGDriveLink,
  updateDemoOrder,
  type OrderGDriveLinkInfo,
} from '../services/demoStore';
import {
  DEFAULT_ORDERS_PAGE_SIZE,
  deleteFrame,
  deletePackage,
  fetchOrderGDriveMeta,
  fetchOrderGDrivePending,
  fetchOrderMediaDataUrl,
  fetchOrderRawPhotos,
  fetchOrdersByDateRange,
  isOrderReadyForCloudMediaPurge,
  markOrderPrinted,
  purgeOrderCloudMedia,
  rejectOrderPayment,
  saveCloudGDriveConfig,
  saveFrame,
  saveOrderGDriveMeta,
  savePackage,
  saveStoreSettings,
  seedInitialCatalogIfEmpty,
  subscribeOrderGDriveMeta,
  subscribeOrders,
  updateOrderWorkflow,
  verifyOrderPayment,
} from '../services/firestoreService';
import {
  extractGoogleDriveFolderId,
  testGoogleAppsScriptConnection,
  uploadDoodleToGoogleDrive,
  uploadOrderToGoogleDrive,
  validateAppsScriptWebAppUrl,
  type GDriveUploadProgress,
} from '../services/googleDriveService';
import type {
  AdminTab,
  DiscountType,
  GoogleDriveConfig,
  PhotoFrame,
  PhotoboothOrder,
  RawPhotoPayload,
  ServicePackage,
  StoreSettings,
  VoucherCode,
  WorkflowStatus,
} from '../types';
import {
  GDRIVE_CONFIG_CODE,
} from '../utils/gdriveConfigSync';
import {
  VOUCHER_CODE_PREFIX,
  formatVoucherBenefit,
  normalizeVoucherCode,
  voucherToPackage,
} from '../utils/voucher';
import { getFrameLayerOrder, getFrameSlotCount } from '../utils/frameLayouts';
import {
  buildDailyRecap,
  exportOrdersToCsv,
  formatRecapTextSummary,
  getLocalDayBounds,
  getTodayDateKey,
  isOrderAmountUnexpected,
  parseOrderDate,
} from '../utils/orderReport';
import {
  dataUrlToUint8Array,
  triggerBlobDownload,
} from '../utils/zipDownload';
import { DoodleStudioModal } from './DoodleStudioModal';
import { FramePreviewCanvas } from './FramePreviewCanvas';
import { OrderQrModal } from './OrderQrModal';
import { CanvaFramePanel } from './admin/CanvaFramePanel';

interface AdminDashboardProps {
  user: User | null;
  authLoading: boolean;
  adminUsingCloud: boolean;
  framesSynced?: boolean;
  cloudAccessDenied: boolean;
  onResetCloudAccessDenied: () => void;
  onCloudAccessDenied: () => void;
  demoOrders: PhotoboothOrder[];
  packages: ServicePackage[];
  vouchers: VoucherCode[];
  frames: PhotoFrame[];
  settings: StoreSettings;
  cloudGDriveConfig?: Pick<GoogleDriveConfig, 'webAppUrl' | 'rootFolderId'> | null;
}

const WORKFLOW_OPTIONS: WorkflowStatus[] = [
  'Waiting for Payment',
  'Waiting for Doodle',
  'In Progress',
  'Doodle Completed',
  'Ready for Download',
  'Ready to Print',
  'Completed',
];

export function AdminDashboard({
  user,
  authLoading,
  adminUsingCloud,
  framesSynced = true,
  cloudAccessDenied,
  onResetCloudAccessDenied,
  onCloudAccessDenied,
  demoOrders,
  packages,
  vouchers,
  frames,
  settings,
  cloudGDriveConfig = null,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('orders');
  const [cloudOrders, setCloudOrders] = useState<PhotoboothOrder[]>([]);
  const [orderFetchLimit, setOrderFetchLimit] = useState<number>(DEFAULT_ORDERS_PAGE_SIZE);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [isLoadingMoreOrders, setIsLoadingMoreOrders] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [recapScope, setRecapScope] = useState<'date' | 'all'>('date');
  const [recapDateKey, setRecapDateKey] = useState<string>(() => getTodayDateKey());
  const [fetchedDateRecap, setFetchedDateRecap] = useState<{
    dateKey: string;
    orders: PhotoboothOrder[];
  } | null>(null);
  const [isLoadingRecapDate, setIsLoadingRecapDate] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [copiedRecapText, setCopiedRecapText] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED'>('ALL');
  const [activeDoodleOrder, setActiveDoodleOrder] = useState<PhotoboothOrder | null>(null);
  const [activeQrOrder, setActiveQrOrder] = useState<PhotoboothOrder | null>(null);
  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null);
  const [isPurgingCloudMedia, setIsPurgingCloudMedia] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedLinkKind, setCopiedLinkKind] = useState<'admin' | 'booth' | null>(null);

  // Google Drive Apps Script Config & Upload State
  const [gdriveConfig, setGdriveConfig] = useState<GoogleDriveConfig>(() => getGDriveConfig());
  const [gdriveUrlDraft, setGdriveUrlDraft] = useState(gdriveConfig.webAppUrl);
  const [gdriveSecretDraft, setGdriveSecretDraft] = useState(gdriveConfig.secretKey);
  const [gdriveRootFolderDraft, setGdriveRootFolderDraft] = useState(gdriveConfig.rootFolderId);
  const [gdriveLinkMap, setGdriveLinkMap] = useState<Record<string, OrderGDriveLinkInfo>>(() =>
    getOrderGDriveLinkMap()
  );
  const [isTestingGdrive, setIsTestingGdrive] = useState(false);
  const [gdriveTestStatus, setGdriveTestStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [uploadingGdriveOrderId, setUploadingGdriveOrderId] = useState<string | null>(null);
  const [gdriveUploadProgress, setGdriveUploadProgress] = useState<GDriveUploadProgress | null>(null);
  const [gdriveUploadError, setGdriveUploadError] = useState<string | null>(null);
  const [gdriveUploadWarning, setGdriveUploadWarning] = useState<string | null>(null);
  const [showAppsScriptGuide, setShowAppsScriptGuide] = useState(false);
  const [copiedAppsScript, setCopiedAppsScript] = useState(false);
  const [cloudCatalogSeeded, setCloudCatalogSeeded] = useState(false);
  const syncedDemoFramesToCloudRef = useRef<Set<string>>(new Set());
  const gdriveSyncFetchedIdsRef = useRef<Set<string>>(new Set());
  const gdriveSectionRef = useRef<HTMLDivElement | null>(null);

  // Settings & package local editing buffers
  const [printAddonDraft, setPrintAddonDraft] = useState<number>(settings.printAddonPrice);
  const [qrisLabelDraft, setQrisLabelDraft] = useState<string>(settings.qrisLabel);
  const [pkgDrafts, setPkgDrafts] = useState<Record<string, ServicePackage>>({});
  const [showAddPackageForm, setShowAddPackageForm] = useState(false);
  const [newPkgName, setNewPkgName] = useState('');
  const [newPkgCode, setNewPkgCode] = useState('');
  const [newPkgCodeTouched, setNewPkgCodeTouched] = useState(false);
  const [newPkgPromo, setNewPkgPromo] = useState('');
  const [newPkgDesc, setNewPkgDesc] = useState('');
  const [newPkgPrice, setNewPkgPrice] = useState<number>(16000);
  const [newPkgIncludesDoodle, setNewPkgIncludesDoodle] = useState(false);
  const [newPkgIncludesPrint, setNewPkgIncludesPrint] = useState(false);
  const [newPkgSortOrder, setNewPkgSortOrder] = useState<number>(4);
  const [confirmDeletePkgId, setConfirmDeletePkgId] = useState<string | null>(null);
  const [voucherDrafts, setVoucherDrafts] = useState<Record<string, VoucherCode>>({});
  const [newVoucherCode, setNewVoucherCode] = useState('');
  const [newVoucherType, setNewVoucherType] = useState<DiscountType>('fixed');
  const [newVoucherValue, setNewVoucherValue] = useState<number>(5000);
  const [newVoucherDesc, setNewVoucherDesc] = useState('');
  const [confirmDeleteVoucherId, setConfirmDeleteVoucherId] = useState<string | null>(null);
  const [confirmDeleteFrameId, setConfirmDeleteFrameId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 2600);
  };

  useEffect(() => {
    setPrintAddonDraft(settings.printAddonPrice);
    setQrisLabelDraft(settings.qrisLabel);
  }, [settings.printAddonPrice, settings.qrisLabel]);

  useEffect(() => {
    const map: Record<string, ServicePackage> = {};
    let maxSort = 0;
    packages.forEach((p) => {
      map[p.id] = { ...p };
      if (p.sortOrder < 900 && p.sortOrder > maxSort) {
        maxSort = p.sortOrder;
      }
    });
    setPkgDrafts(map);
    setNewPkgSortOrder(Math.min(899, Math.max(1, maxSort + 1)));
  }, [packages]);

  useEffect(() => {
    const map: Record<string, VoucherCode> = {};
    vouchers.forEach((v) => {
      map[v.id] = { ...v };
    });
    setVoucherDrafts(map);
  }, [vouchers]);

  useEffect(() => {
    if (!user || !adminUsingCloud) {
      setCloudOrders([]);
      setOrdersLoading(false);
      setIsLoadingMoreOrders(false);
      setCloudCatalogSeeded(false);
      setFetchedDateRecap(null);
      syncedDemoFramesToCloudRef.current.clear();
      return;
    }

    let cancelled = false;
    setOrdersLoading(true);
    setAccessError(null);
    setCloudCatalogSeeded(false);

    seedInitialCatalogIfEmpty()
      .then(() => {
        if (cancelled) return;
        setCloudCatalogSeeded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setAccessError(
          `Akun ${user.email || user.uid} tidak memiliki izin Admin di Firestore (UID: ${user.uid}). Login dengan akun admin utama atau daftarkan UID ini ke koleksi admins. Dashboard tetap berjalan di Mode Demo Lokal.`
        );
        onCloudAccessDenied();
        setOrdersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, adminUsingCloud, onCloudAccessDenied]);

  useEffect(() => {
    if (!user || !adminUsingCloud || !cloudCatalogSeeded) return;

    let cancelled = false;
    const unsub = subscribeOrders(
      (list) => {
        if (cancelled) return;
        setCloudOrders(list);
        setOrdersLoading(false);
        setIsLoadingMoreOrders(false);
      },
      () => {
        if (cancelled) return;
        setAccessError(
          `Akun ${user.email || user.uid} tidak memiliki izin Admin di Firestore (UID: ${user.uid}). Login dengan akun admin utama atau daftarkan UID ini ke koleksi admins. Dashboard tetap berjalan di Mode Demo Lokal.`
        );
        onCloudAccessDenied();
        setOrdersLoading(false);
        setIsLoadingMoreOrders(false);
      },
      orderFetchLimit
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [user, adminUsingCloud, cloudCatalogSeeded, orderFetchLimit, onCloudAccessDenied]);

  useEffect(() => {
    if (!user || !adminUsingCloud || !framesSynced || !cloudCatalogSeeded) return;

    const localState = loadDemoState();
    if (!localState.hasCustomCatalog) return;

    const defaultFrameIds = new Set(DEFAULT_FRAMES.map((f) => f.id));
    const cloudFrameIds = new Set(frames.map((f) => f.id));
    const pendingFrames = localState.frames.filter(
      (df) =>
        !defaultFrameIds.has(df.id) &&
        !cloudFrameIds.has(df.id) &&
        !syncedDemoFramesToCloudRef.current.has(df.id)
    );
    if (pendingFrames.length === 0) return;

    let cancelled = false;
    for (const df of pendingFrames) {
      syncedDemoFramesToCloudRef.current.add(df.id);
    }

    void (async () => {
      let syncedCount = 0;
      for (const df of pendingFrames) {
        try {
          await saveFrame(df);
          syncedCount += 1;
        } catch (err) {
          console.error(`Gagal menyinkronkan frame demo ${df.id} ke Cloud:`, err);
        }
      }
      if (!cancelled && syncedCount > 0) {
        showToast(`${syncedCount} frame custom lokal ikut disinkronkan ke Cloud.`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, adminUsingCloud, framesSynced, cloudCatalogSeeded, frames]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'whoops_gdrive_config_v1') {
        const latest = getGDriveConfig();
        setGdriveConfig(latest);
        setGdriveUrlDraft(latest.webAppUrl);
        setGdriveSecretDraft(latest.secretKey);
        setGdriveRootFolderDraft(latest.rootFolderId);
      } else if (e.key === 'whoops_order_gdrive_links_v1') {
        setGdriveLinkMap(getOrderGDriveLinkMap());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!cloudGDriveConfig?.webAppUrl) return;
    setGdriveConfig((prev) => {
      if (prev.webAppUrl.trim()) return prev;
      const merged: GoogleDriveConfig = {
        webAppUrl: cloudGDriveConfig.webAppUrl,
        rootFolderId: cloudGDriveConfig.rootFolderId,
        secretKey: prev.secretKey,
      };
      saveGDriveConfig(merged);
      setGdriveUrlDraft(merged.webAppUrl);
      setGdriveRootFolderDraft(merged.rootFolderId);
      return merged;
    });
  }, [cloudGDriveConfig]);

  useEffect(() => {
    if (!adminUsingCloud || cloudOrders.length === 0) return;

    const candidates = cloudOrders.filter(
      (o) =>
        o.paymentStatus !== 'REJECTED' &&
        !o.gdriveFolderUrl &&
        !gdriveLinkMap[o.id]?.folderUrl &&
        !gdriveSyncFetchedIdsRef.current.has(o.id)
    );
    if (candidates.length === 0) return;

    candidates.forEach((o) => {
      if (o.paymentStatus === 'VERIFIED') {
        gdriveSyncFetchedIdsRef.current.add(o.id);
      }
    });
    let cancelled = false;

    void Promise.all(
      candidates.map(async (o) => {
        const meta = await fetchOrderGDriveMeta(o.id);
        return { orderId: o.id, meta };
      })
    ).then((results) => {
      if (cancelled) return;
      let latestMap: Record<string, OrderGDriveLinkInfo> | null = null;
      for (const item of results) {
        if (item.meta) {
          gdriveSyncFetchedIdsRef.current.add(item.orderId);
          latestMap = saveOrderGDriveLink(item.orderId, item.meta);
        }
      }
      if (latestMap) setGdriveLinkMap(latestMap);
    });

    return () => {
      cancelled = true;
    };
  }, [adminUsingCloud, cloudOrders, gdriveLinkMap]);

  const formatFirebaseAuthError = (err: unknown): string => {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';

    if (code === 'auth/unauthorized-domain') {
      const host = window.location.hostname || window.location.origin;
      return `Domain "${host}" belum diizinkan di Firebase Authentication -> Settings -> Authorized domains (Project: ${activeFirebaseConfig.projectId}).`;
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'Jendela login Google ditutup sebelum proses masuk selesai.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Koneksi internet bermasalah saat menghubungi Google Login.';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'Provider Google Sign-In belum diaktifkan di Firebase Authentication.';
    }
    if (code) {
      return `Gagal masuk dengan Google (${code}).`;
    }
    return 'Gagal masuk dengan Google. Pastikan pop-up diizinkan pada browser.';
  };

  useEffect(() => {
    void getRedirectResult(auth).catch((err) => {
      console.error('Redirect login error:', err);
      setAuthError(formatFirebaseAuthError(err));
    });
  }, []);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    onResetCloudAccessDenied();
    try {
      await signInWithPopup(auth, googleProvider);
      setAccessError(null);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr) {
          console.error('Redirect fallback error:', redirectErr);
          setAuthError(formatFirebaseAuthError(redirectErr));
          return;
        }
      }
      console.error('Login error:', err);
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleCopyQuickUrl = (kind: 'admin' | 'booth') => {
    const url = kind === 'admin' ? getAdminAccessUrl() : getBoothBaseUrl();
    navigator.clipboard?.writeText(url);
    setCopiedLinkKind(kind);
    window.setTimeout(() => setCopiedLinkKind(null), 2000);
    showToast(
      kind === 'admin'
        ? 'Link khusus Admin disalin! Simpan link ini di perangkat kasir.'
        : 'Link Booth iPad disalin!'
    );
  };

  const handleDownloadHighRes = async (
    order: PhotoboothOrder,
    kind: 'original' | 'final',
    filename: string
  ) => {
    setDownloadingOrderId(order.id);
    try {
      const localMedia = await getDemoOrderMedia(order.id);
      let dataUrl: string | null = null;
      if (localMedia) {
        dataUrl =
          kind === 'final'
            ? localMedia.doodleFinalPng || localMedia.fullCompositePng
            : localMedia.fullCompositePng;
      }
      if (!dataUrl && adminUsingCloud) {
        const count = kind === 'final' ? order.finalChunks : order.originalChunks;
        dataUrl = await fetchOrderMediaDataUrl(order.id, kind, count);
      }
      const resolvedUrl = dataUrl || order.previewThumbUrl;
      if (!resolvedUrl) {
        showToast(`File foto untuk ${order.orderCode} belum tersedia.`);
        return;
      }

      const bytes = dataUrlToUint8Array(resolvedUrl);
      if (bytes) {
        const mimeMatch = resolvedUrl.match(/^data:([^;]+);base64,/i);
        const mime = mimeMatch?.[1] || 'image/jpeg';
        const ext = mime.includes('png') ? 'png' : 'jpg';
        const matchedFilename = filename.replace(/\.(png|jpe?g)$/i, `.${ext}`);
        triggerBlobDownload(new Blob([bytes.buffer as ArrayBuffer], { type: mime }), matchedFilename);
      } else {
        const a = document.createElement('a');
        a.href = resolvedUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      showToast(`Foto 4R ${order.orderCode} berhasil diunduh.`);
    } finally {
      setDownloadingOrderId(null);
    }
  };

  const collectOrderMediaAssets = async (
    targetOrder: PhotoboothOrder
  ): Promise<{
    composite4RPng: string | null;
    doodle4RPng: string | null;
    rawPhotos: RawPhotoPayload[];
  }> => {
    const localMedia = await getDemoOrderMedia(targetOrder.id);
    let composite4RPng: string | null = localMedia?.fullCompositePng || null;
    let doodle4RPng: string | null = localMedia?.doodleFinalPng || null;
    let rawPhotos: RawPhotoPayload[] = localMedia?.rawPhotos || [];

    if (adminUsingCloud) {
      if (!composite4RPng && targetOrder.originalChunks > 0) {
        composite4RPng = await fetchOrderMediaDataUrl(
          targetOrder.id,
          'original',
          targetOrder.originalChunks
        );
      }
      if (!doodle4RPng && targetOrder.doodleDone && targetOrder.finalChunks > 0) {
        doodle4RPng = await fetchOrderMediaDataUrl(
          targetOrder.id,
          'final',
          targetOrder.finalChunks
        );
      }
      if (rawPhotos.length === 0) {
        rawPhotos = await fetchOrderRawPhotos(targetOrder.id);
      }
    }

    if (!composite4RPng && !doodle4RPng) {
      composite4RPng = targetOrder.previewThumbUrl || null;
    }

    return { composite4RPng, doodle4RPng, rawPhotos };
  };

  const maybeAutoPurgeOrderCloudMedia = async (
    targetOrder: PhotoboothOrder,
    resolvedGdriveUrl?: string
  ) => {
    if (!adminUsingCloud) return;
    if (!isOrderReadyForCloudMediaPurge(targetOrder, resolvedGdriveUrl)) return;
    await purgeOrderCloudMedia(targetOrder.id);
  };

  const persistSettings = async (nextSettings: StoreSettings) => {
    saveDemoSettings(nextSettings);
    if (adminUsingCloud) {
      await saveStoreSettings(nextSettings);
    }
  };

  const persistPackage = async (pkg: ServicePackage) => {
    saveDemoPackage(pkg);
    if (adminUsingCloud) {
      await savePackage(pkg);
    }
  };

  const persistDeletePackage = async (packageId: string) => {
    deleteDemoPackage(packageId);
    if (adminUsingCloud) {
      await deletePackage(packageId);
    }
  };

  const persistFrame = async (frame: PhotoFrame) => {
    saveDemoFrame(frame);
    if (adminUsingCloud) {
      await saveFrame(frame);
    }
  };

  const persistDeleteFrame = async (frameId: string) => {
    deleteDemoFrame(frameId);
    if (adminUsingCloud) {
      await deleteFrame(frameId);
    }
  };

  const applyResolvedGdriveInfo = (targetOrder: PhotoboothOrder, gdriveInfo: OrderGDriveLinkInfo) => {
    const nextMap = saveOrderGDriveLink(targetOrder.id, gdriveInfo);
    setGdriveLinkMap(nextMap);
    updateDemoOrder(targetOrder.id, {
      gdriveFolderId: gdriveInfo.folderId,
      gdriveFolderUrl: gdriveInfo.folderUrl,
      gdriveUploadedCount: gdriveInfo.fileCount,
    });
    setActiveQrOrder((prev) =>
      prev && prev.id === targetOrder.id
        ? {
            ...prev,
            gdriveFolderId: gdriveInfo.folderId,
            gdriveFolderUrl: gdriveInfo.folderUrl,
            gdriveUploadedCount: gdriveInfo.fileCount,
          }
        : prev
    );
  };

  const triggerUploadOrderToGdrive = async (
    targetOrder: PhotoboothOrder,
    forceReupload = false
  ) => {
    if (!gdriveConfig.webAppUrl.trim()) return;

    setUploadingGdriveOrderId(targetOrder.id);
    setGdriveUploadProgress(null);
    setGdriveUploadError(null);
    setGdriveUploadWarning(null);
    try {
      let existingFolderId =
        targetOrder.gdriveFolderId || gdriveLinkMap[targetOrder.id]?.folderId || undefined;

      // If Booth started uploading in background during package selection, reuse or await it before re-uploading
      if (adminUsingCloud && !forceReupload) {
        const cloudMeta = await fetchOrderGDriveMeta(targetOrder.id);
        if (cloudMeta?.folderUrl) {
          applyResolvedGdriveInfo(targetOrder, cloudMeta);
          void maybeAutoPurgeOrderCloudMedia(targetOrder, cloudMeta.folderUrl);
          showToast(`Folder Google Drive siap (${targetOrder.orderCode}).`);
          return;
        }

        const pendingMeta = await fetchOrderGDrivePending(targetOrder.id);
        if (pendingMeta?.folderId) {
          existingFolderId = existingFolderId || pendingMeta.folderId;
          const completedFromBooth = await new Promise<OrderGDriveLinkInfo | null>((resolve) => {
            let settled = false;
            let unsub: (() => void) | undefined;
            const timer = window.setTimeout(() => {
              if (settled) return;
              settled = true;
              unsub?.();
              resolve(null);
            }, 8000);
            unsub = subscribeOrderGDriveMeta(targetOrder.id, (meta) => {
              if (!meta || settled) return;
              settled = true;
              window.clearTimeout(timer);
              unsub?.();
              resolve(meta);
            });
          });
          if (completedFromBooth?.folderUrl) {
            applyResolvedGdriveInfo(targetOrder, completedFromBooth);
            void maybeAutoPurgeOrderCloudMedia(targetOrder, completedFromBooth.folderUrl);
            showToast(`Folder Google Drive selesai diunggah dari Booth (${targetOrder.orderCode}).`);
            return;
          }
        }
      }

      const { composite4RPng, doodle4RPng, rawPhotos } =
        await collectOrderMediaAssets(targetOrder);
      const effectiveComposite = targetOrder.doodleDone
        ? doodle4RPng || composite4RPng
        : composite4RPng;

      const uploaded = await uploadOrderToGoogleDrive(
        gdriveConfig,
        targetOrder,
        effectiveComposite,
        rawPhotos,
        existingFolderId,
        (progress) => setGdriveUploadProgress(progress)
      );

      const gdriveInfo: OrderGDriveLinkInfo = {
        folderId: uploaded.folderId,
        folderUrl: uploaded.folderUrl,
        fileCount: uploaded.fileCount,
      };
      applyResolvedGdriveInfo(targetOrder, gdriveInfo);

      if (adminUsingCloud) {
        try {
          await saveOrderGDriveMeta(targetOrder.id, gdriveInfo);
          await maybeAutoPurgeOrderCloudMedia(targetOrder, gdriveInfo.folderUrl);
        } catch (metaErr) {
          console.warn('Cloud GDrive link sync skipped/failed:', metaErr);
        }
      }

      if (uploaded.sharingWarning) {
        setGdriveUploadWarning(uploaded.sharingWarning);
      }

      showToast(
        `${uploaded.fileCount} file (mentah + 4R) terunggah ke Google Drive (${targetOrder.orderCode}).`
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal mengupload foto ke Google Drive.';
      setGdriveUploadError(msg);
      showToast(`Upload Google Drive gagal: ${msg}`);
    } finally {
      setUploadingGdriveOrderId(null);
      setGdriveUploadProgress(null);
    }
  };

  const handleVerifyAndOpenQr = async (order: PhotoboothOrder) => {
    try {
      const nextWorkflow: WorkflowStatus = order.includesDoodle
        ? 'Waiting for Doodle'
        : order.wantsPrint
          ? 'Ready to Print'
          : 'Ready for Download';

      updateDemoOrder(order.id, {
        paymentStatus: 'VERIFIED',
        workflowStatus: nextWorkflow,
      });

      if (adminUsingCloud) {
        await verifyOrderPayment(order);
      }

      const verifiedOrder: PhotoboothOrder = {
        ...order,
        paymentStatus: 'VERIFIED',
        workflowStatus: nextWorkflow,
      };
      setGdriveUploadError(null);
      setGdriveUploadWarning(null);
      setGdriveUploadProgress(null);
      setActiveQrOrder(verifiedOrder);
      showToast(`Pesanan ${order.orderCode} terverifikasi.`);

      const existingFolderUrl =
        verifiedOrder.gdriveFolderUrl || gdriveLinkMap[verifiedOrder.id]?.folderUrl;
      if (existingFolderUrl) {
        void maybeAutoPurgeOrderCloudMedia(verifiedOrder, existingFolderUrl);
      } else if (gdriveConfig.webAppUrl.trim()) {
        void triggerUploadOrderToGdrive(verifiedOrder);
      }
    } catch {
      showToast(`Gagal memverifikasi pesanan ${order.orderCode}.`);
    }
  };

  const handleRejectOrder = async (order: PhotoboothOrder) => {
    try {
      updateDemoOrder(order.id, {
        paymentStatus: 'REJECTED',
        workflowStatus: 'Completed',
      });
      if (adminUsingCloud) {
        await rejectOrderPayment(order.id);
        void purgeOrderCloudMedia(order.id);
      }
      showToast(`Pesanan ${order.orderCode} ditolak.`);
    } catch {
      showToast(`Gagal menolak pesanan ${order.orderCode}.`);
    }
  };

  const handleWorkflowChange = async (orderId: string, workflowStatus: WorkflowStatus) => {
    updateDemoOrder(orderId, { workflowStatus });
    if (adminUsingCloud) {
      await updateOrderWorkflow(orderId, workflowStatus);
    }
  };

  const handleMarkPrinted = async (order: PhotoboothOrder) => {
    try {
      updateDemoOrder(order.id, {
        printStatus: 'PRINTED',
        workflowStatus: 'Completed',
      });
      if (adminUsingCloud) {
        await markOrderPrinted(order.id);
        const existingFolderUrl =
          order.gdriveFolderUrl || gdriveLinkMap[order.id]?.folderUrl;
        void maybeAutoPurgeOrderCloudMedia(
          { ...order, printStatus: 'PRINTED', workflowStatus: 'Completed' },
          existingFolderUrl
        );
      }
      showToast(`Pesanan ${order.orderCode} ditandai sudah dicetak.`);
    } catch {
      showToast(`Gagal memperbarui status cetak ${order.orderCode}.`);
    }
  };

  const handleSaveGdriveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRootId = extractGoogleDriveFolderId(gdriveRootFolderDraft);
    const cleanUrl = gdriveUrlDraft.trim();

    if (cleanUrl) {
      try {
        validateAppsScriptWebAppUrl(cleanUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'URL Web App tidak valid.';
        setGdriveTestStatus({ ok: false, message: msg });
        return;
      }
    }

    const next: GoogleDriveConfig = {
      webAppUrl: cleanUrl,
      secretKey: gdriveSecretDraft.trim(),
      rootFolderId: cleanRootId,
    };
    setGdriveUrlDraft(cleanUrl);
    setGdriveRootFolderDraft(cleanRootId);
    saveGDriveConfig(next);
    setGdriveConfig(next);
    setGdriveTestStatus(null);

    if (adminUsingCloud) {
      try {
        await saveCloudGDriveConfig(next.webAppUrl, next.rootFolderId);
        showToast('Konfigurasi Google Apps Script tersimpan & tersinkron ke Booth!');
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal sinkron URL GDrive ke Cloud.';
        setGdriveTestStatus({ ok: false, message: msg });
      }
    }

    showToast('Konfigurasi Google Apps Script tersimpan.');
  };

  const handleTestGdriveConnection = async () => {
    const cleanRootId = extractGoogleDriveFolderId(gdriveRootFolderDraft);
    const cleanUrl = gdriveUrlDraft.trim();
    const candidate: GoogleDriveConfig = {
      webAppUrl: cleanUrl,
      secretKey: gdriveSecretDraft.trim(),
      rootFolderId: cleanRootId,
    };
    setGdriveUrlDraft(cleanUrl);
    setGdriveRootFolderDraft(cleanRootId);
    saveGDriveConfig(candidate);
    setGdriveConfig(candidate);
    setIsTestingGdrive(true);
    setGdriveTestStatus(null);
    try {
      const msg = await testGoogleAppsScriptConnection(candidate);
      if (adminUsingCloud) {
        await saveCloudGDriveConfig(candidate.webAppUrl, candidate.rootFolderId).catch(() => {});
      }
      setGdriveTestStatus({ ok: true, message: msg });
    } catch (err) {
      setGdriveTestStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Koneksi gagal.',
      });
    } finally {
      setIsTestingGdrive(false);
    }
  };

  const handleCopyAppsScriptCode = () => {
    navigator.clipboard?.writeText(appsScriptCodeRaw);
    setCopiedAppsScript(true);
    window.setTimeout(() => setCopiedAppsScript(false), 2000);
    showToast('Kode Code.gs disalin! Tempel ke script.google.com.');
  };

  const openGdriveSettingsSection = () => {
    setActiveTab('packages');
    setShowAppsScriptGuide(true);
    window.setTimeout(() => {
      gdriveSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleSaveSettings = async () => {
    setSavingId('settings');
    try {
      await persistSettings({
        ...settings,
        printAddonPrice: printAddonDraft,
        qrisLabel: qrisLabelDraft,
      });
      showToast('Pengaturan harga cetak & QRIS tersimpan.');
    } catch {
      showToast('Gagal menyimpan pengaturan harga & QRIS.');
    } finally {
      setSavingId(null);
    }
  };

  const normalizePackageCodeInput = (raw: string): string =>
    raw
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_')
      .replace(/[^A-Z0-9_]/g, '')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);

  const isReservedPackageCode = (code: string): boolean =>
    !code || code.startsWith(VOUCHER_CODE_PREFIX) || code === GDRIVE_CONFIG_CODE;

  const hasLegacyPricingCatalog = useMemo(() => {
    const pkg1 = packages.find((p) => p.id === 'pkg-1');
    const pkg3 = packages.find((p) => p.id === 'pkg-3');
    return (
      settings.printAddonPrice === 10000 &&
      (pkg1?.digitalPrice === 10000 || pkg3?.code === 'PHOTO_DOODLE_PRINT')
    );
  }, [packages, settings.printAddonPrice]);

  const handleApplyLatestPricingDefaults = async () => {
    setSavingId('apply-default-pricing');
    try {
      const nextSettings: StoreSettings = {
        ...settings,
        printAddonPrice: DEFAULT_STORE_SETTINGS.printAddonPrice,
      };
      await persistSettings(nextSettings);
      for (const defPkg of DEFAULT_PACKAGES) {
        await persistPackage({ ...defPkg });
      }
      showToast('Daftar harga terbaru (16rb / 21rb / 26rb + Cetak 4R Rp 5rb) diterapkan!');
    } catch {
      showToast('Gagal menerapkan daftar harga terbaru.');
    } finally {
      setSavingId(null);
    }
  };

  const handleSavePackage = async (pkgId: string) => {
    const draft = pkgDrafts[pkgId];
    if (!draft) return;
    const cleanName = draft.name.trim().slice(0, 80);
    if (!cleanName) {
      showToast('Nama paket tidak boleh kosong.');
      return;
    }
    const cleanCode = normalizePackageCodeInput(draft.code) || 'PAKET';
    if (isReservedPackageCode(cleanCode)) {
      showToast('Kode paket tidak boleh diawali VOUCHER_ atau memakai kode sistem.');
      return;
    }

    const sanitized: ServicePackage = {
      ...draft,
      code: cleanCode,
      name: cleanName,
      description: draft.description.trim().slice(0, 300),
      promoText: draft.promoText.trim().slice(0, 40),
      digitalPrice: Math.max(0, Math.min(10000000, Math.round(Number(draft.digitalPrice) || 0))),
      sortOrder: Math.max(0, Math.min(899, Math.round(Number(draft.sortOrder) || 1))),
    };

    setSavingId(pkgId);
    try {
      await persistPackage(sanitized);
      showToast(`Paket "${sanitized.name}" berhasil diperbarui.`);
    } catch {
      showToast(`Gagal memperbarui paket "${sanitized.name}".`);
    } finally {
      setSavingId(null);
    }
  };

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newPkgName.trim().slice(0, 80);
    if (!cleanName) {
      showToast('Masukkan nama paket terlebih dahulu.');
      return;
    }

    let cleanCode = normalizePackageCodeInput(newPkgCode || cleanName);
    if (!cleanCode) cleanCode = `PKG_${Date.now().toString().slice(-4)}`;
    if (isReservedPackageCode(cleanCode)) {
      showToast('Kode paket tidak boleh diawali VOUCHER_ atau memakai CONFIG_GDRIVE.');
      return;
    }
    if (packages.some((p) => p.code === cleanCode)) {
      cleanCode = `${cleanCode.slice(0, 34)}_${packages.length + 1}`;
    }

    const cleanPrice = Math.max(0, Math.min(10000000, Math.round(Number(newPkgPrice) || 0)));
    const cleanSort = Math.max(0, Math.min(899, Math.round(Number(newPkgSortOrder) || packages.length + 1)));

    const newPkg: ServicePackage = {
      id: `pkg-${Date.now()}`,
      code: cleanCode,
      name: cleanName,
      description: newPkgDesc.trim().slice(0, 300),
      promoText: newPkgPromo.trim().slice(0, 40),
      digitalPrice: cleanPrice,
      includesDoodle: newPkgIncludesDoodle,
      includesPrint: newPkgIncludesPrint,
      isActive: true,
      sortOrder: cleanSort,
    };

    setSavingId('new-package');
    try {
      await persistPackage(newPkg);
      setNewPkgName('');
      setNewPkgCode('');
      setNewPkgCodeTouched(false);
      setNewPkgPromo('');
      setNewPkgDesc('');
      setNewPkgPrice(16000);
      setNewPkgIncludesDoodle(false);
      setNewPkgIncludesPrint(false);
      setShowAddPackageForm(false);
      showToast(`Paket baru "${newPkg.name}" berhasil ditambahkan ke Booth!`);
    } catch {
      showToast(`Gagal menambahkan paket "${newPkg.name}".`);
    } finally {
      setSavingId(null);
    }
  };

  const handleDeletePackage = async (pkg: ServicePackage) => {
    if (packages.length <= 1) {
      showToast('Minimal harus tersisa 1 paket di sistem.');
      return;
    }
    setSavingId(pkg.id);
    try {
      await persistDeletePackage(pkg.id);
      setConfirmDeletePkgId(null);
      showToast(`Paket "${pkg.name}" dihapus.`);
    } catch {
      showToast(`Gagal menghapus paket "${pkg.name}".`);
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = normalizeVoucherCode(newVoucherCode);
    if (!cleanCode) {
      showToast('Masukkan kode voucher huruf/angka (misal: HEMAT5K).');
      return;
    }
    if (vouchers.some((v) => v.code === cleanCode)) {
      showToast(`Kode voucher "${cleanCode}" sudah ada.`);
      return;
    }
    const cleanValue = Math.max(0, Math.round(Number(newVoucherValue) || 0));
    if (cleanValue <= 0) {
      showToast('Nilai potongan voucher harus lebih dari 0.');
      return;
    }
    if (newVoucherType === 'percent' && cleanValue > 100) {
      showToast('Persentase diskon maksimal 100%.');
      return;
    }

    setSavingId('new-voucher');
    try {
      const id = `vch-${Date.now()}`;
      const voucher: VoucherCode = {
        id,
        code: cleanCode,
        discountType: newVoucherType,
        discountValue: cleanValue,
        description: newVoucherDesc.trim(),
        isActive: true,
      };
      await persistPackage(voucherToPackage(voucher, 900 + vouchers.length));
      setNewVoucherCode('');
      setNewVoucherDesc('');
      showToast(`Voucher "${cleanCode}" (${formatVoucherBenefit(voucher)}) dibuat.`);
    } catch {
      showToast(`Gagal menyimpan voucher "${cleanCode}".`);
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveVoucher = async (voucherId: string) => {
    const draft = voucherDrafts[voucherId];
    if (!draft) return;
    const cleanCode = normalizeVoucherCode(draft.code);
    if (!cleanCode) {
      showToast('Kode voucher tidak boleh kosong.');
      return;
    }
    if (draft.discountType === 'percent' && (draft.discountValue <= 0 || draft.discountValue > 100)) {
      showToast('Diskon persen harus di antara 1 sampai 100%.');
      return;
    }
    setSavingId(voucherId);
    try {
      const normalized = { ...draft, code: cleanCode };
      await persistPackage(voucherToPackage(normalized));
      showToast(`Voucher "${cleanCode}" diperbarui.`);
    } catch {
      showToast(`Gagal memperbarui voucher "${cleanCode}".`);
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteVoucher = async (voucher: VoucherCode) => {
    setSavingId(voucher.id);
    try {
      await persistDeletePackage(voucher.id);
      setConfirmDeleteVoucherId(null);
      showToast(`Voucher "${voucher.code}" dihapus.`);
    } catch {
      showToast(`Gagal menghapus voucher "${voucher.code}".`);
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveNewFrame = async (frame: PhotoFrame) => {
    setSavingId('new-frame');
    try {
      await persistFrame(frame);
      showToast(`Frame "${frame.name}" berhasil ditambahkan ke Booth!`);
    } catch {
      showToast('Gagal menyimpan frame baru.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteFrame = async (frame: PhotoFrame) => {
    if (frames.length <= 1) {
      showToast('Minimal harus tersisa 1 frame di sistem.');
      return;
    }
    setSavingId(frame.id);
    try {
      await persistDeleteFrame(frame.id);
      setConfirmDeleteFrameId(null);
      showToast(`Frame "${frame.name}" dihapus.`);
    } catch {
      showToast(`Gagal menghapus frame "${frame.name}".`);
    } finally {
      setSavingId(null);
    }
  };

  const enrichWithGdrive = (list: PhotoboothOrder[]): PhotoboothOrder[] =>
    list.map((o) => {
      const g = gdriveLinkMap[o.id];
      if (!g && !o.gdriveFolderUrl) return o;
      return {
        ...o,
        gdriveFolderId: o.gdriveFolderId || g?.folderId,
        gdriveFolderUrl: o.gdriveFolderUrl || g?.folderUrl,
        gdriveUploadedCount: o.gdriveUploadedCount ?? g?.fileCount,
      };
    });

  const rawBaseOrders = adminUsingCloud ? cloudOrders : demoOrders.slice(0, orderFetchLimit);
  const orders = useMemo(
    () => enrichWithGdrive(rawBaseOrders),
    [rawBaseOrders, gdriveLinkMap]
  );

  const hasMoreOrders = adminUsingCloud
    ? cloudOrders.length >= orderFetchLimit
    : demoOrders.length > orderFetchLimit;

  const handleLoadMoreOrders = () => {
    if (isLoadingMoreOrders) return;
    if (adminUsingCloud) setIsLoadingMoreOrders(true);
    setOrderFetchLimit((prev) => prev + DEFAULT_ORDERS_PAGE_SIZE);
  };

  const recapMayBeIncomplete = useMemo(() => {
    if (!adminUsingCloud || recapScope !== 'date') return false;
    if (fetchedDateRecap?.dateKey === recapDateKey) return false;
    if (cloudOrders.length < orderFetchLimit) return false;

    const bounds = getLocalDayBounds(recapDateKey);
    if (!bounds) return false;

    const oldestLoaded = cloudOrders[cloudOrders.length - 1];
    const oldestDate = parseOrderDate(oldestLoaded?.createdAt);
    if (!oldestDate) return true;
    return oldestDate.getTime() >= bounds.start.getTime();
  }, [adminUsingCloud, recapScope, fetchedDateRecap, recapDateKey, cloudOrders, orderFetchLimit]);

  const recapSourceOrders = useMemo(() => {
    if (!adminUsingCloud) {
      return enrichWithGdrive(demoOrders);
    }
    if (recapScope === 'date' && fetchedDateRecap?.dateKey === recapDateKey) {
      const merged = new Map<string, PhotoboothOrder>();
      for (const o of fetchedDateRecap.orders) merged.set(o.id, o);
      for (const o of orders) merged.set(o.id, o);
      return enrichWithGdrive(Array.from(merged.values())).sort((a, b) => {
        const da = parseOrderDate(a.createdAt)?.getTime() || 0;
        const db = parseOrderDate(b.createdAt)?.getTime() || 0;
        return db - da;
      });
    }
    return orders;
  }, [adminUsingCloud, demoOrders, recapScope, fetchedDateRecap, recapDateKey, orders, gdriveLinkMap]);

  const dailyRecap = useMemo(
    () => buildDailyRecap(recapSourceOrders, recapScope === 'date' ? recapDateKey : 'ALL'),
    [recapSourceOrders, recapScope, recapDateKey]
  );

  const handleFetchDateRecap = async (targetDateKey = recapDateKey): Promise<PhotoboothOrder[] | null> => {
    if (!adminUsingCloud) return null;
    const bounds = getLocalDayBounds(targetDateKey);
    if (!bounds) return null;

    setIsLoadingRecapDate(true);
    setRecapError(null);
    try {
      const fetched = await fetchOrdersByDateRange(bounds.start, bounds.end);
      setFetchedDateRecap({ dateKey: targetDateKey, orders: fetched });
      return fetched;
    } catch {
      setRecapError('Gagal memuat data lengkap tanggal tersebut. Periksa koneksi internet kasir.');
      return null;
    } finally {
      setIsLoadingRecapDate(false);
    }
  };

  const handleExportCsv = async () => {
    if (isExportingCsv) return;
    setIsExportingCsv(true);
    setRecapError(null);
    try {
      let targetOrders = dailyRecap.ordersForPeriod;

      if (adminUsingCloud && recapScope === 'date' && recapMayBeIncomplete) {
        const fetched = await handleFetchDateRecap(recapDateKey);
        if (fetched) {
          const merged = new Map<string, PhotoboothOrder>();
          for (const o of fetched) merged.set(o.id, o);
          for (const o of orders) merged.set(o.id, o);
          const enriched = enrichWithGdrive(Array.from(merged.values())).sort((a, b) => {
            const da = parseOrderDate(a.createdAt)?.getTime() || 0;
            const db = parseOrderDate(b.createdAt)?.getTime() || 0;
            return db - da;
          });
          targetOrders = buildDailyRecap(enriched, recapDateKey).ordersForPeriod;
        }
      }

      if (targetOrders.length === 0) {
        showToast('Tidak ada pesanan pada periode ini untuk diexport.');
        return;
      }

      const label = recapScope === 'date' ? recapDateKey : `Semua-${targetOrders.length}`;
      exportOrdersToCsv(targetOrders, label);
      showToast(`Rekap ${targetOrders.length} pesanan diunduh sebagai CSV.`);
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleCopyRecapSummary = async () => {
    setRecapError(null);
    let recapToCopy = dailyRecap;

    if (adminUsingCloud && recapScope === 'date' && recapMayBeIncomplete) {
      const fetched = await handleFetchDateRecap(recapDateKey);
      if (fetched) {
        const merged = new Map<string, PhotoboothOrder>();
        for (const o of fetched) merged.set(o.id, o);
        for (const o of orders) merged.set(o.id, o);
        const enriched = enrichWithGdrive(Array.from(merged.values()));
        recapToCopy = buildDailyRecap(enriched, recapDateKey);
      }
    }

    const periodLabel =
      recapScope === 'date' ? recapDateKey : `Semua dimuat (${orders.length} pesanan)`;
    const text = formatRecapTextSummary(recapToCopy, periodLabel);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRecapText(true);
      window.setTimeout(() => setCopiedRecapText(false), 2200);
      showToast('Ringkasan omzet disalin, siap tempel ke WhatsApp.');
    } catch {
      showToast('Gagal menyalin otomatis. Gunakan tombol Export CSV.');
    }
  };

  const handleBulkPurgeCloudMedia = async () => {
    if (!adminUsingCloud || isPurgingCloudMedia) return;
    const candidates = orders.filter((o) =>
      isOrderReadyForCloudMediaPurge(o, o.gdriveFolderUrl)
    );
    if (candidates.length === 0) {
      showToast('Belum ada pesanan selesai (sudah di Google Drive) yang perlu dibersihkan.');
      return;
    }

    setIsPurgingCloudMedia(true);
    try {
      let deletedChunks = 0;
      let cleanedOrders = 0;
      for (const ord of candidates) {
        const count = await purgeOrderCloudMedia(ord.id);
        if (count > 0) {
          deletedChunks += count;
          cleanedOrders += 1;
        }
      }
      if (deletedChunks > 0) {
        showToast(
          `Cache Firestore dibersihkan: ${deletedChunks} chunk foto dari ${cleanedOrders} pesanan selesai dihapus (link GDrive tetap aman).`
        );
      } else {
        showToast('Cache Firestore sudah bersih untuk semua pesanan yang selesai.');
      }
    } finally {
      setIsPurgingCloudMedia(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesStatus = statusFilter === 'ALL' || o.paymentStatus === statusFilter;
    const matchesSearch =
      !searchTerm.trim() ||
      o.orderCode.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
      o.packageName.toLowerCase().includes(searchTerm.trim().toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const pendingCount = orders.filter((o) => o.paymentStatus === 'PENDING_VERIFICATION').length;
  const latestPendingOrder =
    orders.find((o) => o.paymentStatus === 'PENDING_VERIFICATION') || null;
  const latestPendingOrderId = latestPendingOrder?.id || null;
  const latestPendingHasGdrive = Boolean(latestPendingOrder?.gdriveFolderUrl);

  useEffect(() => {
    if (!adminUsingCloud || !latestPendingOrderId || latestPendingHasGdrive) return;
    return subscribeOrderGDriveMeta(latestPendingOrderId, (meta) => {
      if (!meta) return;
      gdriveSyncFetchedIdsRef.current.add(latestPendingOrderId);
      setGdriveLinkMap(saveOrderGDriveLink(latestPendingOrderId, meta));
    });
  }, [adminUsingCloud, latestPendingOrderId, latestPendingHasGdrive]);
  const doodleOrders = orders.filter((o) => o.includesDoodle);
  const printOrders = orders.filter(
    (o) => o.paymentStatus === 'VERIFIED' && o.wantsPrint
  );

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'orders', label: pendingCount > 0 ? `Orders (${pendingCount})` : 'Orders' },
    { id: 'doodle', label: 'Doodle Queue & Upload' },
    { id: 'print', label: 'Print Queue' },
    { id: 'packages', label: 'Harga, Paket & Voucher' },
    { id: 'frames', label: 'Frames' },
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`whoops-btn px-3.5 py-2 text-xs sm:text-sm whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === t.id ? 'whoops-btn-primary' : 'whoops-btn-ghost'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-lg border border-[#3A231E] text-[11px] font-display font-bold ${
              adminUsingCloud
                ? 'bg-emerald-100 text-emerald-900'
                : 'bg-[#F3D2DB] text-[#6D1D3A]'
            }`}
          >
            {adminUsingCloud
              ? `Cloud Sync (${user?.email || 'Admin'})`
              : 'Mode Demo (Tanpa Login)'}
          </span>

          <button
            type="button"
            onClick={openGdriveSettingsSection}
            className={`whoops-btn whoops-btn-compact px-2.5 py-1.5 text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              gdriveConfig.webAppUrl.trim()
                ? 'bg-emerald-100 text-emerald-900'
                : 'whoops-btn-ghost'
            }`}
            title="Atur koneksi Google Apps Script untuk upload otomatis ke Google Drive"
          >
            <CloudUpload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {gdriveConfig.webAppUrl.trim() ? 'GDrive: Aktif' : 'Sambungkan GDrive'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleCopyQuickUrl('admin')}
            className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1.5 text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            title="Salin tautan khusus Admin untuk disimpan di tablet/laptop kasir"
          >
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{copiedLinkKind === 'admin' ? 'Link Disalin!' : 'Salin Link Admin'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleCopyQuickUrl('booth')}
            className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1.5 text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            title="Salin tautan Booth iPad (tanpa tombol Admin)"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{copiedLinkKind === 'booth' ? 'Disalin!' : 'Link Booth'}</span>
          </button>

          {adminUsingCloud ? (
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="whoops-btn whoops-btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Keluar</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={authLoading}
              onClick={handleGoogleLogin}
              className="whoops-btn whoops-btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Opsional: masuk akun Google Admin jika ingin sync 2 perangkat berbeda"
            >
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {cloudAccessDenied ? 'Ganti Akun Google' : 'Hubungkan Google (Sync)'}
              </span>
            </button>
          )}
        </div>
      </div>

      {(authError || accessError) && (
        <div className="whoops-card-sm px-4 py-2.5 bg-amber-50 border-[#3A231E] text-xs text-[#3A231E] flex flex-wrap items-center justify-between gap-2">
          <span>{accessError || authError}</span>
          {user && cloudAccessDenied && (
            <button
              type="button"
              onClick={() => {
                setAccessError(null);
                void signOut(auth);
              }}
              className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] cursor-pointer"
            >
              Putus Akun Ini
            </button>
          )}
        </div>
      )}

      {toastMsg && (
        <div className="whoops-card-sm px-4 py-2.5 bg-emerald-50 text-emerald-900 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* TAB 1: ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Single-Booth No-Code Latest Entry Card */}
          {latestPendingOrder && (
            <div className="whoops-card p-4 sm:p-5 bg-gradient-to-br from-[#FDF7EE] to-[#F3D2DB]/45 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                {latestPendingOrder.previewThumbUrl && (
                  <div className="w-16 sm:w-20 aspect-[1205/1795] rounded-xl overflow-hidden border-2 border-[#3A231E] bg-white shrink-0 shadow-[2px_2px_0_#3A231E]">
                    <img
                      src={latestPendingOrder.previewThumbUrl}
                      alt={`Foto terbaru ${latestPendingOrder.orderCode}`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-md bg-[#6D1D3A] text-[#FDF7EE] border border-[#3A231E] text-[10px] font-display font-bold uppercase tracking-wide">
                      Terbaru dari Booth
                    </span>
                    {latestPendingOrder.gdriveFolderUrl && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-[#3A231E] text-[10px] font-display font-bold inline-flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" aria-hidden="true" />
                        <span>GDrive Siap</span>
                      </span>
                    )}
                    <span className="text-xs font-mono-tabular text-[#61433B]">
                      {formatOrderTime(latestPendingOrder.createdAt)} | Ref {latestPendingOrder.orderCode}
                    </span>
                  </div>
                  <div className="font-display font-bold text-base sm:text-lg text-[#3A231E]">
                    {latestPendingOrder.packageName}
                    {latestPendingOrder.wantsPrint ? ' + Cetak 4R' : ''}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-display font-bold text-2xl text-[#6D1D3A] tabular-nums">
                      {rupiah(latestPendingOrder.totalAmount)}
                    </div>
                    {(() => {
                      const check = isOrderAmountUnexpected(
                        latestPendingOrder,
                        packages,
                        settings.printAddonPrice
                      );
                      if (!check.unexpected) return null;
                      return (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 border border-[#3A231E] text-[11px] font-display font-bold text-amber-950"
                          title={`Harga normal paket ini tanpa voucher adalah ${rupiah(check.expectedTotal)}`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>Cek nominal (normal {rupiah(check.expectedTotal)})</span>
                        </span>
                      );
                    })()}
                  </div>
                  {latestPendingOrder.doodleNotes && (
                    <p className="text-xs text-[#61433B] mt-0.5 truncate">
                      {latestPendingOrder.doodleNotes}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleVerifyAndOpenQr(latestPendingOrder)}
                  className="whoops-btn whoops-btn-primary px-4 py-2.5 text-xs sm:text-sm cursor-pointer"
                >
                  VERIFIKASI &amp; BUKA QR
                </button>
                <button
                  type="button"
                  onClick={() => void handleRejectOrder(latestPendingOrder)}
                  className="whoops-btn whoops-btn-ghost px-3.5 py-2.5 text-xs cursor-pointer"
                >
                  TOLAK
                </button>
              </div>
            </div>
          )}

          {/* Rekap Omzet Harian & Export CSV */}
          <div className="whoops-card p-4 sm:p-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-display font-semibold text-[#61433B]">
                  <Calendar className="w-3.5 h-3.5 text-[#6D1D3A]" aria-hidden="true" />
                  <span>
                    {recapScope === 'date'
                      ? recapDateKey === getTodayDateKey()
                        ? `Rekap Omzet Hari Ini (${recapDateKey})`
                        : `Rekap Omzet Tanggal ${recapDateKey}`
                      : `Rekap Omzet (${orders.length} Pesanan Dimuat)`}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <div className="font-display font-bold text-2xl sm:text-3xl text-[#6D1D3A] tabular-nums">
                    {rupiah(dailyRecap.verifiedRevenue)}
                  </div>
                  <div className="text-xs sm:text-sm text-[#3A231E] tabular-nums">
                    <b>{dailyRecap.verifiedCount}</b> lunas
                    <span className="mx-1.5 text-[#61433B]">|</span>
                    <b>{dailyRecap.printCount}</b> cetak 4R
                    <span className="mx-1.5 text-[#61433B]">|</span>
                    <b>{dailyRecap.doodleCount}</b> doodle
                  </div>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#61433B] tabular-nums">
                  <span>
                    Menunggu bayar: <b className="text-[#3A231E]">{dailyRecap.pendingCount}</b> ({rupiah(dailyRecap.pendingRevenue)})
                  </span>
                  <span>|</span>
                  <span>
                    Ditolak: <b className="text-[#3A231E]">{dailyRecap.rejectedCount}</b>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="inline-flex rounded-xl border-2 border-[#3A231E] bg-[#EFE2CE] p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setRecapScope('date');
                      setRecapError(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-display font-semibold cursor-pointer min-h-[38px] ${
                      recapScope === 'date'
                        ? 'bg-[#6D1D3A] text-[#FDF7EE]'
                        : 'text-[#3A231E] hover:bg-[#FDF7EE]/60'
                    }`}
                  >
                    Per Tanggal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRecapScope('all');
                      setRecapError(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-display font-semibold cursor-pointer min-h-[38px] ${
                      recapScope === 'all'
                        ? 'bg-[#6D1D3A] text-[#FDF7EE]'
                        : 'text-[#3A231E] hover:bg-[#FDF7EE]/60'
                    }`}
                  >
                    Semua Dimuat
                  </button>
                </div>

                {recapScope === 'date' && (
                  <>
                    <label className="inline-flex items-center">
                      <span className="sr-only">Pilih tanggal rekap</span>
                      <input
                        type="date"
                        value={recapDateKey}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next) {
                            setRecapDateKey(next);
                            setRecapError(null);
                          }
                        }}
                        className="min-h-[44px] px-3 py-1.5 text-xs font-mono-tabular border-2 border-[#3A231E] rounded-xl bg-white text-[#3A231E]"
                      />
                    </label>
                    {recapDateKey !== getTodayDateKey() && (
                      <button
                        type="button"
                        onClick={() => {
                          setRecapDateKey(getTodayDateKey());
                          setRecapError(null);
                        }}
                        className="whoops-btn whoops-btn-ghost px-3 py-2 text-xs cursor-pointer whitespace-nowrap"
                      >
                        Hari Ini
                      </button>
                    )}
                  </>
                )}

                <button
                  type="button"
                  disabled={isLoadingRecapDate}
                  onClick={() => void handleCopyRecapSummary()}
                  className="whoops-btn whoops-btn-ghost px-3 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{copiedRecapText ? 'Tersalin!' : 'Salin Ringkasan'}</span>
                </button>

                <button
                  type="button"
                  disabled={isExportingCsv}
                  onClick={() => void handleExportCsv()}
                  className="whoops-btn whoops-btn-secondary px-3.5 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {isExportingCsv ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>{isExportingCsv ? 'Menyiapkan CSV...' : 'Export CSV'}</span>
                </button>
              </div>
            </div>

            {dailyRecap.packageBreakdown.length > 0 && (
              <div className="mt-3 pt-3 border-t border-dashed border-[#3A231E]/20 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-display font-semibold text-[#61433B]">
                  Rincian paket lunas:
                </span>
                {dailyRecap.packageBreakdown.map((item) => (
                  <span
                    key={item.packageName}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EFE2CE] border border-[#3A231E]/35 text-[#3A231E] tabular-nums"
                  >
                    <span className="font-display font-semibold">{item.packageName}</span>
                    <span className="text-[#61433B]">{item.count}x</span>
                    <span className="font-bold text-[#6D1D3A]">{rupiah(item.revenue)}</span>
                  </span>
                ))}
              </div>
            )}

            {recapScope === 'date' &&
              adminUsingCloud &&
              fetchedDateRecap?.dateKey === recapDateKey && (
                <div className="mt-2 text-[11px] text-[#61433B] tabular-nums">
                  Data lengkap tanggal {recapDateKey} sudah ditarik dari server ({dailyRecap.ordersForPeriod.length} pesanan).
                </div>
              )}

            {recapMayBeIncomplete && (
              <div className="mt-3 pt-3 border-t border-dashed border-[#3A231E]/25 flex flex-wrap items-center justify-between gap-2 text-xs text-[#61433B]">
                <span>
                  Antrean kasir saat ini memuat {orders.length} pesanan terbaru agar ringan di Wi-Fi. Tarik data lengkap untuk memastikan semua transaksi tanggal {recapDateKey} terhitung.
                </span>
                <button
                  type="button"
                  disabled={isLoadingRecapDate}
                  onClick={() => void handleFetchDateRecap(recapDateKey)}
                  className="whoops-btn whoops-btn-ghost whoops-btn-compact px-3 py-1 text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {isLoadingRecapDate ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{isLoadingRecapDate ? 'Menarik data...' : 'Tarik Data Lengkap Tanggal Ini'}</span>
                </button>
              </div>
            )}

            {recapError && (
              <div role="alert" className="mt-3 p-2.5 rounded-xl bg-rose-100 border border-[#6D1D3A] text-xs text-[#6D1D3A]">
                {recapError}
              </div>
            )}
          </div>

          <div className="whoops-card overflow-hidden">
          <div className="p-4 border-b border-[#3A231E]/15 flex flex-wrap items-center justify-between gap-3 bg-[#EFE2CE]/40">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-[#61433B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari kode WHP-..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border-2 border-[#3A231E] rounded-xl bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['ALL', 'Semua'],
                  ['PENDING_VERIFICATION', pendingCount > 0 ? `Menunggu (${pendingCount})` : 'Menunggu'],
                  ['VERIFIED', 'Terverifikasi'],
                  ['REJECTED', 'Ditolak'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setStatusFilter(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-display font-semibold cursor-pointer border ${
                    statusFilter === val
                      ? 'bg-[#6D1D3A] text-[#FDF7EE] border-[#3A231E]'
                      : 'bg-white text-[#3A231E] border-[#3A231E]/30 hover:bg-[#EFE2CE]'
                  }`}
                >
                  {label}
                </button>
              ))}

              {adminUsingCloud && (
                <button
                  type="button"
                  disabled={isPurgingCloudMedia}
                  onClick={() => void handleBulkPurgeCloudMedia()}
                  className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                  title="Hapus chunk foto Base64 di Firestore untuk pesanan yang sudah selesai & sudah masuk Google Drive"
                >
                  {isPurgingCloudMedia ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {isPurgingCloudMedia ? 'Membersihkan...' : 'Bersihkan Cache Cloud'}
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-[#EFE2CE] font-display text-[11px] uppercase tracking-wider text-[#3A231E]">
                  <th className="py-3 px-4">Kode</th>
                  <th className="py-3 px-4">Paket</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Status Bayar</th>
                  <th className="py-3 px-4">Workflow</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {ordersLoading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#61433B]">
                      Memuat daftar pesanan...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#61433B]">
                      Belum ada pesanan yang cocok. Pesanan baru dari Booth akan muncul otomatis di sini.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o, idx) => (
                    <tr
                      key={o.id}
                      className="border-t border-[#3A231E]/10 hover:bg-[#EFE2CE]/30"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {o.previewThumbUrl && (
                            <div className="w-9 aspect-[1205/1795] rounded-md overflow-hidden border border-[#3A231E] bg-white shrink-0">
                              <img
                                src={o.previewThumbUrl}
                                alt={`Thumb ${o.orderCode}`}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-contain"
                              />
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono-tabular font-bold text-[#3A231E]">
                                {o.orderCode}
                              </span>
                              {idx === 0 && statusFilter === 'ALL' && !searchTerm.trim() && (
                                <span className="px-1.5 py-0.5 rounded bg-[#F3D2DB] border border-[#3A231E] text-[9px] font-display font-bold text-[#6D1D3A]">
                                  TERBARU
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#61433B] tabular-nums">
                              {formatOrderTime(o.createdAt)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          {o.packageName}
                          {o.wantsPrint ? ' + Print' : ''}
                        </div>
                        {o.doodleNotes && (
                          <div className="text-[11px] text-[#61433B] max-w-[220px] truncate">
                            {o.doodleNotes}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-display font-bold text-[#6D1D3A] tabular-nums">
                        <div>{rupiah(o.totalAmount)}</div>
                        {(() => {
                          const check = isOrderAmountUnexpected(
                            o,
                            packages,
                            settings.printAddonPrice
                          );
                          if (!check.unexpected) return null;
                          return (
                            <div
                              className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 border border-[#3A231E]/50 text-[10px] font-semibold text-amber-950"
                              title={`Harga normal paket ini tanpa voucher adalah ${rupiah(check.expectedTotal)}`}
                            >
                              <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span>Cek nominal</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md border border-[#3A231E]/40 text-[11px] font-display font-semibold ${
                            o.paymentStatus === 'VERIFIED'
                              ? 'bg-emerald-100 text-emerald-900'
                              : o.paymentStatus === 'REJECTED'
                                ? 'bg-rose-100 text-rose-900'
                                : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {o.paymentStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#3A231E]">{o.workflowStatus}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {o.paymentStatus === 'PENDING_VERIFICATION' ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleVerifyAndOpenQr(o)}
                              className="whoops-btn whoops-btn-primary whoops-btn-compact px-2.5 py-1 text-[11px] cursor-pointer"
                            >
                              VERIFIKASI
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRejectOrder(o)}
                              className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] cursor-pointer"
                            >
                              TOLAK
                            </button>
                          </div>
                        ) : o.paymentStatus === 'VERIFIED' ? (
                          <div className="inline-flex items-center gap-1.5">
                            {o.gdriveFolderUrl && (
                              <a
                                href={o.gdriveFolderUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2 py-0.5 rounded bg-emerald-100 border border-[#3A231E]/50 text-[10px] font-display font-bold text-emerald-900 inline-flex items-center gap-1 hover:bg-emerald-200"
                                title="Buka folder Google Drive pesanan ini"
                              >
                                <FolderOpen className="w-3 h-3" aria-hidden="true" />
                                <span>GDrive</span>
                              </a>
                            )}
                            <button
                              type="button"
                              disabled={downloadingOrderId === o.id}
                              onClick={() =>
                                void handleDownloadHighRes(
                                  o,
                                  o.doodleDone && o.finalChunks > 0 ? 'final' : 'original',
                                  `WHOOPS-${o.orderCode}-4R-300DPI.jpg`
                                )
                              }
                              className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] inline-flex items-center gap-1 cursor-pointer"
                              title="Unduh file 4R resolusi tinggi"
                            >
                              <Download className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>4R</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setGdriveUploadError(null);
                                setGdriveUploadWarning(null);
                                setGdriveUploadProgress(null);
                                setActiveQrOrder(o);
                              }}
                              className="whoops-btn whoops-btn-secondary whoops-btn-compact px-2.5 py-1 text-[11px] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>QR &amp; Hasil</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-[#61433B]">Ditolak</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-[#3A231E]/15 bg-[#EFE2CE]/35 flex flex-wrap items-center justify-between gap-3 text-xs text-[#61433B]">
            <span className="tabular-nums">
              Menampilkan <b>{filteredOrders.length}</b> dari <b>{orders.length}</b> pesanan termuat
              {adminUsingCloud ? ' (hemat kuota & Wi-Fi)' : ' (mode demo lokal)'}.
            </span>

            {hasMoreOrders && (
              <button
                type="button"
                disabled={isLoadingMoreOrders}
                onClick={handleLoadMoreOrders}
                className="whoops-btn whoops-btn-ghost whoops-btn-compact px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                {isLoadingMoreOrders ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>
                  {isLoadingMoreOrders
                    ? 'Memuat pesanan lama...'
                    : `Muat ${DEFAULT_ORDERS_PAGE_SIZE} pesanan lebih lama`}
                </span>
              </button>
            )}
          </div>
          </div>
        </div>
      )}

      {/* TAB 2: DOODLE QUEUE & UPLOAD */}
      {activeTab === 'doodle' && (
        <>
          {doodleOrders.length === 0 ? (
            <div className="whoops-card p-10 text-center text-sm text-[#61433B]">
              Belum ada pesanan Photo + Doodle.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {doodleOrders.map((o) => (
                <div key={o.id} className="whoops-card p-4 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <b className="font-mono-tabular text-sm">{o.orderCode}</b>
                      <span className="text-xs font-display font-semibold text-[#6D1D3A]">
                        {o.paymentStatus}
                      </span>
                    </div>
                    <p className="text-xs text-[#61433B] mb-3">
                      {o.packageName} · Request: <b>{o.doodleNotes || '-'}</b>
                    </p>
                    <div className="w-[130px] aspect-[1205/1795] mx-auto border-2 border-[#3A231E] rounded-xl overflow-hidden bg-white">
                      {o.previewThumbUrl && (
                        <img
                          src={o.previewThumbUrl}
                          alt={o.orderCode}
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <select
                      value={o.workflowStatus}
                      disabled={o.paymentStatus !== 'VERIFIED'}
                      onChange={(e) =>
                        void handleWorkflowChange(o.id, e.target.value as WorkflowStatus)
                      }
                      className="w-full border-2 border-[#3A231E] rounded-xl px-2.5 py-1.5 text-xs bg-white disabled:opacity-50"
                    >
                      {WORKFLOW_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>

                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          handleDownloadHighRes(
                            o,
                            'original',
                            `ORIGINAL-${o.orderCode}-300DPI.png`
                          )
                        }
                        disabled={downloadingOrderId === o.id}
                        className="whoops-btn whoops-btn-ghost flex-1 py-2 text-[11px] inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Foto Asli
                      </button>
                      <button
                        onClick={() => setActiveDoodleOrder(o)}
                        disabled={o.paymentStatus !== 'VERIFIED'}
                        className="whoops-btn whoops-btn-primary flex-1 py-2 text-[11px] inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        Studio Doodle
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB 3: PRINT QUEUE */}
      {activeTab === 'print' && (
        <>
          {printOrders.length === 0 ? (
            <div className="whoops-card p-10 text-center text-sm text-[#61433B]">
              Belum ada antrean cetak 4R terverifikasi.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {printOrders.map((o) => {
                const mediaKind = o.doodleDone && o.finalChunks > 0 ? 'final' : 'original';
                return (
                  <div key={o.id} className="whoops-card p-4 text-center flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <b className="font-mono-tabular text-sm">{o.orderCode}</b>
                        <span className="text-xs font-display font-semibold text-[#6D1D3A]">
                          {o.printStatus}
                        </span>
                      </div>
                      <div className="w-[140px] aspect-[1205/1795] mx-auto border-2 border-[#3A231E] rounded-xl overflow-hidden bg-white">
                        {o.previewThumbUrl && (
                          <img
                            src={o.previewThumbUrl}
                            alt={o.orderCode}
                            className="w-full h-full object-contain"
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setGdriveUploadError(null);
                          setGdriveUploadWarning(null);
                          setGdriveUploadProgress(null);
                          setActiveQrOrder(o);
                        }}
                        className="whoops-btn whoops-btn-ghost whoops-btn-compact px-3 py-2 text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                        aria-label={`Tampilkan QR untuk ${o.orderCode}`}
                      >
                        <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>QR</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadHighRes(
                            o,
                            mediaKind,
                            `PRINT-4R-${o.orderCode}-300DPI.png`
                          )
                        }
                        disabled={downloadingOrderId === o.id}
                        className="whoops-btn whoops-btn-secondary whoops-btn-compact flex-1 py-2 text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Ekspor 4R</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMarkPrinted(o)}
                        disabled={o.printStatus === 'PRINTED'}
                        className="whoops-btn whoops-btn-primary whoops-btn-compact flex-1 py-2 text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{o.printStatus === 'PRINTED' ? 'Selesai' : 'Sudah Dicetak'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB 4: SERVICE & PACKAGES */}
      {activeTab === 'packages' && (
        <div className="space-y-5">
          {hasLegacyPricingCatalog && (
            <div className="whoops-card-sm p-4 bg-amber-100 border-2 border-[#3A231E] flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-[#3A231E] space-y-0.5">
                <div className="font-display font-bold text-sm text-[#6D1D3A]">
                  Daftar Harga Lama Terdeteksi di Cloud
                </div>
                <p>
                  Database masih memakai harga lama. Klik tombol di samping untuk memperbarui ke harga terbaru:
                  Foto Biasa <b>Rp 16rb</b> (+cetak <b>Rp 21rb</b>), Doodle Tanpa Coloring <b>Rp 21rb</b> (+cetak <b>Rp 26rb</b>), Doodle Coloring <b>Rp 26rb</b> (+cetak <b>Rp 31rb</b>).
                </p>
              </div>
              <button
                type="button"
                disabled={savingId === 'apply-default-pricing'}
                onClick={() => void handleApplyLatestPricingDefaults()}
                className="whoops-btn whoops-btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {savingId === 'apply-default-pricing'
                    ? 'Menerapkan...'
                    : 'Terapkan Harga Terbaru'}
                </span>
              </button>
            </div>
          )}

          {/* Basic Pricing & QRIS Settings */}
          <div className="whoops-card p-5">
            <div className="flex flex-col md:flex-row md:items-end gap-4">
              <div className="w-full md:w-56">
                <label
                  htmlFor="setting-print-addon"
                  className="block text-xs font-display font-semibold mb-1"
                >
                  Biaya Tambahan Cetak 4R (Rp)
                </label>
                <input
                  id="setting-print-addon"
                  type="number"
                  min={0}
                  max={10000000}
                  value={printAddonDraft}
                  onChange={(e) => setPrintAddonDraft(Number(e.target.value))}
                  className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white tabular-nums"
                />
              </div>
              <div className="flex-1 min-w-0">
                <label
                  htmlFor="setting-qris-label"
                  className="block text-xs font-display font-semibold mb-1"
                >
                  Label QRIS Merchant
                </label>
                <input
                  id="setting-qris-label"
                  type="text"
                  maxLength={120}
                  value={qrisLabelDraft}
                  onChange={(e) => setQrisLabelDraft(e.target.value)}
                  className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white"
                />
              </div>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingId === 'settings'}
                className="whoops-btn whoops-btn-primary px-5 py-2.5 text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{savingId === 'settings' ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
              </button>
            </div>
            <p className="text-[11px] text-[#61433B] mt-2.5">
              Biaya tambahan cetak ({rupiah(printAddonDraft)}) otomatis ditambahkan jika pelanggan memilih opsi <b>+ Cetak 4R</b> di Booth atau pada paket yang mencentang <b>Sudah Termasuk Cetak 4R</b>.
            </p>
          </div>

          {/* Packages List + Add Package Form */}
          <div className="whoops-card p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-display font-bold text-[#6D1D3A] mb-1">
                  <Package className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>PAKET LAYANAN BOOTH ({packages.length})</span>
                </div>
                <h3 className="font-display font-bold text-lg text-[#3A231E]">
                  Kelola Pilihan Paket &amp; Harga
                </h3>
                <p className="text-xs text-[#61433B]">
                  Tambah, ubah harga, atau nonaktifkan paket yang tampil di layar Checkout Booth.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAddPackageForm((prev) => !prev)}
                className={`whoops-btn px-4 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  showAddPackageForm ? 'whoops-btn-ghost' : 'whoops-btn-primary'
                }`}
              >
                {showAddPackageForm ? (
                  <>
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Tutup Form</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Tambah Paket Baru</span>
                  </>
                )}
              </button>
            </div>

            {showAddPackageForm && (
              <form
                onSubmit={handleCreatePackage}
                className="bg-[#EFE2CE]/70 border-2 border-[#3A231E] rounded-2xl p-4 sm:p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-display font-bold text-sm text-[#3A231E]">
                    Buat Paket Baru
                  </h4>
                  <span className="text-[11px] font-display font-semibold text-[#6D1D3A] tabular-nums">
                    {newPkgIncludesPrint
                      ? `Total di Booth (+ Cetak 4R): ${rupiah((Number(newPkgPrice) || 0) + (Number(settings.printAddonPrice) || 0))}`
                      : `Digital: ${rupiah(newPkgPrice)} | + Cetak 4R: ${rupiah((Number(newPkgPrice) || 0) + (Number(settings.printAddonPrice) || 0))}`}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-4">
                    <label
                      htmlFor="new-pkg-name"
                      className="block text-[11px] font-display font-semibold mb-1"
                    >
                      Nama Paket
                    </label>
                    <input
                      id="new-pkg-name"
                      required
                      maxLength={80}
                      value={newPkgName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewPkgName(val);
                        if (!newPkgCodeTouched) {
                          setNewPkgCode(normalizePackageCodeInput(val));
                        }
                      }}
                      placeholder="Misal: PHOTO + DOODLE COLORING"
                      className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white"
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label
                      htmlFor="new-pkg-code"
                      className="block text-[11px] font-display font-semibold mb-1"
                    >
                      Kode Paket (A-Z, 0-9, _)
                    </label>
                    <input
                      id="new-pkg-code"
                      maxLength={40}
                      value={newPkgCode}
                      onChange={(e) => {
                        setNewPkgCodeTouched(true);
                        setNewPkgCode(normalizePackageCodeInput(e.target.value));
                      }}
                      placeholder="Otomatis dari nama"
                      className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white font-mono-tabular uppercase"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label
                      htmlFor="new-pkg-price"
                      className="block text-[11px] font-display font-semibold mb-1"
                    >
                      Harga Digital (Rp)
                    </label>
                    <input
                      id="new-pkg-price"
                      type="number"
                      min={0}
                      max={10000000}
                      required
                      value={newPkgPrice}
                      onChange={(e) => setNewPkgPrice(Number(e.target.value))}
                      className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white tabular-nums"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label
                      htmlFor="new-pkg-promo"
                      className="block text-[11px] font-display font-semibold mb-1"
                    >
                      Label Promo (Opsional)
                    </label>
                    <input
                      id="new-pkg-promo"
                      maxLength={40}
                      value={newPkgPromo}
                      onChange={(e) => setNewPkgPromo(e.target.value)}
                      placeholder="Misal: FULL COLOR"
                      className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white"
                    />
                  </div>

                  <div className="lg:col-span-1">
                    <label
                      htmlFor="new-pkg-sort"
                      className="block text-[11px] font-display font-semibold mb-1"
                    >
                      Urutan
                    </label>
                    <input
                      id="new-pkg-sort"
                      type="number"
                      min={0}
                      max={899}
                      value={newPkgSortOrder}
                      onChange={(e) => setNewPkgSortOrder(Number(e.target.value))}
                      className="w-full border-2 border-[#3A231E] rounded-xl px-2.5 py-2 text-sm bg-white tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="new-pkg-desc"
                    className="block text-[11px] font-display font-semibold mb-1"
                  >
                    Deskripsi Paket (tampil di kartu Booth)
                  </label>
                  <input
                    id="new-pkg-desc"
                    maxLength={300}
                    value={newPkgDesc}
                    onChange={(e) => setNewPkgDesc(e.target.value)}
                    placeholder="Misal: Foto photobooth + doodle full color. Bisa tambah cetak 4R."
                    className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-4 text-xs font-display font-semibold text-[#3A231E]">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newPkgIncludesDoodle}
                        onChange={(e) => setNewPkgIncludesDoodle(e.target.checked)}
                        className="accent-[#6D1D3A] w-4 h-4"
                      />
                      <span>Termasuk Jasa Doodle</span>
                    </label>

                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newPkgIncludesPrint}
                        onChange={(e) => setNewPkgIncludesPrint(e.target.checked)}
                        className="accent-[#6D1D3A] w-4 h-4"
                      />
                      <span>Sudah Termasuk Cetak 4R (wajib cetak)</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddPackageForm(false)}
                      className="whoops-btn whoops-btn-ghost px-4 py-2 text-xs cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={savingId === 'new-package'}
                      className="whoops-btn whoops-btn-primary px-5 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {savingId === 'new-package' ? 'Menyimpan...' : 'Simpan Paket Baru'}
                      </span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {packages.map((p) => {
                const draft = pkgDrafts[p.id] || p;
                const confirmDel = confirmDeletePkgId === p.id;
                const printFeePreview = Number(settings.printAddonPrice) || 0;
                const baseDigital = Math.max(0, Number(draft.digitalPrice) || 0);
                const withPrintTotal = baseDigital + printFeePreview;

                return (
                  <div
                    key={p.id}
                    className={`whoops-card-sm p-4 flex flex-col justify-between gap-3 transition-opacity ${
                      draft.isActive ? 'bg-[#FDF7EE]' : 'bg-[#EFE2CE]/60 opacity-80'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-[#EFE2CE] border border-[#3A231E]/40 font-mono-tabular text-[11px] font-bold text-[#3A231E] truncate">
                          {draft.code}
                        </span>
                        <label className="text-xs font-display font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={draft.isActive}
                            onChange={(e) =>
                              setPkgDrafts((prev) => ({
                                ...prev,
                                [p.id]: { ...draft, isActive: e.target.checked },
                              }))
                            }
                            className="accent-[#6D1D3A] w-4 h-4"
                          />
                          <span>{draft.isActive ? 'Aktif' : 'Nonaktif'}</span>
                        </label>
                      </div>

                      <div>
                        <label className="block text-[11px] font-display font-semibold mb-1">
                          Nama Paket
                        </label>
                        <input
                          maxLength={80}
                          value={draft.name}
                          onChange={(e) =>
                            setPkgDrafts((prev) => ({
                              ...prev,
                              [p.id]: { ...draft, name: e.target.value },
                            }))
                          }
                          className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-1.5 text-sm bg-white font-display font-semibold"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="block text-[11px] font-display font-semibold mb-1">
                            Label Promo (Opsional)
                          </label>
                          <input
                            maxLength={40}
                            value={draft.promoText}
                            placeholder="Misal: FULL COLOR"
                            onChange={(e) =>
                              setPkgDrafts((prev) => ({
                                ...prev,
                                [p.id]: { ...draft, promoText: e.target.value },
                              }))
                            }
                            className="w-full border-2 border-[#3A231E] rounded-xl px-2.5 py-1.5 text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-display font-semibold mb-1">
                            Urutan
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={899}
                            value={draft.sortOrder}
                            onChange={(e) =>
                              setPkgDrafts((prev) => ({
                                ...prev,
                                [p.id]: { ...draft, sortOrder: Number(e.target.value) },
                              }))
                            }
                            className="w-full border-2 border-[#3A231E] rounded-xl px-2.5 py-1.5 text-xs bg-white tabular-nums"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-display font-semibold mb-1">
                          Deskripsi
                        </label>
                        <textarea
                          rows={2}
                          maxLength={300}
                          value={draft.description}
                          onChange={(e) =>
                            setPkgDrafts((prev) => ({
                              ...prev,
                              [p.id]: { ...draft, description: e.target.value },
                            }))
                          }
                          className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-1.5 text-xs bg-white leading-snug"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-display font-semibold mb-1">
                          Harga Digital (Rp)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={10000000}
                          value={draft.digitalPrice}
                          onChange={(e) =>
                            setPkgDrafts((prev) => ({
                              ...prev,
                              [p.id]: { ...draft, digitalPrice: Number(e.target.value) },
                            }))
                          }
                          className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-1.5 text-sm bg-white tabular-nums font-semibold"
                        />
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-display font-semibold text-[#3A231E]">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.includesDoodle}
                            onChange={(e) =>
                              setPkgDrafts((prev) => ({
                                ...prev,
                                [p.id]: { ...draft, includesDoodle: e.target.checked },
                              }))
                            }
                            className="accent-[#6D1D3A] w-4 h-4"
                          />
                          <span>Pakai Doodle</span>
                        </label>

                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.includesPrint}
                            onChange={(e) =>
                              setPkgDrafts((prev) => ({
                                ...prev,
                                [p.id]: { ...draft, includesPrint: e.target.checked },
                              }))
                            }
                            className="accent-[#6D1D3A] w-4 h-4"
                          />
                          <span>Wajib Cetak 4R</span>
                        </label>
                      </div>

                      <div className="px-3 py-2 rounded-xl bg-[#EFE2CE] border border-[#3A231E]/30 text-[11px] text-[#3A231E] flex flex-wrap items-center justify-between gap-1 tabular-nums">
                        {draft.includesPrint ? (
                          <>
                            <span>Harga Tampil (+ Cetak 4R):</span>
                            <b className="text-[#6D1D3A]">{rupiah(withPrintTotal)}</b>
                          </>
                        ) : (
                          <>
                            <span>
                              Digital: <b className="text-[#6D1D3A]">{rupiah(baseDigital)}</b>
                            </span>
                            <span>
                              + Cetak 4R: <b className="text-[#6D1D3A]">{rupiah(withPrintTotal)}</b>
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void handleSavePackage(p.id)}
                        disabled={savingId === p.id}
                        className="whoops-btn whoops-btn-secondary flex-1 py-2 text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{savingId === p.id ? 'Menyimpan...' : 'Simpan Paket'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={savingId === p.id || packages.length <= 1}
                        onClick={() => {
                          if (!confirmDel) {
                            setConfirmDeletePkgId(p.id);
                            window.setTimeout(() => setConfirmDeletePkgId(null), 3200);
                          } else {
                            void handleDeletePackage(p);
                          }
                        }}
                        className={`whoops-btn whoops-btn-compact px-3 py-2 text-xs inline-flex items-center gap-1 cursor-pointer ${
                          confirmDel ? 'whoops-btn-primary' : 'whoops-btn-ghost text-[#6D1D3A]'
                        }`}
                        aria-label={`Hapus paket ${draft.name}`}
                        title={
                          packages.length <= 1
                            ? 'Minimal harus tersisa 1 paket'
                            : `Hapus paket ${draft.name}`
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        {confirmDel && <span>Yakin?</span>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Voucher Discount Management */}
          <div className="whoops-card p-5 space-y-5">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-display font-bold text-[#6D1D3A] mb-1">
                <Tag className="w-3.5 h-3.5" aria-hidden="true" />
                <span>VOUCHER DISKON KASIR</span>
              </div>
              <h3 className="font-display font-bold text-lg text-[#3A231E]">
                Kelola Kode Voucher &amp; Potongan Harga
              </h3>
              <p className="text-xs text-[#61433B]">
                Kode voucher yang aktif dapat langsung dimasukkan pelanggan saat memilih paket sebelum dikirim ke kasir.
              </p>
            </div>

            <form
              onSubmit={handleCreateVoucher}
              className="bg-[#EFE2CE]/60 border-2 border-[#3A231E] rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end"
            >
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-display font-semibold mb-1">
                  Kode Voucher
                </label>
                <input
                  required
                  value={newVoucherCode}
                  onChange={(e) => setNewVoucherCode(normalizeVoucherCode(e.target.value))}
                  placeholder="Misal: HEMAT5K"
                  className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white font-mono-tabular uppercase"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-display font-semibold mb-1">
                  Jenis Potongan
                </label>
                <select
                  value={newVoucherType}
                  onChange={(e) => {
                    const nextType = e.target.value as DiscountType;
                    setNewVoucherType(nextType);
                    setNewVoucherValue(nextType === 'percent' ? 10 : 5000);
                  }}
                  className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white"
                >
                  <option value="fixed">Nominal (Rp)</option>
                  <option value="percent">Persen (%)</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-display font-semibold mb-1">
                  {newVoucherType === 'percent' ? 'Diskon (%)' : 'Potongan (Rp)'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={newVoucherType === 'percent' ? 100 : 10000000}
                  value={newVoucherValue}
                  onChange={(e) => setNewVoucherValue(Number(e.target.value))}
                  className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white tabular-nums"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="block text-[11px] font-display font-semibold mb-1">
                  Keterangan (Opsional)
                </label>
                <input
                  value={newVoucherDesc}
                  onChange={(e) => setNewVoucherDesc(e.target.value)}
                  placeholder="Misal: Diskon pembukaan booth"
                  className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white"
                />
              </div>

              <div className="lg:col-span-2">
                <button
                  type="submit"
                  disabled={savingId === 'new-voucher'}
                  className="whoops-btn whoops-btn-primary w-full py-2.5 text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{savingId === 'new-voucher' ? 'Menyimpan...' : 'Tambah Voucher'}</span>
                </button>
              </div>
            </form>

            {vouchers.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#61433B] bg-[#FDF7EE] rounded-2xl border-2 border-dashed border-[#3A231E]/35">
                Belum ada kode voucher dibuat. Gunakan formulir di atas untuk menambahkan voucher promo.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vouchers.map((v) => {
                  const draft = voucherDrafts[v.id] || v;
                  const confirmDel = confirmDeleteVoucherId === v.id;
                  return (
                    <div
                      key={v.id}
                      className={`whoops-card-sm p-4 flex flex-col gap-3 ${
                        draft.isActive ? 'bg-[#FDF7EE]' : 'bg-[#EFE2CE]/55 opacity-80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-[#6D1D3A] text-[#FDF7EE] border border-[#3A231E] font-mono-tabular text-xs font-bold">
                          {draft.code}
                        </span>
                        <span className="font-display font-bold text-sm text-[#6D1D3A] tabular-nums">
                          - {formatVoucherBenefit(draft)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-display font-semibold mb-1">
                            Jenis
                          </label>
                          <select
                            value={draft.discountType}
                            onChange={(e) =>
                              setVoucherDrafts((prev) => ({
                                ...prev,
                                [v.id]: {
                                  ...draft,
                                  discountType: e.target.value as DiscountType,
                                },
                              }))
                            }
                            className="w-full border-2 border-[#3A231E] rounded-lg px-2 py-1.5 text-xs bg-white"
                          >
                            <option value="fixed">Nominal (Rp)</option>
                            <option value="percent">Persen (%)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-display font-semibold mb-1">
                            Nilai
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={draft.discountType === 'percent' ? 100 : 10000000}
                            value={draft.discountValue}
                            onChange={(e) =>
                              setVoucherDrafts((prev) => ({
                                ...prev,
                                [v.id]: { ...draft, discountValue: Number(e.target.value) },
                              }))
                            }
                            className="w-full border-2 border-[#3A231E] rounded-lg px-2.5 py-1.5 text-xs bg-white tabular-nums"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-display font-semibold mb-1">
                          Keterangan
                        </label>
                        <input
                          value={draft.description}
                          onChange={(e) =>
                            setVoucherDrafts((prev) => ({
                              ...prev,
                              [v.id]: { ...draft, description: e.target.value },
                            }))
                          }
                          placeholder="Deskripsi singkat"
                          className="w-full border-2 border-[#3A231E] rounded-lg px-2.5 py-1.5 text-xs bg-white"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <label className="text-xs font-display font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.isActive}
                            onChange={(e) =>
                              setVoucherDrafts((prev) => ({
                                ...prev,
                                [v.id]: { ...draft, isActive: e.target.checked },
                              }))
                            }
                            className="accent-[#6D1D3A]"
                          />
                          Aktif
                        </label>

                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSaveVoucher(v.id)}
                            disabled={savingId === v.id}
                            className="whoops-btn whoops-btn-secondary whoops-btn-compact px-3 py-1.5 text-[11px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Save className="w-3 h-3" aria-hidden="true" />
                            <span>{savingId === v.id ? 'Menyimpan...' : 'Simpan'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirmDel) {
                                setConfirmDeleteVoucherId(v.id);
                                window.setTimeout(() => setConfirmDeleteVoucherId(null), 3200);
                              } else {
                                handleDeleteVoucher(v);
                              }
                            }}
                            disabled={savingId === v.id}
                            className={`whoops-btn whoops-btn-compact px-2.5 py-1.5 text-[11px] inline-flex items-center gap-1 cursor-pointer ${
                              confirmDel ? 'whoops-btn-primary' : 'whoops-btn-ghost text-[#6D1D3A]'
                            }`}
                            aria-label={`Hapus voucher ${v.code}`}
                          >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                            {confirmDel && <span>Yakin?</span>}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Google Drive Apps Script Integration */}
          <div id="gdrive-settings-card" ref={gdriveSectionRef} className="whoops-card p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-display font-bold text-[#6D1D3A] mb-1">
                  <CloudUpload className="w-4 h-4" aria-hidden="true" />
                  <span>Google Drive Otomatis (Apps Script Web App)</span>
                </div>
                <h3 className="font-display font-bold text-lg text-[#3A231E]">
                  Upload Foto Mentah + Hasil 4R ke 1 Folder GDrive
                </h3>
                <p className="text-xs text-[#61433B] mt-0.5">
                  Foto mentah &amp; hasil 4R otomatis diunggah ke Google Drive di background saat pelanggan memilih paket di Booth (dengan fallback otomatis dari kasir bila belum selesai).
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg border border-[#3A231E] text-[11px] font-display font-bold ${
                  gdriveConfig.webAppUrl.trim()
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-[#EFE2CE] text-[#61433B]'
                }`}
              >
                {gdriveConfig.webAppUrl.trim() ? 'URL Terpasang' : 'Belum Diatur'}
              </span>
            </div>

            <form onSubmit={handleSaveGdriveConfig} className="space-y-3">
              <div>
                <label
                  htmlFor="gdrive-webapp-url"
                  className="block text-xs font-display font-semibold mb-1"
                >
                  URL Web App Google Apps Script (/exec)
                </label>
                <input
                  id="gdrive-webapp-url"
                  type="url"
                  value={gdriveUrlDraft}
                  onChange={(e) => setGdriveUrlDraft(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-xs font-mono-tabular bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="gdrive-root-folder"
                    className="block text-xs font-display font-semibold mb-1"
                  >
                    ID atau URL Folder Induk GDrive (Opsional)
                  </label>
                  <input
                    id="gdrive-root-folder"
                    type="text"
                    value={gdriveRootFolderDraft}
                    onChange={(e) => setGdriveRootFolderDraft(e.target.value)}
                    placeholder="Tempel ID folder atau link https://drive.google.com/drive/folders/..."
                    className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-xs font-mono-tabular bg-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="gdrive-secret-key"
                    className="block text-xs font-display font-semibold mb-1"
                  >
                    Secret Key Apps Script (Opsional)
                  </label>
                  <input
                    id="gdrive-secret-key"
                    type="password"
                    value={gdriveSecretDraft}
                    onChange={(e) => setGdriveSecretDraft(e.target.value)}
                    placeholder="Kosongkan agar iPad Booth bisa upload di background"
                    className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-xs bg-white"
                  />
                  <p className="text-[11px] text-[#61433B] mt-1">
                    Kosongkan bila memakai upload background dari iPad Booth. Jika diisi, upload berjalan dari Laptop Kasir saat Verifikasi.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  className="whoops-btn whoops-btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Simpan URL Apps Script</span>
                </button>
                <button
                  type="button"
                  disabled={isTestingGdrive || !gdriveUrlDraft.trim()}
                  onClick={() => void handleTestGdriveConnection()}
                  className="whoops-btn whoops-btn-secondary px-4 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {isTestingGdrive ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      <span>Menguji Koneksi...</span>
                    </>
                  ) : (
                    <span>Tes Koneksi Google Drive</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAppsScriptGuide((prev) => !prev)}
                  className="whoops-btn whoops-btn-ghost px-3 py-2 text-xs inline-flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{showAppsScriptGuide ? 'Tutup Panduan' : 'Panduan Pasang 4 Langkah'}</span>
                </button>
              </div>
            </form>

            {gdriveTestStatus && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  gdriveTestStatus.ok
                    ? 'bg-emerald-50 border-emerald-700 text-emerald-900'
                    : 'bg-rose-100 border-[#6D1D3A] text-[#6D1D3A]'
                }`}
              >
                {gdriveTestStatus.message}
              </div>
            )}

            {showAppsScriptGuide && (
              <div className="p-3.5 rounded-xl bg-[#EFE2CE]/75 border border-[#3A231E]/40 text-xs text-[#3A231E] space-y-2 leading-relaxed">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-display font-bold">
                    Cara Pasang Google Apps Script (Gratis, pakai akun Google Drive studio):
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyAppsScriptCode}
                    className="whoops-btn whoops-btn-secondary whoops-btn-compact px-3 py-1.5 text-[11px] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{copiedAppsScript ? 'Kode Disalin!' : 'Salin Kode Code.gs'}</span>
                  </button>
                </div>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>
                    Buka <b>script.google.com</b> dengan akun Google Drive studio -&gt; klik <b>New project</b>.
                  </li>
                  <li>
                    Hapus isi bawaan di editor, tekan <b>Salin Kode Code.gs</b> di atas (atau salin dari{' '}
                    <code className="px-1 py-0.5 rounded bg-white border border-[#3A231E]/25">
                      google-apps-script/Code.gs
                    </code>
                    ), lalu tempel dan tekan Save.
                  </li>
                  <li>
                    Klik <b>Deploy -&gt; New deployment -&gt; Web app</b>, pilih{' '}
                    <b>Execute as: Me</b> dan <b>Who has access: Anyone</b>, lalu izinkan akses Drive (jika muncul peringatan aplikasi belum terverifikasi, klik <b>Advanced -&gt; Go to ... (unsafe) -&gt; Allow</b>).
                  </li>
                  <li>
                    Salin URL Web App berakhiran <code className="px-1 rounded bg-white">/exec</code>{' '}
                    lalu tempel ke kolom di atas, tekan <b>Simpan URL Apps Script</b>, lalu tekan <b>Tes Koneksi Google Drive</b>.
                  </li>
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: FRAMES */}
      {activeTab === 'frames' && (
        <div className="space-y-6">
          <CanvaFramePanel
            framesCount={frames.length}
            savingId={savingId}
            onSaveFrame={handleSaveNewFrame}
            onToast={showToast}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {frames.map((f) => {
              const confirmDel = confirmDeleteFrameId === f.id;
              return (
                <div
                  key={f.id}
                  className="whoops-card p-5 text-center flex flex-col justify-between gap-3"
                >
                  <div>
                    <FramePreviewCanvas frame={f} maxWidthClass="max-w-[165px]" />
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                      <span className="text-xs text-[#61433B]">{f.category}</span>
                      <span className="px-1.5 py-0.5 rounded border border-[#3A231E]/40 bg-white text-[10px] font-display font-bold text-[#3A231E]">
                        {getFrameSlotCount(f)} Foto
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded border border-[#3A231E]/40 text-[10px] font-display font-bold ${
                          f.type === 'image'
                            ? 'bg-[#F3D2DB] text-[#6D1D3A]'
                            : 'bg-[#EFE2CE] text-[#3A231E]'
                        }`}
                      >
                        {f.type === 'image'
                          ? getFrameLayerOrder(f) === 'photos-on-top'
                            ? 'Canva · Foto Depan'
                            : 'Canva / PNG'
                          : 'Vektor'}
                      </span>
                    </div>
                    <h4 className="font-display font-bold text-base text-[#3A231E] mt-1">
                      {f.name}
                    </h4>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await persistFrame({ ...f, active: !f.active });
                        showToast(
                          `Frame "${f.name}" ${!f.active ? 'diaktifkan' : 'dinonaktifkan'}.`
                        );
                      }}
                      className={`whoops-btn flex-1 py-2 text-xs cursor-pointer ${
                        f.active ? 'whoops-btn-secondary' : 'whoops-btn-ghost'
                      }`}
                    >
                      {f.active ? 'Status: AKTIF' : 'Status: NONAKTIF'}
                    </button>
                    <button
                      type="button"
                      disabled={savingId === f.id}
                      onClick={() => {
                        if (!confirmDel) {
                          setConfirmDeleteFrameId(f.id);
                          window.setTimeout(() => setConfirmDeleteFrameId(null), 3200);
                        } else {
                          void handleDeleteFrame(f);
                        }
                      }}
                      className={`whoops-btn whoops-btn-compact px-3 py-2 text-xs inline-flex items-center gap-1 cursor-pointer ${
                        confirmDel
                          ? 'whoops-btn-primary'
                          : 'whoops-btn-ghost text-[#6D1D3A]'
                      }`}
                      aria-label={`Hapus frame ${f.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      {confirmDel && <span>Yakin?</span>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeDoodleOrder && (
        <DoodleStudioModal
          order={activeDoodleOrder}
          useCloud={adminUsingCloud}
          onClose={() => setActiveDoodleOrder(null)}
          onSaved={async (finalPngDataUrl) => {
            const targetOrder = activeDoodleOrder;
            setActiveDoodleOrder(null);
            showToast('Doodle berhasil digabung dan disimpan!');

            const folderId =
              targetOrder.gdriveFolderId || gdriveLinkMap[targetOrder.id]?.folderId;
            if (gdriveConfig.webAppUrl.trim()) {
              if (!folderId) {
                await triggerUploadOrderToGdrive({
                  ...targetOrder,
                  doodleDone: true,
                  finalChunks: Math.max(1, targetOrder.finalChunks),
                });
              } else {
                try {
                  const res = await uploadDoodleToGoogleDrive(
                    gdriveConfig,
                    targetOrder,
                    folderId,
                    finalPngDataUrl
                  );
                  const gdriveInfo: OrderGDriveLinkInfo = {
                    folderId: res.folderId,
                    folderUrl: res.folderUrl,
                    fileCount: res.fileCount,
                  };
                  const nextMap = saveOrderGDriveLink(targetOrder.id, gdriveInfo);
                  setGdriveLinkMap(nextMap);
                  updateDemoOrder(targetOrder.id, {
                    gdriveFolderId: res.folderId,
                    gdriveFolderUrl: res.folderUrl,
                    gdriveUploadedCount: res.fileCount,
                  });
                  if (adminUsingCloud) {
                    try {
                      await saveOrderGDriveMeta(targetOrder.id, gdriveInfo);
                      await maybeAutoPurgeOrderCloudMedia(
                        { ...targetOrder, doodleDone: true },
                        gdriveInfo.folderUrl
                      );
                    } catch (metaErr) {
                      console.warn('Cloud GDrive link sync skipped/failed:', metaErr);
                    }
                  }
                  showToast('File Doodle ikut ditambahkan ke folder Google Drive!');
                } catch (err) {
                  const msg =
                    err instanceof Error ? err.message : 'Gagal menambah file Doodle ke GDrive.';
                  showToast(msg);
                }
              }
            }
          }}
        />
      )}

      {activeQrOrder && (
        <OrderQrModal
          order={activeQrOrder}
          gdriveConfig={gdriveConfig}
          isUploadingGdrive={uploadingGdriveOrderId === activeQrOrder.id}
          gdriveProgress={
            uploadingGdriveOrderId === activeQrOrder.id ? gdriveUploadProgress : null
          }
          gdriveError={gdriveUploadError}
          gdriveWarning={gdriveUploadWarning}
          onUploadToGdrive={(ord) => void triggerUploadOrderToGdrive(ord, true)}
          onClose={() => setActiveQrOrder(null)}
        />
      )}
    </section>
  );
}
