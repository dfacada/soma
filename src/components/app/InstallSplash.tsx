"use client";

// The first time someone opens Soma in a browser tab, this shows them how to put it on their Home Screen
// (David, 2026-09-22: "for any new user… a special splash screen that shows them the install page details.
// I also want this for all current users to show once").
//
// Once per person, not per device: `settings.seenInstall`. It never shows when Soma is already running from a
// Home Screen icon, and never on a computer — where it would be noise, and where not marking it seen means the
// person still gets it the first time they open Soma on their phone.
//
// One thing at a time on opening: the opening words, then this, then What's new, then the vault prompt. When this
// shows, What's new waits for the next open rather than stacking behind it.

import { useCallback, useEffect, useState } from "react";
import { ART, installed, STEPS, deviceNow, type Which } from "@/components/InstallSteps";
import { report } from "@/lib/log";
import { markInstallDone, opened } from "@/lib/opening";
import { Button, Sheet } from "@/components/ui";
import { useSession } from "./Session";
import a from "./app.module.css";
import i from "@/components/install.module.css";

export function InstallSplash() {
  const { settings, saveSettings } = useSession();
  const [show, setShow] = useState<Which | null>(null);

  useEffect(() => {
    let alive = true;
    void opened.then(() => {
      if (!alive) return;
      const which = deviceNow();
      const onPhone = which === "ios" || which === "android";
      if (settings.seenInstall || !onPhone || installed()) {
        // Already installed means they have done this; remember it so a browser tab never asks again.
        if (installed() && !settings.seenInstall) void saveSettings({ seenInstall: true }).catch(() => undefined);
        return markInstallDone(false);
      }
      setShow(which);
    });
    return () => { alive = false; };
    // Read once, when the app opens: a save during the session must not bring this back or dismiss it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => {
    setShow(null);
    markInstallDone(true);
    void saveSettings({ seenInstall: true }).catch((e) => report("app", "seen_install_save_failed", e, undefined, "warn"));
  }, [saveSettings]);

  const block = show ? STEPS[show] : null;

  return (
    <Sheet open={show !== null} title="Put Soma on your Home Screen" onClose={close}>
      {show && block && (
        <div className={a.vaultForm}>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            It takes about twenty seconds and gives Soma its own icon, opens it full screen, and lets the evening
            reminder reach you. {block.note}
          </p>
          <ol className={i.steps}>{block.steps.slice(1).map((step) => <li key={step}>{step}</li>)}</ol>
          <figure className={i.shots} style={{ margin: 0 }}>
            {ART[show].map((shot) => (
              <span key={shot.caption} className={i.shot}>
                {shot.art}
                <span className={i.caption}>{shot.caption}</span>
              </span>
            ))}
          </figure>
          <Button variant="primary" block onClick={close}>Got it</Button>
        </div>
      )}
    </Sheet>
  );
}
