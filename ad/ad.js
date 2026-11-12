// Dayhub's animated ad. Every frame is a pure function of time: AD.seek(t) lays the whole picture out for that moment,
// so render.mjs can step through it at 30 frames a second and nothing depends on how fast the machine is.
//
//   index.html?cut=30&shape=vertical     the 30-second cut for Reels, TikTok and Shorts (1080 × 1920)
//   index.html?cut=15&shape=wide         the 15-second cut in 16:9 (1920 × 1080)
//   &t=12.5                              stop at a moment (for looking at it in a browser)
//
// The screens are the real app on the screenshot rig's made-up member (shots/site, from `npm run shots`; the tall ones
// in shots/ad are those frames joined by stitch.py). Every line on screen says what the app does today; the privacy
// words follow src/lib/privacy-view.ts and the app's /privacy page.
(function () {
  "use strict";

  const Q = new URLSearchParams(location.search);
  const CUT = Q.get("cut") === "15" ? 15 : 30;
  // ?plate=1: the phone's screen alone, full frame and still, for laying onto a filmed phone (PRODUCTION.md).
  const PLATE = Q.get("plate") === "1";
  const WIDE = !PLATE && Q.get("shape") === "wide";
  const W = PLATE ? 1080 : WIDE ? 1920 : 1080, H = PLATE ? 2330 : WIDE ? 1080 : 1920;
  if (PLATE) document.documentElement.classList.add("plate");
  const SHOTS = Q.get("shots") || "../shots/site/";
  const TALL = Q.get("tall") || "../shots/ad/";
  const ART = window.AdArt;
  const LONG = (() => { try { const x = new XMLHttpRequest(); x.open("GET", TALL + "long.json", false); x.send(); return JSON.parse(x.responseText); } catch { return {}; } })();

  const stage = document.getElementById("stage");
  stage.style.width = W + "px";
  stage.style.height = H + "px";

  // ── Time ──
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
  const E = {
    out3: (p) => 1 - Math.pow(1 - p, 3),
    out5: (p) => 1 - Math.pow(1 - p, 5),
    in3: (p) => p * p * p,
    io3: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  };
  /** A damped spring from 0 toward 1, `s` seconds after it starts: the app's Lively motion. */
  function spring(s, f = 1.7, z = 0.62) {
    if (s <= 0) return 0;
    const w = 2 * Math.PI * f, wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s));
  }
  /** 0 → 1 → 0 over [t0, t1], with ramps of `r` seconds. */
  const win = (t, t0, t1, r = 0.3) => Math.min(prog(t, t0, t0 + r), 1 - prog(t, t1 - r, t1));

  // ── The cut ──
  // 109 beats a minute: a bar is 2.2 s, so the montage changes on the bar and the day closes on a downbeat.
  const BAR = 2.2;
  const T = CUT === 30 ? {
    dur: 30, phoneIn: [1.4, 2.25], sayTap: 2.5, rec: 2.75,
    said: "Dinner was salmon with rice and broccoli, a glass of red wine… and a hundred push-ups.",
    words: [2.95, 7.7], fine: [3.2, 8.15], check: 8.25, fillTap: 10.45, closed: 11.0, montage: 13.2, end: 24.2,
  } : {
    dur: 15, phoneIn: [1.2, 2.05], sayTap: 2.25, rec: 2.5,
    said: "Salmon with rice and broccoli, a glass of red wine, and a hundred push-ups.",
    words: [2.65, 6.35], fine: [2.8, 6.55], check: 6.6, fillTap: 8.25, closed: 8.8, montage: null, end: 11.0,
  };
  // A recorded voice can move when the member's words appear: &words=start,end, in seconds (voice.py says what to pass).
  const wordsAt = (Q.get("words") || "").split(",").map(Number);
  if (wordsAt.length === 2 && wordsAt.every((x) => Number.isFinite(x)) && wordsAt[1] > wordsAt[0]) T.words = wordsAt;
  const MARKS = [["salmon with rice and broccoli", "food"], ["a glass of red wine", "food"], ["a hundred push-ups", "activity"]];
  const BEATS = [
    { key: "journal", kick: "Journal", hue: "journal", vo: "A voice journal only you can open.", lines: [[["A voice journal"]], [["only you can open.", "hl"]]] },
    { key: "food", kick: "Food", hue: "food", vo: "Food, said out loud or tapped.", lines: [[["Food,"], ["said out loud", "hl"]], [["or tapped."]]] },
    { key: "moves", kick: "Moves", hue: "activity", vo: "Moves of your own. Rounds with friends.", lines: [[["Moves of"], ["your own.", "hl"]], [["Rounds with friends."]]], delays: [0, 1.0] },
    { key: "insights", kick: "Insights", hue: "journal", vo: "See what makes your good days.", lines: [[["See what makes"]], [["your good days.", "all"]]] },
    { key: "privacy", kick: "What Dayhub can see", hue: "journal", allhue: true, vo: "Privacy you can see.", lines: [[["Privacy"]], [["you can see.", "hl"]]] },
  ];

  // Sounds for sound.py, in seconds: what happens when.
  const cues = [];
  const cue = (t, kind, extra) => cues.push(Object.assign({ t: +t.toFixed(3), kind }, extra || {}));
  // The voiceover's lines (VOICEOVER.md), each where its words come up on screen; voice.py sets a recording to them.
  const VO = [[0.3, "Say your day in a minute."], [T.words[0] + 0.05, T.said, "member"]]
    .concat(CUT === 30 ? [[T.check + 0.35, "Check it. Nothing is logged until you tap."]] : [[T.check + 0.3, "Check it, then tap."]])
    .concat([[T.closed + 0.3, "That's the day."]])
    .concat(T.montage != null ? BEATS.map((b, i) => [T.montage + i * BAR + 0.12, b.vo]) : [])
    .concat([[T.end + 0.4, "Dayhub. Say your day in a minute. Request an invite."]]);
  VO.forEach(([t, text, who], i) => cue(t, "vo", { i, text, who: who || "narrator" }));

  // ── Building blocks ──
  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    (parent || stage).appendChild(e);
    return e;
  }
  function put(e, o) {
    let tr = "";
    if (o.x != null || o.y != null) tr += `translate(${(o.x || 0).toFixed(2)}px,${(o.y || 0).toFixed(2)}px) `;
    if (o.r) tr += `rotate(${o.r.toFixed(3)}deg) `;
    if (o.s != null && Math.abs(o.s - 1) > 1e-4) tr += `scale(${o.s.toFixed(4)})`;
    e.style.transform = tr;
    if (o.o != null) {
      const v = clamp(o.o);
      e.style.opacity = v.toFixed(3);
      e.style.visibility = v < 0.002 ? "hidden" : "";
    }
    if (o.blur != null) e.style.filter = o.blur > 0.05 ? `blur(${o.blur.toFixed(2)}px)` : "";
  }
  const show = (e, on) => { e.style.display = on ? "" : "none"; };
  const ICON = (name) => `<svg class="ic" viewBox="0 0 24 24"><use href="#i-${name}"/></svg>`;

  /** A narrator line, word by word: each word rises in on a spring and leaves soft. */
  function makeSuper(parent, lines, o) {
    const e = el("div", `super d ${o.hue || ""}`, parent);
    e.style.setProperty("--w", o.width + "px");
    e.style.fontSize = o.size + "px";
    e.style.textAlign = o.align || "left";
    const words = [];
    if (o.kick) {
      const k = el("div", `kick eb${o.allhue ? " allhue" : ""}`, e, `<i></i>${o.kick}`);
      k.style.fontSize = Math.round(o.kickSize || o.size * 0.29) + "px";
      k.style.marginBottom = Math.round(o.size * 0.3) + "px";
      if (o.align === "center") k.style.justifyContent = "center";
      words.push({ el: k, delay: 0 });
    }
    lines.forEach((segs, li) => {
      const ln = el("span", "ln", e);
      if (o.sizes && o.sizes[li]) ln.style.fontSize = o.sizes[li] + "px";
      if (li > 0) ln.style.marginTop = Math.round((o.gap || 0.06) * o.size) + "px";
      segs.forEach(([text, cls]) => text.split(" ").forEach((word) => {
        const w = el("span", "w" + (cls ? " " + cls : ""), ln);
        w.textContent = word;
        ln.appendChild(document.createTextNode(" "));
        words.push({ el: w, delay: (o.delays && o.delays[li]) || 0 });
      }));
    });
    return {
      e,
      update(t, tin, tout, stagger = 0.055) {
        const vis = t > tin - 0.01 && t < tout + 0.5;
        show(e, vis);
        if (!vis) return;
        const q = E.out3(prog(t, tout, tout + 0.4));
        let k = 0, lastDelay = 0;
        words.forEach((w) => {
          if (w.delay !== lastDelay) { k = 0; lastDelay = w.delay; }
          const s = t - (tin + w.delay + k * stagger);
          k++;
          const p = spring(s, 1.5, 0.72);
          const a = clamp(s / 0.28) * (1 - q);
          w.el.style.opacity = a.toFixed(3);
          w.el.style.transform = `translateY(${((1 - p) * 0.42 - q * 0.18).toFixed(3)}em)`;
          const b = (1 - clamp(s / 0.32)) * 10 + q * 6;
          w.el.style.filter = b > 0.1 ? `blur(${b.toFixed(1)}px)` : "";
        });
      },
    };
  }

  /**
   * The phone: the landing page's slab, flat, with real screens inside and a hand round it. A screen is a file in
   * shots/site, or { tall: "activity" } for a page joined from the rig's frames, which can scroll under its tab bar.
   */
  const K = 374 / 780; // a screenshot pixel on the phone's screen
  function makePhone(parent, screens, hand) {
    const root = el("div", "phone", parent);
    root.innerHTML = `<div class="ph-shadow"></div>` + (hand ? ART.hand("back", hand.skin, hand.sleeve, hand) : "") +
      `<div class="ph-btn" style="left:-4px;top:172px;height:58px"></div><div class="ph-btn" style="left:-4px;top:246px;height:58px"></div><div class="ph-btn" style="left:399px;top:214px;height:92px"></div>` +
      `<div class="ph-body"><div class="ph-screen"></div></div><div class="ph-glare"></div>` + (hand ? ART.hand("front", hand.skin, hand.sleeve, hand) : "");
    const screen = root.querySelector(".ph-screen");
    const layers = {};
    for (const [k, f] of Object.entries(screens)) {
      const layer = el("div", "scr-layer", screen);
      const img = document.createElement("img");
      img.className = "scr";
      img.decoding = "sync";
      layer.appendChild(img);
      let tab = null;
      if (typeof f === "object" && f.tall) {
        img.src = TALL + f.tall + ".long.png";
        img.style.height = "auto";
        const m = LONG[f.tall];
        if (m) {
          tab = document.createElement("img");
          tab.className = "tab";
          tab.src = TALL + f.tall + ".tab.png";
          tab.style.cssText = `left:${(m.tab[0] * K).toFixed(2)}px;top:${(m.tab[1] * K).toFixed(2)}px;width:${((m.tab[2] - m.tab[0]) * K).toFixed(2)}px`;
          layer.appendChild(tab);
        }
      } else img.src = SHOTS + f;
      // Things drawn over this screen alone (a clock), in its pixels, so they move and fade with it.
      const own = el("div", "ph-ovl", layer);
      layers[k] = { layer, img, tab, own };
    }
    const ovl = el("div", "ph-ovl", screen);
    const glare = root.querySelector(".ph-glare");
    return {
      root, ovl,
      on(k) { return layers[k].own; },
      screens(map) {
        for (const k of Object.keys(layers)) {
          const v = clamp(map[k] || 0);
          layers[k].layer.style.opacity = v.toFixed(3);
          layers[k].layer.style.visibility = v < 0.002 ? "hidden" : "";
        }
      },
      /** Move a screen within the phone (a push, a rise): x and y in screen pixels, a scale, a dimming. */
      move(k, o) {
        const l = layers[k].layer;
        l.style.transform = `translate(${(o.x || 0).toFixed(1)}px,${(o.y || 0).toFixed(1)}px) scale(${(o.s == null ? 1 : o.s).toFixed(4)})`;
        l.style.filter = o.dim ? `brightness(${(1 - o.dim).toFixed(3)})` : "";
      },
      /** Scroll a tall screen to `y` screenshot pixels from its top. */
      scroll(k, y) { layers[k].img.style.transform = `translateY(${(-y * K).toFixed(2)}px)`; },
      place(cx, cy, s, r = 0, gx = 0) {
        if (PLATE) { cx = W / 2; cy = H / 2; s = W / 374; r = 0; }
        root.style.transform = `translate(${(cx - 200).toFixed(2)}px,${(cy - 416.5).toFixed(2)}px) rotate(${r.toFixed(3)}deg) scale(${s.toFixed(4)})`;
        glare.style.backgroundPosition = `${(50 + gx).toFixed(1)}% 0`;
      },
    };
  }
  /** Where a screenshot point (780 × 1688) lands on the stage for a phone placed at (cx, cy, s, r). */
  function onScreen(cx, cy, s, r, sx, sy) {
    const ux = 13 + sx * K - 200, uy = 13 + sy * K - 416.5, a = (r * Math.PI) / 180;
    return [cx + s * (ux * Math.cos(a) - uy * Math.sin(a)), cy + s * (ux * Math.sin(a) + uy * Math.cos(a))];
  }
  /** One screen giving way to another: "rise" (a full-screen moment opens), "push" (a tap goes forward), "swap"
   *  (one fades, then the next comes up). p runs 0 → 1. */
  function change(ph, from, to, p, how) {
    if (how === "push") {
      ph.screens({ [from]: p < 1 ? 1 : 0, [to]: p > 0 ? 1 : 0 });
      ph.move(from, { x: -p * 110, dim: 0.35 * p });
      ph.move(to, { x: (1 - p) * 374 });
    } else if (how === "rise") {
      ph.screens({ [from]: p < 1 ? 1 : 0, [to]: p });
      ph.move(from, { s: 1 - 0.03 * p, dim: 0.4 * p });
      ph.move(to, { y: (1 - p) * 34, s: lerp(0.96, 1, p) });
    } else {
      ph.screens({ [from]: 1 - clamp(p / 0.45), [to]: clamp((p - 0.35) / 0.65) });
      ph.move(from, { s: 1 - 0.02 * p });
      ph.move(to, { y: (1 - clamp((p - 0.35) / 0.65)) * 26, s: lerp(0.975, 1, clamp((p - 0.35) / 0.65)) });
    }
  }

  /** A tap on a screen: a soft press that grows and a ring that leaves. Coordinates in the screenshot's pixels. */
  function makeTap(ovl, sx, sy) {
    const dot = el("div", "tap", ovl), ring = el("div", "tap-ring", ovl);
    for (const e of [dot, ring]) { e.style.left = sx + "px"; e.style.top = sy + "px"; }
    return (t, at) => {
      const s = t - at;
      const vis = s > -0.25 && s < 0.6;
      show(dot, vis); show(ring, vis);
      if (!vis) return;
      const pin = E.out3(prog(s, -0.22, 0)), out = prog(s, 0.05, 0.45);
      put(dot, { s: lerp(0.6, 1, pin) * (1 - 0.25 * out), o: pin * (1 - out) });
      put(ring, { s: lerp(0.7, 2.1, E.out3(prog(s, 0, 0.5))), o: prog(s, 0, 0.04) * (1 - prog(s, 0.1, 0.5)) });
    };
  }

  /** A clock over a screen's own 0:00, so a recording counts. */
  function makeClock(ovl, box, bg, size) {
    const p = el("div", "patch", ovl);
    p.style.cssText += `left:${box[0]}px;top:${box[1]}px;width:${box[2]}px;height:${box[3]}px;--bg:${bg}`;
    const c = el("div", "clock", p);
    c.style.cssText = `position:absolute;right:3px;top:0;font-size:${size}px;line-height:${box[3]}px;`;
    return { el: p, set(secs) { c.textContent = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`; } };
  }

  /** Today's orb: the landing page's WebGL sphere, the ring of five, the beads, the count. `size` is the 280 box. */
  const TASKS = [
    { key: "weight", cls: "food", icon: "scale", at: [50, 7.86] },
    { key: "checkin", cls: "journal", icon: "heart", at: [90.07, 36.98] },
    { key: "journal", cls: "journal", icon: "mic", at: [74.77, 84.09] },
    { key: "food", cls: "food", icon: "leaf", at: [25.23, 84.09] },
    { key: "move", cls: "activity", icon: "run", at: [9.93, 36.98] },
  ];
  const HUE_HEX = { journal: "#8F8AF7", food: "#4BCF93", activity: "#F39A57" };
  function makeOrb(parent, size) {
    const root = el("div", "orb-stage", parent);
    root.style.setProperty("--s", size + "px");
    const R = 118, C = 2 * Math.PI * R, GAP = 6, SLOT = 72, SPAN = ((SLOT - GAP) / 360) * C;
    root.innerHTML = `<div class="orb-rays"></div><canvas class="orb-gl"></canvas><div class="orb-track"></div>
      <svg class="orb-ring" viewBox="0 0 280 280">${TASKS.map((tk, i) => `<circle cx="140" cy="140" r="${R}" style="stroke:var(--${tk.cls})" transform="rotate(${(i * SLOT - SLOT / 2 + GAP / 2).toFixed(1)} 140 140)"/>`).join("")}</svg>
      <div class="orb-glow"></div>
      <div class="orb-core"><span class="orb-open"><span class="dc orb-n">3</span><span class="dc orb-of">/5</span></span><span class="eb orb-word ow-a">Done today</span></div>
      <span class="eb orb-word ow-b" style="position:absolute;left:0;right:0;top:57%;text-align:center">Day closed</span>
      <svg class="orb-tick" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>
      ${TASKS.map((tk) => `<div class="bead ${tk.cls}" style="left:${tk.at[0]}%;top:${tk.at[1]}%"><div class="bead-glow"></div>${ICON(tk.icon).replace('class="ic"', "")}</div>`).join("")}`;
    const gl = window.AdOrb.create(root.querySelector("canvas"), Math.round(size * 1.36));
    const arcs = [...root.querySelectorAll(".orb-ring circle")];
    const beads = [...root.querySelectorAll(".bead")];
    const glows = beads.map((b) => b.querySelector(".bead-glow"));
    const parts = {
      rays: root.querySelector(".orb-rays"), track: root.querySelector(".orb-track"), ring: root.querySelector(".orb-ring"),
      glow: root.querySelector(".orb-glow"), core: root.querySelector(".orb-core"), open: root.querySelector(".orb-open"), n: root.querySelector(".orb-n"),
      wordA: root.querySelector(".ow-a"), wordB: root.querySelector(".ow-b"), tick: root.querySelector(".orb-tick"),
    };
    return {
      root, gl,
      /** v: how done each of the five is (0–1); closed 0–1; pops: when each bead last turned on; t: now. */
      update(o) {
        const lit = [(o.v[1] + o.v[2]) / 2, (o.v[0] + o.v[3]) / 2, o.v[4]];
        const flare = o.flare || [0, 0, 0];
        gl.draw({ time: o.time, lit: lit.map((x, i) => Math.min(1.45, x + flare[i])), closed: o.closed, yaw: 0.35 + (o.yaw || 0), pitch: 0, halo: o.halo == null ? 1 : o.halo });
        const draw = o.draw == null ? 1 : o.draw;
        arcs.forEach((a, i) => {
          const v = clamp(o.v[i]) * draw;
          a.style.strokeDasharray = `${(v * SPAN).toFixed(2)} ${C.toFixed(1)}`;
          a.style.opacity = v > 0.002 ? "1" : "0";
        });
        beads.forEach((b, i) => {
          const hue = HUE_HEX[TASKS[i].cls], v = o.v[i];
          const on = clamp((v - 0.98) / 0.02);
          const part = v > 0.001 && v < 0.98;
          b.style.background = on > 0 ? `color-mix(in srgb, ${hue} ${(on * 100).toFixed(0)}%, #0B0A09)` : "#0B0A09";
          b.style.borderColor = on > 0 || part ? hue : "#3A3631";
          b.style.color = on > 0.5 ? "#14130F" : part || on > 0 ? hue : "#A39E94";
          b.style.boxShadow = on > 0 ? `0 0 0 ${(5 * on).toFixed(1)}px color-mix(in srgb, ${hue} 20%, transparent), 0 0 ${(24 * on).toFixed(0)}px color-mix(in srgb, ${hue} 60%, transparent)` : "none";
          const ps = o.pops && o.pops[i] != null ? o.t - o.pops[i] : 9;
          const pop = ps >= 0 && ps < 1.2 ? 1 + 0.32 * Math.exp(-ps * 5) * Math.sin(ps * 14) : 1;
          const bin = o.beadsIn == null ? 1 : clamp(o.beadsIn - i * 0.12, 0, 1);
          b.style.transform = `scale(${(pop * E.out3(bin)).toFixed(3)})`;
          b.style.opacity = bin.toFixed(3);
          glows[i].style.opacity = (ps >= 0 && ps < 1.2 ? 0.8 * Math.exp(-ps * 3) : 0).toFixed(3);
        });
        const c = clamp(o.closed);
        const core = o.core == null ? 1 : o.core;
        parts.track.style.opacity = ((1 - c) * draw).toFixed(3);
        parts.ring.style.opacity = (1 - c).toFixed(3);
        parts.glow.style.opacity = c.toFixed(3);
        parts.glow.style.transform = `rotate(${((o.time * 360) / 7) % 360}deg)`;
        parts.rays.style.opacity = (c * (o.rays == null ? 1 : o.rays)).toFixed(3);
        parts.rays.style.transform = `rotate(${(o.time * 6).toFixed(2)}deg) scale(${(0.9 + 0.1 * c).toFixed(3)})`;
        parts.n.textContent = String(o.v.filter((x) => x >= 0.98).length);
        parts.open.style.opacity = ((1 - c) * core).toFixed(3);
        parts.wordA.style.opacity = ((1 - c) * core).toFixed(3);
        parts.wordB.style.opacity = (c * core).toFixed(3);
        const tk = spring(o.tickAt == null ? 0 : o.t - o.tickAt, 1.6, 0.5);
        parts.tick.style.opacity = (c * core).toFixed(3);
        parts.tick.style.transform = `scale(${(0.6 + 0.4 * tk).toFixed(3)})`;
      },
    };
  }

  // ── Layout: where things sit in each shape ──
  const L = WIDE ? {
    textX: 150, hookY: 330, hookSize: 132, orbHero: { x: 1330, y: 540, size: 780 },
    phone: { x: 1400, y: 560, s: 1.13 }, phoneCheck: { x: 1400, y: 610, s: 1.5 }, phoneTap: { x: 1400, y: 150, s: 1.5 },
    saidY: 330, saidSize: 66, saidW: 820, fineY: 770, fineSize: 24, fineW: 780, checkY: 360,
    closedOrb: { x: 1330, y: 540, size: 820 }, closedSuperY: 380, streakAt: [150, 600], streakSize: 150,
    beatPhone: { x: 1430, y: 600, s: 1.08 }, beatSuperY: 210, accentY: 640,
    end: { orb: { x: 600, y: 540, size: 640 }, brandX: 1040, brandY: 300, brandSize: 150, tagY: 520, tagSize: 58, ctaY: 660, fineY: 850 },
  } : {
    textX: 70, hookY: 290, hookSize: 128, orbHero: { x: 540, y: 1080, size: 820 },
    phone: { x: 540, y: 1330, s: 1.45 }, phoneCheck: { x: 540, y: 1230, s: 1.92 }, phoneTap: { x: 540, y: 760, s: 1.92 },
    saidY: 300, saidSize: 64, saidW: 920, fineY: 0, fineSize: 23, fineW: 900, checkY: 200,
    closedOrb: { x: 540, y: 960, size: 860 }, closedSuperY: 230, streakAt: [540, 1430], streakSize: 170,
    beatPhone: { x: 540, y: 1360, s: 1.36 }, beatSuperY: 200, accentY: 540,
    end: { orb: { x: 540, y: 700, size: 640 }, brandX: 540, brandY: 1090, brandSize: 150, tagY: 1240, tagSize: 58, ctaY: 1360, fineY: 1500 },
  };

  // ── Scenes 1 to 3: the hook, saying the day on an evening walk, checking it ──
  const sStreet = el("div", "scene");
  const street = ART.street(W, H);
  const sky = el("div", "", sStreet, street.sky);
  const far = el("div", "", sStreet, street.far);
  const mid = el("div", "", sStreet, street.mid);
  const near = el("div", "", sStreet, street.near);
  const streetShade = el("div", "shade", sStreet);

  const sHook = el("div", "scene");
  sHook.style.zIndex = "3"; // the orb flies into the phone, so over it
  const hookSuper = makeSuper(sHook, [[["Say your day"]], [["in a minute.", "all"]]], { width: WIDE ? 820 : 920, size: L.hookSize, align: WIDE ? "left" : "center" });
  const heroOrb = makeOrb(sHook, L.orbHero.size);

  const sWalk = el("div", "scene");
  const walkPhone = makePhone(sWalk, { today: "today.night.png", rec: "moment-day.night.png", check: "moment-day-check.night.png" }, { skin: "brown", sleeve: "#2E3A55" });
  const recClock = makeClock(walkPhone.on("rec"), [640, 52, 110, 54], "#0B0A09", 32);
  const checkClock = makeClock(walkPhone.on("check"), [640, 52, 110, 54], "#0B0A09", 32);
  const entryClock = makeClock(walkPhone.on("check"), [626, 396, 92, 44], "#161513", 30);
  const micGlow = el("div", "glowdot journal", walkPhone.on("rec"));
  micGlow.style.cssText += "left:110px;top:203px;width:560px;height:560px;";
  const sayTap = makeTap(walkPhone.ovl, 390, 1068);
  const fillTap = makeTap(walkPhone.ovl, 390, 1467);
  const ticks = [595, 789, 963].map((y, i) => {
    const g = el("div", "glowdot " + (i < 2 ? "food" : "activity"), walkPhone.ovl);
    g.style.cssText += `left:${104 - 70}px;top:${y - 70}px;width:140px;height:140px;`;
    return g;
  });
  const press = el("div", "patch", walkPhone.ovl);
  press.style.cssText += "left:44px;top:1411px;width:692px;height:112px;border-radius:56px;--bg:#000;";

  // What the member says, word by word, the three things Dayhub picks out marked in their hue.
  const saidBox = el("div", "said", sWalk);
  saidBox.style.setProperty("--w", L.saidW + "px");
  saidBox.style.setProperty("--fs", L.saidSize + "px");
  const saidHead = el("div", "kick eb journal", sWalk, `<i></i><span class="sh-a">Your day · recording</span>`);
  saidHead.style.fontSize = "26px";
  const saidWords = [];
  const markEls = [];
  (function build() {
    const text = T.said;
    const ranges = MARKS.map(([phrase, cls], i) => { const at = text.indexOf(phrase); return { from: at, to: at + phrase.length, cls, i }; });
    let pos = 0, open = null, holder = saidBox;
    text.split(" ").forEach((word, n) => {
      const r = ranges.find((x) => pos >= x.from && pos < x.to) || null;
      if (r !== open) {
        if (n) saidBox.appendChild(document.createTextNode(" "));
        holder = r ? el("mark", r.cls, saidBox) : saidBox;
        if (r) markEls[r.i] = holder;
        open = r;
      } else if (n) holder.appendChild(document.createTextNode(" "));
      const w = el("span", "w", holder);
      w.textContent = word;
      saidWords.push({ el: w, mark: r ? r.i : -1, word });
      pos += word.length + 1;
    });
  })();
  // Each word's moment: its share of the time by its syllables, a breath at commas and the ellipsis.
  (function timeWords() {
    const syl = (w) => Math.max(1, (w.toLowerCase().replace(/[^a-z]/g, "").match(/[aeiouy]+/g) || []).length);
    const weights = saidWords.map((x) => syl(x.word) + 0.6);
    const pauses = saidWords.map((x) => (/…$/.test(x.word) ? 2.4 : /,$/.test(x.word) ? 1.1 : 0));
    const total = weights.reduce((a, b) => a + b, 0) + pauses.reduce((a, b) => a + b, 0);
    const k = (T.words[1] - T.words[0]) / total;
    let at = T.words[0];
    saidWords.forEach((x, i) => { x.at = at; at += (weights[i] + pauses[i]) * k; x.end = at - pauses[i] * k; });
    MARKS.forEach((m, i) => { m.lit = saidWords.filter((x) => x.mark === i).pop().end; });
  })();
  const fine1 = el("div", "fine", sWalk, "Say your day is off until you turn it on. The recording goes to <b>Groq</b> to be written down, and the words go to <b>Claude</b>, which picks out your day. Your entry is stored sealed.");
  fine1.style.setProperty("--w", L.fineW + "px");
  fine1.style.setProperty("--fs", L.fineSize + "px");

  // The 15-second cut has no time for the long line; its screen says it anyway ("Nothing is logged until you tap").
  const checkLines = CUT === 30 ? [[["Check it."]], [["Nothing is logged"], ["until you tap.", "hl"]]] : [[["Check it,"], ["then tap.", "hl"]]];
  const checkSuper = makeSuper(sWalk, checkLines, { width: WIDE ? 800 : 940, size: WIDE ? 104 : 100, sizes: [0, WIDE ? 64 : 60], gap: 0.22, align: WIDE ? "left" : "center", hue: "journal" });

  cue(T.phoneIn[0], "whoosh", { len: 0.9 });
  cue(T.sayTap, "tap");
  cue(T.rec, "rec-start");
  saidWords.forEach((x) => cue(x.at, "word"));
  cue(T.check - 0.05, "rec-stop");
  cue(T.check + 0.05, "whoosh", { len: 0.6, soft: true });
  [0, 1, 2].forEach((i) => cue(T.check + 0.75 + i * 0.2, "tick", { i }));
  cue(T.fillTap, "tap");
  cue(T.closed - 0.45, "riser", { len: 0.45 });
  cue(T.closed, "close");

  /** Where the walking phone is, at any moment. */
  function walkPlace(t) {
    const a = E.out5(prog(t, T.phoneIn[0], T.phoneIn[1]));
    const settle = spring(t - T.phoneIn[0] - 0.15, 1.2, 0.75);
    const p = L.phone;
    let cx = p.x, cy = lerp(p.y + H * 0.9, p.y, Math.min(1, settle * 0.7 + a * 0.3)), s = p.s, r = lerp(8, -3, a);
    const walk = clamp((t - T.phoneIn[1]) / 0.6) * (1 - prog(t, T.check, T.check + 0.4) * 0.8);
    cy += walk * 7 * Math.sin(2 * Math.PI * 1.75 * t);
    r += walk * 0.7 * Math.sin(2 * Math.PI * 0.875 * t + 0.6);
    cx += walk * 5 * Math.sin(2 * Math.PI * 0.875 * t);
    const c1 = E.io3(prog(t, T.check + 0.05, T.check + 0.7));
    const c2 = E.io3(prog(t, T.fillTap - 0.6, T.fillTap - 0.1));
    if (c1 > 0) {
      const A = L.phoneCheck, B = L.phoneTap;
      cx = lerp(cx, lerp(A.x, B.x, c2), c1);
      cy = lerp(cy, lerp(A.y, B.y, c2), c1);
      s = lerp(s, lerp(A.s, B.s, c2), c1);
      r = lerp(r, 0, c1);
    }
    s *= 1 + E.in3(prog(t, T.fillTap + 0.12, T.closed + 0.1)) * 0.35;
    return { cx, cy, s, r };
  }

  function updateOpening(t) {
    const hookOn = t < T.phoneIn[1] + 0.3;
    show(sHook, hookOn);
    if (hookOn) {
      const appear = E.out3(prog(t, 0.05, 0.9));
      const o = L.orbHero;
      const wp = walkPlace(t);
      const [mx, my] = onScreen(wp.cx, wp.cy, wp.s, wp.r, 390, 603);
      const k = E.io3(prog(t, T.phoneIn[0], T.phoneIn[1] - 0.05));
      const target = (190 * K * wp.s) / (o.size * 0.34285);
      const s = lerp(lerp(0.86, 1, appear), target, k);
      heroOrb.root.style.transform = `translate(${(lerp(o.x, mx, k) - o.size / 2).toFixed(2)}px,${(lerp(o.y, my, k) - o.size / 2).toFixed(2)}px) rotate(${lerp(0, wp.r, k).toFixed(3)}deg) scale(${s.toFixed(4)})`;
      heroOrb.root.style.opacity = (appear * (1 - prog(t, T.phoneIn[1] - 0.15, T.phoneIn[1] + 0.12))).toFixed(3);
      heroOrb.update({ time: t + 3, t, v: [1, 1, 0, 0.75, 1], closed: 0, draw: E.out3(prog(t, 0.15, 1.1)), beadsIn: prog(t, 0.3, 1.2) * 1.6, halo: lerp(1, 0.35, k), yaw: t * 0.05 });
      put(hookSuper.e, { x: WIDE ? L.textX : (W - 920) / 2, y: L.hookY - E.in3(prog(t, T.phoneIn[0] - 0.1, T.phoneIn[1])) * 80 });
      hookSuper.update(t, 0.3, T.phoneIn[1] - 0.4, CUT === 30 ? 0.09 : 0.07);
    }
    const streetOn = t > T.phoneIn[0] - 0.1 && t < T.closed + 0.2;
    show(sStreet, streetOn);
    if (streetOn) {
      const vis = E.out3(prog(t, T.phoneIn[0], T.phoneIn[1] + 0.4));
      const slow = 1 - 0.7 * E.io3(prog(t, T.check, T.check + 0.8));
      const dist = Math.max(0, t - T.phoneIn[0]) * slow;
      put(sky, { x: 0, y: 0, o: vis });
      put(far, { x: -dist * 14 - W * 0.1, y: 0, o: vis });
      put(mid, { x: -dist * 95 - W * 0.05, y: 0, o: vis });
      put(near, { x: -dist * 210, y: 0, o: vis });
      put(streetShade, { o: 0.15 + 0.55 * E.io3(prog(t, T.check, T.check + 0.7)) });
    }
    const walkOn = t > T.phoneIn[0] - 0.05 && t < T.closed + 0.15;
    show(sWalk, walkOn);
    if (!walkOn) return;
    const wp = walkPlace(t);
    walkPhone.place(wp.cx, wp.cy, wp.s, wp.r, Math.sin(t * 0.9) * 6);
    walkPhone.root.style.opacity = (1 - prog(t, T.closed - 0.08, T.closed + 0.1)).toFixed(3);
    // The screen wakes as the orb lands on it; Say your day opens the recording; Stop and save brings the list.
    const wake = prog(t, T.phoneIn[1] - 0.32, T.phoneIn[1] - 0.02);
    const toRec = E.out3(prog(t, T.sayTap + 0.1, T.sayTap + 0.38));
    const toCheck = prog(t, T.check + 0.02, T.check + 0.42);
    if (toCheck > 0) {
      change(walkPhone, "rec", "check", toCheck, "swap");
      walkPhone.screens({ rec: 1 - clamp(toCheck / 0.45), check: clamp((toCheck - 0.35) / 0.65) });
    } else if (toRec > 0) change(walkPhone, "today", "rec", toRec, "rise");
    else { walkPhone.screens({ today: wake }); walkPhone.move("today", {}); }
    sayTap(t, T.sayTap);
    fillTap(t, T.fillTap);
    const recSecs = Math.max(0, Math.min(t, T.check) - T.rec);
    recClock.set(recSecs);
    checkClock.set(T.check - T.rec);
    entryClock.set(T.check - T.rec);
    const recVis = toRec * (1 - clamp(toCheck / 0.45));
    // The voice: louder on each word.
    let level = 0;
    for (const x of saidWords) { const s = t - x.at; if (s > -0.05 && s < 0.5) level = Math.max(level, Math.exp(-s * 5) * (0.6 + 0.4 * Math.abs(Math.sin(x.at * 7)))); }
    micGlow.style.opacity = (recVis * (0.12 + 0.55 * level)).toFixed(3);
    micGlow.style.transform = `scale(${(0.92 + 0.18 * level).toFixed(3)})`;
    ticks.forEach((g, i) => { const s = t - (T.check + 0.75 + i * 0.2); g.style.opacity = (s > 0 && s < 0.9 ? 0.75 * Math.sin(Math.PI * clamp(s / 0.9)) : 0).toFixed(3); });
    const pr = t - T.fillTap;
    press.style.opacity = (pr > -0.12 && pr < 0.4 ? 0.22 * Math.sin(Math.PI * clamp((pr + 0.12) / 0.52)) : 0).toFixed(3);

    // The words, as they are said.
    const sayVis = win(t, T.words[0] - 0.4, T.check + 0.6, 0.3);
    show(saidBox, sayVis > 0.001);
    show(saidHead, sayVis > 0.001);
    if (sayVis > 0.001) {
      const x0 = WIDE ? L.textX : (W - L.saidW) / 2;
      put(saidHead, { x: x0, y: L.saidY - 70, o: win(t, T.rec, T.check, 0.3) });
      saidHead.querySelector(".sh-a").textContent = `Your day · recording ${Math.floor(recSecs / 60)}:${String(Math.floor(recSecs % 60)).padStart(2, "0")}`;
      const fly = E.io3(prog(t, T.check, T.check + 0.55));
      put(saidBox, { x: x0, y: L.saidY - fly * 30, o: 1 - fly });
      saidWords.forEach((x) => {
        const s = t - x.at;
        const a = clamp(s / 0.18);
        const dim = x.mark < 0 ? prog(t, T.words[1] + 0.2, T.check) * 0.55 : 0;
        x.el.style.opacity = (a * (1 - dim)).toFixed(3);
        x.el.style.transform = `translateY(${((1 - E.out3(clamp(s / 0.3))) * 0.25).toFixed(3)}em)`;
      });
      markEls.forEach((m, i) => {
        const lit = E.out3(prog(t, MARKS[i].lit + 0.05, MARKS[i].lit + 0.4));
        const col = MARKS[i][1] === "food" ? "75,207,147" : "243,154,87";
        m.style.backgroundColor = `rgba(${col},${(0.22 * lit).toFixed(3)})`;
        m.style.color = lit > 0.5 ? (MARKS[i][1] === "food" ? "#9BE5C2" : "#F8C49C") : "";
      });
      put(fine1, { x: WIDE ? L.textX : (W - L.fineW) / 2, y: WIDE ? L.fineY : L.saidY + saidBox.offsetHeight + 28, o: win(t, T.fine[0], T.fine[1], 0.35) });
    } else put(fine1, { o: 0 });
    put(checkSuper.e, { x: WIDE ? L.textX : (W - 940) / 2, y: L.checkY });
    checkSuper.update(t, T.check + 0.3, T.fillTap - 0.3, 0.06);
  }

  // ── Scene 4: the day closes ──
  const sClosed = el("div", "scene");
  const closedOrb = makeOrb(sClosed, L.closedOrb.size);
  const closedSuper = makeSuper(sClosed, [[["That's the day."]]], { width: WIDE ? 760 : 920, size: WIDE ? 120 : 112, align: WIDE ? "left" : "center" });
  const streakEl = el("div", "streak", sClosed, `<span class="dc n" style="font-size:${L.streakSize}px">12</span><span class="u" style="--us:${Math.round(L.streakSize * 0.26)}px">full days in a row</span>`);
  const streakN = streakEl.querySelector(".n");
  if (WIDE) streakEl.style.justifyItems = "start";
  else streakEl.style.width = "600px";
  const flash = el("div", "flash");
  function updateClosed(t) {
    const t0 = T.closed;
    const fl = Math.max(E.in3(prog(t, T.fillTap + 0.1, t0)) * (1 - prog(t, t0, t0 + 0.55)), 0);
    show(flash, fl > 0.002);
    if (fl > 0.002) {
      const wp = walkPlace(t);
      const [fx, fy] = onScreen(wp.cx, wp.cy, wp.s, wp.r, 390, 1467);
      flash.style.setProperty("--fx", `${((fx / W) * 100).toFixed(1)}%`);
      flash.style.setProperty("--fy", `${((Math.min(fy, H) / H) * 100).toFixed(1)}%`);
      put(flash, { o: fl * 0.8 });
    }
    const end = T.montage != null ? T.montage : T.end;
    const on = t > t0 - 0.1 && t < end + 0.5;
    show(sClosed, on);
    if (!on) return;
    const o = L.closedOrb;
    const inP = spring(t - t0 + 0.08, 1.3, 0.7);
    const out = E.in3(prog(t, end - 0.25, end + 0.25));
    closedOrb.root.style.transform = `translate(${(o.x - o.size / 2).toFixed(2)}px,${(o.y - o.size / 2).toFixed(2)}px) scale(${(lerp(0.72, 1, inP) * (1 + out * 0.25)).toFixed(4)})`;
    closedOrb.root.style.opacity = (clamp((t - t0 + 0.1) / 0.25) * (1 - out)).toFixed(3);
    const j = spring(t - (t0 + 0.12), 1.2, 0.62), f = spring(t - (t0 + 0.3), 1.2, 0.62);
    const fJ = t > t0 + 0.12 ? 0.45 * Math.exp(-(t - t0 - 0.12) * 2.2) : 0;
    const fF = t > t0 + 0.3 ? 0.45 * Math.exp(-(t - t0 - 0.3) * 2.2) : 0;
    closedOrb.update({
      time: t + 3, t, v: [1, 1, clamp(j), lerp(0.75, 1, clamp(f)), 1], closed: E.out3(prog(t, t0 + 0.5, t0 + 0.95)),
      pops: [null, null, t0 + 0.12, t0 + 0.3, null], tickAt: t0 + 0.55, flare: [fJ, fF, 0], yaw: (t - t0) * 0.4,
    });
    put(closedSuper.e, { x: WIDE ? L.textX : (W - 920) / 2, y: L.closedSuperY });
    closedSuper.update(t, t0 + 0.25, end - 0.3, 0.07);
    const sIn = E.out3(prog(t, t0 + 0.7, t0 + 1.1));
    streakN.textContent = t < t0 + 0.95 ? "12" : "13";
    const bump = t > t0 + 0.95 ? 1 + 0.14 * Math.exp(-(t - t0 - 0.95) * 6) * Math.cos((t - t0 - 0.95) * 18) : 1;
    const [stx, sty] = L.streakAt;
    put(streakEl, { x: WIDE ? stx : stx - 300, y: sty + (1 - sIn) * 40, o: sIn * (1 - prog(t, end - 0.35, end)) });
    streakN.style.display = "inline-block";
    streakN.style.transform = `scale(${bump.toFixed(3)})`;
    streakN.style.transformOrigin = WIDE ? "0 70%" : "50% 70%";
  }

  // ── Scene 5: the rest of the day, a bar each ──
  const beats = [];
  if (T.montage != null) {
    BEATS.forEach((b, i) => {
      const t0 = T.montage + i * BAR, t1 = t0 + BAR;
      const root = el("div", "scene");
      const bg = el("div", "", root);
      const bt = { b, t0, t1, root, bg };
      if (b.key === "journal") {
        bg.innerHTML = ART.nightRoom(W, H);
        bt.phone = makePhone(root, { j: { tall: "journal" } }, { skin: "deep", sleeve: "#3B3357" });
        bt.card = el("div", "sealcard", root, `<div class="top"><span class="lbl">A month ago</span><span class="lk">${ICON("unlock")}</span></div><div class="txt">Grateful for an easy day.</div>`);
        bt.card.style.setProperty("--w", (WIDE ? 560 : 600) + "px");
        bt.card.style.setProperty("--fs", (WIDE ? 32 : 34) + "px");
        cue(t0 + 1.2, "seal");
      } else if (b.key === "food") {
        bg.innerHTML = ART.table(W, H);
        bt.phone = makePhone(root, { food: "food.night.png", say: "moment-food.night.png" }, { skin: "tan", sleeve: "#3D4A3F" });
        bt.tap = makeTap(bt.phone.ovl, 662, 802);
        bt.clock = makeClock(bt.phone.on("say"), [640, 52, 110, 54], "#0B0A09", 32);
        bt.speech = el("div", "chip food", root, `<i></i><span class="sp"></span>`);
        bt.speech.style.setProperty("--cs", (WIDE ? 32 : 34) + "px");
        cue(t0 + 0.5, "tap");
      } else if (b.key === "moves") {
        bg.innerHTML = ART.floor(W, H);
        bt.fig = el("div", "", root);
        bt.phone = makePhone(root, { act: { tall: "activity" } }, { skin: "light", sleeve: "#2F2F33" });
        bt.chips = ["pushup", "run", "walker", "yoga", "swim", "barbell"].map((ic) => { const c = el("div", "movechip", root, ICON(ic)); c.style.setProperty("--mc", (WIDE ? 70 : 76) + "px"); return c; });
        cue(t0 + 1.15, "whoosh", { len: 0.5, soft: true });
      } else if (b.key === "insights") {
        bg.innerHTML = ART.morning(W, H);
        bt.steam = el("div", "", root, `<svg width="120" height="200" viewBox="0 0 120 200"><g fill="none" stroke="#F5F2EB" stroke-width="5" stroke-linecap="round" opacity="0.32"><path/><path transform="translate(28 12)"/></g></svg>`);
        bt.mug = el("div", "", root, `<svg width="150" height="140" viewBox="0 0 150 140"><path d="M10 20 h100 v70 a40 40 0 0 1 -40 40 h-20 a40 40 0 0 1 -40 -40 z" fill="#E9E1D2"/><path d="M110 40 h12 a18 18 0 0 1 0 36 h-12" fill="none" stroke="#E9E1D2" stroke-width="10"/><ellipse cx="60" cy="22" rx="50" ry="8" fill="#5A3A26"/></svg>`);
        bt.phone = makePhone(root, { ins: "insights.night.png", tried: "insights-try-sleep.night.png" }, { skin: "olive", sleeve: "#5A2F36" });
        bt.tap = makeTap(bt.phone.ovl, 195, 1161);
        cue(t0 + 1.0, "tap");
      } else if (b.key === "privacy") {
        bg.innerHTML = ART.vault(W, H);
        bt.phone = makePhone(root, { p: { tall: "settings-privacy" } }, { skin: "brown", sleeve: "#2E3A55" });
        cue(t0 + 0.6, "whoosh", { len: 0.9, soft: true });
      }
      bt.sup = makeSuper(root, b.lines, { width: WIDE ? 800 : 940, size: WIDE ? 98 : 92, kick: b.kick, hue: b.hue, allhue: b.allhue, gap: 0.04, delays: b.delays });
      cue(t0, "whip");
      beats.push(bt);
    });
  }
  const hb = document.getElementById("hblur");
  function updateBeats(t) {
    if (!beats.length) return;
    const bp = L.beatPhone;
    let blur = 0;
    beats.forEach((bt, i) => {
      const { t0, t1, root } = bt;
      const on = PLATE ? t >= t0 && t < t1 : t > t0 - 0.3 && t < t1 + 0.3;
      show(root, on);
      if (!on) return;
      // A whip pan in from the right on the bar, and out to the left on the next.
      const pin = E.io3(prog(t, t0 - 0.22, t0 + 0.14));
      const last = i === beats.length - 1;
      const pout = last ? 0 : E.io3(prog(t, t1 - 0.22, t1 + 0.14));
      root.style.transform = PLATE ? "" : `translateX(${((1 - pin) * W * 0.9 - pout * W * 0.9).toFixed(1)}px)`;
      const mv = Math.sin(Math.PI * prog(t, t0 - 0.22, t0 + 0.14)) + (last ? 0 : Math.sin(Math.PI * prog(t, t1 - 0.22, t1 + 0.14)));
      blur = Math.max(blur, mv);
      root.style.filter = mv > 0.02 && !PLATE ? "url(#hblurf)" : "";
      if (last && !PLATE) root.style.opacity = (1 - prog(t, t1 - 0.25, t1 + 0.1)).toFixed(3);
      const lt = t - t0;
      put(bt.sup.e, { x: WIDE ? L.textX : L.textX, y: L.beatSuperY });
      bt.sup.update(t, t0 + 0.12, t1 - 0.25, 0.06);
      // The phone drifts up a little through the bar.
      const drift = E.out3(prog(t, t0 - 0.2, t1));
      let px = bp.x, py = bp.y + lerp(70, 0, drift), ps = bp.s * lerp(0.97, 1.01, drift);
      const pr = lerp(-4, -1.5, drift) + Math.sin(t * 1.3) * 0.4;
      const ph = bt.phone;
      const key = bt.b.key;
      if (key === "journal") {
        ph.screens({ j: 1 });
        ph.scroll("j", E.io3(prog(lt, 0.1, 2.2)) * 220);
        const c = bt.card;
        const cIn = E.out3(prog(lt, 0.2, 0.6));
        put(c, { x: L.textX, y: L.accentY + lerp(36, 0, cIn), o: cIn });
        const txt = c.querySelector(".txt");
        const plain = "Grateful for an easy day.", sealed = "AZx3k9Qm+eT1vW0bL7rN2pHs5uYcF8gJdK4o";
        const sp = prog(lt, 0.7, 1.2);
        if (sp <= 0) { txt.textContent = plain; txt.className = "txt"; }
        else {
          const n = Math.floor(sp * sealed.length), R = ART.rng(Math.floor(t * 30));
          const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
          let s = sealed.slice(0, n);
          for (let q = n; q < sealed.length; q++) s += B64[Math.floor(R() * 64)];
          txt.textContent = s;
          txt.className = "txt cipher";
        }
        const sealedNow = lt >= 1.2;
        c.querySelector(".lbl").textContent = sealedNow ? "Sealed on this phone" : "A month ago";
        c.querySelector(".lk").innerHTML = ICON(sealedNow ? "lock" : "unlock");
        const ls = sealedNow ? 1 + 0.35 * Math.exp(-(lt - 1.2) * 7) * Math.cos((lt - 1.2) * 20) : 1;
        c.querySelector(".lk svg").style.transform = `scale(${ls.toFixed(3)})`;
      } else if (key === "food") {
        bt.tap(t, t0 + 0.5);
        change(ph, "food", "say", E.out3(prog(lt, 0.6, 0.9)), "rise");
        bt.clock.set(Math.max(0, lt - 0.75));
        const line = "Salmon with rice and broccoli for dinner";
        const tp = prog(lt, 0.95, 1.85);
        bt.speech.querySelector(".sp").textContent = line.slice(0, Math.round(tp * line.length));
        const sIn = E.out3(prog(lt, 0.85, 1.1));
        put(bt.speech, { x: L.textX, y: L.accentY + lerp(24, 0, sIn), o: sIn });
      } else if (key === "moves") {
        // First the push-ups, then the camera tilts down to the round on the phone, which scrolls to it.
        const tilt = E.io3(prog(lt, 1.05, 1.6));
        const shift = tilt * (WIDE ? 0 : 430);
        bt.bg.style.transform = `translateY(${(-shift).toFixed(1)}px)`;
        const rep = 0.5 - 0.5 * Math.cos((2 * Math.PI * Math.max(0, lt - 0.05)) / 1.0);
        bt.fig.innerHTML = ART.pushup(rep, { skin: "#A86E45", top: "#F39A57", shorts: "#2A2E3A", shoe: "#F5F2EB", hair: "#1B1A17" });
        const fy = WIDE ? 0.88 * H : 0.46 * H, fs = WIDE ? 1.0 : 1.22;
        bt.fig.style.transformOrigin = "0 0";
        put(bt.fig, { x: WIDE ? L.textX + 40 : 150, y: fy - 240 * fs - shift, s: fs, o: 1 - E.out3(prog(lt, 1.05, 1.35)) });
        bt.chips.forEach((c, q) => {
          const s = lt - 0.4 - q * 0.07;
          put(c, { x: L.textX + q * (WIDE ? 88 : 94), y: (WIDE ? 560 : 470) - shift * 0.4, s: Math.max(0, spring(s, 1.8, 0.55)), o: clamp(s / 0.15) * (1 - tilt) });
        });
        py = lerp(WIDE ? bp.y : bp.y + 260, WIDE ? bp.y - 20 : bp.y - 150, tilt) + lerp(40, 0, drift);
        ph.screens({ act: 1 });
        ph.scroll("act", E.io3(prog(lt, 1.15, 1.75)) * 1448);
      } else if (key === "insights") {
        const mx = WIDE ? 1010 : 860, my = WIDE ? 838 : 0.53 * H + 16 - 128;
        put(bt.mug, { x: mx, y: my });
        put(bt.steam, { x: mx + 12, y: my - 190 });
        bt.steam.querySelectorAll("path").forEach((p, q) => {
          let d = "";
          for (let n = 0; n <= 10; n++) d += (n ? " L" : "M") + (50 + Math.sin(n * 0.8 + t * 3 + q * 2.2) * 10 * (n / 10)).toFixed(1) + " " + (190 - n * 17);
          p.setAttribute("d", d);
        });
        bt.tap(t, t0 + 1.0);
        change(ph, "ins", "tried", prog(lt, 1.08, 1.5), "swap");
      } else if (key === "privacy") {
        ph.screens({ p: 1 });
        ph.scroll("p", 500 + E.io3(prog(lt, 0.45, 1.9)) * 1500);
      }
      ph.place(px, py, ps, pr, lerp(-10, 10, drift));
    });
    if (hb) hb.setAttribute("stdDeviation", `${(blur * 26).toFixed(1)} 0`);
  }

  // ── Scene 6: Dayhub, and the way in ──
  const sEnd = el("div", "scene");
  const endOrb = makeOrb(sEnd, L.end.orb.size);
  const brand = el("div", "brand", sEnd, `<span class="mark"><i></i><i></i><i></i></span><span>Dayhub</span>`);
  brand.style.setProperty("--bs", L.end.brandSize + "px");
  const tag = makeSuper(sEnd, [[["Say your day"], ["in a minute.", "all"]]], { width: WIDE ? 820 : 960, size: L.end.tagSize, align: WIDE ? "left" : "center" });
  const ctaWrap = el("div", "", sEnd, `<div class="eb" style="font-size:24px;margin-bottom:18px;${WIDE ? "" : "text-align:center"}">Private beta</div><span class="cta">Request an invite</span>`);
  const fineEnd = el("div", "fine", sEnd, "Real app screens, showing a made-up member. Say your day and transcription are off until you turn them on; then a recording goes to Groq to be written down, and Say your day's words go to Claude, Anthropic's AI. Food estimates come from Claude too.");
  fineEnd.style.setProperty("--w", (WIDE ? 760 : 900) + "px");
  fineEnd.style.setProperty("--fs", (WIDE ? 21 : 22) + "px");
  if (!WIDE) fineEnd.style.textAlign = "center";
  cue(T.end, "end");
  function updateEnd(t) {
    const t0 = T.end;
    const on = t > t0 - 0.4;
    show(sEnd, on);
    if (!on) return;
    const lt = t - t0;
    const fadeOut = 1 - prog(t, T.dur - 0.45, T.dur - 0.02);
    // A slow push in, so the end card breathes while it is read.
    sEnd.style.transform = `scale(${(1 + 0.035 * E.io3(prog(t, t0, T.dur))).toFixed(4)})`;
    const o = L.end.orb;
    endOrb.root.style.transform = `translate(${(o.x - o.size / 2).toFixed(2)}px,${(o.y - o.size / 2).toFixed(2)}px) scale(${lerp(0.8, 1, spring(lt + 0.1, 1.1, 0.75)).toFixed(4)})`;
    endOrb.root.style.opacity = (clamp((lt + 0.4) / 0.5) * fadeOut).toFixed(3);
    endOrb.update({ time: t + 3, t, v: [1, 1, 1, 1, 1], closed: 1, tickAt: -9, rays: 0.6, yaw: lt * 0.3, core: 0 });
    const bIn = E.out3(prog(lt, 0.2, 0.8));
    put(brand, { x: WIDE ? L.end.brandX : W / 2 - brand.offsetWidth / 2, y: L.end.brandY + (1 - bIn) * 40, o: bIn * fadeOut, blur: (1 - bIn) * 8 });
    put(tag.e, { x: WIDE ? L.end.brandX : (W - 960) / 2, y: L.end.tagY });
    tag.update(t, t0 + 0.55, T.dur + 1, 0.06);
    tag.e.style.opacity = fadeOut.toFixed(3);
    const cIn = E.out3(prog(lt, 1.1, 1.6));
    put(ctaWrap, { x: WIDE ? L.end.brandX : W / 2 - ctaWrap.offsetWidth / 2, y: L.end.ctaY + (1 - cIn) * 30, o: cIn * fadeOut });
    put(fineEnd, { x: WIDE ? L.end.brandX : (W - 900) / 2, y: L.end.fineY, o: E.out3(prog(lt, 1.5, 2.0)) * fadeOut });
  }

  // ── Over everything: grain against banding, and a vignette ──
  const grain = el("div", "grain");
  el("div", "vignette");
  (function makeGrain() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const img = g.createImageData(256, 256);
    const R = ART.rng(99);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.floor(R() * 255); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    grain.style.backgroundImage = `url(${c.toDataURL()})`;
  })();

  function seek(t) {
    t = clamp(t, 0, T.dur);
    updateOpening(t);
    updateClosed(t);
    updateBeats(t);
    updateEnd(t);
    const R = ART.rng(Math.floor(t * 30) + 7);
    grain.style.backgroundPosition = `${Math.floor(R() * 256)}px ${Math.floor(R() * 256)}px`;
  }

  async function ready() {
    await document.fonts.ready;
    await Promise.all(["650 40px 'Bricolage Grotesque'", "700 40px 'Bricolage Grotesque'", "400 20px Figtree", "600 20px Figtree", "400 20px 'JetBrains Mono'"].map((f) => document.fonts.load(f)));
    await Promise.all([...document.images].map((i) => (i.complete && i.naturalWidth ? Promise.resolve() : new Promise((res, rej) => { i.onload = res; i.onerror = () => rej(new Error("missing " + i.src)); }))));
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    return { renderer: heroOrb.gl.renderer(), images: document.images.length };
  }

  window.AD = { seek, ready, cues: () => cues.slice().sort((a, b) => a.t - b.t), info: { cut: CUT, wide: WIDE, W, H, dur: T.dur, fps: 30, T, bar: BAR } };
  const at = Q.get("t");
  ready().then(() => seek(at != null ? Number(at) : 0));
})();
