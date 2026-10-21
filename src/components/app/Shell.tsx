"use client";

// Phone: content + tab bar. Desktop (≥ 900px): sidebar + centred column. Same routes either way.
//
// The tab screens live here, not in their pages (which render nothing). A tab is mounted the first time it is
// visited and then kept, hidden, while another shows: switching is a pushState, with no route payload to fetch
// from Slate, and each tab keeps its scroll position and whatever it was in the middle of. Pages outside the tabs
// (/review/) still arrive as `children`. A screen can tell it is hidden with useTabVisible().

import { usePathname } from "next/navigation";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Button, Icon, Sidebar, SideNote, TabBar, TabVisible, type Section } from "@/components/ui";
import { clock } from "@/lib/journal";
import { isDevIdentity } from "@/lib/catalyst";
import { Activity } from "./Activity";
import { Food } from "./Food";
import { InsightsScreen } from "./Insights";
import { useJournal } from "./Journal";
import { JournalScreen } from "./JournalScreen";
import { useSession } from "./Session";
import { SettingsScreen } from "./Settings";
import { PATHS, tabOf, TabsGo } from "./tabs";
import { Today } from "./Today";
import a from "./app.module.css";

// memo: the screens take no props, so a tab switch (which re-renders Shell) re-renders only the two screens whose
// TabVisible changed, and whatever reads it, instead of every mounted screen.
const SCREENS: Record<Section, ComponentType> = { today: memo(Today), journal: memo(JournalScreen), food: memo(Food), activity: memo(Activity), insights: memo(InsightsScreen), settings: memo(SettingsScreen) };
const ORDER = Object.keys(SCREENS) as Section[];

const noop = () => undefined;

export function Shell({ children }: { children: ReactNode }) {
  const tab = tabOf(usePathname());
  const { me } = useSession();
  const journal = useJournal();

  // Mounted on first visit, kept after (adjusting state during render, so the new tab mounts in the same pass).
  const [mounted, setMounted] = useState<Section[]>(() => (tab ? [tab] : []));
  if (tab && !mounted.includes(tab)) setMounted([...mounted, tab]);

  // A tap cross-fades the switch where the browser can (Safari 18+, Chromium) and motion is welcome. The new view
  // is captured once React has shown the tab: the layout effect below resolves `landed`, or the guard does.
  const landed = useRef<(() => void) | null>(null);
  const go = useCallback((s: Section) => {
    navigator.vibrate?.(10); // Android; iOS Safari has no vibration API
    if (window.location.pathname === PATHS[s]) return;
    const push = () => window.history.pushState(null, "", PATHS[s]);
    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return push();
    document.startViewTransition(() => new Promise<void>((done) => {
      landed.current = done;
      window.setTimeout(done, 300);
      push();
    }));
  }, []);

  // One window scroll, many screens: remember each tab's position and put it back when the tab shows again.
  // The ref names the showing tab before scrollTo, so the scroll event that follows is filed under the right one.
  const scrolls = useRef<Partial<Record<Section, number>>>({});
  const showing = useRef(tab);
  useEffect(() => {
    const save = () => { const t = showing.current; if (t) scrolls.current[t] = window.scrollY; };
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, []);
  useLayoutEffect(() => {
    showing.current = tab;
    window.scrollTo(0, (tab && scrolls.current[tab]) || 0);
    landed.current?.();
    landed.current = null;
  }, [tab]);

  // iOS Safari only applies :active to a touch when some touchstart listener exists; without it no press shows.
  useEffect(() => {
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);

  // Outside the tabs (/review/), the sidebar and tab bar mark Today, as they always have.
  const current = tab ?? "today";
  return (
    <TabsGo.Provider value={go}>
      <div className={a.shell}>
        <Sidebar
          className={a.sidebar}
          current={current}
          onSelect={go}
          footer={<>
            <Button variant={journal.recording ? "danger" : "journal"} block onClick={() => journal.toggleRecording(null)}>
              <Icon name="mic" />{journal.recording ? `Stop · ${clock(journal.seconds)}` : "Record an entry"}
            </Button>
            <SideNote>{me.email}<br />{me.profile.role === "admin" ? "Admin" : "Member"}{isDevIdentity ? " · dev identity" : ""}</SideNote>
          </>}
        />
        <div className={a.content}>
          {ORDER.filter((s) => mounted.includes(s)).map((s) => {
            const Screen = SCREENS[s];
            return (
              <div key={s} hidden={s !== tab}>
                <TabVisible.Provider value={s === tab}><Screen /></TabVisible.Provider>
              </div>
            );
          })}
          {!tab && children}
        </div>
        <TabBar className={a.tabbar} current={current} onSelect={go} />
      </div>
    </TabsGo.Provider>
  );
}

/** Stand-in for a section that has not been built yet. */
export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className={a.page}>
      <div className={a.pageHead}><span className={`d ${a.pageTitle}`}>{title}</span></div>
      <p className="muted">{note}</p>
    </div>
  );
}
