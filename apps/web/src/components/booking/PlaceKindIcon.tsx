import type { CSSProperties } from 'react';

/** Inline SVG icons for public place kinds (Elite V2). viewBox 0 0 24 24. */
const PATHS: Record<string, string> = {
  airport:
    'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z',
  port: 'M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z',
  station:
    'M12 2c-4 0-8 .5-8 4v9.5A2.5 2.5 0 0 0 6.5 18H7v2h2v-2h6v2h2v-2h.5a2.5 2.5 0 0 0 2.5-2.5V6c0-3.5-4-4-8-4zM7.5 14a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM16 10H8V6h8v4z',
  landmark:
    'M4 21h16v-2H4v2zm1-4h14v-2H5v2zM6 5l6-3 6 3v2H6V5zm1 4h2v7H7V9zm4 0h2v7h-2V9zm4 0h2v7h-2V9z',
  square:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3c1.9 0 3.5 1.4 3.5 3.5 0 2.3-2.4 4.8-3.5 5.8-1.1-1-3.5-3.5-3.5-5.8C8.5 6.4 10.1 5 12 5zm0 2.2a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z',
  hotel:
    'M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z',
  venue:
    'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  area: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z',
};

type Props = {
  kind: string | null | undefined;
  size?: number;
  className?: string;
  style?: CSSProperties;
};

export function PlaceKindIcon({ kind, size = 18, className, style }: Props) {
  const d = PATHS[kind ?? ''] ?? PATHS.area;
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
