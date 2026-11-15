import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Sparkles } from 'lucide-react';
import type { PhotoFrame } from '../../types';
import { FramePreviewCanvas } from '../FramePreviewCanvas';

interface FrameStepProps {
  activeFrames: PhotoFrame[];
  selectedFrameId: string | null;
  onSelectFrame: (frame: PhotoFrame) => void;
}

export function FrameStep({
  activeFrames,
  selectedFrameId,
  onSelectFrame,
}: FrameStepProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');

  const categories = useMemo(() => {
    const unique = Array.from(new Set(activeFrames.map((f) => f.category).filter(Boolean)));
    return ['Semua', ...unique];
  }, [activeFrames]);

  const filteredFrames = useMemo(() => {
    if (selectedCategory === 'Semua') return activeFrames;
    return activeFrames.filter((f) => f.category === selectedCategory);
  }, [activeFrames, selectedCategory]);

  return (
    <section>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-xs font-display font-semibold text-[#6D1D3A] tracking-wide">
            Langkah 1 dari 5
          </p>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-[#3A231E] mt-0.5">
            Pilih Frame Favoritmu
          </h1>
          <p className="text-sm text-[#61433B] mt-0.5">
            Koleksi frame 6-slot yang siap dicetak pada kertas 4R.
          </p>
        </div>

        {categories.length > 2 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Kategori Frame">
            {categories.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(cat)}
                  className={`whoops-btn whoops-btn-compact px-3.5 py-1.5 text-xs cursor-pointer ${
                    active ? 'whoops-btn-primary' : 'whoops-btn-ghost'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {filteredFrames.length === 0 ? (
        <div className="whoops-card p-10 text-center">
          <Sparkles className="w-8 h-8 text-[#6D1D3A] mx-auto mb-2" aria-hidden="true" />
          <h2 className="font-display font-bold text-xl text-[#3A231E]">
            Belum Ada Frame Aktif
          </h2>
          <p className="text-sm text-[#61433B] mt-1">
            Silakan hubungi penjaga kasir untuk mengaktifkan pilihan frame booth.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredFrames.map((f, idx) => {
            const isSelected = selectedFrameId === f.id;
            return (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -4 }}
                className={`whoops-card p-4 sm:p-5 flex flex-col justify-between transition-colors ${
                  isSelected ? 'ring-4 ring-[#E4A3B3]' : ''
                }`}
              >
                <div>
                  <div className="relative bg-[#EFE2CE]/55 border border-[#3A231E]/20 rounded-2xl p-3">
                    <FramePreviewCanvas frame={f} maxWidthClass="max-w-[190px]" />
                    {isSelected && (
                      <span className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-[#6D1D3A] text-[#FDF7EE] border-2 border-[#3A231E] flex items-center justify-center">
                        <Check className="w-4 h-4" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-[#6D1D3A] font-display font-semibold">
                      {f.category}
                    </div>
                    <h2 className="font-display font-bold text-lg text-[#3A231E] mt-0.5">
                      {f.name}
                    </h2>
                  </div>
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onSelectFrame(f)}
                  className="whoops-btn whoops-btn-primary w-full mt-4 py-2.5 text-sm cursor-pointer"
                >
                  Pilih Frame Ini
                </motion.button>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}
