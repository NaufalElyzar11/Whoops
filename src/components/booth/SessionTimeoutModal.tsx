import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Clock, ArrowRight, RotateCcw, PlusCircle } from 'lucide-react';

interface SessionTimeoutModalProps {
  hasPhotos: boolean;
  canExtendOnce: boolean;
  onProceedToPreview: () => void;
  onExtendOneMinute: () => void;
  onResetToWelcome: () => void;
}

const IDLE_AUTO_RESET_SECONDS = 15;

export function SessionTimeoutModal({
  hasPhotos,
  canExtendOnce,
  onProceedToPreview,
  onExtendOneMinute,
  onResetToWelcome,
}: SessionTimeoutModalProps) {
  const [autoResetLeft, setAutoResetLeft] = useState(IDLE_AUTO_RESET_SECONDS);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAutoResetLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          onResetToWelcome();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [onResetToWelcome]);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#3A231E]/65 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        className="whoops-card max-w-md w-full p-6 sm:p-7 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-[#F3D2DB] border-2 border-[#3A231E] shadow-[3px_3px_0_#3A231E] mx-auto flex items-center justify-center mb-4">
          <Clock className="w-7 h-7 text-[#6D1D3A]" aria-hidden="true" />
        </div>

        <h2
          id="session-timeout-title"
          className="font-display font-bold text-2xl sm:text-3xl text-[#3A231E]"
        >
          Waktu Sesi 6 Menit Habis
        </h2>

        <p className="text-sm text-[#61433B] mt-2 leading-relaxed">
          {hasPhotos
            ? 'Jangan khawatir, foto yang sudah kamu ambil masih tersimpan. Lanjutkan langsung ke Final Preview atau tambah waktu sebentar.'
            : 'Belum ada foto yang diambil pada sesi ini. Booth akan kembali ke layar awal agar pelanggan berikutnya bisa masuk.'}
        </p>

        <div className="mt-4 bg-[#EFE2CE] border border-[#3A231E]/30 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-xs font-display font-semibold text-[#61433B] mb-1.5 tabular-nums">
            <span>Reset otomatis jika tidak ada aktivitas</span>
            <span className="font-mono-tabular text-[#6D1D3A]">{autoResetLeft}s</span>
          </div>
          <div className="h-2 rounded-full bg-[#FDF7EE] border border-[#3A231E]/30 overflow-hidden">
            <div
              className="h-full bg-[#6D1D3A] transition-all duration-1000 linear"
              style={{ width: `${(autoResetLeft / IDLE_AUTO_RESET_SECONDS) * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          {hasPhotos && (
            <button
              type="button"
              onClick={onProceedToPreview}
              className="whoops-btn whoops-btn-primary w-full py-3 text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut ke Final Preview & Kasir</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

          {canExtendOnce && (
            <button
              type="button"
              onClick={onExtendOneMinute}
              className="whoops-btn whoops-btn-secondary w-full py-2.5 text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" aria-hidden="true" />
              <span>Tambah Waktu +1 Menit (1x)</span>
            </button>
          )}

          <button
            type="button"
            onClick={onResetToWelcome}
            className="whoops-btn whoops-btn-ghost w-full py-2.5 text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Kembali ke Layar Awal</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
