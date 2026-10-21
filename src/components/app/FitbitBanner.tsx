"use client";

// Top of Today when Google has ended the Fitbit connection (status "reconnect": a sync answered 409, which the API
// sends when Google refuses the refresh token). Settings says so too, but nobody lives in Settings. Dismissing
// snoozes it for a day on this device; reconnecting hides it, because the status moves on.

import { useState } from "react";
import { Button, Icon } from "@/components/ui";
import { useHealth } from "./Health";
import { useSession } from "./Session";
import a from "./app.module.css";

const SNOOZE_MS = 24 * 60 * 60 * 1000;
const keyFor = (userId: string) => `soma.fitbitSnooze.${userId}`;

function snoozedUntil(userId: string): number {
  try { return Number(localStorage.getItem(keyFor(userId))) || 0; } catch { return 0; }
}

export function FitbitBanner() {
  const health = useHealth();
  const { me } = useSession();
  // Read once, when Today first mounts: the prompt belongs to opening the app, and Today then stays mounted.
  const [snoozed, setSnoozed] = useState(() => Date.now() < snoozedUntil(me.id));
  if (health.status !== "reconnect" || snoozed) return null;

  const snooze = () => {
    try { localStorage.setItem(keyFor(me.id), String(Date.now() + SNOOZE_MS)); } catch { /* still hidden for this visit */ }
    setSnoozed(true);
  };

  return (
    <div className={a.fitbitBanner} role="status">
      <span className={a.fitbitText}>Fitbit disconnected — tap to reconnect.</span>
      <Button size="sm" variant="activity" onClick={health.connect}>Reconnect</Button>
      <button type="button" className={a.fitbitClose} aria-label="Dismiss for a day" onClick={snooze}><Icon name="close" size={16} /></button>
    </div>
  );
}
