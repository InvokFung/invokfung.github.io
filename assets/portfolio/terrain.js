/*
 * The hero: my name, written as sound and drawn as a landscape.
 *
 * Each ridge is one pitch (high at the back, low at the front), across is time and height is
 * loudness, so the name is the loud part of a recording. It is a spectrogram stood on its edge.
 *
 *   hear()   synthesizes that sound, one sine per ridge, and an AnalyserNode raises the ridges
 *            from the audio itself, so what you see is what you hear
 *   sing()   the microphone flows in from the right, and strings.js names the note you sing
 *   pointer  drops ripples into the field: a damped 2D wave equation, solved on the CPU
 *
 * WebGL2, no libraries. One instanced draw for all the ridges (each a curtain whose top edge is the
 * line), a small bloom, and a Canvas 2D fallback that draws the same field.
 */
(function () {
  "use strict";

  const F_LO = 60, F_HI = 8000, T = 3.2; // log pitch range, and seconds of sound across the name
  const rowF = (u) => F_LO * Math.exp(u * Math.log(F_HI / F_LO)); // u: 0 low .. 1 high
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const noteOf = (f) => { const m = 69 + 12 * Math.log2(f / 440), n = Math.round(m); return { name: NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1), cents: (m - n) * 100 }; };

  // any CSS colour to [r, g, b] in 0..1, by painting one pixel (so color-mix() works too)
  const pc = document.createElement("canvas"); pc.width = pc.height = 1;
  const probe = pc.getContext("2d", { willReadFrequently: true });
  const rgb = (c, fb) => {
    probe.clearRect(0, 0, 1, 1); probe.fillStyle = fb || "#000"; probe.fillStyle = c || fb || "#000";
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255];
  };

  /* ------------------------------------------------------------ tiny mat4 (column major) */
  const M = {
    persp(fy, a, n, f) { const t = 1 / Math.tan(fy / 2), r = 1 / (n - f); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * r, -1, 0, 0, 2 * f * n * r, 0]; },
    look(e, c, u) {
      let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]], l = Math.hypot(...z); z = z.map((v) => v / l);
      let x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]]; l = Math.hypot(...x); x = x.map((v) => v / l);
      const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      const d = (a) => -(a[0] * e[0] + a[1] * e[1] + a[2] * e[2]);
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, d(x), d(y), d(z), 1];
    },
    mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    inv(m) {
      const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
      const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
      const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
      return [(a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
        (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
        (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
        (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d];
    },
    xf(m, v) { const o = [0, 0, 0, 0]; for (let r = 0; r < 4; r++) o[r] = m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]; return o; }
  };

  /* ------------------------------------------------------------------ shaders */
  const VS = `#version 300 es
  precision highp float;
  in vec2 aPos;                  // x: 0..1 across, y: 1 on the ridge line, 0 at the foot of its curtain
  uniform sampler2D uH;          // height field, one row per ridge
  uniform mat4 uMVP;
  uniform float uRows, uW, uD, uAmp, uTime, uWind;
  out float vV, vH, vZ, vU;
  float wind(vec2 p, float t) {
    return sin(p.x * 7.0 + t * 0.9 + sin(p.y * 3.0 + t * 0.4) * 1.6) * 0.5
         + sin(p.x * 13.0 - p.y * 5.0 - t * 1.3) * 0.28
         + sin(p.x * 29.0 + p.y * 9.0 + t * 1.9) * 0.14;
  }
  void main() {
    float r = uRows - 1.0 - float(gl_InstanceID); // front ridges first, so the depth test culls early
    float z = r / (uRows - 1.0);                   // 0 at the back (high) .. 1 at the front (low)
    float h = texture(uH, vec2(aPos.x, (r + 0.5) / uRows)).r;
    h += uWind * (0.45 + 0.55 * z) * (0.6 + 0.4 * wind(vec2(aPos.x, z), uTime));
    float y = aPos.y > 0.5 ? h * uAmp : -0.9;
    gl_Position = uMVP * vec4((aPos.x - 0.5) * uW, y, (z - 0.5) * uD, 1.0);
    vV = 1.0 - aPos.y; vH = h; vZ = z; vU = aPos.x;
  }`;
  const FS = `#version 300 es
  precision highp float;
  in float vV, vH, vZ, vU;
  uniform vec3 uBg, uC0, uC1, uC2, uC3;
  uniform float uLine, uHead, uLight;
  out vec4 o;
  vec3 pal(float t) {
    return t < 0.25 ? mix(uC0, uC1, t / 0.25) : t < 0.58 ? mix(uC1, uC2, (t - 0.25) / 0.33) : mix(uC2, uC3, min(1.0, (t - 0.58) / 0.38));
  }
  void main() {
    float fw = max(fwidth(vV), 1e-5);
    float d = vV / fw;                                    // pixels below the ridge line
    float line = 1.0 - smoothstep(uLine * 0.5, uLine * 0.5 + 1.0, d);
    float heat = clamp(vH, 0.0, 1.0);
    float halo = exp(-d / (3.0 + 9.0 * heat)) * (0.1 + 0.55 * heat);
    float fog = smoothstep(0.0, 0.55, vZ) * smoothstep(0.0, 0.1, vU) * smoothstep(1.0, 0.9, vU);
    float head = uHead >= 0.0 ? exp(-pow((vU - uHead) * 55.0, 2.0)) : 0.0;
    vec3 c = pal(clamp(heat + head * 0.35, 0.0, 1.0));
    float a = clamp((line * (0.55 + 0.45 * heat) + halo + head * line * 0.8) * fog, 0.0, 1.0);
    o = vec4(mix(uBg, c, a), 1.0);
  }`;
  // bloom: bright pass at quarter size, two blur passes, added back
  const QV = `#version 300 es
  in vec2 aQ; out vec2 vT;
  void main() { vT = aQ * 0.5 + 0.5; gl_Position = vec4(aQ, 0.0, 1.0); }`;
  const BRIGHT = `#version 300 es
  precision mediump float; in vec2 vT; uniform sampler2D uS; uniform vec3 uBg; out vec4 o;
  void main() { vec3 c = texture(uS, vT).rgb - uBg; float l = max(c.r, max(c.g, c.b)); o = vec4(c * smoothstep(0.18, 0.8, l), 1.0); }`;
  const BLUR = `#version 300 es
  precision mediump float; in vec2 vT; uniform sampler2D uS; uniform vec2 uDir; out vec4 o;
  void main() {
    vec3 c = texture(uS, vT).rgb * 0.227;
    c += (texture(uS, vT + uDir * 1.385).rgb + texture(uS, vT - uDir * 1.385).rgb) * 0.316;
    c += (texture(uS, vT + uDir * 3.231).rgb + texture(uS, vT - uDir * 3.231).rgb) * 0.070;
    o = vec4(c, 1.0);
  }`;
  const COMP = `#version 300 es
  precision mediump float; in vec2 vT; uniform sampler2D uS, uB; uniform float uK; out vec4 o;
  void main() { o = vec4(texture(uS, vT).rgb + texture(uB, vT).rgb * uK, 1.0); }`;

  class Terrain {
    constructor(canvas, o = {}) {
      this.cv = canvas; this.o = o;
      this.name = o.name || "";
      this.motion = !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
      this.audio = null; this.cache = null; this.seen = true; this.raf = 0; this.t = 0;
      this.head = -1; this.mode = "write"; this.writeT = 0; this.sweepT = 0;
      this.par = { x: 0, y: 0, tx: 0, ty: 0 };
      this.gl = canvas.getContext("webgl2", { antialias: false, depth: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });
      if (this.gl) try { this.initGL(); } catch (e) { console.warn("terrain: falling back to 2D", e); this.gl = null; }
      if (!this.gl) this.g = canvas.getContext("2d");
      canvas.addEventListener("pointermove", (e) => this.point(e, false));
      canvas.addEventListener("pointerdown", (e) => this.point(e, true));
      window.addEventListener("pointermove", (e) => { this.par.tx = (e.clientX / innerWidth - 0.5) * 2; this.par.ty = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });
      if ("IntersectionObserver" in window) new IntersectionObserver((en) => { this.seen = en[0].isIntersecting; if (this.seen) this.wake(); }).observe(canvas);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) this.wake(); });
      this.theme();
      this.resize();
    }

    /* --------------------------------------------------------------- layout */
    resize() {
      const w = this.cv.clientWidth, h = this.cv.clientHeight;
      if (!w || !h) return;
      const small = w < 700;
      const dpr = Math.min(small ? 2 : 1.75, window.devicePixelRatio || 1);
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      Object.assign(this, { w, h, dpr, small });
      const cols = small ? 240 : 360, rows = small ? 96 : 112;
      if (cols !== this.cols || rows !== this.rows) {
        Object.assign(this, { cols, rows });
        const n = cols * rows;
        this.E = new Float32Array(n); this.U = new Float32Array(n); this.V = new Float32Array(n); this.H = new Float32Array(n);
        this.cache = null;
        if (this.gl) this.geometry();
        this.build();
      }
      if (this.gl) this.targets();
      this.camera();
      this.wake();
    }
    camera() {
      const a = this.w / this.h, small = this.small;
      // the terrain is wider than the screen so its sides never show; the name sits in the middle
      this.W = small ? 3.4 : Math.max(3.6, 2.5 * a);
      this.D = small ? 2.0 : 2.2;
      this.fov = (small ? 46 : 34) * Math.PI / 180;
      this.eye0 = small ? [0, 2.2, 1.7] : [0, 1.75, 2.05];
      this.at0 = small ? [0, 0, -0.12] : [0, 0, -0.26];
      this.amp = small ? 0.16 : 0.135;
    }
    theme() {
      const cs = getComputedStyle(this.cv), v = (k) => cs.getPropertyValue(k).trim();
      this.light = document.documentElement.dataset.theme === "paper";
      this.col = {
        bg: rgb(v("--bg"), "#09090b"),
        c0: rgb(v("--t0"), "#2a2350"), c1: rgb(v("--t1"), "#7b5cff"), c2: rgb(v("--t2"), "#ff5d8f"), c3: rgb(v("--t3"), "#ffd27a")
      };
      this.css = { c0: v("--t0") || "#2a2350", c1: v("--t1") || "#7b5cff", c2: v("--t2") || "#ff5d8f", c3: v("--t3") || "#ffd27a", bg: v("--bg") || "#09090b" };
      this.wake();
    }

    /* ---------------------------------------------------------- the picture */
    setName(name) { this.name = name; this.cache = null; this.build(); }
    build() {
      if (!this.cols) return;
      const { cols, rows } = this, n = cols * rows;
      const c = document.createElement("canvas"); c.width = cols; c.height = rows;
      const g = c.getContext("2d");
      // the name fills the middle of the field, between about 280 Hz and 5 kHz
      // on a phone the near line widens with perspective, so the name sits further back and narrower
      const x0 = Math.round(cols * (this.small ? 0.25 : this.o.margin || 0.22)), x1 = cols - x0;
      const top = Math.round(rows * (this.small ? 0.06 : 0.14)), bot = Math.round(rows * (this.small ? 0.58 : 0.74));
      // a heavy sans: at one column per few pixels, thin serif stems turn to noise
      const fam = getComputedStyle(document.documentElement).getPropertyValue("--sans").trim() || "sans-serif";
      const font = (size) => `600 ${size}px ${fam}`;
      if (document.fonts && document.fonts.check && !this.fontAsked && !document.fonts.check(font(100))) {
        this.fontAsked = true;
        document.fonts.load(font(100)).then(() => { this.cache = null; this.build(); }, () => {});
      }
      const words = this.name.trim().split(/\s+/);
      const lines = this.small && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [words.join(" ")];
      let px = 100;
      g.font = font(px);
      const ms = lines.map((s) => g.measureText(s));
      const asc = Math.max(...ms.map((m) => m.actualBoundingBoxAscent || px * 0.7)), desc = Math.max(...ms.map((m) => m.actualBoundingBoxDescent || px * 0.2));
      const lh = asc + desc, gap = lh * 0.06, tall = lh * lines.length + gap * (lines.length - 1), wide = Math.max(...ms.map((m) => m.width));
      // a ridge is a lot taller than a column is wide, so letters are drawn squashed to come out right
      const sy = 1.0;
      const k = Math.min((x1 - x0) / wide, (bot - top) / (tall * sy));
      g.setTransform(k, 0, 0, k * sy, (x0 + x1) / 2, top);
      g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.font = font(px);
      lines.forEach((s, i) => g.fillText(s, 0, asc + i * (lh + gap)));
      const a = g.getImageData(0, 0, cols, rows).data;
      const raw = new Float32Array(n);
      for (let i = 0; i < n; i++) raw[i] = a[i * 4 + 3] / 255;
      // soften the edges a little so strokes rise instead of stepping
      const mask = new Float32Array(n);
      for (let r = 0; r < rows; r++) for (let x = 0; x < cols; x++) {
        let s = 0, wsum = 0;
        for (let dx = -2; dx <= 2; dx++) { const xx = x + dx; if (xx < 0 || xx >= cols) continue; const wt = 3 - Math.abs(dx); s += raw[r * cols + xx] * wt; wsum += wt; }
        mask[r * cols + x] = s / wsum;
      }
      this.mask = mask; this.x0 = x0; this.x1 = x1;
      // a recording's noise floor: louder towards the bass, a little mains hum, striations in the letters
      const F = (this.F = new Float32Array(n)), S = (this.S = new Float32Array(n));
      const hum = [100, 150, 200].map((f) => Math.round((1 - Math.log(f / F_LO) / Math.log(F_HI / F_LO)) * (rows - 1)));
      for (let r = 0; r < rows; r++) {
        const base = 0.025 + 0.09 * Math.pow(r / (rows - 1), 1.7) + (hum.includes(r) ? 0.05 : 0);
        let tail = 0;
        for (let x = 0; x < cols; x++) {
          const i = r * cols + x, mk = mask[i];
          F[i] = base * (0.35 + Math.random() * 0.9);
          tail = Math.max(mk, tail * 0.9);
          const tex = (0.82 + 0.18 * Math.sin(r * 2.3 + x * 0.05)) * (0.88 + Math.random() * 0.12);
          S[i] = Math.max(F[i], mk * 0.92 * tex, tail * 0.3);
        }
      }
      if (this.motion && this.mode === "write") { this.E.set(F); this.writeT = 0; }
      else { this.E.set(S); this.mode = this.audio ? this.mode : "idle"; }
      this.wake();
    }

    /* --------------------------------------------------------------- WebGL */
    initGL() {
      const gl = this.gl;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const prog = (vs, fs) => {
        const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
        return { p, u };
      };
      this.P = { ridge: prog(VS, FS), bright: prog(QV, BRIGHT), blur: prog(QV, BLUR), comp: prog(QV, COMP) };
      this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.qvao = gl.createVertexArray(); gl.bindVertexArray(this.qvao);
      for (const k of ["bright", "blur", "comp"]) { const loc = gl.getAttribLocation(this.P[k].p, "aQ"); if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); } }
      this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.lost = false;
      this.cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.lost = true; });
      this.cv.addEventListener("webglcontextrestored", () => { this.lost = false; this.initGL(); this.cols = 0; this.resize(); });
    }
    geometry() {
      const gl = this.gl, P = this.cols * 2, v = new Float32Array(P * 4);
      for (let i = 0; i < P; i++) { const u = i / (P - 1); v.set([u, 1, u, 0], i * 4); }
      if (!this.vbo) this.vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
      if (!this.vao) this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      const loc = gl.getAttribLocation(this.P.ridge.p, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.nv = P * 2; // vertices per ridge
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, this.cols, this.rows, 0, gl.RED, gl.FLOAT, null);
    }
    targets() {
      const gl = this.gl, W = this.cv.width, H = this.cv.height;
      const mk = (w, h, depth, samples) => {
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        return { t, f, w, h };
      };
      if (this.rt) { for (const r of Object.values(this.rt)) { if (r.t) gl.deleteTexture(r.t); if (r.f) gl.deleteFramebuffer(r.f); if (r.rb) gl.deleteRenderbuffer(r.rb); if (r.db) gl.deleteRenderbuffer(r.db); } }
      // the scene is drawn multisampled, then resolved into a texture the bloom can read
      const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
      const ms = { f: gl.createFramebuffer(), rb: gl.createRenderbuffer(), db: gl.createRenderbuffer() };
      gl.bindRenderbuffer(gl.RENDERBUFFER, ms.rb); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, W, H);
      gl.bindRenderbuffer(gl.RENDERBUFFER, ms.db); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ms.f);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, ms.rb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, ms.db);
      const q = Math.max(1, Math.round(W / 4)), qh = Math.max(1, Math.round(H / 4));
      this.rt = { ms, scene: mk(W, H), a: mk(q, qh), b: mk(q, qh) };
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    drawGL() {
      const gl = this.gl, { cols, rows, rt } = this, W = this.cv.width, H = this.cv.height;
      if (this.lost || !rt) return;
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RED, gl.FLOAT, this.H);
      const { bg, c0, c1, c2, c3 } = this.col;
      // 1. the ridges, multisampled
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.ms.f); gl.viewport(0, 0, W, H);
      gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
      const R = this.P.ridge; gl.useProgram(R.p); gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(R.u.uH, 0);
      gl.uniformMatrix4fv(R.u.uMVP, false, this.mvp);
      gl.uniform1f(R.u.uRows, rows); gl.uniform1f(R.u.uW, this.W); gl.uniform1f(R.u.uD, this.D); gl.uniform1f(R.u.uAmp, this.amp);
      gl.uniform1f(R.u.uTime, this.t); gl.uniform1f(R.u.uWind, this.motion ? 0.035 : 0.02);
      gl.uniform3fv(R.u.uBg, bg); gl.uniform3fv(R.u.uC0, c0); gl.uniform3fv(R.u.uC1, c1); gl.uniform3fv(R.u.uC2, c2); gl.uniform3fv(R.u.uC3, c3);
      gl.uniform1f(R.u.uLine, (this.small ? 1.3 : 1.45) * this.dpr); gl.uniform1f(R.u.uHead, this.head); gl.uniform1f(R.u.uLight, this.light ? 1 : 0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, this.nv, rows);
      gl.disable(gl.DEPTH_TEST);
      // 2. resolve
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rt.ms.f); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, rt.scene.f);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindVertexArray(this.qvao);
      if (this.light) { // paper: no glow, just the lines
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rt.scene.f); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        return;
      }
      // 3. bloom at quarter size
      const pass = (p, src, dst, set) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.f : null); gl.viewport(0, 0, dst ? dst.w : W, dst ? dst.h : H); gl.useProgram(p.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t); gl.uniform1i(p.u.uS, 0); if (set) set(p.u); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
      pass(this.P.bright, rt.scene, rt.a, (u) => gl.uniform3fv(u.uBg, bg));
      for (let i = 0; i < 2; i++) {
        pass(this.P.blur, rt.a, rt.b, (u) => gl.uniform2f(u.uDir, (1 + i) / rt.a.w, 0));
        pass(this.P.blur, rt.b, rt.a, (u) => gl.uniform2f(u.uDir, 0, (1 + i) / rt.a.h));
      }
      pass(this.P.comp, rt.scene, null, (u) => { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rt.a.t); gl.uniform1i(u.uB, 1); gl.uniform1f(u.uK, 1.15); });
    }

    /* ------------------------------------------------------- Canvas 2D fallback */
    draw2D() {
      const { g, cols, rows, H, w, h } = this, cs = this.css;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.fillStyle = cs.bg; g.fillRect(0, 0, w, h);
      const step = this.small ? 2 : 2, every = this.small ? 1 : 1;
      for (let r = 0; r < rows; r += every) {
        const z = r / (rows - 1), y0 = h * (0.16 + 0.66 * z), sx = 0.86 + 0.5 * z, amp = h * 0.07 * (0.7 + 0.6 * z);
        g.beginPath();
        for (let x = 0; x < cols; x += step) {
          const px = w / 2 + (x / (cols - 1) - 0.5) * w * sx * 1.25, py = y0 - H[r * cols + x] * amp;
          x ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.lineTo(w * 2, h * 2); g.lineTo(-w, h * 2); g.closePath();
        g.fillStyle = cs.bg; g.fill();
        g.globalAlpha = 0.25 + 0.75 * z; g.strokeStyle = z > 0.5 ? cs.c2 : cs.c1; g.lineWidth = 1.1; g.stroke(); g.globalAlpha = 1;
      }
    }

    /* -------------------------------------------------------------- frames */
    wake() { if (!this.raf && this.cols) this.raf = requestAnimationFrame((t) => this.frame(t)); }
    frame(now) {
      this.raf = 0;
      if (document.hidden) return;
      const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 1 / 60);
      this.last = now;
      if (this.motion) this.t += dt;
      const { cols, rows, E, S, F, U, V, H } = this, n = cols * rows;
      let again = this.motion;
      if (this.mode === "write") {
        // the name rises out of the floor, left to right
        this.writeT += dt;
        const span = this.x1 - this.x0, hx = this.x0 + (this.writeT / 1.9) * span;
        for (let r = 0; r < rows; r++) for (let x = 0; x < cols; x++) {
          const i = r * cols + x;
          if (x < hx) E[i] += (S[i] - E[i]) * Math.min(1, dt * 7);
        }
        this.head = clamp(hx / (cols - 1), 0, 1);
        if (hx > this.x1 + span * 0.15) { this.mode = "idle"; this.head = -1; this.sweepT = 0; }
      } else if (this.mode === "idle") {
        // every so often a playhead sweeps the name, as if it were being played back
        this.sweepT += dt;
        const cyc = 11, p = this.sweepT % cyc;
        this.head = this.motion && p > 7 && p < 10 ? (this.x0 + ((p - 7) / 3) * (this.x1 - this.x0)) / (cols - 1) : -1;
        for (let i = 0; i < n; i++) E[i] += (S[i] - E[i]) * Math.min(1, dt * 2.5);
      } else if (this.mode === "play") again = this.playFrame() || again;
      else if (this.mode === "live") again = this.liveFrame(dt) || again;
      // ripples: a damped wave equation, a little faster across than front to back (cells are wider than deep)
      if (this.rippling) {
        const kx = 0.42, kz = 0.11, damp = 0.986;
        let energy = 0;
        for (let s = 0; s < 2; s++) {
          for (let r = 1; r < rows - 1; r++) {
            const o = r * cols;
            for (let x = 1; x < cols - 1; x++) {
              const i = o + x, u = U[i];
              V[i] = (V[i] + kx * (U[i - 1] + U[i + 1] - 2 * u) + kz * (U[i - cols] + U[i + cols] - 2 * u)) * damp;
            }
          }
          for (let i = 0; i < n; i++) { U[i] += V[i]; energy += Math.abs(V[i]); }
        }
        if (energy < 1e-3 * n) { U.fill(0); V.fill(0); this.rippling = false; }
        again = true;
      }
      for (let i = 0; i < n; i++) H[i] = Math.max(-0.2, E[i] + U[i]);
      // a little parallax with the pointer
      const p = this.par, k = Math.min(1, dt * 2.2);
      p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
      if (Math.abs(p.tx - p.x) > 0.002 || Math.abs(p.ty - p.y) > 0.002) again = true;
      const drift = this.motion ? Math.sin(this.t * 0.08) * 0.06 : 0;
      const e = [this.eye0[0] + p.x * 0.22 + drift, this.eye0[1] - p.y * 0.08, this.eye0[2]];
      const proj = M.persp(this.fov, this.w / this.h, 0.05, 20), view = M.look(e, this.at0, [0, 1, 0]);
      this.mvp = M.mul(proj, view); this.imvp = M.inv(this.mvp);
      if (this.gl) this.drawGL(); else if (this.g) this.draw2D();
      if (again && this.seen) this.wake();
    }

    /* ------------------------------------------------------------- pointer */
    // where on the floor (y = 0) is this point of the screen?
    pick(cx, cy) {
      if (!this.imvp) return null;
      const r = this.cv.getBoundingClientRect(), nx = ((cx - r.left) / r.width) * 2 - 1, ny = 1 - ((cy - r.top) / r.height) * 2;
      const a = M.xf(this.imvp, [nx, ny, -1, 1]), b = M.xf(this.imvp, [nx, ny, 1, 1]);
      const p0 = a.map((v) => v / a[3]), p1 = b.map((v) => v / b[3]);
      const t = p0[1] / (p0[1] - p1[1]);
      if (!(t > 0)) return null;
      const x = p0[0] + (p1[0] - p0[0]) * t, z = p0[2] + (p1[2] - p0[2]) * t;
      const col = (x / this.W + 0.5) * (this.cols - 1), row = (z / this.D + 0.5) * (this.rows - 1);
      if (col < 2 || col > this.cols - 3 || row < 1 || row > this.rows - 2) return null;
      return { col, row };
    }
    point(e, down) {
      if (!this.cols) return;
      const p = this.pick(e.clientX, e.clientY);
      if (!p) { this.lastPick = null; return; }
      let a = down ? 0.55 : 0;
      if (!down && this.lastPick) a = Math.min(0.28, Math.hypot(p.col - this.lastPick.col, (p.row - this.lastPick.row) * 3) * 0.02);
      this.lastPick = p;
      if (a < 0.01) return;
      this.splash(p.col, p.row, a, down ? 5 : 3);
      if (this.tone) this.tone.o.frequency.setTargetAtTime(rowF(1 - p.row / (this.rows - 1)), this.tone.ctx.currentTime, 0.03);
    }
    splash(cx, cy, a, rad) {
      const { cols, rows, V } = this, rr = Math.ceil(rad * 2.5);
      for (let dy = -Math.ceil(rr / 2); dy <= Math.ceil(rr / 2); dy++) for (let dx = -rr; dx <= rr; dx++) {
        const x = Math.round(cx) + dx, y = Math.round(cy) + dy;
        if (x < 1 || y < 1 || x >= cols - 1 || y >= rows - 1) continue;
        V[y * cols + x] += a * Math.exp(-(dx * dx) / (rad * rad) - (dy * dy * 4) / (rad * rad));
      }
      this.rippling = true;
      this.wake();
    }
    // a raindrop somewhere on the name, for when nobody is touching it
    drop() { if (!this.cols || !this.motion || this.mode !== "idle") return; this.splash(this.x0 + Math.random() * (this.x1 - this.x0), this.rows * (0.15 + Math.random() * 0.6), 0.35, 4); }

    /* --------------------------------------------------------------- hear it */
    // one sine per ridge, loud where the letters are
    synth(sr) {
      if (this.cache && this.cache.sr === sr) return this.cache.y;
      const { cols, rows, mask, x0, x1 } = this, n = Math.floor(T * sr), y = new Float32Array(n), B = 64, span = x1 - x0;
      const env = new Float32Array(Math.ceil(n / B) + 1);
      for (let r = 0; r < rows; r++) {
        const f = rowF(1 - r / (rows - 1));
        if (f > sr / 2 - 200) continue;
        let peak = 0;
        for (let x = x0; x < x1; x++) peak = Math.max(peak, mask[r * cols + x]);
        if (peak < 0.04) continue;
        for (let b = 0; b < env.length; b++) { const p = x0 + ((b * B) / n) * span, xa = clamp(Math.floor(p), 0, cols - 2), k = clamp(p - xa, 0, 1); env[b] = mask[r * cols + xa] * (1 - k) + mask[r * cols + xa + 1] * k; }
        const w = (2 * Math.PI * f) / sr, cr = Math.cos(w), ci = Math.sin(w), ph = Math.random() * 2 * Math.PI;
        let re = Math.cos(ph), im = Math.sin(ph);
        for (let s = 0; s < n; s++) {
          const b = (s / B) | 0, a = env[b] + (env[b + 1] - env[b]) * ((s % B) / B);
          if (a > 0.002) y[s] += a * im;
          const t = re * cr - im * ci; im = re * ci + im * cr; re = t;
          if ((s & 1023) === 0) { const l = Math.hypot(re, im); re /= l; im /= l; }
        }
      }
      let pk = 0;
      for (let s = 0; s < n; s++) pk = Math.max(pk, Math.abs(y[s]));
      const fade = Math.floor(sr * 0.03), gain = pk ? 0.32 / pk : 0;
      for (let s = 0; s < n; s++) y[s] *= gain * Math.min(1, s / fade, (n - 1 - s) / fade);
      this.cache = { sr, y };
      return y;
    }
    async hear() {
      const S = window.Strings, ctx = S && S.Sound.unlock();
      if (!ctx) return false;
      this.stopAudio();
      await new Promise((r) => setTimeout(r, 30)); // let the button repaint before the synth runs
      const y = this.synth(ctx.sampleRate);
      const buf = ctx.createBuffer(1, y.length, ctx.sampleRate); buf.getChannelData(0).set(y);
      const src = ctx.createBufferSource(), an = ctx.createAnalyser(), g = ctx.createGain();
      an.fftSize = 4096; an.smoothingTimeConstant = 0; an.minDecibels = -110; an.maxDecibels = -20;
      src.buffer = buf; src.connect(g); g.connect(ctx.destination); src.connect(an); g.gain.value = 0.9;
      const t0 = ctx.currentTime + 0.05;
      src.start(t0);
      this.audio = { ctx, src, an, t0, spec: new Float32Array(an.frequencyBinCount), col: this.x0 };
      // flatten the name, then let the sound raise it again
      for (let r = 0; r < this.rows; r++) for (let x = this.x0; x < this.x1; x++) { const i = r * this.cols + x; this.E[i] = this.F[i] * 0.6; }
      this.mode = "play"; this.head = this.x0 / (this.cols - 1);
      src.onended = () => { if (this.audio && this.audio.src === src) { this.audio = null; this.mode = "idle"; this.head = -1; this.sweepT = 0; if (this.o.onState) this.o.onState("idle"); } };
      if (this.o.onState) this.o.onState("playing");
      this.wake();
      return true;
    }
    column(x, spec, sr, keepFloor) {
      const { cols, rows, E, F } = this, bins = spec.length, nyq = sr / 2;
      for (let r = 0; r < rows; r++) {
        const f = rowF(1 - r / (rows - 1)), p = (f / nyq) * bins, i0 = Math.min(bins - 2, Math.floor(p)), k = p - i0;
        const db = spec[i0] * (1 - k) + spec[i0 + 1] * k, v = clamp((db + 100) / 62, 0, 1);
        E[r * cols + x] = Math.max(keepFloor ? F[r * cols + x] * 0.6 : 0, Math.pow(v, 1.15) * 0.95);
      }
    }
    playFrame() {
      const A = this.audio;
      if (!A || !A.src) return false;
      const el = A.ctx.currentTime - A.t0;
      if (el < 0) return true;
      A.an.getFloatFrequencyData(A.spec);
      const head = Math.min(this.x1, this.x0 + Math.floor((el / T) * (this.x1 - this.x0)));
      for (let x = A.col; x < head; x++) this.column(x, A.spec, A.ctx.sampleRate, true);
      if (head > A.col && Math.random() < 0.25) this.splash(head, this.rows * (0.2 + Math.random() * 0.5), 0.12, 3);
      A.col = Math.max(A.col, head);
      this.head = head / (this.cols - 1);
      return true;
    }

    /* ------------------------------------------------------------------ sing */
    async sing(on) {
      const S = window.Strings;
      if (!on) { this.stop(); return true; }
      const ctx = S && S.Sound.unlock();
      if (!ctx || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "unsupported";
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        this.stopAudio();
        const an = ctx.createAnalyser(); an.fftSize = 4096; an.smoothingTimeConstant = 0;
        ctx.createMediaStreamSource(stream).connect(an);
        this.audio = { ctx, an, stream, spec: new Float32Array(an.frequencyBinCount), td: new Float32Array(an.fftSize), acc: 0 };
        this.mode = "live"; this.head = -1;
        if (this.o.onState) this.o.onState("listening");
        this.wake();
        return true;
      } catch (e) {
        return e && e.name === "NotAllowedError" ? "blocked" : "missing";
      }
    }
    liveFrame(dt) {
      const A = this.audio;
      if (!A || !A.stream) return false;
      const { cols, rows, E } = this;
      A.acc += dt * (cols / 5); // the whole field in five seconds
      const k = Math.floor(A.acc);
      if (k > 0) {
        A.acc -= k;
        A.an.getFloatFrequencyData(A.spec);
        for (let r = 0; r < rows; r++) { const row = r * cols; E.copyWithin(row, row + k, row + cols); }
        for (let j = 0; j < k; j++) this.column(cols - k + j, A.spec, A.ctx.sampleRate, true);
      }
      A.an.getFloatTimeDomainData(A.td);
      const S = window.Strings, p = S && S.pitch(A.td, A.ctx.sampleRate);
      if (p) {
        const nt = noteOf(p.f), c = Math.round(nt.cents);
        const label = `${nt.name} ${c >= 0 ? "+" : "−"}${Math.abs(c)}¢`;
        if (this.o.onRead) this.o.onRead(label);
      } else if (this.o.onRead) this.o.onRead(null);
      return true;
    }
    stopAudio() {
      const A = this.audio;
      this.audio = null;
      if (!A) return;
      if (A.src) { A.src.onended = null; try { A.src.stop(); } catch (e) {} }
      if (A.stream) A.stream.getTracks().forEach((t) => t.stop());
    }
    get state() { return !this.audio ? "idle" : this.audio.stream ? "listening" : "playing"; }
    stop() {
      if (this.state === "idle") return;
      this.stopAudio();
      this.mode = "idle"; this.head = -1; this.sweepT = 0;
      if (this.o.onState) this.o.onState("idle");
      this.wake();
    }
    setMotion(on) { this.motion = on; if (!on && this.mode === "write") { this.mode = "idle"; this.E.set(this.S); this.head = -1; } this.wake(); }
  }

  window.Terrain = Terrain;
})();
