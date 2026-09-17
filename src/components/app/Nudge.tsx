"use client";

// The evening nudge in Settings, and the keeper that re-sends this device's subscription when the app opens.
// Whether there is a nudge, and when, belongs to the account. Whether *this device* receives it is its own switch,
// because a notification permission is per device and iOS only grants one to the Home Screen app.

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { disablePush, enablePush, pushState, refreshPush, sendTest, type PushState } from "@/lib/push";
import { Button, Card, Field, Input, Switch } from "@/components/ui";
import { useSession } from "./Session";

const LINE: Record<PushState | "checking", string> = {
  checking: "Checking this device…",
  unsupported: "This browser cannot receive notifications.",
  "needs-install": "On iPhone and iPad, notifications only reach the Home Screen app. In your browser tap Share, then Add to Home Screen, open Soma from there and switch this on.",
  blocked: "Notifications are blocked for Soma on this device. Allow them in the device's settings, then come back.",
  off: "Not on for this device yet.",
  on: "On for this device.",
};

export function NudgeKeeper() {
  const { settings } = useSession();
  const on = settings.nudge.on;
  useEffect(() => { if (on) void refreshPush().catch(() => undefined); }, [on]);
  return null;
}

export function NudgeCard({ say }: { say: (m: string) => void }) {
  const { settings, saveSettings } = useSession();
  const { on, time } = settings.nudge;
  const [device, setDevice] = useState<PushState | "checking">("checking");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    pushState().then((s) => { if (alive) setDevice(s); }, () => { if (alive) setDevice("unsupported"); });
    return () => { alive = false; };
  }, []);

  // Runs inside the tap, which is what lets iOS show its permission prompt.
  const turnOn = useCallback(async () => {
    setBusy(true);
    try {
      const state = await enablePush();
      setDevice(state);
      if (state !== "on") return say(state === "blocked" ? "Notifications are blocked on this device" : state === "needs-install" ? "Add Soma to your Home Screen first" : "Notifications were not allowed");
      if (!on) await saveSettings({ nudge: { on: true, time } });
      say(`You'll get a nudge at ${time} if the day is still open`);
    } catch (e) { say(e instanceof ApiError || e instanceof Error ? e.message : "Couldn't turn notifications on"); }
    finally { setBusy(false); }
  }, [on, time, saveSettings, say]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    try { await disablePush(); setDevice(await pushState()); await saveSettings({ nudge: { on: false, time } }); say("Evening nudge off"); }
    catch { say("Couldn't save that"); }
    finally { setBusy(false); }
  }, [time, saveSettings, say]);

  const test = useCallback(() => { void sendTest().then(() => say("Test sent. It should arrive within a minute."), (e) => say(e instanceof ApiError ? e.message : "Couldn't send a test")); }, [say]);

  return (
    <Card>
      <span className="eb">Evening nudge</span>
      <Field name="Nudge me if the day is still open" help={`One notification at the time below, naming what is left. A closed day gets none. ${LINE[device]}`}>
        <Switch checked={on && device === "on"} label="Evening nudge" onChange={(v) => { if (!busy) void (v ? turnOn() : turnOff()); }} />
      </Field>
      <Field name="Time" help="Your local time on this device. Checked every 15 minutes.">
        <Input compact type="time" step={900} aria-label="Nudge time" value={draft ?? time}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft && /^\d{2}:\d{2}$/.test(draft) && draft !== time) void saveSettings({ nudge: { on, time: draft } }).then(() => say(`Nudge time set to ${draft}`), () => say("Couldn't save that")); setDraft(null); }} />
      </Field>
      {on && device === "off" && <div><Button size="sm" variant="secondary" disabled={busy} onClick={() => void turnOn()}>Turn on for this device</Button></div>}
      {device === "on" && <div><Button size="sm" variant="secondary" onClick={test}>Send a test</Button></div>}
    </Card>
  );
}
