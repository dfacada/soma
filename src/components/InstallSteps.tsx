"use client";

// The words and pictures for adding Soma to a Home Screen, in one place: the public page (/install/, for the link
// David emails) and the splash inside the app (components/app/InstallSplash.tsx) show the same thing.

import { useSyncExternalStore } from "react";
import { AndroidAdd, AndroidMenu, IosAdd, IosShare, OnHomeScreen } from "./InstallArt";

export const SOMA_URL = "soma-onkasary.onslate.com";
export type Which = "ios" | "android" | "desktop";

export const STEPS: Record<Which, { title: string; note: string; steps: string[] }> = {
  ios: {
    title: "iPhone and iPad",
    note: "Use Safari. Other browsers on iPhone cannot add an app that receives Soma's evening reminder.",
    steps: [
      `Open Safari and go to ${SOMA_URL}.`,
      "Tap the Share button: the square with an arrow pointing up, at the bottom of the screen (at the top on an iPad).",
      "Scroll down the list and tap Add to Home Screen.",
      "Tap Add, at the top right. Soma is now on your Home Screen like any other app.",
      "Open Soma from the Home Screen icon and sign in there.",
    ],
  },
  android: {
    title: "Android",
    note: "Chrome, Samsung Internet and most other Android browsers all work.",
    steps: [
      `Open Chrome and go to ${SOMA_URL}.`,
      "Tap the three dots at the top right.",
      "Tap Add to Home screen (it may say Install app).",
      "Tap Install, or Add, to confirm.",
      "Open Soma from the Home Screen icon and sign in there.",
    ],
  },
  desktop: {
    title: "Mac and Windows",
    note: "Optional. Soma works in any browser tab; installing it just gives it its own window.",
    steps: [
      `Open Chrome or Edge and go to ${SOMA_URL}.`,
      "Look for the install icon at the right of the address bar, a screen with a downward arrow.",
      "Click it, then click Install.",
      "On a Mac in Safari, use File, then Add to Dock.",
    ],
  },
};

/** The pictures beside each platform's steps: the button to look for, then the result. */
export const ART: Record<Which, { art: React.ReactNode; caption: string }[]> = {
  ios: [
    { art: <IosShare />, caption: "1. Share, in the bottom bar" },
    { art: <IosAdd />, caption: "2. Add to Home Screen" },
    { art: <OnHomeScreen />, caption: "3. Soma, on your Home Screen" },
  ],
  android: [
    { art: <AndroidMenu />, caption: "1. The three dots, top right" },
    { art: <AndroidAdd />, caption: "2. Add to Home screen" },
    { art: <OnHomeScreen />, caption: "3. Soma, on your Home Screen" },
  ],
  desktop: [],
};

/** True when Soma is already running from a Home Screen icon or an installed window. */
export function installed(): boolean {
  if (typeof window === "undefined") return false;
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios || window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: window-controls-overlay)").matches;
}

function guess(): Which {
  if (typeof navigator === "undefined") return "ios";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

// The device never changes while the page is open, so there is nothing to subscribe to and one cached answer.
const subscribe = () => () => undefined;
let cached: Which | null = null;
const device = () => (cached ||= guess());

/** The device this is being read on, or null in the exported HTML, which has no device. */
export const useDevice = () => useSyncExternalStore(subscribe, device, () => null);
/** For code outside a component (the splash decides before it renders anything). */
export const deviceNow = device;
