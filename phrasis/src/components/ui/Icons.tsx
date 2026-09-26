import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 16, props: P) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

export const ChevronDown = ({ size = 14, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const ChevronRight = ({ size = 14, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const Plus = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 4v16M4 12h16" />
  </svg>
);
export const Minus = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M5 12h14" />
  </svg>
);
export const Close = ({ size = 14, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const More = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="19" cy="12" r="1.7" />
  </svg>
);
export const Doc = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
  </svg>
);
export const DocSplit = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="5" y="4" width="14" height="16" rx="1" />
    <path d="M10 4v16" />
  </svg>
);
export const Hierarchy = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M5 4v5M19 4v5M5 9h14M12 9v11M9 20h6" />
    <circle cx="12" cy="14" r="0.5" />
  </svg>
);
export const Rewind = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <rect x="5" y="5" width="2.4" height="14" rx="0.6" />
    <path d="M19 5.5v13a.6.6 0 0 1-.93.5L9.2 12.5a.6.6 0 0 1 0-1l8.87-6.5a.6.6 0 0 1 .93.5z" />
  </svg>
);
export const PlayIcon = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <path d="M8 5.2v13.6a.7.7 0 0 0 1.07.6l10.6-6.8a.7.7 0 0 0 0-1.2L9.07 4.6A.7.7 0 0 0 8 5.2z" />
  </svg>
);
export const PauseIcon = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <rect x="6.5" y="5" width="3.6" height="14" rx="0.8" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="0.8" />
  </svg>
);
export const StopIcon = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <rect x="5.5" y="5.5" width="13" height="13" rx="1" />
  </svg>
);
export const Loop = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={2}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.4-5.5" />
    <path d="M18.2 3.5v4h-4" />
  </svg>
);
export const Home = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 11l8-7 8 7" />
    <path d="M6 9.5V20h4.5v-5.5h3V20H18V9.5" />
  </svg>
);
export const LibraryIcon = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="4" y="4" width="16" height="4.5" rx="1" />
    <rect x="4" y="10.5" width="16" height="4.5" rx="1" />
    <path d="M4 18.5h16" />
  </svg>
);
export const Cap = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M2.5 9.5L12 5l9.5 4.5L12 14z" />
    <path d="M6.5 11.5v4.5c0 1.2 2.5 2.5 5.5 2.5s5.5-1.3 5.5-2.5v-4.5" />
    <path d="M21.5 9.5v5" />
  </svg>
);
export const Archive = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3.5" y="4" width="17" height="4.5" rx="0.8" />
    <path d="M5 8.5V20h14V8.5M9.5 12.5h5" />
  </svg>
);
export const Cloud = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M7 18.5h10.5a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.4 9.2 4.7 4.7 0 0 0 7 18.5z" />
  </svg>
);
export const Drive = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3.5 13.5l2.5-7.5h12l2.5 7.5v5h-17z" />
    <path d="M3.5 13.5h17M16.5 16h.01" />
  </svg>
);
export const DotsGrid = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    {[5, 12, 19].flatMap((y) => [5, 12, 19].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" />))}
  </svg>
);
export const ListIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4 6h1M4 12h1M4 18h1" />
  </svg>
);
export const Waveform = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3 12h1M6 9v6M9 5v14M12 8v8M15 3v18M18 9v6M21 12h0" />
  </svg>
);
export const BarsIcon = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 20v-6M8 20V9M12 20V4M16 20V9M20 20v-6" />
  </svg>
);
export const Signal = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <rect x="3" y="15" width="3" height="6" rx="0.6" />
    <rect x="8" y="11" width="3" height="10" rx="0.6" />
    <rect x="13" y="7" width="3" height="14" rx="0.6" />
    <rect x="18" y="3" width="3" height="18" rx="0.6" />
  </svg>
);
export const Pencil = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 20l1.2-4.8L16 4.4l3.6 3.6L8.8 18.8z" />
    <path d="M14 6.4l3.6 3.6" />
  </svg>
);
export const Eraser = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M8.5 19.5L3.5 14.5 13.5 4.5l6 6-9 9z" />
    <path d="M8.5 9.5l6 6M8.5 19.5H20" />
  </svg>
);
export const Marquee = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)} strokeDasharray="2.6 2.4">
    <rect x="4" y="4" width="16" height="16" rx="1" />
  </svg>
);
export const Pointer = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M6 4l12 7.5-5.3 1.2L10 18z" />
  </svg>
);
export const User = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </svg>
);
export const Cube = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
  </svg>
);
export const Angle = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3 19h4l5-12 3 8 2-3h4" />
  </svg>
);
export const Heart = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.3c0 5.4-7.5 10-7.5 10z" />
  </svg>
);
export const Star = ({ size = 22, filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base(size, p)} fill={filled ? 'currentColor' : 'none'} strokeWidth={1.4}>
    <path d="M12 3.6l2.6 5.5 6 .7-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.1 6-.7z" />
  </svg>
);
export const Grip = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
  </svg>
);
export const Folder = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3.5 6.5a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
  </svg>
);
export const Arch = ({ size = 40, ...p }: P) => (
  <svg width={size} height={size * 0.5} viewBox="0 0 48 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden {...p}>
    <path d="M4 20C12 4 36 4 44 20" />
  </svg>
);
export const TemplateIcon = ({ kind }: { kind: string }) => {
  const s = { width: 46, height: 40, viewBox: '0 0 46 40', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, 'aria-hidden': true } as const;
  switch (kind) {
    case 'empty':
      return (
        <svg {...s}>
          <path d="M23 8v24M11 20h24" strokeWidth={1.6} />
        </svg>
      );
    case 'melody':
      return (
        <svg {...s}>
          {[10, 15, 20, 25, 30].map((y) => (
            <path key={y} d={`M2 ${y}h42`} />
          ))}
        </svg>
      );
    case 'counterpoint':
      return (
        <svg {...s}>
          {[6, 9, 12, 15, 18, 23, 26, 29, 32, 35].map((y) => (
            <path key={y} d={`M4 ${y}h38`} />
          ))}
          <path d="M4 6v29" strokeWidth={2} />
        </svg>
      );
    case 'rhythmic':
      return (
        <svg {...s}>
          <rect x="3" y="4" width="40" height="32" />
          <path d="M3 12h40M3 20h40M3 28h40M11 4v32M19 4v32M27 4v32M35 4v32" />
        </svg>
      );
    case 'modal':
      return (
        <svg {...s}>
          <path d="M2 21h8l3-8 4 16 4-18 3 14 3-6h17" strokeWidth={1.5} />
        </svg>
      );
    default:
      return (
        <svg {...s}>
          <rect x="16" y="4" width="14" height="7" />
          <rect x="8" y="17" width="12" height="7" />
          <rect x="26" y="17" width="12" height="7" />
          <rect x="16" y="29" width="14" height="7" />
          <path d="M23 11v6M14 24v5M32 24v5" />
        </svg>
      );
  }
};

