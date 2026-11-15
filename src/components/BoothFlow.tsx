import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  createPhotoboothOrder,
  subscribeSingleOrder,
} from '../services/firestoreService';
import {
  type BoothStep,
  type CapturedPhoto,
  type PhotoFrame,
  type PhotoboothOrder,
  type ServicePackage,
  type SlotAssignment,
  type StoreSettings,
} from '../types';
import {
  buildComposite4R,
  createDemoPosePhoto,
} from '../utils/canvasEngine';
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
  frames: PhotoFrame[];
  settings: StoreSettings;
  catalogSynced: boolean;
  isSessionExpired: boolean;
  canExtendOnce: boolean;
  onStartSessionTimer: () => void;
  onExtendOneMinute: () => void;
  onContinueWithGraceTime: () => void;
  onOrderSubmittedChange: (submitted: boolean) => void;
  onResetSessionTimer: () => void;
  onSelectedPackageChange: (pkgName: string | null) => void;
  onOpenAdmin: () => void;
}

const createInitialAssignments = (): SlotAssignment[] =>
  Array.from({ length: 6 }, (_, i) => ({
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
  frames,
  settings,
  catalogSynced,
  isSessionExpired,
  canExtendOnce,
  onStartSessionTimer,
  onExtendOneMinute,
  onContinueWithGraceTime,
  onOrderSubmittedChange,
  onResetSessionTimer,
  onSelectedPackageChange,
  onOpenAdmin,
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
  const [finalCompositePng, setFinalCompositePng] = useState<string | null>(null);
  const [previewThumbUrl, setPreviewThumbUrl] = useState<string>('');
  const [isCompositing, setIsCompositing] = useState(false);

  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [liveOrder, setLiveOrder] = useState<PhotoboothOrder | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const retakeTargetRef = useRef<RetakeTarget | null>(null);

  useEffect(() => {
    retakeTargetRef.current = retakeTarget;
  }, [retakeTarget]);

  const activePkgs = packages.filter((p) => p.isActive);
  const activeFrames = frames.filter((f) => f.active);
  const selectedPkg =
    packages.find((p) => p.id === selectedPkgId) || activePkgs[0] || null;
  const selectedFrame = frames.find((f) => f.id === selectedFrameId) || null;

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
          'Browser ini belum mendukung akses kamera. Pastikan situs memakai HTTPS atau gunakan tombol "Ambil Pose Demo".';
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
        setCamStatusMsg('Kamera aktif. Tekan CAPTURE (3s) atau gunakan Pose Demo.');
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

  // Keep ticket order status synced when order is submitted
  useEffect(() => {
    if (!currentOrderId) {
      setLiveOrder(null);
      onOrderSubmittedChange(false);
      return;
    }
    onOrderSubmittedChange(true);
    const unsub = subscribeSingleOrder(currentOrderId, (ord) => {
      setLiveOrder(ord);
    });
    return () => unsub();
  }, [currentOrderId, onOrderSubmittedChange]);

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
    setFinalCompositePng(null);
    setPreviewThumbUrl('');
    setCurrentOrderId(null);
    setLiveOrder(null);
    setOrderError(null);
    setRetakeTarget(null);
    setLastCapturedId(null);
  }, [stopCamera]);

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
    setSelectedFrameId(frame.id);
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
    commitCapturedDataUrl(createDemoPosePhoto(variantNum));
  };

  const captureDemoSixAndProceed = () => {
    setPhotos((prev) => {
      const next = [...prev];
      while (next.length < 6) {
        const idx = next.length + 1;
        next.push({
          id: `p-${Date.now()}-${idx}`,
          dataUrl: createDemoPosePhoto(idx),
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

        const c = document.createElement('canvas');
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        const ctx = c.getContext('2d');
        if (ctx) {
          if (saveMirrored) {
            ctx.translate(c.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(video, 0, 0);
          const dataUrl = c.toDataURL('image/jpeg', 0.92);
          commitCapturedDataUrl(dataUrl);
        }
      }
    }, 900);
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
    setAssignments(createInitialAssignments());
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

  const handleSubmitOrder = async () => {
    const pkgToSubmit = selectedPkg || activePkgs[0];
    const frameToSubmit = selectedFrame || activeFrames[0];
    if (!pkgToSubmit || !frameToSubmit || !finalCompositePng) return;

    setIsSubmittingOrder(true);
    setOrderError(null);
    const effectivePrint =
      pkgToSubmit.code === 'PHOTO_ONLY' ? wantsPrintOpt : pkgToSubmit.includesPrint;
    const printFee = effectivePrint ? settings.printAddonPrice : 0;
    const totalAmount = pkgToSubmit.digitalPrice + printFee;

    try {
      const orderId = await createPhotoboothOrder({
        pkg: pkgToSubmit,
        frameId: frameToSubmit.id,
        wantsPrint: effectivePrint,
        doodleNotes,
        totalAmount,
        fullPngDataUrl: finalCompositePng,
        previewThumbUrl,
      });
      setCurrentOrderId(orderId);
    } catch (err) {
      console.error(err);
      setOrderError(
        'Gagal mengirim pesanan ke server cloud. Pastikan katalog paket & frame sudah diinisialisasi di Admin Dashboard.'
      );
    } finally {
      setIsSubmittingOrder(false);
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
          onOpenAdmin={onOpenAdmin}
        />
      );
    }

    if (step === 'camera') {
      return (
        <CameraStep
          photos={photos}
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
          settings={settings}
          finalCompositePng={finalCompositePng}
          catalogSynced={catalogSynced}
          isSubmittingOrder={isSubmittingOrder}
          orderError={orderError}
          currentOrderId={currentOrderId}
          liveOrder={liveOrder}
          onSubmitOrder={handleSubmitOrder}
          onOpenAdmin={onOpenAdmin}
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

      {isSessionExpired && step !== 'welcome' && !currentOrderId && (
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
