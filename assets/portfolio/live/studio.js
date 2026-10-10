/*
 * Intonation Studio, small: a synthesized violin note (eight harmonics, a touch of noise) at
 * A4 plus whatever detune you choose, and a McLeod pitch detector listening to it. The detector
 * computes the normalised square difference function, takes the first key maximum within 0.9 of
 * the highest, and finds the sub-sample lag with a cosine fit through the three points at the
 * peak. The readout compares what was played with what was heard.
 */
(function (root) {
  "use strict";
  const { TAU, SANS, SERIF, INK, RED, ink, rgba, rng, font, label, Fig } = root.FigKit;

  const SR = 44100, N = 2048, W = 1024, MAXLAG = 640;
  const HARM = [1, 0.62, 0.45, 0.33, 0.22, 0.18, 0.12, 0.08];

  function mpm(x, out) {
    for (let t = 0; t < MAXLAG; t++) {
      let r = 0, m = 0;
      for (let i = 0; i < W; i++) { const a = x[i], b = x[i + t]; r += a * b; m += a * a + b * b; }
      out[t] = m > 0 ? (2 * r) / m : 0;
    }
    // key maxima: the highest point of each positive lobe after the first zero crossing
    const peaks = [];
    let t = 1;
    while (t < MAXLAG && out[t] > 0) t++;
    while (t < MAXLAG - 1) {
      while (t < MAXLAG - 1 && out[t] <= 0) t++;
      let best = -1;
      while (t < MAXLAG - 1 && out[t] > 0) { if (best < 0 || out[t] > out[best]) best = t; t++; }
      if (best > 0 && best < MAXLAG - 1) peaks.push(best);
    }
    if (!peaks.length) return null;
    const top = Math.max(...peaks.map((p) => out[p]));
    const p = peaks.find((q) => out[q] >= 0.9 * top);
    const y0 = out[p - 1], y1 = out[p], y2 = out[p + 1];
    let tau = p;
    const cw = (y0 + y2) / (2 * y1);
    if (cw > -1 && cw < 1) {
      const w = Math.acos(cw);
      tau = p + Math.atan((y2 - y0) / (2 * y1 * Math.sin(w))) / w;
    } else {
      const d = y0 - 2 * y1 + y2;
      if (d) tau = p + (0.5 * (y0 - y2)) / d;
    }
    return { tau, peak: p, clarity: y1 };
  }

  const NAMES = ["A", "A♯", "B", "C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯"];

  class Studio extends Fig {
    constructor(o) {
      super(o);
      this.rand = rng(9);
      this.buf = new Float32Array(N);
      this.nsdf = new Float32Array(MAXLAG);
      this.cents = 0;
      this.phase = 0;
      this.acc = 1;
      this.det = null;
      this.needle = 0;
      this.slider = { label: "Detune", min: -50, max: 50, step: 0.5, value: 0, fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(1) + "¢" };
      this.listen();
    }
    set(v) { this.cents = v; this.slider.value = v; this.auto = false; this.acc = 1; this.fx("pitch", this.freq()); }
    freq() { return 440 * Math.pow(2, this.cents / 1200); }
    listen() {
      const f = this.freq(), b = this.buf;
      let ph = this.phase;
      const dp = (TAU * f) / SR;
      for (let i = 0; i < N; i++) {
        let v = 0;
        for (let k = 0; k < HARM.length; k++) v += HARM[k] * Math.sin((k + 1) * ph);
        b[i] = v * 0.32 + (this.rand() - 0.5) * 0.03;
        ph += dp;
      }
      this.det = mpm(b, this.nsdf);
      if (this.det) {
        this.det.f = SR / this.det.tau;
        this.det.cents = 1200 * Math.log2(this.det.f / 440);
        this.det.played = this.cents;
      }
    }
    step(dt) {
      super.step(dt);
      if (this.auto) { this.cents = Math.round(30 * Math.sin(this.t * 0.45) * 2) / 2; this.slider.value = this.cents; }
      this.phase = (this.phase + dt * 2.2) % TAU;
      this.acc += dt;
      if (this.acc > 1 / 15) { this.acc = 0; this.listen(); }
      if (this.det) this.needle += (this.det.cents - this.needle) * (1 - Math.exp(-dt * 10));
    }
    draw(ctx) {
      const { w, h, s } = this, c = this.color;
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      const A = this.tall ? { x: w * 0.06, y: h * 0.06, w: w * 0.88, h: h * 0.2 } : { x: w * 0.04, y: h * 0.1, w: w * 0.56, h: h * 0.3 };
      const B = this.tall ? { x: w * 0.06, y: h * 0.33, w: w * 0.88, h: h * 0.22 } : { x: w * 0.04, y: h * 0.52, w: w * 0.56, h: h * 0.36 };
      const G = this.tall ? { x: w * 0.5, y: h * 0.8, r: Math.min(w * 0.36, h * 0.17) } : { x: w * 0.81, y: h * 0.56, r: Math.min(w * 0.15, h * 0.3) };

      // the waveform the detector hears
      label(ctx, "what it hears", A.x, A.y - 12 * s, 10 * s, ink(0.45));
      const span = 420;
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      for (let i = 0; i < span; i++) {
        const x = A.x + (i / (span - 1)) * A.w, y = A.y + A.h / 2 - this.buf[i] * A.h * 0.45;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;

      // the NSDF and the lag it picked
      label(ctx, "normalised square difference by lag", B.x, B.y - 12 * s, 10 * s, ink(0.45));
      ctx.strokeStyle = ink(0.12);
      ctx.beginPath();
      ctx.moveTo(B.x, B.y + B.h / 2);
      ctx.lineTo(B.x + B.w, B.y + B.h / 2);
      ctx.stroke();
      ctx.strokeStyle = ink(0.75);
      ctx.beginPath();
      for (let t = 0; t < MAXLAG; t++) {
        const x = B.x + (t / (MAXLAG - 1)) * B.w, y = B.y + B.h / 2 - this.nsdf[t] * B.h * 0.46;
        t ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      if (this.det) {
        const x = B.x + (this.det.tau / (MAXLAG - 1)) * B.w, y = B.y + B.h / 2 - this.det.clarity * B.h * 0.46;
        ctx.strokeStyle = rgba(c, 0.6);
        ctx.setLineDash([3 * s, 3 * s]);
        ctx.beginPath();
        ctx.moveTo(x, B.y + B.h);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, y, 4 * s, 0, TAU);
        ctx.fill();
        label(ctx, "τ = " + this.det.tau.toFixed(2) + " samples", x + 8 * s, B.y + B.h - 8 * s, 10 * s, c);
      }

      // the gauge
      const R = G.r, cx = G.x, cy = G.y;
      const ang = (cents) => Math.PI * 1.5 + (Math.max(-50, Math.min(50, cents)) / 50) * (Math.PI * 0.38);
      ctx.strokeStyle = ink(0.14);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, ang(-50), ang(50));
      ctx.stroke();
      for (let k = -50; k <= 50; k += 10) {
        const a = ang(k), r0 = R * (k % 50 === 0 ? 0.86 : k === 0 ? 0.84 : 0.92);
        ctx.strokeStyle = k === 0 ? ink(0.6) : ink(0.22);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.stroke();
      }
      // what was played: a small mark outside the arc
      const ap = ang(this.cents);
      ctx.fillStyle = ink(0.6);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ap) * R * 1.07, cy + Math.sin(ap) * R * 1.07, 3 * s, 0, TAU);
      ctx.fill();
      // what was heard: the needle
      const an = ang(this.needle);
      ctx.strokeStyle = c;
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(an) * R * 0.98, cy + Math.sin(an) * R * 0.98);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(cx, cy, 4 * s, 0, TAU);
      ctx.fill();
      const d = this.det;
      if (d) {
        const semis = Math.round(12 * Math.log2(d.f / 440)), off = d.cents - semis * 100;
        const name = NAMES[((semis % 12) + 12) % 12] + (4 + Math.floor((semis + 9) / 12));
        label(ctx, name, cx, cy + R * 0.32, 44 * s, INK, "center", 400, SERIF);
        label(ctx, (off >= 0 ? "+" : "") + off.toFixed(1) + "¢", cx, cy + R * 0.32 + 34 * s, 16 * s, c, "center", 600, SANS);
        const err = Math.abs(d.cents - d.played);
        const ly = this.tall ? A.y + A.h + 12 * s : cy + R * 0.32 + 66 * s;
        const lx = this.tall ? A.x : cx, al = this.tall ? "left" : "center";
        if (!this.tall) {
          label(ctx, "played " + sign(d.played) + "   heard " + sign(d.cents, 2), lx, ly, 10.5 * s, ink(0.6), al);
          label(ctx, "off by " + err.toFixed(3) + "¢", lx, ly + 18 * s, 10.5 * s, err < 0.5 ? ink(0.45) : RED, al);
        }
      }
    }
    stats() {
      const d = this.det;
      return [[d ? sign(d.played) : "…", "played"], [d ? sign(d.cents, 2) : "…", "heard"], [d ? Math.abs(d.cents - d.played).toFixed(3) + "¢" : "…", "off by"]];
    }
  }
  function sign(v, k = 1) { return (v >= 0 ? "+" : "") + v.toFixed(k) + "¢"; }

  root.Figs.Studio = Studio;
  root.Figs.Studio.mpm = mpm;
})(window);
