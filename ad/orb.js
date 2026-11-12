// Today's orb for the ad: the landing page's sphere (site/public/orb.js), the same fragment shader, drawn at an exact
// moment instead of on its own clock, so every frame of the video can be rendered on demand. Change the shader there,
// copy it here.
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
    vec3 base = mix(uTop, uBottom, smoothstep(0.0, 1.0, length(s - vec2(0.0, 0.44)) / 1.4));
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
    float total = acc.x + acc.y + acc.z;
    vec3 hue = (uJ * acc.x + uF * acc.y + uA * acc.z) / max(total, 0.0001);
    float energy = 1.0 - exp(-total * (1.7 + 0.4 * uClosed));
    vec3 night = 1.0 - (1.0 - base) * (1.0 - hue * energy);
    vec3 day = base * mix(vec3(1.0), hue, energy * 0.78);
    col = mix(night, day, uLight);
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

  const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
  const LOOK = {
    J: rgb("#8F8AF7"), F: rgb("#4BCF93"), A: rgb("#F39A57"),
    top: rgb("#211F1B"), bottom: rgb("#0B0A09"), edge: rgb("#3A3631"),
  };

  function shader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  }

  /** A canvas whose orb is drawn on request: draw({ time, lit: [j, f, a], closed, yaw, pitch, halo }). The sphere
   *  takes uR of half the canvas's shorter side (the landing page's 0.6857 / 1.36). */
  function create(canvas, size) {
    canvas.width = size;
    canvas.height = size;
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("no WebGL");
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    for (const n of ["uRes", "uTime", "uLit", "uClosed", "uRot", "uR", "uLight", "uHalo", "uJ", "uF", "uA", "uTop", "uBottom", "uEdge"]) U[n] = gl.getUniformLocation(prog, n);
    let last = "";
    return {
      draw(o) {
        const key = [o.time, ...o.lit, o.closed, o.yaw, o.pitch, o.halo].map((v) => v.toFixed(4)).join(",");
        if (key === last) return;
        last = key;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(U.uRes, canvas.width, canvas.height);
        gl.uniform1f(U.uTime, o.time);
        gl.uniform3f(U.uLit, o.lit[0], o.lit[1], o.lit[2]);
        gl.uniform1f(U.uClosed, o.closed);
        gl.uniform2f(U.uRot, o.yaw, o.pitch);
        gl.uniform1f(U.uR, 0.6857 / 1.36);
        gl.uniform1f(U.uLight, 0);
        gl.uniform1f(U.uHalo, o.halo);
        gl.uniform3fv(U.uJ, LOOK.J);
        gl.uniform3fv(U.uF, LOOK.F);
        gl.uniform3fv(U.uA, LOOK.A);
        gl.uniform3fv(U.uTop, LOOK.top);
        gl.uniform3fv(U.uBottom, LOOK.bottom);
        gl.uniform3fv(U.uEdge, LOOK.edge);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      renderer() {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      },
    };
  }

  window.AdOrb = { create };
})();
