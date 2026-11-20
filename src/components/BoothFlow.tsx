import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  createDemoOrder,
  getGDriveConfig,
  saveOrderGDriveLink,
  subscribeDemoState,
  updateDemoOrder,
} from '../services/demoStore';
import {
  createPhotoboothOrder,
  saveOrderGDriveMeta,
  subscribeSingleOrder,
} from '../services/firestoreService';
import {
  uploadOrderToGoogleDrive,
  type GDriveUploadProgress,
  type GDriveUploadResult,
} from '../services/googleDriveService';
import {
  type BoothStep,
  type CapturedPhoto,
  type GoogleDriveConfig,
  type PhotoFrame,
  type PhotoboothOrder,
  type ServicePackage,
  type SlotAssignment,
  type StoreSettings,
  type VoucherCode,
} from '../types';
import {
  buildComposite4R,
  captureVideoSlotFrame,
  createDemoPosePhoto,
} from '../utils/canvasEngine';
import {
  getFrameSlotCount,
  getSlotAspectRatio,
} from '../utils/frameLayouts';
import {
  appendVoucherNote,
  calculateVoucherDiscount,
  normalizeVoucherCode,
} from '../utils/voucher';
import { CameraStep, type RetakeTarget } from './booth/CameraStep';
import { CheckoutStep } from './booth/CheckoutStep';
import { EditorStep } from './booth/EditorStep';
import { FrameStep } from './booth/FrameStep';
import { PreviewStep } from './booth/PreviewStep';
import { SessionTimeoutModal } from './booth/SessionTimeoutModal';
import { WelcomeStep } from './booth/WelcomeStep';

interface BoothFlowProps {
  step: BoothStep;
  setStep: (step: BoothStep) => void;
  packages: ServicePackage[];
  vouchers: VoucherCode[];
  frames: PhotoFrame[];
  settings: StoreSettings;
  catalogSynced: boolean;
  preferDemoCatalog: boolean;
  cloudGDriveConfig: Pick<GoogleDriveConfig, 'webAppUrl' | 'rootFolderId'> | null;
  isSessionExpired: boolean;
  canExtendOnce: boolean;
  onStartSessionTimer: () => void;
  onExtendOneMinute: () => void;
  onContinueWithGraceTime: () => void;
  onOrderSubmittedChange: (submitted: boolean) => void;
  onResetSessionTimer: () => void;
  onSelectedPackageChange: (pkgName: string | null) => void;
}

interface BgUploadTracker {
  id: number;
  draftOrderId: string;
  draftOrderCode: string;
  signature: string;
  folderId?: string;
  folderUrl?: string;
  status: 'uploading' | 'ready' | 'error';
  result: GDriveUploadResult | null;
  submittedOrderId: string | null;
  orderCreatedPromise: Promise<void> | null;
  folderReadyPromise: Promise<{ folderId: string; folderUrl: string } | null>;
}

const createInitialAssignments = (slotCount = 6): SlotAssignment[] =>
  Array.from({ length: slotCount }, (_, i) => ({
    slotIndex: i,
    photoId: null,
    filter: 'original',
    brightness: 0,
    mirrored: false,
  }));

