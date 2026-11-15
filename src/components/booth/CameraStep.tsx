import { useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  FlipHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { CapturedPhoto } from '../../types';

export interface RetakeTarget {
  photoId: string;
  slotNumber?: number;
  returnToEditor?: boolean;
}

interface CameraStepProps {
  photos: CapturedPhoto[];
  mirrorPreview: boolean;
  setMirrorPreview: (updater: (v: boolean) => boolean) => void;
  saveMirrored: boolean;
  setSaveMirrored: (updater: (v: boolean) => boolean) => void;
  countdownVal: number | null;
  shutterFlash: boolean;
  camStatusMsg: string;
  cameraReady: boolean;
  cameraError: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  retakeTarget: RetakeTarget | null;
  lastCapturedId: string | null;
  onDismissReview: () => void;
  onRetryCamera: () => void;
  onCaptureWithCountdown: () => void;
  onCaptureDemoPose: () => void;
  onCaptureDemoSixAndProceed: () => void;
  onStartRetakePhoto: (photoId: string) => void;
  onCancelRetake: () => void;
  onDeletePhoto: (photoId: string) => void;
  onClearAllPhotos: () => void;
  onProceedToEditor: () => void;
}

export function CameraStep({
  photos,
  mirrorPreview,
  setMirrorPreview,
  saveMirrored,
  setSaveMirrored,
  countdownVal,
  shutterFlash,
  camStatusMsg,
  cameraReady,
  cameraError,
  videoRef,
  retakeTarget,
  lastCapturedId,
  onDismissReview,
  onRetryCamera,
  onCaptureWithCountdown,
  onCaptureDemoPose,
  onCaptureDemoSixAndProceed,
  onStartRetakePhoto,
  onCancelRetake,
  onDeletePhoto,
  onClearAllPhotos,
  onProceedToEditor,
}: CameraStepProps) {
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const reviewPhoto = lastCapturedId
    ? photos.find((p) => p.id === lastCapturedId) || null
    : null;

  const retakeIndex = retakeTarget
    ? photos.findIndex((p) => p.id === retakeTarget.photoId)
    : -1;

  return (
    <section className="grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-5 items-start">
      {/* Left: Camera Stage */}
      <motion.div
        animate={shutterFlash ? { scale: [1, 0.985, 1] } : { scale: 1 }}
        transition={{ duration: 0.22 }}
        className="md:col-span-7 whoops-card p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <h1 className="font-display font-bold text-lg sm:text-xl text-[#3A231E]">
              {retakeTarget ? 'Mode Retake Foto' : 'Ambil Foto Kamu'}
            </h1>
            {cameraReady && !reviewPhoto && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-100 border border-[#3A231E] text-[11px] font-display font-bold text-emerald-900">
                <span className="w-2 h-2 rounded-full bg-emerald-600" aria-hidden="true" />
                LIVE
              </span>
            )}
          </div>

          <span className="text-xs font-display font-semibold text-[#6D1D3A] tabular-nums">
            Tersimpan: {photos.length} foto
          </span>
        </div>

        {/* Active Retake Banner */}
        <AnimatePresence>
          {retakeTarget && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-3 px-3.5 py-2.5 rounded-xl bg-[#F3D2DB] border-2 border-[#3A231E] flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <div className="font-display font-semibold text-[#3A231E]">
                Sedang mengulang{' '}
                {retakeTarget.slotNumber
                  ? `foto di Slot #${retakeTarget.slotNumber}`
                  : `Foto #${retakeIndex + 1}`}
                . Tekan <b>RETAKE (3s)</b> untuk mengganti.
              </div>
              <button
                type="button"
                onClick={onCancelRetake}
                className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] cursor-pointer"
              >
                Batal Retake
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Viewfinder */}
        <div className="relative aspect-[4/3] bg-[#2a1713] border-2 border-[#3A231E] rounded-2xl overflow-hidden shadow-[3px_3px_0_#3A231E]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: mirrorPreview ? 'scaleX(-1)' : 'none' }}
          />

          {/* Retro Studio Viewfinder L-Brackets */}
          <div className="pointer-events-none absolute inset-3">
            <span className="absolute top-0 left-0 w-5 h-5 border-t-[3px] border-l-[3px] border-[#FDF7EE]/75 rounded-tl-md" />
            <span className="absolute top-0 right-0 w-5 h-5 border-t-[3px] border-r-[3px] border-[#FDF7EE]/75 rounded-tr-md" />
            <span className="absolute bottom-0 left-0 w-5 h-5 border-b-[3px] border-l-[3px] border-[#FDF7EE]/75 rounded-bl-md" />
            <span className="absolute bottom-0 right-0 w-5 h-5 border-b-[3px] border-r-[3px] border-[#FDF7EE]/75 rounded-br-md" />
          </div>

          {/* Camera Error / Unavailable State */}
          {!cameraReady && cameraError && !reviewPhoto && (
            <div className="absolute inset-0 bg-[#3A231E]/85 flex flex-col items-center justify-center p-5 text-center text-[#FDF7EE]">
              <AlertCircle className="w-9 h-9 text-[#E4A3B3] mb-2" aria-hidden="true" />
              <p className="font-display font-bold text-base">Kamera Tidak Aktif</p>
              <p className="text-xs text-[#EFE2CE] mt-1 max-w-sm leading-relaxed">
                {cameraError}
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={onRetryCamera}
                  className="whoops-btn whoops-btn-secondary whoops-btn-compact px-3.5 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  Muat Ulang Kamera
                </button>
                <button
                  type="button"
                  onClick={onCaptureDemoPose}
                  className="whoops-btn whoops-btn-primary whoops-btn-compact px-3.5 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  Ambil Pose Demo
                </button>
              </div>
            </div>
          )}

          {/* Last Capture Review Overlay with Direct Retake */}
          <AnimatePresence>
            {reviewPhoto && countdownVal === null && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 z-20 bg-[#2a1713] flex flex-col"
              >
                <img
                  src={reviewPhoto.dataUrl}
                  alt="Hasil jepretan terakhir"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 px-3 py-1 rounded-lg bg-[#FDF7EE] border-2 border-[#3A231E] text-xs font-display font-bold text-[#3A231E] shadow-[2px_2px_0_#3A231E]">
                  Review Pose #{photos.findIndex((p) => p.id === reviewPhoto.id) + 1}
                </div>

                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-[#3A231E]/95 via-[#3A231E]/75 to-transparent flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      onStartRetakePhoto(reviewPhoto.id);
                      onDismissReview();
                      onCaptureWithCountdown();
                    }}
                    className="whoops-btn whoops-btn-secondary px-4 py-2 text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" aria-hidden="true" />
                    Retake Foto Ini
                  </button>

                  {retakeTarget?.returnToEditor ? (
                    <button
                      type="button"
                      onClick={() => {
                        onDismissReview();
                        onProceedToEditor();
                      }}
                      className="whoops-btn whoops-btn-primary px-4 py-2 text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" aria-hidden="true" />
                      Pakai & Kembali ke Editor
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onDismissReview}
                      className="whoops-btn whoops-btn-primary px-4 py-2 text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" aria-hidden="true" />
                      Simpan & Lanjut Pose
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Animated 3-2-1 Countdown Ring */}
          <AnimatePresence mode="wait">
            {countdownVal !== null && (
              <motion.div
                key={countdownVal}
                initial={{ opacity: 0.4, scale: 0.65 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.25 }}
                transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#3A231E]/35 pointer-events-none"
              >
                <div className="relative w-32 h-32 sm:w-36 sm:h-36 flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle
                      cx="60"
                      cy="60"
                      r="52"
                      fill="rgba(58,35,30,0.55)"
                      stroke="#FDF7EE"
                      strokeWidth="4"
                      strokeOpacity="0.3"
                    />
                    <motion.circle
                      cx="60"
                      cy="60"
                      r="52"
                      fill="none"
                      stroke="#E4A3B3"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={326.7}
                      initial={{ strokeDashoffset: 0 }}
                      animate={{ strokeDashoffset: 326.7 }}
                      transition={{ duration: 0.88, ease: 'linear' }}
                    />
                  </svg>
                  <span className="font-display font-bold text-6xl sm:text-7xl text-[#FDF7EE] drop-shadow-[3px_3px_0_#6D1D3A] tabular-nums">
                    {countdownVal}
                  </span>
                </div>
                <span className="mt-2 px-3 py-1 rounded-lg bg-[#6D1D3A] text-[#FDF7EE] border border-[#3A231E] text-xs font-display font-bold">
                  {retakeTarget ? 'Siap Retake...' : 'Tahan Pose!'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Shutter Flash */}
          {shutterFlash && (
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="absolute inset-0 z-40 bg-white pointer-events-none"
            />
          )}
        </div>

        <p className="text-xs text-[#61433B] mt-2.5 mb-3">{camStatusMsg}</p>

        {/* Camera Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMirrorPreview((v) => !v)}
              className="whoops-btn whoops-btn-ghost px-3 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FlipHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              Mirror Layar: {mirrorPreview ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() => setSaveMirrored((v) => !v)}
              className="whoops-btn whoops-btn-ghost px-3 py-2 text-xs cursor-pointer whitespace-nowrap"
            >
              Simpan Mirrored: {saveMirrored ? 'YA' : 'TIDAK'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCaptureDemoPose}
              disabled={countdownVal !== null}
              className="whoops-btn whoops-btn-secondary px-3.5 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {retakeTarget ? 'Pose Demo (Retake)' : 'Ambil Pose Demo'}
            </button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                if (reviewPhoto) onDismissReview();
                onCaptureWithCountdown();
              }}
              disabled={countdownVal !== null}
              className="whoops-btn whoops-btn-primary px-5 py-2 text-sm inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              <span>{retakeTarget ? 'RETAKE (3s)' : 'CAPTURE (3s)'}</span>
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Right: Captured Gallery with Retake Actions */}
      <div className="md:col-span-5 whoops-card p-4 sm:p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-display font-bold text-lg text-[#3A231E] tabular-nums">
              Galeri Jepretan ({photos.length})
            </h2>
            {photos.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (!confirmClearAll) {
                    setConfirmClearAll(true);
                    window.setTimeout(() => setConfirmClearAll(false), 3200);
                  } else {
                    setConfirmClearAll(false);
                    onClearAllPhotos();
                  }
                }}
                className={`whoops-btn whoops-btn-compact px-2.5 py-1 text-[11px] inline-flex items-center gap-1 cursor-pointer ${
                  confirmClearAll ? 'whoops-btn-primary' : 'whoops-btn-ghost text-[#6D1D3A]'
                }`}
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                {confirmClearAll ? 'Yakin Ulang Semua?' : 'Retake Semua'}
              </button>
            )}
          </div>

          {photos.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#61433B] bg-[#EFE2CE] rounded-2xl border-2 border-dashed border-[#3A231E]/50">
              Tekan <b>CAPTURE (3s)</b> atau <b>Ambil Pose Demo</b> untuk mulai memotret. Kamu bebas mengambil lebih dari 6 foto lalu memilih pose terbaik!
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 max-h-[340px] md:max-h-[390px] overflow-y-auto whoops-scroll pr-1">
              {photos.map((p, idx) => {
                const isRetakingThis = retakeTarget?.photoId === p.id;
                return (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                    className={`rounded-xl overflow-hidden border-2 bg-[#EFE2CE] flex flex-col ${
                      isRetakingThis
                        ? 'border-[#6D1D3A] ring-2 ring-[#E4A3B3]'
                        : 'border-[#3A231E]'
                    }`}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <img
                        src={p.dataUrl}
                        alt={`Pose ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-1.5 left-1.5 bg-[#FDF7EE] border border-[#3A231E] text-[10px] px-1.5 py-0.5 rounded-md font-display font-bold">
                        #{idx + 1}
                      </span>
                    </div>

                    <div className="p-1.5 flex items-center gap-1.5 bg-[#FDF7EE] border-t border-[#3A231E]/25">
                      <button
                        type="button"
                        onClick={() => {
                          onDismissReview();
                          onStartRetakePhoto(p.id);
                        }}
                        className={`flex-1 py-1.5 px-2 rounded-lg border border-[#3A231E] text-[11px] font-display font-semibold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                          isRetakingThis
                            ? 'bg-[#6D1D3A] text-[#FDF7EE]'
                            : 'bg-[#F3D2DB] text-[#3A231E] hover:bg-[#E4A3B3]'
                        }`}
                      >
                        <RotateCcw className="w-3 h-3" aria-hidden="true" />
                        <span>{isRetakingThis ? 'Siap Retake' : 'Retake'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePhoto(p.id)}
                        aria-label={`Hapus foto ${idx + 1}`}
                        className="py-1.5 px-2 rounded-lg border border-[#3A231E] bg-[#EFE2CE] text-[#6D1D3A] hover:bg-rose-100 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2.5 pt-3 border-t-2 border-dashed border-[#3A231E]/20">
          {!retakeTarget?.returnToEditor && (
            <button
              type="button"
              onClick={onCaptureDemoSixAndProceed}
              className="whoops-btn whoops-btn-secondary w-full py-2.5 text-sm cursor-pointer"
            >
              Isi Cepat 6 Pose Demo & Lanjut
            </button>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={onProceedToEditor}
            disabled={photos.length === 0}
            className="whoops-btn whoops-btn-primary w-full py-3 text-sm sm:text-base inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            {retakeTarget?.returnToEditor ? (
              <>
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Kembali ke Editor 6 Slot</span>
              </>
            ) : (
              <span>Susun 6 Slot Foto</span>
            )}
          </motion.button>
        </div>
      </div>
    </section>
  );
}
