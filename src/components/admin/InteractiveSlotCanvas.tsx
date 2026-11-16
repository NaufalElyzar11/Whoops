import { useRef, useState } from 'react';
import { Camera, Move, Scaling } from 'lucide-react';
import type { PhotoFrame, SlotRect } from '../../types';
import type { CanvaCutoutMode } from '../../utils/canvaFrameImporter';

interface InteractiveSlotCanvasProps {
  slots: SlotRect[];
  selectedSlotIdx: number;
  onSelectSlot: (idx: number) => void;
  onSlotsChange: (next: SlotRect[], isFinalCommit: boolean) => void;
  builderMode: 'image' | 'vector';
  vectorStyle: { bg: string; trim: string; labelColor: string };
  rawSourceUrl: string;
  processedOverlayUrl: string;
  cutoutMode: CanvaCutoutMode;
  showSamplePhotos: boolean;
  eyedropperActive?: boolean;
  onEyedropperPick?: (normX: number, normY: number) => void;
}

const SAMPLE_SLOTS = [
  { bg: '#F3D2DB', fg: '#6D1D3A', tag: 'Pose 1' },
  { bg: '#EFE2CE', fg: '#3A231E', tag: 'Pose 2' },
  { bg: '#E4A3B3', fg: '#3A231E', tag: 'Pose 3' },
  { bg: '#F9E6C9', fg: '#6D1D3A', tag: 'Pose 4' },
  { bg: '#EFE2CE', fg: '#6D1D3A', tag: 'Pose 5' },
  { bg: '#F3D2DB', fg: '#3A231E', tag: 'Pose 6' },
  { bg: '#F9E6C9', fg: '#3A231E', tag: 'Pose 7' },
  { bg: '#E4A3B3', fg: '#6D1D3A', tag: 'Pose 8' },
];

type DragSession =
  | {
      kind: 'move';
      slotIdx: number;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
    }
  | {
      kind: 'resize';
      slotIdx: number;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
    };

