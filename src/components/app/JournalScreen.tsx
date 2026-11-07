"use client";

// The Journal screen: the record card (with the question of the day and the last two weeks as dots), one past entry
// to look back on, then entries newest first with playback and a written note each.

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Icon, Input, Medallion, StageBar, Tag, type StepProgress } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { clock } from "@/lib/journal";
import { journalRun, lookBack, recentDays } from "@/lib/journal-days";
import { toWav, within } from "@/lib/playable";
import { promptFor } from "@/lib/prompts";
import { dayKey, fromKey } from "@/lib/today";
import { useJournal, type Item, type TxStep } from "./Journal";
import a from "./app.module.css";
import sc from "./screens.module.css";
import ui from "@/components/ui/ui.module.css";

const dayLabel = (ms: number) => {
  const d = new Date(ms), today = new Date(), y = new Date(); y.setDate(y.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return "Today";
  if (dayKey(d) === dayKey(y)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
};
const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "calm";
/** A transcript longer than this folds to six lines until "Read all". */
const FOLD_AT = 320;
/** What a transcription is doing, under the entry while it runs. */
const TX_LABEL: Record<TxStep, string> = { open: "Opening the recording…", transcribe: "Transcribing…", save: "Saving the words…" };

/** The words of a search, each escaped for a RegExp. Empty when there is nothing to look for. */
const termsOf = (q: string) => q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

/** `text` with every term marked. Case-insensitive; the original casing is kept. */
function Marked({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.join("|")})`, "giu");
  return <>{text.split(re).map((part, i) => (i % 2 ? <mark key={i} className={a.hit}>{part}</mark> : part))}</>;
}

export function JournalScreen() {
  const j = useJournal();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const terms = useMemo(() => termsOf(deferred), [deferred]);
  // Transcripts are decrypted when the vault opens; this keeps a lower-cased copy of each to match against, rebuilt
  // only when the entries change. Nothing here leaves the device.
  const index = useMemo(() => new Map((j.items || []).map((i) => [i.id, (i.entry?.transcript || "").toLocaleLowerCase()])), [j.items]);
  const shown = useMemo(() => {
    if (!j.items || !terms.length) return j.items;
    const res = terms.map((t) => new RegExp(t, "u"));
    return j.items.filter((i) => { const text = index.get(i.id) || ""; return res.every((re) => re.test(text)); });
  }, [j.items, terms, index]);

  // The dots, the run and the look back are worked out here from what is already decrypted; none of it leaves the phone.
  const todayKey = dayKey(new Date());
  const dots = useMemo(() => recentDays(j.items || [], fromKey(todayKey)), [j.items, todayKey]);
  const run = useMemo(() => journalRun(j.items || [], fromKey(todayKey)), [j.items, todayKey]);
  const back = useMemo(() => (j.items ? lookBack(j.items.filter((i) => i.entry && !i.pending), fromKey(todayKey)) : null), [j.items, todayKey]);
  const prompt = promptFor(fromKey(todayKey));
  const daysOn = dots.filter((d) => d.on).length;

  // Look back (and anything else that points at an entry) scrolls to it and lights it for a moment.
  const [flash, setFlash] = useState<string | null>(null);
  const jumpTo = useCallback((id: string) => {
    haptic();
    setQuery("");
    setFlash(id);
    // After the search clears, the entry is back in the list.
    window.setTimeout(() => document.getElementById("entry-" + id)?.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "center" }), 60);
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 2400);
    return () => window.clearTimeout(t);
  }, [flash]);

  // Locked, or not made yet: the page is the one card that opens the vault, in the middle of the screen.
  const shut = j.vault === "none" || j.vault === "locked";

  return (
    <div className={shut ? `${a.page} ${a.vaultPage}` : a.page}>
      <div className={a.pageHead}>
        <div>
          <div className="eb">Sealed on this phone</div>
          <div className={`d ${a.pageTitle}`}>Journal</div>
        </div>
        {j.vault === "open" && <button type="button" className={`${sc.headPill} ${ui.journal}`} onClick={j.lock} aria-label="Vault open. Lock it"><Icon name="lock" size={14} />Vault open · Lock</button>}
      </div>

      {/* The record card: recording fills the screen once it starts (RecordMoment). */}
      {j.vault === "open" && (
        <button type="button" className={sc.record} onClick={() => j.toggleRecording(null)}>
          <span className={sc.recordText}>
            <span className="eb">New entry</span>
            <span className={`d ${sc.recordTitle}`}>Say how today went.</span>
            <span className={sc.recordSub}>Not sure where to start? {prompt}</span>
            {!!j.items?.length && (
              <span className={sc.recordRun}>
                <span className={sc.dots} aria-hidden>{dots.map((d) => <i key={d.key} className={d.on ? sc.dotOn : undefined} />)}</span>
                <span className="m">{run >= 2 ? `${run} days in a row` : `${daysOn} of the last 14 days`}</span>
              </span>
            )}
          </span>
          <span className={sc.recordButton}><Icon name="mic" size={32} strokeWidth={2} /></span>
        </button>
      )}

      {j.vault === "checking" && <span className="eb">Checking your vault</span>}

      {shut && (
        <Card className={a.vaultCard}>
          <Medallion domain="journal" icon="lock" />
          <span className="d" style={{ fontSize: 24 }}>{j.vault === "none" ? "Make your vault first" : "Your vault is locked"}</span>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            {j.vault === "none"
              ? "Entries are encrypted on your device with a passphrase only you know, then uploaded. Choose that passphrase once and you can start recording."
              : "Enter your passphrase to read and record entries on this device."}
          </p>
          <Button variant="journal" block className={a.vaultGo} onClick={j.openVault}>{j.vault === "none" ? "Create vault" : "Unlock"}</Button>
        </Card>
      )}

      {j.vault === "open" && j.items === null && !j.loadFailed && <span className="eb">Decrypting entries</span>}
      {j.vault === "open" && j.loadFailed && (
        <Card>
          <span className="d" style={{ fontSize: 22 }}>Your entries didn&apos;t load</span>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Nothing is lost: they are still encrypted and stored. The app could not fetch them just now. Try again, and if
            it keeps happening the reason is in Settings → Admin → Log.
          </p>
          <div><Button variant="journal" onClick={j.reload}>Try again</Button></div>
        </Card>
      )}
      {j.vault === "open" && j.items?.length === 0 && !j.recording && (
        <Card><p className="muted">Nothing here yet. Your entries land here, sealed, and open only with your vault.</p></Card>
      )}

      {/* One entry from about a month or a week ago, read back. Only on this phone, only with the vault open. */}
      {j.vault === "open" && back && !terms.length && (
        <button type="button" className={sc.back} onClick={() => jumpTo(back.item.id)}>
          <span className={sc.backHead}><span className="eb">{back.label}</span><span className="m muted">{dayLabel(back.item.createdMs)}</span></span>
          <span className={sc.backText}>{back.item.entry!.transcript.trim() ? `“${back.item.entry!.transcript.trim()}”` : `A recording, ${clock(back.item.entry!.audioDuration)} long.`}</span>
          <span className={sc.backGo}>{back.item.entry!.transcript.trim() ? "Read it again" : "Play it again"}<Icon name="chevron" size={14} /></span>
        </button>
      )}

      {j.vault === "open" && !!j.items?.length && (
        <div className={a.searchRow}>
          <Input type="search" placeholder="Search your transcripts" aria-label="Search transcripts" value={query} enterKeyHint="search"
            onChange={(ev) => setQuery(ev.target.value)} />
          {terms.length > 0 && shown && (
            <span className="m muted" style={{ fontSize: 12 }} role="status">
              {shown.length === 0 ? "No transcript mentions that" : `${shown.length} of ${j.items.length} ${j.items.length === 1 ? "entry" : "entries"}`}
            </span>
          )}
        </div>
      )}

      {shown && groupByDay(shown).map(([label, list]) => {
        const secs = list.reduce((n, i) => n + (i.entry?.audioDuration || 0), 0);
        return (
          <section key={label} className={a.dayGroup}>
            <div className={a.dayHead}>
              <span className="eb">{label}</span>
              <span className="m muted">{list.length} {list.length === 1 ? "entry" : "entries"}{secs ? ` · ${clock(secs)}` : ""}</span>
            </div>
            {list.map((item) => <EntryCard key={item.id} item={item} terms={terms} flash={flash === item.id} />)}
          </section>
        );
      })}

    </div>
  );
}

function groupByDay(items: Item[]): [string, Item[]][] {
  const groups = new Map<string, Item[]>();
  items.forEach((i) => { const l = dayLabel(i.createdMs); groups.set(l, [...(groups.get(l) || []), i]); });
  return [...groups.entries()];
}

function EntryCard({ item, terms, flash }: { item: Item; terms: string[]; flash: boolean }) {
  const j = useJournal();
  const e = item.entry;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(e?.transcript || "");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [full, setFull] = useState(false);
  const step: TxStep | undefined = j.transcribing[item.id];
  const working = step !== undefined;
  // Words a transcription brings rise into place. Each run is measured against the entry as it was when the run
  // began, so a failed run, and words already there when the list opened, stay still. Adjusted during render.
  const [run, setRun] = useState<{ working: boolean; from: string | null }>({ working: false, from: null });
  if (working !== run.working) setRun({ working, from: working && e ? e.updatedAt ?? "" : run.from });
  const landed = run.from !== null && !working && (e?.updatedAt ?? "") !== run.from;
  // A long transcript folds so the list stays scannable; a search shows every word it matched.
  const long = (e?.transcript || "").length > FOLD_AT && !terms.length;

  async function save() {
    setSaving(true);
    try { await j.saveText(item.id, text.trim()); setEditing(false); j.say("Note saved"); }
    catch (e) { report("journal", "note_save_failed", e); j.say("Couldn't save the note"); }
    finally { setSaving(false); }
  }

  if (!e) {
    return (
      <Card id={"entry-" + item.id}>
        <div className={a.entryHead}><span className="m muted" style={{ fontSize: 12 }}>{timeLabel(item.createdMs)}</span><Tag>can&apos;t decrypt</Tag></div>
        <p className="muted" style={{ fontSize: 13 }}>This entry was encrypted with a different passphrase. It is still stored; it just cannot be read with this one.</p>
      </Card>
    );
  }

  return (
    <Card id={"entry-" + item.id} className={flash ? a.flash : undefined}>
      <div className={a.entryHead}>
        {/* Just the time: the player under it already says how long the recording is. */}
        <span className="m muted" style={{ fontSize: 12 }}>{timeLabel(item.createdMs)}</span>
        <span className={a.entryTags}>
          {e.mood && <Tag tone="journal">{e.mood.toLowerCase()}</Tag>}
          {e.recovered && <Tag>recovered</Tag>}
          {e.addedLater && <Tag>added later</Tag>}
          {item.pending && <Tag>waiting to upload</Tag>}
        </span>
      </div>

      {e.hasAudio && <Player id={item.id} mime={e.audioMime} local={item.pending} seconds={e.audioDuration} />}

      {editing ? (
        <>
          <textarea className={a.note} value={text} maxLength={20000} rows={5} autoFocus aria-label="Note" placeholder="What was this one about?" onChange={(ev) => setText(ev.target.value)} />
          <div className={a.rowButtons}>
            <Button size="sm" variant="journal" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save note"}</Button>
            <Button size="sm" variant="secondary" onClick={() => { setText(e.transcript || ""); setEditing(false); }}>Cancel</Button>
          </div>
        </>
      ) : (
        <>
          {e.transcript
            ? <>
                {/* Keyed on the save, so new words mount fresh and rise in; a transcript being redone waits, dimmed. */}
                <p key={e.updatedAt ?? ""} className={`${a.transcript} ${long && !full ? a.folded : ""} ${working ? a.redoing : ""} ${landed ? a.landed : ""}`}><Marked text={e.transcript} terms={terms} /></p>
                {long && <button type="button" className={a.readAll} aria-expanded={full} onClick={() => setFull(!full)}>{full ? "Show less" : "Read all"}</button>}
              </>
            : working
              ? <span className={a.coming} aria-hidden><i /><i /><i /></span>
              : <p className="muted" style={{ fontSize: 13 }}>{j.cloudOn ? "No transcript yet." : "No transcript. Cloud transcription is off; turn it on in Settings, or write a note."}</p>}
          <div className={a.entryActions}>
            {/* From the tap until the words land, the links give way to what the job is doing. Editing or deleting
                mid-run would be overwritten, or brought back, by the save at its end. */}
            {working ? (
              <span className={a.txStatus} role="status">
                <span className={a.txSpin} aria-hidden />
                <span key={step} className={a.txLabel}>{TX_LABEL[step]}</span>
              </span>
            ) : (
              <span className={a.entryLinks}>
                {!item.pending && <button type="button" className={a.lnk} onClick={() => setEditing(true)}>{e.transcript ? "Edit" : "Add a note"}</button>}
                {/* Transcribe takes the journal hue only while the entry has no words yet: then it is the thing to do
                    next. Once there is a transcript, a redo is as quiet as Edit and Delete. */}
                {!item.pending && e.hasAudio && j.cloudOn && <button type="button" className={e.transcript ? a.lnk : `${a.lnk} ${a.lnkJournal}`} onClick={() => { haptic(); j.transcribeEntry(item.id); }}>{e.transcript ? "Transcribe again" : "Transcribe"}</button>}
              </span>
            )}
            {working ? null : confirming ? (
              <span className={a.rowButtons}>
                <Button size="sm" variant="danger" onClick={() => void j.remove(item.id).then(() => j.say("Entry deleted"), () => j.say("Couldn't delete the entry"))}>Delete for good</Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>Keep</Button>
              </span>
            ) : <button type="button" className={a.lnk} onClick={() => setConfirming(true)}>Delete</button>}
          </div>
        </>
      )}
    </Card>
  );
}

// A few milliseconds of silence. iOS only lets an <audio> element play if play() was called on it during a tap,
// and the recording is not ready during the tap: it still has to be downloaded and decrypted. So the tap plays
// this, which "blesses" the element, and the same element is then given the real recording.
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

type Step = "download" | "decrypt" | "convert" | "play";
const STEP_LABEL: Record<Step, string> = { download: "Downloading…", decrypt: "Decrypting…", convert: "Converting…", play: "Starting playback…" };
// How far into the conversion each step of toWav (playable.ts) is. Decoding says nothing until it ends, so these
// mark steps reached, not a measure of work done.
const CONVERT_AT: Record<string, [number, string]> = { read: [0.05, "reading"], decode_offline: [0.15, "decoding"], decode_live: [0.5, "decoding, second try"], encode: [0.85, "writing"] };
// Safari (every browser on iOS) records WebM it cannot play back, so there the conversion is planned from the start
// instead of waiting for play() to refuse, or stall.
const needsConvert = (mime: string) => mime.includes("webm") && /apple/i.test(navigator.vendor);
const mb = (n: number) => (n / 1048576).toFixed(1);
// The log's stage names (stage below) folded into the steps the bar shows.
const stepOf = (stage: string): Step => stage === "download" || stage === "decrypt" ? stage : stage.startsWith("convert") ? "convert" : "play";

type Shown = { steps: Step[]; at: Step; progress: StepProgress; detail?: string; failed?: string; note?: string };

/** Downloads and decrypts the audio on first play, then keeps the object URL for the life of the card. While it
 *  opens, a bar under the button shows each step that will run; a failure names the stage the admin log names.
 *  The track beside the button fills as it plays, and once it has played a tap on the track jumps there. */
function Player({ id, mime: entryMime, local, seconds }: { id: string; mime: string; local: boolean; seconds: number }) {
  const j = useJournal();
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "playing" | "paused" | "failed">("idle");
  const [shown, setShown] = useState<Shown | null>(null);
  const [pos, setPos] = useState(0);

  useEffect(() => () => { audio.current?.pause(); if (url.current) URL.revokeObjectURL(url.current); }, []);

  const toggle = useCallback(async () => {
    const el = audio.current;
    if (state === "playing") { el?.pause(); return setState("paused"); }
    // Loaded already: this play() runs inside the tap, which every browser allows.
    if (el && url.current) {
      try { await el.play(); setShown(null); setState("playing"); }
      catch (e) {
        report("journal", "playback_failed", e, { stage: "replay", mime: el.dataset.mime || "" });
        setShown({ steps: ["play"], at: "play", progress: 1, failed: "Failed: replay" });
        j.say("Couldn't play this recording");
      }
      return;
    }
    setState("loading");
    // Every await below is bounded (within): a promise that never settles used to leave the button disabled on
    // "Decrypting…" with nothing in the log. Now it fails, and the log names the step and how long it had run.
    const began = Date.now();
    let stage = "unlock", mime = "", bytes = 0, live = true;
    const plan: Step[] = [...(local ? [] : ["download", "decrypt"] as Step[]), ...(needsConvert(entryMime) ? ["convert"] as Step[] : [])];
    // A step that was not planned (a conversion nobody expected) joins the bar when it starts. A step that timed
    // out may still be running underneath; once the outcome is shown, nothing it reports may overwrite it.
    const show = (at: Step, progress: StepProgress, detail?: string) => {
      if (!live) return;
      if (!plan.includes(at)) plan.push(at);
      setShown({ steps: [...plan], at, progress, detail });
    };
    setShown(null);
    try {
      const fresh = audio.current = new Audio();
      fresh.preload = "auto";
      fresh.ontimeupdate = () => setPos(fresh.currentTime);
      fresh.onended = () => { setState("paused"); setPos(0); };
      // Still inside the tap. A refusal here is not fatal: the second tap, once loaded, always works.
      fresh.src = SILENCE;
      const blessed = within(fresh.play(), 5000, "unlock").then(() => true, () => false);

      stage = "download";
      const blob = await within(j.audioFor(id, (p) => {
        stage = p.step;
        if (p.step === "decrypt") return show("decrypt", "atomic");
        show("download", p.total ? p.done / p.total : "unknown", p.total ? `${mb(p.done)} / ${mb(p.total)} MB` : p.done ? `${mb(p.done)} MB` : undefined);
      }), 120000, "download");
      mime = blob.type; bytes = blob.size;
      fresh.dataset.mime = mime;
      url.current = URL.createObjectURL(blob);
      await blessed;
      fresh.pause();
      fresh.src = url.current;

      // iOS will not play the WebM it recorded itself, though it decodes it: replay it as WAV.
      const convert = async (refused?: unknown) => {
        stage = "convert";
        show("convert", 0);
        const { wav, via } = await toWav(blob, (step) => { stage = "convert:" + step; show("convert", CONVERT_AT[step][0], CONVERT_AT[step][1]); });
        show("convert", 1);
        report("journal", "playback_converted", refused, { from: mime, bytes, wavBytes: wav.size, via, planned: !refused, ms: Date.now() - began }, "warn");
        URL.revokeObjectURL(url.current!);
        url.current = URL.createObjectURL(wav);
        mime = fresh.dataset.mime = wav.type;
        fresh.src = url.current;
        stage = "play_wav";
        await within(fresh.play(), 15000, "play_wav");
      };
      try {
        if (plan.includes("convert")) await convert();
        else {
          stage = "play";
          try { await within(fresh.play(), 15000, "play"); }
          catch (e) {
            // A play() that stalls instead of refusing gets the same treatment.
            if (!["NotSupportedError", "TimeoutError"].includes((e as { name?: string })?.name || "") || mime.includes("wav")) throw e;
            await convert(e);
          }
        }
        live = false;
        setShown(null);
        setState("playing");
      }
      catch (e) {
        // The tap ran out while decrypting. The recording is loaded now, so one more tap plays it at once.
        if ((e as { name?: string })?.name !== "NotAllowedError") throw e;
        live = false;
        report("journal", "playback_needs_second_tap", e, { mime, bytes }, "warn");
        setShown(plan.length ? { steps: [...plan], at: plan[plan.length - 1], progress: 1, note: "Ready. Tap play." } : null);
        setState("ready");
        j.say("Ready. Tap play.");
      }
    } catch (e) {
      live = false;
      report("journal", "playback_failed", e, { stage, mime, bytes, ms: Date.now() - began, canPlay: mime ? new Audio().canPlayType(mime.split(";")[0]) || "no" : "" });
      if (url.current) { URL.revokeObjectURL(url.current); url.current = null; }
      audio.current = null;
      const at = stepOf(stage);
      if (!plan.includes(at)) plan.push(at);
      setShown({ steps: [...plan], at, progress: 1, failed: "Failed: " + stage });
      setState("failed");
      j.say(stage === "download" ? "Couldn't load this recording" : "Couldn't play this recording");
    }
  }, [state, id, entryMime, local, j]);

  // The recording's own length, saved with the entry: WebM from a phone often reports no duration of its own.
  const total = seconds > 0 ? seconds : 0;
  const live = state === "playing" || state === "paused";
  const seek = (ev: React.PointerEvent<HTMLSpanElement>) => {
    const el = audio.current;
    if (!el || !url.current || !total) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const at = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * total;
    try { el.currentTime = at; setPos(at); }
    catch (e) { report("journal", "seek_failed", e, { mime: el.dataset.mime || "" }, "warn"); }
  };

  return (
    <div className={a.playerBox}>
      <div className={a.player}>
        <button type="button" className={a.play} onClick={() => void toggle()} aria-label={state === "playing" ? "Pause" : state === "failed" ? "Try again" : "Play"} disabled={state === "loading"}>
          <Icon name={state === "playing" ? "pause" : "play"} size={16} />
        </button>
        <span className={`${a.track} ${live ? a.trackLive : ""}`} onPointerDown={live ? seek : undefined} aria-hidden>
          <i style={{ width: `${total ? Math.min(100, (pos / total) * 100).toFixed(1) : 0}%` }} />
        </span>
        <span className={`m muted ${a.playTime}`}>{state === "loading" ? "Opening" : state === "failed" ? "Try again" : state === "ready" ? "Tap play" : live ? `${clock(pos)} / ${clock(total || pos)}` : total ? clock(total) : "Play"}</span>
      </div>
      {shown && <StageBar domain="journal" steps={shown.steps.map((st) => STEP_LABEL[st])} at={shown.steps.indexOf(shown.at)} progress={shown.progress} detail={shown.detail} failed={shown.failed} note={shown.note} />}
    </div>
  );
}