export function BoothFlow({
  step,
  setStep,
  packages,
  vouchers,
  frames,
  settings,
  catalogSynced,
  preferDemoCatalog,
  cloudGDriveConfig,
  isSessionExpired,
  canExtendOnce,
  onStartSessionTimer,
  onExtendOneMinute,
  onContinueWithGraceTime,
  onOrderSubmittedChange,
  onResetSessionTimer,
  onSelectedPackageChange,
}: BoothFlowProps) {
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [assignments, setAssignments] = useState<SlotAssignment[]>(createInitialAssignments);
  const [selectedTrayPhotoId, setSelectedTrayPhotoId] = useState<string | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);

  const [mirrorPreview, setMirrorPreview] = useState(true);
  const [saveMirrored, setSaveMirrored] = useState(true);
  const [camStatusMsg, setCamStatusMsg] = useState('Memuat kamera...');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRetryTick, setCameraRetryTick] = useState(0);
  const [countdownVal, setCountdownVal] = useState<number | null>(null);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [retakeTarget, setRetakeTarget] = useState<RetakeTarget | null>(null);
  const [lastCapturedId, setLastCapturedId] = useState<string | null>(null);

  const [wantsPrintOpt, setWantsPrintOpt] = useState(false);
  const [doodleNotes, setDoodleNotes] = useState('');
  const [appliedVoucherCode, setAppliedVoucherCode] = useState<string | null>(null);
  const [finalCompositePng, setFinalCompositePng] = useState<string | null>(null);
  const [previewThumbUrl, setPreviewThumbUrl] = useState<string>('');
  const [isCompositing, setIsCompositing] = useState(false);

  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [submitStage, setSubmitStage] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [orderSyncMode, setOrderSyncMode] = useState<'cloud' | 'local-demo'>('cloud');
  const [liveOrder, setLiveOrder] = useState<PhotoboothOrder | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );

  const [bgGdriveStatus, setBgGdriveStatus] = useState<'idle' | 'uploading' | 'ready' | 'error'>('idle');
  const [bgGdriveProgress, setBgGdriveProgress] = useState<GDriveUploadProgress | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const retakeTargetRef = useRef<RetakeTarget | null>(null);
  const bgTrackerRef = useRef<BgUploadTracker | null>(null);
  const bgTrackerSeqRef = useRef(0);
  const failedCloudOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    retakeTargetRef.current = retakeTarget;
  }, [retakeTarget]);

  const activePkgs = packages.filter((p) => p.isActive);
  const activeFrames = frames.filter((f) => f.active);
  const selectedPkg =
    packages.find((p) => p.id === selectedPkgId) || activePkgs[0] || null;
  const selectedFrame = frames.find((f) => f.id === selectedFrameId) || null;
  const frameSlotCount = getFrameSlotCount(selectedFrame);
  const slotAspectRatio = getSlotAspectRatio(selectedFrame);
  const appliedVoucher = appliedVoucherCode
    ? vouchers.find((v) => v.isActive && v.code === appliedVoucherCode) || null
    : null;

  useEffect(() => {
    if (step === 'checkout' && selectedPkg) {
      onSelectedPackageChange(selectedPkg.name);
    } else {
      onSelectedPackageChange(null);
    }
  }, [selectedPkg, step, onSelectedPackageChange]);

  const clearCountdownTimer = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownVal(null);
  }, []);

  const stopCamera = useCallback(() => {
    clearCountdownTimer();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, [clearCountdownTimer]);

  // Manage camera stream lifecycle cleanly on camera step and timeout
  useEffect(() => {
    if (step !== 'camera' || isSessionExpired) {
      stopCamera();
      return;
    }

    let cancelled = false;
    setCameraError(null);
    setCameraReady(false);

    const initCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const msg =
          'Browser ini belum mendukung akses kamera. Pastikan situs memakai HTTPS dan izinkan akses kamera.';
        setCameraError(msg);
        setCamStatusMsg(msg);
        return;
      }

      try {
        stopCamera();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
        setCameraError(null);
        setCamStatusMsg('Kamera aktif (rasio sudah pas slot frame). Tekan CAPTURE (3s) untuk memotret.');
      } catch {
        if (cancelled) return;
        const msg =
          'Izin kamera ditolak atau kamera depan sedang dipakai aplikasi lain. Izinkan kamera di Safari lalu tekan Muat Ulang Kamera.';
        setCameraError(msg);
        setCamStatusMsg(msg);
      }
    };

    initCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [step, isSessionExpired, cameraRetryTick, stopCamera]);

  // Keep ticket order status synced from both local Demo Store and Cloud Firestore
  useEffect(() => {
    if (!currentOrderId) {
      setLiveOrder(null);
      onOrderSubmittedChange(false);
      return;
    }
    onOrderSubmittedChange(true);

    const mergeLiveOrder = (incoming: PhotoboothOrder | null) => {
      if (!incoming) return;
      setLiveOrder((prev) => {
        if (prev?.paymentStatus === 'VERIFIED' && incoming.paymentStatus !== 'VERIFIED') {
          return prev;
        }
        return incoming;
      });
    };

    const unsubDemo = subscribeDemoState((state) => {
      const found = state.orders.find((o) => o.id === currentOrderId) || null;
      mergeLiveOrder(found);
    });
    const unsubCloud =
      orderSyncMode === 'cloud' || catalogSynced
        ? subscribeSingleOrder(currentOrderId, (ord) => {
            mergeLiveOrder(ord);
          })
        : () => {};

    return () => {
      unsubDemo();
      unsubCloud();
    };
  }, [currentOrderId, orderSyncMode, catalogSynced, onOrderSubmittedChange]);

  const resetAllSessionState = useCallback(() => {
    stopCamera();
    setSelectedPkgId(null);
    setSelectedFrameId(null);
    setPhotos([]);
    setAssignments(createInitialAssignments());
    setSelectedTrayPhotoId(null);
    setSelectedSlotIndex(0);
    setWantsPrintOpt(false);
    setDoodleNotes('');
    setAppliedVoucherCode(null);
    setFinalCompositePng(null);
    setPreviewThumbUrl('');
    setCurrentOrderId(null);
    setOrderSyncMode('cloud');
    setSubmitStage(null);
    setLiveOrder(null);
    setOrderError(null);
    setRetakeTarget(null);
    setLastCapturedId(null);
    bgTrackerRef.current = null;
    failedCloudOrderIdsRef.current.clear();
    setBgGdriveStatus('idle');
    setBgGdriveProgress(null);
  }, [stopCamera]);

  const resolveEffectiveGdriveConfig = useCallback((): GoogleDriveConfig => {
    const local = getGDriveConfig();
    if (cloudGDriveConfig?.webAppUrl) {
      return {
        webAppUrl: cloudGDriveConfig.webAppUrl,
        rootFolderId: cloudGDriveConfig.rootFolderId,
        secretKey: local.secretKey,
      };
    }
    return local;
  }, [cloudGDriveConfig]);

  // Start Google Drive upload in background as soon as the guest enters package selection
  useEffect(() => {
    if (step !== 'checkout' || currentOrderId || !finalCompositePng) return;

    const gdriveCfg = resolveEffectiveGdriveConfig();
    if (!gdriveCfg.webAppUrl.trim()) return;

    const signature = `${finalCompositePng.length}:${finalCompositePng.slice(-48)}:${photos
      .map((p) => `${p.id}:${p.dataUrl.length}`)
      .join('|')}`;
    const prevTracker = bgTrackerRef.current;

    if (prevTracker && prevTracker.signature === signature && prevTracker.status !== 'error') {
      return;
    }

    const trackerId = ++bgTrackerSeqRef.current;
    const draftOrderId =
      prevTracker?.draftOrderId ||
      `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const draftOrderCode =
      prevTracker?.draftOrderCode || `WHP-${Math.floor(1000 + Math.random() * 9000)}`;

    let resolveFolderReady!: (v: { folderId: string; folderUrl: string } | null) => void;
    const folderReadyPromise = new Promise<{ folderId: string; folderUrl: string } | null>(
      (resolve) => {
        resolveFolderReady = resolve;
      }
    );

    const tracker: BgUploadTracker = {
      id: trackerId,
      draftOrderId,
      draftOrderCode,
      signature,
      folderId: prevTracker?.folderId,
      folderUrl: prevTracker?.folderUrl,
      status: 'uploading',
      result: null,
      submittedOrderId: null,
      orderCreatedPromise: null,
      folderReadyPromise,
    };
    bgTrackerRef.current = tracker;
    setBgGdriveStatus('uploading');
    setBgGdriveProgress(null);

    const rawPhotosSnapshot = photos.map((photo, idx) => ({
      filename: `Pose-${String(idx + 1).padStart(2, '0')}.jpg`,
      dataUrl: photo.dataUrl,
    }));
    const compositeSnapshot = finalCompositePng;
    const useCloudSync = !preferDemoCatalog;

    void (async () => {
      try {
        let reuseFolderId = prevTracker?.folderId;
        if (!reuseFolderId && prevTracker?.status === 'uploading') {
          const prevFolder = await Promise.race([
            prevTracker.folderReadyPromise,
            new Promise<null>((r) => window.setTimeout(() => r(null), 4000)),
          ]);
          if (prevFolder?.folderId) {
            reuseFolderId = prevFolder.folderId;
            tracker.folderId = prevFolder.folderId;
            tracker.folderUrl = prevFolder.folderUrl;
          }
        }

        const placeholderOrder: PhotoboothOrder = {
          id: draftOrderId,
          orderCode: draftOrderCode,
          packageId: '',
          packageName: '',
          frameId: '',
          includesDoodle: false,
          wantsPrint: false,
          doodleNotes: '',
          totalAmount: 0,
          paymentStatus: 'PENDING_VERIFICATION',
          printStatus: 'NOT_APPLICABLE',
          workflowStatus: 'Waiting for Payment',
          previewThumbUrl: '',
          originalChunks: 1,
          finalChunks: 0,
          doodleDone: false,
          ...(reuseFolderId ? { gdriveFolderId: reuseFolderId } : {}),
        };

        const res = await uploadOrderToGoogleDrive(
          gdriveCfg,
          placeholderOrder,
          compositeSnapshot,
          rawPhotosSnapshot,
          reuseFolderId,
          (progress) => {
            if (bgTrackerRef.current?.id === trackerId) {
              setBgGdriveProgress(progress);
            }
          },
          (folder) => {
            tracker.folderId = folder.folderId;
            tracker.folderUrl = folder.folderUrl;
            resolveFolderReady(folder);

            if (tracker.submittedOrderId) {
              const targetId = tracker.submittedOrderId;
              void (async () => {
                await tracker.orderCreatedPromise?.catch(() => {});
                updateDemoOrder(targetId, {
                  gdriveFolderId: folder.folderId,
                  gdriveFolderUrl: folder.folderUrl,
                });
                if (useCloudSync) {
                  await saveOrderGDriveMeta(
                    targetId,
                    { folderId: folder.folderId, folderUrl: folder.folderUrl, fileCount: 0 },
                    { kind: 'original', docId: 'gdrive_pending' }
                  ).catch(() => {});
                }
              })();
            }
          }
        );

        tracker.status = 'ready';
        tracker.result = res;
        tracker.folderId = res.folderId;
        tracker.folderUrl = res.folderUrl;
        resolveFolderReady({ folderId: res.folderId, folderUrl: res.folderUrl });

        if (bgTrackerRef.current?.id === trackerId) {
          setBgGdriveStatus('ready');
          setBgGdriveProgress({ uploadedFiles: res.fileCount, totalFiles: res.fileCount });
        }

        if (tracker.submittedOrderId) {
          const targetId = tracker.submittedOrderId;
          await tracker.orderCreatedPromise?.catch(() => {});
          saveOrderGDriveLink(targetId, res);
          updateDemoOrder(targetId, {
            gdriveFolderId: res.folderId,
            gdriveFolderUrl: res.folderUrl,
            gdriveUploadedCount: res.fileCount,
          });
          if (useCloudSync) {
            await saveOrderGDriveMeta(
              targetId,
              { folderId: res.folderId, folderUrl: res.folderUrl, fileCount: res.fileCount },
              { kind: 'original', docId: 'gdrive_meta' }
            ).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('Background Booth GDrive upload skipped/failed (Admin fallback active):', err);
        tracker.status = 'error';
        resolveFolderReady(null);
        if (bgTrackerRef.current?.id === trackerId) {
          setBgGdriveStatus('error');
        }
      }
    })();
  }, [step, currentOrderId, finalCompositePng, photos, preferDemoCatalog, resolveEffectiveGdriveConfig]);

  const handleStartNewSession = () => {
    resetAllSessionState();
    onStartSessionTimer();
    setStep('frame');
  };

  const handleResetToWelcome = useCallback(() => {
    resetAllSessionState();
    onResetSessionTimer();
    setStep('welcome');
  }, [resetAllSessionState, onResetSessionTimer, setStep]);

  const handleChooseFrame = (frame: PhotoFrame) => {
    const targetCount = getFrameSlotCount(frame);
    setSelectedFrameId(frame.id);
    setAssignments((prev) =>
      Array.from({ length: targetCount }, (_, i) => {
        const existing = prev[i];
        return existing
          ? { ...existing, slotIndex: i }
          : {
              slotIndex: i,
              photoId: null,
              filter: 'original',
              brightness: 0,
              mirrored: false,
            };
      })
    );
    setSelectedSlotIndex((prevIdx) => (prevIdx < targetCount ? prevIdx : 0));
    setStep('camera');
  };

  const commitCapturedDataUrl = useCallback((dataUrl: string) => {
    const activeRetake = retakeTargetRef.current;
    if (activeRetake) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === activeRetake.photoId ? { ...p, dataUrl } : p))
      );
      setLastCapturedId(activeRetake.photoId);
      return;
    }

    const newId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    setPhotos((prev) => [...prev, { id: newId, dataUrl }]);
    setLastCapturedId(newId);
  }, []);

  const captureDemoPose = () => {
    const activeRetake = retakeTargetRef.current;
    const poseNum = activeRetake
      ? Math.max(1, photos.findIndex((p) => p.id === activeRetake.photoId) + 1)
      : photos.length + 1;
    // Slightly vary demo pose index when retaking so replacement is immediately obvious
    const variantNum = activeRetake ? poseNum + 1 : poseNum;
    commitCapturedDataUrl(createDemoPosePhoto(variantNum, slotAspectRatio));
  };

  const captureDemoSixAndProceed = () => {
    setPhotos((prev) => {
      const next = [...prev];
      while (next.length < frameSlotCount) {
        const idx = next.length + 1;
        next.push({
          id: `p-${Date.now()}-${idx}`,
          dataUrl: createDemoPosePhoto(idx, slotAspectRatio),
        });
      }
      return next;
    });
    setRetakeTarget(null);
    setLastCapturedId(null);
    stopCamera();
    setStep('editor');
  };

  const captureWithCountdown = () => {
    if (countdownTimerRef.current !== null || countdownVal !== null) return;
    const video = videoRef.current;
    if (!streamRef.current || !video || !video.videoWidth) {
      captureDemoPose();
      return;
    }

    let count = 3;
    setCountdownVal(count);
    countdownTimerRef.current = window.setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdownVal(count);
      } else {
        clearCountdownTimer();
        setShutterFlash(true);
        window.setTimeout(() => setShutterFlash(false), 220);

        const dataUrl = captureVideoSlotFrame(video, saveMirrored, slotAspectRatio);
        if (dataUrl) {
          commitCapturedDataUrl(dataUrl);
        }
      }
    }, 1000);
  };

  const handleStartRetakePhoto = (photoId: string, slotNumber?: number, returnToEditor = false) => {
    setRetakeTarget({ photoId, slotNumber, returnToEditor });
  };

  const handleDeletePhoto = (photoId: string) => {
    setPhotos((prev) => prev.filter((item) => item.id !== photoId));
    setAssignments((prev) =>
      prev.map((a) => (a.photoId === photoId ? { ...a, photoId: null } : a))
    );
    if (retakeTarget?.photoId === photoId) setRetakeTarget(null);
    if (lastCapturedId === photoId) setLastCapturedId(null);
    if (selectedTrayPhotoId === photoId) setSelectedTrayPhotoId(null);
  };

  const handleClearAllPhotos = () => {
    setPhotos([]);
    setAssignments(createInitialAssignments(frameSlotCount));
    setRetakeTarget(null);
    setLastCapturedId(null);
    setSelectedTrayPhotoId(null);
  };

  const placeTrayPhotoInSlot = useCallback((photoId: string, targetSlot: number) => {
    setAssignments((prev) =>
      prev.map((a) => (a.slotIndex === targetSlot ? { ...a, photoId } : a))
    );
    setSelectedTrayPhotoId(null);
    setSelectedSlotIndex(targetSlot);
  }, []);

  const swapSlots = useCallback((fromSlot: number, toSlot: number) => {
    if (fromSlot === toSlot) return;
    setAssignments((prev) => {
      const next = [...prev];
      const fromData = next[fromSlot];
      const targetData = next[toSlot];
      next[toSlot] = { ...fromData, slotIndex: toSlot };
      next[fromSlot] = { ...targetData, slotIndex: fromSlot };
      return next;
    });
    setSelectedSlotIndex(toSlot);
  }, []);

  const handleDropSlot = (targetSlot: number, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (payload.type === 'tray' && payload.photoId) {
        placeTrayPhotoInSlot(payload.photoId, targetSlot);
      } else if (payload.type === 'slot' && typeof payload.fromSlot === 'number') {
        swapSlots(payload.fromSlot, targetSlot);
      }
    } catch {
      // Ignore malformed drag payload
    }
  };

  const handleClickSlot = (slotIndex: number) => {
    if (selectedTrayPhotoId) {
      placeTrayPhotoInSlot(selectedTrayPhotoId, slotIndex);
    } else {
      setSelectedSlotIndex(slotIndex);
    }
  };

  const updateCurrentSlot = (patch: Partial<SlotAssignment>) => {
    setAssignments((prev) =>
      prev.map((a) => (a.slotIndex === selectedSlotIndex ? { ...a, ...patch } : a))
    );
  };

  const applyStyleToAllSlots = () => {
    const cur = assignments[selectedSlotIndex];
    setAssignments((prev) =>
      prev.map((a) =>
        a.photoId
          ? {
              ...a,
              filter: cur.filter,
              brightness: cur.brightness,
              mirrored: cur.mirrored,
            }
          : a
      )
    );
  };

  const resetCurrentSlot = () => {
    updateCurrentSlot({ filter: 'original', brightness: 0, mirrored: false });
  };

  const clearCurrentSlot = () => {
    updateCurrentSlot({ photoId: null, filter: 'original', brightness: 0, mirrored: false });
  };

  const renderCompositeAndPreview = async (customAssignments?: SlotAssignment[]) => {
    const targetFrame = selectedFrame || activeFrames[0];
    if (!targetFrame) return;
    if (!selectedFrame) setSelectedFrameId(targetFrame.id);

    setStep('preview');
    setIsCompositing(true);
    setFinalCompositePng(null);
    try {
      const { fullPngDataUrl, previewThumbUrl: thumb } = await buildComposite4R(
        photos,
        customAssignments || assignments,
        targetFrame
      );
      setFinalCompositePng(fullPngDataUrl);
      setPreviewThumbUrl(thumb);
    } catch (err) {
      console.error('Composite render error:', err);
    } finally {
      setIsCompositing(false);
    }
  };

  const handleTimeoutProceedToPreview = () => {
    if (photos.length === 0) {
      handleResetToWelcome();
      return;
    }
    // Recover unfilled slots only when the guest confirms advancing after session timeout
    const recoveredAssignments = assignments.map((a, idx) =>
      a.photoId ? a : { ...a, photoId: photos[idx % photos.length].id }
    );
    setAssignments(recoveredAssignments);
    onContinueWithGraceTime();
    renderCompositeAndPreview(recoveredAssignments);
  };

  const handleSelectPackage = (pkg: ServicePackage) => {
    setSelectedPkgId(pkg.id);
    setWantsPrintOpt(pkg.includesPrint);
  };

  const handleApplyVoucher = (rawCode: string): { ok: boolean; error?: string } => {
    const clean = normalizeVoucherCode(rawCode);
    if (!clean) {
      return { ok: false, error: 'Masukkan kode voucher terlebih dahulu.' };
    }
    const found = vouchers.find((v) => v.code === clean);
    if (!found) {
      return { ok: false, error: `Kode "${clean}" tidak ditemukan.` };
    }
    if (!found.isActive) {
      return { ok: false, error: `Voucher "${clean}" sedang tidak aktif.` };
    }
    setAppliedVoucherCode(found.code);
    return { ok: true };
  };

  const handleSubmitOrder = async () => {
    const pkgToSubmit = selectedPkg || activePkgs[0];
    const frameToSubmit = selectedFrame || activeFrames[0];
    if (!pkgToSubmit || !frameToSubmit || !finalCompositePng) return;

    setIsSubmittingOrder(true);
    setSubmitStage('Menyiapkan pesanan...');
    setOrderError(null);
    const effectivePrint =
      pkgToSubmit.code === 'PHOTO_ONLY' ? wantsPrintOpt : pkgToSubmit.includesPrint;
    const printFee = effectivePrint ? settings.printAddonPrice : 0;
    const subtotal = pkgToSubmit.digitalPrice + printFee;
    const discountAmount = calculateVoucherDiscount(subtotal, appliedVoucher);
    const totalAmount = Math.max(0, subtotal - discountAmount);
    const notesWithVoucher = appendVoucherNote(doodleNotes, appliedVoucher, discountAmount);

    const tracker = bgTrackerRef.current;
    const canReuseDraftId =
      Boolean(tracker?.draftOrderId) &&
      !failedCloudOrderIdsRef.current.has(tracker!.draftOrderId);
    const orderId = canReuseDraftId
      ? tracker!.draftOrderId
      : `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const orderCode =
      tracker?.draftOrderCode || `WHP-${Math.floor(1000 + Math.random() * 9000)}`;
    if (tracker) {
      tracker.submittedOrderId = orderId;
    }

    const rawPhotosPayload = photos.map((photo, idx) => ({
      filename: `Pose-${String(idx + 1).padStart(2, '0')}.jpg`,
      dataUrl: photo.dataUrl,
    }));

    const mustSyncCloud = !preferDemoCatalog;

    const persistOrder = async (): Promise<{
      mode: 'cloud' | 'local-demo';
      confirmedOrder: PhotoboothOrder;
    }> => {
      if (mustSyncCloud) {
        await createPhotoboothOrder({
          orderId,
          orderCode,
          pkg: pkgToSubmit,
          frameId: frameToSubmit.id,
          wantsPrint: effectivePrint,
          doodleNotes: notesWithVoucher,
          totalAmount,
          fullPngDataUrl: finalCompositePng,
          previewThumbUrl,
          rawPhotos: rawPhotosPayload,
          onProgress: (stage) => setSubmitStage(stage),
        });

        if (tracker?.result) {
          await saveOrderGDriveMeta(
            orderId,
            {
              folderId: tracker.result.folderId,
              folderUrl: tracker.result.folderUrl,
              fileCount: tracker.result.fileCount,
            },
            { kind: 'original', docId: 'gdrive_meta' }
          ).catch(() => {});
        } else if (tracker?.folderId && tracker?.folderUrl) {
          await saveOrderGDriveMeta(
            orderId,
            {
              folderId: tracker.folderId,
              folderUrl: tracker.folderUrl,
              fileCount: 0,
            },
            { kind: 'original', docId: 'gdrive_pending' }
          ).catch(() => {});
        }

        const nowIso = new Date().toISOString();
        const confirmedOrder: PhotoboothOrder = {
          id: orderId,
          orderCode,
          packageId: pkgToSubmit.id,
          packageName: pkgToSubmit.name.slice(0, 80),
          frameId: frameToSubmit.id,
          includesDoodle: pkgToSubmit.includesDoodle,
          wantsPrint: effectivePrint,
          doodleNotes: notesWithVoucher.trim().slice(0, 300),
          totalAmount,
          paymentStatus: 'PENDING_VERIFICATION',
          printStatus: effectivePrint ? 'QUEUED' : 'NOT_APPLICABLE',
          workflowStatus: 'Waiting for Payment',
          previewThumbUrl,
          originalChunks: 1,
          finalChunks: 0,
          doodleDone: false,
          ...(tracker?.result?.folderId || tracker?.folderId
            ? { gdriveFolderId: tracker?.result?.folderId || tracker?.folderId }
            : {}),
          ...(tracker?.result?.folderUrl || tracker?.folderUrl
            ? { gdriveFolderUrl: tracker?.result?.folderUrl || tracker?.folderUrl }
            : {}),
          ...(typeof tracker?.result?.fileCount === 'number'
            ? { gdriveUploadedCount: tracker.result.fileCount }
            : {}),
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        // Mirror locally as cache only after Cloud Firestore confirms commit
        try {
          await createDemoOrder({
            orderId,
            orderCode,
            pkg: pkgToSubmit,
            frameId: frameToSubmit.id,
            wantsPrint: effectivePrint,
            doodleNotes: notesWithVoucher,
            totalAmount,
            previewThumbUrl,
            fullPngDataUrl: finalCompositePng,
            rawPhotos: rawPhotosPayload,
            gdriveFolderId: tracker?.result?.folderId || tracker?.folderId,
            gdriveFolderUrl: tracker?.result?.folderUrl || tracker?.folderUrl,
            gdriveUploadedCount: tracker?.result?.fileCount,
          });
          if (tracker?.result) {
            saveOrderGDriveLink(orderId, tracker.result);
          }
        } catch (localCacheErr) {
          console.warn('Local cache mirror skipped after cloud sync:', localCacheErr);
        }

        return { mode: 'cloud', confirmedOrder };
      }

      // Explicit single-device local demo mode
      setSubmitStage('Menyimpan pesanan ke mode demo lokal...');
      const localOrder = await createDemoOrder({
        orderId,
        orderCode,
        pkg: pkgToSubmit,
        frameId: frameToSubmit.id,
        wantsPrint: effectivePrint,
        doodleNotes: notesWithVoucher,
        totalAmount,
        previewThumbUrl,
        fullPngDataUrl: finalCompositePng,
        rawPhotos: rawPhotosPayload,
        gdriveFolderId: tracker?.result?.folderId || tracker?.folderId,
        gdriveFolderUrl: tracker?.result?.folderUrl || tracker?.folderUrl,
        gdriveUploadedCount: tracker?.result?.fileCount,
      });

      if (tracker?.result) {
        saveOrderGDriveLink(orderId, tracker.result);
      }

      return { mode: 'local-demo', confirmedOrder: localOrder };
    };

    const creationPromise = persistOrder();
    if (tracker) {
      tracker.orderCreatedPromise = creationPromise.then(() => undefined);
    }

    try {
      const { mode, confirmedOrder } = await creationPromise;
      setOrderSyncMode(mode);
      setLiveOrder(confirmedOrder);
      setCurrentOrderId(orderId);
    } catch (err) {
      if (mustSyncCloud) {
        failedCloudOrderIdsRef.current.add(orderId);
      }
      if (tracker) {
        tracker.submittedOrderId = null;
        tracker.orderCreatedPromise = null;
      }
      console.error('Order submission failed:', err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Gagal mengirim pesanan ke meja kasir. Periksa Wi-Fi lalu coba lagi.';
      setOrderError(message);
    } finally {
      setIsSubmittingOrder(false);
      setSubmitStage(null);
    }
  };

  const renderStepContent = () => {
    if (step === 'welcome') {
      return (
        <WelcomeStep
          activeFrames={activeFrames}
          onStartSession={handleStartNewSession}
        />
      );
    }

    if (step === 'frame') {
      return (
        <FrameStep
          activeFrames={activeFrames}
          selectedFrameId={selectedFrameId}
          onSelectFrame={handleChooseFrame}
        />
      );
    }

    if (step === 'camera') {
      return (
        <CameraStep
          photos={photos}
          requiredPhotoCount={frameSlotCount}
          slotAspectRatio={slotAspectRatio}
          mirrorPreview={mirrorPreview}
          setMirrorPreview={setMirrorPreview}
          saveMirrored={saveMirrored}
          setSaveMirrored={setSaveMirrored}
          countdownVal={countdownVal}
          shutterFlash={shutterFlash}
          camStatusMsg={camStatusMsg}
          cameraReady={cameraReady}
          cameraError={cameraError}
          videoRef={videoRef}
          retakeTarget={retakeTarget}
          lastCapturedId={lastCapturedId}
          onDismissReview={() => setLastCapturedId(null)}
          onRetryCamera={() => setCameraRetryTick((n) => n + 1)}
          onCaptureWithCountdown={captureWithCountdown}
          onCaptureDemoPose={captureDemoPose}
          onCaptureDemoSixAndProceed={captureDemoSixAndProceed}
          onStartRetakePhoto={(photoId) => handleStartRetakePhoto(photoId)}
          onCancelRetake={() => setRetakeTarget(null)}
          onDeletePhoto={handleDeletePhoto}
          onClearAllPhotos={handleClearAllPhotos}
          onProceedToEditor={() => {
            setRetakeTarget(null);
            setLastCapturedId(null);
            stopCamera();
            setStep('editor');
          }}
        />
      );
    }

    if (step === 'editor' && selectedFrame) {
      return (
        <EditorStep
          selectedFrame={selectedFrame}
          slotAspectRatio={slotAspectRatio}
          photos={photos}
          assignments={assignments}
          selectedTrayPhotoId={selectedTrayPhotoId}
          setSelectedTrayPhotoId={setSelectedTrayPhotoId}
          selectedSlotIndex={selectedSlotIndex}
          setSelectedSlotIndex={setSelectedSlotIndex}
          onClickSlot={handleClickSlot}
          onDropSlot={handleDropSlot}
          onPlaceTrayPhotoInSlot={placeTrayPhotoInSlot}
          onSwapSlots={swapSlots}
          onUpdateSlot={updateCurrentSlot}
          onApplyStyleToAllSlots={applyStyleToAllSlots}
          onResetCurrentSlot={resetCurrentSlot}
          onClearCurrentSlot={clearCurrentSlot}
          onAddMorePhotos={() => {
            setRetakeTarget(null);
            setLastCapturedId(null);
            setStep('camera');
          }}
          onRetakeSlotPhoto={(photoId, slotIndex) => {
            setLastCapturedId(null);
            handleStartRetakePhoto(photoId, slotIndex + 1, true);
            setStep('camera');
          }}
          onGoFinalPreview={() => renderCompositeAndPreview()}
        />
      );
    }

    if (step === 'preview' && selectedFrame) {
      return (
        <PreviewStep
          selectedFrame={selectedFrame}
          finalCompositePng={finalCompositePng}
          isCompositing={isCompositing}
          onEditAgain={() => setStep('editor')}
          onConfirmPhoto={() => {
            if (!selectedPkgId && activePkgs[0]) {
              setSelectedPkgId(activePkgs[0].id);
              setWantsPrintOpt(activePkgs[0].includesPrint);
            }
            setStep('checkout');
          }}
        />
      );
    }

    if (step === 'checkout') {
      return (
        <CheckoutStep
          activePkgs={activePkgs}
          selectedPkg={selectedPkg}
          onSelectPackage={handleSelectPackage}
          wantsPrintOpt={wantsPrintOpt}
          setWantsPrintOpt={setWantsPrintOpt}
          doodleNotes={doodleNotes}
          setDoodleNotes={setDoodleNotes}
          appliedVoucher={appliedVoucher}
          onApplyVoucher={handleApplyVoucher}
          onRemoveVoucher={() => setAppliedVoucherCode(null)}
          settings={settings}
          finalCompositePng={finalCompositePng}
          isSubmittingOrder={isSubmittingOrder}
          submitStage={submitStage}
          orderError={orderError}
          isOnline={isOnline}
          orderSyncMode={orderSyncMode}
          currentOrderId={currentOrderId}
          liveOrder={liveOrder}
          bgGdriveStatus={bgGdriveStatus}
          bgGdriveProgress={bgGdriveProgress}
          onSubmitOrder={handleSubmitOrder}
          onResetBoothNow={handleResetToWelcome}
        />
      );
    }

    return null;
  };

  return (
    <div className={step === 'editor' ? 'md:h-full' : ''}>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className={step === 'editor' ? 'md:h-full' : ''}
        >
          {renderStepContent()}
        </motion.div>
      </AnimatePresence>

      {isSessionExpired &&
        step !== 'welcome' &&
        !currentOrderId &&
        !isSubmittingOrder &&
        !orderError && (
        <SessionTimeoutModal
          hasPhotos={photos.length > 0}
          canExtendOnce={canExtendOnce}
          onProceedToPreview={handleTimeoutProceedToPreview}
          onExtendOneMinute={onExtendOneMinute}
          onResetToWelcome={handleResetToWelcome}
        />
      )}
    </div>
  );
}
