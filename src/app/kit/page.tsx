"use client";

// /kit — every token and component in one place, live. This stands in for Storybook (docs/HANDOFF.md §4.1).

import { useCallback, useState } from "react";
import {
  Bar, Button, Card, Chip, DayGlyph, DayRing, Field, Icon, ICON_NAMES, Input, Medallion, MicButton, Mini, Pill,
  ProgressRing, Row, RowHead, Segmented, Select, Sheet, Sidebar, SideNote, Stat, Switch, TabBar, Tag, Tile, Tiles, Toast,
  type MedallionState, type Section,
} from "@/components/ui";
import k from "./kit.module.css";

const NEUTRALS = [
  ["Bone", "--bone", "#F4F3EF · page"], ["Surface", "--surface", "#FFFFFF · cards"], ["Surface 2", "--surface-2", "#ECEAE3 · tracks, rest"],
  ["Hairline", "--hairline", "#DCD9D0 · borders"], ["Muted", "--muted", "#6E6A62 · labels"], ["Ink", "--ink", "#1B1A17 · text, primary"],
];
const HUES = [
  ["Journal", "--journal", "#5F5BBF · tint #ECEBF8"], ["Food", "--food", "#2C8A5E · tint #E6F2EB"], ["Activity", "--activity", "#B7692A · tint #F6EBDF"],
  ["Secondary bar", "--food-bar", "#8BC4A6 · carbs, fat"],
];
const MEALS = [
  { id: "breakfast", name: "Breakfast", plan: "Eggs & toast", kcal: 470 }, { id: "lunch", name: "Lunch", plan: "Chicken bowl", kcal: 640 },
  { id: "snack", name: "Snack", plan: "Greek yogurt", kcal: 180 }, { id: "dinner", name: "Dinner", plan: "Salmon & rice", kcal: 710 },
] as const;
const MOODS = ["Normal", "Focused", "Tired", "Peaceful", "Anxious"];
const WEEK = [["Thu", 4], ["Fri", 3], ["Sat", 4], ["Sun", 1], ["Mon", 4], ["Tue", 2]] as const;

