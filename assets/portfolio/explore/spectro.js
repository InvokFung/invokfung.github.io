/*
 * The hero: my name, written as sound. A spectrogram (time across, pitch up, loudness as colour)
 * whose energy spells the name.
 *
 *   hear()   synthesizes that sound, one sine per row of the picture, and redraws the picture
 *            from the audio itself through an AnalyserNode, so what you see is what you hear
 *   sing()   scrolls the microphone in from the right, with strings.js's pitch detector naming the note
 *   pointer  hovering reads out the pitch and time under the cursor and leaves a little energy behind
 *
 * No dependencies. Sound only starts from a click.
 */
(function () {
  "use strict";

  const F_LO = 60, F_HI = 8000, T = 3.6; // log pitch axis, and seconds of sound across the picture
  const LN = Math.log(F_HI / F_LO);
  const rowF = (u) => F_LO * Math.exp(u * LN); // u: 0 at the bottom, 1 at the top
  const fRow = (f) => Math.log(f / F_LO) / LN;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const noteOf = (f) => { const m = 69 + 12 * Math.log2(f / 440), n = Math.round(m); return { name: NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1), cents: (m - n) * 100 }; };
  const hz = (f) => (f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 0 : 2) + " kHz" : Math.round(f) + " Hz");
  const AX = 38, AY = 18; // room for the pitch and time axes

  // any CSS colour to [r, g, b], by painting one pixel (so oklab() and color-mix() work too)
  const pc = document.createElement("canvas"); pc.width = pc.height = 1;
  const probe = pc.getContext("2d", { willReadFrequently: true });
  const rgb = (c) => {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = "#000"; probe.fillStyle = c;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const toHsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  };
  const fromHsl = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  class Spectro {
    constructor(canvas, o = {}) {
      this.cv = canvas; this.o = o;
      this.g = canvas.getContext("2d");
      this.small = document.createElement("canvas"); this.sg = this.small.getContext("2d");
      this.name = o.name || ""; this.text = 1; this.hiss = 1;
      this.mode = "score"; this.head = 0; this.writeT = 0; this.sweepT = 4; this.hover = null; this.raf = 0; this.seen = true; this.motion = true;
      this.audio = null; this.cache = null;
      canvas.addEventListener("pointermove", (e) => this.point(e));
      canvas.addEventListener("pointerdown", (e) => { this.pressed = true; this.point(e); this.press(true); });
      canvas.addEventListener("pointerleave", () => { this.hover = null; this.press(false); this.wake(); });
      window.addEventListener("pointerup", () => this.press(false));
      if ("IntersectionObserver" in window) new IntersectionObserver((en) => { this.seen = en[0].isIntersecting; if (this.seen) this.wake(); }).observe(canvas);
      this.theme();
      this.resize();
    }

    /* ------------------------------------------------------------ layout */
    resize() {
      const w = this.cv.clientWidth, h = this.cv.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      Object.assign(this, { w, h, dpr, iw: w - AX, ih: h - AY });
      const cols = clamp(Math.round(this.iw / 2.3), 150, 560), rows = clamp(Math.round(this.ih / 2.3), 80, 220);
      if (cols !== this.cols || rows !== this.rows) {
        Object.assign(this, { cols, rows });
        this.small.width = cols; this.small.height = rows;
        this.img = this.sg.createImageData(cols, rows);
        this.E = new Float32Array(cols * rows);
        this.trail = new Float32Array(cols * rows);
        this.cache = null;
        this.build(false);
      }
      this.wake();
    }
    theme() {
      const cs = getComputedStyle(this.cv), v = (k) => cs.getPropertyValue(k).trim();
      const bg = rgb(v("--bg") || "#09090b"), acc = rgb(v("--acc") || "#c8ff4a"), fg = rgb(v("--fg") || "#fff"), ink = rgb(v("--acc-ink") || v("--acc"));
      const theme = document.documentElement.dataset.theme;
      this.ink = { fg: v("--fg"), mute: v("--mute"), dim: v("--dim"), line: v("--line2"), acc: v("--acc-ink") || v("--acc") };
      this.mono = getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || "monospace";
      this.serif = getComputedStyle(document.documentElement).getPropertyValue("--serif").trim() || "serif";
      // quiet → loud. Dark themes run from deep violet round the colour wheel to the accent, then
      // towards white (a magma-style map in the accent's hue); paper runs from paper to ink.
      const lut = (this.lut = new Uint8ClampedArray(256 * 3));
      const [ah, as, al] = toHsl(acc);
      for (let i = 0; i < 256; i++) {
        const t = i / 255;
        let c;
        // the quiet end stays close to the page so the noise floor reads as texture, not as a box
        if (theme === "paper") c = t < 0.2 ? mix(bg, ink, (t / 0.2) * 0.1) : t < 0.6 ? mix(bg, ink, 0.1 + ((t - 0.2) / 0.4) * 0.65) : mix(mix(bg, ink, 0.75), fg, (t - 0.6) / 0.4);
        else if (theme === "phosphor") c = t < 0.2 ? mix(bg, [30, 150, 70], (t / 0.2) * 0.15) : t < 0.55 ? mix(bg, [30, 150, 70], 0.15 + ((t - 0.2) / 0.35) * 0.85) : mix([30, 150, 70], [215, 255, 220], (t - 0.55) / 0.45);
        else {
          const at = (u) => { let d = ah - 268; if (d > 180) d -= 360; if (d < -180) d += 360; return fromHsl((268 + d * u + 360) % 360, 0.62 + (Math.max(as, 0.8) - 0.62) * u, 0.1 + (Math.min(al, 0.62) - 0.1) * Math.pow(u, 0.85)); };
          c = t < 0.2 ? mix(bg, at(0), t / 0.2) : t < 0.86 ? at((t - 0.2) / 0.66) : mix(acc, [255, 255, 255], ((t - 0.86) / 0.14) * 0.8);
        }
        lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2];
      }
      this.wake();
    }

    /* -------------------------------------------------------- the picture */
    setName(name, animate = true) { this.name = name; this.cache = null; this.build(animate); }
    // coffee: none and the name fades out, plenty and the noise floor gets loud
    setCoffee(n) { this.text = n === 0 ? 0.38 : 1; this.hiss = 0.75 + n * 0.07; this.build(false); }
    build(animate) {
      if (!this.cols) return;
      const { cols, rows } = this, n = cols * rows;
      const c = document.createElement("canvas"); c.width = cols; c.height = rows;
      const g = c.getContext("2d");
      const ws = this.name.trim().split(/\s+/), two = cols / rows < 2.15 && ws.length > 1, half = Math.ceil(ws.length / 2);
      const lines = two ? [ws.slice(0, half).join(" "), ws.slice(half).join(" ")] : [ws.join(" ")];
      // the band the letters fill: about 330 Hz to 4.6 kHz on one line, a little wider on two
      const top = Math.round((1 - (two ? 0.93 : 0.89)) * rows), bot = Math.round((1 - (two ? 0.27 : 0.33)) * rows);
      g.fillStyle = "#fff"; g.textBaseline = "alphabetic"; g.textAlign = "center";
      let px = 100;
      g.font = `400 ${px}px ${this.serif}`;
      const m = lines.map((s) => g.measureText(s || " "));
      const asc = Math.max(...m.map((x) => x.actualBoundingBoxAscent || px * 0.7)), desc = Math.max(...m.map((x) => x.actualBoundingBoxDescent || px * 0.2));
      const lineH = asc + desc, gap = lineH * 0.08;
      const wide = Math.max(...m.map((x) => x.width)), tall = lineH * lines.length + gap * (lines.length - 1);
      const k = Math.min((cols * 0.94) / wide, (bot - top) / tall);
      px *= k;
      g.font = `400 ${px}px ${this.serif}`;
      lines.forEach((s, i) => g.fillText(s, cols / 2, top + asc * k + i * (lineH + gap) * k));
      const a = g.getImageData(0, 0, cols, rows).data;
      const mask = new Float32Array(n);
      for (let i = 0; i < n; i++) mask[i] = a[i * 4 + 3] / 255;
      this.mask = mask;
      // what a recording of it would look like: a noise floor that rises towards the bass, a little
      // mains hum, striations in the letters and a reverb tail smeared to the right of every stroke
      const S = (this.S = new Float32Array(n)), F = (this.F = new Float32Array(n)), L = (this.L = new Float32Array(n));
      const hum = [100, 150, 200, 300].map((f) => Math.round((1 - fRow(f)) * (rows - 1)));
      this.base = Array.from({ length: rows }, (_, r) => (0.035 + 0.11 * Math.pow(r / (rows - 1), 1.6)) * this.hiss + (hum.includes(r) ? 0.085 : 0));
      this.humRow = Array.from({ length: rows }, (_, r) => hum.includes(r));
      for (let r = 0; r < rows; r++) {
        let tail = 0;
        for (let x = 0; x < cols; x++) {
          const i = r * cols + x, mk = mask[i];
          F[i] = this.floor(r);
          tail = Math.max(mk, tail * 0.82);
          const tex = (0.8 + 0.2 * Math.sin(r * 1.9 + x * 0.04)) * (0.9 + Math.random() * 0.1);
          L[i] = Math.max(mk * 0.95 * tex, tail * 0.42) * this.text;
          S[i] = Math.max(F[i], L[i]);
        }
      }
      if (animate && this.motion) { this.mode = "write"; this.writeT = 0; this.head = 0; }
      else if (this.mode === "score") this.E.set(S); // a write in progress just carries on with the new picture
      this.wake();
    }

    // the noise floor at a row: louder towards the bass, plus a little mains hum
    floor(r) { const b = this.base[r]; return this.humRow[r] ? b : b * (0.55 + Math.random() * 0.6); }

    /* --------------------------------------------------------- the frames */
    wake() { if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t)); }
    frame(now) {
      this.raf = 0;
      const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 1 / 60);
      this.last = now;
      const { cols, rows, E, S, F } = this;
      if (!cols) return;
      let again = !!this.hover || this.trailOn;
      if (this.mode === "write") {
        this.writeT += dt;
        const head = Math.min(cols, Math.floor((this.writeT / 1.5) * cols));
        for (let r = 0; r < rows; r++) for (let x = 0; x < cols; x++) { const i = r * cols + x; E[i] = x < head ? S[i] : F[i] * 0.55; }
        this.head = head;
        if (head >= cols) { this.mode = "score"; this.sweepT = 0; }
        again = true;
      } else if (this.mode === "score" && this.motion) {
        // a slow sweep keeps it breathing: the noise floor behind the sweep line is re-recorded
        this.sweepT += dt;
        const cyc = 9, pos = this.sweepT % cyc;
        if (pos < 3) {
          const head = Math.floor((pos / 3) * cols), from = Math.max(0, this.head > head ? 0 : this.head);
          for (let x = from; x < head; x++) for (let r = 0; r < rows; r++) {
            const i = r * cols + x;
            E[i] = Math.max(this.floor(r), this.L[i] * (0.94 + Math.random() * 0.06));
          }
          this.head = head;
        } else this.head = -1;
        again = this.seen;
      } else if (this.mode === "play") again = this.playFrame() || again;
      else if (this.mode === "live") again = this.liveFrame(dt) || again;
      if (this.trailOn) {
        let any = false;
        for (let i = 0; i < this.trail.length; i++) if (this.trail[i] > 0.01) { this.trail[i] *= 0.9; any = true; } else this.trail[i] = 0;
        this.trailOn = any;
      }
      this.paint();
      if (again && this.seen) this.wake();
    }
    paint() {
      const { g, cols, rows, E, img, lut, trail } = this, d = img.data;
      for (let i = 0, n = cols * rows; i < n; i++) {
        const v = clamp(Math.max(E[i], trail[i]), 0, 1), k = (v * 255) | 0;
        d[i * 4] = lut[k * 3]; d[i * 4 + 1] = lut[k * 3 + 1]; d[i * 4 + 2] = lut[k * 3 + 2]; d[i * 4 + 3] = 255;
      }
      this.sg.putImageData(img, 0, 0);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, this.w, this.h);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      g.drawImage(this.small, AX, 0, this.iw, this.ih);
      this.axes(g);
    }
    axes(g) {
      const { iw, ih, ink } = this;
      g.font = `400 9.5px ${this.mono}`; g.textBaseline = "middle"; g.textAlign = "right"; g.fillStyle = ink.mute; g.strokeStyle = ink.line; g.lineWidth = 1;
      [125, 250, 500, 1000, 2000, 4000].forEach((f) => {
        const y = (1 - fRow(f)) * ih;
        g.fillText(f >= 1000 ? f / 1000 + "k" : String(f), AX - 8, y);
        g.beginPath(); g.moveTo(AX - 5, y); g.lineTo(AX - 1, y); g.stroke();
      });
      g.textAlign = "center"; g.textBaseline = "alphabetic";
      for (let s = 0; s <= 3; s++) { const x = AX + (s / T) * iw; g.fillText(s + "s", Math.max(AX + 8, x), ih + 14); g.beginPath(); g.moveTo(x, ih + 1); g.lineTo(x, ih + 4); g.stroke(); }
      g.textAlign = "right"; g.fillText("Hz", AX - 8, ih + 14);
      // the playhead
      if (this.head >= 0 && this.head < this.cols && this.mode !== "live") {
        const x = AX + (this.head / this.cols) * iw;
        g.strokeStyle = ink.fg; g.globalAlpha = this.mode === "score" ? 0.35 : 0.8;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, ih); g.stroke(); g.globalAlpha = 1;
      }
      // the note being sung
      if (this.mode === "live" && this.heard) {
        const y = (1 - fRow(this.heard.f)) * ih;
        g.strokeStyle = ink.acc; g.fillStyle = ink.acc; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(AX + iw - 26, y); g.lineTo(AX + iw, y); g.stroke();
        g.font = `600 11px ${this.mono}`; g.textAlign = "right"; g.textBaseline = "bottom";
        g.fillText(this.heard.label, AX + iw - 4, y - 4);
      }
      // the readout under the pointer
      if (this.hover) {
        const { x, y } = this.hover;
        g.strokeStyle = ink.fg; g.globalAlpha = 0.35; g.setLineDash([2, 4]);
        g.beginPath(); g.moveTo(AX, y); g.lineTo(AX + iw, y); g.moveTo(x, 0); g.lineTo(x, ih); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
        const f = rowF(1 - y / ih), nt = noteOf(f), c = Math.round(nt.cents);
        const s = `${hz(f)} · ${nt.name} ${c >= 0 ? "+" : "−"}${Math.abs(c)}¢ · ${(((x - AX) / iw) * T).toFixed(2)} s`;
        g.font = `500 11px ${this.mono}`;
        const tw = g.measureText(s).width + 14, bx = x + 12 + tw > AX + iw ? x - 12 - tw : x + 12, by = y < 30 ? y + 10 : y - 30;
        g.fillStyle = "rgba(0,0,0,.55)"; g.beginPath(); g.roundRect(bx, by, tw, 20, 5); g.fill();
        g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(s, bx + 7, by + 10.5);
      }
    }

    /* ------------------------------------------------------------ pointer */
    point(e) {
      const r = this.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < AX || y > this.ih || e.pointerType === "touch" && !this.pressed) { this.hover = null; return; }
      this.hover = { x, y };
      // leave a little energy where the pointer has been
      const c = Math.round(((x - AX) / this.iw) * (this.cols - 1)), rr = Math.round((y / this.ih) * (this.rows - 1));
      for (let dy = -3; dy <= 3; dy++) for (let dx = -2; dx <= 2; dx++) {
        const cx = c + dx, cy = rr + dy;
        if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) continue;
        const i = cy * this.cols + cx;
        this.trail[i] = Math.max(this.trail[i], 0.85 * Math.exp(-(dx * dx) / 3 - (dy * dy) / 5));
      }
      this.trailOn = true;
      if (this.tone) this.tone.o.frequency.setTargetAtTime(rowF(1 - y / this.ih), this.tone.ctx.currentTime, 0.02);
      this.wake();
    }
    // with sound on, holding the pointer down on the picture plays the pitch under it
    press(on) {
      this.pressed = on;
      const S = window.Strings;
      if (on && !this.tone && S && S.Sound.on && this.hover) {
        const ctx = S.Sound.unlock();
        if (!ctx) return;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = rowF(1 - this.hover.y / this.ih);
        g.gain.value = 0; g.gain.setTargetAtTime(0.12, ctx.currentTime, 0.03);
        o.connect(g); g.connect(ctx.destination); o.start();
        this.tone = { o, g, ctx };
      } else if (!on && this.tone) {
        const { o, g, ctx } = this.tone;
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.04); o.stop(ctx.currentTime + 0.3);
        this.tone = null;
      }
    }

    /* -------------------------------------------------------- hear it */
    // one sine per row of the picture, loud where the letters are; the analyser draws it back
    synth(sr) {
      if (this.cache && this.cache.sr === sr) return this.cache.y;
      const { cols, rows, mask } = this, n = Math.floor(T * sr), y = new Float32Array(n), B = 64;
      const env = new Float32Array(Math.ceil(n / B) + 1);
      for (let r = 0; r < rows; r++) {
        const f = rowF(1 - r / (rows - 1));
        if (f > sr / 2 - 200) continue;
        let peak = 0;
        for (let x = 0; x < cols; x++) peak = Math.max(peak, mask[r * cols + x]);
        if (peak < 0.04) continue;
        for (let b = 0; b < env.length; b++) { const p = ((b * B) / n) * cols - 0.5, x0 = clamp(Math.floor(p), 0, cols - 1), x1 = Math.min(cols - 1, x0 + 1), k = clamp(p - x0, 0, 1); env[b] = mask[r * cols + x0] * (1 - k) + mask[r * cols + x1] * k; }
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
      an.fftSize = 2048; an.smoothingTimeConstant = 0; an.minDecibels = -110; an.maxDecibels = -20;
      src.buffer = buf; src.connect(g); g.connect(ctx.destination); src.connect(an);
      g.gain.value = 0.9;
      const t0 = ctx.currentTime + 0.05;
      src.start(t0);
      this.audio = { ctx, src, an, t0, spec: new Float32Array(an.frequencyBinCount), col: 0 };
      // wipe to the noise floor, then let the sound write the picture back
      this.E.set(this.F.map((v) => v * 0.55));
      this.mode = "play"; this.head = 0;
      src.onended = () => { if (this.audio && this.audio.src === src) { this.audio = null; this.mode = "score"; this.head = -1; this.sweepT = 3; if (this.o.onState) this.o.onState("idle"); } };
      if (this.o.onState) this.o.onState("playing");
      this.wake();
      return true;
    }
    column(x, spec, sr, fill) {
      const { cols, rows, E, F } = this, bins = spec.length, nyq = sr / 2;
      for (let r = 0; r < rows; r++) {
        const f = rowF(1 - r / (rows - 1)), p = (f / nyq) * bins, i0 = Math.min(bins - 2, Math.floor(p)), k = p - i0;
        const db = spec[i0] * (1 - k) + spec[i0 + 1] * k, v = clamp((db + 100) / 62, 0, 1);
        E[r * cols + x] = Math.max(fill ? F[r * cols + x] * 0.6 : 0, Math.pow(v, 1.15));
      }
    }
    playFrame() {
      const A = this.audio;
      if (!A || A.an === undefined) return false;
      const el = A.ctx.currentTime - A.t0;
      if (el < 0) return true;
      A.an.getFloatFrequencyData(A.spec);
      const head = Math.min(this.cols, Math.floor((el / T) * this.cols));
      for (let x = A.col; x < head; x++) this.column(x, A.spec, A.ctx.sampleRate, true);
      A.col = Math.max(A.col, head);
      this.head = head;
      return true;
    }

    /* ----------------------------------------------------------- sing */
    async sing(on) {
      const S = window.Strings;
      if (!on) { this.stopAudio(); this.setName(this.name, true); if (this.o.onState) this.o.onState("idle"); return true; }
      const ctx = S && S.Sound.unlock();
      if (!ctx || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "unsupported";
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        this.stopAudio();
        const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
        ctx.createMediaStreamSource(stream).connect(an);
        this.audio = { ctx, an, stream, spec: new Float32Array(an.frequencyBinCount), td: new Float32Array(an.fftSize), acc: 0 };
        this.mode = "live"; this.heard = null;
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
      A.acc += dt * (cols / 6); // the whole width in six seconds
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
        this.heard = { f: p.f, label: `${nt.name} ${c >= 0 ? "+" : "−"}${Math.abs(c)}¢` };
        if (this.o.onRead) this.o.onRead(this.heard.label);
      } else if (this.heard && this.o.onRead) { this.heard = null; this.o.onRead(null); }
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
      const was = this.state;
      if (was === "idle") return;
      this.stopAudio();
      if (was === "listening") this.setName(this.name, true);
      else { this.mode = "score"; this.head = -1; this.sweepT = 3; }
      if (this.o.onState) this.o.onState("idle");
    }
    setMotion(on) { this.motion = on; if (!on && this.mode === "write") { this.mode = "score"; this.E.set(this.S); this.head = -1; } this.wake(); }
  }

  window.Spectro = Spectro;
})();