export function InteractiveSlotCanvas({
  slots,
  selectedSlotIdx,
  onSelectSlot,
  onSlotsChange,
  builderMode,
  vectorStyle,
  rawSourceUrl,
  processedOverlayUrl,
  cutoutMode,
  showSamplePhotos,
  eyedropperActive = false,
  onEyedropperPick,
}: InteractiveSlotCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [snapCenterX, setSnapCenterX] = useState(false);

  const previewVectorFrame: PhotoFrame = {
    id: 'interactive-vector',
    name: 'Preview',
    category: 'Custom',
    type: 'vector',
    bg: vectorStyle.bg,
    trim: vectorStyle.trim,
    labelColor: vectorStyle.labelColor,
    overlayImageData: '',
    layoutId: 'custom',
    slots,
    active: true,
    sortOrder: 99,
  };

  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!eyedropperActive || !onEyedropperPick || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = Math.max(0, Math.min(0.999, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(0.999, (e.clientY - rect.top) / rect.height));
    onEyedropperPick(nx, ny);
  };

  const beginDrag = (
    e: React.PointerEvent,
    kind: 'move' | 'resize',
    slotIdx: number
  ) => {
    if (eyedropperActive) return;
    e.stopPropagation();
    e.preventDefault();
    const s = slots[slotIdx];
    if (!s) return;
    onSelectSlot(slotIdx);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      kind,
      slotIdx,
      startX: e.clientX,
      startY: e.clientY,
      origX: s.x,
      origY: s.y,
      origW: s.width,
      origH: s.height,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;

    let nextX = drag.origX;
    let nextY = drag.origY;
    let nextW = drag.origW;
    let nextH = drag.origH;

    if (drag.kind === 'move') {
      nextX = Math.max(0.01, Math.min(0.99 - drag.origW, drag.origX + dx));
      nextY = Math.max(0.01, Math.min(0.99 - drag.origH, drag.origY + dy));

      // Gentle magnetic center snap horizontally
      const centerDelta = Math.abs(nextX + nextW / 2 - 0.5);
      if (centerDelta < 0.015) {
        nextX = 0.5 - nextW / 2;
        setSnapCenterX(true);
      } else {
        setSnapCenterX(false);
      }
    } else {
      nextW = Math.max(0.08, Math.min(0.99 - drag.origX, drag.origW + dx));
      nextH = Math.max(0.06, Math.min(0.99 - drag.origY, drag.origH + dy));
      setSnapCenterX(false);
    }

    const updated = slots.map((item, idx) =>
      idx === drag.slotIdx
        ? {
            ...item,
            x: Number(nextX.toFixed(4)),
            y: Number(nextY.toFixed(4)),
            width: Number(nextW.toFixed(4)),
            height: Number(nextH.toFixed(4)),
          }
        : item
    );
    onSlotsChange(updated, false);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if not captured
    }
    dragRef.current = null;
    setIsDragging(false);
    setSnapCenterX(false);
    onSlotsChange(slots, true);
  };

  // While actively dragging an auto-cut Canva image, temporarily show the raw graphic underneath so edges align effortlessly
  const displayOverlaySrc =
    builderMode === 'image'
      ? isDragging && cutoutMode === 'auto_cut_slots' && rawSourceUrl
        ? rawSourceUrl
        : processedOverlayUrl || rawSourceUrl
      : '';

  return (
    <div
      ref={stageRef}
      onClick={handleStageClick}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ touchAction: 'none' }}
      className={`relative w-full max-w-[295px] aspect-[1205/1795] mx-auto bg-white border-2 border-[#3A231E] rounded-[18px] overflow-hidden select-none shadow-[4px_4px_0_#3A231E] ${
        eyedropperActive ? 'cursor-crosshair' : ''
      }`}
    >
      {/* Layer 1: Sample photos or vector background base */}
      {slots.map((s, idx) => {
        const sw = SAMPLE_SLOTS[idx % SAMPLE_SLOTS.length];
        return (
          <div
            key={`base-${s.slotIndex}`}
            style={{
              left: `${s.x * 100}%`,
              top: `${s.y * 100}%`,
              width: `${s.width * 100}%`,
              height: `${s.height * 100}%`,
              backgroundColor: showSamplePhotos ? sw.bg : '#EFE2CE',
              color: sw.fg,
            }}
            className="absolute flex flex-col items-center justify-center text-center pointer-events-none"
          >
            {showSamplePhotos && (
              <>
                <Camera className="w-4 h-4 opacity-80" aria-hidden="true" />
                <span className="font-display font-bold text-[10px]">
                  #{idx + 1} · {sw.tag}
                </span>
              </>
            )}
          </div>
        );
      })}

      {/* Layer 2: Frame Artwork Overlay (pointer-events-none so slot handles underneath stay interactive!) */}
      {builderMode === 'image' && displayOverlaySrc ? (
        <img
          src={displayOverlaySrc}
          alt="Preview desain frame Canva"
          className={`absolute inset-0 w-full h-full object-fill pointer-events-none z-10 transition-opacity duration-150 ${
            isDragging && cutoutMode === 'auto_cut_slots' ? 'opacity-65' : 'opacity-100'
          }`}
        />
      ) : builderMode === 'vector' ? (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          viewBox="0 0 1205 1795"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <mask id="interactive-vector-mask">
              <rect width="1205" height="1795" fill="white" />
              {slots.map((s) => (
                <rect
                  key={s.slotIndex}
                  x={s.x * 1205}
                  y={s.y * 1795}
                  width={s.width * 1205}
                  height={s.height * 1795}
                  rx="20"
                  fill="black"
                />
              ))}
            </mask>
          </defs>
          <rect
            width="1205"
            height="1795"
            fill={previewVectorFrame.bg}
            mask="url(#interactive-vector-mask)"
          />
          <rect
            x="16"
            y="16"
            width="1173"
            height="1763"
            rx="28"
            fill="none"
            stroke={previewVectorFrame.trim}
            strokeWidth="6"
          />
          {slots.map((s) => (
            <rect
              key={s.slotIndex}
              x={s.x * 1205}
              y={s.y * 1795}
              width={s.width * 1205}
              height={s.height * 1795}
              rx="20"
              fill="none"
              stroke={previewVectorFrame.trim}
              strokeWidth="5"
            />
          ))}
          <text
            x="602.5"
            y="1685"
            textAnchor="middle"
            fontFamily="Fredoka, ui-rounded, sans-serif"
            fontWeight="700"
            fontSize="64"
            fill={previewVectorFrame.labelColor}
          >
            whoops!
          </text>
          <text
            x="602.5"
            y="1735"
            textAnchor="middle"
            fontFamily="Gaegu, cursive"
            fontSize="34"
            fill={previewVectorFrame.labelColor}
          >
            oops, we made a memory.
          </text>
        </svg>
      ) : null}

      {/* Center Vertical Snap Guide */}
      {snapCenterX && (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 -translate-x-px w-0.5 bg-[#6D1D3A] pointer-events-none z-30 opacity-80"
        />
      )}

      {/* Layer 3: Interactive Drag & Resize Slot Handles */}
      {!eyedropperActive &&
        slots.map((s, idx) => {
          const isSelected = selectedSlotIdx === idx;
          return (
            <div
              key={`handle-${idx}`}
              onPointerDown={(e) => beginDrag(e, 'move', idx)}
              style={{
                left: `${s.x * 100}%`,
                top: `${s.y * 100}%`,
                width: `${s.width * 100}%`,
                height: `${s.height * 100}%`,
                touchAction: 'none',
              }}
              className={`absolute z-20 cursor-grab active:cursor-grabbing transition-shadow rounded-[8px] ${
                isSelected
                  ? 'border-2 border-[#6D1D3A] ring-2 ring-[#FDF7EE]/90 bg-[#6D1D3A]/10'
                  : 'border border-dashed border-[#3A231E]/65 hover:border-[#6D1D3A] bg-transparent'
              }`}
              title={`Geser Kotak Foto #${idx + 1}`}
            >
              <span
                className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-display font-bold inline-flex items-center gap-0.5 pointer-events-none ${
                  isSelected
                    ? 'bg-[#6D1D3A] text-[#FDF7EE]'
                    : 'bg-[#FDF7EE]/90 text-[#3A231E] border border-[#3A231E]/40'
                }`}
              >
                <Move className="w-2.5 h-2.5" aria-hidden="true" />
                <span>#{idx + 1}</span>
              </span>

              {isSelected && (
                <button
                  type="button"
                  onPointerDown={(e) => beginDrag(e, 'resize', idx)}
                  aria-label={`Ubah ukuran kotak foto ${idx + 1}`}
                  style={{ touchAction: 'none' }}
                  className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-[#6D1D3A] text-[#FDF7EE] border-2 border-[#FDF7EE] shadow-md flex items-center justify-center cursor-nwse-resize"
                  title="Tarik pojok ini untuk ubah ukuran kotak"
                >
                  <Scaling className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
    </div>
  );
}
