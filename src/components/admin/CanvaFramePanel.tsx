import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Download,
  HelpCircle,
  Layers,
  Loader2,
  Palette,
  Plus,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { FrameLayoutId, PhotoFrame, SlotRect } from '../../types';
import {
  generateCanvaTemplateGuidePng,
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
import { FramePreviewCanvas } from '../FramePreviewCanvas';

interface CanvaFramePanelProps {
  framesCount: number;
  savingId: string | null;
  onSaveFrame: (frame: PhotoFrame) => Promise<void>;
  onToast: (msg: string) => void;
}

const SAMPLE_SLOT_SWATCHES = [
  { bg: '#F3D2DB', fg: '#6D1D3A', tag: 'Pose 1' },
  { bg: '#EFE2CE', fg: '#3A231E', tag: 'Pose 2' },
  { bg: '#E4A3B3', fg: '#3A231E', tag: 'Pose 3' },
  { bg: '#F9E6C9', fg: '#6D1D3A', tag: 'Pose 4' },
  { bg: '#EFE2CE', fg: '#6D1D3A', tag: 'Pose 5' },
  { bg: '#F3D2DB', fg: '#3A231E', tag: 'Pose 6' },
  { bg: '#F9E6C9', fg: '#3A231E', tag: 'Pose 7' },
  { bg: '#E4A3B3', fg: '#6D1D3A', tag: 'Pose 8' },
];

const QUICK_CATEGORIES = ['Canva Custom', 'Retro Classic', 'Cute Pastel', 'Event / Wedding'];

export function CanvaFramePanel({
  framesCount,
  savingId,
  onSaveFrame,
  onToast,
}: CanvaFramePanelProps) {
  const [builderMode, setBuilderMode] = useState<'image' | 'vector'>('image');

  // Shared metadata
  const [frameName, setFrameName] = useState('');
  const [frameCategory, setFrameCategory] = useState('Canva Custom');

  // Custom slot count & geometry
  const [layoutId, setLayoutId] = useState<FrameLayoutId>('6-grid');
  const [customSlots, setCustomSlots] = useState<SlotRect[]>(() =>
    cloneSlots(FRAME_LAYOUT_PRESETS['6-grid'].slots)
  );
  const [showManualSlots, setShowManualSlots] = useState(false);

  // Vector fields
  const [vectorBg, setVectorBg] = useState('#6D1D3A');
  const [vectorTrim, setVectorTrim] = useState('#FDF7EE');
  const [vectorLabelColor, setVectorLabelColor] = useState('#FDF7EE');

  // Canva importer fields
  const [rawSourceUrl, setRawSourceUrl] = useState<string>('');
  const [sourceFilename, setSourceFilename] = useState<string>('');
  const [cutoutMode, setCutoutMode] = useState<CanvaCutoutMode>('auto_cut_slots');
  const [fitMode, setFitMode] = useState<CanvaFitMode>('fill');
  const [chromaHex, setChromaHex] = useState<string>('#FFFFFF');
  const [chromaTolerance, setChromaTolerance] = useState<number>(38);
  const [chromaOnlyNearSlots, setChromaOnlyNearSlots] = useState<boolean>(true);
  const [processed, setProcessed] = useState<CanvaProcessResult | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [showCanvaGuide, setShowCanvaGuide] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Re-run frame pixel processing whenever source or cutout options change
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
      processCanvaFrameSource(
        rawSourceUrl,
        {
          cutoutMode,
          fitMode,
          chromaHex,
          chromaTolerance,
          chromaOnlyNearSlots,
        },
        customSlots
      )
        .then((res) => {
          if (!cancelled) {
            setProcessed(res);
          }
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
  }, [rawSourceUrl, cutoutMode, fitMode, chromaHex, chromaTolerance, chromaOnlyNearSlots, customSlots]);

  // Cache an un-cut copy of the fitted raw Canva image so click-eyedropper picks exact colors
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
      if (!frameName.trim()) {
        const cleanTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        setFrameName(cleanTitle.slice(0, 80));
      }
      setBuilderMode('image');
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : 'Gagal membaca file.');
    }
  };

  const slotCount = customSlots.length;
  const availablePresets = getPresetsForSlotCount(slotCount);

  const handleSelectSlotCount = (count: number) => {
    const presetKey = getDefaultLayoutForCount(count);
    setLayoutId(presetKey);
    setCustomSlots(cloneSlots(FRAME_LAYOUT_PRESETS[presetKey].slots));
  };

  const handleSelectPreset = (presetKey: Exclude<FrameLayoutId, 'custom'>) => {
    setLayoutId(presetKey);
    setCustomSlots(cloneSlots(FRAME_LAYOUT_PRESETS[presetKey].slots));
  };

  const handleUpdateSlotBox = (
    slotIdx: number,
    field: 'x' | 'y' | 'width' | 'height',
    nextVal: number
  ) => {
    setLayoutId('custom');
    setCustomSlots((prev) =>
      normalizeSlots(
        prev.map((s, idx) => (idx === slotIdx ? { ...s, [field]: nextVal } : s))
      )
    );
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

  const handleEyedropperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (builderMode !== 'image' || cutoutMode !== 'chroma_key') return;
    const box = previewWrapRef.current?.getBoundingClientRect();
    const rawCanvas = rawCanvasRef.current;
    if (!box || !rawCanvas || box.width <= 0 || box.height <= 0) return;

    const normX = Math.max(0, Math.min(0.999, (e.clientX - box.left) / box.width));
    const normY = Math.max(0, Math.min(0.999, (e.clientY - box.top) / box.height));
    const px = Math.floor(normX * rawCanvas.width);
    const py = Math.floor(normY * rawCanvas.height);

    const ctx = rawCanvas.getContext('2d');
    if (!ctx) return;
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    if (pixel[3] < 20) {
      onToast('Area tersebut sudah transparan.');
      return;
    }
    const picked = rgbToHex(pixel[0], pixel[1], pixel[2]);
    setChromaHex(picked);
    onToast(`Warna kotak diambil: ${picked}`);
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

  const previewFrame: PhotoFrame =
    builderMode === 'vector'
      ? {
          id: 'preview-vector',
          name: frameName.trim() || 'Preview Frame',
          category: frameCategory,
          type: 'vector',
          bg: vectorBg,
          trim: vectorTrim,
          labelColor: vectorLabelColor,
          overlayImageData: '',
          layoutId,
          slots: customSlots,
          active: true,
          sortOrder: 99,
        }
      : {
          id: 'preview-canva',
          name: frameName.trim() || 'Preview Canva',
          category: frameCategory,
          type: processed ? 'image' : 'vector',
          bg: '#EFE2CE',
          trim: '#3A231E',
          labelColor: '#6D1D3A',
          overlayImageData: processed?.overlayDataUrl || '',
          layoutId,
          slots: customSlots,
          active: true,
          sortOrder: 99,
        };

  const renderSampleSlot = (slotIndex: number) => {
    const sw = SAMPLE_SLOT_SWATCHES[slotIndex % SAMPLE_SLOT_SWATCHES.length];
    return (
      <div
        style={{ backgroundColor: sw.bg, color: sw.fg }}
        className="w-full h-full flex flex-col items-center justify-center gap-1 select-none"
      >
        <Camera className="w-4 h-4 opacity-80" aria-hidden="true" />
        <span className="font-display font-bold text-[10px] tracking-tight">
          #{slotIndex + 1} · {sw.tag}
        </span>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="whoops-card p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#3A231E]/15">
        <div>
          <h3 className="font-display font-bold text-lg sm:text-xl text-[#3A231E]">
            Tambah Frame Baru (Impor Canva &amp; Custom Jumlah Foto)
          </h3>
          <p className="text-xs text-[#61433B] mt-0.5">
            Pilih jumlah slot foto (misalnya 3 foto atau 6 foto), lalu ekspor desain Canva atau buat frame vektor.
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
            <span>Impor dari Canva</span>
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
            <span>Warna Vektor</span>
          </button>
        </div>
      </div>

      {/* Slot Count & Layout Selector */}
      <div className="p-3.5 rounded-2xl bg-[#FDF7EE] border-2 border-[#3A231E] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-display font-bold text-[#3A231E]">
              1. Jumlah Foto di Frame ({slotCount} Slot)
            </div>
            <p className="text-[11px] text-[#61433B]">
              Bisa custom sesuai kebutuhan — misalnya 2, 3, 4, atau 6 foto.
            </p>
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
                    : 'bg-[#EFE2CE]/70 text-[#3A231E] border-[#3A231E]/40 hover:bg-[#EFE2CE]'
                }`}
              >
                {cnt} Foto
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#3A231E]/15">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-display font-semibold text-[#61433B] mr-1">
              Susunan:
            </span>
            {availablePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-display font-semibold cursor-pointer ${
                  layoutId === preset.id
                    ? 'bg-[#3A231E] text-[#FDF7EE] border-[#3A231E]'
                    : 'bg-white text-[#3A231E] border-[#3A231E]/40 hover:bg-[#EFE2CE]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowManualSlots((prev) => !prev)}
            className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] inline-flex items-center gap-1 cursor-pointer"
          >
            <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
            <span>{showManualSlots ? 'Tutup Posisi Manual' : 'Atur Posisi Kotak Manual'}</span>
          </button>
        </div>

        {showManualSlots && (
          <div className="p-3 rounded-xl bg-[#EFE2CE]/60 border border-[#3A231E]/35 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-display font-semibold text-[#3A231E]">
                Atur koordinat kotak foto (% kanvas 1205×1795) agar pas dengan desain Canva:
              </span>
              {layoutId === 'custom' && (
                <button
                  type="button"
                  onClick={() => handleSelectSlotCount(slotCount)}
                  className="text-[11px] font-display font-bold text-[#6D1D3A] underline cursor-pointer"
                >
                  Reset ke Preset {slotCount} Foto
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {customSlots.map((s, idx) => (
                <div
                  key={s.slotIndex}
                  className="p-2 rounded-xl bg-white border border-[#3A231E]/30 text-[11px] space-y-1.5"
                >
                  <div className="font-display font-bold text-[#6D1D3A]">
                    Slot #{idx + 1}
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
                            handleUpdateSlotBox(idx, field, Number(e.target.value) / 100)
                          }
                          className="w-full mt-0.5 px-1.5 py-1 border border-[#3A231E]/40 rounded text-xs font-mono-tabular bg-[#FDF7EE]"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Canva Preparation Banner + 4-Step Guide */}
      {builderMode === 'image' && (
        <div className="p-3.5 rounded-2xl bg-[#EFE2CE]/75 border-2 border-[#3A231E] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="text-xs text-[#3A231E]">
              <b className="font-display">Ukuran Kanvas Canva:</b>{' '}
              <span className="font-mono-tabular font-bold text-[#6D1D3A]">
                1205 × 1795 px
              </span>{' '}
              (4R Portrait 300 DPI) · Template saat ini berisi <b>{slotCount} area foto</b>.
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadCanvaTemplate}
                className="whoops-btn whoops-btn-secondary whoops-btn-compact px-3 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Unduh Template {slotCount} Foto (1205×1795)</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCanvaGuide((prev) => !prev)}
                className="whoops-btn whoops-btn-ghost whoops-btn-compact px-3 py-1.5 text-xs inline-flex items-center gap-1 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showCanvaGuide ? 'Tutup Panduan' : 'Cara Desain di Canva'}</span>
              </button>
            </div>
          </div>

          {showCanvaGuide && (
            <div className="p-3 rounded-xl bg-white border border-[#3A231E]/30 text-xs text-[#3A231E] space-y-1.5 leading-relaxed">
              <div className="font-display font-bold text-[#6D1D3A]">
                Cara Cepat Impor Desain dari Canva (Tanpa Wajib Canva Pro):
              </div>
              <ol className="list-decimal pl-4 space-y-1">
                <li>
                  Pilih jumlah foto di bagian atas (misal <b>3 Foto</b>), lalu klik <b>Unduh Template {slotCount} Foto (1205×1795)</b>.
                </li>
                <li>
                  Di Canva, buat desain baru <b>Custom size: 1205 × 1795 px</b>, lalu upload file template tersebut sebagai panduan posisi {slotCount} foto.
                </li>
                <li>
                  Tambahkan background, stiker, ilustrasi, dan tulisan sesuka hati di sekeliling kotak foto.
                </li>
                <li>
                  <b>Canva Gratis:</b> Biarkan {slotCount} area foto tertutup warna polos (misal kotak putih template) -&gt; klik <b>Share -&gt; Download -&gt; PNG/JPG</b> -&gt; saat upload di bawah, pilih mode <b>Auto-Lubangi {slotCount} Slot</b>.
                  <br />
                  <b>Canva Pro:</b> Hapus kotak putih di {slotCount} area foto -&gt; Download <b>PNG (Transparent background)</b> -&gt; pilih mode <b>PNG Transparan Asli</b>.
                </li>
              </ol>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Form & Controls */}
        <div className="lg:col-span-7 space-y-4">
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
                placeholder="Misal: Cherry Retro Canva"
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
                placeholder="Canva Custom / Retro Classic"
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

          {builderMode === 'image' ? (
            <div className="space-y-4">
              {/* Dropzone File Picker */}
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
                    : 'border-[#3A231E]/60 bg-[#FDF7EE]'
                }`}
              >
                <label className="cursor-pointer flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-[#EFE2CE] border-2 border-[#3A231E] flex items-center justify-center text-[#6D1D3A]">
                    <Upload className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="text-xs font-display font-bold text-[#3A231E]">
                    {sourceFilename
                      ? `File terpilih: ${sourceFilename}`
                      : 'Klik atau seret file desain Canva ke sini'}
                  </div>
                  <div className="text-[11px] text-[#61433B]">
                    Mendukung PNG (Transparan/Biasa), JPG, WebP, dan SVG
                  </div>
                  <span className="whoops-btn whoops-btn-secondary whoops-btn-compact px-3.5 py-1.5 text-xs mt-0.5">
                    {sourceFilename ? 'Ganti File Gambar' : 'Pilih File dari Perangkat'}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => void handleLoadFile(e.target.files?.[0])}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Cutout Mode Controls */}
              <div className="p-3.5 rounded-2xl bg-[#EFE2CE]/55 border border-[#3A231E]/40 space-y-3">
                <div>
                  <div className="text-xs font-display font-bold text-[#3A231E] flex items-center gap-1.5 mb-2">
                    <Scissors className="w-3.5 h-3.5 text-[#6D1D3A]" aria-hidden="true" />
                    <span>Cara Melubangi Area Foto</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(
                      [
                        ['auto_cut_slots', `Auto-Lubangi ${slotCount} Slot`, 'Untuk PNG/JPG Canva Gratis'],
                        ['transparent_png', 'PNG Transparan Asli', 'Untuk PNG Canva Pro / SVG'],
                        ['chroma_key', 'Hapus Warna Kotak', 'Hapus putih/hijau (Chroma)'],
                      ] as const
                    ).map(([val, title, sub]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setCutoutMode(val)}
                        className={`p-2.5 rounded-xl border-2 text-left cursor-pointer transition-colors ${
                          cutoutMode === val
                            ? 'bg-[#6D1D3A] text-[#FDF7EE] border-[#3A231E]'
                            : 'bg-white text-[#3A231E] border-[#3A231E]/40 hover:bg-[#EFE2CE]/70'
                        }`}
                      >
                        <div className="font-display font-bold text-xs">{title}</div>
                        <div
                          className={`text-[10px] mt-0.5 leading-snug ${
                            cutoutMode === val ? 'text-[#FDF7EE]/85' : 'text-[#61433B]'
                          }`}
                        >
                          {sub}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {cutoutMode === 'chroma_key' && (
                  <div className="p-3 rounded-xl bg-white border border-[#3A231E]/30 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-display font-semibold inline-flex items-center gap-2">
                        Warna Kotak Foto:
                        <input
                          type="color"
                          value={chromaHex}
                          onChange={(e) => setChromaHex(e.target.value.toUpperCase())}
                          className="w-8 h-7 rounded cursor-pointer border border-[#3A231E]"
                        />
                        <span className="font-mono-tabular text-[11px]">{chromaHex}</span>
                      </label>
                      <div className="flex gap-1.5">
                        {[
                          ['Putih', '#FFFFFF'],
                          ['Hijau Screen', '#00FF00'],
                          ['Krem', '#FDF7EE'],
                        ].map(([lbl, hex]) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setChromaHex(hex)}
                            className="px-2 py-1 rounded-md border border-[#3A231E]/40 text-[10px] font-display font-semibold bg-[#EFE2CE]/60 hover:bg-[#EFE2CE] cursor-pointer"
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-xs font-display font-semibold flex-1 min-w-[180px]">
                        Toleransi Warna ({chromaTolerance}):
                        <input
                          type="range"
                          min={10}
                          max={95}
                          value={chromaTolerance}
                          onChange={(e) => setChromaTolerance(Number(e.target.value))}
                          className="w-full accent-[#6D1D3A] mt-1"
                        />
                      </label>

                      <label className="text-xs font-display font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={chromaOnlyNearSlots}
                          onChange={(e) => setChromaOnlyNearSlots(e.target.checked)}
                          className="accent-[#6D1D3A]"
                        />
                        <span>Fokus area {slotCount} slot saja</span>
                      </label>
                    </div>
                    <p className="text-[11px] text-[#61433B]">
                      Tip: Klik langsung pada area kotak foto di gambar preview sebelah kanan untuk menyedot warna kotak secara akurat.
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#3A231E]/15">
                  <div className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[#3A231E]">
                    <Layers className="w-3.5 h-3.5 text-[#6D1D3A]" aria-hidden="true" />
                    <span>Skala Kanvas 4R:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ['fill', 'Pas Penuh (Fill)'],
                        ['cover', 'Cover Proporsional'],
                        ['contain', 'Utuh (Contain)'],
                      ] as const
                    ).map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setFitMode(val)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-display font-semibold border cursor-pointer ${
                          fitMode === val
                            ? 'bg-[#3A231E] text-[#FDF7EE] border-[#3A231E]'
                            : 'bg-white text-[#3A231E] border-[#3A231E]/40 hover:bg-[#EFE2CE]'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-[#EFE2CE]/55 border border-[#3A231E]/40 flex flex-wrap gap-4">
              <label className="text-xs font-display font-semibold inline-flex items-center gap-2">
                Warna Latar:
                <input
                  type="color"
                  value={vectorBg}
                  onChange={(e) => setVectorBg(e.target.value)}
                  className="w-9 h-7 rounded cursor-pointer"
                />
              </label>
              <label className="text-xs font-display font-semibold inline-flex items-center gap-2">
                Garis Trim:
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

          {processError && (
            <div className="p-3 rounded-xl bg-rose-100 border border-[#6D1D3A] text-xs text-[#6D1D3A]">
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
                  {builderMode === 'image' ? 'Simpan Frame Canva' : 'Simpan Frame Vektor'}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Right: Live Custom-Slot Frame Preview */}
        <div className="lg:col-span-5 flex flex-col items-center bg-[#EFE2CE]/55 border-2 border-[#3A231E] rounded-2xl p-4">
          <div className="text-xs font-display font-bold text-[#3A231E] mb-2">
            Preview Hasil ({slotCount} Foto · {builderMode === 'image' ? 'Canva Overlay' : 'Vektor'})
          </div>

          <div
            ref={previewWrapRef}
            onClick={handleEyedropperClick}
            className={
              builderMode === 'image' && cutoutMode === 'chroma_key' && rawSourceUrl
                ? 'cursor-crosshair w-full max-w-[235px]'
                : 'w-full max-w-[235px]'
            }
            title={
              builderMode === 'image' && cutoutMode === 'chroma_key'
                ? 'Klik warna kotak di preview untuk mengambil warna Chroma Key'
                : undefined
            }
          >
            <FramePreviewCanvas
              frame={previewFrame}
              maxWidthClass="max-w-[235px]"
              renderSlotContent={renderSampleSlot}
            />
          </div>

          <div className="mt-3 text-center">
            {isProcessing ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[#6D1D3A]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                <span>Memproses transparansi &amp; resolusi...</span>
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
            ) : builderMode === 'image' ? (
              <span className="text-[11px] text-[#61433B]">
                Unggah gambar Canva untuk melihat {slotCount} foto masuk ke dalam lubang frame.
              </span>
            ) : (
              <span className="text-[11px] text-[#61433B]">
                Preview langsung frame vektor {slotCount} slot.
              </span>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
