import { motion } from 'motion/react';

interface WhoopsLogoProps {
  size?: 'sm' | 'lg';
  animated?: boolean;
  onClick?: () => void;
}

const LETTERS = [
  { ch: 'w', color: 'text-[#6D1D3A]', rot: -6 },
  { ch: 'h', color: 'text-[#3A231E]', rot: 3 },
  { ch: 'o', color: 'text-[#6D1D3A]', rot: -3 },
  { ch: 'o', color: 'text-[#C97B90]', rot: 6 },
  { ch: 'p', color: 'text-[#3A231E]', rot: -3 },
  { ch: 's', color: 'text-[#6D1D3A]', rot: 3 },
  { ch: '!', color: 'text-[#6D1D3A]', rot: 12 },
];

export function WhoopsLogo({ size = 'sm', animated = false, onClick }: WhoopsLogoProps) {
  const isLg = size === 'lg';
  const textSize = isLg ? 'text-[52px] sm:text-[64px] lg:text-[72px]' : 'text-[24px] sm:text-[26px]';

  const content = (
    <>
      {LETTERS.map((item, idx) => (
        <motion.span
          key={idx}
          initial={animated ? { opacity: 0.9, y: -10, rotate: item.rot - 6, scale: 0.92 } : false}
          animate={{ opacity: 1, y: 0, rotate: item.rot, scale: 1 }}
          whileHover={
            onClick || animated
              ? { y: -4, rotate: 0, scale: 1.08, transition: { type: 'spring', stiffness: 450, damping: 18 } }
              : undefined
          }
          transition={{
            type: 'spring',
            stiffness: 420,
            damping: 20,
            delay: animated ? idx * 0.025 : 0,
          }}
          className={`inline-block ${textSize} ${item.color}`}
          style={{ textShadow: isLg ? '3px 3px 0 #EFE2CE' : '2px 2px 0 #EFE2CE' }}
        >
          {item.ch}
        </motion.span>
      ))}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-baseline gap-[2px] font-display font-bold select-none leading-none whitespace-nowrap shrink-0 cursor-pointer bg-transparent border-0 p-1 rounded-xl"
        aria-label="whoops! Kembali ke layar awal"
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className="inline-flex items-baseline gap-[2px] font-display font-bold select-none leading-none whitespace-nowrap shrink-0"
      aria-label="whoops!"
    >
      {content}
    </div>
  );
}
