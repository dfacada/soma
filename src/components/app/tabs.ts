"use client";

// The tab sections, their URLs, and how a screen asks Shell to switch tab. Kept apart from Shell because Shell
// renders the screens, and a screen importing Shell would be a cycle.

import { createContext, useContext } from "react";
import type { Section } from "@/components/ui";

export const PATHS: Record<Section, string> = { today: "/", journal: "/journal/", food: "/food/", activity: "/activity/", insights: "/insights/", settings: "/settings/" };

/** The tab a pathname belongs to, or null for a page outside the tabs (/review/). */
export function tabOf(pathname: string): Section | null {
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first) return "today";
  return first in PATHS ? (first as Section) : null;
}

/** Switch tab without a network round trip: Shell keeps the screens mounted and only the URL changes. */
export const TabsGo = createContext<(s: Section) => void>(() => undefined);
export const useGoTab = () => useContext(TabsGo);
