import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  model: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 1.8 13.5 4.8v6.4L8 14.2 2.5 11.2V4.8Z" />
      <path d="M2.7 4.9 8 7.9l5.3-3M8 7.9v6.1" />
    </Svg>
  ),
  source: (p: IconProps) => (
    <Svg {...p}>
      <ellipse cx="8" cy="3.8" rx="5" ry="2" />
      <path d="M3 3.8v8.4c0 1.1 2.2 2 5 2s5-.9 5-2V3.8M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
    </Svg>
  ),
  seed: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M2.5 6.2h11M2.5 9.8h11M6.2 2.5v11" />
    </Svg>
  ),
  snapshot: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 4.8V8l2.2 1.4" />
    </Svg>
  ),
  exposure: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="2.5" width="12" height="9" rx="1.5" />
      <path d="M5 13.5h6M5 9V7M8 9V5M11 9V6.5" />
    </Svg>
  ),
  metric: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2.5 12.5 6 8l2.6 2.4L13.5 4" />
      <path d="M10.5 4h3v3" />
    </Svg>
  ),
  semantic_model: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="4" cy="4.5" r="1.8" />
      <circle cx="12" cy="4.5" r="1.8" />
      <circle cx="8" cy="11.5" r="1.8" />
      <path d="M5.6 5.4 7 10M10.4 5.4 9 10M5.8 4.5h4.4" />
    </Svg>
  ),
  saved_query: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 2.5h6l2.5 2.5v8.5H4Z" />
      <path d="M6 8h4.5M6 10.5h3" />
    </Svg>
  ),
  analysis: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="7" cy="7" r="4.2" />
      <path d="m10.2 10.2 3.3 3.3" />
    </Svg>
  ),
  function: (p: IconProps) => (
    <Svg {...p}>
      <path d="M10.5 2.8c-2.5-.5-3 .8-3.3 2.6L6.2 11c-.3 1.6-1 2.6-3 2.2M4.6 6.6h5" />
    </Svg>
  ),
  search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.4 10.4 3.4 3.4" />
    </Svg>
  ),
  lineage: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="3" cy="4" r="1.6" />
      <circle cx="3" cy="12" r="1.6" />
      <circle cx="8" cy="8" r="1.8" />
      <circle cx="13.2" cy="8" r="1.6" />
      <path d="M4.5 4.6C6.5 5.5 6.4 7.6 6.3 7.8M4.5 11.4c2-.9 1.9-3 1.8-3.2M9.8 8h1.8" />
    </Svg>
  ),
  overview: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </Svg>
  ),
  health: (p: IconProps) => (
    <Svg {...p}>
      <path d="M1.8 8.4h3l1.6-3.6 2.6 6.6 1.7-3h3.5" />
    </Svg>
  ),
  sql: (p: IconProps) => (
    <Svg {...p}>
      <path d="m5 5.5-2.5 2.5L5 10.5M11 5.5l2.5 2.5-2.5 2.5M9 3.5 7 12.5" />
    </Svg>
  ),
  sun: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="8" cy="8" r="2.8" />
      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </Svg>
  ),
  moon: (p: IconProps) => (
    <Svg {...p}>
      <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" />
    </Svg>
  ),
  system: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="3" width="12" height="8.5" rx="1.5" />
      <path d="M6 13.5h4" />
    </Svg>
  ),
  up: (p: IconProps) => (
    <Svg {...p}>
      <path d="M10 3.5 5.5 8l4.5 4.5" />
    </Svg>
  ),
  down: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </Svg>
  ),
  expand: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 3v10M3 8h10" />
    </Svg>
  ),
  trace: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2 11c2.5 0 2.5-6 6-6s3.5 6 6 6" />
      <circle cx="2" cy="11" r="1" fill="currentColor" />
      <circle cx="14" cy="11" r="1" fill="currentColor" />
    </Svg>
  ),
  copy: (p: IconProps) => (
    <Svg {...p}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </Svg>
  ),
  hide: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z" />
      <path d="m2.5 13.5 11-11" />
    </Svg>
  ),
  eye: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z" />
      <circle cx="8" cy="8" r="1.8" />
    </Svg>
  ),
  focus: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" />
    </Svg>
  ),
  fit: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
    </Svg>
  ),
  columns: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M2.5 6h11M2.5 9.5h11" />
    </Svg>
  ),
  play: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4.5 3v10l8.5-5Z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  doc: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 1.8h5.5L12 4.3v9.9H4Z" />
      <path d="M6 7h4M6 9.5h4M6 12h2.5" />
    </Svg>
  ),
  impact: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      <circle cx="8" cy="8" r="4" />
      <circle cx="8" cy="8" r="6.4" strokeDasharray="1.6 2" />
    </Svg>
  ),
  undo: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5.5 3.5 2.5 6.5l3 3" />
      <path d="M2.8 6.5H10a3.5 3.5 0 0 1 0 7H7" />
    </Svg>
  ),
  redo: (p: IconProps) => (
    <Svg {...p}>
      <path d="m10.5 3.5 3 3-3 3" />
      <path d="M13.2 6.5H6a3.5 3.5 0 0 0 0 7h3" />
    </Svg>
  ),
  layout: (p: IconProps) => (
    <Svg {...p}>
      <rect x="1.8" y="3" width="4" height="3.4" rx="0.8" />
      <rect x="1.8" y="9.6" width="4" height="3.4" rx="0.8" />
      <rect x="10.2" y="6.3" width="4" height="3.4" rx="0.8" />
      <path d="M5.8 4.7c2.3 0 2 3.3 4.4 3.3M5.8 11.3c2.3 0 2-3.3 4.4-3.3" />
    </Svg>
  ),
  close: (p: IconProps) => (
    <Svg {...p}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </Svg>
  ),
  chevron: (p: IconProps) => (
    <Svg {...p}>
      <path d="m6 4 4 4-4 4" />
    </Svg>
  ),
  check: (p: IconProps) => (
    <Svg {...p}>
      <path d="m3.2 8.4 3 3 6.6-7" />
    </Svg>
  ),
  external: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V4.5A.5.5 0 0 1 3 4h3.5" />
    </Svg>
  ),
  download: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M2.5 13.5h11" />
    </Svg>
  ),
  keyboard: (p: IconProps) => (
    <Svg {...p}>
      <rect x="1.5" y="4" width="13" height="8.5" rx="1.5" />
      <path d="M4 6.6h.01M6.6 6.6h.01M9.3 6.6h.01M12 6.6h.01M4.6 9.8h6.8" />
    </Svg>
  ),
  path: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="3" cy="12.5" r="1.6" />
      <circle cx="13" cy="3.5" r="1.6" />
      <path d="M4.4 11.6 7 9.5V6.5l4.6-2.2" strokeDasharray="0" />
    </Svg>
  ),
  menu: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </Svg>
  ),
};

export function TypeIcon({ type, size = 15 }: { type: string; size?: number }) {
  const render = (Icon as Record<string, (p: IconProps) => ReactNode>)[type] ?? Icon.model;
  return <>{render({ size })}</>;
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <path
        d="M6 9c5.5 0 5.5 7 10 7M6 23c5.5 0 5.5-7 10-7M16 16h9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="6" cy="9" r="3.2" fill="var(--ln-color-upstream)" />
      <circle cx="6" cy="23" r="3.2" fill="var(--ln-color-upstream)" />
      <circle cx="16" cy="16" r="4.2" fill="var(--ln-color-accent)" />
      <circle cx="26.5" cy="16" r="3" fill="var(--ln-color-surface)" stroke="var(--ln-color-downstream)" strokeWidth="2.4" />
    </svg>
  );
}
