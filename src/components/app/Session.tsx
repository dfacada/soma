"use client";

// Gate for every signed-in screen: resolves the Catalyst session, the profile (approval) and the settings,
// and renders the right thing for each state. Children only mount when the user is active.

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, type Me } from "@/lib/api";
import { catalystAuth, currentUser, isDevIdentity } from "@/lib/catalyst";
import { applyLook } from "@/lib/look";
import { BUILD, isInstalled, report } from "@/lib/log";
import { withMove } from "@/lib/moves";
import { mergeSettings, type Settings } from "@/lib/settings";
import { dayKey } from "@/lib/today";
import { acceptInvite, cleanCode, forgetInvite, keptInvite } from "@/lib/invite";
import { Button, Input, Toast, type StepProgress } from "@/components/ui";
import { Splash, type OpenStep } from "./Splash";
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

type Resolved = Exclude<State, { kind: "loading" | "ready" }> | { kind: "ready"; me: Me; displayName: string; stored: Record<string, unknown>; notice: string | null; joinedKind: string | null };

/** An invite link's code from whatever was pasted: the code itself, or the whole link with ?c= in it. */
function codeFrom(text: string): string | null {
  const m = /[?&]c=([^&#\s]+)/.exec(text);
  return cleanCode(m ? decodeURIComponent(m[1]) : text);
}

/** Use the invite link this device kept (src/lib/invite.ts): join its round, and say how it went. `kind` is what the
 *  round counts, so the move can be added to the person's moves. */
async function applyKeptInvite(code: string): Promise<{ notice: string | null; kind: string | null }> {
  try {
    const r = await acceptInvite(code, dayKey(new Date()));
    forgetInvite();
    if (!r.round) return { notice: r.approved ? "Welcome to Soma" : null, kind: null };
    return { notice: r.already ? `You're already in ${r.round.name}` : `You're in ${r.round.name}`, kind: r.round.kind || "pushups" };
  } catch (e) {
    // A link that no longer works is forgotten; one that failed for another reason is tried on the next open.
    if (e instanceof ApiError && (e.status === 410 || e.status === 403)) { forgetInvite(); return { notice: e.message, kind: null }; }
    report("invite", "accept_failed", e, undefined, "warn");
    return { notice: null, kind: null };
  }
}

/** Catalyst session → profile (approval) → settings. Plain async: no React state in here. */
/** `step` hears each step of opening as it starts (the splash shows it): the sign-in SDK, then the account. */
async function resolveSession(step: (at: OpenStep, progress: StepProgress) => void = () => undefined): Promise<Resolved> {
  try {
    if (!isDevIdentity && !(await currentUser())) return { kind: "signedOut" };
    step("Checking your account", 0);
    // An invite link opened on this device goes with the first call: a brand-new account it can let in starts active.
    const invite = keptInvite();
    // The build and whether this is the home-screen app go with it: Soma Ops shows where someone last used Soma.
    const device = `b=${encodeURIComponent(BUILD)}&i=${isInstalled() ? 1 : 0}`;
    let me = await api<Me>("GET", `/me?${device}` + (invite ? `&invite=${invite}` : ""));
    let used: { notice: string | null; kind: string | null } = { notice: null, kind: null };
    // An account that was already waiting (made before the link was opened, or elsewhere): the link lets it in now.
    if (me.profile.status === "pending" && invite) {
      used = await applyKeptInvite(invite);
      me = await api<Me>("GET", "/me");
    }
    if (me.profile.status !== "active") return { kind: "blocked", me };
    if (invite && keptInvite()) used = await applyKeptInvite(invite);
    const { notice } = used;
    step("Checking your account", 0.5);
    const s = await api<{ displayName: string; settings: Record<string, unknown> }>("GET", "/settings");
    step("Loading your days", "unknown");
    return { kind: "ready", me, displayName: s.displayName || me.name || "", stored: s.settings || {}, notice, joinedKind: used.kind };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { kind: "signedOut" };
    return { kind: "error", message: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export function SessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [opening, setOpening] = useState<{ at: OpenStep; progress: StepProgress }>({ at: "Starting", progress: "unknown" });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [displayName, setDisplayName] = useState("");
  // A line about an invite link that was just used ("You're in Morning crew"), shown once as Soma opens.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 4000); return () => window.clearTimeout(t); }, [notice]);

  const apply = useCallback((r: Resolved) => {
    if (r.kind === "ready") {
      // A first open: no release ever seen and no day joined yet (a new account's settings are empty). Today becomes
      // the day this person joined, so the week strips never count the days before it as missed. An empty list of
      // moves says they have not chosen how they move yet: without it they would get the push-ups and activity types
      // of settings from before moves (settings.ts), and nobody new starts with push-ups.
      const fresh = !r.stored.seenChanges && !r.stored.joined;
      stored = fresh ? { ...r.stored, joined: dayKey(new Date()), ...(Array.isArray(r.stored.moves) ? {} : { moves: [] }) } : r.stored;
      // Joining a round with a link adds the move it counts (made main for someone with none), so a new person who
      // came in through a push-up round has push-ups to log.
      const more = r.joinedKind ? withMove(mergeSettings(stored), r.joinedKind) : null;
      if (more) stored = { ...stored, ...more };
      if (fresh || more) void api("PUT", "/settings", { settings: stored }).catch((e) => report("app", fresh ? "joined_save_failed" : "invite_move_save_failed", e, undefined, "warn"));
      setSettings(mergeSettings(stored));
      setDisplayName(r.displayName);
      setNotice(r.notice);
      setState({ kind: "ready", me: r.me });
    } else setState(r);
  }, []);

  useEffect(() => {
    let alive = true;
    void resolveSession((at, progress) => { if (alive) setOpening({ at, progress }); }).then((r) => { if (alive) apply(r); });
    return () => { alive = false; };
  }, [apply]);

  // Appearance follows the account. "system" also follows the OS while the app is open.
  const theme = settings?.theme, palette = settings?.palette, motion = settings?.motion;
  useEffect(() => {
    if (!theme || !palette || !motion) return;
    applyLook(theme, palette, motion);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyLook(theme, palette, motion);
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [theme, palette, motion]);

  const load = useCallback(() => {
    setState({ kind: "loading" });
    setOpening({ at: "Starting", progress: "unknown" });
    void resolveSession((at, progress) => setOpening({ at, progress })).then(apply);
  }, [apply]);

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

  if (value) return <Ctx.Provider value={value}>{children}<Toast message={notice} /></Ctx.Provider>;
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
  return <Splash at={opening.at} progress={opening.progress} />;
}

function Centered({ children }: { children: ReactNode }) {
  return <main className={a.centered}>{children}</main>;
}

function Blocked({ me, onRetry, onSignOut }: { me: Me; onRetry: () => void; onSignOut: () => void }) {
  const disabled = me.profile.status === "disabled";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    const c = codeFrom(code);
    if (!c) return setError("That isn't an invite. Paste the whole link, or its code of 10 letters and numbers.");
    setBusy(true); setError(null);
    try {
      await acceptInvite(c, dayKey(new Date()));
      forgetInvite();
      onRetry();
    } catch (x) {
      if (!(x instanceof ApiError && x.status < 500)) report("invite", "code_failed", x, undefined, "warn");
      setError(x instanceof ApiError && x.status < 500 ? x.message : "Couldn't check the invite. Try again in a moment.");
    } finally { setBusy(false); }
  }

  if (me.profile.status === "deleting") {
    return (
      <Centered>
        <span className={a.splashOrb} aria-hidden><i /><i /><i /></span>
        <span className="d" style={{ fontSize: 30 }}>Deleting your account</span>
        <p className="muted" style={{ maxWidth: 320, textWrap: "balance" }}>Everything Soma kept for you is being deleted. It takes a few minutes and can&apos;t be undone.</p>
        <div className={a.rowButtons}><Button variant="secondary" onClick={onSignOut}>Sign out</Button></div>
      </Centered>
    );
  }
  return (
    <Centered>
      {/* Soma's own face on the first screen a new member sees, so the wait reads as the app's, not an error's. */}
      <span className={a.splashOrb} aria-hidden><i /><i /><i /></span>
      <span className={`d ${a.wordmark}`} style={{ fontSize: 40 }} aria-label="Soma">Soma</span>
      <span className="eb">{me.email}</span>
      <span className="d" style={{ fontSize: 30 }}>{disabled ? "Account disabled" : "Waiting for approval"}</span>
      <p className="muted" style={{ maxWidth: 320, textWrap: "balance" }}>
        {disabled
          ? "This account has been turned off. Ask David if that is a mistake."
          : "You're signed up. If someone sent you an invite link, paste it below and you're in. Otherwise David lets each new member in by hand: open Soma again later, or tap Check again."}
      </p>
      {!disabled && (
        <form className={a.vaultRow} style={{ width: "100%", maxWidth: 360 }} onSubmit={submitCode}>
          <Input placeholder="Invite link or code" aria-label="Invite link or code" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
          <Button type="submit" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Use it"}</Button>
        </form>
      )}
      {error && <p role="alert" className={a.noteBad}>{error}</p>}
      <div className={a.rowButtons}>
        {!disabled && <Button variant="secondary" onClick={onRetry}>Check again</Button>}
        <Button variant="secondary" onClick={onSignOut}>Sign out</Button>
      </div>
    </Centered>
  );
}

function SignIn() {
  const [mode, setMode] = useState<"in" | "up">("in");
  // An invite link opened on this device: say so, so a newcomer knows to sign up and that they won't wait.
  const [invited] = useState(() => (typeof window === "undefined" ? false : Boolean(keptInvite())));
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
      {invited && <p className={a.noteOk}>Your invite is saved on this device. Sign in, or sign up if you&apos;re new, and you&apos;re in.</p>}
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
          <Button type="submit" block disabled={busy}>{busy ? "Sending…" : invited ? "Sign up" : "Request access"}</Button>
          <p className="muted" style={{ fontSize: 12 }}>{invited ? "Your invite lets you in as soon as you sign in." : "With an invite link you're in at once; without one, David lets new accounts in by hand."}</p>
          <button type="button" className={a.link} onClick={() => { setMode("in"); setNote(null); }}>Have an account? Sign in</button>
        </form>
      )}
      {note && <p role="status" className={note.ok ? a.noteOk : a.noteBad}>{note.text}</p>}
      <p className={a.legal}><Link href="/privacy/">Privacy</Link><Link href="/terms/">Terms</Link></p>
    </main>
  );
}
