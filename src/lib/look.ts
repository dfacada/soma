// Theme (light / dark / follow the system) and accent palette. The choice lives in the account's settings; a copy is
// kept in localStorage so the very first paint, the sign-in screen and the public pages already wear it.
// The colours themselves are all in src/app/globals.css: this file only flips two attributes on <html>.

export type ThemeMode = "light" | "dark" | "system";
export const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];

/** `hues` are journal, food, activity: shown as the three dots on the picker. Keep in step with globals.css. */
export const PALETTES = [
  { id: "soma", name: "Soma", note: "Indigo, green, amber", hues: ["#5F5BBF", "#2C8A5E", "#B7692A"] },
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
export function applyLook(theme: ThemeMode, palette: PaletteId) {
  const root = document.documentElement;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  if (palette === "soma") delete root.dataset.palette; else root.dataset.palette = palette;
  try { localStorage.setItem(STORE, JSON.stringify({ theme, palette })); } catch { /* private window */ }
  const bone = getComputedStyle(root).getPropertyValue("--bone").trim();
  if (bone) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", bone));
}

/** Runs inline at the top of <body>, before anything paints. Must stay dependency-free and must never throw. */
export const LOOK_SCRIPT = `try{var l=JSON.parse(localStorage.getItem("${STORE}")||"{}"),r=document.documentElement;` +
  `r.dataset.theme=(l.theme==="dark"||(l.theme==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))?"dark":"light";` +
  `if(l.palette&&l.palette!=="soma")r.dataset.palette=l.palette}catch(e){}`;
