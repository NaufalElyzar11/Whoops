import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Camera,
  Check,
  FlipHorizontal,
  Layers,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  FILTER_NAMES,
  type CapturedPhoto,
  type FilterType,
  type PhotoFrame,
  type SlotAssignment,
} from '../../types';
import { getCssFilter, SLOT_ASPECT_RATIO } from '../../utils/canvasEngine';
import { FramePreviewCanvas } from '../FramePreviewCanvas';

interface EditorStepProps {
  selectedFrame: PhotoFrame;
  photos: CapturedPhoto[];
  assignments: SlotAssignment[];
  selectedTrayPhotoId: string | null;
  setSelectedTrayPhotoId: (updater: (prev: string | null) => string | null) => void;
  selectedSlotIndex: number;
  setSelectedSlotIndex: (idx: number) => void;
  onClickSlot: (slotIndex: number) => void;
  onDropSlot: (slotIndex: number, e: React.DragEvent<HTMLDivElement>) => void;
  onPlaceTrayPhotoInSlot: (photoId: string, targetSlot: number) => void;
  onSwapSlots: (fromSlot: number, toSlot: number) => void;
  onUpdateSlot: (patch: Partial<SlotAssignment>) => void;
  onApplyStyleToAllSlots: () => void;
  onResetCurrentSlot: () => void;
  onClearCurrentSlot: () => void;
  onAddMorePhotos: () => void;
  onRetakeSlotPhoto: (photoId: string, slotIndex: number) => void;
  onGoFinalPreview: () => void;
}

type DragState =
  | { kind: 'tray'; photoId: string; previewUrl: string; x: number; y: number }
  | { kind: 'slot'; fromSlot: number; previewUrl: string; x: number; y: number };