export default function Kit() {
  const [mood, setMood] = useState("Focused");
  const [habits, setHabits] = useState<Record<string, boolean>>({ Walk: true, Read: false });
  const [drinks, setDrinks] = useState(0);
  const [eaten, setEaten] = useState<Record<string, boolean>>({ breakfast: true });
  const [pushups, setPushups] = useState(53);
  const [recording, setRecording] = useState(false);
  const [section, setSection] = useState<Section>("today");
  const [range, setRange] = useState<"7" | "14" | "30">("14");
  const [cloud, setCloud] = useState(true);
  const [snacks, setSnacks] = useState(["Apple", "Protein bar", "Almonds"]);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const say = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 1800); }, []);
  const closeSheet = useCallback(() => setSheet(false), []);

  const mealsDone = MEALS.filter((m) => eaten[m.id]).length;
  const kcal = MEALS.filter((m) => eaten[m.id]).reduce((n, m) => n + m.kcal, 0);
  const progress = { checkin: mood ? 1 : 0, journal: recording ? 0 : 1, food: mealsDone / 4, activity: Math.min(1, pushups / 100) };
  const closed = progress.checkin + progress.journal + progress.food + progress.activity >= 4;
  const foodState: MedallionState = mealsDone === 4 ? "done" : mealsDone ? "part" : "idle";
  const actState: MedallionState = pushups >= 100 ? "done" : pushups ? "part" : "idle";

  return (
    <main className={k.page}>
      <header className={k.head}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="eb">Component kit · direction A</span>
          <span className={`d ${k.wordmark}`}>Soma</span>
          <p className={k.note}>One day, one page. Three domains share one quiet surface and are told apart by a single hue each, used only where it carries information: a dot, a ring, a number. Everything else is ink on bone.</p>
        </div>
        <div className={k.legend}>
          <span><i className={k.dot} style={{ background: "var(--journal)" }} />Journal</span>
          <span><i className={k.dot} style={{ background: "var(--food)" }} />Food</span>
          <span><i className={k.dot} style={{ background: "var(--activity)" }} />Activity</span>
        </div>
      </header>

      <section className={k.sec}>
        <span className="eb">Color</span>
        <div className={k.grid6}>
          {NEUTRALS.map(([n, v, h]) => <Swatch key={v} name={n} token={v} hex={h} />)}
        </div>
        <div className={k.grid6}>
          {HUES.map(([n, v, h]) => <Swatch key={v} name={n} token={v} hex={h} />)}
          <Swatch name="Warning" token="--warning-bg" hex="#7A5A0E on #F5EBD3 · admin" text="warning" color="var(--warning)" />
          <Swatch name="Critical" token="--critical-bg" hex="#8E2F24 on #F3DCD7 · admin" text="critical" color="var(--critical)" />
        </div>
        <p className={k.note}>The three domain hues sit at the same lightness and chroma, so none of them reads as the brand color. Status colors are a separate set and never appear on the daily screens.</p>
      </section>

      <section className={k.sec}>
        <span className="eb">Type</span>
        <div className={k.type}>
          <span className="eb">Display · Bricolage Grotesque 600</span><span className="d" style={{ fontSize: 36 }}>September 14</span>
          <span className="eb">Big number · 56 / 40</span><span className="d" style={{ fontSize: 56 }}>53 <span style={{ fontSize: 40, color: "var(--muted)" }}>1,480</span></span>
          <span className="eb">Title · 32</span><span className="d" style={{ fontSize: 32 }}>Journal</span>
          <span className="eb">Body · Figtree 400 / 14–16</span><span style={{ fontSize: 15, lineHeight: 1.55, maxWidth: 520 }}>Every day I get it in before noon the rest of the day just lines up. I said this last week too and then didn&apos;t do it.</span>
          <span className="eb">Label · JetBrains Mono 11 caps</span><span className="eb" style={{ color: "var(--ink)" }}>Tuesday · Day 41 of Round 3</span>
          <span className="eb">Data · JetBrains Mono 12–14</span><span className="m" style={{ fontSize: 14 }}>112 / 160 g · 6h 52m · 33 / 35 · 94%</span>
        </div>
      </section>

      <section className={k.sec}>
        <span className="eb">Controls</span>
        <div className={k.specimens}>
          <div className={k.specimen}>
            <span className="eb">Buttons · 44, small 36</span>
            <div className={k.wrap}>
              <Button onClick={() => say("Added")}>Add</Button>
              <Button variant="activity" onClick={() => say("Logged " + pushups)}>Did {pushups}</Button>
              <Button variant="food">Eaten</Button>
              <Button variant="secondary">Other number</Button>
              <Button variant="danger" size="sm">Stop</Button>
              <Button size="sm" disabled>Disabled</Button>
            </div>
          </div>
          <div className={k.specimen}>
            <span className="eb">Chips · 38 mood, 30 habit, counter</span>
            <div className={k.wrap}>
              {MOODS.map((m) => <Chip key={m} label={m} on={mood === m} onClick={() => setMood(m)} />)}
            </div>
            <div className={k.wrap}>
              {Object.keys(habits).map((h) => <Chip key={h} kind="habit" label={h} on={habits[h]} onClick={() => setHabits((v) => ({ ...v, [h]: !v[h] }))} />)}
              <Chip kind="habit" label="Drinks" count={drinks} on={drinks > 0} onClick={() => setDrinks((n) => (n + 1) % 5)} />
            </div>
          </div>
          <div className={k.specimen}>
            <span className="eb">Segmented · tags</span>
            <Segmented label="Timeframe" value={range} onChange={setRange} options={[{ value: "7", label: "7 days" }, { value: "14", label: "14 days" }, { value: "30", label: "30 days" }]} />
            <div className={k.wrap}>
              <Tag>pending</Tag><Tag tone="journal">transcribed</Tag><Tag tone="food">on plan</Tag><Tag tone="activity">rest day</Tag><Tag tone="warning">stuck 2h</Tag><Tag tone="critical">failed</Tag>
            </div>
          </div>
          <div className={k.specimen}>
            <span className="eb">Floating mic · Journal only</span>
            <div className={k.wrap}>
              <MicButton recording={recording} onClick={() => setRecording(!recording)} />
              <span className={k.note}>Today has no floating mic: its Journal card is the record button.</span>
            </div>
          </div>
        </div>
      </section>

      <section className={k.sec}>
        <span className="eb">Today · cards, medallions, tiles, minis</span>
        <div className={k.specimens}>
          <div className={k.phoneCol}>
            <div className={`${k.hero} ${closed ? k.heroClosed : ""}`}>
              <DayRing progress={progress} closed={closed} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="d" style={{ fontSize: 26 }}>{closed ? "Day closed" : "Two to go"}</span>
                <span className={k.heroSub}>Eat all four and reach 100 to see the closed state.</span>
              </div>
            </div>
            <div className={k.week}>
              {WEEK.map(([d, n]) => <div key={d} className={k.weekDay}><DayGlyph done={n} /><span>{d}</span></div>)}
              <div className={k.weekDay} style={{ color: "var(--ink)", fontWeight: 600 }}><DayGlyph done={Math.floor(progress.checkin + progress.journal + progress.food + progress.activity)} today /><span>Today</span></div>
            </div>
            <Card recording={recording} onClick={() => setRecording((r) => !r)} aria-label={recording ? "Stop recording" : "Record a journal entry"}>
              <RowHead lead={<Medallion domain="journal" icon="mic" state={recording ? "rec" : "done"} />} title="Journal" sub={recording ? "Recording · tap to stop" : "1 entry today · tap to record another"} />
            </Card>
            <Card>
              <RowHead lead={<Medallion domain="food" icon="leaf" state={foodState} />} title="Food" sub={`${mealsDone} of 4 eaten · ${kcal.toLocaleString("en-US")} kcal`} trail={<span className="m muted" style={{ fontSize: 12 }}>{kcal} / 2100</span>} />
              <Tiles>
                {MEALS.map((m) => <Tile key={m.id} domain="food" icon={m.id} name={m.name} plan={m.plan} stat={`${m.kcal} · ${eaten[m.id] ? "eaten" : "plan"}`} done={!!eaten[m.id]} onClick={() => setEaten((e) => ({ ...e, [m.id]: !e[m.id] }))} />)}
              </Tiles>
            </Card>
            <Card>
              <RowHead lead={<Medallion domain="activity" icon="barbell" state={actState} />} title="Activity" sub={pushups >= 100 ? `${pushups} push-ups, target hit` : `${pushups} of 100 push-ups`} />
              <div className={k.wrap}><Mini domain="activity" icon="walk" label="Walk" state="on" /><Mini domain="activity" icon="run" label="Run" /><Mini domain="activity" icon="barbell" label="Push-ups due" state={pushups >= 100 ? "on" : "due"} onClick={() => setSheet(true)} /><span className="muted" style={{ fontSize: 12 }}>on · empty · due</span></div>
            </Card>
          </div>

          <div className={k.specimen}>
            <span className="eb">Medallion states</span>
            <div className={k.wrap}>
              {(["idle", "part", "done"] as const).map((st) => (["journal", "food", "activity"] as const).map((d) => <Medallion key={st + d} domain={d} state={st} icon={d === "journal" ? "mic" : d === "food" ? "leaf" : "barbell"} />))}
              <Medallion domain="journal" state="rec" icon="mic" />
            </div>
            <span className="eb">Rings · stats · bars</span>
            <div className={k.wrap}>
              <ProgressRing label="Calories" value={kcal} max={2100} color="var(--food)" />
              <ProgressRing label="Push-ups" value={pushups} max={100} color="var(--activity)" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              <Stat label="Streak" value={<span className="m">41</span>} note="days, rest days carried" />
              <Stat label="Weight" value={<span className="m">182.4</span>} note="−1.2 lb this week" />
            </div>
            <Bar label="Protein" value={112} max={200} domain="food" />
            <Bar label="Carbs" value={96} max={150} color="var(--food-bar)" />
            <Card>
              <Row name="Eggs & toast" sub="22 g protein" value="470" />
              <Row name="Chicken bowl" sub="48 g protein" value="640" />
            </Card>
          </div>
        </div>
      </section>

      <section className={k.sec}>
        <span className="eb">Settings field kit</span>
        <div className={k.specimens}>
          <Card>
            <Field name="Display name"><Input compact defaultValue="David" aria-label="Display name" /></Field>
            <Field name="Plan" help="Sets default targets."><Select compact defaultValue="standard" aria-label="Plan"><option value="standard">Standard</option><option value="paleo">Paleo</option><option value="keto">Keto</option></Select></Field>
            <Field name="Daily push-up target" help="Per person. Rest days carry the streak."><Input compact inputMode="numeric" value={pushups} onChange={(e) => setPushups(Number(e.target.value.replace(/\D/g, "")) || 0)} aria-label="Daily push-up target" /></Field>
            <Field name="Cloud transcription" help="Audio leaves the device only with this on."><Switch checked={cloud} onChange={setCloud} label="Cloud transcription" /></Field>
          </Card>
          <Card>
            <span className="eb">Quick snacks</span>
            <div className={k.wrap}>
              {snacks.map((x) => <Pill key={x} label={x} onRemove={() => setSnacks((list) => list.filter((y) => y !== x))} />)}
            </div>
            <Input placeholder="Add a snack and press Enter" aria-label="Add a snack" onKeyDown={(e) => { const v = e.currentTarget.value.trim(); if (e.key === "Enter" && v) { setSnacks((list) => [...list, v]); e.currentTarget.value = ""; } }} />
            <Button variant="secondary" block onClick={() => setSheet(true)}>Open a sheet</Button>
          </Card>
        </div>
      </section>

      <section className={k.sec}>
        <span className="eb">Navigation · tab bar on phones, sidebar on desktop</span>
        <div className={k.specimens}>
          <div className={`${k.frame} ${k.tabFrame}`}><TabBar current={section} onSelect={setSection} /></div>
          <div className={`${k.frame} ${k.sideFrame}`}>
            <Sidebar current={section} onSelect={setSection} footer={<><Button variant={recording ? "danger" : "journal"} block onClick={() => setRecording(!recording)}><Icon name="mic" />{recording ? "Stop" : "Record an entry"}</Button><SideNote>david@example.com<br />Admin</SideNote></>} />
          </div>
        </div>
      </section>

      <section className={k.sec}>
        <span className="eb">Icons · 24 grid, 1.75 stroke</span>
        <div className={k.icons}>
          {ICON_NAMES.map((n) => <div key={n} className={k.iconCell}><Icon name={n} size={22} />{n}</div>)}
        </div>
      </section>

      <Sheet open={sheet} title="Push-ups" onClose={closeSheet}>
        <p className={k.note}>Bottom sheet on phones, centred dialog from 900px. Escape or the backdrop closes it.</p>
        <Input inputMode="numeric" value={pushups} onChange={(e) => setPushups(Number(e.target.value.replace(/\D/g, "")) || 0)} aria-label="Push-ups today" />
        <div className={k.wrap}>
          <Button variant="activity" onClick={() => { closeSheet(); say(`Logged ${pushups}`); }}>Did {pushups}</Button>
          <Button variant="secondary" onClick={closeSheet}>Cancel</Button>
        </div>
      </Sheet>
      <Toast message={toast} />
    </main>
  );
}

function Swatch({ name, token, hex, text, color }: { name: string; token: string; hex: string; text?: string; color?: string }) {
  return (
    <div className={k.swatch}>
      <div className={k.swatchBox} style={{ background: `var(${token})`, color }}>{text}</div>
      <span className={k.swatchName}>{name}</span>
      <span className={k.swatchHex}>{hex}</span>
    </div>
  );
}
