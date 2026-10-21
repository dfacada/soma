"use client";

// Phone: content + tab bar. Desktop (≥ 900px): sidebar + centred column. Same routes either way.

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button, Icon, Sidebar, SideNote, TabBar, type Section } from "@/components/ui";
import { clock } from "@/lib/journal";
import { isDevIdentity } from "@/lib/catalyst";
import { useJournal } from "./Journal";
import { useSession } from "./Session";
import a from "./app.module.css";

const PATHS: Record<Section, string> = { today: "/", journal: "/journal/", food: "/food/", activity: "/activity/", insights: "/insights/", settings: "/settings/" };

function sectionOf(pathname: string): Section {
  const first = pathname.split("/").filter(Boolean)[0] as Section | undefined;
  return first && first in PATHS ? first : "today";
}

const noop = () => undefined;

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const routed = sectionOf(usePathname());
  const { me } = useSession();
  const journal = useJournal();
  // The tapped section lights up at once; the route follows when its payload arrives. Any route change (the tap
  // landing, Back, a link elsewhere) drops it, so the routed section takes over again.
  const [pending, setPending] = useState<{ to: Section; from: Section } | null>(null);
  const [seen, setSeen] = useState(routed);
  if (seen !== routed) { setSeen(routed); setPending(null); }
  const current = pending && pending.from === routed ? pending.to : routed;
  const go = (s: Section) => {
    navigator.vibrate?.(10); // Android; iOS Safari has no vibration API
    setPending({ to: s, from: routed });
    router.push(PATHS[s]);
  };

  // iOS Safari only applies :active to a touch when some touchstart listener exists; without it no press shows.
  useEffect(() => {
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);

  return (
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
      <div className={a.content}>{children}</div>
      <TabBar className={a.tabbar} current={current} onSelect={go} />
    </div>
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
