"use client";

// Tomorrow's brief, full screen (/tomorrow/), and the card on Today that opens it from 6 pm. Soma Night, facts only:
// what the day holds, never what to do with it.

import Link from "next/link";
import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import { Icon, Medallion, type Domain, type IconName } from "@/components/ui";
import type { Driver } from "@/lib/great-days";
import { insightLine, summaryLine, type Insight, type SomaSide } from "@/lib/tomorrow";
import { fromKey } from "@/lib/today";
import { useTomorrow } from "./Brief";
import { useGoTab } from "./tabs";
import s from "./tomorrow.module.css";
import t from "./today.module.css";

const hue = (d: Domain) => ({ "--hue": `var(--${d})` }) as CSSProperties;
const fmt = (n: number) => n.toLocaleString("en-US");
const weekdayOf = (day: string) => fromKey(day).toLocaleDateString("en-GB", { weekday: "long" });

/** On Today from 6 pm: the day ahead in one line, and the way into the brief. */
export function TomorrowCard() {
  const { day, soma } = useTomorrow();
  const weekday = weekdayOf(day);
  return (
    <Link href="/tomorrow/" className={`${t.tile} ${t.wide} ${s.cardLink}`} style={hue("journal")} aria-label={`Tomorrow's brief: ${weekday}`}>
      <span className={t.hit}>
        <span className={t.row}>
          <span className={t.grow}>
            <span className={t.th}><Medallion domain="journal" icon="moon" /><span className="eb">Tomorrow</span></span>
            <span className={`d ${t.title}`}>{weekday}</span>
            <span className={t.sub}>{summaryLine(null, soma)} · see the day</span>
          </span>
          <span className={s.go}><Icon name="chevron" size={22} strokeWidth={2} /></span>
        </span>
      </span>
    </Link>
  );
}

export function TomorrowScreen() {
  const goTab = useGoTab();
  const { day, soma, lifts } = useTomorrow();
  const close = useCallback(() => goTab("today"), [goTab]);
  const shut = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    shut.current?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [close]);

  const d = fromKey(day);
  const weekday = weekdayOf(day);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const insight = insightLine(lifts, null);

  return (
    <main className={s.screen} aria-label={`Tomorrow's brief, ${weekday} ${date}`}>
      <div className={s.inner}>
        <div className={s.bar}>
          <button ref={shut} type="button" className={s.x} onClick={close} aria-label="Close the brief"><Icon name="close" size={18} /></button>
          <span className="eb">Tomorrow&apos;s brief</span>
          <span className={s.barEnd} />
        </div>

        <header className={s.hero}>
          <span className="eb">{date}</span>
          <h1 className={`d ${s.day}`}>{weekday}</h1>
          <div className={s.stats}>
            <Stat value={soma.pushups.rest ? "Rest" : fmt(soma.pushups.target)} label={soma.pushups.rest ? "no push-ups" : "push-ups"} />
            <Stat value={fmt(soma.kcal)} label="kcal" />
            <Stat value={String(soma.weighIn ? 5 : 4)} label="to close" />
          </div>
        </header>

        <SomaCard soma={soma} />
        {insight && <InsightCard insight={insight} />}
      </div>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className={s.stat}><span className="dc">{value}</span><span className="eb">{label}</span></div>;
}

function Row({ domain, icon, title, sub, children }: { domain: Domain; icon: IconName; title: string; sub?: string; children?: React.ReactNode }) {
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
