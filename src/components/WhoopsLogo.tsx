interface WhoopsLogoProps {
  size?: 'sm' | 'lg';
  onClick?: () => void;
}

export function WhoopsLogo({ size = 'sm', onClick }: WhoopsLogoProps) {
  const isLg = size === 'lg';
  const textSize = isLg ? 'text-[54px] sm:text-[64px]' : 'text-[26px]';

  const letters = [
    { ch: 'w', color: 'text-[#6D1D3A]', rot: '-rotate-6' },
    { ch: 'h', color: 'text-[#3A231E]', rot: 'rotate-3' },
    { ch: 'o', color: 'text-[#6D1D3A]', rot: '-rotate-3' },
    { ch: 'o', color: 'text-[#C97B90]', rot: 'rotate-6' },
    { ch: 'p', color: 'text-[#3A231E]', rot: '-rotate-3' },
    { ch: 's', color: 'text-[#6D1D3A]', rot: 'rotate-3' },
    { ch: '!', color: 'text-[#6D1D3A]', rot: 'rotate-12' },
  ];

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-baseline gap-[2px] font-display font-bold select-none leading-none whitespace-nowrap shrink-0 ${
        onClick ? 'cursor-pointer' : ''
      }`}
      aria-label="whoops!"
    >
      {letters.map((item, idx) => (
        <span
          key={idx}
          className={`inline-block ${textSize} ${item.color} ${item.rot}`}
          style={{ textShadow: '2px 2px 0 #EFE2CE' }}
        >
          {item.ch}
        </span>
      ))}
    </div>
  );
}
