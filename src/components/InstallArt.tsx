// The pictures on /install/: a phone, drawn, showing where each button is.
//
// Drawings and not screenshots on purpose: iOS and Android chrome cannot be captured from here, and a drawing
// stays right when a phone's wallpaper or a browser's paint changes. They are inline SVG, so they weigh nothing,
// follow the theme through the same tokens as the app, and stay sharp on any screen. Nothing here copies an
// Apple or Google asset: the icons are plain shapes with the same meaning, and every one is labelled in words too.
//
// If David sends real screenshots from his iPhone, they drop in here in place of the `Art` pieces.

import s from "./install.module.css";

const INK = "var(--ink)", HAIR = "var(--hairline)", MUTED = "var(--muted)", MARK = "var(--journal)", BONE = "var(--bone)", SURF = "var(--surface)";

/** A phone: body, screen, and whatever the step draws inside it. The screen box is 12,20 → 108,196. */
function Phone({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 120 216" className={s.art} role="img" aria-label={label}>
      <rect x="1" y="1" width="118" height="214" rx="16" fill={SURF} stroke={HAIR} strokeWidth="1.5" />
      <rect x="9" y="9" width="102" height="198" rx="10" fill={BONE} />
      {children}
    </svg>
  );
}

/** The ring that says "this one". */
const Mark = ({ x, y, r = 13 }: { x: number; y: number; r?: number }) => (
  <circle cx={x} cy={y} r={r} fill="none" stroke={MARK} strokeWidth="2" />
);

/** Lines standing in for a page of text. */
function Lines({ y, count = 5 }: { y: number; count?: number }) {
  return <>{Array.from({ length: count }, (_, i) => (
    <rect key={i} x="20" y={y + i * 11} width={i % 3 === 2 ? 50 : 80} height="4" rx="2" fill={HAIR} />
  ))}</>;
}

/** iOS step 1: Safari's bottom bar, with the Share button ringed. */
export function IosShare() {
  return (
    <Phone label="An iPhone in Safari. The Share button, a square with an arrow pointing up, sits in the bar at the bottom of the screen.">
      <rect x="20" y="22" width="80" height="8" rx="4" fill={HAIR} />
      <Lines y={44} />
      <rect x="9" y="168" width="102" height="39" rx="10" fill={SURF} />
      <line x1="9" y1="168" x2="111" y2="168" stroke={HAIR} />
      {/* share: a box with an arrow leaving it */}
      <path d="M55 194v-14h12v14" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M61 186v-13m0-13 -5 6m5-6 5 6" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 6)" />
      <Mark x={61} y={187} />
      <text x="60" y="163" textAnchor="middle" fontSize="8" fill={MUTED}>Share</text>
    </Phone>
  );
}

/** iOS step 2: the share sheet, with Add to Home Screen ringed. */
export function IosAdd() {
  return (
    <Phone label="The iPhone share sheet. Scroll down the list of actions to Add to Home Screen.">
      <rect x="9" y="66" width="102" height="141" rx="12" fill={SURF} />
      <rect x="48" y="72" width="24" height="3" rx="1.5" fill={HAIR} />
      <rect x="18" y="84" width="46" height="5" rx="2.5" fill={HAIR} />
      {[["Copy"], ["Add to Home", "Screen"], ["Add Bookmark"]].map((row, i) => (
        <g key={row[0]}>
          <line x1="18" y1={102 + i * 28} x2="102" y2={102 + i * 28} stroke={HAIR} />
          <text x="18" y={i === 1 ? 140 : 118 + i * 28} fontSize="7.5" fill={i === 1 ? INK : MUTED} fontWeight={i === 1 ? 600 : 400}>
            {row.map((line, j) => <tspan key={line} x="18" dy={j === 0 ? 0 : 9}>{line}</tspan>)}
          </text>
          {i === 1
            ? <><rect x="90" y={108 + i * 28} width="11" height="11" rx="3" fill="none" stroke={INK} strokeWidth="1.5" /><path d="M95.5 111v6M92.5 114h6" stroke={INK} strokeWidth="1.5" strokeLinecap="round" /></>
            : <rect x="90" y={109 + i * 28} width="11" height="9" rx="2" fill="none" stroke={HAIR} strokeWidth="1.5" />}
        </g>
      ))}
      <rect x="14" y={100 + 28} width="92" height="26" rx="7" fill="none" stroke={MARK} strokeWidth="2" />
    </Phone>
  );
}

/** Android step 1: Chrome's top bar, with the three-dot menu ringed. */
export function AndroidMenu() {
  return (
    <Phone label="An Android phone in Chrome. The menu is the three dots at the top right.">
      <rect x="9" y="9" width="102" height="30" rx="10" fill={SURF} />
      <rect x="18" y="20" width="60" height="8" rx="4" fill={HAIR} />
      <circle cx="96" cy="17" r="1.8" fill={INK} /><circle cx="96" cy="24" r="1.8" fill={INK} /><circle cx="96" cy="31" r="1.8" fill={INK} />
      <Mark x={96} y={24} r={11} />
      <Lines y={56} />
    </Phone>
  );
}

/** Android step 2: the menu open, with Add to Home screen ringed. */
export function AndroidAdd() {
  return (
    <Phone label="The Chrome menu open on Android, showing Add to Home screen, which may say Install app.">
      <rect x="9" y="9" width="102" height="30" rx="10" fill={SURF} />
      <rect x="18" y="20" width="60" height="8" rx="4" fill={HAIR} />
      <rect x="46" y="34" width="62" height="96" rx="8" fill={SURF} stroke={HAIR} />
      {[["New tab"], ["Add to Home", "screen"], ["Downloads"], ["Settings"]].map((row, i) => (
        <text key={row[0]} x="54" y={52 + i * 22} fontSize="7.5" fill={i === 1 ? INK : MUTED} fontWeight={i === 1 ? 600 : 400}>
          {row.map((line, j) => <tspan key={line} x="54" dy={j === 0 ? 0 : 9}>{line}</tspan>)}
        </text>
      ))}
      <rect x="50" y={44 + 22} width="54" height="22" rx="6" fill="none" stroke={MARK} strokeWidth="2" />
      <Lines y={140} count={3} />
    </Phone>
  );
}

/** The result, on either phone: Soma sitting on the Home Screen. */
export function OnHomeScreen() {
  const tile = (x: number, y: number) => <rect x={x} y={y} width="22" height="22" rx="6" fill={HAIR} opacity="0.7" />;
  return (
    <Phone label="A phone Home Screen with the Soma icon among the other apps.">
      {tile(20, 40)}{tile(50, 40)}{tile(80, 40)}
      {/* Soma: the day ring on bone, as the real icon is */}
      <rect x="20" y="76" width="22" height="22" rx="6" fill={BONE} stroke={HAIR} />
      <circle cx="31" cy="87" r="6.5" fill="none" stroke={HAIR} strokeWidth="2.5" />
      <path d="M31 80.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke={MARK} strokeWidth="2.5" strokeLinecap="round" />
      <text x="31" y="106" textAnchor="middle" fontSize="6" fill={INK}>Soma</text>
      {tile(50, 76)}{tile(80, 76)}
      {tile(20, 118)}{tile(50, 118)}{tile(80, 118)}
      <rect x="20" y="170" width="82" height="28" rx="10" fill={SURF} opacity="0.8" transform="translate(-1 0)" />
      {tile(24, 173)}{tile(52, 173)}{tile(80, 173)}
    </Phone>
  );
}
