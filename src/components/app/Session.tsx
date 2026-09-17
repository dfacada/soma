"use client";

// Gate for every signed-in screen: resolves the Catalyst session, the profile (approval) and the settings,
// and renders the right thing for each state. Children only mount when the user is active.

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, type Me } from "@/lib/api";
import { catalystAuth, currentUser, isDevIdentity } from "@/lib/catalyst";
import { mergeSettings, type Settings } from "@/lib/settings";
import { Button, Input } from "@/components/ui";
import a from "./app.module.css";

type Session = {
  me: Me;
  displayName: string;
  settings: Settings;
  /** Optimistic: updates local state now, saves in the background, reverts and rethrows on failure. */
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  saveDisplayName: (name: string) => Promise<void>;
  signOut: () => void;
};

const Ctx = createContext<Session | null>(null);
export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside <SessionGate>");
  return s;
}

// What the server last accepted for this user, so a partial save never resends defaults as if they were chosen.
// Module-level on purpose: there is one session per page, and it is not render state.
let stored: Record<string, unknown> = {};

type State =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "blocked"; me: Me }
  | { kind: "error"; message: string }
  | { kind: "ready"; me: Me };

type Resolved = Exclude<State, { kind: "loading" | "ready" }> | { kind: "ready"; me: Me; displayName: string; stored: Record<string, unknown> };

/** Catalyst session → profile (approval) → settings. Plain async: no React state in here. */
async function resolveSession(): Promise<Resolved> {
  try {
    if (!isDevIdentity && !(await currentUser())) return { kind: "signedOut" };
    const me = await api<Me>("GET", "/me");
    if (me.profile.status !== "active") return { kind: "blocked", me };
    const s = await api<{ displayName: string; settings: Record<string, unknown> }>("GET", "/settings");
    return { kind: "ready", me, displayName: s.displayName || me.name || "", stored: s.settings || {} };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { kind: "signedOut" };
    return { kind: "error", message: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export function SessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [displayName, setDisplayName] = useState("");

  const apply = useCallback((r: Resolved) => {
    if (r.kind === "ready") {
      stored = r.stored;
      setSettings(mergeSettings(r.stored));
      setDisplayName(r.displayName);
      setState({ kind: "ready", me: r.me });
    } else setState(r);
  }, []);

  useEffect(() => {
    let alive = true;
    void resolveSession().then((r) => { if (alive) apply(r); });
    return () => { alive = false; };
  }, [apply]);

  const load = useCallback(() => { setState({ kind: "loading" }); void resolveSession().then(apply); }, [apply]);

  const signOut = useCallback(() => {
    if (isDevIdentity) return;
    void catalystAuth().then((auth) => auth.signOut(window.location.origin + "/"));
  }, []);

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const before = settings;
    const beforeStored = stored;
    stored = { ...stored, ...patch };
    setSettings((cur) => (cur ? { ...cur, ...patch } : cur));
    try {
      await api("PUT", "/settings", { settings: stored });
    } catch (e) {
      stored = beforeStored;
      setSettings(before);
      throw e;
    }
  }, [settings]);

  const saveDisplayName = useCallback(async (name: string) => {
    await api("PUT", "/settings", { displayName: name });
    setDisplayName(name.trim());
  }, []);

  const value = useMemo<Session | null>(
    () => (state.kind === "ready" && settings ? { me: state.me, displayName, settings, saveSettings, saveDisplayName, signOut } : null),
    [state, settings, displayName, saveSettings, saveDisplayName, signOut],
  );

  if (value) return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  if (state.kind === "signedOut") return <SignIn />;
  if (state.kind === "blocked") return <Blocked me={state.me} onRetry={load} onSignOut={signOut} />;
  if (state.kind === "error") {
    return (
      <Centered>
        <span className="d" style={{ fontSize: 28 }}>Can&apos;t reach Soma</span>
        <p className="muted">{state.message}</p>
        <Button onClick={load}>Try again</Button>
      </Centered>
    );
  }
  return <Centered><span className={`d ${a.wordmark}`}>Soma</span><span className="eb">Loading</span></Centered>;
}

function Centered({ children }: { children: ReactNode }) {
  return <main className={a.centered}>{children}</main>;
}

function Blocked({ me, onRetry, onSignOut }: { me: Me; onRetry: () => void; onSignOut: () => void }) {
  const disabled = me.profile.status === "disabled";
  return (
    <Centered>
      <span className="eb">{me.email}</span>
      <span className="d" style={{ fontSize: 30 }}>{disabled ? "Account disabled" : "Waiting for approval"}</span>
      <p className="muted" style={{ maxWidth: 320 }}>
        {disabled ? "This account has been turned off. Ask David if that is a mistake." : "You are signed up. David has to approve new accounts before anything opens; you will get in as soon as he does."}
      </p>
      <div className={a.rowButtons}>
        {!disabled && <Button onClick={onRetry}>Check again</Button>}
        <Button variant="secondary" onClick={onSignOut}>Sign out</Button>
      </div>
    </Centered>
  );
}

function SignIn() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [form, setForm] = useState({ first: "", last: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  // The embedded login is an iframe Catalyst renders into this element, proxied through our own origin.
  useEffect(() => {
    if (mode !== "in") return;
    let cancelled = false;
    void catalystAuth().then((auth) => { if (!cancelled) auth.signIn("soma-login", { redirect_url: "/" }); }).catch(() => {
      if (!cancelled) setNote({ ok: false, text: "Sign-in could not load. Check your connection and reload." });
    });
    return () => { cancelled = true; };
  }, [mode]);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setNote(null);
    try {
      const auth = await catalystAuth();
      const res = await auth.signUp({ first_name: form.first.trim(), last_name: form.last.trim(), email_id: form.email.trim(), platform_type: "web", redirect_url: window.location.origin + "/" });
      if (res.status === 200) setNote({ ok: true, text: "Check your email for a confirmation link. Set your password there, then sign in here." });
      else setNote({ ok: false, text: res.status === 409 ? "That email already has an account. Sign in instead." : res.message || "Sign-up failed." });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      setNote({ ok: false, text: status === 409 ? "That email already has an account. Sign in instead." : "Sign-up failed. Try again in a moment." });
    } finally { setBusy(false); }
  }

  return (
    <main className={a.signin}>
      <div className={a.signinHead}>
        <span className="eb">Journal · Food · Activity</span>
        <span className={`d ${a.wordmark}`}>Soma</span>
      </div>
      {mode === "in" ? (
        <>
          <div id="soma-login" className={a.login} />
          <button type="button" className={a.link} onClick={() => { setMode("up"); setNote(null); }}>New here? Request access</button>
        </>
      ) : (
        <form className={a.signupForm} onSubmit={signUp}>
          <Input required placeholder="First name" autoComplete="given-name" value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} />
          <Input required placeholder="Last name" autoComplete="family-name" value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} />
          <Input required type="email" placeholder="Email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Button type="submit" block disabled={busy}>{busy ? "Sending…" : "Request access"}</Button>
          <p className="muted" style={{ fontSize: 12 }}>New accounts wait for David&apos;s approval before anything opens.</p>
          <button type="button" className={a.link} onClick={() => { setMode("in"); setNote(null); }}>Have an account? Sign in</button>
        </form>
      )}
      {note && <p role="status" className={note.ok ? a.noteOk : a.noteBad}>{note.text}</p>}
      <p className={a.legal}><Link href="/privacy/">Privacy</Link><Link href="/terms/">Terms</Link></p>
    </main>
  );
}
