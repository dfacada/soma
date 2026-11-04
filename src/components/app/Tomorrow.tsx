"use client";

// Tomorrow's brief, full screen (/tomorrow/), the card on Today that opens it from 6 pm, and its Settings card.
// Soma Night, facts only: what the day holds, never what to do with it.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Field, Icon, Input, Medallion, Switch, Tag, type Domain, type IconName } from "@/components/ui";
import type { Provider } from "@/lib/brief-api";
import type { Driver } from "@/lib/great-days";
import { report } from "@/lib/log";
import { enablePush, pushState, type PushState } from "@/lib/push";
import { api } from "@/lib/api";
import {
  clockLabel, dueTasks, eventTime, lengthLabel, rangeLabel, summaryLine, taskClock, timeline, todoistUrl,
  type BriefEvent, type BriefTask, type Insight, type SomaSide,
} from "@/lib/tomorrow";
import { fromKey } from "@/lib/today";
import { useTomorrow } from "./Brief";
import { useJournal } from "./Journal";
import { LINE } from "./Nudge";
import { useSession } from "./Session";
import { useGoTab } from "./tabs";
import a from "./app.module.css";
import s from "./tomorrow.module.css";
import t from "./today.module.css";

const hue = (d: Domain) => ({ "--hue": `var(--${d})` }) as CSSProperties;
const fmt = (n: number) => n.toLocaleString("en-US");
const weekdayOf = (day: string) => fromKey(day).toLocaleDateString("en-GB", { weekday: "long" });
/** A length short enough for a stat: "45m", "2h", "5h10". */
const compact = (ms: number) => { const min = Math.round(ms / 60000); return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}`; };

/** On Today from 6 pm: the day ahead in one line, and the way into the brief. */
export function TomorrowCard() {
  const { day, soma, brief } = useTomorrow();
  const weekday = weekdayOf(day);
  return (
    <Link href="/tomorrow/" className={`${t.tile} ${t.wide} ${s.cardLink}`} style={hue("journal")} aria-label={`Tomorrow's brief: ${weekday}`}>
      <span className={t.hit}>
        <span className={t.row}>
          <span className={t.grow}>
            <span className={t.th}><Medallion domain="journal" icon="moon" /><span className="eb">Tomorrow</span></span>
            <span className={`d ${t.title}`}>{weekday}</span>
            <span className={t.sub}>{summaryLine(brief, soma)}{brief ? "" : " · see the day"}</span>
          </span>
          <span className={s.go}><Icon name="chevron" size={22} strokeWidth={2} /></span>
        </span>
      </span>
    </Link>
  );
}

