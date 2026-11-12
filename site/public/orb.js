// Today's orb, drawn for real. The app draws it with CSS (src/components/ui/Orb.tsx): a glass sphere holding the three
// hues, brighter as their tasks get done. Here it is a 3D sphere lit from inside, in one WebGL quad and a fragment
// shader, no library. Each hue glows as brightly as its tasks are done; a drag turns the light inside, and a tilt
// follows a mouse. The CSS sphere under the canvas stands in until the first frame, and stays if WebGL is missing or
// its context is lost. With reduced motion it draws only when something changes.
(function () {
  "use strict";

  const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}";
  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uLit;
uniform float uClosed;
uniform vec2 uRot;
uniform float uR;
uniform float uLight;
uniform float uHalo;
uniform vec3 uJ;
uniform vec3 uF;
uniform vec3 uA;
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uEdge;

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

void main() {
  float unit = 0.5 * min(uRes.x, uRes.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / unit;
  float px = 1.0 / unit;
  float r = length(p);
  vec3 lit = 0.12 + 0.88 * uLit;
  float tt = uTime * (1.0 + 1.5 * uClosed);

  // The halo: three soft lights behind the sphere where the app puts them (journal upper left, food right, activity below).
  vec2 q = p / uR;
  vec2 dj2 = q - vec2(-0.62, 0.50);
  vec2 df2 = q - vec2(0.62, 0.24);
  vec2 da2 = q - vec2(0.0, -0.62);
  float hj = exp(-dot(dj2, dj2) * 0.85);
  float hf = exp(-dot(df2, df2) * 0.85);
  float ha = exp(-dot(da2, da2) * 0.85);
  vec3 w = (0.05 + 0.3 * uLit) * (1.0 + 0.4 * uClosed) * uHalo;
  float fade = smoothstep(1.0, 0.55, r);
  vec3 haloRgb = (uJ * hj * w.x + uF * hf * w.y + uA * ha * w.z) * fade;
  float haloA = clamp(hj * w.x + hf * w.y + ha * w.z, 0.0, 1.0) * fade;

  float inside = 1.0 - smoothstep(uR - 1.25 * px, uR + 0.25 * px, r);
  vec3 col = vec3(0.0);
  if (inside > 0.0) {
    vec2 s = p / uR;
    float h = sqrt(max(0.0, 1.0 - dot(s, s)));
    vec3 n = vec3(s, h);
    // The glass: lit at the top, as radial-gradient(circle at 50% 28%, top, bottom 80%).
    vec3 base = mix(uTop, uBottom, smoothstep(0.0, 1.0, length(s - vec2(0.0, 0.44)) / 1.4));
    // The light inside: three clouds drifting through the volume, summed along each view ray.
    mat3 M = rotY(uRot.x + tt * 0.06) * rotX(uRot.y);
    vec3 cJ = vec3(-0.44 + 0.26 * sin(tt * 0.70), 0.32 + 0.20 * sin(tt * 0.53 + 1.0), 0.20 * sin(tt * 0.41));
    vec3 cF = vec3(0.46 + 0.20 * sin(tt * 0.57 + 2.0), 0.12 + 0.24 * sin(tt * 0.66 + 0.4), 0.22 * sin(tt * 0.47 + 2.1));
    vec3 cA = vec3(0.02 + 0.24 * sin(tt * 0.61 + 4.0), -0.46 + 0.20 * sin(tt * 0.50 + 3.0), 0.20 * sin(tt * 0.39 + 4.2));
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float z = mix(h, -h, (float(i) + 0.5) / 6.0);
      vec3 v = M * vec3(s, z);
      v += 0.10 * sin(v.yzx * 3.2 + tt * 0.9);
      vec3 dj = v - cJ;
      vec3 df = v - cF;
      vec3 da = v - cA;
      acc += vec3(exp(-dot(dj, dj) * 3.8), exp(-dot(df, df) * 3.8), exp(-dot(da, da) * 3.8));
    }
    acc *= (2.0 * h / 6.0) * lit;
    // Where the clouds meet, their hues average rather than add, and the brightness eases in (1 - e^-x): the light
    // stays colour and never turns into a white blot. Night screens it over dark glass; Light tints pale glass.
    float total = acc.x + acc.y + acc.z;
    vec3 hue = (uJ * acc.x + uF * acc.y + uA * acc.z) / max(total, 0.0001);
    float energy = 1.0 - exp(-total * (1.7 + 0.4 * uClosed));
    vec3 night = 1.0 - (1.0 - base) * (1.0 - hue * energy);
    vec3 day = base * mix(vec3(1.0), hue, energy * 0.78);
    col = mix(night, day, uLight);
    // A rim in the lit hues, a small highlight, the app's soft gloss, a darker underside at night, a hairline edge.
    float fres = pow(1.0 - h, 2.4);
    vec3 rim = (uJ * lit.x + uF * lit.y + uA * lit.z) / (lit.x + lit.y + lit.z);
    col += rim * fres * mix(0.32, 0.10, uLight);
    vec3 L = normalize(vec3(-0.45, 0.62, 0.64));
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 42.0);
    col += spec * mix(0.22, 0.5, uLight);
    vec2 g = (s - vec2(-0.04, 0.66)) * vec2(1.0, 2.3);
    col += exp(-dot(g, g) * 2.4) * mix(0.12, 0.08, uLight);
    col *= 1.0 - (1.0 - uLight) * 0.35 * smoothstep(0.1, 1.0, -s.y) * pow(1.0 - h, 0.6);
    col = mix(col, uEdge, smoothstep(uR - 1.8 * px, uR - 0.4 * px, r) * 0.85);
  }
  gl_FragColor = vec4(haloRgb * (1.0 - inside) + col * inside, haloA * (1.0 - inside) + inside);
}`;

  /** "#8F8AF7" (or "rgb(…)") → [r, g, b] in 0–1. */
  function rgb(css) {
    const v = String(css || "").trim();
    if (v[0] === "#") {
      const h = v.length === 4 ? v.slice(1).split("").map((c) => c + c).join("") : v.slice(1, 7);
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    }
    const m = v.match(/[\d.]+/g);
    return m ? m.slice(0, 3).map((x) => Number(x) / 255) : [0.5, 0.5, 0.5];
  }

  function shader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  }

  /** Mounts on an .orb-stage holding a canvas. Returns null when WebGL can't run (the CSS sphere then stays). */
  function mount(stage) {
    const canvas = stage.querySelector("canvas");
    let gl = null;
    try { gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" }); } catch { gl = null; }
    if (!gl) return null;
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
    } catch (e) {
      console.warn("Dayhub orb: WebGL shader failed, keeping the CSS orb", e);
      return null;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    for (const n of ["uRes", "uTime", "uLit", "uClosed", "uRot", "uR", "uLight", "uHalo", "uJ", "uF", "uA", "uTop", "uBottom", "uEdge"]) U[n] = gl.getUniformLocation(prog, n);

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const target = { lit: [0.67, 0.88, 1], closed: 0 };
    const now = { lit: target.lit.slice(), closed: 0 };
    let yaw = 0.35, pitch = 0, vYaw = 0, vPitch = 0, dragging = false, lastX = 0, lastY = 0, lastT = 0;
    let time = 0, last = 0, raf = 0, visible = true, lost = false, drawn = false;
    let scale = Math.min(window.devicePixelRatio || 1, 2), slow = 0, frames = 0;
    let look = null;

    function retheme() {
      const cs = getComputedStyle(stage);
      const v = (name) => cs.getPropertyValue(name);
      look = {
        J: rgb(v("--journal")), F: rgb(v("--food")), A: rgb(v("--activity")),
        top: rgb(v("--sphere-top")), bottom: rgb(v("--sphere-bottom")), edge: rgb(v("--hairline-strong")),
        light: v("--blend").trim() === "multiply" ? 1 : 0, halo: parseFloat(v("--halo")) || 1,
      };
      request();
    }

    function size() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      // Never more than ~1100 px a side: the sphere is soft light, and a phone's GPU has better things to do.
      const k = Math.min(scale, 1100 / Math.max(w, h));
      const W = Math.round(w * k), H = Math.round(h * k);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      request();
    }

    function draw() {
      if (!look || lost) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, time);
      gl.uniform3f(U.uLit, now.lit[0], now.lit[1], now.lit[2]);
      gl.uniform1f(U.uClosed, now.closed);
      gl.uniform2f(U.uRot, yaw, pitch);
      // The sphere is 68.57% of the stage (192 of 280, as the app's), and the canvas is 136% of the stage.
      gl.uniform1f(U.uR, 0.6857 / 1.36);
      gl.uniform1f(U.uLight, look.light);
      gl.uniform1f(U.uHalo, look.halo);
      gl.uniform3fv(U.uJ, look.J);
      gl.uniform3fv(U.uF, look.F);
      gl.uniform3fv(U.uA, look.A);
      gl.uniform3fv(U.uTop, look.top);
      gl.uniform3fv(U.uBottom, look.bottom);
      gl.uniform3fv(U.uEdge, look.edge);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!drawn) { drawn = true; stage.classList.add("gl"); }
    }

    const running = () => visible && !document.hidden && !lost && !calm.matches;

    function frame(ts) {
      raf = 0;
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      // A slow phone: draw fewer pixels rather than drop frames.
      if (last && ++frames > 20) { slow = slow * 0.9 + (ts - last > 22 ? 0.1 : 0); if (slow > 0.6 && scale > 1) { scale = Math.max(1, scale * 0.75); slow = 0; size(); } }
      last = ts;
      time += dt;
      const k = 1 - Math.exp(-dt * 3.2);
      for (let i = 0; i < 3; i++) now.lit[i] += (target.lit[i] - now.lit[i]) * k;
      now.closed += (target.closed - now.closed) * k;
      if (!dragging) {
        yaw += vYaw * dt; pitch += vPitch * dt;
        const damp = Math.exp(-dt * 1.8);
        vYaw *= damp; vPitch *= damp;
        pitch += (0 - pitch) * (1 - Math.exp(-dt * 1.4));
      }
      draw();
      if (running()) raf = requestAnimationFrame(frame);
    }

    function request() {
      if (lost) return;
      if (running()) { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } return; }
      // Calm, or off screen: one still frame with everything where it ends up.
      now.lit = target.lit.slice(); now.closed = target.closed;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); });
    }

    // Drag to turn the light inside (not from a bead: those are buttons).
    stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".bead") || e.button > 0) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY; lastT = performance.now(); vYaw = 0; vPitch = 0;
      stage.classList.add("dragging");
      try { stage.setPointerCapture(e.pointerId); } catch { /* the pointer is gone already */ }
    });
    stage.addEventListener("pointermove", (e) => {
      if (dragging) {
        const t = performance.now(), dt = Math.max(1, t - lastT) / 1000;
        const dx = (e.clientX - lastX) / stage.clientWidth, dy = (e.clientY - lastY) / stage.clientHeight;
        yaw += dx * 3.2; pitch = Math.max(-0.7, Math.min(0.7, pitch + dy * 2.4));
        vYaw = (dx * 3.2) / dt; vPitch = (dy * 2.4) / dt;
        lastX = e.clientX; lastY = e.clientY; lastT = t;
        request();
      } else if (e.pointerType === "mouse" && !calm.matches) {
        const r = stage.getBoundingClientRect();
        stage.style.setProperty("--ty", (((e.clientX - r.left) / r.width - 0.5) * 12).toFixed(2) + "deg");
        stage.style.setProperty("--tx", (-((e.clientY - r.top) / r.height - 0.5) * 12).toFixed(2) + "deg");
      }
    });
    const release = () => { if (!dragging) return; dragging = false; stage.classList.remove("dragging"); request(); };
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);
    stage.addEventListener("pointerleave", () => { stage.style.removeProperty("--tx"); stage.style.removeProperty("--ty"); });

    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; stage.classList.remove("gl"); });

    new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; request(); }, { rootMargin: "80px" }).observe(stage);
    document.addEventListener("visibilitychange", request);
    calm.addEventListener("change", request);
    new ResizeObserver(size).observe(canvas);
    retheme();
    size();

    return {
      /** How lit each hue is (0–1, journal, food, activity) and whether the day is closed. */
      set(lit, closed) { target.lit = lit.slice(); target.closed = closed ? 1 : 0; request(); },
      /** A task just got done: its hue flares, then settles. */
      flare(i) { if (!calm.matches) now.lit[i] = Math.min(1.45, target.lit[i] + 0.45); vYaw += 0.6; request(); },
      retheme,
    };
  }

  window.DayhubOrb = { mount };
})();
