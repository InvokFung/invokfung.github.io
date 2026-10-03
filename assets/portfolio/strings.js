/*
 * The instrument under the page. app.js turns every line on the page into a string; this file
 * holds the parts that don't know about the page:
 *
 *   Wave     a damped 1D wave equation on a row of points with fixed ends (one per string)
 *   Sound    Karplus-Strong plucked strings through Web Audio, silent until the visitor turns it on
 *   pitch()  the McLeod pitch method, for listen mode: hum or play a note and its string rings
 *   note()   frequency → note name, octave and cents
 *
 * No dependencies, no build.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ Wave */
  // u is the sideways displacement of each point, v its velocity. Symplectic Euler is stable for
  // c2 <= 1; a few sub-steps per frame make the waves travel fast enough to read as a string.
  class Wave {
    constructor(n, o = {}) {
      this.n = n;
      this.u = new Float32Array(n);
      this.v = new Float32Array(n);
      this.c2 = o.c2 != null ? o.c2 : 0.45;
      this.damp = o.damp != null ? o.damp : 0.9985;
      this.sub = o.sub || 3;
      this.awake = false;
      this.held = null;
    }
    // a pluck: the whole string pulled into a triangle with its apex at k, then let go
    tri(k, a) {
      const n = this.n, u = this.u;
      k = Math.min(n - 2, Math.max(1, k));
      for (let i = 1; i < n - 1; i++) u[i] = a * (i <= k ? i / k : (n - 1 - i) / (n - 1 - k));
      this.v.fill(0);
      this.awake = true;
    }
    // a local kick, for long strings: it splits into two pulses that run away from k
    bump(k, a, w) {
      const n = this.n, u = this.u, r = Math.ceil(w * 3);
      for (let i = Math.max(1, k - r); i < Math.min(n - 1, k + r + 1); i++) { const x = (i - k) / w; u[i] += a * Math.exp(-x * x); }
      this.awake = true;
    }
    step() {
      const { n, u, v, c2, damp } = this;
      for (let s = 0; s < this.sub; s++) {
        for (let i = 1; i < n - 1; i++) v[i] = (v[i] + c2 * (u[i - 1] + u[i + 1] - 2 * u[i])) * damp;
        for (let i = 1; i < n - 1; i++) u[i] += v[i];
      }
      let e = 0;
      for (let i = 1; i < n - 1; i++) { const a = Math.abs(u[i]); if (a > e) e = a; }
      if (e < 0.05) { u.fill(0); v.fill(0); this.awake = false; e = 0; }
      return e;
    }
  }

  /* ----------------------------------------------------------------- Sound */
  // Karplus-Strong: a burst of noise circulating in a delay line one period long, averaged on
  // every pass so the high partials die first. A first-order allpass supplies the fractional
  // part of the period, so the strings are in tune to well under a cent.
  const Sound = {
    ctx: null, out: null, on: false, voices: 0, cache: new Map(),
    unlock() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!this.ctx) {
        const ctx = (this.ctx = new AC());
        const body = ctx.createBiquadFilter(); body.type = "peaking"; body.frequency.value = 460; body.Q.value = 1.1; body.gain.value = 4;
        const air = ctx.createBiquadFilter(); air.type = "peaking"; air.frequency.value = 2800; air.Q.value = 1.4; air.gain.value = 2.5;
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
        this.out = ctx.createGain(); this.out.gain.value = 0.8;
        this.out.connect(body); body.connect(air); air.connect(comp); comp.connect(ctx.destination);
      }
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return this.ctx;
    },
    buffer(f, ring) {
      const key = Math.round(f * 100) + (ring ? "r" : "");
      if (this.cache.has(key)) return this.cache.get(key);
      const sr = this.ctx.sampleRate, len = Math.floor(sr * (ring ? 2.8 : 1.7));
      const b = this.ctx.createBuffer(1, len, sr), y = b.getChannelData(0);
      const decay = ring ? 0.9986 : 0.9955;
      const period = sr / f - 0.5, P = Math.floor(period), frac = period - P, C = (1 - frac) / (1 + frac);
      let lp = 0;
      for (let i = 0; i <= P; i++) { lp = lp * 0.45 + (Math.random() * 2 - 1) * 0.55; y[i] = lp; }
      let x1 = 0, y1 = 0;
      for (let i = P + 1; i < len; i++) {
        const avg = 0.5 * (y[i - P] + y[i - P - 1]);
        const ap = C * avg + x1 - C * y1;
        x1 = avg; y1 = ap;
        y[i] = decay * ap;
      }
      const fade = Math.floor(sr * 0.25);
      for (let i = 0; i < fade; i++) y[len - 1 - i] *= i / fade;
      this.cache.set(key, b);
      return b;
    },
    pluck(f, vel = 0.6, pan = 0, o = {}) {
      if (!this.on || !this.ctx || this.ctx.state !== "running" || this.voices > 16) return;
      const ctx = this.ctx, src = ctx.createBufferSource();
      src.buffer = this.buffer(f, o.ring);
      const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 800 + 5200 * vel;
      const g = ctx.createGain(); g.gain.value = (0.06 + 0.3 * vel) * (o.gain != null ? o.gain : 1);
      src.connect(tone); tone.connect(g);
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.out); }
      else g.connect(this.out);
      this.voices++;
      src.onended = () => { this.voices--; };
      src.start();
    }
  };

  /* ----------------------------------------------------------------- pitch */
  // McLeod & Wyvill (2005). The normalised square difference n(τ) = 2·r(τ) / m(τ) is 1 where the
  // signal repeats exactly. Take the highest point of each positive lobe ("key maxima"), then the
  // first one within 93% of the tallest: that choice is what avoids octave-down errors.
  function pitch(x, sr, lo = 70, hi = 1400) {
    const W = x.length;
    let e = 0;
    for (let i = 0; i < W; i++) e += x[i] * x[i];
    const rms = Math.sqrt(e / W);
    if (rms < 0.008) return null;
    const maxLag = Math.min(W >> 1, Math.ceil(sr / lo)), minLag = Math.floor(sr / hi);
    const nsdf = new Float32Array(maxLag + 2);
    let m = 2 * e;
    for (let t = 0; t <= maxLag + 1; t++) {
      if (t > 0) m -= x[W - t] * x[W - t] + x[t - 1] * x[t - 1];
      let r = 0;
      for (let j = 0, J = W - t; j < J; j++) r += x[j] * x[j + t];
      nsdf[t] = m > 0 ? (2 * r) / m : 0;
    }
    const peaks = [];
    let pos = false, cur = -1;
    for (let t = 1; t <= maxLag; t++) {
      if (nsdf[t - 1] <= 0 && nsdf[t] > 0) { pos = true; cur = -1; }
      else if (nsdf[t - 1] > 0 && nsdf[t] <= 0) { if (pos && cur > 0) peaks.push(cur); pos = false; }
      if (pos && t >= minLag && nsdf[t] >= nsdf[t - 1] && nsdf[t] >= nsdf[t + 1] && (cur < 0 || nsdf[t] > nsdf[cur])) cur = t;
    }
    if (pos && cur > 0) peaks.push(cur);
    if (!peaks.length) return null;
    let top = 0;
    for (const p of peaks) if (nsdf[p] > top) top = nsdf[p];
    const p = peaks.find((q) => nsdf[q] >= 0.93 * top);
    const a = nsdf[p - 1], b = nsdf[p], c = nsdf[p + 1], den = a - 2 * b + c;
    const tau = p + (den ? (0.5 * (a - c)) / den : 0);
    if (b < 0.8) return null;
    return { f: sr / tau, clarity: b, rms };
  }

  const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  function note(f, a4 = 440) {
    const midi = 69 + 12 * Math.log2(f / a4), n = Math.round(midi);
    return { midi, name: NAMES[((n % 12) + 12) % 12], octave: Math.floor(n / 12) - 1, cents: (midi - n) * 100 };
  }

  window.Strings = { Wave, Sound, pitch, note };
})();
