import type { ReactNode } from 'react';
import { DEFAULT_SLOTS, type PhotoFrame } from '../types';

interface FramePreviewCanvasProps {
  frame: PhotoFrame;
  maxWidthClass?: string;
  renderSlotContent?: (slotIndex: number) => ReactNode;
  onSlotClick?: (slotIndex: number) => void;
  onSlotDrop?: (slotIndex: number, e: React.DragEvent<HTMLDivElement>) => void;
  selectedSlotIndex?: number | null;
}

export function FramePreviewCanvas({
  frame,
  maxWidthClass = 'max-w-[300px]',
  renderSlotContent,
  onSlotClick,
  onSlotDrop,
  selectedSlotIndex = null,
}: FramePreviewCanvasProps) {
  const maskId = `cutout-preview-${frame.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <div
      className={`relative w-full ${maxWidthClass} aspect-[1205/1795] mx-auto bg-white border-2 border-[#3A231E] rounded-[18px] overflow-hidden select-none`}
    >
      {DEFAULT_SLOTS.map((s) => {
        const isSelected = selectedSlotIndex === s.slotIndex;
        const customContent = renderSlotContent ? renderSlotContent(s.slotIndex) : null;

        return (
          <div
            key={s.slotIndex}
            onClick={onSlotClick ? () => onSlotClick(s.slotIndex) : undefined}
            onDragOver={onSlotDrop ? (e) => e.preventDefault() : undefined}
            onDrop={onSlotDrop ? (e) => onSlotDrop(s.slotIndex, e) : undefined}
            style={{
              left: `${s.x * 100}%`,
              top: `${s.y * 100}%`,
              width: `${s.width * 100}%`,
              height: `${s.height * 100}%`,
            }}
            className={`absolute overflow-hidden flex flex-col items-center justify-center text-center transition-shadow ${
              onSlotClick ? 'cursor-pointer' : ''
            } ${
              !customContent
                ? 'bg-[#EFE2CE]/90 border-2 border-dashed border-[#6D1D3A] text-[#6D1D3A] font-display text-xs'
                : ''
            } ${isSelected ? 'shadow-[0_0_0_3px_#C97B90_inset] z-[5]' : ''}`}
          >
            {customContent || <span>#{s.slotIndex + 1}</span>}
          </div>
        );
      })}

      {frame.type === 'image' && frame.overlayImageData ? (
        <img
          src={frame.overlayImageData}
          alt={frame.name}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-fill pointer-events-none z-10"
        />
      ) : (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          viewBox="0 0 1205 1795"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <mask id={maskId}>
              <rect width="1205" height="1795" fill="white" />
              {DEFAULT_SLOTS.map((s) => (
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
          <rect width="1205" height="1795" fill={frame.bg} mask={`url(#${maskId})`} />
          <rect
            x="16"
            y="16"
            width="1173"
            height="1763"
            rx="28"
            fill="none"
            stroke={frame.trim}
            strokeWidth="6"
          />
          {DEFAULT_SLOTS.map((s) => (
            <rect
              key={s.slotIndex}
              x={s.x * 1205}
              y={s.y * 1795}
              width={s.width * 1205}
              height={s.height * 1795}
              rx="20"
              fill="none"
              stroke={frame.trim}
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
            fill={frame.labelColor}
          >
            whoops!
          </text>
          <text
            x="602.5"
            y="1735"
            textAnchor="middle"
            fontFamily="Gaegu, cursive"
            fontSize="34"
            fill={frame.labelColor}
          >
            oops, we made a memory.
          </text>
        </svg>
      )}
    </div>
  );
}
