"use client";

// What's new: once, the first time Soma opens after an update, the releases this person has not seen
// (src/lib/changelog.ts). It waits for the opening words and the vault prompt waits for it, so only one thing is
// ever on the screen. Seen is remembered on the account (settings.seenChanges), so it shows once per person, not
// once per phone. Settings keeps the whole history (ReleaseList).

import { useCallback, useEffect, useRef, useState } from "react";
import { CHANGES, releaseDate, unseen, type Release } from "@/lib/changelog";
import { report } from "@/lib/log";
import { installDone, markNewsDone } from "@/lib/opening";
import { dayKey } from "@/lib/today";
import { Button, Sheet } from "@/components/ui";
import { useSession } from "./Session";
import a from "./app.module.css";

export function WhatsNew() {
  const { settings, saveSettings } = useSession();
  // What this person had seen when the app opened; a save during the session must not re-trigger anything.
  const seen = useRef(settings.seenChanges);
  const [show, setShow] = useState<Release[] | null>(null);

  useEffect(() => {
    let alive = true;
    void installDone.then((installShown) => {
      if (!alive) return;
      // One thing an open: if the install splash ran, these notes keep until next time.
      const list = installShown ? [] : unseen(seen.current, dayKey(new Date()));
      if (list.length) setShow(list);
      else markNewsDone();
    });
    return () => { alive = false; };
  }, []);

  const close = useCallback(() => {
    setShow(null);
    markNewsDone();
    // A failed save only means it shows again next time; say so in the log, not on the screen.
    void saveSettings({ seenChanges: CHANGES[0].id }).catch((e) => report("app", "whats_new_save_failed", e, undefined, "warn"));
  }, [saveSettings]);

  return (
    <Sheet open={show !== null} title="What's new" onClose={close}>
      {show && <ReleaseList releases={show} />}
      <Button variant="primary" block onClick={close}>Got it</Button>
    </Sheet>
  );
}

/** Releases, newest first, each with its date, title and what changed. Used here and in Settings. */
export function ReleaseList({ releases }: { releases: Release[] }) {
  return (
    <div className={a.releases}>
      {releases.map((r) => (
        <section key={r.id} className={a.release}>
          <span className="eb">{releaseDate(r.date)}</span>
          <span className="d" style={{ fontSize: 18 }}>{r.title}</span>
          <ul>{r.items.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      ))}
    </div>
  );
}
