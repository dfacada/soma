"use client";

// Settings shell. Sections arrive with the screens they configure (docs/HANDOFF.md §6);
// for now: the account, and the one number Today needs.

import { useState } from "react";
import { Button, Card, Field, Input, Toast } from "@/components/ui";
import { isDevIdentity } from "@/lib/catalyst";
import { useSession } from "./Session";
import a from "./app.module.css";

export function SettingsScreen() {
  const { me, displayName, settings, saveSettings, saveDisplayName, signOut } = useSession();
  const [name, setName] = useState(displayName);
  const [target, setTarget] = useState(String(settings.pushupTarget));
  const [toast, setToast] = useState<string | null>(null);
  const say = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 1800); };

  async function commitName() {
    const next = name.trim();
    if (!next) return setName(displayName);
    if (next === displayName) return;
    try { await saveDisplayName(next); say("Name saved"); } catch { setName(displayName); say("Couldn't save the name"); }
  }

  async function commitTarget() {
    const n = Math.round(Number(target));
    if (!Number.isFinite(n) || n < 1 || n > 10000) return setTarget(String(settings.pushupTarget));
    if (n === settings.pushupTarget) return;
    try { await saveSettings({ pushupTarget: n }); say(`Target set to ${n}`); } catch { setTarget(String(settings.pushupTarget)); say("Couldn't save the target"); }
  }

  return (
    <div className={a.page}>
      <div className={a.pageHead}><span className={`d ${a.pageTitle}`}>Settings</span></div>

      <Card>
        <span className="eb">Account</span>
        <Field name="Display name">
          <Input compact value={name} maxLength={100} aria-label="Display name" onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        </Field>
        <Field name="Email" help={me.profile.role === "admin" ? "Admin" : "Member"}><span className="m muted" style={{ fontSize: 12, wordBreak: "break-all", textAlign: "right" }}>{me.email}</span></Field>
        {!isDevIdentity && <Button variant="secondary" onClick={signOut}>Sign out</Button>}
      </Card>

      <Card>
        <span className="eb">Activity</span>
        <Field name="Daily push-up target" help="Yours alone. Flat, every day, no ramp.">
          <Input compact inputMode="numeric" pattern="[0-9]*" value={target} aria-label="Daily push-up target" onChange={(e) => setTarget(e.target.value.replace(/\D/g, "").slice(0, 5))} onBlur={commitTarget} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        </Field>
      </Card>

      <p className="muted" style={{ fontSize: 12, padding: "0 4px" }}>Moods, habits, meals, targets and the rest arrive with the screens they belong to.</p>
      <Toast message={toast} />
    </div>
  );
}
