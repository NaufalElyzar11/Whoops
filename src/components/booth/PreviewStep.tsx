import { motion } from 'motion/react';
import { ArrowLeft, Check, Loader2, Sparkles } from 'lucide-react';
import type { PhotoFrame } from '../../types';
import { getFrameSlotCount } from '../../utils/frameLayouts';

interface PreviewStepProps {
  selectedFrame: PhotoFrame;
  finalCompositePng: string | null;
  isCompositing: boolean;
  onEditAgain: () => void;
  onConfirmPhoto: () => void;
}

export function PreviewStep({
  selectedFrame,
  finalCompositePng,
  isCompositing,
  onEditAgain,
  onConfirmPhoto,
}: PreviewStepProps) {
  const slotCount = getFrameSlotCount(selectedFrame);

  return (
    <section className="max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="whoops-card p-5 sm:p-7"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Left: Crisp 4R Developed Photo Preview */}
          <div className="md:col-span-6 flex justify-center">
            <div className="w-[240px] sm:w-[270px] aspect-[1205/1795] border-2 border-[#3A231E] rounded-2xl overflow-hidden bg-white shadow-[5px_5px_0_#3A231E] flex items-center justify-center relative">
              {isCompositing || !finalCompositePng ? (
                <div className="flex flex-col items-center gap-2.5 text-xs text-[#61433B] p-4 text-center">
                  <Loader2 className="w-7 h-7 animate-spin text-[#6D1D3A]" aria-hidden="true" />
                  <span className="font-display font-semibold text-sm text-[#3A231E]">
                    Merender 4R 300 DPI...
                  </span>
                  <span>Menyatukan {slotCount} foto &amp; filter pilihanmu</span>
                </div>
              ) : (
                <motion.img
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                  src={finalCompositePng}
                  alt="Final Preview 4R"
                  className="w-full h-full object-contain"
                />
              )}
            </div>
          </div>

          {/* Right: Summary & Confirmation */}
          <div className="md:col-span-6 flex flex-col justify-center text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 self-center md:self-start px-3 py-1 rounded-lg bg-[#EFE2CE] border border-[#3A231E] text-xs font-display font-bold text-[#6D1D3A] mb-3">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Langkah 4 dari 5</span>
            </div>

            <h1 className="font-display font-bold text-3xl text-[#3A231E]">
              Final Preview
            </h1>
            <p className="text-sm text-[#61433B] mt-1.5 leading-relaxed">
              Periksa kembali posisi {slotCount} foto, filter, dan frame pilihanmu sebelum lanjut memilih paket dan menuju meja kasir.
            </p>

            <div className="mt-5 bg-[#EFE2CE]/70 border-2 border-[#3A231E] rounded-2xl p-4 text-left space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-[#61433B]">Frame Pilihan</span>
                <b className="font-display text-[#3A231E] text-right">
                  {selectedFrame.name} ({slotCount} Foto)
                </b>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[#61433B]">Ukuran & Resolusi</span>
                <b className="font-mono-tabular text-[#3A231E]">4R (1205x1795 px, 300 DPI)</b>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[#61433B]">Studio</span>
                <b className="font-display text-[#6D1D3A]">@artisticwaves.ra</b>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button
                type="button"
                onClick={onEditAgain}
                className="whoops-btn whoops-btn-ghost px-5 py-3 text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Edit Ulang</span>
              </button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={onConfirmPhoto}
                disabled={!finalCompositePng || isCompositing}
                className="whoops-btn whoops-btn-primary flex-1 px-6 py-3 text-sm sm:text-base inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-5 h-5" aria-hidden="true" />
                <span>CONFIRM PHOTO</span>
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
