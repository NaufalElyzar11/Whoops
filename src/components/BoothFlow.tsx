import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Download,
  FlipHorizontal,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { rupiah } from '../constants/defaults';
import {
  createPhotoboothOrder,
  fetchOrderMediaDataUrl,
  subscribeSingleOrder,
} from '../services/firestoreService';
import {
  DEFAULT_SLOTS,
  FILTER_NAMES,
  type BoothStep,
  type CapturedPhoto,
  type FilterType,
  type PhotoFrame,
  type PhotoboothOrder,
  type ServicePackage,
  type SlotAssignment,
  type StoreSettings,
} from '../types';
import {
  buildComposite4R,
  createDemoPosePhoto,
  getCssFilter,
} from '../utils/canvasEngine';
import { FramePreviewCanvas } from './FramePreviewCanvas';
import { QrCodeBox } from './QrCodeBox';
import { WhoopsLogo } from './WhoopsLogo';

interface BoothFlowProps {
  step: BoothStep;
  setStep: (step: BoothStep) => void;
  packages: ServicePackage[];
  frames: PhotoFrame[];
  settings: StoreSettings;
  catalogSynced: boolean;
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
  const [camStatusMsg, setCamStatusMsg] = useState('');
  const [countdownVal, setCountdownVal] = useState<number | null>(null);
  const [shutterFlash, setShutterFlash] = useState(false);

  const [wantsPrintOpt, setWantsPrintOpt] = useState(false);
  const [doodleNotes, setDoodleNotes] = useState('');
  const [finalCompositePng, setFinalCompositePng] = useState<string | null>(null);
  const [previewThumbUrl, setPreviewThumbUrl] = useState<string>('');
  const [isCompositing, setIsCompositing] = useState(false);

  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [liveOrder, setLiveOrder] = useState<PhotoboothOrder | null>(null);
  const [resolvedFinalUrl, setResolvedFinalUrl] = useState<string | null>(null);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const activePkgs = packages.filter((p) => p.isActive);
  const activeFrames = frames.filter((f) => f.active);
  const selectedPkg = packages.find((p) => p.id === selectedPkgId) || null;
  const selectedFrame = frames.find((f) => f.id === selectedFrameId) || null;

