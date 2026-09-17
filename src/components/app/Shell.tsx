"use client";

// Phone: content + tab bar. Desktop (≥ 900px): sidebar + centred column. Same routes either way.

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar, SideNote, TabBar, type Section } from "@/components/ui";
import { isDevIdentity } from "@/lib/catalyst";
import { useSession } from "./Session";
import a from "./app.module.css";

const PATHS: Record<Section, string> = { today: "/", journal: "/journal/", food: "/food/", activity: "/activity/", insights: "/insights/", settings: "/settings/" };

function sectionOf(pathname: string): Section {
  const first = pathname.split("/").filter(Boolean)[0] as Section | undefined;
  return first && first in PATHS ? first : "today";
}

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const current = sectionOf(usePathname());
  const { me } = useSession();
  const go = (s: Section) => router.push(PATHS[s]);

  return (
    <div className={a.shell}>
      <Sidebar
        className={a.sidebar}
        current={current}
        onSelect={go}
        footer={<SideNote>{me.email}<br />{me.profile.role === "admin" ? "Admin" : "Member"}{isDevIdentity ? " · dev identity" : ""}</SideNote>}
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
