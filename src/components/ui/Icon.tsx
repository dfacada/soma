import type { ReactNode } from "react";

// Icon paths lifted from the prototype. 24-unit grid, 1.75 stroke, round caps; colour comes from currentColor.
const PATHS = {
  today: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <circle cx="12" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3M8 21h8" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14Z" />
      <path d="M5 19l8-8" />
    </>
  ),
  barbell: <path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12" />,
  spark: <path d="M3 17l5-6 4 4 5-8 4 3" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  check: <path d="M5 12l5 5 9-10" />,
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  pause: <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" stroke="none" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  breakfast: (
    <>
      <path d="M4 17h16" />
      <path d="M8 13a4 4 0 0 1 8 0" />
      <path d="M12 5v2M6 8l1.5 1.5M18 8l-1.5 1.5" />
    </>
  ),
  lunch: (
    <>
      <path d="M3 12h18c0 4-3 8-9 8s-9-4-9-8z" />
      <path d="M9 8c0-2 1-2 1-4M14 8c0-2 1-2 1-4" />
    </>
  ),
  snack: (
    <>
      <path d="M12 8c-3-3-8-1-8 4 0 5 4 9 8 9s8-4 8-9c0-5-5-7-8-4z" />
      <path d="M12 8V5" />
      <path d="M12 5c1-1.5 3-1.5 4-1" />
    </>
  ),
  dinner: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
    </>
  ),
  walk: (
    <>
      <path d="M8 3c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z" />
      <path d="M16 11c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z" />
    </>
  ),
  // A figure mid-stride (the prototype's was a stopwatch, which nobody read as running).
  run: (
    <>
      <circle cx="15.5" cy="4.5" r="2" />
      <path d="M14 8l-3 5.5" />
      <path d="M13.5 9l3 2 2.5-1.5M13.5 9H10l-2 2.5" />
      <path d="M11 13.5l3.5 2.5-1 4.5M11 13.5l-2 3.5H5" />
    </>
  ),
  // The moves a person can choose (src/lib/moves.ts), from the activities mock-up (2026-11-08). `walk` above is
  // footprints, which is Steps; a walk is the figure.
  pushup: (
    <>
      <path d="M3 17h18" />
      <path d="M5 13h10l3-3" />
      <circle cx="19.5" cy="7.5" r="1.6" />
      <path d="M8 13v4M13 13v4" />
    </>
  ),
  walker: (
    <>
      <circle cx="12.5" cy="4.5" r="1.8" />
      <path d="M12.5 8l-2 5.5 3 3 1 4.5" />
      <path d="M10.5 13.5L8 16" />
      <path d="M13 9.5l3 2.5" />
    </>
  ),
  cycle: (
    <>
      <circle cx="5.5" cy="16" r="3.5" />
      <circle cx="18.5" cy="16" r="3.5" />
      <path d="M5.5 16l4-7h5l4 7" />
      <path d="M9.5 9l3 7" />
      <path d="M13 6h3" />
    </>
  ),
  yoga: (
    <>
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M12 8v6" />
      <path d="M5 10.5c2 1.5 4.5 2.2 7 2.2s5-.7 7-2.2" />
      <path d="M6.5 19.5c1.6-2.2 3.4-3.3 5.5-3.3s3.9 1.1 5.5 3.3" />
    </>
  ),
  swim: (
    <>
      <circle cx="16.5" cy="6.5" r="1.8" />
      <path d="M5.5 12l4-3.5 3.5 2" />
      <path d="M2.5 15.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" />
      <path d="M2.5 19.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.6 2.4 2.6 14.6 0 17" />
      <path d="M12 3.5c-2.6 2.4-2.6 14.6 0 17" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  scale: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M8.5 10.5a4 4 0 0 1 7 0" />
      <path d="M12 10.5l1.6-2.2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  // The streak.
  flame: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.3-5.3 3.6-7.6.4 1.8 1.4 2.9 2.6 3.4-.2-3.2 1.2-6 3.8-7.6-.3 3.4 3 5.6 3 10.3 0 4.1-2.8 7.7-6.5 7.7z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  pulse: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  // Tomorrow's brief: the evening it is read in, building it again, sending it on, going into it, and a task.
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />,
  send: <path d="M4 12l16-8-6 16-2.5-6.5L4 12zM11.5 13.5L20 4" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  task: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

type Props = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Set when the icon is the only content of a control. Otherwise it is decorative and hidden. */
  label?: string;
};

export function Icon({ name, size = 18, strokeWidth = 1.75, label }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PATHS[name]}
    </svg>
  );
}
