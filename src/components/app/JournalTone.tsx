"use client";

// The tone (and, read by Claude, the themes) of each journal day, for Insights. Needs the vault open: the entries
// are only readable on this device. How the words are read is the person's choice (settings.journalInsights):
// on the phone by default, or by Claude with names and details taken out first (src/lib/journal-read.ts).
// Results are kept on this device encrypted with the vault key, and a day is only read again when its words change.

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { deidentify, fingerprint, phoneTone, shuffleForSending } from "@/lib/journal-read";
import { report } from "@/lib/log";
import { dayKey } from "@/lib/today";
import { useJournal } from "./Journal";
import { useSession } from "./Session";

type Read = { fp: string; tone: number | null; themes: string[] };
type Cache = Record<string, Read>;
const BATCH = 20;
const PER_DAY = 3000;
const storeKey = (userId: string) => `soma-journal-tone:${userId}`;

export type ToneState = {
  status: "locked" | "loading" | "reading" | "ready" | "failed";
  /** Days with words, and how many of them have been read so far. */
  total: number; read: number;
  tones: Record<string, number>;
  themes: Record<string, string[]>;
  source: "phone" | "claude";
};

export function useJournalTone(days: string[]): ToneState {
  const { vault, items: entries, seal, unseal } = useJournal();
  const { settings, me, displayName } = useSession();
  const source = settings.journalInsights;

  // Each day's words: every transcript and written entry filed under it, in order.
  const texts = useMemo(() => {
    const wanted = new Set(days);
    const by = new Map<string, string[]>();
    for (const item of entries || []) {
      const text = item.entry?.transcript?.trim();
      if (!text) continue;
      const day = dayKey(new Date(item.createdMs));
      if (!wanted.has(day)) continue;
      by.set(day, [...(by.get(day) || []), text]);
    }
    return [...by.entries()].map(([day, list]) => ({ day, text: list.reverse().join("\n\n").slice(0, PER_DAY) }));
  }, [entries, days]);

  const [cache, setCache] = useState<Cache | null>(null);
  const [status, setStatus] = useState<ToneState["status"]>("loading");

  // The kept results, decrypted with the vault key.
  useEffect(() => {
    if (vault !== "open" || source !== "claude") return;
    let alive = true;
    const sealed = (() => { try { return localStorage.getItem(storeKey(me.id)); } catch { return null; } })();
    (sealed ? unseal<Cache>(sealed) : Promise.resolve({} as Cache))
      .catch(() => ({} as Cache))
      .then((c) => { if (alive) setCache(c); });
    return () => { alive = false; };
  }, [vault, source, me.id, unseal]);

  // Read by Claude whatever has not been read in its current words, a batch at a time.
  useEffect(() => {
    if (vault !== "open" || source !== "claude" || !cache || entries === null) return;
    const todo = texts.filter((t) => cache[t.day]?.fp !== fingerprint(t.text));
    if (!todo.length) { Promise.resolve().then(() => setStatus("ready")); return; }
    let alive = true;
    (async () => {
      setStatus("reading");
      const next: Cache = { ...cache };
      const remove = [displayName, me.name, me.email.split("@")[0]].filter(Boolean);
      try {
        for (let i = 0; i < todo.length && alive; i += BATCH) {
          const batch = todo.slice(i, i + BATCH);
          const { items, back } = shuffleForSending(batch.map((t) => ({ day: t.day, text: deidentify(t.text, remove) })));
          const res = await api<{ items: { id: string; tone: number; themes: string[] }[] }>("POST", "/insights/journal-tone", { items });
          for (const r of res.items) {
            const day = back[r.id];
            const t = batch.find((b) => b.day === day);
            if (t) next[day] = { fp: fingerprint(t.text), tone: r.tone, themes: r.themes };
          }
          if (!alive) return;
          setCache({ ...next });
          try { localStorage.setItem(storeKey(me.id), await seal(next)); } catch { /* full or private: read again next time */ }
        }
        if (alive) setStatus("ready");
      } catch (e) {
        report("insights", "journal_tone_failed", e, { days: todo.length });
        if (alive) { setCache({ ...next }); setStatus("failed"); }
      }
    })();
    return () => { alive = false; };
    // Not on every change to the cache: this effect writes it. A new batch of words (texts) or a fresh load starts it.
  }, [vault, source, cache === null, texts]); // eslint-disable-line react-hooks/exhaustive-deps

  if (vault !== "open") return { status: "locked", total: 0, read: 0, tones: {}, themes: {}, source };
  if (entries === null) return { status: "loading", total: 0, read: 0, tones: {}, themes: {}, source };

  const tones: Record<string, number> = {};
  const themes: Record<string, string[]> = {};
  let read = 0;
  for (const t of texts) {
    // On the phone; and also for a day Claude has not read yet, so a failed read still leaves a tone.
    const kept = source === "claude" ? cache?.[t.day] : undefined;
    const fresh = kept && kept.fp === fingerprint(t.text);
    const tone = fresh ? kept!.tone : phoneTone(t.text);
    if (fresh) { read++; themes[t.day] = kept!.themes; }
    if (typeof tone === "number") tones[t.day] = tone;
  }
  return {
    status: source === "phone" ? "ready" : status,
    total: texts.length, read: source === "phone" ? texts.length : read,
    tones, themes, source,
  };
}
