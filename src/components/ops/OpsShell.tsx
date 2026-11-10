"use client";

// Dayhub Ops' frame: the nav (a sidebar from 900px, a row of tabs on a phone), the person search, the environment pill,
// and the counts on Issues and Support. Only admins get past it; every route behind it checks the role again.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/lib/api";
import { report } from "@/lib/log";
import { initial, zone, type Badges } from "@/lib/ops";
import { Icon, Toast, type IconName } from "@/components/ui";
import { useSession } from "@/components/app/Session";
import o from "./ops.module.css";

type Ops = { badges: Badges | null; refresh: () => void; say: (m: string) => void };
const Ctx = createContext<Ops | null>(null);
export function useOps() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOps outside <OpsShell>");
  return v;
}

const NAV: { href: string; label: string; icon: IconName; badge?: "needs" | "unanswered" }[] = [
  { href: "/ops/", label: "Overview", icon: "grid" },
  { href: "/ops/issues/", label: "Issues", icon: "inbox", badge: "needs" },
  { href: "/ops/people/", label: "People", icon: "user" },
  { href: "/ops/errors/", label: "Errors", icon: "alert" },
  { href: "/ops/support/", label: "Support", icon: "chat", badge: "unanswered" },
  { href: "/ops/audit/", label: "Audit", icon: "doc" },
];

export function OpsShell({ children }: { children: ReactNode }) {
  const { me, displayName } = useSession();
  const path = usePathname() || "/ops/";
  const router = useRouter();
  const [badges, setBadges] = useState<Badges | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const refresh = useCallback(() => {
    void api<Badges>("GET", `/ops/badges?tz=${encodeURIComponent(zone())}`).then(setBadges, (e) => report("ops", "badges_failed", e, undefined, "warn"));
  }, []);
  useEffect(() => { if (me.profile.role === "admin") refresh(); }, [me.profile.role, refresh]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 3200); return () => window.clearTimeout(t); }, [toast]);
  useEffect(() => { document.title = "Dayhub Ops"; }, []);

  const value = useMemo<Ops>(() => ({ badges, refresh, say: setToast }), [badges, refresh]);

  if (me.profile.role !== "admin") {
    return (
      <main className={`${o.ops} ${o.center}`}>
        <span className="d" style={{ fontSize: 28 }}>Dayhub Ops is for admins</span>
        <p className="muted">This is where Dayhub is run. Your own days are in the app.</p>
        <Link href="/" className={o.lnk}>Back to Dayhub</Link>
      </main>
    );
  }

  const find = (e: FormEvent) => {
    e.preventDefault();
    const t = q.trim();
    if (!t) return;
    router.push(`/ops/people/?q=${encodeURIComponent(t)}`);
  };
  const on = (href: string) => (href === "/ops/" ? path === "/ops/" || path === "/ops" : path.startsWith(href) || (href === "/ops/people/" && path.startsWith("/ops/person")));
  const live = badges?.env === "Production";

  return (
    <Ctx.Provider value={value}>
      <div className={o.ops}>
        <div className={o.frame}>
          <nav aria-label="Dayhub Ops" className={o.nav}>
            <div className={o.brand}>
              <span className={o.brandName}>Dayhub Ops</span>
              {badges?.env && <span className={`${o.env} ${live ? o.envLive : ""}`}>{live ? "Live" : "Dev"}</span>}
            </div>
            {NAV.map((n) => {
              const count = n.badge && badges ? badges[n.badge] : 0;
              return (
                <Link key={n.href} href={n.href} className={`${o.navItem} ${on(n.href) ? o.navOn : ""}`} aria-current={on(n.href) ? "page" : undefined}>
                  <Icon name={n.icon} size={18} />{n.label}
                  {count > 0 && <span className={n.badge === "needs" ? o.badge : o.badgeQuiet}>{count}</span>}
                </Link>
              );
            })}
            <div className={o.navFoot}>
              <div className={o.owner}>
                <span className={o.ownerDot} aria-hidden="true">{initial(displayName, me.email)}</span>
                <span className={o.ownerName}><span>{displayName || me.email}</span><span className="m muted" style={{ fontSize: 10 }}>admin</span></span>
              </div>
              <Link href="/" className={o.back}>Back to Dayhub</Link>
            </div>
          </nav>
          <main className={o.main}>
            <div className={o.top}>
              <form className={o.search} role="search" onSubmit={find}>
                <Icon name="search" size={16} />
                <input aria-label="Find a person" placeholder="Find a person by name, email or id" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
              </form>
            </div>
            {children}
          </main>
        </div>
        <Toast message={toast} />
      </div>
    </Ctx.Provider>
  );
}
