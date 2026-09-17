"use client";

// The Journal screen: entries newest first, playback, a written note per entry, and the floating mic.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Icon, MicButton, Tag } from "@/components/ui";
import { clock } from "@/lib/journal";
import { dayKey } from "@/lib/today";
import { useJournal, type Item } from "./Journal";
import a from "./app.module.css";

const dayLabel = (ms: number) => {
  const d = new Date(ms), today = new Date(), y = new Date(); y.setDate(y.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return "Today";
  if (dayKey(d) === dayKey(y)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
};
const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();

export function JournalScreen() {
  const j = useJournal();

  return (
    <div className={`${a.page} ${a.journalPage}`}>
      <div className={a.pageHead}>
        <span className={`d ${a.pageTitle}`}>Journal</span>
        {j.vault === "open" && <button type="button" className={a.lnk} onClick={j.lock}><Icon name="lock" size={14} /> Lock</button>}
      </div>

      {j.vault === "checking" && <span className="eb">Checking your vault</span>}

      {(j.vault === "none" || j.vault === "locked") && (
        <Card>
          <span className="d" style={{ fontSize: 22 }}>{j.vault === "none" ? "Make your vault first" : "Your vault is locked"}</span>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            {j.vault === "none"
              ? "Entries are encrypted on your device with a passphrase only you know, then uploaded. Choose that passphrase once and you can start recording."
              : "Enter your passphrase to read and record entries on this device."}
          </p>
          <div><Button variant="journal" onClick={j.openVault}>{j.vault === "none" ? "Create vault" : "Unlock"}</Button></div>
        </Card>
      )}

      {j.vault === "open" && j.items === null && <span className="eb">Decrypting entries</span>}
      {j.vault === "open" && j.items?.length === 0 && !j.recording && (
        <Card><p className="muted">Nothing here yet. Tap the microphone and talk for two minutes; that is plenty.</p></Card>
      )}

      {j.items && groupByDay(j.items).map(([label, list]) => (
        <section key={label} className={a.dayGroup}>
          <span className="eb">{label}</span>
          {list.map((item) => <EntryCard key={item.id} item={item} />)}
        </section>
      ))}

      <div className={a.fab}>
        {j.recording && <span className={`m ${a.recBadge}`}>Recording · {clock(j.seconds)} · tap to stop</span>}
        <MicButton recording={j.recording} onClick={() => j.toggleRecording(null)} />
      </div>
    </div>
  );
}

function groupByDay(items: Item[]): [string, Item[]][] {
  const groups = new Map<string, Item[]>();
  items.forEach((i) => { const l = dayLabel(i.createdMs); groups.set(l, [...(groups.get(l) || []), i]); });
  return [...groups.entries()];
}

function EntryCard({ item }: { item: Item }) {
  const j = useJournal();
  const e = item.entry;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(e?.transcript || "");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const working = j.transcribing.includes(item.id);

  async function save() {
    setSaving(true);
    try { await j.saveText(item.id, text.trim()); setEditing(false); j.say("Note saved"); }
    catch { j.say("Couldn't save the note"); }
    finally { setSaving(false); }
  }

  if (!e) {
    return (
      <Card>
        <div className={a.entryHead}><span className="m muted" style={{ fontSize: 12 }}>{timeLabel(item.createdMs)}</span><Tag>can&apos;t decrypt</Tag></div>
        <p className="muted" style={{ fontSize: 13 }}>This entry was encrypted with a different passphrase. It is still stored; it just cannot be read with this one.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className={a.entryHead}>
        <span className="m muted" style={{ fontSize: 12 }}>{timeLabel(item.createdMs)}{e.audioDuration ? ` · ${clock(e.audioDuration)}` : ""}</span>
        <span className={a.entryTags}>
          {e.mood && <Tag tone="journal">{e.mood.toLowerCase()}</Tag>}
          {e.recovered && <Tag>recovered</Tag>}
          {item.pending && <Tag>waiting to upload</Tag>}
        </span>
      </div>

      {e.hasAudio && <Player id={item.id} />}

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
            ? <p className={a.transcript}>{e.transcript}</p>
            : working
              ? <p className="muted" style={{ fontSize: 13 }}>Transcribing… this usually takes a few seconds.</p>
              : <p className="muted" style={{ fontSize: 13 }}>{j.cloudOn ? "No transcript yet." : "No transcript. Cloud transcription is off; turn it on in Settings, or write a note."}</p>}
          <div className={a.entryActions}>
            <span className={a.rowButtons}>
              {!item.pending && <button type="button" className={a.lnk} onClick={() => setEditing(true)}>{e.transcript ? "Edit" : "Add a note"}</button>}
              {!item.pending && e.hasAudio && j.cloudOn && !working && <button type="button" className={a.lnk} style={{ color: "var(--journal)" }} onClick={() => j.transcribeEntry(item.id)}>{e.transcript ? "Transcribe again" : "Transcribe"}</button>}
            </span>
            {confirming ? (
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

/** Downloads and decrypts the audio on first play, then keeps the object URL for the life of the card. */
function Player({ id }: { id: string }) {
  const j = useJournal();
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [pos, setPos] = useState(0);

  useEffect(() => () => { audio.current?.pause(); if (url.current) URL.revokeObjectURL(url.current); }, []);

  const toggle = useCallback(async () => {
    if (state === "playing") { audio.current?.pause(); return setState("paused"); }
    if (audio.current) { await audio.current.play(); return setState("playing"); }
    setState("loading");
    try {
      url.current = URL.createObjectURL(await j.audioFor(id));
      const el = audio.current = new Audio(url.current);
      el.ontimeupdate = () => setPos(el.currentTime);
      el.onended = () => { setState("paused"); setPos(0); };
      await el.play();
      setState("playing");
    } catch {
      setState("idle");
      j.say("Couldn't play this recording");
    }
  }, [state, id, j]);

  return (
    <div className={a.player}>
      <button type="button" className={a.play} onClick={() => void toggle()} aria-label={state === "playing" ? "Pause" : "Play"} disabled={state === "loading"}>
        <Icon name={state === "playing" ? "pause" : "play"} size={16} />
      </button>
      <span className="m muted" style={{ fontSize: 12 }}>{state === "loading" ? "Decrypting…" : state === "idle" ? "Play recording" : clock(pos)}</span>
    </div>
  );
}
