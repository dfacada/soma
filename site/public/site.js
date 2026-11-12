/* Dayhub's landing page: everything that moves or can be tapped. No library.
   Every demo runs on this page alone, and nothing typed here leaves it. The made-up member is the screenshot rig's
   (scripts/shots/world.ts): the same day, the same words, the same numbers, so each demo agrees with the real screen
   beside it. The words for settings and privacy are the app's own (Closing.tsx, src/lib/privacy-view.ts,
   src/lib/experiment.ts): change those, change these. */
(function () {
  "use strict";

  /** The app's address: where Request an invite, I have an account, Privacy and Terms go. The app moves to its own
   *  subdomain on move day (2026-11-18): change it here, and only here. */
  const APP_URL = "https://dayhub-onkasary.onslate.com";

  const root = document.documentElement;
  const calmQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const calm = () => calmQuery.matches;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const sleep = (ms) => new Promise((res) => setTimeout(res, calm() ? 0 : ms));
  const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
  const listed = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const COUNT_WORD = ["No", "One", "Two", "Three", "Four", "Five"];
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch { /* storage is blocked: the choice lasts this visit */ } },
  };
  let orb = null;

  // ── Links to the app ──
  for (const a of $$("[data-app]")) a.href = APP_URL + (a.getAttribute("data-app") || "/");

  // ── Night and Light: the visitor's system, or their own choice (kept on this device only) ──
  const saved = store.get("dayhub-site-theme");
  if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  const themeNow = () => { const t = root.getAttribute("data-theme"); return t === "light" || t === "dark" ? t : darkQuery.matches ? "dark" : "light"; };
  const themeBtn = $("[data-theme-toggle]");

  /** Every screen is a <picture> whose <source> answers a light system; when the theme is set by hand, both point at
   *  the theme in use. */
  function showShots(t) {
    const look = t === "dark" ? "night" : "light";
    for (const img of $$("img[data-shot]")) {
      const want = `shots/${img.dataset.shot}.${look}.webp`;
      const source = img.parentElement.querySelector("source");
      if (source && source.getAttribute("srcset") !== want) source.setAttribute("srcset", want);
      if (img.getAttribute("src") !== want) img.setAttribute("src", want);
    }
  }
  function paintTheme() {
    const t = themeNow();
    themeBtn.dataset.now = t;
    themeBtn.setAttribute("aria-label", t === "dark" ? "Switch to Light" : "Switch to Night");
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#0B0A09" : "#F4F3EF");
    showShots(t);
    if (orb) orb.retheme();
  }
  themeBtn.addEventListener("click", () => {
    const next = themeNow() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    store.set("dayhub-site-theme", next);
  });
  darkQuery.addEventListener("change", paintTheme);
  new MutationObserver(paintTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  // ── The header's hairline once the page moves ──
  const top = $("[data-top]");
  const onScroll = () => top.classList.toggle("scrolled", window.scrollY > 4);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ── The phones: each turns toward you as it reaches the middle, and leans toward a mouse ──
  const devices = $$("[data-device]");
  const seen = new Map();
  let turnQueued = false;
  function turn() {
    turnQueued = false;
    if (calm()) return;
    const vh = window.innerHeight;
    for (const d of devices) {
      const s = seen.get(d);
      if (!s.on) continue;
      const r = d.getBoundingClientRect();
      const t = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
      const side = d.dataset.side === "left" ? 1 : -1;
      const ry = side * (12 + t * 12) + s.px * 9;
      const rx = 4 + t * 8 - s.py * 7;
      d.style.setProperty("--ry", ry.toFixed(2) + "deg");
      d.style.setProperty("--rx", rx.toFixed(2) + "deg");
      d.style.setProperty("--gx", (ry * 2.4).toFixed(1));
    }
  }
  const queueTurn = () => { if (!turnQueued) { turnQueued = true; requestAnimationFrame(turn); } };
  const watch = new IntersectionObserver((entries) => {
    for (const e of entries) seen.get(e.target).on = e.isIntersecting;
    queueTurn();
  }, { rootMargin: "15% 0px" });
  for (const d of devices) {
    seen.set(d, { on: false, px: 0, py: 0 });
    watch.observe(d);
    d.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = d.getBoundingClientRect(), s = seen.get(d);
      s.px = ((e.clientX - r.left) / r.width) * 2 - 1;
      s.py = ((e.clientY - r.top) / r.height) * 2 - 1;
      queueTurn();
    });
    d.addEventListener("pointerleave", () => { const s = seen.get(d); s.px = 0; s.py = 0; queueTurn(); });
  }
  window.addEventListener("scroll", queueTurn, { passive: true });
  window.addEventListener("resize", queueTurn);

  // The tabs under each phone: another real screen, with a quick turn of the phone.
  const screens = new Map();
  for (const tabs of $$("[data-tabs]")) {
    const device = document.getElementById(tabs.dataset.tabs);
    screens.set(device.id, { tabs, device, img: $("img[data-shot]", device), token: null });
    tabs.addEventListener("click", (e) => { const b = e.target.closest("button[data-show]"); if (b) showScreen(device.id, b.dataset.show); });
  }
  function showScreen(id, name) {
    const set = screens.get(id);
    const b = set && $(`button[data-show="${name}"]`, set.tabs);
    if (!b || set.img.dataset.shot === name) return;
    for (const x of $$("button[data-show]", set.tabs)) x.setAttribute("aria-pressed", String(x === b));
    const pre = new Image();
    pre.src = `shots/${name}.${themeNow() === "dark" ? "night" : "light"}.webp`;
    const ready = pre.decode ? pre.decode().catch(() => {}) : Promise.resolve();
    const token = {};
    set.token = token;
    if (!calm()) set.device.classList.add("turning");
    Promise.all([ready, sleep(210)]).then(() => {
      if (set.token !== token) return;
      set.img.dataset.shot = name;
      set.img.alt = b.dataset.alt || "";
      showShots(themeNow());
      requestAnimationFrame(() => requestAnimationFrame(() => set.device.classList.remove("turning")));
    });
  }

  // ── The opening: Today's orb ──
  // The rig's evening: weight, check-in and a move done, three of four meals eaten, the journal left (Today.tsx).
  const stage = $("[data-orb]");
  const TASKS = [
    { key: "weight", hue: 1, cls: "food", label: "Weight", todo: "Weight", next: "your weight" },
    { key: "checkin", hue: 0, cls: "journal", label: "Check-in", todo: "Check-in", next: "check in" },
    { key: "journal", hue: 0, cls: "journal", label: "Journal", todo: "Journal", next: "your journal" },
    { key: "food", hue: 1, cls: "food", label: "All four meals", todo: "Dinner", next: "food" },
    { key: "move", hue: 2, cls: "activity", label: "A move", todo: "A move", next: "move" },
  ];
  const START = { weight: 1, checkin: 1, journal: 0, food: 0.75, move: 1 };
  const day = Object.assign({}, START);
  const ring = $("[data-ring]", stage);
  const R = 118, C = 2 * Math.PI * R, GAP = 6, SLOT = 360 / TASKS.length, SPAN = ((SLOT - GAP) / 360) * C;
  ring.innerHTML = TASKS.map((t, i) => `<circle cx="140" cy="140" r="${R}" style="stroke:var(--${t.cls});stroke-dasharray:0 ${C.toFixed(1)};opacity:0" transform="rotate(${(i * SLOT - SLOT / 2 + GAP / 2).toFixed(1)} 140 140)"/>`).join("");
  const arcs = $$("circle", ring);
  const lineEl = $("[data-orb-line]");
  const pillsEl = $("[data-orb-pills]");

  function paintOrb(changed) {
    const left = TASKS.filter((t) => day[t.key] < 1);
    const closed = left.length === 0;
    TASKS.forEach((t, i) => {
      const v = Math.max(0, Math.min(1, day[t.key]));
      arcs[i].style.strokeDasharray = `${(v * SPAN).toFixed(1)} ${C.toFixed(1)}`;
      arcs[i].style.opacity = v > 0 ? "1" : "0";
      const bead = $(`[data-bead="${t.key}"]`, stage);
      bead.classList.toggle("on", v >= 1);
      bead.classList.toggle("part", v > 0 && v < 1);
      bead.setAttribute("aria-pressed", String(v >= 1));
      bead.setAttribute("aria-label", `${t.label}: ${v >= 1 ? "done" : v > 0 ? "three of four meals" : "not yet"}`);
      if (changed === t.key && v >= 1 && !calm()) { bead.classList.remove("popped"); void bead.offsetWidth; bead.classList.add("popped"); }
    });
    stage.classList.toggle("closed", closed);
    // Say your day sits under the orb only while something is still open, as on Today.
    const sayJump = $("[data-say-jump]");
    if (sayJump) sayJump.hidden = closed;
    $("[data-orb-n]", stage).textContent = String(TASKS.length - left.length);
    $("[data-orb-word]", stage).textContent = closed ? "Day closed" : "Done today";
    // The line under the orb, as Today words it.
    lineEl.innerHTML = closed ? "That's the day."
      : left.length === TASKS.length ? `${COUNT_WORD[left.length]} things close the day.`
      : left.length === 1 ? `${esc(left[0].todo)} closes the day.`
      : `<span class="muted">${left.length} left to close the day.</span> Up next: ${left[0].next}.`;
    pillsEl.innerHTML = closed
      ? `<button class="pill" type="button" data-pill="again">Start the evening again</button>`
      : left.map((t) => `<button class="pill ${t.cls}" type="button" data-pill="${t.key}"><i></i>${esc(t.todo)}</button>`).join("");
    const lit = [0, 1, 2].map((h) => { const of = TASKS.filter((t) => t.hue === h); return of.reduce((n, t) => n + Math.min(1, day[t.key]), 0) / of.length; });
    stage.style.setProperty("--pj", lit[0].toFixed(2));
    stage.style.setProperty("--pf", lit[1].toFixed(2));
    stage.style.setProperty("--pa", lit[2].toFixed(2));
    if (orb) orb.set(lit, closed);
  }
  function toggleTask(key) {
    const t = TASKS.find((x) => x.key === key);
    if (!t) return;
    day[key] = day[key] >= 1 ? (key === "food" ? 0.75 : 0) : 1;
    if (day[key] >= 1 && orb) orb.flare(t.hue);
    paintOrb(key);
  }
  stage.addEventListener("click", (e) => { const b = e.target.closest("[data-bead]"); if (b) toggleTask(b.dataset.bead); });
  pillsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pill]");
    if (!b) return;
    if (b.dataset.pill === "again") { Object.assign(day, START); paintOrb(); return; }
    toggleTask(b.dataset.pill);
  });
  if (window.DayhubOrb) orb = window.DayhubOrb.mount(stage);
  // The ring grows in from nothing on the first frame, as it does on Today.
  requestAnimationFrame(() => requestAnimationFrame(() => paintOrb()));

  // ── Say your day ──
  // The rig's member at 7:30 pm (moment-day-check): what they said, and the three rows Dayhub picked out of it.
  const SAID = "Long one today. The demo went better than I expected, and I finally got out for a walk at lunch. Dinner was salmon with rice and broccoli, with a glass of red wine. I finished my push-ups, a hundred in the end, and read for half an hour before this.";
  const SAY_ROWS = [
    { id: "dinner", cls: "food", eyebrow: "Food", title: "Salmon with rice and broccoli", meta: "650 kcal · 45 P", meal: "Dinner", phrase: "salmon with rice and broccoli", said: "dinner" },
    { id: "wine", cls: "food", eyebrow: "Food", title: "Glass of red wine", meta: "125 kcal · 0 P", meal: "Something else", phrase: "a glass of red wine", said: "a glass of red wine" },
    { id: "pushups", cls: "activity", eyebrow: "Activity", title: "Push-ups", meta: "100 push-ups", note: "Replaces 60 push-ups", phrase: "I finished my push-ups, a hundred in the end", said: "100 push-ups" },
  ];
  const say = $("[data-say]");
  const sayWords = $("[data-say-words]", say);
  const sayWave = $("[data-say-wave]", say);
  const sayClock = $("[data-say-clock]", say);
  const sayLabel = $("[data-say-label]", say);
  const sayStatus = $("[data-say-status]", say);
  const sayRows = $("[data-say-rows]", say);
  const fillBtn = $("[data-say-fill]", say);
  const sayTicked = new Set(SAY_ROWS.map((r) => r.id));
  let sayRun = 0, sayStop = false;
  sayWave.innerHTML = "<i></i>".repeat(32);
  const bars = $$("i", sayWave);

  // The words, each in a span, the phrases that become rows in a mark of their hue.
  (function buildWords() {
    const ranges = SAY_ROWS.map((r, i) => { const at = SAID.indexOf(r.phrase); return { from: at, to: at + r.phrase.length, cls: r.cls, i }; });
    let html = "", pos = 0, open = null;
    SAID.split(" ").forEach((w, n) => {
      const r = ranges.find((x) => pos >= x.from && pos < x.to) || null;
      if (r !== open) {
        if (open) html += "</mark>";
        html += n ? " " : "";
        if (r) html += `<mark class="${r.cls}" data-m="${r.i}">`;
        open = r;
      } else if (n) html += " ";
      html += `<span>${esc(w)}</span>`;
      pos += w.length + 1;
    });
    sayWords.innerHTML = html + (open ? "</mark>" : "");
  })();
  const wordEls = $$("span", sayWords);
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  function sayPhase(phase, label, status) {
    say.dataset.phase = phase;
    sayLabel.textContent = label;
    if (status) sayStatus.textContent = status;
  }
  function paintSayRows() {
    sayRows.innerHTML = `<div class="say-row saved journal"><span class="tick">${icon("lock")}</span><span class="what"><span class="eb">Journal</span><b>Entry saved</b></span><span class="m">0:24</span></div>` +
      SAY_ROWS.map((r, i) => `<button type="button" class="say-row ${r.cls}${sayTicked.has(r.id) ? "" : " off"}" role="checkbox" aria-checked="${sayTicked.has(r.id)}" data-row="${r.id}" style="animation-delay:${(0.08 + i * 0.07).toFixed(2)}s">
        <span class="tick">${icon("check")}</span>
        <span class="what"><span class="eb">${r.eyebrow}</span><b>${esc(r.title)}</b><small><span class="m">${esc(r.meta)}</span>${r.note ? " · " + esc(r.note) : ""}</small></span>
        ${r.meal ? `<span class="say-meal">${esc(r.meal)}</span>` : ""}
      </button>`).join("");
    fillBtn.textContent = sayTicked.size ? `Fill in my day · ${sayTicked.size}` : "Nothing ticked";
    fillBtn.disabled = !sayTicked.size;
  }
  sayRows.addEventListener("click", (e) => {
    const b = e.target.closest("[data-row]");
    if (!b) return;
    const id = b.dataset.row;
    if (sayTicked.has(id)) sayTicked.delete(id); else sayTicked.add(id);
    b.classList.toggle("off", !sayTicked.has(id));
    b.setAttribute("aria-checked", String(sayTicked.has(id)));
    b.style.animation = "none";
    fillBtn.textContent = sayTicked.size ? `Fill in my day · ${sayTicked.size}` : "Nothing ticked";
    fillBtn.disabled = !sayTicked.size;
  });

  async function playDay() {
    const run = ++sayRun;
    sayStop = false;
    sayTicked.clear();
    SAY_ROWS.forEach((r) => sayTicked.add(r.id));
    wordEls.forEach((w) => w.classList.remove("heard"));
    $$("mark", sayWords).forEach((m) => m.classList.remove("lit"));
    sayWords.classList.remove("dim");
    showScreen("dev-say", "say-recording");
    sayPhase("recording", "Your day · recording", "Recording a made-up day.");
    const step = 105;
    let level = 0;
    for (let i = 0; i < wordEls.length; i++) {
      if (run !== sayRun) return;
      if (sayStop || calm()) { wordEls.forEach((w) => w.classList.add("heard")); $$("mark", sayWords).forEach((m) => m.classList.add("lit")); break; }
      wordEls[i].classList.add("heard");
      const mark = wordEls[i].closest("mark");
      if (mark && wordEls[i] === $$("span", mark).pop()) mark.classList.add("lit");
      sayClock.textContent = clock(i / 2);
      level = 0.35 + Math.random() * 0.65;
      bars.forEach((b, k) => { b.style.transform = `scaleY(${Math.max(0.1, level * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.9 + k * 0.7))))})`; });
      await sleep(step + (wordEls[i].textContent.endsWith(".") ? 180 : 0));
    }
    if (run !== sayRun) return;
    sayClock.textContent = "0:24";
    bars.forEach((b) => { b.style.transform = ""; });
    sayPhase("writing", "Your day · writing it down", "Writing it down.");
    await sleep(900);
    if (run !== sayRun) return;
    sayWords.classList.add("dim");
    sayPhase("reading", "Your day · picking it out", "Picking out your day.");
    await sleep(900);
    if (run !== sayRun) return;
    paintSayRows();
    sayPhase("review", "Your day · check it", "Check your day: three things, each ticked.");
    showScreen("dev-say", "say-check");
  }
  function resetSay() {
    sayRun++;
    sayClock.textContent = "0:00";
    sayPhase("", "Your day · a made-up evening", "");
    delete say.dataset.phase;
  }
  $("[data-say-play]", say).addEventListener("click", () => void playDay());
  $("[data-say-stop]", say).addEventListener("click", () => { sayStop = true; });
  for (const b of $$("[data-say-again]", say)) b.addEventListener("click", () => { if (say.dataset.phase === "done") void playDay(); else resetSay(); });
  fillBtn.addEventListener("click", () => {
    const rows = SAY_ROWS.filter((r) => sayTicked.has(r.id));
    if (!rows.length) return;
    // The recording is the day's journal entry; what was ticked is logged. Up top, Today's orb hears it too.
    day.journal = 1;
    if (sayTicked.has("dinner")) day.food = 1;
    paintOrb("journal");
    const closed = TASKS.every((t) => day[t.key] >= 1);
    $("[data-say-summary]", say).textContent = `Filled in: ${listed(rows.map((r) => r.said))}.${closed ? " That closed the day." : ""}`;
    const beads = $$(".say-beads span", say);
    beads[1].hidden = !rows.some((r) => r.cls === "food");
    beads[2].hidden = !rows.some((r) => r.cls === "activity");
    sayPhase("done", "Your day · filled in", `Filled in ${plural(rows.length, "thing")}.`);
  });
  // "See it work" in the opening plays it as it arrives, and so does the Say your day button under the orb.
  for (const a of $$('a[href="#say"]')) a.addEventListener("click", () => { if (!say.dataset.phase) setTimeout(() => void playDay(), calm() ? 0 : 650); });
  $("[data-say-jump]").addEventListener("click", () => {
    document.getElementById("say").scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "start" });
    if (!say.dataset.phase || say.dataset.phase === "done") setTimeout(() => void playDay(), calm() ? 0 : 650);
  });

  // ── What closes your day (Settings → What closes your day, Closing.tsx) ──
  const CLOSES = [
    { key: "weight", name: "Weight", help: "Logging your weight, once a day.", cls: "food" },
    { key: "checkin", name: "Check-in", help: "A mood, and habits if you like.", cls: "journal" },
    { key: "journal", name: "Journal", help: "A recording, or a few written words.", cls: "journal" },
    { key: "food", name: "Food", help: "The meals you eat, each logged or ticked.", cls: "food" },
    { key: "activity", name: "A move", help: "Any one of your moves.", cls: "activity" },
  ];
  const MEALS = ["breakfast", "lunch", "snack", "dinner"];
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const closes = { weight: true, checkin: true, journal: true, food: true, activity: true, meals: MEALS.slice() };
  const closesBox = $("[data-closes]");
  const closesRows = $("[data-closes-rows]", closesBox);
  const miniRing = $("[data-closes-ring]", closesBox);
  const toastEl = $("[data-closes-toast]", closesBox);
  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }
  const counted = () => CLOSES.filter((c) => closes[c.key]).length;
  function paintCloses() {
    closesRows.innerHTML = CLOSES.map((c) => `<div class="close-row ${c.cls}">
        <b>${c.name}${closes[c.key] ? "" : '<span class="opt">optional</span>'}</b>
        <small>${c.help}</small>
        <button type="button" class="switch" role="switch" aria-checked="${closes[c.key]}" aria-label="${c.name} closes the day" data-close="${c.key}"></button>
        ${c.key === "food" && closes.food ? `<div class="chips" role="group" aria-label="The meals that count">${MEALS.map((m) => `<button type="button" class="chip" aria-pressed="${closes.meals.includes(m)}" data-meal="${m}">${cap(m)}</button>`).join("")}</div>` : ""}
      </div>`).join("");
    const n = counted();
    $("[data-closes-line]", closesBox).textContent = n === 1 ? "One thing closes the day." : `${COUNT_WORD[n]} things close the day.`;
    const meals = closes.food && closes.meals.length < 4 ? ` (${closes.meals.length} meals)` : "";
    $("[data-closes-sum]", closesBox).textContent = n === 5 && !meals ? "All five things" : CLOSES.filter((c) => closes[c.key]).map((c) => (c.key === "food" ? `Food${meals}` : c.name)).join(", ");
    // The little ring: a lit arc and bead for each thing that counts, a hollow bead for each that doesn't.
    const r = 46, circ = 2 * Math.PI * r, slot = 72, span = ((slot - 8) / 360) * circ;
    miniRing.innerHTML = `<circle class="trk" cx="60" cy="60" r="${r}"/>` + CLOSES.map((c, i) => {
      const a = ((-90 + i * slot) * Math.PI) / 180, x = 60 + r * Math.cos(a), y = 60 + r * Math.sin(a);
      const on = closes[c.key];
      return `<circle class="arc" cx="60" cy="60" r="${r}" style="stroke:var(--${c.cls});stroke-dasharray:${on ? span.toFixed(1) : 0} ${circ.toFixed(1)};opacity:${on ? 1 : 0}" transform="rotate(${(-90 + i * slot - slot / 2 + 4).toFixed(1)} 60 60)"/>` +
        `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" style="fill:${on ? `var(--${c.cls})` : "var(--page)"};stroke:${on ? `var(--${c.cls})` : "var(--faint)"};stroke-width:1.5"/>`;
    }).join("") + `<text x="60" y="60" text-anchor="middle" dominant-baseline="central">${n}</text>`;
  }
  closesRows.addEventListener("click", (e) => {
    const sw = e.target.closest("[data-close]");
    const chip = e.target.closest("[data-meal]");
    if (sw) {
      const key = sw.dataset.close;
      if (closes[key] && counted() <= 1) return toast("Keep at least one thing");
      closes[key] = !closes[key];
      paintCloses();
      const again = $(`[data-close="${key}"]`, closesRows);
      if (again) again.focus();
    } else if (chip) {
      const m = chip.dataset.meal, has = closes.meals.includes(m);
      if (has && closes.meals.length <= 1) return toast("Keep at least one meal");
      closes.meals = MEALS.filter((x) => (x === m ? !has : closes.meals.includes(x)));
      paintCloses();
      const again = $(`[data-meal="${m}"]`, closesRows);
      if (again) again.focus();
    }
  });
  paintCloses();

  // ── Seal a line: the vault's own recipe (src/lib/vault-crypto.ts), on this page only ──
  const enc = new TextEncoder(), dec = new TextDecoder();
  const sealBox = $("[data-seal]");
  const sealBtn = $("[data-seal-go]", sealBox);
  const sealedEl = $("[data-sealed]", sealBox);
  const cipherEl = $("[data-cipher]", sealBox);
  const openedEl = $("[data-opened]", sealBox);
  const openBtn = $("[data-open-go]", sealBox);
  let sealed = null;
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const toB64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); };
  async function vaultKey(pass, salt) {
    const raw = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" }, raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  const canSeal = () => Boolean(window.crypto && window.crypto.subtle && window.TextEncoder);
  async function sealIt() {
    const text = $("#seal-text").value.trim(), pass = $("#seal-pass").value;
    if (!canSeal()) { sealedEl.hidden = false; cipherEl.textContent = ""; $("[data-seal-took]", sealBox).textContent = "This browser keeps its encryption from this page. In Dayhub it runs on any phone from the last few years."; return; }
    if (!text || !pass) { sealedEl.hidden = false; cipherEl.textContent = ""; $("[data-seal-took]", sealBox).textContent = !text ? "Write something to seal first." : "Choose a passphrase first."; return; }
    sealBtn.disabled = true;
    sealBtn.lastChild.textContent = "Making the key…";
    try {
      const t0 = performance.now();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await vaultKey(pass, salt);
      const took = (performance.now() - t0) / 1000;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text)));
      const packed = new Uint8Array(13 + ct.length);
      packed[0] = 1; packed.set(iv, 1); packed.set(ct, 13);
      sealed = { salt, packed };
      sealedEl.hidden = false;
      openedEl.textContent = ""; openedEl.className = "opened";
      $("[data-seal-bytes]", sealBox).textContent = `${packed.length} bytes`;
      $("[data-seal-took]", sealBox).textContent = `Making the key took ${took.toFixed(2)} s on this device: 310,000 rounds on purpose, so every guess at the passphrase costs the same work.`;
      $("[data-seal-state]", sealBox).textContent = "Sealed";
      await scramble(cipherEl, text, toB64(packed));
    } finally {
      sealBtn.disabled = false;
      sealBtn.lastChild.textContent = "Seal it again";
    }
  }
  /** The words turn into the ciphertext, character by character. Ends on the real thing. */
  async function scramble(el, from, to) {
    if (calm()) { el.textContent = to; return; }
    const frames = 22;
    for (let f = 1; f <= frames; f++) {
      const done = Math.floor((f / frames) * to.length);
      let s = to.slice(0, done);
      for (let i = done; i < to.length; i++) s += i < from.length && f < frames / 3 ? from[i] : B64[(Math.random() * 64) | 0];
      el.textContent = s;
      await new Promise((res) => setTimeout(res, 28));
    }
    el.textContent = to;
  }
  async function openIt() {
    if (!sealed) return;
    const pass = $("#open-pass").value;
    openBtn.disabled = true;
    openedEl.className = "opened";
    openedEl.textContent = "Making the key…";
    try {
      const key = await vaultKey(pass, sealed.salt);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.packed.slice(1, 13) }, key, sealed.packed.slice(13));
      openedEl.className = "opened ok";
      openedEl.textContent = dec.decode(plain);
    } catch {
      openedEl.className = "opened no";
      openedEl.textContent = pass ? "That passphrase doesn't open it. Nobody can, without the right one." : "Type the passphrase to open it.";
    } finally { openBtn.disabled = false; }
  }
  sealBtn.addEventListener("click", () => void sealIt());
  openBtn.addEventListener("click", () => void openIt());
  $("#open-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") void openIt(); });
  for (const id of ["#seal-text", "#seal-pass"]) $(id).addEventListener("input", () => { if (sealed) { sealed = null; sealedEl.hidden = true; $("[data-seal-state]", sealBox).textContent = "Stays here"; sealBtn.lastChild.textContent = "Seal it"; } });

  // ── Food: usual meals are one tap; a new one is said, looked up and kept (MealSheet.tsx) ──
  const FOOD = [
    { key: "breakfast", label: "Breakfast", usual: null },
    { key: "lunch", label: "Lunch", usual: { name: "Beef & Rice Bowl", kcal: 708 } },
    { key: "snack", label: "Snack", usual: { name: "Vanilla-Almond Protein Yogurt Bowl", kcal: 452 } },
    { key: "dinner", label: "Dinner", usual: { name: "Salmon with rice and broccoli", kcal: 650 } },
  ];
  const eaten = { breakfast: null, lunch: true, snack: true, dinner: false };
  const foodBox = $("[data-food]");
  const mealsEl = $("[data-meals]", foodBox);
  const sheet = $("[data-food-sheet]", foodBox);
  const saidEl = $("[data-food-said]", foodBox);
  const foundEl = $("[data-food-found]", foodBox);
  const micBtn = $("[data-food-mic]", foodBox);
  const ESTIMATE = { name: "Oats with berries and a coffee", kcal: 410 };
  let breakfastToday = null;
  function paintMeals() {
    mealsEl.innerHTML = FOOD.map((m) => {
      const had = m.key === "breakfast" ? breakfastToday : eaten[m.key] ? m.usual : null;
      const show = had || m.usual;
      const isNew = !show;
      return `<button type="button" class="meal${isNew ? " new" : ""}" aria-pressed="${Boolean(had)}" data-food-meal="${m.key}">
        <span class="meal-tick">${isNew ? icon("plus") : icon("check")}</span>
        <span class="meal-what"><span class="eb">${m.label}</span>${show ? `<b>${esc(show.name)}</b>` : "<b>No usual yet</b><small>Say or type it</small>"}</span>
        ${show && show.kcal ? `<span class="m">${show.kcal}</span>` : ""}
      </button>`;
    }).join("");
    const n = FOOD.filter((m) => (m.key === "breakfast" ? breakfastToday : eaten[m.key])).length;
    const kcal = FOOD.reduce((t, m) => t + ((m.key === "breakfast" ? breakfastToday && breakfastToday.kcal : eaten[m.key] && m.usual.kcal) || 0), 0);
    $("[data-food-count]", foodBox).textContent = `${n} of 4 eaten · ${kcal.toLocaleString("en-US")} kcal`;
  }
  function openSheet(open) {
    sheet.hidden = !open;
    mealsEl.hidden = open;
    if (open) { saidEl.innerHTML = '<span class="muted">Say or type it</span>'; foundEl.hidden = true; micBtn.classList.remove("rec"); micBtn.focus(); }
  }
  mealsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-food-meal]");
    if (!b) return;
    const key = b.dataset.foodMeal;
    const meal = FOOD.find((m) => m.key === key);
    if (key === "breakfast") {
      if (breakfastToday) breakfastToday = null;
      else if (meal.usual) breakfastToday = meal.usual;
      else return openSheet(true);
    } else eaten[key] = !eaten[key];
    paintMeals();
    const again = $(`[data-food-meal="${key}"]`, mealsEl);
    if (again) again.focus();
  });
  micBtn.addEventListener("click", async () => {
    if (micBtn.classList.contains("rec")) return;
    micBtn.classList.add("rec");
    saidEl.textContent = "";
    for (const ch of ESTIMATE.name) { saidEl.textContent += ch; await sleep(34); }
    micBtn.classList.remove("rec");
    await sleep(250);
    saidEl.textContent = `${ESTIMATE.name} · looking it up…`;
    await sleep(700);
    saidEl.textContent = ESTIMATE.name;
    foundEl.hidden = false;
  });
  $("[data-food-close]", foodBox).addEventListener("click", () => openSheet(false));
  $("[data-food-log]", foodBox).addEventListener("click", () => {
    if ($("[data-food-keep]", foodBox).checked) FOOD[0].usual = ESTIMATE;
    breakfastToday = ESTIMATE;
    openSheet(false);
    paintMeals();
  });
  $("[data-food-tick]", foodBox).addEventListener("click", () => {
    breakfastToday = { name: "Breakfast, ticked", kcal: 0 };
    openSheet(false);
    paintMeals();
  });
  paintMeals();

  // ── Moves of your own (MovesChooser.tsx, src/lib/moves.ts) ──
  const MOVES = [
    { key: "pushups", name: "Push-ups", hint: "reps", icon: "pushup", unit: "reps", step: 10, goal: 100 },
    { key: "run", name: "Run", hint: "km or min", icon: "run", unit: "km", step: 0.5, goal: 5 },
    { key: "walk", name: "Walk", hint: "minutes", icon: "walker", unit: "min", step: 5, goal: 30 },
    { key: "steps", name: "Steps", hint: "from Fitbit", icon: "steps", unit: "steps", step: 500, goal: 8000 },
    { key: "cycle", name: "Cycle", hint: "km", icon: "cycle", unit: "km", step: 1, goal: 15 },
    { key: "yoga", name: "Yoga", hint: "minutes", icon: "yoga", unit: "min", step: 5, goal: 20 },
    { key: "swim", name: "Swim", hint: "minutes", icon: "swim", unit: "min", step: 5, goal: 30 },
    { key: "gym", name: "Gym", hint: "a session", icon: "barbell", unit: "session", step: 0, goal: 1 },
    { key: "sport", name: "Sport", hint: "a session", icon: "ball", unit: "session", step: 0, goal: 1 },
    { key: "own", name: "Your own", hint: "name + unit", icon: "plus", unit: "min", step: 5, goal: 20 },
  ];
  const picked = new Set(["pushups", "walk", "gym", "run"]);
  const goals = Object.fromEntries(MOVES.map((m) => [m.key, m.goal]));
  let mainMove = "pushups";
  const movesBox = $("[data-moves]");
  const moveGrid = $("[data-move-grid]", movesBox);
  const moveMain = $("[data-move-main]", movesBox);
  const unitWord = (m, n) => (m.unit === "reps" ? (n === 1 ? "rep" : "reps") : m.unit === "km" ? "km" : m.unit === "min" ? "min" : "steps");
  function paintMoves() {
    moveGrid.innerHTML = MOVES.map((m) => `<button type="button" class="move" aria-pressed="${picked.has(m.key)}" data-move="${m.key}">
        <span class="mi">${icon(m.icon)}</span><b>${m.name}</b><small>${mainMove === m.key ? "Main · " : ""}${m.hint}</small>
      </button>`).join("");
    $("[data-moves-count]", movesBox).textContent = `${picked.size} picked`;
    const m = MOVES.find((x) => x.key === mainMove);
    const mine = MOVES.filter((x) => picked.has(x.key));
    moveMain.innerHTML = `<div class="what"><b>Your main move</b><small>Today and Activity lead with it.</small></div>` +
      `<div class="main-pills" role="radiogroup" aria-label="Your main move">${mine.map((x) => `<button type="button" role="radio" aria-checked="${x.key === mainMove}" data-main="${x.key}">${x.name}</button>`).join("")}</div>` +
      (m.unit === "session"
        ? `<p class="goal-note">${m.name}: done or not, once a day</p>`
        : `<div class="stepper"><button type="button" data-goal="-1" aria-label="Lower the goal">${icon("minus")}</button><output aria-live="polite">${goals[m.key].toLocaleString("en-US")}<small>${unitWord(m, goals[m.key])} a day</small></output><button type="button" data-goal="1" aria-label="Raise the goal">${icon("plus")}</button></div>`);
  }
  const movesToast = $("[data-moves-toast]", movesBox);
  let movesTimer = 0;
  moveGrid.addEventListener("click", (e) => {
    const b = e.target.closest("[data-move]");
    if (!b) return;
    const key = b.dataset.move;
    if (!picked.has(key)) picked.add(key);
    else if (picked.size <= 1) {
      movesToast.textContent = "Pick at least one. A walk counts.";
      movesToast.classList.add("show");
      clearTimeout(movesTimer);
      movesTimer = setTimeout(() => movesToast.classList.remove("show"), 1800);
      return;
    } else {
      picked.delete(key);
      if (key === mainMove) mainMove = MOVES.find((x) => picked.has(x.key)).key;
    }
    paintMoves();
    const again = $(`[data-move="${key}"]`, moveGrid);
    if (again) again.focus();
  });
  moveMain.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-main]");
    if (pick) {
      mainMove = pick.dataset.main;
      paintMoves();
      const again = $(`[data-main="${mainMove}"]`, moveMain);
      if (again) again.focus();
      return;
    }
    const b = e.target.closest("[data-goal]");
    if (!b) return;
    const m = MOVES.find((x) => x.key === mainMove);
    goals[m.key] = Math.max(m.step, Math.round((goals[m.key] + Number(b.dataset.goal) * m.step) * 10) / 10);
    paintMoves();
    const again = $(`[data-goal="${b.dataset.goal}"]`, moveMain);
    if (again) again.focus();
  });
  paintMoves();

  // ── Insights: try a finding for three days (src/lib/experiment.ts) ──
  // The finding's two sides in the two months before: made up, and said so on the card.
  const BEFORE = { did: { hits: 14, days: 24 }, didnt: { hits: 9, days: 27 } };
  const MARGIN = 0.15;
  const GOOD = ["Great", "Focused", "Peaceful", "Grateful", "Excited"];
  const MOODS = ["Great", "Focused", "Peaceful", "Normal", "Tired", "Down", ""];
  const trial = [{ day: "Thu 12", did: true, mood: "Great" }, { day: "Fri 13", did: true, mood: "Focused" }, { day: "Sat 14", did: false, mood: "Normal" }];
  const trialBox = $("[data-trial]");
  const daysEl = $("[data-trial-days]", trialBox);
  const verdictEl = $("[data-verdict]", trialBox);
  let trying = false;
  function verdictOf() {
    const done = trial.filter((d) => d.did), checked = done.filter((d) => d.mood), great = checked.filter((d) => GOOD.includes(d.mood)).length;
    if (!done.length) return { head: "You didn't get to it", body: "It wasn't done on any of the 3 days, so there's nothing to read from them." };
    if (!checked.length) return { head: "Nothing to compare", body: `You did it on ${plural(done.length, "day")}, but no mood was picked on ${done.length === 1 ? "it" : "them"}, and the mood is how Dayhub knows a great day.` };
    const diff = great / checked.length - BEFORE.didnt.hits / BEFORE.didnt.days;
    const head = diff >= MARGIN - 1e-9 ? "It held up this time" : diff <= -MARGIN + 1e-9 ? "It didn't show this time" : "About the same as usual";
    const of = checked.length === done.length ? `the ${plural(done.length, "day")} you did it` : `the ${plural(checked.length, "day")} you did it and picked a mood`;
    return { head, body: `Great on ${great} of ${of}. In the two months before, your days were great ${BEFORE.did.hits} of ${BEFORE.did.days} times when you did it, and ${BEFORE.didnt.hits} of ${BEFORE.didnt.days} when you didn't.` };
  }
  function paintTrial(flash) {
    if (!trying) {
      daysEl.innerHTML = `<div class="trial-head"><span class="eb">Starts tomorrow, one at a time</span><button class="btn btn-ghost btn-sm" type="button" data-try>Try it for 3 days</button></div>`;
      verdictEl.innerHTML = "<b>Three days of reading</b><p>Try it, then change any day below to see how Dayhub would read it.</p>";
      return;
    }
    daysEl.innerHTML = `<div class="trial-head"><span class="d">Your experiment: Read</span><span class="eb">Thu 12 to Sat 14 Nov</span></div>` + trial.map((d, i) => `<div class="tday" style="animation-delay:${(i * 0.08).toFixed(2)}s">
        <span class="m">${d.day}</span>
        <button type="button" class="did" aria-pressed="${d.did}" data-did="${i}">${icon("check")}${d.did ? "Did it" : "Didn't"}</button>
        <label class="mood${GOOD.includes(d.mood) ? " great" : ""}">${d.mood || "No check-in"}${icon("chevron")}
          <select aria-label="Mood on ${d.day}" data-mood="${i}">${MOODS.map((m) => `<option value="${m}"${m === d.mood ? " selected" : ""}>${m || "No check-in"}</option>`).join("")}</select>
        </label>
      </div>`).join("");
    const v = verdictOf();
    verdictEl.innerHTML = `<b>${v.head}</b><p>${v.body}</p>`;
    if (flash && !calm()) { verdictEl.classList.remove("flash"); void verdictEl.offsetWidth; verdictEl.classList.add("flash"); }
  }
  daysEl.addEventListener("click", (e) => {
    if (e.target.closest("[data-try]")) { trying = true; paintTrial(true); showScreen("dev-insights", "experiment-done"); return; }
    const b = e.target.closest("[data-did]");
    if (!b) return;
    const i = Number(b.dataset.did);
    trial[i].did = !trial[i].did;
    paintTrial(true);
    const again = $(`[data-did="${i}"]`, daysEl);
    if (again) again.focus();
  });
  daysEl.addEventListener("change", (e) => {
    const s = e.target.closest("[data-mood]");
    if (!s) return;
    const i = Number(s.dataset.mood);
    trial[i].mood = s.value;
    paintTrial(true);
    const again = $(`[data-mood="${i}"]`, daysEl);
    if (again) again.focus();
  });
  paintTrial(false);

  // ── What Dayhub can see (src/lib/privacy-view.ts, word for word) ──
  const OUT = [
    { id: "estimate", name: "Food estimates", to: "Claude", what: "What you type or say you ate, with foods you logged before. What you say aloud is written down by Groq first.", on: true },
    { id: "transcribe", name: "Cloud transcription", to: "Groq", what: "Each journal recording, to be written down. Blanked on the server the moment Groq answers.", on: false },
    { id: "sayday", name: "Say your day", to: "Groq and Claude", what: "That one recording, to be written down, and its words, to pick out your day.", on: false },
    { id: "insights", name: "Reading your journal for Insights", to: "Claude", what: "Your entries with names and details taken out, shuffled, with no dates.", on: false },
    { id: "review", name: "Week in review", to: "Claude", what: "That week's entries, to write it. Groq reads it aloud when you ask.", on: false },
    { id: "telegram", name: "Telegram", to: "Telegram", what: "The week in review and tomorrow's brief, as messages. Telegram keeps what it is sent.", on: false },
  ];
  const SEALED = [
    ["Your journal", "Every entry, recording, transcript and note. The server sees that an entry exists, when, and how big it is, never what is in it."],
    ["Your sleep", "Each night from Google Health, kept in one sealed file a month."],
    ["Your week in review", "Written, then sealed before it is stored."],
    ["Your connections", "The Google Health, Morgen and Todoist keys. Opened on your device only for the moment of a read."],
    ["Tomorrow's brief", "Kept on this device for the evening, sealed."],
    ["An experiment about sleep", "Sealed like the sleep it is about."],
    ["Your recovery code", "Shown to you once and never stored. The server keeps only a copy of your key locked with it."],
  ];
  const READABLE = [
    ["Check-ins", "Your mood and the habits you ticked."],
    ["Food", "Your meals, snacks and recipes."],
    ["Weight", "Each weigh-in."],
    ["Moves and steps", "What you logged, and steps from your tracker."],
    ["Rounds", "Your target and your number on each day. Other members of a round see your name, your target and how many days you hit it."],
    ["Your settings", "Your goals, moods, habits, phrases and switches, and an experiment that is not about sleep."],
    ["Messages with David", "Not sealed: he reads them to help you."],
    ["Your account", "Name, email, when you joined, when you were last seen and on what kind of device, and the error reports your app files when something breaks."],
  ];
  const outBox = $("[data-out]");
  const outRows = $("[data-out-rows]", outBox);
  const outTo = $("[data-out-to]", outBox);
  function paintOut(pulse) {
    outRows.innerHTML = OUT.map((o) => `<div class="out-row">
        <b>${o.name} <span>· to ${o.to}</span></b>
        <small>${o.what}</small>
        <button type="button" class="switch" role="switch" aria-checked="${o.on}" aria-label="${o.name}, to ${o.to}" data-out-id="${o.id}"></button>
      </div>`).join("");
    const on = OUT.filter((o) => o.on).length;
    $("[data-out-summary]", outBox).textContent = `${on} of ${OUT.length} things that go out ${on === 1 ? "is" : "are"} on`;
    outTo.innerHTML = ["Claude", "Groq", "Telegram"].map((who) => {
      const n = OUT.filter((o) => o.on && o.to.includes(who)).length;
      return `<span class="to${n ? " on" : ""}"><i></i>${who}<small>${n ? plural(n, "switch", "switches") : "nothing"}</small></span>`;
    }).join("");
    if (pulse) { const f = $(`[data-out-id="${pulse}"]`, outRows); if (f) f.focus(); }
  }
  outRows.addEventListener("click", (e) => {
    const b = e.target.closest("[data-out-id]");
    if (!b) return;
    const o = OUT.find((x) => x.id === b.dataset.outId);
    o.on = !o.on;
    paintOut(o.id);
  });
  paintOut();
  const kept = (list) => list.map(([name, note]) => `<details><summary>${esc(name)}${icon("chevron")}</summary><p>${esc(note)}</p></details>`).join("");
  $('[data-kept="sealed"]').innerHTML = kept(SEALED);
  $('[data-kept="readable"]').innerHTML = kept(READABLE);

  paintTheme();
})();
