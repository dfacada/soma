// Theme (Night / Light / follow the system), accent palette and motion. The choice lives in the account's settings;
// a copy is kept in localStorage so the very first paint, the sign-in screen and the public pages already wear it.
// The colours themselves are all in src/app/globals.css: this file only flips attributes on <html>.

/** "dark" is Night, the default since 2026-11-02. The stored name stayed "dark" so nobody's choice had to move. */
export type ThemeMode = "light" | "dark" | "system";
export const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];

/** Lively springs and loops; Calm keeps every move but drops the overshoot and the endless ones. */
export type MotionMode = "lively" | "calm";
export const MOTION_MODES: MotionMode[] = ["lively", "calm"];

/** `hues` are journal, food, activity: shown as the three dots on the picker. Keep in step with globals.css. Night
 *  lights a palette's hues toward white there, and the picker mixes its dots the same way; Soma's own Night hues are
 *  picked by hand instead, so `night` lists them. */
export const PALETTES = [
  { id: "soma", name: "Soma", note: "Indigo, green, amber", hues: ["#5F5BBF", "#2C8A5E", "#B7692A"], night: ["#8F8AF7", "#4BCF93", "#F39A57"] },
  { id: "organic", name: "Organic", note: "Muted sage and plum", hues: ["#7D6B8A", "#6F7A52", "#A8703A"] },
  { id: "macrofactor", name: "MacroFactor", note: "Malibu blue", hues: ["#7A5FD0", "#3F7FE8", "#DD6F45"] },
  { id: "balance", name: "Balance", note: "Sea glass and teal", hues: ["#4F6FA8", "#2E9C95", "#CF7443"] },
  { id: "basecamp", name: "Basecamp", note: "Honey yellow", hues: ["#5B6472", "#B08A0E", "#C8642B"] },
  { id: "bear", name: "Bear", note: "Clay red and plum", hues: ["#7C2D52", "#C0564C", "#B8792E"] },
  { id: "behance", name: "Behance", note: "Electric blue", hues: ["#7A4FE0", "#3D6DEB", "#E0564B"] },
] as const;
export type PaletteId = (typeof PALETTES)[number]["id"];
export const isPalette = (v: unknown): v is PaletteId => PALETTES.some((p) => p.id === v);

const STORE = "soma-look";

/** Sets the attributes, remembers the choice for the next cold start, and recolours the browser chrome. */
export function applyLook(theme: ThemeMode, palette: PaletteId, motion: MotionMode) {
  const root = document.documentElement;
  const light = theme === "light" || (theme === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = light ? "light" : "dark";
  if (palette === "soma") delete root.dataset.palette; else root.dataset.palette = palette;
  if (motion === "calm") root.dataset.motion = "calm"; else delete root.dataset.motion;
  try { localStorage.setItem(STORE, JSON.stringify({ theme, palette, motion })); } catch { /* private window */ }
  const bone = getComputedStyle(root).getPropertyValue("--bone").trim();
  if (bone) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", bone));
}

/** Runs inline at the top of <body>, before anything paints. Must stay dependency-free and must never throw.
 *  Nothing stored (a first visit) means Night, so nobody sees a flash of light first. */
export const LOOK_SCRIPT = `var r=document.documentElement;r.dataset.theme="dark";try{var l=JSON.parse(localStorage.getItem("${STORE}")||"{}");` +
  `if(l.theme==="light"||(l.theme==="system"&&!matchMedia("(prefers-color-scheme: dark)").matches))r.dataset.theme="light";` +
  `if(l.palette&&l.palette!=="soma")r.dataset.palette=l.palette;if(l.motion==="calm")r.dataset.motion="calm"}catch(e){}`;