/** Small glyphs for the transformation tiles. */
export const TransformIcon = ({ kind }: { kind: string }) => {
  const s = { width: 44, height: 26, viewBox: '0 0 44 26', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (kind) {
    case 'original':
      return (
        <svg {...s}>
          <path d="M6 18l6-8h20l6 8" />
          <path d="M4 18h36" />
        </svg>
      );
    case 'transpose':
      return (
        <svg {...s}>
          <path d="M22 4v18M18 8l4-4 4 4M18 18l4 4 4-4" />
        </svg>
      );
    case 'invert':
      return (
        <svg {...s}>
          <path d="M22 4v18M18 8l4-4 4 4M18 18l4 4 4-4M17 13h10" />
        </svg>
      );
    case 'retrograde':
      return (
        <svg {...s}>
          <path d="M8 13h10M12 9l-4 4 4 4M26 13h10M32 9l4 4-4 4" />
        </svg>
      );
    case 'augment':
      return (
        <svg {...s} strokeWidth={3}>
          <path d="M10 15h8M22 11h12" />
        </svg>
      );
    case 'diminish':
      return (
        <svg {...s} strokeWidth={3}>
          <path d="M12 15h6M22 11h8" />
        </svg>
      );
    case 'rhythmic':
      return (
        <svg {...s}>
          <path d="M16 5v14M28 5v14" />
          <ellipse cx="13.5" cy="19" rx="3" ry="2.2" fill="currentColor" />
          <ellipse cx="25.5" cy="19" rx="3" ry="2.2" fill="currentColor" />
        </svg>
      );
    case 'contour':
      return (
        <svg {...s}>
          <path d="M4 21C12 3 32 3 40 21" />
        </svg>
      );
    default:
      return (
        <svg {...s}>
          <rect x="13" y="4" width="12" height="12" rx="1.5" />
          <rect x="19" y="10" width="12" height="12" rx="1.5" />
        </svg>
      );
  }
};

// Piano-roll tools
export const Brush = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M20 4l-9.5 9.5" />
    <path d="M10.5 13.5c-2.2-.4-4 1-4.3 3.2-.2 1.5-1.2 2.6-2.7 2.8 3.4 1.6 7.6.4 8.3-3.3.2-1-.4-2.1-1.3-2.7z" />
    <path d="M13 9l2 2" />
  </svg>
);
export const Knife = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3v18" strokeDasharray="2.4 2.2" />
    <path d="M5 8h4M5 16h4M15 8h4M15 16h4" />
  </svg>
);
export const MuteNote = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3.5" y="9" width="17" height="6" rx="1.5" strokeDasharray="2.2 1.8" />
    <path d="M5 19L19 5" />
  </svg>
);
export const Speaker = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);
export const Wrench = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M14.5 5.2a4.2 4.2 0 0 0-4.9 5.6L4 16.4 7.6 20l5.6-5.6a4.2 4.2 0 0 0 5.6-4.9l-2.6 2.6-2.6-.6-.6-2.6z" />
  </svg>
);
export const Magnet = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M6 4v8a6 6 0 0 0 12 0V4" />
    <path d="M6 8h3M15 8h3M9 4v8a3 3 0 0 0 6 0V4" />
  </svg>
);
export const FitIcon = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);
export const Chord = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="4" y="4" width="11" height="3.6" rx="1" />
    <rect x="4" y="10.2" width="11" height="3.6" rx="1" />
    <rect x="4" y="16.4" width="11" height="3.6" rx="1" />
    <path d="M18.5 5v14" />
  </svg>
);
export const Collapse = ({ size = 14, open, ...p }: P & { open?: boolean }) => (
  <svg {...base(size, p)}>
    <path d={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} />
  </svg>
);
