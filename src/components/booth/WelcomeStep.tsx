import { useState } from 'react';
import { motion } from 'motion/react';
import { Camera, Clock, RefreshCw, Sparkles } from 'lucide-react';
import type { PhotoFrame } from '../../types';
import { getFrameSlotCount } from '../../utils/frameLayouts';
import { FramePreviewCanvas } from '../FramePreviewCanvas';
import { WhoopsLogo } from '../WhoopsLogo';

interface WelcomeStepProps {
  activeFrames: PhotoFrame[];
  onStartSession: () => void;
}

const STUDIO_STEPS = [
  { num: '01', title: 'Pilih Frame', desc: 'Tentukan layout & jumlah foto favoritmu.' },
  { num: '02', title: 'Pose & Retake', desc: 'Timer 3 detik, mirror & retake bebas.' },
  { num: '03', title: 'Edit & Filter', desc: 'Pilih foto, filter retro & atur brightness.' },
  { num: '04', title: 'Bayar di Kasir', desc: 'Pilih paket lalu langsung ke meja kasir.' },
];

export function WelcomeStep({ activeFrames, onStartSession }: WelcomeStepProps) {
  const [showcaseIdx, setShowcaseIdx] = useState(0);
  const currentFrame = activeFrames.length > 0 ? activeFrames[showcaseIdx % activeFrames.length] : null;

  return (
    <section className="max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0.92, y: 8, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="whoops-card px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-9 bg-gradient-to-br from-[#FDF7EE] via-[#FDF7EE] to-[#F6EBDB]"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 items-center">
          {/* Left: Brand Story & Primary Action */}
          <div className="md:col-span-7 text-center md:text-left">
            <motion.div
              initial={{ opacity: 0.9, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.16 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#EFE2CE] border-2 border-[#3A231E] shadow-[2px_2px_0_#3A231E] text-xs font-display font-bold text-[#6D1D3A] tracking-wide mb-4"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>@artisticwaves.ra</span>
            </motion.div>

            <div className="flex justify-center md:justify-start">
              <WhoopsLogo size="lg" animated />
            </div>

            <motion.p
              initial={{ opacity: 0.9 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.16 }}
              className="font-hand text-[28px] sm:text-[32px] text-[#61433B] mt-2 mb-5 leading-tight"
            >
              "oops, we made a memory."
            </motion.p>

            <div className="flex flex-col lg:flex-row lg:items-stretch gap-3 mb-6">
              <motion.button
                type="button"
                onClick={onStartSession}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
                className="whoops-btn whoops-btn-primary text-base sm:text-lg px-6 py-4 inline-flex items-center justify-center gap-2.5 cursor-pointer w-full lg:w-auto whitespace-nowrap shrink-0"
              >
                <Camera className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>START PHOTO SESSION</span>
              </motion.button>
              <div className="flex-1 flex items-center justify-center lg:justify-start gap-2.5 text-xs text-[#61433B] bg-[#EFE2CE]/80 border-2 border-[#3A231E]/35 rounded-2xl px-4 py-3 text-center lg:text-left leading-snug">
                <Clock className="w-4 h-4 text-[#6D1D3A] shrink-0 hidden sm:block" aria-hidden="true" />
                <span>
                  Durasi sesi booth <b className="font-mono-tabular text-[#3A231E]">06:00</b> menit.
                  <br />
                  Pembayaran dilakukan di meja kasir setelah selesai foto.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-left">
              {STUDIO_STEPS.map((item, idx) => (
                <motion.div
                  key={item.num}
                  initial={{ opacity: 0.92, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03, duration: 0.16 }}
                  className="whoops-card-sm p-3 bg-[#FDF7EE]"
                >
                  <span className="font-mono-tabular text-[11px] font-bold text-[#6D1D3A]">
                    {item.num}
                  </span>
                  <div className="font-display font-bold text-xs sm:text-sm text-[#3A231E] mt-0.5">
                    {item.title}
                  </div>
                  <p className="text-[11px] text-[#61433B] mt-0.5 leading-snug">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Right: Interactive Live Frame Preview Showcase */}
          <div className="md:col-span-5 flex flex-col items-center justify-center">
            {currentFrame ? (
              <motion.div
                key={currentFrame.id}
                initial={{ opacity: 0, rotate: -4, scale: 0.95 }}
                animate={{ opacity: 1, rotate: -2, scale: 1 }}
                whileHover={{ rotate: 0, scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                className="w-full max-w-[235px] sm:max-w-[250px] bg-[#EFE2CE] border-2 border-[#3A231E] rounded-3xl p-3.5 shadow-[5px_5px_0_#3A231E]"
              >
                <FramePreviewCanvas frame={currentFrame} maxWidthClass="max-w-[210px]" />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-left min-w-0">
                    <div className="text-[10px] font-display font-semibold text-[#6D1D3A] uppercase">
                      {currentFrame.category} · {getFrameSlotCount(currentFrame)} Foto
                    </div>
                    <div className="font-display font-bold text-xs text-[#3A231E] truncate">
                      {currentFrame.name}
                    </div>
                  </div>
                  {activeFrames.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setShowcaseIdx((prev) => (prev + 1) % activeFrames.length)}
                      className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      aria-label="Lihat contoh frame lainnya"
                    >
                      <RefreshCw className="w-3 h-3" aria-hidden="true" />
                      Ganti
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="whoops-card-sm p-6 text-center text-xs text-[#61433B]">
                Belum ada frame aktif saat ini. Hubungi penjaga booth untuk bantuan.
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
