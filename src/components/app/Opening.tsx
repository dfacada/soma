"use client";

// The opening words: one phrase, the whole screen, before anything else. A tap anywhere (or Enter, Space, Escape)
// goes on. The app loads underneath meanwhile, so nothing is slower for it.

import { useCallback, useEffect, useRef, useState } from "react";
import { alreadyShown, markOpened, noteShown, peekPhrase, type Phrase } from "@/lib/opening";
import { useSession } from "./Session";
import a from "./app.module.css";

export function Opening() {
  const { settings } = useSession();
  // Decided once, on the first render after sign-in resolves. This subtree never renders on the server.
  const [phrase, setPhrase] = useState<Phrase | null>(() => {
    const { on, phrases } = settings.opening;
    return on && phrases.length && !alreadyShown() ? peekPhrase(phrases) : null;
  });
  const button = useRef<HTMLButtonElement>(null);

  const go = useCallback(() => { setPhrase(null); markOpened(); }, []);

  useEffect(() => {
    if (!phrase) { markOpened(); return; }
    noteShown();
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [phrase, go]);

  if (!phrase) return null;
  return (
    <div className={a.opening} role="dialog" aria-modal="true" aria-label="Opening words" onClick={go}>
      <div className={a.openingBody}>
        <span className="eb">Before you begin</span>
        <p className={`d ${a.openingText}`}>{phrase.text}</p>
        {phrase.note && <p className={a.openingNote}>{phrase.note}</p>}
      </div>
      <button ref={button} type="button" className={a.openingGo} onClick={go}>Begin</button>
    </div>
  );
}
