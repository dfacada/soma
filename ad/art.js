// The ad's drawings: hands holding the phone, and the everyday places the day is lived in. Stylised on purpose: these
// are drawings, never photos, and nobody in them is a real person. Every function returns SVG markup; ad.js places it
// and moves it frame by frame. Seeded, so every render draws the same street.
(function () {
  "use strict";

  /** A small seeded random (mulberry32), so each render of a scene is identical. */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Skin tones: a base, its shade, and the nail. Sleeves to go with them.
  const SKINS = {
    deep: { base: "#7A4A2E", shade: "#5C3520", light: "#9A6444", nail: "#A87458" },
    brown: { base: "#A86E45", shade: "#865231", light: "#C48659", nail: "#C99475" },
    tan: { base: "#D29B6E", shade: "#B27C52", light: "#E5B48A", nail: "#E8BFA0" },
    light: { base: "#EDC3A0", shade: "#D3A27D", light: "#F7D6B9", nail: "#F6D9C6" },
    olive: { base: "#C08A5B", shade: "#9E6C40", light: "#D6A273", nail: "#D9AE8C" },
  };

  let uid = 0;
  const id = (p) => `${p}${++uid}`;

  /**
   * A hand holding the phone, drawn in the phone's own units (its body is 400 × 833, origin top left). The hand is a
   * right hand: fingertips round the left edge, the thumb along the right. `layer` is "back" (palm, wrist, sleeve:
   * behind the phone) or "front" (fingertips and thumb: in front of it). Returns an <svg> placed at -300, -120.
   */
  function hand(layer, skin, sleeve, opts = {}) {
    const s = SKINS[skin] || SKINS.tan;
    const g = id("hg");
    const rim = opts.rim || "#8F8AF7";
    const X0 = -300, Y0 = -120, WV = 1000, HV = 1900;
    let body = "";
    const defs = `<defs>
      <linearGradient id="${g}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.base}"/><stop offset="1" stop-color="${s.shade}"/></linearGradient>
      <linearGradient id="${g}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.light}"/><stop offset="0.55" stop-color="${s.base}"/><stop offset="1" stop-color="${s.shade}"/></linearGradient>
      <linearGradient id="${g}t" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${s.shade}"/><stop offset="0.6" stop-color="${s.base}"/><stop offset="1" stop-color="${s.light}"/></linearGradient>
      <linearGradient id="${g}s" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${sleeve}"/><stop offset="1" stop-color="${shade(sleeve, -0.35)}"/></linearGradient>
      <radialGradient id="${g}r" cx="0.2" cy="0.35" r="0.7"><stop offset="0" stop-color="${rim}" stop-opacity="0.28"/><stop offset="1" stop-color="${rim}" stop-opacity="0"/></radialGradient>
    </defs>`;
    if (layer === "back") {
      // The sleeve and wrist leave down and to the right; the palm shows only past the phone's edges: the heel below
      // it, the thumb's root on the right, the little-finger side on the left; and the fingers' sides behind the tips.
      body = `
        <path d="M150 1068 C 240 1046 372 1040 470 1056 L 640 ${HV + Y0} L 190 ${HV + Y0} Z" fill="url(#${g}s)"/>
        <path d="M150 1068 C 240 1046 372 1040 470 1056 L 478 1116 C 380 1100 240 1106 158 1128 Z" fill="${shade(sleeve, 0.14)}"/>
        <path d="M86 900 C 116 990 146 1046 168 1100 L 470 1072 C 462 1000 466 940 482 872 Z" fill="url(#${g}a)"/>
        <path d="M-28 620 C -62 690 -62 800 -22 868 C 22 930 116 968 222 970 C 330 972 424 936 474 876 C 512 826 504 720 462 640 L 300 600 L 100 600 Z" fill="url(#${g}a)"/>
        <path d="M-22 868 C 22 930 116 968 222 970 C 330 972 424 936 474 876" fill="none" stroke="${s.shade}" stroke-width="12" opacity="0.4"/>
        <rect x="-46" y="394" width="58" height="300" rx="22" fill="${shade(s.shade, -0.2)}"/>`;
    } else {
      // Fingertips round the left edge (index on top, the little finger tucked under the corner), each a rounded
      // pad lit on the side that faces the screen, with its nail.
      const fingers = [
        { cy: 432, b: 40, x0: -40, x1: 26, tilt: -3 },
        { cy: 514, b: 41, x0: -44, x1: 30, tilt: -1 },
        { cy: 594, b: 39, x0: -40, x1: 24, tilt: 2 },
        { cy: 666, b: 32, x0: -34, x1: 10, tilt: 5 },
      ];
      body = fingers.map((f, i) => {
        const gid = `${g}p${i}`, rl = 15, top = f.cy - f.b, bot = f.cy + f.b;
        // A pad: square-ish where it goes round the phone's side, fully round at the tip.
        const pad = `M${f.x0 + rl} ${top} L${f.x1 - f.b} ${top} A ${f.b} ${f.b} 0 0 1 ${f.x1 - f.b} ${bot} L${f.x0 + rl} ${bot} Q ${f.x0} ${bot} ${f.x0} ${bot - rl} L${f.x0} ${top + rl} Q ${f.x0} ${top} ${f.x0 + rl} ${top} Z`;
        return `<g transform="rotate(${f.tilt} ${f.x0} ${f.cy})">
          <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0.25"><stop offset="0" stop-color="${s.shade}"/><stop offset="0.4" stop-color="${s.base}"/><stop offset="1" stop-color="${shade(s.base, 0.08)}"/></linearGradient></defs>
          <path d="${pad}" fill="#000" opacity="0.22" transform="translate(5 6)"/>
          <path d="${pad}" fill="url(#${gid})"/>
          <path d="M${f.x0 + 6} ${bot - 5} L${f.x1 - f.b} ${bot - 5}" stroke="${s.shade}" stroke-width="5" opacity="0.45" stroke-linecap="round"/>
          <rect x="${f.x1 - 31}" y="${f.cy - f.b * 0.52}" width="25" height="${f.b * 1.04}" rx="11" fill="${s.nail}" opacity="0.55"/>
        </g>`;
      }).join("") + `
        <defs><linearGradient id="${g}th" x1="1" y1="0" x2="0" y2="0.2"><stop offset="0" stop-color="${s.shade}"/><stop offset="0.55" stop-color="${s.base}"/><stop offset="1" stop-color="${s.light}"/></linearGradient></defs>
        <path d="M472 868 C 486 784 474 704 444 644 C 424 604 404 574 384 564 C 360 554 342 572 348 598 C 356 626 370 656 378 694 C 386 744 384 806 370 868 Z" fill="#000" opacity="0.25" transform="translate(-6 8)"/>
        <path d="M472 868 C 486 784 474 704 444 644 C 424 604 404 574 384 564 C 360 554 342 572 348 598 C 356 626 370 656 378 694 C 386 744 384 806 370 868 Z" fill="url(#${g}th)"/>
        <path d="M444 644 C 424 604 404 574 384 564" fill="none" stroke="${s.shade}" stroke-width="4" opacity="0.35"/>
        <ellipse cx="368" cy="588" rx="15" ry="21" transform="rotate(-24 368 588)" fill="${s.nail}" opacity="0.85"/>
        <path d="M404 720 q 12 26 10 52" fill="none" stroke="${s.shade}" stroke-width="3.5" opacity="0.4"/>`;
    }
    return `<svg class="hand ${layer}" viewBox="${X0} ${Y0} ${WV} ${HV}" width="${WV}" height="${HV}" style="left:${X0}px;top:${Y0}px" aria-hidden="true">${defs}${body}</svg>`;
  }

  /** Lighter (k > 0) or darker (k < 0) version of a hex colour. */
  function shade(hex, k) {
    const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const m = n.map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
    return "#" + m.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
  }

  // ── Places ──

  /** An evening street, in parallax layers. Each layer is a separate <svg> `span` wide that ad.js slides. */
  function street(W, H) {
    const R = rng(11);
    const horizon = H * (W > H ? 0.6 : 0.66);
    const sky = `<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <defs>
        <linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#07060E"/><stop offset="0.34" stop-color="#15122B"/><stop offset="0.52" stop-color="#2C1F3F"/>
          <stop offset="0.6" stop-color="#5A3140"/><stop offset="0.66" stop-color="#93533F"/><stop offset="0.7" stop-color="#2A1B20"/><stop offset="1" stop-color="#0B0A09"/>
        </linearGradient>
        <radialGradient id="sung" cx="0.62" cy="${(horizon - 10) / H}" r="0.5"><stop offset="0" stop-color="#F39A57" stop-opacity="0.42"/><stop offset="1" stop-color="#F39A57" stop-opacity="0"/></radialGradient>
        <radialGradient id="moonglow"><stop offset="0" stop-color="#F1EBDD" stop-opacity="0.16"/><stop offset="1" stop-color="#F1EBDD" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#skyg)"/>
      <rect width="${W}" height="${H}" fill="url(#sung)"/>
      ${Array.from({ length: 46 }, () => `<circle cx="${(R() * W).toFixed(0)}" cy="${(R() * horizon * 0.62).toFixed(0)}" r="${(0.8 + R() * 1.6).toFixed(1)}" fill="#F5F2EB" opacity="${(0.2 + R() * 0.5).toFixed(2)}"/>`).join("")}
      <circle cx="${W * (W > H ? 0.47 : 0.84)}" cy="${horizon * (W > H ? 0.16 : 0.1)}" r="${Math.min(W, H) * 0.024}" fill="#F1EBDD" opacity="0.92"/>
      <circle cx="${W * (W > H ? 0.47 : 0.84)}" cy="${horizon * (W > H ? 0.16 : 0.1)}" r="${Math.min(W, H) * 0.12}" fill="url(#moonglow)"/>
    </svg>`;

    const span = W * 3;
    // Far: the skyline, hazy, windows lit here and there.
    let far = "";
    for (let x = -40; x < span; ) {
      const w = 90 + R() * 170, h = H * (0.08 + R() * 0.2), y = horizon - h + 30;
      far += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${(h + 40).toFixed(0)}" fill="#1A142A"/>`;
      if (R() > 0.55) far += `<rect x="${(x + w * 0.4).toFixed(0)}" y="${(y - 26).toFixed(0)}" width="6" height="26" fill="#1A142A"/>`;
      for (let wy = y + 18; wy < horizon - 4; wy += 26) for (let wx = x + 12; wx < x + w - 14; wx += 22) {
        if (R() > 0.78) far += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="9" height="12" rx="1.5" fill="#F7C47A" opacity="${(0.25 + R() * 0.5).toFixed(2)}"/>`;
      }
      x += w + R() * 18;
    }
    const farSvg = `<svg class="layer" viewBox="0 0 ${span} ${H}" width="${span}" height="${H}">
      <defs><linearGradient id="hazeg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2C1F3F" stop-opacity="0"/><stop offset="1" stop-color="#3A2440" stop-opacity="0.55"/></linearGradient></defs>
      ${far}<rect x="0" y="${horizon - H * 0.3}" width="${span}" height="${H * 0.3 + 30}" fill="url(#hazeg)"/></svg>`;

    // Mid: trees, lamps with their glow and pools of light, a low wall.
    let mid = "";
    const ground = horizon + H * 0.035;
    const lampEvery = W * 0.62;
    for (let x = W * 0.15; x < span; x += lampEvery) {
      const lh = H * (W > H ? 0.3 : 0.24);
      mid += `<g>
        <circle cx="${x}" cy="${ground - lh}" r="${W * 0.16}" fill="url(#lampg)"/>
        <ellipse cx="${x}" cy="${ground + 14}" rx="${W * 0.12}" ry="${H * 0.018}" fill="#FFD9A0" opacity="0.12"/>
        <rect x="${x - 4}" y="${ground - lh}" width="8" height="${lh}" fill="#141218"/>
        <path d="M${x - 4} ${ground - lh + 6} q 0 -26 30 -26 h 14" fill="none" stroke="#141218" stroke-width="7"/>
        <rect x="${x + 30}" y="${ground - lh - 26}" width="34" height="12" rx="5" fill="#2A2622"/>
        <ellipse cx="${x + 47}" cy="${ground - lh - 12}" rx="15" ry="5" fill="#FFE3B5"/>
      </g>`;
    }
    for (let x = W * 0.45; x < span; x += W * (0.42 + R() * 0.3)) {
      const r = W * (0.07 + R() * 0.05), cy = ground - H * (0.08 + R() * 0.05);
      mid += `<g fill="#0E1513"><rect x="${x - 6}" y="${cy}" width="12" height="${ground - cy}"/>
        <circle cx="${x}" cy="${cy - r * 0.4}" r="${r}"/><circle cx="${x - r * 0.7}" cy="${cy + r * 0.1}" r="${r * 0.72}"/><circle cx="${x + r * 0.7}" cy="${cy + r * 0.05}" r="${r * 0.78}"/></g>`;
    }
    const midSvg = `<svg class="layer" viewBox="0 0 ${span} ${H}" width="${span}" height="${H}">
      <defs><radialGradient id="lampg"><stop offset="0" stop-color="#FFD9A0" stop-opacity="0.34"/><stop offset="0.35" stop-color="#FFC27A" stop-opacity="0.1"/><stop offset="1" stop-color="#FFC27A" stop-opacity="0"/></radialGradient>
      <linearGradient id="groundg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17120F"/><stop offset="1" stop-color="#0A0908"/></linearGradient></defs>
      <rect x="0" y="${ground}" width="${span}" height="${H - ground}" fill="url(#groundg)"/>
      ${mid}
      <rect x="0" y="${ground - 6}" width="${span}" height="10" fill="#1B1613"/></svg>`;

    // Near: a hedge and railing, darker, quicker.
    let near = "";
    const nearY = H * 0.86;
    for (let x = -60; x < span; x += 70 + R() * 60) {
      const r = 60 + R() * 70;
      near += `<circle cx="${x.toFixed(0)}" cy="${(nearY + R() * 30).toFixed(0)}" r="${r.toFixed(0)}" fill="#090C0B"/>`;
    }
    for (let x = 0; x < span; x += 120) near += `<rect x="${x}" y="${nearY - 120}" width="7" height="140" fill="#0D0C0D"/>`;
    const nearSvg = `<svg class="layer" viewBox="0 0 ${span} ${H}" width="${span}" height="${H}">
      <rect x="0" y="${nearY - 122}" width="${span}" height="6" fill="#0D0C0D"/>${near}<rect x="0" y="${nearY + 40}" width="${span}" height="${H}" fill="#090C0B"/></svg>`;
    return { sky, far: farSvg, mid: midSvg, near: nearSvg, span, lampEvery };
  }

  /** A table seen from above: a plate of salmon, rice and broccoli, a glass of red wine, cutlery, a napkin. */
  function table(W, H) {
    const R = rng(23);
    const cx = W * (W > H ? 0.64 : 0.5), cy = H * (W > H ? 0.52 : 0.44), pr = Math.min(W, H) * 0.3;
    let grain = "";
    for (let i = 0; i < 60; i++) {
      const y = R() * H;
      grain += `<path d="M0 ${y.toFixed(0)} C ${W * 0.3} ${(y + (R() - 0.5) * 40).toFixed(0)} ${W * 0.7} ${(y + (R() - 0.5) * 40).toFixed(0)} ${W} ${(y + (R() - 0.5) * 30).toFixed(0)}" stroke="#1C140F" stroke-width="${(1 + R() * 3).toFixed(1)}" fill="none" opacity="${(0.3 + R() * 0.4).toFixed(2)}"/>`;
    }
    let rice = "";
    for (let i = 0; i < 70; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * pr * 0.34;
      const x = cx - pr * 0.28 + Math.cos(a) * d, y = cy + pr * 0.22 + Math.sin(a) * d * 0.8;
      rice += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(pr * 0.028).toFixed(1)}" ry="${(pr * 0.012).toFixed(1)}" transform="rotate(${(R() * 180).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${R() > 0.3 ? "#F4F0E6" : "#E3DDCF"}"/>`;
    }
    let broc = "";
    const florets = [[0.3, 0.12], [0.42, -0.02], [0.2, 0.3], [0.38, 0.28]];
    for (const [fx, fy] of florets) {
      const x = cx + pr * fx, y = cy + pr * fy, r = pr * 0.11;
      broc += `<path d="M${x} ${y} l ${-r * 0.2} ${r * 1.1} h ${r * 0.4} z" fill="#9BC77A"/>`;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        broc += `<circle cx="${(x + Math.cos(a) * r * 0.55).toFixed(1)}" cy="${(y - r * 0.2 + Math.sin(a) * r * 0.5).toFixed(1)}" r="${(r * 0.5).toFixed(1)}" fill="${k % 2 ? "#3E8A4A" : "#4FA35A"}"/>`;
      }
      broc += `<circle cx="${x}" cy="${y - r * 0.2}" r="${r * 0.45}" fill="#5BB565"/>`;
    }
    const salmon = `<g transform="rotate(-18 ${cx - pr * 0.1} ${cy - pr * 0.2})">
      <rect x="${cx - pr * 0.5}" y="${cy - pr * 0.42}" width="${pr * 0.78}" height="${pr * 0.4}" rx="${pr * 0.12}" fill="#E8795A"/>
      <rect x="${cx - pr * 0.5}" y="${cy - pr * 0.42}" width="${pr * 0.78}" height="${pr * 0.12}" rx="${pr * 0.06}" fill="#C95F43" opacity="0.6"/>
      ${[0.12, 0.3, 0.48, 0.66].map((k) => `<path d="M${cx - pr * 0.5 + pr * 0.78 * k} ${cy - pr * 0.4} q ${pr * 0.06} ${pr * 0.18} 0 ${pr * 0.36}" stroke="#F6B79F" stroke-width="${pr * 0.018}" fill="none" opacity="0.8"/>`).join("")}
      <path d="M${cx - pr * 0.46} ${cy - pr * 0.08} h ${pr * 0.7}" stroke="#9E4A33" stroke-width="${pr * 0.03}" opacity="0.5"/>
    </g>
    <path d="M${cx + pr * 0.05} ${cy - pr * 0.5} a ${pr * 0.13} ${pr * 0.13} 0 0 1 ${pr * 0.26} 0 z" fill="#F2DC6B" opacity="0.95"/>`;
    const gx = cx + pr * (W > H ? 1.45 : 0.86), gy = cy - pr * (W > H ? 0.35 : 0.98), gr = pr * 0.3;
    return `<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <defs>
        <radialGradient id="tblg" cx="0.5" cy="0.42" r="0.75"><stop offset="0" stop-color="#3A291E"/><stop offset="1" stop-color="#140E0A"/></radialGradient>
        <radialGradient id="plateg" cx="0.42" cy="0.38" r="0.7"><stop offset="0" stop-color="#F7F3EA"/><stop offset="1" stop-color="#D9D2C3"/></radialGradient>
        <radialGradient id="wineg" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#8E2A3E"/><stop offset="1" stop-color="#3E0E19"/></radialGradient>
        <radialGradient id="warmg" cx="0.5" cy="0.3" r="0.7"><stop offset="0" stop-color="#F39A57" stop-opacity="0.16"/><stop offset="1" stop-color="#F39A57" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#tblg)"/>${grain}
      <rect x="${cx - pr * 1.9}" y="${cy - pr * 0.6}" width="${pr * 0.62}" height="${pr * 1.5}" rx="${pr * 0.06}" fill="#3E5A50" opacity="0.85" transform="rotate(-6 ${cx - pr * 1.6} ${cy})"/>
      <g opacity="0.9"><rect x="${cx - pr * 1.38}" y="${cy - pr * 0.75}" width="${pr * 0.06}" height="${pr * 1.5}" rx="${pr * 0.03}" fill="#B8B2A6"/>
        <rect x="${cx + pr * 1.22}" y="${cy - pr * 0.4}" width="${pr * 0.07}" height="${pr * 1.4}" rx="${pr * 0.035}" fill="#B8B2A6"/></g>
      <circle cx="${cx + pr * 0.04}" cy="${cy + pr * 0.06}" r="${pr * 1.02}" fill="#000" opacity="0.35"/>
      <circle cx="${cx}" cy="${cy}" r="${pr}" fill="url(#plateg)"/>
      <circle cx="${cx}" cy="${cy}" r="${pr * 0.76}" fill="none" stroke="#CFC7B6" stroke-width="${pr * 0.02}" opacity="0.7"/>
      ${rice}${salmon}${broc}
      <circle cx="${gx + gr * 0.12}" cy="${gy + gr * 0.12}" r="${gr * 1.05}" fill="#000" opacity="0.3"/>
      <circle cx="${gx}" cy="${gy}" r="${gr}" fill="#F5F2EB" opacity="0.12"/>
      <circle cx="${gx}" cy="${gy}" r="${gr * 0.78}" fill="url(#wineg)"/>
      <path d="M${gx - gr * 0.5} ${gy - gr * 0.55} a ${gr * 0.8} ${gr * 0.8} 0 0 1 ${gr * 0.7} ${-gr * 0.2}" stroke="#F5F2EB" stroke-width="${gr * 0.07}" fill="none" opacity="0.4" stroke-linecap="round"/>
      <circle cx="${gx}" cy="${gy}" r="${gr}" fill="none" stroke="#F5F2EB" stroke-width="2" opacity="0.25"/>
      <rect width="${W}" height="${H}" fill="url(#warmg)"/>
    </svg>`;
  }

  /** A room at night: a window with the moon, a lamp's warm light, a blanket. */
  function nightRoom(W, H) {
    const R = rng(5);
    const wide = W > H;
    const wx = wide ? W * 0.56 : W * 0.56, wy = wide ? H * 0.1 : H * 0.28, ww = wide ? W * 0.22 : W * 0.38, wh = wide ? H * 0.5 : H * 0.24;
    let stars = "";
    for (let i = 0; i < 26; i++) stars += `<circle cx="${(wx + R() * ww).toFixed(0)}" cy="${(wy + R() * wh * 0.7).toFixed(0)}" r="${(0.8 + R() * 1.4).toFixed(1)}" fill="#F5F2EB" opacity="${(0.25 + R() * 0.5).toFixed(2)}"/>`;
    return `<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <defs>
        <linearGradient id="wallg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121022"/><stop offset="1" stop-color="#0B0A12"/></linearGradient>
        <linearGradient id="nightg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0D1230"/><stop offset="1" stop-color="#2A2B5A"/></linearGradient>
        <radialGradient id="lampw" cx="${wide ? 0.86 : 0.92}" cy="${wide ? 0.55 : 0.5}" r="${wide ? 0.5 : 0.62}"><stop offset="0" stop-color="#F5B26B" stop-opacity="0.32"/><stop offset="0.5" stop-color="#F5B26B" stop-opacity="0.08"/><stop offset="1" stop-color="#F5B26B" stop-opacity="0"/></radialGradient>
        <radialGradient id="moong"><stop offset="0" stop-color="#F1EBDD" stop-opacity="0.35"/><stop offset="1" stop-color="#F1EBDD" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#wallg)"/>
      <rect x="${wx - 14}" y="${wy - 14}" width="${ww + 28}" height="${wh + 28}" rx="22" fill="#1C1830"/>
      <rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="12" fill="url(#nightg)"/>${stars}
      <circle cx="${wx + ww * 0.7}" cy="${wy + wh * 0.3}" r="${ww * 0.28}" fill="url(#moong)"/>
      <circle cx="${wx + ww * 0.7}" cy="${wy + wh * 0.3}" r="${ww * 0.085}" fill="#F1EBDD"/>
      <circle cx="${wx + ww * 0.73}" cy="${wy + wh * 0.28}" r="${ww * 0.075}" fill="#2A2B5A" opacity="0.92"/>
      <rect x="${wx + ww / 2 - 5}" y="${wy}" width="10" height="${wh}" fill="#1C1830"/>
      <rect x="${wx}" y="${wy + wh * 0.55}" width="${ww}" height="10" fill="#1C1830"/>
      <rect width="${W}" height="${H}" fill="url(#lampw)"/>
      <path d="M0 ${H * 0.74} C ${W * 0.3} ${H * 0.68} ${W * 0.7} ${H * 0.76} ${W} ${H * 0.7} L ${W} ${H} L 0 ${H} Z" fill="#1F1A35"/>
      <path d="M0 ${H * 0.8} C ${W * 0.35} ${H * 0.75} ${W * 0.65} ${H * 0.84} ${W} ${H * 0.78} L ${W} ${H} L 0 ${H} Z" fill="#17142A"/>
    </svg>`;
  }

  /** Morning: a bright window, a mug with steam (drawn by ad.js), long soft light across a dim room. */
  function morning(W, H) {
    const wide = W > H;
    const wx = wide ? W * 0.5 : W * 0.08, wy = wide ? H * 0.08 : H * 0.27, ww = wide ? W * 0.44 : W * 0.84, wh = wide ? H * 0.62 : H * 0.26;
    return `<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <defs>
        <linearGradient id="mwall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A1D19"/><stop offset="1" stop-color="#140E0C"/></linearGradient>
        <linearGradient id="msky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F9DDB3"/><stop offset="0.55" stop-color="#F6B98A"/><stop offset="1" stop-color="#EE9A72"/></linearGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE1B8" stop-opacity="0.22"/><stop offset="1" stop-color="#FFE1B8" stop-opacity="0"/></linearGradient>
        <radialGradient id="msun" cx="0.3" cy="0.75" r="0.5"><stop offset="0" stop-color="#FFF2D6" stop-opacity="0.95"/><stop offset="1" stop-color="#FFF2D6" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#mwall)"/>
      <rect x="${wx - 16}" y="${wy - 16}" width="${ww + 32}" height="${wh + 32}" rx="20" fill="#3A2A22"/>
      <rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="10" fill="url(#msky)"/>
      <rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="10" fill="url(#msun)"/>
      <path d="M${wx} ${wy + wh * 0.82} c ${ww * 0.2} -${wh * 0.1} ${ww * 0.35} -${wh * 0.02} ${ww * 0.5} -${wh * 0.08} s ${ww * 0.35} ${wh * 0.04} ${ww * 0.5} -${wh * 0.02} V ${wy + wh} H ${wx} Z" fill="#D88A6A" opacity="0.65"/>
      <rect x="${wx + ww / 2 - 6}" y="${wy}" width="12" height="${wh}" fill="#3A2A22"/>
      <rect x="${wx}" y="${wy + wh * 0.5}" width="${ww}" height="12" fill="#3A2A22"/>
      <path d="M${wx} ${wy} L ${wx + ww} ${wy} L ${wide ? wx - W * 0.25 : W} ${H} L ${wide ? wx - W * 0.75 : -W * 0.3} ${H} Z" fill="url(#beam)"/>
      <rect x="0" y="${wy + wh + 16}" width="${W}" height="${H * 0.03}" fill="#3A2A22"/>
    </svg>`;
  }

  /** A living-room floor for the push-ups: a warm wall, a rug. The figure is drawn by pushup(). */
  function floor(W, H) {
    const fy = H * (W > H ? 0.72 : 0.46);
    return `<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <defs>
        <linearGradient id="fwall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1C130F"/><stop offset="1" stop-color="#2A1B13"/></linearGradient>
        <linearGradient id="ffloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A271B"/><stop offset="1" stop-color="#120C09"/></linearGradient>
        <radialGradient id="fglow" cx="0.5" cy="${fy / H - 0.08}" r="0.55"><stop offset="0" stop-color="#F39A57" stop-opacity="0.22"/><stop offset="1" stop-color="#F39A57" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#fwall)"/>
      <rect y="${fy}" width="${W}" height="${H - fy}" fill="url(#ffloor)"/>
      <rect y="${fy - 4}" width="${W}" height="8" fill="#140D0A"/>
      <ellipse cx="${W * 0.5}" cy="${fy + H * 0.03}" rx="${W * 0.44}" ry="${H * 0.03}" fill="#5A2F1F" opacity="0.9"/>
      <ellipse cx="${W * 0.5}" cy="${fy + H * 0.03}" rx="${W * 0.4}" ry="${H * 0.022}" fill="none" stroke="#F39A57" stroke-width="3" opacity="0.35"/>
      <rect width="${W}" height="${H}" fill="url(#fglow)"/>
    </svg>`;
  }

  /**
   * A person doing a push-up, side on, facing left. `p` is 0 at the top of the rep and 1 at the bottom. Drawn in its
   * own 600 × 260 box with the floor at y 240; colours: skin, top, shorts.
   */
  function pushup(p, c) {
    const F = 240, toeX = 540, L = 330;
    const sh = 150 - 92 * p; // shoulder height above the floor
    const ang = Math.asin(sh / L);
    const sx = toeX - L * Math.cos(ang), sy = F - sh;
    const hipX = toeX - L * 0.5 * Math.cos(ang), hipY = F - sh * 0.5 - 4;
    const handX = sx + 6, handY = F - 4;
    // The arm: upper arm and forearm of 78 each, elbow out behind (two-link, elbow toward the feet).
    const a = 80, b = 80;
    const dx = handX - sx, dy = handY - sy, d = Math.min(a + b - 0.01, Math.hypot(dx, dy));
    const base = Math.atan2(dy, dx);
    const k = Math.acos((a * a + d * d - b * b) / (2 * a * d));
    const ex = sx + a * Math.cos(base - k), ey = sy + a * Math.sin(base - k);
    const headX = sx - 44 * Math.cos(ang) - 4, headY = sy - 44 * Math.sin(ang) - 16;
    return `<svg class="pushup" viewBox="0 0 600 260" width="600" height="260">
      <ellipse cx="320" cy="${F + 6}" rx="250" ry="10" fill="#000" opacity="0.35"/>
      <path d="M${hipX.toFixed(1)} ${hipY.toFixed(1)} L ${toeX} ${F - 12}" stroke="${c.shorts}" stroke-width="40" stroke-linecap="round"/>
      <path d="M${(hipX + 70 * Math.cos(ang)).toFixed(1)} ${(hipY + 70 * Math.sin(ang) * 0.9).toFixed(1)} L ${toeX} ${F - 12}" stroke="${c.skin}" stroke-width="28" stroke-linecap="round"/>
      <path d="M${toeX - 8} ${F - 8} l 26 6" stroke="${c.shoe}" stroke-width="18" stroke-linecap="round"/>
      <path d="M${sx.toFixed(1)} ${sy.toFixed(1)} L ${hipX.toFixed(1)} ${hipY.toFixed(1)}" stroke="${c.top}" stroke-width="58" stroke-linecap="round"/>
      <circle cx="${headX.toFixed(1)}" cy="${headY.toFixed(1)}" r="26" fill="${c.skin}"/>
      <path d="M${(headX - 10).toFixed(1)} ${(headY - 24).toFixed(1)} a 27 27 0 0 1 36 18" fill="none" stroke="${c.hair}" stroke-width="16" stroke-linecap="round"/>
      <path d="M${sx.toFixed(1)} ${sy.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)} L ${handX.toFixed(1)} ${handY.toFixed(1)}" fill="none" stroke="${c.skin}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M${sx.toFixed(1)} ${sy.toFixed(1)} L ${((sx + ex) / 2).toFixed(1)} ${((sy + ey) / 2).toFixed(1)}" stroke="${c.top}" stroke-width="30" stroke-linecap="round"/>
      <path d="M${(handX - 14).toFixed(1)} ${F - 3} h 26" stroke="${c.skin}" stroke-width="12" stroke-linecap="round"/>
    </svg>`;
  }

  /** A dark field with a grid of small locks, for the privacy beat. */
  function vault(W, H) {
    let locks = "";
    const step = 120;
    const R = rng(3);
    for (let y = 40; y < H; y += step) for (let x = 40 + ((y / step) % 2) * 60; x < W; x += step) {
      locks += `<use href="#i-lock" x="${x}" y="${y}" width="34" height="34" opacity="${(0.05 + R() * 0.08).toFixed(2)}"/>`;
    }
    return `<svg class="layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="color:#8F8AF7">
      <defs><radialGradient id="vg" cx="0.5" cy="0.55" r="0.6"><stop offset="0" stop-color="#2A2560"/><stop offset="1" stop-color="#0B0A09"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#vg)"/>
      <g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${locks}</g>
    </svg>`;
  }

  window.AdArt = { hand, street, table, nightRoom, morning, floor, pushup, vault, shade, rng, SKINS };
})();