export function TomorrowScreen() {
  const goTab = useGoTab();
  const journal = useJournal();
  const { settings } = useSession();
  const { day, soma, links, brief, awake, free, insight, building, build, refreshIfStale, send } = useTomorrow();
  const close = useCallback(() => goTab("today"), [goTab]);
  const shut = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    shut.current?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [close]);
  // Opening the brief reads the calendar and tasks again when what this device holds is missing or stale.
  useEffect(() => { refreshIfStale(); }, [refreshIfStale]);

  // Send to Telegram shows only when a chat is paired (Settings, under Week in review).
  const [telegram, setTelegram] = useState(false);
  useEffect(() => {
    let alive = true;
    api<{ connected: boolean }>("GET", "/telegram").then((r) => { if (alive) setTelegram(r.connected); }, () => undefined);
    return () => { alive = false; };
  }, []);
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNote] = useState<{ ok: boolean; text: string } | null>(null);
  const sendNow = async () => {
    setSending(true); setSendNote(null);
    const why = await send();
    setSending(false);
    setSendNote(why ? { ok: false, text: why } : { ok: true, text: `Sent to Telegram at ${clockLabel(Date.now())}` });
  };

  const weekday = weekdayOf(day);
  const date = fromKey(day).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const connected = Boolean(links && (links.morgen || links.todoist));
  const locked = journal.vault !== "open";

  const events = brief?.events ?? null;
  const timed = events?.filter((e) => !e.allDay) ?? [];
  const first = timed.find((e) => e.start >= fromKey(day).setHours(0, 0, 0, 0));
  const freeMs = free?.reduce((n, b) => n + b.end - b.start, 0) ?? 0;
  const [firstTime, firstHalf] = first ? clockLabel(first.start).split(" ") : ["—", ""];

  return (
    <main className={s.screen} aria-label={`Tomorrow's brief, ${weekday} ${date}`}>
      <div className={s.inner}>
        <div className={s.bar}>
          <button ref={shut} type="button" className={s.x} onClick={close} aria-label="Close the brief"><Icon name="close" size={18} /></button>
          <span className="eb">Tomorrow&apos;s brief</span>
          {connected && !locked
            ? <button type="button" className={`${s.x} ${building ? s.spin : ""}`} onClick={build} disabled={building} aria-label="Read the calendar and tasks again"><Icon name="refresh" size={18} /></button>
            : <span className={s.barEnd} />}
        </div>

        <header className={s.hero}>
          <span className="eb">{date}</span>
          <h1 className={`d ${s.day}`}>{weekday}</h1>
          <div className={s.stats}>
            {events
              ? <>
                <Stat value={String(timed.length)} label={timed.length === 1 ? "event" : "events"} />
                <Stat value={firstTime} label={first ? `first · ${firstHalf}` : "nothing booked"} />
                <Stat value={free ? compact(freeMs) : "—"} label="free" />
              </>
              : <>
                <Stat value={soma.pushups.rest ? "Rest" : fmt(soma.pushups.target)} label={soma.pushups.rest ? "no push-ups" : "push-ups"} />
                <Stat value={fmt(soma.kcal)} label="kcal" />
                <Stat value={String(soma.weighIn ? 5 : 4)} label="to close" />
              </>}
          </div>
        </header>

        {links && !connected && (
          <section className={s.card} aria-label="Your calendar and tasks">
            <span className="eb">Your calendar and tasks</span>
            <p className={s.rowSub}>Connect Morgen and Todoist in Settings, under Tomorrow&apos;s brief, and the day&apos;s events, free time and tasks show here.</p>
            <div><Link href="/settings/#brief" className={s.pill}>Open Settings</Link></div>
          </section>
        )}
        {connected && locked && (
          <section className={s.card} aria-label="Unlock">
            <span className="eb">Your calendar and tasks</span>
            <p className={s.rowSub}>Your Morgen and Todoist keys are sealed with your vault. Unlock it to read tomorrow.</p>
            <div><Button size="sm" variant="journal" onClick={journal.openVault}>Unlock</Button></div>
          </section>
        )}
        {connected && !locked && !brief && (
          <section className={s.card} aria-label="Reading"><span className="eb">Reading your calendar and tasks…</span><div className={s.skel}><i /><i /><i /></div></section>
        )}

        {brief && links?.morgen && <CalendarCard events={events} error={brief.eventsError} free={free} awake={awake} day={day} onRetry={build} />}
        {brief && links?.todoist && <TasksCard tasks={brief.tasks} error={brief.tasksError} events={events} day={day} onRetry={build} />}

        <SomaCard soma={soma} />
        {insight && <InsightCard insight={insight} />}

        {(telegram || (brief && connected)) && (
          <div className={s.foot}>
            {telegram && <Button variant="secondary" disabled={sending} onClick={() => void sendNow()}><Icon name="send" size={16} />{sending ? "Sending…" : "Send to Telegram"}</Button>}
            {sendNote && <p role={sendNote.ok ? "status" : "alert"} className={sendNote.ok ? s.built : a.noteBad}>{sendNote.text}</p>}
            {!sendNote && settings.brief.sent === day && <p className={s.built}>Sent to Telegram</p>}
            {brief && connected && <p className={s.built}>Read at {clockLabel(brief.builtMs)}{building ? " · reading again…" : ""}</p>}
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className={s.stat}><span className="dc">{value}</span><span className="eb">{label}</span></div>;
}

function Row({ domain, icon, title, sub, children }: { domain: Domain; icon: IconName; title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className={s.row}>
      <Medallion domain={domain} icon={icon} />
      <div className={s.rowText}>
        <span className={s.rowTitle}>{title}</span>
        {sub && <span className={s.rowSub}>{sub}</span>}
        {children}
      </div>
    </div>
  );
}

function Problem({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className={s.problem} role="alert">
      <span>{text}</span>
      <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>
    </div>
  );
}

/** The day in order, with the free time between: all-day events above, then each event and each free block. */
function CalendarCard({ events, error, free, awake, day, onRetry }: {
  events: BriefEvent[] | null; error?: string; free: { start: number; end: number }[] | null; awake: { start: number; end: number; fromFitbit: boolean } | null; day: string; onRetry: () => void;
}) {
  const allDay = events?.filter((e) => e.allDay) ?? [];
  const rows = events && free ? timeline(events, free) : [];
  return (
    <section className={s.card} aria-label="Calendar">
      <div className={s.cardHead}><span className="eb">Calendar</span><span className={s.source}>Morgen</span></div>
      {error && <Problem text={error} onRetry={onRetry} />}
      {allDay.length > 0 && (
        <div className={s.allDay}>
          {allDay.map((e) => <span key={e.id} className={s.allDayPill} style={{ "--c": e.color || "var(--journal)" } as CSSProperties}><i />{e.title}</span>)}
        </div>
      )}
      {events && rows.length === 0 && <p className={s.rowSub}>Nothing booked.</p>}
      {rows.length > 0 && (
        <ol className={s.timeline}>
          {rows.map((r) => r.kind === "free" ? (
            <li key={`free-${r.start}`} className={s.freeRow}>
              <span className={`m ${s.when}`}>{clockLabel(r.start)}</span>
              <span className={s.freeBox}><b>Free · {lengthLabel(r.end - r.start)}</b><span>{rangeLabel(r.start, r.end)}</span></span>
            </li>
          ) : (
            <li key={r.event.id} className={s.eventRow}>
              <span className={`m ${s.when}`}>{r.event.start < fromKey(day).setHours(0, 0, 0, 0) ? "…" : clockLabel(r.event.start)}</span>
              <span className={`${s.eventBox} ${r.event.busy ? "" : s.eventFree}`} style={{ "--c": r.event.color || "var(--journal)" } as CSSProperties}>
                <b>{r.event.task && <Icon name="task" size={14} />}{r.event.title}</b>
                <span>{[eventTime(r.event, day), r.event.calendar, r.event.location, r.event.video ? "video call" : "", r.event.busy ? "" : "shown as free"].filter(Boolean).join(" · ")}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {awake && <p className={s.note}>Free time is counted from {clockLabel(awake.start)} to {clockLabel(awake.end)}{awake.fromFitbit ? ", your usual waking hours from Fitbit" : ""}, in blocks of half an hour or more.</p>}
    </section>
  );
}

/** What is due on the day, and only that. Read-only: a tap opens the task in Todoist. */
function TasksCard({ tasks, error, events, day, onRetry }: { tasks: BriefTask[] | null; error?: string; events: BriefEvent[] | null; day: string; onRetry: () => void }) {
  const due = tasks ? dueTasks(tasks, day, events || []) : null;
  return (
    <section className={s.card} aria-label="Todoist">
      <div className={s.cardHead}><span className="eb">Todoist</span>{due && <span className={s.source}>{due.length} task{due.length === 1 ? "" : "s"}</span>}</div>
      {error && <Problem text={error} onRetry={onRetry} />}
      {due && due.length === 0 && <p className={s.rowSub}>Nothing due {weekdayOf(day)}.</p>}
      {due && due.length > 0 && <TaskList title={`Due ${weekdayOf(day)} · ${due.length}`} tasks={due} when={(x) => taskClock(x)} />}
    </section>
  );
}

function TaskList({ title, tasks, when }: { title: string; tasks: BriefTask[]; when: (task: BriefTask) => string | null }) {
  return (
    <div className={s.group}>
      <span className={s.groupHead}>{title}</span>
      <ul className={s.tasks}>
        {tasks.map((x) => (
          <li key={x.id}>
            <a className={s.task} href={todoistUrl(x.id)} target="_blank" rel="noreferrer">
              <span className={s.tick} aria-hidden />
              <span className={s.taskText}>{x.text}</span>
              <span className={s.taskMeta}>
                {x.priority > 1 && <Tag tone={x.priority === 4 ? "activity" : undefined}>P{5 - x.priority}</Tag>}
                {when(x) && <span className="m">{when(x)}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What Soma already knows about the day: the five things that close it, with the plan and the round filled in. */
function SomaCard({ soma }: { soma: SomaSide }) {
  const p = soma.pushups;
  return (
    <section className={s.card} aria-label="Soma">
      <span className="eb">Soma</span>
      {soma.weighIn && <Row domain="food" icon="scale" title="Weigh in" sub="One of the five things that close the day." />}
      <Row domain="journal" icon="heart" title="Check in and journal" sub="A mood, your habits, and a few words." />
      <Row domain="food" icon="leaf" title="Four meals planned" sub={`${fmt(soma.kcal)} kcal · ${fmt(soma.protein)} g protein`}>
        <div className={s.meals}>
          {soma.meals.map((m) => (
            <div key={m.key} className={s.meal}>
              <span className="eb">{m.meal}</span><span className={s.mealName}>{m.name}</span><span className="m">{fmt(m.kcal)}</span>
            </div>
          ))}
        </div>
      </Row>
      {p.rest
        ? <Row domain="activity" icon="barbell" title="Rest day" sub="No push-up target. Any activity still closes the day." />
        : <Row domain="activity" icon="barbell" title={`${fmt(p.target)} push-ups`} sub={p.dayNumber ? `Day ${p.dayNumber} of the round.` : "Your daily target."} />}
    </section>
  );
}

const pct = (side: Driver["did"]) => `${Math.round((side.hits / side.days) * 100)}%`;

/** The one line from Insights, with the numbers it rests on. */
function InsightCard({ insight }: { insight: Insight }) {
  const d = insight.driver;
  return (
    <section className={`${s.card} ${s.insight}`} aria-label="From Insights">
      <span className="eb">From Insights</span>
      <div className={s.row}>
        <span className={s.spark}><Icon name="spark" size={18} /></span>
        <div className={s.rowText}>
          <span className={s.insightText}>{insight.text}.</span>
          <span className={s.rowSub}>{pct(d.did)} of the days you did were great, {pct(d.didnt)} of the days you didn&apos;t. The last 60 days.</span>
        </div>
      </div>
    </section>
  );
}

// ── Settings ──

const HELP: Record<Provider, { name: string; off: string; on: string; label: string }> = {
  morgen: {
    name: "Morgen",
    off: "Your calendar, from every account connected to Morgen: Google, and anything you made in Morgen. Get the key at platform.morgen.so, under Developers API. It is sealed with your vault key; for each read Soma's server passes it to Morgen and keeps nothing, because Morgen won't take calls from Soma's page directly.",
    on: "Connected. Read when the brief opens; Soma's server passes the key to Morgen and keeps neither the key nor your events.",
    label: "Morgen API key",
  },
  todoist: {
    name: "Todoist",
    off: "Tasks due tomorrow, and only those. In Todoist: Settings → Integrations → Developer → API token. Sealed with your vault key and used only by this phone, straight with Todoist: Soma's server never sees it. Soma only reads.",
    on: "Connected. Read straight from Todoist on this phone; Soma only reads, never changes a task.",
    label: "Todoist API token",
  },
};

/** Where a Morgen calendar lives, in the provider's own name. */
const SOURCES: Record<string, string> = { google: "Google", o365: "Microsoft", icloud: "iCloud", fastmail: "Fastmail", caldav: "CalDAV", feed: "Subscribed feed" };

/** Settings → Tomorrow's brief: the two keys, and which Morgen calendars count. */
export function TomorrowSettings({ say }: { say: (m: string) => void }) {
  const journal = useJournal();
  const { settings, saveSettings } = useSession();
  const { links, calendars, skipped, setSkipped, disconnect } = useTomorrow();
  const open = journal.vault === "open";
  const b = settings.brief;
  return (
    <>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>
        From 6 pm a card on Today opens the next day: your calendar with the free time between, your tasks, and Soma&apos;s side of it.
      </p>
      <BriefNotice say={say} />
      <Field name="Send it to Telegram" help="Once a day, the first time the brief is read after its time, it goes to the Telegram chat connected under Week in review: times and titles, tasks and Soma's side, never a description, an attendee or a link. Telegram keeps what it is sent. The brief also has a Send button.">
        <Switch checked={b.telegram} label="Send tomorrow's brief to Telegram" onChange={(v) => void saveSettings({ brief: { ...b, telegram: v } }).then(() => say(v ? "The brief will go to Telegram" : "The brief stays in Soma"), () => say("Couldn't save that"))} />
      </Field>
      {!open && journal.vault !== "checking" && (
        <Field name="Keys" help="Both keys are kept sealed with your vault. Unlock it to connect or change them.">
          <Button size="sm" variant="journal" onClick={journal.openVault}>{journal.vault === "none" ? "Create vault" : "Unlock"}</Button>
        </Field>
      )}
      {(["morgen", "todoist"] as Provider[]).map((p) => (
        <KeyField key={p} provider={p} linked={Boolean(links?.[p])} open={open} say={say} onDisconnect={async () => {
          try { await disconnect(p); say(`${HELP[p].name} disconnected`); } catch { say("Couldn't disconnect"); }
        }} />
      ))}
      {open && links?.morgen && calendars && calendars.length > 0 && (
        <div className={s.calendars}>
          <span className={s.groupHead}>Calendars in the brief</span>
          {calendars.map((c) => {
            const on = !skipped.includes(c.id);
            return (
              <div key={c.id} className={s.calendarRow}>
                <i style={{ "--c": c.color && /^#[0-9a-fA-F]{3,8}$/.test(c.color) ? c.color : "var(--journal)" } as CSSProperties} />
                <span className={s.calendarName}>{c.name}<small>{SOURCES[c.integration] || c.integration}</small></span>
                <Switch checked={on} label={`Include ${c.name}`} onChange={(v) => {
                  const next = v ? skipped.filter((id) => id !== c.id) : [...skipped, c.id];
                  void setSkipped(next).then(() => say(v ? `${c.name} is in the brief` : `${c.name} is left out`), () => say("Couldn't save that"));
                }} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** The evening notification that the brief is ready. The time belongs to the account (the server sends it); whether
 *  this device receives it is its own permission, asked for from the tap that switches it on (iOS needs that). */
function BriefNotice({ say }: { say: (m: string) => void }) {
  const { settings, saveSettings } = useSession();
  const b = settings.brief;
  const [device, setDevice] = useState<PushState | "checking">("checking");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    pushState().then((st) => { if (alive) setDevice(st); }, () => { if (alive) setDevice("unsupported"); });
    return () => { alive = false; };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      const state = await enablePush();
      setDevice(state);
      if (state !== "on") {
        report("push", "not_enabled", undefined, { state, for: "brief" }, "warn");
        say(state === "blocked" ? "Notifications are blocked on this device" : state === "needs-install" ? "Add Soma to your Home Screen first" : "Notifications were not allowed");
        return;
      }
      await saveSettings({ brief: { ...b, on: true } });
      say(`You'll hear at ${b.time} when tomorrow's brief is ready`);
    } catch (e) {
      report("push", "enable_failed", e, { for: "brief" });
      say(e instanceof Error ? e.message : "Couldn't turn notifications on");
    } finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true);
    try { await saveSettings({ brief: { ...b, on: false } }); say("No notification for the brief"); }
    catch { say("Couldn't save that"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Field name="Tell me when it's ready" help={`One notification each evening at the time below; tap it and the brief opens. ${LINE[device]}`}>
        <Switch checked={b.on && device === "on"} label="Notify me when tomorrow's brief is ready" onChange={(v) => { if (!busy) void (v ? turnOn() : turnOff()); }} />
      </Field>
      <Field name="Time" help="Your local time on this device. Checked every 15 minutes.">
        <Input compact type="time" step={900} aria-label="Brief time" value={draft ?? b.time}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft && /^\d{2}:\d{2}$/.test(draft) && draft !== b.time) void saveSettings({ brief: { ...b, time: draft } }).then(() => say(`Brief at ${draft}`), () => say("Couldn't save that")); setDraft(null); }} />
      </Field>
      {b.on && device === "off" && <div><Button size="sm" variant="secondary" disabled={busy} onClick={() => void turnOn()}>Turn on for this device</Button></div>}
    </>
  );
}

function KeyField({ provider, linked, open, say, onDisconnect }: { provider: Provider; linked: boolean; open: boolean; say: (m: string) => void; onDisconnect: () => void }) {
  const { connect } = useTomorrow();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const h = HELP[provider];
  const submit = async () => {
    setBusy(true); setError(null);
    const why = await connect(provider, value);
    setBusy(false);
    if (why) { setError(why); return; }
    setValue(""); setAdding(false); say(`${h.name} connected`);
  };
  return (
    <>
      <Field name={h.name} help={linked ? h.on : h.off}>
        {linked
          ? <Button size="sm" variant="secondary" onClick={onDisconnect}>Disconnect</Button>
          : open && !adding && <Button size="sm" variant="journal" onClick={() => setAdding(true)}>Connect</Button>}
      </Field>
      {adding && !linked && (
        <form className={a.draft} onSubmit={(e) => { e.preventDefault(); if (value.trim() && !busy) void submit(); }}>
          <Input type="password" autoComplete="off" spellCheck={false} aria-label={h.label} placeholder={h.label} value={value} onChange={(e) => setValue(e.target.value)} />
          {error && <p role="alert" className={a.noteBad} style={{ margin: 0 }}>{error}</p>}
          <div className={a.rowButtons}>
            <Button type="submit" variant="journal" disabled={!value.trim() || busy}>{busy ? "Checking…" : "Connect"}</Button>
            <Button variant="secondary" onClick={() => { setAdding(false); setValue(""); setError(null); }}>Cancel</Button>
          </div>
        </form>
      )}
    </>
  );
}
