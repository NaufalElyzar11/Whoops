import { useEffect, useRef, useState } from 'react';
import {
  Eraser,
  Loader2,
  PenTool,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  fetchOrderMediaDataUrl,
  saveOrderDoodleResult,
} from '../services/firestoreService';
import type { PhotoboothOrder } from '../types';
import {
  CANVAS_4R_HEIGHT,
  CANVAS_4R_WIDTH,
  compositeDoodleOntoOriginal,
} from '../utils/canvasEngine';

interface DoodleStudioModalProps {
  order: PhotoboothOrder;
  onClose: () => void;
  onSaved: () => void;
}

type ToolMode = 'pen' | 'eraser' | 'sticker';
type StickerKind = 'star' | 'heart' | 'flower' | 'whoops';

const PALETTE = [
  '#FDF7EE',
  '#FFE8A3',
  '#F3D2DB',
  '#E4A3B3',
  '#6D1D3A',
  '#3A231E',
  '#A5D8FF',
  '#B2F2BB',
];

const BRUSH_SIZES = [
  { label: 'Tipis', size: 7 },
  { label: 'Sedang', size: 15 },
  { label: 'Tebal', size: 28 },
];

export function DoodleStudioModal({
  order,
  onClose,
  onSaved,
}: DoodleStudioModalProps) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [loadingOriginal, setLoadingOriginal] = useState(true);
  const [uploadedOverlayUrl, setUploadedOverlayUrl] = useState<string | null>(null);

  const [tool, setTool] = useState<ToolMode>('pen');
  const [sticker, setSticker] = useState<StickerKind>('star');
  const [color, setColor] = useState('#FFE8A3');
  const [brushSize, setBrushSize] = useState(15);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const [historyCount, setHistoryCount] = useState(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoadingOriginal(true);
    fetchOrderMediaDataUrl(order.id, 'original', order.originalChunks)
      .then((url) => {
        if (!cancelled) {
          setOriginalUrl(url || order.previewThumbUrl || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOriginalUrl(order.previewThumbUrl || null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingOriginal(false);
      });

    return () => {
      cancelled = true;
    };
  }, [order.id, order.originalChunks, order.previewThumbUrl]);

  const pushHistory = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const next = [...historyRef.current.slice(-19), snap];
    historyRef.current = next;
    setHistoryCount(next.length);
  };

  const handleUndo = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas || historyRef.current.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setHistoryCount(historyRef.current.length);
    ctx.putImageData(prev, 0, 0);
  };

  const handleClearDoodle = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    pushHistory();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const drawStickerAt = (
    ctx: CanvasRenderingContext2D,
    kind: StickerKind,
    x: number,
    y: number
  ) => {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color;
    ctx.strokeStyle = '#3A231E';
    ctx.lineWidth = 4;

    if (kind === 'star') {
      const spikes = 5;
      const outer = 34;
      const inner = 16;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const sx = x + Math.cos(angle) * r;
        const sy = y + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'heart') {
      ctx.beginPath();
      ctx.moveTo(x, y + 18);
      ctx.bezierCurveTo(x - 36, y - 8, x - 20, y - 38, x, y - 14);
      ctx.bezierCurveTo(x + 20, y - 38, x + 36, y - 8, x, y + 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'flower') {
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * 18, y + Math.sin(angle) * 18, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#FFE8A3';
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'whoops') {
      ctx.font = 'bold 46px Gaegu, cursive';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 7;
      ctx.strokeText('whoops!', x, y);
      ctx.fillText('whoops!', x, y);
    }
    ctx.restore();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getCanvasPoint(e);
    pushHistory();

    if (tool === 'sticker') {
      drawStickerAt(ctx, sticker, pt.x, pt.y);
      return;
    }

    isDrawingRef.current = true;
    lastPointRef.current = pt;

    ctx.save();
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || tool === 'sticker') return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !lastPointRef.current) return;

    const pt = getCanvasPoint(e);
    ctx.save();
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.restore();

    lastPointRef.current = pt;
  };

  const handlePointerUp = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleUploadPng = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedOverlayUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveDoodle = async () => {
    if (!originalUrl) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const doodleLayerDataUrl = drawCanvasRef.current
        ? drawCanvasRef.current.toDataURL('image/png')
        : null;

      const { fullPngDataUrl, previewThumbUrl } = await compositeDoodleOntoOriginal(
        originalUrl,
        doodleLayerDataUrl,
        uploadedOverlayUrl
      );

      await saveOrderDoodleResult(order, fullPngDataUrl, previewThumbUrl);
      onSaved();
    } catch (err) {
      console.error(err);
      setSaveError('Gagal menyimpan hasil doodle ke cloud. Silakan coba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#3A231E]/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="whoops-card w-full max-w-5xl p-5 sm:p-6 my-auto">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#3A231E]/20">
          <div>
            <div className="text-xs font-mono-tabular font-bold text-[#6D1D3A]">
              {order.orderCode} · {order.packageName}
            </div>
            <h2 className="font-display font-bold text-2xl text-[#3A231E]">
              Studio Gambar Doodle & Unggah PNG
            </h2>
            <p className="text-xs text-[#61433B] mt-0.5">
              Request Pelanggan: <b>{order.doodleNotes || 'Tidak ada catatan khusus'}</b>
            </p>
          </div>
          <button
            onClick={onClose}
            className="whoops-btn whoops-btn-ghost p-2 cursor-pointer"
            aria-label="Tutup studio doodle"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-5 items-start">
          {/* Canvas Workspace */}
          <div className="lg:col-span-6 flex flex-col items-center">
            <div className="relative w-full max-w-[340px] aspect-[1205/1795] border-2 border-[#3A231E] rounded-2xl overflow-hidden bg-white select-none">
              {loadingOriginal ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-[#61433B]">
                  <Loader2 className="w-6 h-6 animate-spin text-[#6D1D3A]" />
                  <span>Memuat foto asli 300 DPI...</span>
                </div>
              ) : (
                <>
                  {originalUrl && (
                    <img
                      src={originalUrl}
                      alt={`Original ${order.orderCode}`}
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />
                  )}
                  {uploadedOverlayUrl && (
                    <img
                      src={uploadedOverlayUrl}
                      alt="Overlay PNG"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />
                  )}
                  <canvas
                    ref={drawCanvasRef}
                    width={CANVAS_4R_WIDTH}
                    height={CANVAS_4R_HEIGHT}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="relative z-10 w-full h-full touch-none cursor-crosshair"
                  />
                </>
              )}
            </div>
            <p className="text-[11px] text-[#61433B] mt-2 text-center">
              Gambar langsung di atas foto (mouse / sentuh / stylus) atau unggah file PNG di panel kanan.
            </p>
          </div>

          {/* Controls */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-[#EFE2CE] border-2 border-[#3A231E] rounded-2xl p-4">
              <div className="font-display font-bold text-sm mb-2.5">1. Alat Gambar Bawaan</div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <button
                  onClick={() => setTool('pen')}
                  className={`whoops-btn py-2 text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                    tool === 'pen' ? 'whoops-btn-primary' : 'whoops-btn-ghost'
                  }`}
                >
                  <PenTool className="w-3.5 h-3.5" />
                  Kuas
                </button>
                <button
                  onClick={() => setTool('eraser')}
                  className={`whoops-btn py-2 text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                    tool === 'eraser' ? 'whoops-btn-primary' : 'whoops-btn-ghost'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  Hapus
                </button>
                <button
                  onClick={() => setTool('sticker')}
                  className={`whoops-btn py-2 text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                    tool === 'sticker' ? 'whoops-btn-primary' : 'whoops-btn-ghost'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Stiker
                </button>
              </div>

              {tool === 'sticker' && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {(
                    [
                      ['star', '★ Bintang'],
                      ['heart', '♥ Hati'],
                      ['flower', '✿ Bunga'],
                      ['whoops', 'whoops!'],
                    ] as [StickerKind, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setSticker(id)}
                      className={`whoops-btn py-1.5 text-xs cursor-pointer ${
                        sticker === id ? 'whoops-btn-secondary' : 'whoops-btn-ghost'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div className="mb-3">
                <div className="text-xs font-display font-semibold mb-1.5">Warna Goresan / Stiker</div>
                <div className="flex flex-wrap gap-2">
                  {PALETTE.map((hex) => (
                    <button
                      key={hex}
                      onClick={() => setColor(hex)}
                      style={{ backgroundColor: hex }}
                      aria-label={`Warna ${hex}`}
                      className={`w-7 h-7 rounded-full border-2 border-[#3A231E] cursor-pointer transition-transform ${
                        color === hex ? 'scale-115 ring-2 ring-[#6D1D3A]' : ''
                      }`}
                    />
                  ))}
                </div>
              </div>

              {tool !== 'sticker' && (
                <div className="mb-3">
                  <div className="text-xs font-display font-semibold mb-1.5">Ukuran Kuas</div>
                  <div className="grid grid-cols-3 gap-2">
                    {BRUSH_SIZES.map((b) => (
                      <button
                        key={b.size}
                        onClick={() => setBrushSize(b.size)}
                        className={`whoops-btn py-1.5 text-xs cursor-pointer ${
                          brushSize === b.size ? 'whoops-btn-secondary' : 'whoops-btn-ghost'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-[#3A231E]/15">
                <button
                  onClick={handleUndo}
                  disabled={historyCount === 0}
                  className="whoops-btn whoops-btn-ghost flex-1 py-2 text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Undo ({historyCount})
                </button>
                <button
                  onClick={handleClearDoodle}
                  className="whoops-btn whoops-btn-ghost flex-1 py-2 text-xs inline-flex items-center justify-center gap-1 text-[#6D1D3A] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Bersihkan
                </button>
              </div>
            </div>

            <div className="bg-[#FDF7EE] border-2 border-[#3A231E] rounded-2xl p-4">
              <div className="font-display font-bold text-sm mb-1.5">
                2. Atau Unggah File PNG Doodle Eksternal
              </div>
              <p className="text-xs text-[#61433B] mb-3">
                Unggah layer PNG transparan dari tablet gambar/Procreate atau file jadi 4R. Dapat digabungkan dengan coretan kanvas di atas.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="whoops-btn whoops-btn-secondary px-4 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Pilih File PNG
                  <input
                    type="file"
                    accept="image/png,image/webp,image/jpeg"
                    onChange={handleUploadPng}
                    className="hidden"
                  />
                </label>
                {uploadedOverlayUrl && (
                  <button
                    onClick={() => setUploadedOverlayUrl(null)}
                    className="whoops-btn whoops-btn-ghost px-3 py-2 text-xs text-[#6D1D3A] cursor-pointer"
                  >
                    Hapus Overlay PNG
                  </button>
                )}
              </div>
            </div>

            {saveError && (
              <div className="p-3 rounded-xl bg-rose-100 border border-[#6D1D3A] text-xs text-[#6D1D3A]">
                {saveError}
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={onClose}
                className="whoops-btn whoops-btn-ghost px-5 py-2.5 text-sm cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleSaveDoodle}
                disabled={isSaving || loadingOriginal || !originalUrl}
                className="whoops-btn whoops-btn-primary px-6 py-2.5 text-sm inline-flex items-center gap-2 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan 300 DPI...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Simpan & Selesaikan Doodle
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