export function EditorStep({
  selectedFrame,
  photos,
  assignments,
  selectedTrayPhotoId,
  setSelectedTrayPhotoId,
  selectedSlotIndex,
  setSelectedSlotIndex,
  onClickSlot,
  onDropSlot,
  onPlaceTrayPhotoInSlot,
  onSwapSlots,
  onUpdateSlot,
  onApplyStyleToAllSlots,
  onResetCurrentSlot,
  onClearCurrentSlot,
  onAddMorePhotos,
  onRetakeSlotPhoto,
  onGoFinalPreview,
}: EditorStepProps) {
  const filledCount = assignments.filter((a) => a.photoId !== null).length;
  const curAssign = assignments[selectedSlotIndex];
  const curPhoto = curAssign.photoId
    ? photos.find((p) => p.id === curAssign.photoId) || null
    : null;

  const [pointerDrag, setPointerDrag] = useState<DragState | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [appliedAllNotice, setAppliedAllNotice] = useState(false);

  const pendingPressRef = useRef<{
    kind: 'tray' | 'slot';
    photoId?: string;
    fromSlot?: number;
    previewUrl: string;
    startX: number;
    startY: number;
    pointerType: string;
    readyForTouchDrag: boolean;
    timerId: number | null;
  } | null>(null);

  const suppressClickRef = useRef(false);

  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
      const pending = pendingPressRef.current;
      if (pending && !pointerDrag) {
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        const dist = Math.hypot(dx, dy);

        // On touch devices, avoid hijacking vertical panel scrolling unless user paused briefly to drag.
        if (pending.pointerType === 'touch' && !pending.readyForTouchDrag) {
          if (dist > 10) {
            if (pending.timerId) window.clearTimeout(pending.timerId);
            pendingPressRef.current = null;
          }
          return;
        }

        if (dist > 8 || (pending.pointerType === 'touch' && pending.readyForTouchDrag)) {
          if (pending.timerId) window.clearTimeout(pending.timerId);
          suppressClickRef.current = true;
          setPointerDrag(
            pending.kind === 'tray'
              ? {
                  kind: 'tray',
                  photoId: pending.photoId!,
                  previewUrl: pending.previewUrl,
                  x: e.clientX,
                  y: e.clientY,
                }
              : {
                  kind: 'slot',
                  fromSlot: pending.fromSlot!,
                  previewUrl: pending.previewUrl,
                  x: e.clientX,
                  y: e.clientY,
                }
          );
          pendingPressRef.current = null;
        }
      }

      if (pointerDrag) {
        setPointerDrag((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const slotEl = el?.closest('[data-slot-index]') as HTMLElement | null;
        if (slotEl) {
          const idx = Number(slotEl.dataset.slotIndex);
          setDragOverSlot(Number.isFinite(idx) ? idx : null);
        } else {
          setDragOverSlot(null);
        }
      }
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      if (pendingPressRef.current) {
        if (pendingPressRef.current.timerId) {
          window.clearTimeout(pendingPressRef.current.timerId);
        }
        pendingPressRef.current = null;
      }

      if (pointerDrag) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const slotEl = el?.closest('[data-slot-index]') as HTMLElement | null;
        if (slotEl) {
          const targetSlot = Number(slotEl.dataset.slotIndex);
          if (Number.isFinite(targetSlot)) {
            if (pointerDrag.kind === 'tray') {
              onPlaceTrayPhotoInSlot(pointerDrag.photoId, targetSlot);
            } else if (pointerDrag.fromSlot !== targetSlot) {
              onSwapSlots(pointerDrag.fromSlot, targetSlot);
            }
          }
        }
        setPointerDrag(null);
        setDragOverSlot(null);
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 60);
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [pointerDrag, onPlaceTrayPhotoInSlot, onSwapSlots]);

  const startTouchOrMousePress = (
    e: React.PointerEvent,
    info: { kind: 'tray'; photoId: string; previewUrl: string } | { kind: 'slot'; fromSlot: number; previewUrl: string }
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const isTouch = e.pointerType === 'touch';
    const timerId = isTouch
      ? window.setTimeout(() => {
          if (pendingPressRef.current) {
            pendingPressRef.current.readyForTouchDrag = true;
            setPointerDrag(
              info.kind === 'tray'
                ? { kind: 'tray', photoId: info.photoId, previewUrl: info.previewUrl, x: e.clientX, y: e.clientY }
                : { kind: 'slot', fromSlot: info.fromSlot, previewUrl: info.previewUrl, x: e.clientX, y: e.clientY }
            );
            suppressClickRef.current = true;
            pendingPressRef.current = null;
          }
        }, 190)
      : null;

    pendingPressRef.current = {
      ...info,
      startX: e.clientX,
      startY: e.clientY,
      pointerType: e.pointerType,
      readyForTouchDrag: !isTouch,
      timerId,
    };
  };

  return (
    <section className="h-auto md:h-full grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-5 md:overflow-hidden">
      {/* LEFT PANE: Static 6-Slot Frame Preview (NEVER scrolls in iPad landscape) */}
      <div className="md:col-span-5 lg:col-span-4 md:h-full overflow-hidden">
        <div className="whoops-card p-3.5 sm:p-4 h-full flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between gap-2 shrink-0 pb-2">
            <span className="font-display font-bold text-sm sm:text-base text-[#3A231E] tabular-nums">
              Kanvas 6 Slot ({filledCount}/6)
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-[#F3D2DB] border border-[#3A231E] text-xs font-display font-bold text-[#6D1D3A]">
              Slot #{selectedSlotIndex + 1}
            </span>
          </div>

          <div className="flex-1 min-h-0 w-full flex items-center justify-center py-1 overflow-hidden min-h-[340px] md:min-h-0">
            <FramePreviewCanvas
              frame={selectedFrame}
              fitContainer
              selectedSlotIndex={selectedSlotIndex}
              dragOverSlotIndex={dragOverSlot}
              onSlotClick={(idx) => {
                if (suppressClickRef.current) return;
                onClickSlot(idx);
              }}
              onSlotDrop={onDropSlot}
              renderSlotContent={(slotIdx) => {
                const a = assignments[slotIdx];
                const ph = a.photoId ? photos.find((p) => p.id === a.photoId) : null;
                if (!ph) {
                  return (
                    <span className="px-1 leading-tight">
                      <span className="font-bold">#{slotIdx + 1}</span>
                      <br />
                      <small className="text-[10px] font-medium">
                        {selectedTrayPhotoId ? 'Ketuk isi' : 'Kosong'}
                      </small>
                    </span>
                  );
                }
                return (
                  <div
                    draggable
                    onDragStart={(e) => {
                      pendingPressRef.current = null;
                      setPointerDrag(null);
                      e.dataTransfer.setData(
                        'text/plain',
                        JSON.stringify({ type: 'slot', fromSlot: slotIdx })
                      );
                    }}
                    onPointerDown={(e) =>
                      startTouchOrMousePress(e, {
                        kind: 'slot',
                        fromSlot: slotIdx,
                        previewUrl: ph.dataUrl,
                      })
                    }
                    className="w-full h-full"
                  >
                    <motion.img
                      key={`${ph.id}-${slotIdx}`}
                      initial={{ scale: 0.9, opacity: 0.7 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                      src={ph.dataUrl}
                      alt={`Slot ${slotIdx + 1}`}
                      className="w-full h-full object-cover select-none pointer-events-none"
                      style={{
                        filter: getCssFilter(a.filter, a.brightness),
                        transform: a.mirrored ? 'scaleX(-1)' : 'none',
                      }}
                    />
                  </div>
                );
              }}
            />
          </div>

          <p className="shrink-0 text-[11px] text-[#61433B] pt-2 text-center leading-snug">
            Ketuk foto di kanan lalu ketuk slot, atau <b>tahan &amp; seret</b> ke slot untuk isi/tukar.
          </p>
        </div>
      </div>

      {/* RIGHT PANE: Scrollable Photo Tray + Filters + Pinned Bottom CTA */}
      <div className="md:col-span-7 lg:col-span-8 md:h-full flex flex-col md:overflow-hidden">
        <div className="flex-1 min-h-0 md:overflow-y-auto whoops-scroll md:pr-1.5 space-y-4 pb-3">
          {/* Photo Tray */}
          <div className="whoops-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-[#3A231E]">
                  1. Galeri Foto ({photos.length})
                </h2>
                <p className="text-xs text-[#61433B]">
                  {selectedTrayPhotoId
                    ? 'Foto dipilih! Sekarang ketuk salah satu slot di preview kiri.'
                    : 'Pilih foto lalu ketuk slot di kiri, atau tahan & seret langsung ke slot.'}
                </p>
              </div>
              <button
                type="button"
                onClick={onAddMorePhotos}
                className="whoops-btn whoops-btn-ghost whoops-btn-compact px-3 py-1.5 text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tambah / Retake Foto</span>
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {photos.map((p, idx) => {
                const isSelected = selectedTrayPhotoId === p.id;
                const usedCount = assignments.filter((a) => a.photoId === p.id).length;
                return (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={(e) => {
                      pendingPressRef.current = null;
                      setPointerDrag(null);
                      e.dataTransfer.setData(
                        'text/plain',
                        JSON.stringify({ type: 'tray', photoId: p.id })
                      );
                    }}
                  >
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onPointerDown={(e) =>
                        startTouchOrMousePress(e, {
                          kind: 'tray',
                          photoId: p.id,
                          previewUrl: p.dataUrl,
                        })
                      }
                      onClick={() => {
                        if (suppressClickRef.current) return;
                        setSelectedTrayPhotoId((prev) => (prev === p.id ? null : p.id));
                      }}
                      style={{ aspectRatio: String(SLOT_ASPECT_RATIO) }}
                      className={`relative w-full rounded-xl overflow-hidden border-2 cursor-pointer bg-[#EFE2CE] text-left transition-all ${
                        isSelected
                          ? 'border-[#6D1D3A] ring-3 ring-[#E4A3B3] -translate-y-0.5'
                          : 'border-[#3A231E] hover:-translate-y-0.5'
                      }`}
                    >
                      <img
                        src={p.dataUrl}
                        alt={`Foto ${idx + 1}`}
                        className="w-full h-full object-cover pointer-events-none"
                      />
                      <span className="absolute top-1 left-1 bg-[#FDF7EE] border border-[#3A231E] rounded px-1.5 py-0.5 text-[10px] font-display font-bold">
                        #{idx + 1}
                      </span>
                      {usedCount > 0 && (
                        <span className="absolute bottom-1 right-1 bg-[#6D1D3A] text-[#FDF7EE] rounded px-1.5 py-0.5 text-[10px] font-display font-semibold">
                          {usedCount}x
                        </span>
                      )}
                    </motion.button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Slot Filter & Adjustments */}
          <div className="whoops-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-[#3A231E]">
                  2. Edit Filter Slot #{selectedSlotIndex + 1}
                </h2>
                <p className="text-xs text-[#61433B]">
                  Filter hanya diterapkan ke hasil akhir, foto asli tetap aman.
                </p>
              </div>

              {curPhoto && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onRetakeSlotPhoto(curPhoto.id, selectedSlotIndex)}
                    className="whoops-btn whoops-btn-secondary whoops-btn-compact px-2.5 py-1.5 text-xs inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Retake Foto Ini</span>
                  </button>
                  <button
                    type="button"
                    onClick={onResetCurrentSlot}
                    className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1.5 text-xs inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Reset</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClearCurrentSlot}
                    className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1.5 text-xs text-[#6D1D3A] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Kosongkan</span>
                  </button>
                </div>
              )}
            </div>

            {!curPhoto ? (
              <div className="p-6 text-center text-xs text-[#61433B] bg-[#EFE2CE] rounded-xl border border-dashed border-[#3A231E]/50">
                Slot #{selectedSlotIndex + 1} masih kosong. Pilih foto dari Galeri Foto di atas lalu ketuk slot di preview kiri.
              </div>
            ) : (
              <>
                {/* 8 Visual Filter Cards with Live Thumbnail Preview */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(Object.keys(FILTER_NAMES) as FilterType[]).map((key) => {
                    const isActiveFilter = curAssign.filter === key;
                    return (
                      <motion.button
                        key={key}
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() => onUpdateSlot({ filter: key })}
                        className={`rounded-xl border-2 p-1.5 text-left cursor-pointer transition-all ${
                          isActiveFilter
                            ? 'bg-[#6D1D3A] text-[#FDF7EE] border-[#3A231E] shadow-[2px_2px_0_#3A231E]'
                            : 'bg-[#FDF7EE] text-[#3A231E] border-[#3A231E]/80 hover:bg-[#EFE2CE]'
                        }`}
                      >
                        <div
                          style={{ aspectRatio: String(SLOT_ASPECT_RATIO) }}
                          className="relative rounded-lg overflow-hidden border border-[#3A231E]/40 bg-[#EFE2CE] mb-1.5"
                        >
                          <img
                            src={curPhoto.dataUrl}
                            alt={FILTER_NAMES[key]}
                            className="w-full h-full object-cover"
                            style={{
                              filter: getCssFilter(key, curAssign.brightness),
                              transform: curAssign.mirrored ? 'scaleX(-1)' : 'none',
                            }}
                          />
                          {isActiveFilter && (
                            <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#FDF7EE] text-[#6D1D3A] border border-[#3A231E] flex items-center justify-center">
                              <Check className="w-3 h-3" aria-hidden="true" />
                            </span>
                          )}
                        </div>
                        <div className="font-display font-semibold text-xs text-center truncate px-1">
                          {FILTER_NAMES[key]}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Brightness + Mirror + Apply to All */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3.5">
                  <div className="bg-[#EFE2CE] border-2 border-[#3A231E]/40 rounded-xl px-3.5 py-2.5">
                    <div className="flex justify-between text-xs font-display font-semibold mb-1.5 tabular-nums">
                      <label htmlFor="slot-brightness-range">Brightness</label>
                      <span>{curAssign.brightness > 0 ? `+${curAssign.brightness}` : curAssign.brightness}</span>
                    </div>
                    <input
                      id="slot-brightness-range"
                      type="range"
                      min={-40}
                      max={40}
                      step={2}
                      value={curAssign.brightness}
                      onChange={(e) =>
                        onUpdateSlot({ brightness: Number(e.target.value) })
                      }
                      className="w-full accent-[#6D1D3A] h-6 cursor-pointer"
                    />
                  </div>

                  <div className="bg-[#EFE2CE] border-2 border-[#3A231E]/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-display font-semibold">Mirror Foto Ini</span>
                    <button
                      type="button"
                      onClick={() => onUpdateSlot({ mirrored: !curAssign.mirrored })}
                      className={`whoops-btn whoops-btn-compact px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer ${
                        curAssign.mirrored ? 'whoops-btn-primary' : 'whoops-btn-ghost'
                      }`}
                    >
                      <FlipHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{curAssign.mirrored ? 'Mirrored' : 'Normal'}</span>
                    </button>
                  </div>
                </div>

                {filledCount > 1 && (
                  <div className="mt-3 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        onApplyStyleToAllSlots();
                        setAppliedAllNotice(true);
                        window.setTimeout(() => setAppliedAllNotice(false), 1800);
                      }}
                      className="whoops-btn whoops-btn-ghost whoops-btn-compact px-3 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {appliedAllNotice
                          ? 'Filter Diterapkan ke Semua Slot!'
                          : 'Samakan Filter Ini ke Semua Slot'}
                      </span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Pinned Bottom Action Bar inside Right Column */}
        <div className="shrink-0 pt-3 border-t-2 border-[#3A231E]/15 flex flex-wrap items-center justify-between gap-3 bg-[#FDF7EE]">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1" aria-hidden="true">
              {assignments.map((a) => (
                <span
                  key={a.slotIndex}
                  className={`w-2.5 h-2.5 rounded-full border border-[#3A231E] transition-colors ${
                    a.photoId ? 'bg-[#6D1D3A]' : 'bg-[#EFE2CE]'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs font-display font-semibold text-[#61433B] tabular-nums">
              {filledCount < 6
                ? `Isi ${6 - filledCount} slot lagi untuk lanjut`
                : 'Semua 6 slot siap!'}
            </span>
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={onGoFinalPreview}
            disabled={filledCount < 6}
            className="whoops-btn whoops-btn-primary px-6 py-3 text-sm sm:text-base cursor-pointer ml-auto"
          >
            Lihat Final Preview ({filledCount}/6)
          </motion.button>
        </div>
      </div>

      {/* Floating Touch/Pointer Drag Ghost */}
      {pointerDrag && (
        <div
          className="fixed pointer-events-none z-50 w-24 rounded-xl overflow-hidden border-2 border-[#6D1D3A] shadow-[4px_4px_0_#3A231E] -translate-x-1/2 -translate-y-1/2 rotate-3 opacity-95"
          style={{ left: pointerDrag.x, top: pointerDrag.y, aspectRatio: String(SLOT_ASPECT_RATIO) }}
        >
          <img src={pointerDrag.previewUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}
    </section>
  );
}