  useEffect(() => {
    if (selectedPkg && !['welcome', 'service'].includes(step)) {
      onSelectedPackageChange(selectedPkg.name);
    } else {
      onSelectedPackageChange(null);
    }
  }, [selectedPkg, step, onSelectedPackageChange]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (step !== 'camera') {
      stopCamera();
      return;
    }
    let cancelled = false;
    const initCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCamStatusMsg(
          'Kamera tidak tersedia di browser ini. Gunakan tombol "Ambil Pose Demo" untuk mencoba.'
        );
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
        setCamStatusMsg('Kamera aktif. Tekan CAPTURE (3s) atau gunakan Pose Demo.');
      } catch {
        setCamStatusMsg(
          'Izin kamera ditolak atau tidak ditemukan. Gunakan tombol "Ambil Pose Demo" di bawah.'
        );
      }
    };
    initCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [step]);

  useEffect(() => {
    if (!currentOrderId) {
      setLiveOrder(null);
      return;
    }
    const unsub = subscribeSingleOrder(currentOrderId, (ord) => {
      setLiveOrder(ord);
    });
    return () => unsub();
  }, [currentOrderId]);

  useEffect(() => {
    if (!liveOrder) {
      setResolvedFinalUrl(null);
      return;
    }
    const readyToShow =
      liveOrder.paymentStatus === 'VERIFIED' &&
      (!liveOrder.includesDoodle || liveOrder.doodleDone);

    if (!readyToShow) {
      setResolvedFinalUrl(null);
      return;
    }

    let cancelled = false;
    const kind = liveOrder.doodleDone && liveOrder.finalChunks > 0 ? 'final' : 'original';
    const count = kind === 'final' ? liveOrder.finalChunks : liveOrder.originalChunks;
    if (count <= 0) {
      setResolvedFinalUrl(liveOrder.previewThumbUrl || null);
      return;
    }
    setIsLoadingMedia(true);
    fetchOrderMediaDataUrl(liveOrder.id, kind, count)
      .then((dataUrl) => {
        if (!cancelled) {
          setResolvedFinalUrl(dataUrl || liveOrder.previewThumbUrl || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedFinalUrl(liveOrder.previewThumbUrl || null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMedia(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    liveOrder?.id,
    liveOrder?.paymentStatus,
    liveOrder?.includesDoodle,
    liveOrder?.doodleDone,
    liveOrder?.finalChunks,
    liveOrder?.originalChunks,
    liveOrder?.previewThumbUrl,
  ]);

  const startNewSession = () => {
    stopCamera();
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
    setStep('service');
  };

  const handleChoosePackage = (pkg: ServicePackage) => {
    setSelectedPkgId(pkg.id);
    setWantsPrintOpt(pkg.includesPrint);
    setStep('frame');
  };

  const handleChooseFrame = (frame: PhotoFrame) => {
    setSelectedFrameId(frame.id);
    setStep('camera');
  };

  const captureDemoPose = () => {
    setPhotos((prev) => {
      const nextNum = prev.length + 1;
      return [
        ...prev,
        { id: `p-${Date.now()}-${nextNum}`, dataUrl: createDemoPosePhoto(nextNum) },
      ];
    });
  };

  const captureDemoSixAndProceed = () => {
    setPhotos((prev) => {
      const next = [...prev];
      while (next.length < 6) {
        const idx = next.length + 1;
        next.push({ id: `p-${Date.now()}-${idx}`, dataUrl: createDemoPosePhoto(idx) });
      }
      return next;
    });
    stopCamera();
    setStep('editor');
  };

  const captureWithCountdown = () => {
    if (countdownVal !== null) return;
    const video = videoRef.current;
    if (!streamRef.current || !video || !video.videoWidth) {
      captureDemoPose();
      return;
    }

    let count = 3;
    setCountdownVal(count);
    const timer = window.setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdownVal(count);
      } else {
        window.clearInterval(timer);
        setCountdownVal(null);
        setShutterFlash(true);
        window.setTimeout(() => setShutterFlash(false), 180);

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
          setPhotos((prev) => [...prev, { id: `p-${Date.now()}`, dataUrl }]);
        }
      }
    }, 900);
  };

  const handleDropSlot = (targetSlot: number, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
      setAssignments((prev) => {
        const next = [...prev];
        if (payload.type === 'tray' && payload.photoId) {
          next[targetSlot] = { ...next[targetSlot], photoId: payload.photoId };
        } else if (
          payload.type === 'slot' &&
          typeof payload.fromSlot === 'number' &&
          payload.fromSlot !== targetSlot
        ) {
          const fromData = next[payload.fromSlot];
          const targetData = next[targetSlot];
          next[targetSlot] = { ...fromData, slotIndex: targetSlot };
          next[payload.fromSlot] = { ...targetData, slotIndex: payload.fromSlot };
        }
        return next;
      });
      setSelectedSlotIndex(targetSlot);
    } catch {
      // Ignore malformed drag payload
    }
  };

  const handleClickSlot = (slotIndex: number) => {
    if (selectedTrayPhotoId) {
      setAssignments((prev) =>
        prev.map((a) =>
          a.slotIndex === slotIndex ? { ...a, photoId: selectedTrayPhotoId } : a
        )
      );
      setSelectedTrayPhotoId(null);
    }
    setSelectedSlotIndex(slotIndex);
  };

  const updateCurrentSlot = (patch: Partial<SlotAssignment>) => {
    setAssignments((prev) =>
      prev.map((a) => (a.slotIndex === selectedSlotIndex ? { ...a, ...patch } : a))
    );
  };

  const resetCurrentSlot = () => {
    updateCurrentSlot({ filter: 'original', brightness: 0, mirrored: false });
  };

  const clearCurrentSlot = () => {
    updateCurrentSlot({ photoId: null, filter: 'original', brightness: 0, mirrored: false });
  };

  const handleGoFinalPreview = async () => {
    if (!selectedFrame) return;
    setStep('preview');
    setIsCompositing(true);
    setFinalCompositePng(null);
    try {
      const { fullPngDataUrl, previewThumbUrl: thumb } = await buildComposite4R(
        photos,
        assignments,
        selectedFrame
      );
      setFinalCompositePng(fullPngDataUrl);
      setPreviewThumbUrl(thumb);
    } catch (err) {
      console.error('Composite render error:', err);
    } finally {
      setIsCompositing(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (!selectedPkg || !selectedFrame || !finalCompositePng) return;
    setIsSubmittingOrder(true);
    setOrderError(null);
    const printFee = wantsPrintOpt ? settings.printAddonPrice : 0;
    const totalAmount = selectedPkg.digitalPrice + printFee;

    try {
      const orderId = await createPhotoboothOrder({
        pkg: selectedPkg,
        frameId: selectedFrame.id,
        wantsPrint: wantsPrintOpt,
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

  // ==================== RENDER STEPS ====================

  if (step === 'welcome') {
    return (
      <section className="max-w-3xl mx-auto mt-5">
        <div className="whoops-card px-6 py-10 sm:px-10 sm:py-12 text-center bg-gradient-to-b from-[#FDF7EE] to-[#F6EBDB]">
          <p className="text-xs font-display font-semibold tracking-wider text-[#6D1D3A] uppercase mb-4">
            Korean Retro Photobooth Studio
          </p>
          <div className="flex justify-center">
            <WhoopsLogo size="lg" />
          </div>
          <p className="font-hand text-[26px] sm:text-[30px] text-[#61433B] mt-2 mb-7">
            “oops, we made a memory.”
          </p>
          <button
            onClick={startNewSession}
            className="whoops-btn whoops-btn-primary text-lg sm:text-xl px-8 py-4 cursor-pointer"
          >
            START PHOTO SESSION
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-9 text-left">
            {[
              { title: '1. Pilih Paket', desc: 'Photo Only, Photo + Doodle, atau Print 4R.' },
              { title: '2. Pilih Frame', desc: 'Koleksi frame retro 6-slot dari admin.' },
              { title: '3. Jepret & Edit', desc: 'Tarik foto ke 6 slot, beri filter & mirror.' },
              { title: '4. QRIS & Unduh', desc: 'Verifikasi kasir lalu scan QR download.' },
            ].map((item) => (
              <div key={item.title} className="whoops-card-sm p-3.5">
                <div className="font-display font-bold text-sm text-[#3A231E]">{item.title}</div>
                <p className="text-xs text-[#61433B] mt-1 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (step === 'service') {
    return (
      <section>
        <div className="text-center mb-6">
          <p className="text-xs font-display font-semibold text-[#6D1D3A] tracking-wide">
            Langkah 1 dari 5
          </p>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-[#3A231E] mt-1">
            Pilih Pengalaman Fotomu
          </h1>
          <p className="text-sm text-[#61433B] mt-1">
            Pilih paket layanan sesuai keinginanmu.
          </p>
        </div>

        {!catalogSynced && (
          <div className="whoops-card-sm p-4 mb-6 bg-[#F3D2DB]/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs text-[#3A231E]">
              <b>Mode Katalog Awal:</b> Paket & frame cloud belum diinisialisasi. Masuk ke{' '}
              <b>Admin Dashboard</b> sekali untuk menyinkronkan katalog ke Firebase.
            </div>
            <button
              onClick={onOpenAdmin}
              className="whoops-btn whoops-btn-secondary text-xs px-3.5 py-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Buka Admin Dashboard
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {activePkgs.map((p) => {
            const total = p.digitalPrice + (p.includesPrint ? settings.printAddonPrice : 0);
            return (
              <div
                key={p.id}
                className="whoops-card p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs font-display font-semibold mb-2">
                    <span className="text-[#61433B]">
                      {p.includesDoodle ? 'Custom Doodle' : 'Digital Studio'}
                    </span>
                    {p.promoText && (
                      <span className="text-[#6D1D3A] uppercase tracking-wide">
                        {p.promoText}
                      </span>
                    )}
                  </div>
                  <h2 className="font-display font-bold text-2xl text-[#3A231E]">{p.name}</h2>
                  <p className="text-sm text-[#61433B] mt-2 leading-relaxed">{p.description}</p>
                  <ul className="text-xs text-[#3A231E] space-y-1.5 mt-4 pl-4 list-disc">
                    <li>File Digital 300 DPI (1205×1795) + QR Download</li>
                    {p.includesDoodle && <li>Ilustrasi Doodle Manual oleh Artist</li>}
                    {p.includesPrint && <li>Cetak 4R Silky Doff (102×152 mm)</li>}
                  </ul>
                </div>

                <div className="mt-5 pt-4 border-t-2 border-dashed border-[#3A231E]/20">
                  <div className="flex items-baseline justify-between mb-3">
                    <span className="text-xs text-[#61433B]">Harga Paket</span>
                    <span className="font-display font-bold text-2xl text-[#6D1D3A] tabular-nums">
                      {rupiah(total)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleChoosePackage(p)}
                    className="whoops-btn whoops-btn-primary w-full py-2.5 text-sm cursor-pointer"
                  >
                    Pilih Paket Ini
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (step === 'frame') {
    return (
      <section>
        <div className="text-center mb-6">
          <p className="text-xs font-display font-semibold text-[#6D1D3A] tracking-wide">
            Langkah 2 dari 5
          </p>
          <h1 className="font-display font-bold text-3xl text-[#3A231E] mt-1">
            Pilih Frame Favoritmu
          </h1>
          <p className="text-sm text-[#61433B] mt-1">
            Koleksi frame 6-slot yang aktif dikelola langsung dari Admin Dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {activeFrames.map((f) => (
            <div key={f.id} className="whoops-card p-5 flex flex-col justify-between">
              <div>
                <FramePreviewCanvas frame={f} maxWidthClass="max-w-[210px]" />
                <div className="mt-3.5">
                  <div className="text-xs text-[#61433B] font-medium">{f.category}</div>
                  <h3 className="font-display font-bold text-lg text-[#3A231E] mt-0.5">
                    {f.name}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => handleChooseFrame(f)}
                className="whoops-btn whoops-btn-primary w-full mt-4 py-2.5 text-sm cursor-pointer"
              >
                Pilih Frame Ini
              </button>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (step === 'camera') {
    return (
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 whoops-card p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-display font-bold text-xl text-[#3A231E]">Ambil Foto Kamu</h2>
            <span className="text-xs font-display font-semibold text-[#6D1D3A] tabular-nums">
              Tersimpan: {photos.length} foto
            </span>
          </div>

          <div className="relative aspect-[4/3] bg-[#2a1713] border-2 border-[#3A231E] rounded-2xl overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: mirrorPreview ? 'scaleX(-1)' : 'none' }}
            />
            {countdownVal !== null && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#3A231E]/30 font-display font-bold text-8xl text-[#FDF7EE] drop-shadow-[4px_4px_0_#6D1D3A]">
                {countdownVal}
              </div>
            )}
            {shutterFlash && <div className="absolute inset-0 bg-white/85 transition-opacity" />}
          </div>

          <p className="text-xs text-[#61433B] mt-2.5 mb-3">{camStatusMsg}</p>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMirrorPreview((v) => !v)}
                className="whoops-btn whoops-btn-ghost px-3 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
                Mirror Layar: {mirrorPreview ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => setSaveMirrored((v) => !v)}
                className="whoops-btn whoops-btn-ghost px-3 py-2 text-xs cursor-pointer whitespace-nowrap"
              >
                Simpan Mirrored: {saveMirrored ? 'YA' : 'TIDAK'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={captureDemoPose}
                className="whoops-btn whoops-btn-secondary px-3.5 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Ambil Pose Demo
              </button>
              <button
                onClick={captureWithCountdown}
                disabled={countdownVal !== null}
                className="whoops-btn whoops-btn-primary px-4 py-2 text-sm inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Camera className="w-4 h-4" />
                CAPTURE (3s)
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 whoops-card p-5">
          <h3 className="font-display font-bold text-lg text-[#3A231E] mb-3 tabular-nums">
            Galeri Jepretan ({photos.length})
          </h3>

          {photos.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#61433B] bg-[#EFE2CE] rounded-2xl border border-dashed border-[#3A231E]">
              Klik <b>CAPTURE (3s)</b> atau <b>+ Ambil Pose Demo</b> minimal untuk mengisi 6 slot frame.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
              {photos.map((p, idx) => (
                <div
                  key={p.id}
                  className="relative aspect-[4/3] rounded-xl overflow-hidden border-2 border-[#3A231E] group"
                >
                  <img src={p.dataUrl} alt={`Pose ${idx + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute top-1.5 left-1.5 bg-[#FDF7EE] border border-[#3A231E] text-[10px] px-1.5 py-0.5 rounded-md font-display font-semibold">
                    #{idx + 1}
                  </span>
                  <button
                    onClick={() => setPhotos((prev) => prev.filter((item) => item.id !== p.id))}
                    title="Hapus foto"
                    className="absolute top-1.5 right-1.5 bg-[#FDF7EE]/90 border border-[#3A231E] p-1 rounded-md text-[#6D1D3A] opacity-85 hover:opacity-100 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-2.5">
            <button
              onClick={captureDemoSixAndProceed}
              className="whoops-btn whoops-btn-secondary w-full py-2.5 text-sm cursor-pointer"
            >
              Isi Cepat 6 Pose Demo & Lanjut
            </button>
            <button
              onClick={() => {
                stopCamera();
                setStep('editor');
              }}
              disabled={photos.length === 0}
              className="whoops-btn whoops-btn-primary w-full py-2.5 text-sm cursor-pointer"
            >
              Susun 6 Slot Foto →
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (step === 'editor' && selectedFrame) {
    const filledCount = assignments.filter((a) => a.photoId !== null).length;
    const curAssign = assignments[selectedSlotIndex];
    const curPhoto = curAssign.photoId
      ? photos.find((p) => p.id === curAssign.photoId) || null
      : null;

    return (
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 whoops-card p-5 text-center">
          <div className="flex items-center justify-between mb-3">
            <span className="font-display font-bold text-base text-[#3A231E] tabular-nums">
              Kanvas 6 Slot ({filledCount}/6)
            </span>
            <span className="text-xs font-display font-semibold text-[#6D1D3A]">
              Slot #{selectedSlotIndex + 1}
            </span>
          </div>

          <FramePreviewCanvas
            frame={selectedFrame}
            maxWidthClass="max-w-[300px]"
            selectedSlotIndex={selectedSlotIndex}
            onSlotClick={handleClickSlot}
            onSlotDrop={handleDropSlot}
            renderSlotContent={(slotIdx) => {
              const a = assignments[slotIdx];
              const ph = a.photoId ? photos.find((p) => p.id === a.photoId) : null;
              if (!ph) {
                return (
                  <span className="px-1">
                    Slot {slotIdx + 1}
                    <br />
                    <small className="text-[10px]">
                      {selectedTrayPhotoId ? 'Ketuk untuk isi' : 'Kosong'}
                    </small>
                  </span>
                );
              }
              return (
                <img
                  src={ph.dataUrl}
                  alt={`Slot ${slotIdx + 1}`}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData(
                      'text/plain',
                      JSON.stringify({ type: 'slot', fromSlot: slotIdx })
                    )
                  }
                  className="w-full h-full object-cover"
                  style={{
                    filter: getCssFilter(a.filter, a.brightness),
                    transform: a.mirrored ? 'scaleX(-1)' : 'none',
                  }}
                />
              );
            }}
          />

          <p className="text-xs text-[#61433B] mt-3 leading-relaxed">
            Tarik foto ke slot, atau <b>klik foto di galeri kanan lalu ketuk slot</b>. Tarik antarslot untuk menukar posisi.
          </p>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="whoops-card p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-display font-bold text-lg text-[#3A231E]">Galeri Foto</h3>
                <p className="text-xs text-[#61433B]">
                  {selectedTrayPhotoId
                    ? 'Sekarang ketuk salah satu slot di frame kiri untuk menempatkan foto.'
                    : 'Tarik foto ke slot atau klik untuk memilih.'}
                </p>
              </div>
              <button
                onClick={() => setStep('camera')}
                className="whoops-btn whoops-btn-ghost px-3 py-1.5 text-xs whitespace-nowrap shrink-0 cursor-pointer"
              >
                + Tambah Foto
              </button>
            </div>

            <div className="flex gap-2.5 overflow-x-auto pb-2">
              {photos.map((p, idx) => {
                const isActive = selectedTrayPhotoId === p.id;
                return (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        'text/plain',
                        JSON.stringify({ type: 'tray', photoId: p.id })
                      )
                    }
                    onClick={() =>
                      setSelectedTrayPhotoId((prev) => (prev === p.id ? null : p.id))
                    }
                    className={`relative shrink-0 w-28 aspect-[4/3] rounded-xl overflow-hidden border-2 cursor-pointer bg-[#EFE2CE] ${
                      isActive
                        ? 'border-[#6D1D3A] ring-2 ring-[#E4A3B3]'
                        : 'border-[#3A231E]'
                    }`}
                  >
                    <img src={p.dataUrl} alt={`Tray ${idx + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute top-1 left-1 bg-[#FDF7EE] border border-[#3A231E] rounded px-1.5 py-0.5 text-[10px] font-display font-semibold">
                      #{idx + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="whoops-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="font-display font-bold text-lg text-[#3A231E]">
                Edit Filter Slot #{selectedSlotIndex + 1}
              </h3>
              {curPhoto && (
                <div className="flex gap-2">
                  <button
                    onClick={resetCurrentSlot}
                    className="whoops-btn whoops-btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Filter
                  </button>
                  <button
                    onClick={clearCurrentSlot}
                    className="whoops-btn whoops-btn-ghost px-3 py-1.5 text-xs text-[#6D1D3A] cursor-pointer"
                  >
                    Hapus Slot
                  </button>
                </div>
              )}
            </div>

            {!curPhoto ? (
              <div className="p-5 text-center text-xs text-[#61433B] bg-[#EFE2CE] rounded-xl">
                Slot #{selectedSlotIndex + 1} belum terisi foto. Pilih foto dari galeri di atas terlebih dahulu.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(FILTER_NAMES) as FilterType[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => updateCurrentSlot({ filter: key })}
                      className={`whoops-btn py-2 px-2.5 text-xs cursor-pointer whitespace-nowrap ${
                        curAssign.filter === key ? 'whoops-btn-primary' : 'whoops-btn-ghost'
                      }`}
                    >
                      {FILTER_NAMES[key]}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3.5">
                  <div className="bg-[#EFE2CE] border border-[#3A231E]/25 rounded-xl px-3.5 py-2.5">
                    <div className="flex justify-between text-xs font-display font-semibold mb-1 tabular-nums">
                      <span>Brightness</span>
                      <span>{curAssign.brightness}</span>
                    </div>
                    <input
                      type="range"
                      min={-40}
                      max={40}
                      step={2}
                      value={curAssign.brightness}
                      onChange={(e) =>
                        updateCurrentSlot({ brightness: Number(e.target.value) })
                      }
                      className="w-full accent-[#6D1D3A]"
                    />
                  </div>
                  <div className="bg-[#EFE2CE] border border-[#3A231E]/25 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-display font-semibold">Mirror Foto Ini</span>
                    <button
                      onClick={() =>
                        updateCurrentSlot({ mirrored: !curAssign.mirrored })
                      }
                      className={`whoops-btn px-3 py-1.5 text-xs cursor-pointer ${
                        curAssign.mirrored ? 'whoops-btn-primary' : 'whoops-btn-ghost'
                      }`}
                    >
                      {curAssign.mirrored ? 'Mirrored' : 'Normal'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleGoFinalPreview}
              disabled={filledCount < 6}
              className="whoops-btn whoops-btn-primary px-7 py-3.5 text-base cursor-pointer"
            >
              Lihat Final Preview ({filledCount}/6) →
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (step === 'preview') {
    return (
      <section className="max-w-lg mx-auto">
        <div className="whoops-card p-6 sm:p-8 text-center">
          <h2 className="font-display font-bold text-3xl text-[#3A231E]">Final Preview</h2>
          <p className="text-xs text-[#61433B] mt-1 mb-5">
            Hasil akhir 6-slot resolusi 300 DPI (4R) dengan frame pilihanmu.
          </p>

          <div className="w-[270px] aspect-[1205/1795] mx-auto border-2 border-[#3A231E] rounded-2xl overflow-hidden bg-white flex items-center justify-center">
            {isCompositing || !finalCompositePng ? (
              <div className="flex flex-col items-center gap-2 text-xs text-[#61433B]">
                <Loader2 className="w-6 h-6 animate-spin text-[#6D1D3A]" />
                <span>Merender 4R 300 DPI...</span>
              </div>
            ) : (
              <img
                src={finalCompositePng}
                alt="Final Preview 4R"
                className="w-full h-full object-contain"
              />
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <button
              onClick={() => setStep('editor')}
              className="whoops-btn whoops-btn-ghost px-5 py-2.5 text-sm cursor-pointer"
            >
              ← Edit Ulang
            </button>
            <button
              onClick={() => setStep('checkout')}
              disabled={!finalCompositePng || isCompositing}
              className="whoops-btn whoops-btn-primary px-6 py-2.5 text-sm inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              CONFIRM PHOTO
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ==================== CHECKOUT & ORDER STATUS ====================
  if (step === 'checkout' && selectedPkg) {
    if (!currentOrderId) {
      const printFee = wantsPrintOpt ? settings.printAddonPrice : 0;
      const total = selectedPkg.digitalPrice + printFee;

      return (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          <div className="whoops-card p-6 flex flex-col justify-between">
            <div>
              <h2 className="font-display font-bold text-2xl text-[#3A231E] mb-2">
                Rincian Paket & Pembayaran
              </h2>
              <div className="text-xs font-display font-bold text-[#6D1D3A] uppercase tracking-wide mb-2">
                {selectedPkg.name}
              </div>
              <p className="text-sm text-[#61433B] mb-4">{selectedPkg.description}</p>

              {selectedPkg.code === 'PHOTO_ONLY' && (
                <div className="grid grid-cols-2 gap-2.5 mb-4">
                  <button
                    onClick={() => setWantsPrintOpt(false)}
                    className={`whoops-btn py-2.5 text-xs cursor-pointer ${
                      !wantsPrintOpt ? 'whoops-btn-secondary' : 'whoops-btn-ghost'
                    }`}
                  >
                    Digital Only
                  </button>
                  <button
                    onClick={() => setWantsPrintOpt(true)}
                    className={`whoops-btn py-2.5 text-xs cursor-pointer tabular-nums ${
                      wantsPrintOpt ? 'whoops-btn-secondary' : 'whoops-btn-ghost'
                    }`}
                  >
                    + Cetak 4R (+{rupiah(settings.printAddonPrice)})
                  </button>
                </div>
              )}

              {selectedPkg.includesDoodle && (
                <div className="mb-4">
                  <label className="block text-xs font-display font-semibold mb-1.5">
                    Request Tema Doodle (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={doodleNotes}
                    onChange={(e) => setDoodleNotes(e.target.value)}
                    placeholder="Misal: tambah gambar bintang, pita pink, dan tanggal hari ini"
                    className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 bg-white text-sm"
                  />
                </div>
              )}
            </div>

            <div className="bg-[#EFE2CE] border-2 border-[#3A231E] rounded-2xl p-4 text-sm">
              <div className="flex justify-between mb-1.5">
                <span>
                  Layanan Digital {selectedPkg.includesDoodle ? '+ Custom Doodle' : ''}
                </span>
                <b className="tabular-nums">{rupiah(selectedPkg.digitalPrice)}</b>
              </div>
              <div className="flex justify-between mb-2">
                <span>Biaya Cetak 4R</span>
                <b className="tabular-nums">
                  {wantsPrintOpt ? rupiah(settings.printAddonPrice) : 'Rp 0 (Digital Only)'}
                </b>
              </div>
              <div className="border-t border-[#3A231E]/25 pt-2 flex justify-between font-display font-bold text-xl text-[#6D1D3A] tabular-nums">
                <span>Total Bayar</span>
                <span>{rupiah(total)}</span>
              </div>
            </div>
          </div>

          <div className="whoops-card p-6 text-center flex flex-col justify-between">
            <div>
              <h2 className="font-display font-bold text-2xl text-[#3A231E]">
                Scan QRIS Usaha
              </h2>
              <p className="text-xs text-[#61433B] mt-1 mb-4">
                Scan QRIS di bawah ini sesuai nominal, lalu tekan <b>SUDAH BAYAR</b>.
              </p>

              <div className="bg-white border-2 border-[#3A231E] rounded-2xl p-4 inline-block">
                <svg width="160" height="160" viewBox="0 0 100 100" className="mx-auto">
                  <rect width="100" height="100" fill="#fff" />
                  <rect x="6" y="6" width="26" height="26" fill="none" stroke="#3A231E" strokeWidth="5" />
                  <rect x="13" y="13" width="12" height="12" fill="#6D1D3A" />
                  <rect x="68" y="6" width="26" height="26" fill="none" stroke="#3A231E" strokeWidth="5" />
                  <rect x="75" y="13" width="12" height="12" fill="#6D1D3A" />
                  <rect x="6" y="68" width="26" height="26" fill="none" stroke="#3A231E" strokeWidth="5" />
                  <rect x="13" y="75" width="12" height="12" fill="#6D1D3A" />
                  <rect x="42" y="14" width="14" height="14" fill="#3A231E" />
                  <rect x="40" y="42" width="20" height="20" fill="#6D1D3A" />
                  <rect x="68" y="44" width="16" height="16" fill="#3A231E" />
                  <rect x="44" y="72" width="14" height="18" fill="#3A231E" />
                  <rect x="70" y="70" width="20" height="20" fill="#6D1D3A" />
                </svg>
                <div className="font-display font-bold text-sm text-[#6D1D3A] mt-2 tabular-nums">
                  {settings.qrisLabel} — {rupiah(total)}
                </div>
              </div>
            </div>

            <div className="mt-5">
              {orderError && (
                <div className="mb-3 p-3 rounded-xl bg-rose-100 border border-[#6D1D3A] text-xs text-[#6D1D3A] text-left">
                  {orderError}
                </div>
              )}
              {!catalogSynced ? (
                <button
                  onClick={onOpenAdmin}
                  className="whoops-btn whoops-btn-secondary w-full py-3.5 text-sm cursor-pointer"
                >
                  Login Admin Dashboard untuk Aktifkan Cloud Sync
                </button>
              ) : (
                <button
                  onClick={handleSubmitOrder}
                  disabled={isSubmittingOrder}
                  className="whoops-btn whoops-btn-primary w-full py-3.5 text-lg inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmittingOrder ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Mengirim Pesanan...
                    </>
                  ) : (
                    'SUDAH BAYAR'
                  )}
                </button>
              )}
            </div>
          </div>
        </section>
      );
    }

    // Live order tracking screen
    const downloadUrl = `${window.location.origin}/?download=${currentOrderId}`;

    return (
      <section className="max-w-xl mx-auto">
        <div className="whoops-card p-6 sm:p-8 text-center">
          {!liveOrder ? (
            <div className="py-10 flex flex-col items-center gap-2 text-sm text-[#61433B]">
              <Loader2 className="w-6 h-6 animate-spin text-[#6D1D3A]" />
              <span>Menghubungkan status pesanan...</span>
            </div>
          ) : (
            <>
              <div className="text-xs font-display font-semibold text-[#61433B]">
                Kode Pesanan: <b className="font-mono-tabular text-[#3A231E]">{liveOrder.orderCode}</b> · {liveOrder.packageName}
              </div>

              {liveOrder.paymentStatus === 'PENDING_VERIFICATION' && (
                <div className="mt-5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 border-2 border-[#3A231E] mx-auto flex items-center justify-center mb-3">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-700" />
                  </div>
                  <h2 className="font-display font-bold text-2xl sm:text-3xl text-[#3A231E]">
                    MENUNGGU VERIFIKASI
                  </h2>
                  <p className="text-sm text-[#61433B] mt-2 leading-relaxed">
                    Nominal <b className="tabular-nums">{rupiah(liveOrder.totalAmount)}</b> sedang menunggu konfirmasi kasir di Admin Dashboard. Layar ini akan diperbarui otomatis.
                  </p>
                </div>
              )}

              {liveOrder.paymentStatus === 'REJECTED' && (
                <div className="mt-5">
                  <h2 className="font-display font-bold text-2xl text-[#6D1D3A]">
                    Pembayaran Ditolak
                  </h2>
                  <p className="text-sm text-[#61433B] mt-2 mb-5">
                    Silakan hubungi kasir untuk konfirmasi mutasi QRIS atau coba ulangi pembayaran.
                  </p>
                  <button
                    onClick={() => setCurrentOrderId(null)}
                    className="whoops-btn whoops-btn-primary px-6 py-2.5 text-sm cursor-pointer"
                  >
                    Coba Bayar Ulang
                  </button>
                </div>
              )}

              {liveOrder.paymentStatus === 'VERIFIED' && (
                <div className="mt-4">
                  <h2 className="font-display font-bold text-2xl sm:text-3xl text-emerald-700">
                    Pembayaran Terverifikasi
                  </h2>
                  <p className="text-xs font-display font-semibold text-[#61433B] mt-1 mb-5">
                    Status Pengerjaan: <span className="text-[#3A231E]">{liveOrder.workflowStatus}</span>
                  </p>

                  {liveOrder.includesDoodle && !liveOrder.doodleDone ? (
                    <div className="bg-[#F3D2DB]/70 border-2 border-[#3A231E] rounded-2xl p-5 text-sm text-[#3A231E] mb-5">
                      <Sparkles className="w-6 h-6 text-[#6D1D3A] mx-auto mb-2" />
                      Pesanan kamu masuk ke <b>Antrean Doodle Artist</b>. Setelah doodle selesai digambar oleh Admin, foto & kode QR unduh akan muncul otomatis di sini.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center bg-[#EFE2CE]/70 border-2 border-[#3A231E] rounded-2xl p-4">
                        <div className="w-[180px] aspect-[1205/1795] mx-auto border-2 border-[#3A231E] rounded-xl overflow-hidden bg-white flex items-center justify-center">
                          {isLoadingMedia ? (
                            <Loader2 className="w-6 h-6 animate-spin text-[#6D1D3A]" />
                          ) : resolvedFinalUrl ? (
                            <img
                              src={resolvedFinalUrl}
                              alt={`Hasil ${liveOrder.orderCode}`}
                              className="w-full h-full object-contain"
                            />
                          ) : null}
                        </div>

                        <div className="flex flex-col items-center text-center">
                          <QrCodeBox
                            url={downloadUrl}
                            size={156}
                            caption="Scan QR dari HP untuk Unduh"
                          />
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(downloadUrl);
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 2000);
                            }}
                            className="mt-2.5 text-xs font-display font-semibold text-[#6D1D3A] inline-flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            {copiedLink ? 'Tautan Disalin!' : 'Salin Tautan Unduh'}
                          </button>
                        </div>
                      </div>

                      {resolvedFinalUrl && (
                        <a
                          href={resolvedFinalUrl}
                          download={`WHOOPS-${liveOrder.orderCode}-4R-300DPI.png`}
                          className="whoops-btn whoops-btn-secondary w-full py-3 text-sm inline-flex items-center justify-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Unduh Langsung 4R 300 DPI (PNG)
                        </a>
                      )}
                    </div>
                  )}

                  <div className="mt-5">
                    <button
                      onClick={startNewSession}
                      className="whoops-btn whoops-btn-primary px-6 py-2.5 text-sm cursor-pointer"
                    >
                      Mulai Sesi Baru
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    );
  }

  return null;
}
