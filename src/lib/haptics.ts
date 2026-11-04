// A tick you can feel when something is done (David, 2026-11-03: "a unique experience that's efficient"): confirm a
// tap without having to look. Android has navigator.vibrate. iPhone has no vibration API, but since iOS 18 toggling a
// switch-style checkbox plays the system haptic, so a hidden one is toggled through its label. Both only work inside
// the tap that caused them, and both fail silently everywhere else: this is a nicety, never something to rely on.

const iOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** "tap" for a press that changed something; "done" for finishing a task (two ticks where the platform can). */
export function haptic(kind: "tap" | "done" = "tap") {
  if (typeof window === "undefined") return;
  try {
    if (!iOS() && typeof navigator.vibrate === "function") {
      navigator.vibrate(kind === "done" ? [10, 60, 18] : 10);
      return;
    }
    if (!iOS()) return;
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  } catch {
    /* no haptics here: nothing to tell anyone */
  }
}
