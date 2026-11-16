import { useEffect, useRef, useState } from 'react';
import {
  AlignCenterHorizontal,
  CheckCircle2,
  CopyCheck,
  Download,
  Eye,
  EyeOff,
  HelpCircle,
  Layers,
  Loader2,
  Minus,
  Palette,
  Pipette,
  Plus,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import type { FrameLayerOrder, FrameLayoutId, PhotoFrame, SlotRect } from '../../types';
import {
  generateCanvaTemplateGuidePng,
  inspectCanvaSourceForSlots,
  processCanvaFrameSource,
  readFileAsDataUrl,
  rgbToHex,
  type CanvaCutoutMode,
  type CanvaFitMode,
  type CanvaProcessResult,
} from '../../utils/canvaFrameImporter';
import { CANVAS_4R_HEIGHT, CANVAS_4R_WIDTH, loadImage } from '../../utils/canvasEngine';
import {
  cloneSlots,
  FRAME_LAYOUT_PRESETS,
  getDefaultLayoutForCount,
  getPresetsForSlotCount,
  normalizeSlots,
  SUPPORTED_SLOT_COUNTS,
} from '../../utils/frameLayouts';
import { InteractiveSlotCanvas } from './InteractiveSlotCanvas';

interface CanvaFramePanelProps {
  framesCount: number;
  savingId: string | null;
  onSaveFrame: (frame: PhotoFrame) => Promise<void>;
  onToast: (msg: string) => void;
}

const QUICK_CATEGORIES = ['Canva Custom', 'Retro Classic', 'Cute Pastel', 'Event / Wedding'];

function LayoutMiniThumbnail({ slots, active }: { slots: SlotRect[]; active: boolean }) {
  return (
    <svg
      viewBox="0 0 40 60"
      className="w-7 h-10 shrink-0 rounded-[4px] border border-[#3A231E]/50 bg-[#FDF7EE]"
      aria-hidden="true"
    >
      {slots.map((s) => (
        <rect
          key={s.slotIndex}
          x={s.x * 40}
          y={s.y * 60}
          width={Math.max(2, s.width * 40)}
          height={Math.max(2, s.height * 60)}
          rx="1.5"
          fill={active ? '#FDF7EE' : '#F3D2DB'}
          stroke={active ? '#6D1D3A' : '#3A231E'}
          strokeWidth="1.2"
        />
      ))}
    </svg>
  );
}

export function CanvaFramePanel({
  framesCount,
  savingId,
  onSaveFrame,
  onToast,
}: CanvaFramePanelProps) {
  const [builderMode, setBuilderMode] = useState<'image' | 'vector'>('image');

  // Metadata
  const [frameName, setFrameName] = useState('');
  const [frameCategory, setFrameCategory] = useState('Canva Custom');

  // Slot layout & interactive editor state
  const [layoutId, setLayoutId] = useState<FrameLayoutId>('6-grid');
  const [customSlots, setCustomSlots] = useState<SlotRect[]>(() =>
    cloneSlots(FRAME_LAYOUT_PRESETS['6-grid'].slots)
  );
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number>(0);
  const [commitTick, setCommitTick] = useState<number>(0);
  const [showSamplePhotos, setShowSamplePhotos] = useState<boolean>(true);
  const [showNumericControls, setShowNumericControls] = useState<boolean>(false);

  // Vector fields
  const [vectorBg, setVectorBg] = useState('#6D1D3A');
  const [vectorTrim, setVectorTrim] = useState('#FDF7EE');
  const [vectorLabelColor, setVectorLabelColor] = useState('#FDF7EE');

  // Canva importer fields
  const [rawSourceUrl, setRawSourceUrl] = useState<string>('');
  const [sourceFilename, setSourceFilename] = useState<string>('');
  const [layerOrder, setLayerOrder] = useState<FrameLayerOrder>('frame-on-top');
  const [cutoutMode, setCutoutMode] = useState<CanvaCutoutMode>('auto_cut_slots');
  const [fitMode, setFitMode] = useState<CanvaFitMode>('fill');
  const [chromaHex, setChromaHex] = useState<string>('#FFFFFF');
  const [chromaTolerance, setChromaTolerance] = useState<number>(38);
  const [chromaOnlyNearSlots, setChromaOnlyNearSlots] = useState<boolean>(true);
  const [eyedropperActive, setEyedropperActive] = useState<boolean>(false);
  const [showAdvancedFit, setShowAdvancedFit] = useState<boolean>(false);
  const [showCanvaGuide, setShowCanvaGuide] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);

  const [processed, setProcessed] = useState<CanvaProcessResult | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processError, setProcessError] = useState<string | null>(null);

  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const customSlotsRef = useRef<SlotRect[]>(customSlots);
  customSlotsRef.current = customSlots;

  // Re-run transparent cutout processing only on committed changes (upload / mode / pointerup)
  useEffect(() => {
    if (!rawSourceUrl) {
      setProcessed(null);
      setProcessError(null);
      return;
    }

    let cancelled = false;
    setIsProcessing(true);
    setProcessError(null);

    const timer = window.setTimeout(() => {
      const effectiveCutoutMode: CanvaCutoutMode =
        layerOrder === 'photos-on-top' ? 'transparent_png' : cutoutMode;
      processCanvaFrameSource(
        rawSourceUrl,
        {
          cutoutMode: effectiveCutoutMode,
          fitMode,
          chromaHex,
          chromaTolerance,
          chromaOnlyNearSlots,
        },
        customSlotsRef.current
      )
        .then((res) => {
          if (!cancelled) setProcessed(res);
        })
        .catch((err) => {
          if (!cancelled) {
            setProcessed(null);
            setProcessError(
              err instanceof Error ? err.message : 'Gagal memproses gambar frame.'
            );
          }
        })
        .finally(() => {
          if (!cancelled) setIsProcessing(false);
        });
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    rawSourceUrl,
    layerOrder,
    cutoutMode,
    fitMode,
    chromaHex,
    chromaTolerance,
    chromaOnlyNearSlots,
    commitTick,
  ]);

  // Keep un-cut fitted raw canvas cached for eyedropper sampling
  useEffect(() => {
    if (!rawSourceUrl) {
      rawCanvasRef.current = null;
      return;
    }
    let cancelled = false;
    loadImage(rawSourceUrl)
      .then((img) => {
        if (cancelled) return;
        const c = document.createElement('canvas');
        c.width = CANVAS_4R_WIDTH;
        c.height = CANVAS_4R_HEIGHT;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        if (fitMode === 'cover' && img.width > 0 && img.height > 0) {
          const srcRatio = img.width / img.height;
          const dstRatio = c.width / c.height;
          let sx = 0;
          let sy = 0;
          let sw = img.width;
          let sh = img.height;
          if (srcRatio > dstRatio) {
            sw = img.height * dstRatio;
            sx = (img.width - sw) / 2;
          } else {
            sh = img.width / dstRatio;
            sy = (img.height - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        } else if (fitMode === 'contain' && img.width > 0 && img.height > 0) {
          const srcRatio = img.width / img.height;
          const dstRatio = c.width / c.height;
          let dw = c.width;
          let dh = c.height;
          if (srcRatio > dstRatio) dh = c.width / srcRatio;
          else dw = c.height * srcRatio;
          ctx.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
        } else {
          ctx.drawImage(img, 0, 0, c.width, c.height);
        }
        rawCanvasRef.current = c;
      })
      .catch(() => {
        rawCanvasRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [rawSourceUrl, fitMode]);

  const slotCount = customSlots.length;
  const availablePresets = getPresetsForSlotCount(slotCount);
  const safeSelectedIdx = Math.min(selectedSlotIdx, Math.max(0, slotCount - 1));

  const commitSlotList = (next: SlotRect[], forcePresetId?: FrameLayoutId) => {
    setLayoutId(forcePresetId || 'custom');
    setCustomSlots(next);
    setCommitTick((t) => t + 1);
  };

  const handleSelectSlotCount = (count: number) => {
    const presetKey = getDefaultLayoutForCount(count);
    setSelectedSlotIdx(0);
    commitSlotList(cloneSlots(FRAME_LAYOUT_PRESETS[presetKey].slots), presetKey);
  };

  const handleSelectPreset = (presetKey: Exclude<FrameLayoutId, 'custom'>) => {
    setSelectedSlotIdx(0);
    commitSlotList(cloneSlots(FRAME_LAYOUT_PRESETS[presetKey].slots), presetKey);
  };

  const handleAddSlotBox = () => {
    if (customSlots.length >= 8) {
      onToast('Maksimal 8 kotak foto per lembar 4R.');
      return;
    }
    const idx = customSlots.length;
    const offset = (idx % 3) * 0.04;
    const next = [
      ...customSlots,
      {
        slotIndex: idx,
        x: Math.min(0.65, 0.25 + offset),
        y: Math.min(0.65, 0.25 + offset),
        width: 0.38,
        height: 0.24,
      },
    ];
    setSelectedSlotIdx(idx);
    commitSlotList(next);
  };

  const handleRemoveSelectedSlot = () => {
    if (customSlots.length <= 1) {
      onToast('Minimal harus ada 1 kotak foto.');
      return;
    }
    const filtered = customSlots
      .filter((_, i) => i !== safeSelectedIdx)
      .map((s, i) => ({ ...s, slotIndex: i }));
    setSelectedSlotIdx(Math.max(0, safeSelectedIdx - 1));
    commitSlotList(filtered);
  };

  const handleCenterSelectedHorizontally = () => {
    const target = customSlots[safeSelectedIdx];
    if (!target) return;
    const centeredX = Number(Math.max(0.01, (1 - target.width) / 2).toFixed(4));
    const next = customSlots.map((s, i) =>
      i === safeSelectedIdx ? { ...s, x: centeredX } : s
    );
    commitSlotList(next);
    onToast(`Kotak #${safeSelectedIdx + 1} diratakan tepat ke tengah.`);
  };

  const handleMatchAllSlotSizes = () => {
    const refSlot = customSlots[safeSelectedIdx];
    if (!refSlot) return;
    const next = normalizeSlots(
      customSlots.map((s) => ({
        ...s,
        width: refSlot.width,
        height: refSlot.height,
        x: Math.min(s.x, 0.99 - refSlot.width),
        y: Math.min(s.y, 0.99 - refSlot.height),
      }))
    );
    commitSlotList(next);
    onToast(`Semua ${next.length} kotak disamakan ukurannya dengan Kotak #${safeSelectedIdx + 1}.`);
  };

  const handleNumericUpdateSlot = (
    slotIdx: number,
    field: 'x' | 'y' | 'width' | 'height',
    nextVal: number
  ) => {
    const next = normalizeSlots(
      customSlots.map((s, idx) => (idx === slotIdx ? { ...s, [field]: nextVal } : s))
    );
    commitSlotList(next);
  };

  const handleAutoDetectBoxes = async (overrideMode?: 'transparent' | 'color', overrideHex?: string) => {
    if (!rawSourceUrl) return;
    setIsDetecting(true);
    try {
      const scanMode =
        overrideMode || (cutoutMode === 'transparent_png' ? 'transparent' : 'color');
      const scanHex = overrideHex || chromaHex;
      const scanTol = cutoutMode === 'chroma_key' ? chromaTolerance : 14;
      const info = await inspectCanvaSourceForSlots(
        rawSourceUrl,
        fitMode,
        scanMode,
        scanHex,
        scanTol
      );

      if (info.detectedSlots.length > 0) {
        setSelectedSlotIdx(0);
        commitSlotList(info.detectedSlots, 'custom');
        onToast(
          `Berhasil mendeteksi ${info.detectedSlots.length} kotak foto dari desain Canva!`
        );
      } else if (scanMode === 'transparent') {
        onToast('Tidak ditemukan lubang transparan di dalam gambar.');
      } else {
        onToast(
          `Kotak warna ${scanHex} tidak ditemukan otomatis — silakan geser kotak langsung di kanan.`
        );
      }
    } finally {
      setIsDetecting(false);
    }
  };

  const handleLoadFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProcessError('Pilih file gambar ekspor Canva (PNG, JPG, WebP, atau SVG).');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setRawSourceUrl(dataUrl);
      setSourceFilename(file.name);
      setEyedropperActive(false);
      if (!frameName.trim()) {
        const cleanTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        setFrameName(cleanTitle.slice(0, 80));
      }
      setBuilderMode('image');

      // Smart inspect: detect if the uploaded PNG already has transparent windows
      const check = await inspectCanvaSourceForSlots(dataUrl, fitMode, 'transparent');
      if (check.hasInteriorTransparency) {
        setCutoutMode('transparent_png');
        if (check.detectedSlots.length >= 1 && check.detectedSlots.length <= 8) {
          setSelectedSlotIdx(0);
          setLayoutId('custom');
          setCustomSlots(check.detectedSlots);
          setCommitTick((t) => t + 1);
          onToast(
            `PNG transparan terdeteksi (${check.detectedSlots.length} lubang foto otomatis dipaskan!).`
          );
        } else {
          onToast('PNG transparan terdeteksi -> mode PNG Transparan Asli diaktifkan.');
        }
      } else {
        setCutoutMode('auto_cut_slots');
      }
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : 'Gagal membaca file.');
    }
  };

  const handleDownloadCanvaTemplate = () => {
    const pngUrl = generateCanvaTemplateGuidePng(customSlots);
    if (!pngUrl) return;
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `Template-Canva-WHOOPS-${slotCount}Foto-1205x1795.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onToast(`Template panduan Canva (${slotCount} foto, 1205×1795) diunduh!`);
  };

  const handleEyedropperPick = (normX: number, normY: number) => {
    const rawCanvas = rawCanvasRef.current;
    if (!rawCanvas) return;
    const px = Math.floor(normX * rawCanvas.width);
    const py = Math.floor(normY * rawCanvas.height);
    const ctx = rawCanvas.getContext('2d');
    if (!ctx) return;
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    if (pixel[3] < 20) {
      onToast('Area tersebut sudah transparan.');
      setEyedropperActive(false);
      return;
    }
    const picked = rgbToHex(pixel[0], pixel[1], pixel[2]);
    setChromaHex(picked);
    setEyedropperActive(false);
    setCutoutMode('chroma_key');
    onToast(`Warna kotak dipilih (${picked}) dan langsung dilubangi.`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!frameName.trim()) {
      onToast('Isi nama frame terlebih dahulu.');
      return;
    }

    if (builderMode === 'image') {
      if (!processed?.overlayDataUrl) {
        onToast('Silakan unggah desain frame PNG/JPG/SVG dari Canva terlebih dahulu.');
        return;
      }
      const newFrame: PhotoFrame = {
        id: `f-${Date.now()}`,
        name: frameName.trim(),
        category: frameCategory.trim() || 'Canva Custom',
        type: 'image',
        bg: '#FDF7EE',
        trim: '#3A231E',
        labelColor: '#3A231E',
        overlayImageData: processed.overlayDataUrl,
        layoutId,
        layerOrder,
        slots: cloneSlots(customSlots),
        active: true,
        sortOrder: framesCount + 1,
      };
      await onSaveFrame(newFrame);
      setFrameName('');
      setRawSourceUrl('');
      setSourceFilename('');
      setProcessed(null);
      return;
    }

    const vectorFrame: PhotoFrame = {
      id: `f-${Date.now()}`,
      name: frameName.trim(),
      category: frameCategory.trim() || 'Custom',
      type: 'vector',
      bg: vectorBg,
      trim: vectorTrim,
      labelColor: vectorLabelColor,
      overlayImageData: '',
      layoutId,
      slots: cloneSlots(customSlots),
      active: true,
      sortOrder: framesCount + 1,
    };
    await onSaveFrame(vectorFrame);
    setFrameName('');
  };

  return (
    <form onSubmit={handleSubmit} className="whoops-card p-5 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#3A231E]/15 mb-5">
        <div>
          <h3 className="font-display font-bold text-lg sm:text-xl text-[#3A231E]">
            Buat Frame Custom (Canva / Warna)
          </h3>
          <p className="text-xs text-[#61433B] mt-0.5">
            Pilih susunan kotak foto, unggah gambar Canva, lalu geser kotak langsung di preview kanan.
          </p>
        </div>

        <div className="inline-flex rounded-xl border-2 border-[#3A231E] p-1 bg-[#EFE2CE]/70 gap-1">
          <button
            type="button"
            onClick={() => setBuilderMode('image')}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              builderMode === 'image'
                ? 'bg-[#6D1D3A] text-[#FDF7EE]'
                : 'text-[#3A231E] hover:bg-white/70'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Upload Canva / Gambar</span>
          </button>
          <button
            type="button"
            onClick={() => setBuilderMode('vector')}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              builderMode === 'vector'
                ? 'bg-[#6D1D3A] text-[#FDF7EE]'
                : 'text-[#3A231E] hover:bg-white/70'
            }`}
          >
            <Palette className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Frame Warna Polos</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Clean 3-Step Builder */}
        <div className="md:col-span-6 space-y-4">
          {/* STEP 1: Pick Slot Count & Visual Layout Card */}
          <div className="p-4 rounded-2xl bg-[#FDF7EE] border-2 border-[#3A231E] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-sm text-[#3A231E]">
                Langkah 1 · Pilih Jumlah Foto
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#F3D2DB] border border-[#3A231E] text-[11px] font-display font-bold text-[#6D1D3A]">
                {slotCount} Foto
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SUPPORTED_SLOT_COUNTS.map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => handleSelectSlotCount(cnt)}
                  className={`px-3 py-1.5 rounded-xl border-2 text-xs font-display font-bold cursor-pointer transition-colors ${
                    slotCount === cnt
                      ? 'bg-[#6D1D3A] text-[#FDF7EE] border-[#3A231E]'
                      : 'bg-white text-[#3A231E] border-[#3A231E]/40 hover:bg-[#EFE2CE]'
                  }`}
                >
                  {cnt} Foto
                </button>
              ))}
            </div>

            {availablePresets.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {availablePresets.map((preset) => {
                  const isActive = layoutId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`p-2 rounded-xl border-2 flex items-center gap-2.5 text-left cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-[#6D1D3A] text-[#FDF7EE] border-[#3A231E]'
                          : 'bg-white text-[#3A231E] border-[#3A231E]/35 hover:bg-[#EFE2CE]/70'
                      }`}
                    >
                      <LayoutMiniThumbnail slots={preset.slots} active={isActive} />
                      <div className="min-w-0">
                        <div className="font-display font-bold text-xs truncate">
                          {preset.label}
                        </div>
                        <div
                          className={`text-[10px] leading-tight mt-0.5 ${
                            isActive ? 'text-[#FDF7EE]/85' : 'text-[#61433B]'
                          }`}
                        >
                          {preset.hint}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* STEP 2: Upload Canva OR Pick Vector Colors */}
          <div className="p-4 rounded-2xl bg-[#FDF7EE] border-2 border-[#3A231E] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-display font-bold text-sm text-[#3A231E]">
                Langkah 2 · {builderMode === 'image' ? 'Upload Desain Canva' : 'Atur Warna Frame'}
              </span>
              {builderMode === 'image' && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleDownloadCanvaTemplate}
                    className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] inline-flex items-center gap-1 cursor-pointer"
                    title="Unduh panduan ukuran 1205×1795 untuk dipakai di Canva"
                  >
                    <Download className="w-3 h-3" aria-hidden="true" />
                    <span>Template Canva</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCanvaGuide((prev) => !prev)}
                    className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle className="w-3 h-3" aria-hidden="true" />
                    <span>{showCanvaGuide ? 'Tutup Cara' : 'Cara Canva'}</span>
                  </button>
                </div>
              )}
            </div>

            {showCanvaGuide && builderMode === 'image' && (
              <div className="p-3 rounded-xl bg-[#EFE2CE]/70 border border-[#3A231E]/35 text-xs text-[#3A231E] space-y-1 leading-relaxed">
                <div>
                  <b>1.</b> Di Canva, buat ukuran khusus <b>1205 × 1795 px</b> (atau pakai file <b>Template Canva</b>).
                </div>
                <div>
                  <b>2.</b> Hias frame sesukamu, lalu <b>Download PNG / JPG</b> (Canva Gratis tidak perlu transparan!).
                </div>
                <div>
                  <b>3.</b> Upload ke kotak di bawah, lalu tinggal <b>geser / ubah ukuran kotak foto</b> di preview kanan bila perlu.
                </div>
              </div>
            )}

            {builderMode === 'image' ? (
              <div className="space-y-3">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(false);
                    void handleLoadFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`rounded-2xl border-2 border-dashed p-4 text-center transition-colors ${
                    isDraggingFile
                      ? 'border-[#6D1D3A] bg-[#F3D2DB]/45'
                      : 'border-[#3A231E]/55 bg-[#EFE2CE]/40'
                  }`}
                >
                  <label className="cursor-pointer flex flex-col items-center gap-1.5">
                    <div className="w-9 h-9 rounded-xl bg-white border-2 border-[#3A231E] flex items-center justify-center text-[#6D1D3A]">
                      <Upload className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="text-xs font-display font-bold text-[#3A231E]">
                      {sourceFilename
                        ? `Terunggah: ${sourceFilename}`
                        : 'Pilih atau seret PNG / JPG dari Canva'}
                    </div>
                    <span className="whoops-btn whoops-btn-secondary whoops-btn-compact px-3 py-1.5 text-xs mt-0.5">
                      {sourceFilename ? 'Ganti Gambar' : 'Pilih Gambar'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(e) => void handleLoadFile(e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Layer order & cutout options shown cleanly after upload */}
                {rawSourceUrl && (
                  <div className="p-3 rounded-xl bg-[#EFE2CE]/55 border border-[#3A231E]/35 space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-display font-bold text-[#3A231E] inline-flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-[#6D1D3A]" aria-hidden="true" />
                          <span>Posisi Layer Foto &amp; Frame</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAdvancedFit((prev) => !prev)}
                          className="text-[11px] font-display font-semibold text-[#6D1D3A] underline cursor-pointer"
                        >
                          {showAdvancedFit ? 'Tutup Skala' : 'Skala Kanvas'}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLayerOrder('frame-on-top')}
                          className={`p-2 rounded-xl border text-left cursor-pointer transition-colors ${
                            layerOrder === 'frame-on-top'
                              ? 'bg-[#6D1D3A] text-[#FDF7EE] border-[#3A231E]'
                              : 'bg-white text-[#3A231E] border-[#3A231E]/35 hover:bg-[#EFE2CE]'
                          }`}
                        >
                          <div className="font-display font-bold text-[11px] leading-tight">
                            Frame di Depan (Overlay)
                          </div>
                          <div
                            className={`text-[10px] mt-0.5 leading-snug ${
                              layerOrder === 'frame-on-top' ? 'text-[#FDF7EE]/85' : 'text-[#61433B]'
                            }`}
                          >
                            Stiker/medali menutup tepi foto
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setLayerOrder('photos-on-top');
                            setEyedropperActive(false);
                          }}
                          className={`p-2 rounded-xl border text-left cursor-pointer transition-colors ${
                            layerOrder === 'photos-on-top'
                              ? 'bg-[#6D1D3A] text-[#FDF7EE] border-[#3A231E]'
                              : 'bg-white text-[#3A231E] border-[#3A231E]/35 hover:bg-[#EFE2CE]'
                          }`}
                        >
                          <div className="font-display font-bold text-[11px] leading-tight">
                            Foto di Depan (Frame Belakang)
                          </div>
                          <div
                            className={`text-[10px] mt-0.5 leading-snug ${
                              layerOrder === 'photos-on-top' ? 'text-[#FDF7EE]/85' : 'text-[#61433B]'
                            }`}
                          >
                            Bebas ubah ukuran tanpa celah putih
                          </div>
                        </button>
                      </div>
                    </div>

                    {layerOrder === 'frame-on-top' && (
                      <div className="pt-2 border-t border-[#3A231E]/15 space-y-2">
                        <span className="text-xs font-display font-bold text-[#3A231E] inline-flex items-center gap-1.5">
                          <Scissors className="w-3.5 h-3.5 text-[#6D1D3A]" aria-hidden="true" />
                          <span>Cara Melubangi Foto</span>
                        </span>

                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              ['auto_cut_slots', 'Lubangi Otomatis', 'Canva Gratis'],
                              ['transparent_png', 'Sudah Transparan', 'Canva Pro PNG'],
                              ['chroma_key', 'Hapus Warna', 'Pilih warna kotak'],
                            ] as const
                          ).map(([val, title, sub]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => {
                                setCutoutMode(val);
                                if (val !== 'chroma_key') setEyedropperActive(false);
                              }}
                              className={`p-2 rounded-xl border text-left cursor-pointer transition-colors ${
                                cutoutMode === val
                                  ? 'bg-[#6D1D3A] text-[#FDF7EE] border-[#3A231E]'
                                  : 'bg-white text-[#3A231E] border-[#3A231E]/35 hover:bg-[#EFE2CE]'
                              }`}
                            >
                              <div className="font-display font-bold text-[11px] leading-tight">
                                {title}
                              </div>
                              <div
                                className={`text-[10px] mt-0.5 ${
                                  cutoutMode === val ? 'text-[#FDF7EE]/85' : 'text-[#61433B]'
                                }`}
                              >
                                {sub}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {layerOrder === 'frame-on-top' && cutoutMode === 'chroma_key' && (
                      <div className="p-2.5 rounded-xl bg-white border border-[#3A231E]/30 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-[11px] font-display font-semibold inline-flex items-center gap-1.5">
                            Warna:
                            <input
                              type="color"
                              value={chromaHex}
                              onChange={(e) => setChromaHex(e.target.value.toUpperCase())}
                              className="w-7 h-6 rounded cursor-pointer border border-[#3A231E]"
                            />
                            <span className="font-mono-tabular">{chromaHex}</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setEyedropperActive((v) => !v)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-display font-bold inline-flex items-center gap-1 cursor-pointer ${
                              eyedropperActive
                                ? 'bg-[#6D1D3A] text-[#FDF7EE] border-[#3A231E]'
                                : 'bg-[#EFE2CE] text-[#3A231E] border-[#3A231E]/40'
                            }`}
                          >
                            <Pipette className="w-3 h-3" aria-hidden="true" />
                            <span>{eyedropperActive ? 'Klik Kotak di Kanan!' : 'Sedot dari Gambar'}</span>
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <label className="text-[11px] font-display font-semibold flex-1 min-w-[150px]">
                            Toleransi ({chromaTolerance}):
                            <input
                              type="range"
                              min={10}
                              max={95}
                              value={chromaTolerance}
                              onChange={(e) => setChromaTolerance(Number(e.target.value))}
                              className="w-full accent-[#6D1D3A] mt-0.5"
                            />
                          </label>
                          <label className="text-[11px] font-display font-semibold inline-flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={chromaOnlyNearSlots}
                              onChange={(e) => setChromaOnlyNearSlots(e.target.checked)}
                              className="accent-[#6D1D3A]"
                            />
                            <span>Hanya area kotak foto</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {showAdvancedFit && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#3A231E]/15">
                        {(
                          [
                            ['fill', 'Pas Penuh'],
                            ['cover', 'Cover'],
                            ['contain', 'Utuh'],
                          ] as const
                        ).map(([val, lbl]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setFitMode(val)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-display font-semibold border cursor-pointer ${
                              fitMode === val
                                ? 'bg-[#3A231E] text-[#FDF7EE] border-[#3A231E]'
                                : 'bg-white text-[#3A231E] border-[#3A231E]/40'
                            }`}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#EFE2CE]/55 border border-[#3A231E]/35 flex flex-wrap gap-4">
                <label className="text-xs font-display font-semibold inline-flex items-center gap-2">
                  Latar:
                  <input
                    type="color"
                    value={vectorBg}
                    onChange={(e) => setVectorBg(e.target.value)}
                    className="w-9 h-7 rounded cursor-pointer"
                  />
                </label>
                <label className="text-xs font-display font-semibold inline-flex items-center gap-2">
                  Garis Kotak:
                  <input
                    type="color"
                    value={vectorTrim}
                    onChange={(e) => setVectorTrim(e.target.value)}
                    className="w-9 h-7 rounded cursor-pointer"
                  />
                </label>
                <label className="text-xs font-display font-semibold inline-flex items-center gap-2">
                  Teks Logo:
                  <input
                    type="color"
                    value={vectorLabelColor}
                    onChange={(e) => setVectorLabelColor(e.target.value)}
                    className="w-9 h-7 rounded cursor-pointer"
                  />
                </label>
              </div>
            )}
          </div>

          {/* STEP 3: Name, Category & Save */}
          <div className="p-4 rounded-2xl bg-[#FDF7EE] border-2 border-[#3A231E] space-y-3">
            <div className="font-display font-bold text-sm text-[#3A231E]">
              Langkah 3 · Nama &amp; Simpan
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="frame-name-input"
                  className="block text-xs font-display font-semibold mb-1"
                >
                  Nama Frame
                </label>
                <input
                  id="frame-name-input"
                  required
                  value={frameName}
                  onChange={(e) => setFrameName(e.target.value)}
                  placeholder="Misal: Cherry 3-Cut Canva"
                  className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="frame-cat-input"
                  className="block text-xs font-display font-semibold mb-1"
                >
                  Kategori
                </label>
                <input
                  id="frame-cat-input"
                  value={frameCategory}
                  onChange={(e) => setFrameCategory(e.target.value)}
                  placeholder="Canva Custom"
                  className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {QUICK_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFrameCategory(cat)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-display font-semibold border cursor-pointer ${
                        frameCategory === cat
                          ? 'bg-[#6D1D3A] text-[#FDF7EE] border-[#3A231E]'
                          : 'bg-white text-[#61433B] border-[#3A231E]/30 hover:bg-[#EFE2CE]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {processError && (
              <div className="p-2.5 rounded-xl bg-rose-100 border border-[#6D1D3A] text-xs text-[#6D1D3A]">
                {processError}
              </div>
            )}

            <button
              type="submit"
              disabled={
                savingId === 'new-frame' ||
                isProcessing ||
                (builderMode === 'image' && !processed)
              }
              className="whoops-btn whoops-btn-primary w-full py-3 text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {savingId === 'new-frame' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Menyimpan Frame...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {builderMode === 'image'
                      ? `Simpan Frame Canva (${slotCount} Foto)`
                      : `Simpan Frame Warna (${slotCount} Foto)`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Visual Drag & Resize Canvas */}
        <div className="md:col-span-6 md:sticky md:top-18 bg-[#EFE2CE]/55 border-2 border-[#3A231E] rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-display font-bold text-[#3A231E]">
                Kanvas Visual ({slotCount} Kotak Foto)
              </div>
              <p className="text-[11px] text-[#61433B]">
                {eyedropperActive
                  ? 'Klik area kotak foto pada gambar di bawah untuk mengambil warnanya.'
                  : 'Geser kotak untuk memindah posisi · tarik lingkaran pojok kanan bawah untuk ubah ukuran.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowSamplePhotos((v) => !v)}
              className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] inline-flex items-center gap-1 cursor-pointer bg-white"
            >
              {showSamplePhotos ? (
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{showSamplePhotos ? 'Sembunyikan Foto' : 'Contoh Foto'}</span>
            </button>
          </div>

          {/* Quick Interactive Canvas Toolbar */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={handleAddSlotBox}
              disabled={customSlots.length >= 8}
              className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] bg-white inline-flex items-center gap-1 cursor-pointer"
              title="Tambah 1 kotak foto"
            >
              <Plus className="w-3 h-3" aria-hidden="true" />
              <span>Tambah Kotak</span>
            </button>
            <button
              type="button"
              onClick={handleRemoveSelectedSlot}
              disabled={customSlots.length <= 1}
              className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] bg-white inline-flex items-center gap-1 cursor-pointer"
              title="Hapus kotak terpilih"
            >
              <Minus className="w-3 h-3" aria-hidden="true" />
              <span>Hapus #{safeSelectedIdx + 1}</span>
            </button>
            <button
              type="button"
              onClick={handleCenterSelectedHorizontally}
              className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] bg-white inline-flex items-center gap-1 cursor-pointer"
              title="Posisikan kotak terpilih pas di tengah kiri-kanan"
            >
              <AlignCenterHorizontal className="w-3 h-3" aria-hidden="true" />
              <span>Tengah</span>
            </button>
            {slotCount > 1 && (
              <button
                type="button"
                onClick={handleMatchAllSlotSizes}
                className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] bg-white inline-flex items-center gap-1 cursor-pointer"
                title="Samakan lebar & tinggi semua kotak mengikuti kotak terpilih"
              >
                <CopyCheck className="w-3 h-3" aria-hidden="true" />
                <span>Samakan Ukuran</span>
              </button>
            )}
            {builderMode === 'image' && rawSourceUrl && (
              <button
                type="button"
                disabled={isDetecting}
                onClick={() => void handleAutoDetectBoxes()}
                className="whoops-btn whoops-btn-secondary whoops-btn-compact px-2.5 py-1 text-[11px] inline-flex items-center gap-1 cursor-pointer"
                title="Deteksi otomatis kotak putih/lubang transparan dari gambar Canva"
              >
                <Wand2 className="w-3 h-3" aria-hidden="true" />
                <span>{isDetecting ? 'Mendeteksi...' : 'Deteksi Kotak Otomatis'}</span>
              </button>
            )}
          </div>

          <InteractiveSlotCanvas
            slots={customSlots}
            selectedSlotIdx={safeSelectedIdx}
            onSelectSlot={setSelectedSlotIdx}
            onSlotsChange={(next, isFinalCommit) => {
              setLayoutId('custom');
              setCustomSlots(next);
              if (isFinalCommit) {
                setCommitTick((t) => t + 1);
              }
            }}
            builderMode={builderMode}
            layerOrder={layerOrder}
            vectorStyle={{ bg: vectorBg, trim: vectorTrim, labelColor: vectorLabelColor }}
            rawSourceUrl={rawSourceUrl}
            processedOverlayUrl={processed?.overlayDataUrl || ''}
            cutoutMode={cutoutMode}
            showSamplePhotos={showSamplePhotos}
            eyedropperActive={eyedropperActive}
            onEyedropperPick={handleEyedropperPick}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {isProcessing ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[#6D1D3A]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                <span>Memproses gambar...</span>
              </span>
            ) : builderMode === 'image' && processed ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 border border-[#3A231E] text-[11px] font-display font-bold text-emerald-900">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {processed.width}×{processed.height} ·{' '}
                  {processed.format === 'image/webp' ? 'WebP' : 'PNG'} ·{' '}
                  {Math.round(processed.byteLength / 1024)} KB (Siap Sync)
                </span>
              </span>
            ) : (
              <span className="text-[11px] text-[#61433B]">
                {builderMode === 'image'
                  ? 'Unggah desain Canva untuk melihat hasil akhirnya.'
                  : 'Preview langsung frame warna polos.'}
              </span>
            )}

            <button
              type="button"
              onClick={() => setShowNumericControls((v) => !v)}
              className="text-[11px] font-display font-semibold text-[#61433B] hover:text-[#3A231E] inline-flex items-center gap-1 cursor-pointer"
            >
              <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
              <span>{showNumericControls ? 'Tutup Angka' : 'Angka Detail (%)'}</span>
            </button>
          </div>

          {showNumericControls && (
            <div className="p-2.5 rounded-xl bg-white border border-[#3A231E]/35 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {customSlots.map((s, idx) => (
                <div
                  key={`num-${idx}`}
                  className={`p-2 rounded-lg border text-[11px] ${
                    safeSelectedIdx === idx
                      ? 'border-[#6D1D3A] bg-[#F3D2DB]/30'
                      : 'border-[#3A231E]/25'
                  }`}
                >
                  <div className="font-display font-bold text-[#6D1D3A] mb-1">
                    Kotak #{idx + 1} ({Math.round(s.width * 1205)}×{Math.round(s.height * 1795)} px)
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        ['X%', 'x'],
                        ['Y%', 'y'],
                        ['L%', 'width'],
                        ['T%', 'height'],
                      ] as const
                    ).map(([lbl, field]) => (
                      <label key={field} className="block text-[10px] text-[#61433B]">
                        {lbl}
                        <input
                          type="number"
                          min={1}
                          max={98}
                          value={Math.round(s[field] * 100)}
                          onChange={(e) =>
                            handleNumericUpdateSlot(idx, field, Number(e.target.value) / 100)
                          }
                          className="w-full mt-0.5 px-1 py-0.5 border border-[#3A231E]/40 rounded text-xs font-mono-tabular bg-[#FDF7EE]"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
