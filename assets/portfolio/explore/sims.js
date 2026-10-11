/*
 * Live sketches for the work tiles. Each flagship's question gets a small model you can poke:
 * take a region down in front of Relay, break a service for Tracewise, merge three messy exports
 * with Onboard, send a technician home on Dispatch's day, search the notes Atlas indexes, play a
 * note into Studio's pitch detector, scrub the layers Layerline slices. (Arena's sketch is kept
 * for the record; TripleFind Arena is no longer a tile.)
 *
 * They are sketches of each idea, small enough to run seven at once. The measured numbers on the
 * tiles come from each project's own benchmark, not from these. No dependencies.
 */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const IDLE = 12; // seconds after the last touch before a tile goes back to demoing itself
  const box = (g, b, r = 6) => { g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, r); };
  const inBox = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  // a cubic with flat ends from p to q, as points
  const bez = (p, q, n = 18) => {
    const dx = (q[0] - p[0]) * 0.5, out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
      out.push([a * p[0] + b * (p[0] + dx) + c * (q[0] - dx) + d * q[0], a * p[1] + b * p[1] + c * q[1] + d * q[1]]);
    }
    return out;
  };
  // walk a polyline by distance
  const walk = (pts) => { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return L; };
  const at = (pts, L, d) => {
    if (d <= 0) return pts[0];
    let i = 1;
    while (i < L.length - 1 && L[i] < d) i++;
    const k = clamp((d - L[i - 1]) / (L[i] - L[i - 1] || 1), 0, 1);
    return [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)];
  };
  const fit = (g, s, w) => { if (g.measureText(s).width <= w) return s; while (s.length > 1 && g.measureText(s + "…").width > w) s = s.slice(0, -1); return s + "…"; };

  const all = [];
  let motion = true, raf = 0, last = 0;

  class Sim {
    constructor(host, o = {}) {
      this.host = host; this.o = o;
      this.cv = host.querySelector("canvas.sim");
      this.g = this.cv ? this.cv.getContext("2d") : null;
      this.ctl = host.querySelector(".sim-ctl");
      this.out = host.querySelector(".sim-read");
      this.t = 0; this.touchT = -1e9; this.seen = false; this.w = 0; this.h = 0; this.dpr = 1; this.autoOn = false;
      if (this.cv) {
        const xy = (e) => { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
        this.cv.addEventListener("pointermove", (e) => { if (this.move) { this.move(...xy(e), e); this.kick(); } });
        this.cv.addEventListener("pointerdown", (e) => { if (this.down) { this.touch(); this.down(...xy(e), e); this.kick(); } });
        this.cv.addEventListener("pointerleave", () => { if (this.leave) { this.leave(); this.kick(); } });
      }
      this.theme();
    }
    get idle() { return this.t - this.touchT > IDLE; }
    touch() { this.touchT = this.t; this.autoOn = false; }
    theme() {
      const cs = getComputedStyle(this.host), v = (k) => cs.getPropertyValue(k).trim();
      this.C = { c: v("--c") || "#c8ff4a", fg: v("--fg"), fg2: v("--fg2"), mute: v("--mute"), dim: v("--dim"), line: v("--line2"), bg: v("--bg"), bg2: v("--bg2"), bad: v("--bad") || "#ff5a5f", warn: v("--warn") || "#ffcf70" };
      this.mono = getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || "monospace";
      this.serif = getComputedStyle(document.documentElement).getPropertyValue("--serif").trim() || "serif";
    }
    font(px, w = 500) { return `${w} ${px}px ${this.mono}`; }
    size() {
      if (!this.cv) return;
      const w = this.cv.clientWidth, h = this.cv.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
      this.dpr = dpr; this.w = w; this.h = h;
      if (this.layout) this.layout();
    }
    btn(label, fn, cls = "") {
      const b = document.createElement("button");
      b.type = "button"; b.className = "sim-btn" + (cls ? " " + cls : ""); b.textContent = label;
      b.addEventListener("click", () => { this.touch(); fn(b); this.kick(); });
      this.ctl.appendChild(b);
      return b;
    }
    say(html) { if (this.out && this.out._h !== html) { this.out.innerHTML = html; this.out._h = html; } }
    // with motion off (or off screen) a change still shows: run the model forward, then draw once
    kick() {
      if (motion && raf) return;
      if (!motion && this.step) for (let i = 0; i < 90; i++) { this.t += 1 / 30; this.step(1 / 30); }
      this.paint();
    }
    paint() {
      if (!this.g || !this.w) return;
      const g = this.g;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, this.w, this.h);
      g.lineCap = "round"; g.lineJoin = "round"; g.globalAlpha = 1; g.setLineDash([]);
      this.draw(g);
      g.globalAlpha = 1;
    }
    tick(dt) {
      this.t += dt;
      if (this.idle && this.auto) { if (!this.autoOn) { this.autoOn = true; this.clock = 0; this.reset && this.reset(); } this.clock += dt; this.auto(dt); }
      if (this.step) this.step(dt);
      this.paint();
    }
  }

  /* ---------------------------------------------------------------- Relay */
  // Requests leave the app, pass Relay's nine stages and reach a region. Take us-east down: with
  // Relay on, the first calls time out and retry on eu-west, then the breaker opens and traffic
  // goes straight there. Switch Relay off and the same outage simply fails.
  class Relay extends Sim {
    init() {
      this.dn = false; this.on = true; this.reqs = []; this.marks = []; this.spawn = 0; this.log = [];
      this.tk = new Float32Array(9); this.flash = [0, 0, 0]; this.br = { open: false, fails: 0, probeAt: 0 };
      this.bDown = this.btn("take down us-east", () => this.setDown(!this.dn), "warn");
      this.bOn = this.btn("relay: on", () => this.setOn(!this.on), "tog on");
    }
    reset() { this.setDown(false); this.setOn(true); this.br.open = false; this.br.fails = 0; }
    setDown(d) {
      this.dn = d;
      this.bDown.textContent = d ? "bring us-east back" : "take down us-east";
      this.bDown.classList.toggle("on", d);
      if (!d) this.br.probeAt = this.t + 1.2;
    }
    setOn(on) { this.on = on; this.bOn.textContent = on ? "relay: on" : "relay: off"; this.bOn.classList.toggle("on", on); }
    layout() {
      const { w, h } = this, m = 4, aw = clamp(w * 0.11, 40, 58), pw = clamp(w * 0.2, 84, 108);
      this.A = { x: m, y: h / 2 - 15, w: aw, h: 30 };
      this.G = { x: aw + m + w * 0.09, y: h * 0.14, w: w * 0.3, h: h * 0.72 };
      this.P = ["us-east", "eu-west", "ap-south"].map((n, i) => ({ n, x: w - m - pw, y: h * (0.2 + 0.3 * i) - 14, w: pw, h: 28 }));
      this.reqs = [];
    }
    pin(i) { const p = this.P[i]; return [p.x, p.y + p.h / 2]; }
    send() {
      const { A, G } = this, a = [A.x + A.w, A.y + A.h / 2];
      if (!this.on) {
        const pts = bez(a, this.pin(0), 26);
        return this.reqs.push({ pts, L: walk(pts), d: 0, v: 300, to: 0, cut: this.dn ? 0.86 : 1, via: false });
      }
      const gi = [G.x, G.y + G.h / 2], go = [G.x + G.w, G.y + G.h / 2];
      let to = 0;
      if (this.br.open) {
        to = 1;
        if (!this.dn && this.t > this.br.probeAt) { to = 0; this.br.probeAt = this.t + 1; }
      }
      const tail = bez(go, this.pin(to), 20);
      const fail = to === 0 && this.dn;
      const pts = [a, gi, go].concat(fail ? tail.slice(0, 14) : tail);
      this.reqs.push({ pts, L: walk(pts), d: 0, v: 260, to, cut: 1, via: true, fail, gx: [gi[0], go[0]] });
    }
    done(ok) { this.log.push(ok ? 1 : 0); if (this.log.length > 60) this.log.shift(); }
    step(dt) {
      if (!this.w) return;
      this.spawn -= dt;
      if (this.spawn <= 0) { this.spawn = 0.17; this.send(); }
      for (let i = 0; i < 9; i++) this.tk[i] = Math.max(0, this.tk[i] - dt * 2.5);
      for (let i = 0; i < 3; i++) this.flash[i] = Math.max(0, this.flash[i] - dt * 3);
      this.marks = this.marks.filter((m) => this.t - m.t < 0.8);
      const G = this.G;
      this.reqs = this.reqs.filter((r) => {
        r.d += r.v * dt;
        const end = r.L[r.L.length - 1] * r.cut;
        if (r.via && !r.retry) {
          const x = at(r.pts, r.L, r.d)[0];
          if (x > G.x && x < G.x + G.w) this.tk[clamp(Math.floor(((x - G.x) / G.w) * 10) - 1, 0, 8)] = 1;
        }
        if (r.d < end) return true;
        const p = at(r.pts, r.L, end);
        if (r.cut < 1) { this.marks.push({ x: p[0], y: p[1], t: this.t }); this.done(false); return false; }
        if (r.fail) {
          // timed out on the dead region: retry on eu-west, and count it against the breaker
          this.marks.push({ x: p[0], y: p[1], t: this.t });
          if (++this.br.fails >= 3) { this.br.open = true; this.br.probeAt = this.t + 1.2; }
          const pts = bez(p, this.pin(1), 14);
          Object.assign(r, { pts, L: walk(pts), d: 0, fail: false, retry: true, to: 1 });
          return true;
        }
        this.flash[r.to] = 1;
        if (r.to === 0 && this.br.open && !this.dn) { this.br.open = false; this.br.fails = 0; }
        this.done(true);
        return false;
      });
      const ok = this.log.length ? (this.log.reduce((a, b) => a + b, 0) / this.log.length) * 100 : 100;
      const pct = ok >= 99.95 ? "100%" : ok.toFixed(1) + "%";
      this.say(`success <b class="${ok < 95 ? "bad" : ""}">${pct}</b> · ${!this.on ? (this.dn ? "no retries, no fallback" : "straight to the provider") : this.br.open ? `breaker <b class="bad">open</b>, routing to eu-west` : this.dn ? "retrying on eu-west" : "breaker closed"}`);
    }
    auto() {
      const T = this.clock;
      if (T > 2 && T < 2.1 && !this.dn) this.setDown(true);
      if (T > 7.5 && T < 7.6 && this.on) this.setOn(false);
      if (T > 11.5 && T < 11.6 && !this.on) this.setOn(true);
      if (T > 13.5 && T < 13.6 && this.dn) this.setDown(false);
      if (T > 17) this.clock = 0;
    }
    down(x, y) { if (inBox(this.P[0], x, y)) this.setDown(!this.dn); else if (inBox(this.G, x, y)) this.setOn(!this.on); }
    move(x, y) { this.cv.style.cursor = inBox(this.P[0], x, y) || inBox(this.G, x, y) ? "pointer" : ""; }
    draw(g) {
      const { C, A, G, P } = this;
      g.font = this.font(this.w < 420 ? 9.5 : 10.5);
      g.textBaseline = "middle";
      // wiring
      g.strokeStyle = C.line; g.lineWidth = 1;
      const a = [A.x + A.w, A.y + A.h / 2], gi = [G.x, G.y + G.h / 2], go = [G.x + G.w, G.y + G.h / 2];
      g.globalAlpha = this.on ? 0.8 : 0.3;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(gi[0], gi[1]); g.stroke();
      for (let i = 0; i < 3; i++) { const p = bez(go, this.pin(i)); g.beginPath(); p.forEach((q, k) => (k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); }
      if (!this.on) { g.globalAlpha = 0.8; const p = bez(a, this.pin(0), 26); g.beginPath(); p.forEach((q, k) => (k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); }
      // the gateway and its stages
      g.globalAlpha = this.on ? 1 : 0.4;
      g.fillStyle = C.bg2; box(g, G, 10); g.fill();
      g.strokeStyle = this.on ? C.c : C.line; g.lineWidth = this.on ? 1.4 : 1; g.setLineDash(this.on ? [] : [4, 4]); g.stroke(); g.setLineDash([]);
      g.fillStyle = this.on ? C.fg : C.mute; g.textAlign = "left";
      g.fillText(this.on ? "relay" : "relay (off)", G.x + 10, G.y + 14);
      // the corner says what the stages are doing: just running, or holding the breaker open
      const brk = this.on && this.br.open;
      g.globalAlpha = brk ? 1 : g.globalAlpha; g.fillStyle = brk ? C.bad : C.mute; g.textAlign = "right";
      g.fillText(fit(g, brk ? "breaker open" : "9 stages", G.w - 14), G.x + G.w - 8, G.y + G.h - 12);
      for (let i = 0; i < 9; i++) {
        const x = G.x + (G.w * (i + 1)) / 10;
        g.globalAlpha = (this.on ? 1 : 0.35) * (0.22 + 0.78 * this.tk[i]);
        g.strokeStyle = C.c; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, G.y + 28); g.lineTo(x, G.y + G.h - 26); g.stroke();
      }
      // the app and the regions
      g.globalAlpha = 1; g.lineWidth = 1; g.textAlign = "center";
      g.fillStyle = C.bg2; box(g, A); g.fill(); g.strokeStyle = C.line; g.stroke();
      g.fillStyle = C.fg2; g.fillText("app", A.x + A.w / 2, A.y + A.h / 2);
      P.forEach((p, i) => {
        const dead = i === 0 && this.dn;
        g.fillStyle = C.bg2; box(g, p); g.fill();
        g.strokeStyle = dead ? C.bad : this.flash[i] > 0 ? C.c : C.line;
        g.lineWidth = dead || this.flash[i] > 0.3 ? 1.5 : 1;
        g.setLineDash(dead ? [3, 3] : []); g.stroke(); g.setLineDash([]);
        g.fillStyle = dead ? C.bad : C.fg2; g.textAlign = "left";
        g.fillText(fit(g, dead ? p.n + " ✕" : p.n, p.w - 24), p.x + 18, p.y + p.h / 2);
        g.fillStyle = dead ? C.bad : C.c; g.globalAlpha = dead ? 1 : 0.5 + 0.5 * this.flash[i];
        g.beginPath(); g.arc(p.x + 9, p.y + p.h / 2, 3, 0, TAU); g.fill(); g.globalAlpha = 1;
      });
      // requests in flight, and where they died
      for (const r of this.reqs) {
        const p = at(r.pts, r.L, r.d), dying = r.cut < 1 && r.d > r.L[r.L.length - 1] * r.cut * 0.7;
        g.fillStyle = dying ? C.bad : C.c; g.globalAlpha = r.retry ? 1 : 0.9;
        g.beginPath(); g.arc(p[0], p[1], r.retry ? 3.4 : 2.8, 0, TAU); g.fill();
      }
      g.strokeStyle = C.bad; g.lineWidth = 2;
      for (const m of this.marks) {
        const k = 1 - (this.t - m.t) / 0.8, s = 4 + (1 - k) * 2;
        g.globalAlpha = k;
        g.beginPath(); g.moveTo(m.x - s, m.y - s); g.lineTo(m.x + s, m.y + s); g.moveTo(m.x + s, m.y - s); g.lineTo(m.x - s, m.y + s); g.stroke();
      }
    }
  }

  /* ------------------------------------------------------------ Tracewise */
  // A checkout system with traffic flowing through it. Break any service: its callers slow down
  // too, the alert fires at the edge, and the ranking has to find the service that actually broke.
  class Tracewise extends Sim {
    init() {
      const N = [["gateway", 0.08, 0.52], ["checkout", 0.32, 0.52], ["auth", 0.6, 0.2], ["payments", 0.6, 0.52], ["inventory", 0.6, 0.86], ["card-api", 0.89, 0.34], ["postgres", 0.89, 0.72]];
      this.N = N.map(([n, x, y]) => ({ n, x, y, kids: [], up: [], sym: 0 }));
      this.E = [[0, 1], [1, 2], [1, 3], [1, 4], [3, 5], [3, 6], [4, 6]];
      this.E.forEach(([a, b]) => { this.N[a].kids.push(b); this.N[b].up.push(a); });
      this.dots = []; this.spawn = 0; this.bad = -1; this.badAt = 0; this.hov = -1; this.anc = new Map();
      this.bHeal = this.btn("heal it", () => this.heal());
      this.bHeal.disabled = true;
    }
    reset() { this.heal(); }
    layout() {
      const { w, h } = this, bw = clamp(w * 0.16, 58, 88), bh = 24;
      this.N.forEach((n) => { n.b = { x: clamp(n.x * w, bw / 2 + 2, w - bw / 2 - 2) - bw / 2, y: clamp(n.y * h, bh / 2 + 22, h - bh / 2 - 2) - bh / 2, w: bw, h: bh }; });
    }
    c(i) { const b = this.N[i].b; return [b.x + b.w / 2, b.y + b.h / 2]; }
    inject(i) {
      if (i <= 0) return;
      this.heal();
      this.bad = i; this.badAt = this.t; this.bHeal.disabled = false;
      // callers, and how many hops up they are
      this.anc = new Map();
      const q = [[i, 0]];
      while (q.length) { const [k, d] = q.shift(); for (const u of this.N[k].up) if (!this.anc.has(u)) { this.anc.set(u, d + 1); q.push([u, d + 1]); } }
    }
    heal() { this.bad = -1; this.anc = new Map(); if (this.bHeal) this.bHeal.disabled = true; }
    step(dt) {
      if (!this.w) return;
      this.spawn -= dt;
      if (this.spawn <= 0) { this.spawn = 0.32; this.dots.push({ a: 0, b: 1, u: 0 }); }
      this.dots = this.dots.filter((d) => {
        d.u += dt / (0.42 * (d.b === this.bad ? 3.4 : 1));
        if (d.u < 1) return true;
        if (this.dots.length < 160) for (const k of this.N[d.b].kids) if (Math.random() < 0.85) this.dots.push({ a: d.b, b: k, u: 0 });
        return false;
      });
      const since = this.t - this.badAt;
      this.N.forEach((n, i) => {
        const hop = this.anc.get(i), want = this.bad >= 0 && (i === this.bad || (hop != null && since > 0.3 + hop * 0.35)) ? 1 : 0;
        n.sym += (want - n.sym) * Math.min(1, dt * 5);
      });
      const name = this.bad >= 0 ? this.N[this.bad].n : "";
      if (this.bad < 0) this.say(`${this.hov > 0 ? `break <b>${this.N[this.hov].n}</b>` : "click any service to break it"}`);
      else if (since < 1) this.say(`breaking <b>${name}</b>…`);
      else if (since < 2) this.say(`<b class="bad">alert</b> at the gateway · ranking suspects…`);
      else this.say(`Tracewise blames <b>${name}</b> ✓ · nearest the alert: checkout ${name === "checkout" ? "✓" : "✗"}`);
    }
    auto() {
      if (this.clock > 1.5 && this.bad < 0 && !this.armed) { this.armed = true; const pick = [2, 3, 4, 5, 6, 3, 6][Math.floor(Math.random() * 7)]; this.inject(pick); }
      if (this.clock > 8.5) { this.heal(); this.armed = false; this.clock = 0; }
    }
    hit(x, y) { return this.N.findIndex((n) => inBox(n.b, x, y)); }
    down(x, y) { const i = this.hit(x, y); if (i > 0) { if (i === this.bad) this.heal(); else this.inject(i); } }
    move(x, y) { const i = this.hit(x, y); this.hov = i; this.cv.style.cursor = i > 0 ? "pointer" : ""; }
    leave() { this.hov = -1; }
    draw(g) {
      const { C, N } = this, since = this.t - this.badAt, verdict = this.bad >= 0 && since > 2, alert = this.bad >= 0 && since > 1;
      g.font = this.font(this.w < 420 ? 9 : 10.5); g.textBaseline = "middle"; g.lineWidth = 1;
      const port = (i, j) => { const a = N[i].b, b = N[j].b; return [[a.x + a.w, a.y + a.h / 2], [b.x, b.y + b.h / 2]]; };
      // edges
      this.E.forEach(([i, j]) => {
        const [p, q] = port(i, j), hot = this.bad >= 0 && (j === this.bad || (this.anc.has(j) && this.anc.has(i)));
        g.strokeStyle = hot && alert ? C.warn : C.line; g.globalAlpha = hot && alert ? 0.7 : 1;
        const pts = bez(p, q, 14); g.beginPath(); pts.forEach((s, k) => (k ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]))); g.stroke();
      });
      // traffic
      for (const d of this.dots) {
        const [p, q] = port(d.a, d.b), pts = bez(p, q, 10), s = pts[Math.min(pts.length - 1, Math.round(d.u * (pts.length - 1)))];
        g.globalAlpha = 0.9; g.fillStyle = d.b === this.bad ? C.bad : C.c;
        g.beginPath(); g.arc(s[0], s[1], 2.4, 0, TAU); g.fill();
      }
      // services
      N.forEach((n, i) => {
        const b = n.b, broke = i === this.bad;
        g.globalAlpha = 1; g.fillStyle = C.bg2; box(g, b); g.fill();
        if (n.sym > 0.02) { g.globalAlpha = n.sym * (broke ? 0.28 + 0.12 * Math.sin(this.t * 8) : 0.16); g.fillStyle = broke ? C.bad : C.warn; box(g, b); g.fill(); }
        g.globalAlpha = 1; g.lineWidth = broke ? 1.6 : 1;
        g.strokeStyle = broke ? C.bad : n.sym > 0.5 ? C.warn : i === this.hov && i > 0 ? C.c : C.line;
        box(g, b); g.stroke();
        g.fillStyle = broke ? C.bad : C.fg2; g.textAlign = "center";
        g.fillText(fit(g, n.n, b.w - 8), b.x + b.w / 2, b.y + b.h / 2);
      });
      if (alert) {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 6); g.fillStyle = C.bad; g.textAlign = "left";
        g.fillText("▲ p99 over SLO", N[0].b.x, N[0].b.y - 10);
      }
      if (verdict) {
        const [x, y] = this.c(this.bad), r = N[this.bad].b.w * 0.62, k = sstep((since - 2) / 0.4);
        g.globalAlpha = k; g.strokeStyle = C.c; g.lineWidth = 1.5;
        g.setLineDash([5, 5]); g.lineDashOffset = -this.t * 18;
        g.beginPath(); g.arc(x, y, r + (1 - k) * 20, 0, TAU); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
        g.fillStyle = C.c; g.textAlign = "center";
        g.fillText("#1 culprit", x, Math.max(9, y - r - 9));
        if (this.bad !== 1) {
          const [cx, cy] = this.c(1);
          g.globalAlpha = k * 0.85; g.fillStyle = C.mute;
          const s = "nearest the alert", tw = g.measureText(s).width;
          g.fillText(s, cx, cy + 24);
          g.strokeStyle = C.mute; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - tw / 2, cy + 24); g.lineTo(cx + tw / 2, cy + 24); g.stroke();
        }
      }
    }
  }

  /* -------------------------------------------------------------- Onboard */
  // Fourteen records of seven customers, spread over three exports. Matching on email alone
  // leaves three customers split in two; Onboard's matcher gets all seven and keeps the two
  // different Alex Kims apart.
  const RECS = [
    [0, "Jon Smith", "jon@acme.io", 1], [0, "María García", "maria@garcia.mx", 2], [0, "Wei Chen", "w.chen@lumen.io", 3], [0, "Alex Kim", "alex@kimworks.co", 6], [0, "Priya Patel", "priya@patel.in", 4],
    [1, "SMITH, JONATHAN", "j.smith@acme.io", 1], [1, "Maria Garcia", "maria@garcia.mx", 2], [1, "Chen Wei", "(no email)", 3], [1, "Alex Kim", "akim@gmail.com", 7], [1, "Tom O'Neil", "tom@oneil.ie", 5],
    [2, "jon smith", "jon@acme.io", 1], [2, "P. Patel", "priya.p@gmail.com", 4], [2, "Thomas ONeil", "tom@oneil.ie", 5], [2, "wei chen", "w.chen@lumen.io", 3]
  ];
  const GOLD = { 1: "Jonathan Smith", 2: "María García", 3: "Wei Chen", 4: "Priya Patel", 5: "Thomas O'Neil", 6: "Alex Kim (kimworks)", 7: "Alex Kim (gmail)" };
  class Onboard extends Sim {
    init() {
      this.smart = true; this.mt = 9; this.hov = -1;
      this.bMode = this.btn("matching like Onboard", () => this.setMode(!this.smart), "tog on");
      this.groups();
    }
    reset() { this.setMode(true); }
    setMode(s) { this.smart = s; this.mt = 0; this.bMode.textContent = s ? "matching like Onboard" : "matching on email only"; this.bMode.classList.toggle("on", s); this.groups(); }
    groups() {
      const G = [];
      if (this.smart) {
        RECS.forEach((r, i) => { let k = G.find((x) => x.p === r[3]); if (!k) G.push((k = { p: r[3], recs: [] })); k.recs.push(i); });
      } else {
        RECS.forEach((r, i) => { const e = r[2].includes("@") ? r[2] : null; let k = e && G.find((x) => x.e === e); if (!k) G.push((k = { e, p: r[3], recs: [] })); k.recs.push(i); });
      }
      const seen = new Set();
      G.forEach((x) => { x.dup = seen.has(x.p); seen.add(x.p); x.label = this.smart ? GOLD[x.p] : RECS[x.recs[0]][1]; });
      this.G = G;
    }
    layout() {
      const { w, h } = this, left = w * 0.6, cw = left / 3, top = 22, rh = Math.min(26, (h - top) / 5);
      this.chip = RECS.map((r, i) => { const row = RECS.slice(0, i).filter((q) => q[0] === r[0]).length; return { x: r[0] * cw + 2, y: top + row * rh + 2, w: cw - 8, h: rh - 6 }; });
      this.cw = cw; this.gx = w * 0.68; this.gw = w - this.gx - 2; this.top = top;
    }
    rowBox(k) { const n = this.G.length, rh = Math.min(26, (this.h - this.top) / Math.max(7, n)); return { x: this.gx, y: this.top + k * rh + 2, w: this.gw, h: rh - 6 }; }
    step(dt) {
      this.mt += dt;
      const n = this.G.length, dups = this.G.filter((x) => x.dup).length;
      this.say(this.smart
        ? `<b>${n}</b> customers from 14 records · 0 duplicates · two Alex Kims kept apart`
        : `<b>${n}</b> rows from 14 records · <b class="bad">${dups}</b> customers split in two`);
    }
    auto() { if (this.clock > 5) { this.clock = 0; this.setMode(!this.smart); } }
    move(x, y) { this.hov = this.G.findIndex((_, k) => inBox(this.rowBox(k), x, y)); }
    leave() { this.hov = -1; }
    draw(g) {
      const { C } = this;
      g.font = this.font(this.w < 420 ? 9 : 10); g.textBaseline = "middle"; g.textAlign = "left";
      g.fillStyle = C.mute;
      ["CRM", "Billing", "Help desk"].forEach((s, i) => g.fillText(s, i * this.cw + 3, 9));
      g.fillText(this.smart ? "customers" : "rows", this.gx, 9);
      const p = sstep(this.mt / 0.9);
      // links from each record to its row
      this.G.forEach((grp, k) => {
        const rb = this.rowBox(k), q = [rb.x, rb.y + rb.h / 2], lit = this.hov < 0 || this.hov === k;
        grp.recs.forEach((ri) => {
          const c = this.chip[ri], s = [c.x + c.w, c.y + c.h / 2], pts = bez(s, q, 16), m = Math.max(1, Math.round(p * pts.length));
          g.strokeStyle = grp.dup ? C.bad : C.c; g.globalAlpha = (lit ? 0.55 : 0.1) * p; g.lineWidth = 1;
          g.beginPath(); pts.slice(0, m).forEach((pt, j) => (j ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1]))); g.stroke();
        });
      });
      // the records: names when matching like Onboard, emails when matching on email
      RECS.forEach((r, i) => {
        const c = this.chip[i], k = this.G.findIndex((x) => x.recs.includes(i)), lit = this.hov < 0 || this.hov === k;
        g.globalAlpha = lit ? 1 : 0.35;
        g.fillStyle = C.bg2; box(g, c, 4); g.fill(); g.strokeStyle = C.line; g.lineWidth = 1; g.stroke();
        g.fillStyle = this.smart ? C.fg2 : r[2].includes("@") ? C.fg2 : C.mute;
        g.fillText(fit(g, this.smart ? r[1] : r[2], c.w - 8), c.x + 4, c.y + c.h / 2 + 0.5);
      });
      // the golden rows
      this.G.forEach((grp, k) => {
        const b = this.rowBox(k), a = sstep((this.mt - 0.25 - k * 0.05) / 0.4), lit = this.hov < 0 || this.hov === k;
        g.globalAlpha = a * (lit ? 1 : 0.4);
        g.fillStyle = grp.dup ? C.bad : C.c; g.globalAlpha *= 0.14; box(g, b, 4); g.fill();
        g.globalAlpha = a * (lit ? 1 : 0.4); g.strokeStyle = grp.dup ? C.bad : C.c; g.stroke();
        g.fillStyle = C.fg;
        const tag = grp.dup ? " dup" : "";
        g.fillText(fit(g, grp.label, b.w - 34), b.x + 6, b.y + b.h / 2 + 0.5);
        g.fillStyle = grp.dup ? C.bad : C.mute; g.textAlign = "right";
        g.fillText(tag || "×" + grp.recs.length, b.x + b.w - 6, b.y + b.h / 2 + 0.5); g.textAlign = "left";
      });
    }
  }

  /* ---------------------------------------------------------------- Atlas */
  // A real search, small enough for a tile: BM25 over the titles and top terms of all my notes,
  // in this tab. Atlas itself searches 5,551 passages with LSA and a WebAssembly kernel.
  const STOP = new Set("a an the and or of to in on for with by from as at is are was were be this that it its into how what why when where which who you your can do does i my me".split(" "));
  const toks = (s) => (String(s).toLowerCase().match(/[a-z0-9][a-z0-9+#]*/g) || []).filter((w) => !STOP.has(w)).map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  const QUERIES = ["kubernetes pods", "pitch detection", "how indexes work", "svd", "rag from scratch", "postgres replication", "shaders"];
  class Atlas extends Sim {
    init() {
      this.inp = this.host.querySelector(".atlas-q input"); this.list = this.host.querySelector(".atlas-res");
      this.docs = null; this.score = null; this.typing = { q: 0, i: 0, hold: 0, wait: 0.6 };
      const form = this.inp.closest("form");
      this.inp.addEventListener("focus", () => this.touch());
      this.inp.addEventListener("input", () => { this.touch(); this.search(this.inp.value); });
      // ↵ hands the query to the full Atlas through the tile's own "open it" link, so it goes wherever that link goes
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const q = this.inp.value.trim(), url = "/atlas/" + (q ? "#q=" + encodeURIComponent(q) : "");
        const a = this.host.querySelector(".t-links a");
        if (a) { a.setAttribute("href", url); a.click(); } else location.href = url;
      });
      const ready = () => this.index(window.PORTFOLIO_NOTES || []);
      if (window.PORTFOLIO_NOTES) ready();
      else if (this.o.notes) { const s = document.createElement("script"); s.src = this.o.notes; s.onload = ready; document.head.appendChild(s); }
      this.say("type anything · it searches my notes right here");
    }
    index(notes) {
      const df = new Map();
      this.docs = notes.map(([title, url, terms]) => {
        const m = url.match(/\/(\d{4})\/(\d{2})\//), tf = new Map(), ws = toks(title + " " + title + " " + terms);
        ws.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
        tf.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1));
        return { title, url, date: m ? m[1] + "-" + m[2] : "", tf, len: ws.length };
      }).sort((a, b) => (a.date < b.date ? -1 : 1));
      this.df = df; this.vocab = [...df.keys()];
      this.avg = this.docs.reduce((s, d) => s + d.len, 0) / (this.docs.length || 1);
      this.score = new Float32Array(this.docs.length);
      this.search(this.inp.value);
    }
    search(q) {
      if (!this.docs) return;
      const t0 = performance.now(), n = this.docs.length, words = toks(q);
      this.score.fill(0);
      // the last word is still being typed, so it matches any term it starts
      const terms = words.map((w, i) => (i === words.length - 1 && w.length > 1 ? this.vocab.filter((v) => v.startsWith(w)).map((v) => [v, v === w ? 1 : 0.7]) : [[w, 1]]));
      terms.flat().forEach(([w, wt]) => {
        const d = this.df.get(w);
        if (!d) return;
        const idf = Math.log(1 + (n - d + 0.5) / (d + 0.5));
        this.docs.forEach((doc, i) => { const f = doc.tf.get(w); if (f) this.score[i] += wt * idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (doc.len / this.avg)))); });
      });
      const hits = [...this.score.keys()].filter((i) => this.score[i] > 0).sort((a, b) => this.score[b] - this.score[a]);
      this.ms = performance.now() - t0; this.hits = hits; this.max = hits.length ? this.score[hits[0]] : 1;
      const tidy = (s) => s.replace(/\s+—\s+(\d+)\s+·\s+/, " $1 · ").replace(/\s+—\s+/g, " · ");
      this.list.innerHTML = hits.slice(0, 3).map((i) => { const d = this.docs[i]; return `<li><a href="${d.url}"><span class="ttl">${tidy(d.title).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))}</span><span class="dt">${d.date}</span><i style="width:${((this.score[i] / this.max) * 100).toFixed(0)}%"></i></a></li>`; }).join("") || (q.trim() ? `<li class="none">nothing yet. Atlas digs deeper ↵</li>` : "");
      this.say(q.trim() ? `<b>${hits.length}</b> of ${n} notes · <b>${this.ms < 0.1 ? this.ms.toFixed(2) : this.ms.toFixed(1)} ms</b> in your browser · ↵ opens Atlas` : `type anything · it searches my ${n} notes right here`);
    }
    auto(dt) {
      if (!this.docs || document.activeElement === this.inp) return;
      const T = this.typing, q = QUERIES[T.q % QUERIES.length];
      T.wait -= dt;
      if (T.wait > 0) return;
      if (T.i < q.length) { T.i++; T.wait = 0.08; this.inp.value = q.slice(0, T.i); this.search(this.inp.value); }
      else if (!T.hold) { T.hold = 1; T.wait = 2.6; }
      else { T.q++; T.i = 0; T.hold = 0; T.wait = 0.35; this.inp.value = ""; this.search(""); }
    }
    draw(g) {
      const { C, w, h } = this;
      if (!this.docs || !this.docs.length) return;
      const n = this.docs.length, gap = w / n;
      g.font = this.font(9.5); g.textBaseline = "alphabetic"; g.textAlign = "left";
      let lastY = "";
      this.docs.forEach((d, i) => {
        const x = i * gap + gap / 2, s = this.score ? this.score[i] / (this.max || 1) : 0;
        if (d.date.slice(0, 4) !== lastY) { lastY = d.date.slice(0, 4); g.globalAlpha = 1; g.fillStyle = C.mute; g.fillText(lastY, x + 2, h - 1); g.fillStyle = C.line; g.fillRect(x - 1, 0, 1, h - 12); }
        const bh = s > 0 ? 5 + s * (h - 22) : 3;
        g.globalAlpha = s > 0 ? 0.35 + 0.65 * s : 0.5;
        g.fillStyle = s > 0 ? C.c : C.dim;
        g.fillRect(x - Math.max(1, gap * 0.32), h - 14 - bh, Math.max(1.5, gap * 0.64), bh);
      });
    }
  }

  /* --------------------------------------------------------------- Studio */
  // The demo sings the four open strings of a violin into a cents trace. "Play a note" builds a
  // plucked string at a random detune and runs the page's McLeod detector on it: played vs heard.
  const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const noteOf = (f) => { const m = 69 + 12 * Math.log2(f / 440), n = Math.round(m); return { name: NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1), cents: (m - n) * 100, midi: n }; };
  const fOf = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  // Karplus-Strong with an allpass for the fractional period, as in strings.js
  function pluck(f, sr, dur) {
    const len = Math.floor(sr * dur), y = new Float32Array(len), period = sr / f - 0.5, P = Math.floor(period), frac = period - P, C = (1 - frac) / (1 + frac);
    let lp = 0, x1 = 0, y1 = 0;
    for (let i = 0; i <= P; i++) { lp = lp * 0.45 + (Math.random() * 2 - 1) * 0.55; y[i] = lp; }
    for (let i = P + 1; i < len; i++) { const avg = 0.5 * (y[i - P] + y[i - P - 1]), ap = C * avg + x1 - C * y1; x1 = avg; y1 = ap; y[i] = 0.9986 * ap; }
    for (let i = 0, fade = Math.floor(sr * 0.2); i < fade; i++) y[len - 1 - i] *= i / fade;
    return y;
  }
  class Studio extends Sim {
    init() {
      this.tr = []; this.cur = null; this.demo = 0; this.dt0 = 0; this.pb = null; this.mic = null; this.acc = 0;
      this.bPlay = this.btn("▶ play a note", () => this.play());
      this.bMic = this.btn("sing to it", () => this.sing(!this.mic));
    }
    reset() { this.pb = null; this.demo = 0; this.dt0 = this.t; }
    play() {
      const S = window.Strings;
      if (this.mic) this.sing(false);
      const midi = 55 + [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19][Math.floor(Math.random() * 12)];
      const det = Math.round((Math.random() * 48 - 24) * 10) / 10, f = fOf(midi) * Math.pow(2, det / 1200), sr = 44100;
      const y = pluck(f, sr, 1.8), frames = [];
      for (let s = 0; s + 2048 < y.length; s += 441) { const r = S && S.pitch(y.subarray(s, s + 2048), sr); frames.push(r ? 1200 * Math.log2(r.f / fOf(midi)) : null); }
      const steady = frames.slice(8, 80).filter((v) => v != null).sort((a, b) => a - b);
      this.pb = { t0: this.t, frames, played: { name: noteOf(fOf(midi)).name, det }, heard: steady.length ? steady[steady.length >> 1] : null };
      const ctx = S && S.Sound.unlock();
      if (ctx) {
        const b = ctx.createBuffer(1, y.length, sr); b.getChannelData(0).set(y);
        const src = ctx.createBufferSource(), gain = ctx.createGain(); gain.gain.value = 0.5;
        src.buffer = b; src.connect(gain); gain.connect(ctx.destination); src.start();
      }
    }
    async sing(on) {
      const S = window.Strings;
      if (!on) { if (this.mic) this.mic.stream.getTracks().forEach((t) => t.stop()); this.mic = null; this.bMic.textContent = "sing to it"; this.bMic.classList.remove("on"); return; }
      const ctx = S && S.Sound.unlock();
      if (!ctx || !navigator.mediaDevices) { this.say("this browser can't listen here"); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        const an = ctx.createAnalyser(); an.fftSize = 2048; ctx.createMediaStreamSource(stream).connect(an);
        this.mic = { stream, an, buf: new Float32Array(2048), sr: ctx.sampleRate };
        this.pb = null; this.bMic.textContent = "stop listening"; this.bMic.classList.add("on");
      } catch (e) { this.say(e && e.name === "NotAllowedError" ? "the microphone is blocked" : "no microphone found"); }
    }
    push(c) { this.tr.push([this.t, c]); while (this.tr.length && this.t - this.tr[0][0] > 3.2) this.tr.shift(); }
    step(dt) {
      const S = window.Strings;
      this.acc += dt;
      if (this.acc < 1 / 60) return;
      this.acc = 0;
      if (this.mic) {
        this.mic.an.getFloatTimeDomainData(this.mic.buf);
        const r = S.pitch(this.mic.buf, this.mic.sr);
        if (r) { const n = noteOf(r.f); this.cur = n; this.push(n.cents); this.say(`you: <b>${n.name} ${n.cents >= 0 ? "+" : "−"}${Math.abs(n.cents).toFixed(0)}¢</b>`); }
        else { this.push(null); this.say("listening · sing or play a steady note"); }
        return;
      }
      if (this.pb) {
        const k = Math.floor((this.t - this.pb.t0) / 0.01), v = this.pb.frames[Math.min(k, this.pb.frames.length - 1)];
        this.push(k < this.pb.frames.length ? v : null);
        const p = this.pb.played, hd = this.pb.heard, sg = (c) => (c >= 0 ? "+" : "−") + Math.abs(c).toFixed(1) + "¢";
        this.cur = { name: p.name, cents: v != null ? v : hd };
        this.say(`played <b>${p.name} ${sg(p.det)}</b> · heard <b>${hd == null ? "?" : p.name + " " + sg(hd)}</b>`);
        if (this.t - this.pb.t0 > 3.4) this.pb = null;
        return;
      }
      // demo: G3, D4, A4, E5, each scooped in and settling into a vibrato
      const OPEN = [["G3", 3], ["D4", -4], ["A4", 1], ["E5", -2]], s = this.t - this.dt0;
      if (s > 2.6) { this.dt0 = this.t; this.demo = (this.demo + 1) % 4; }
      const [name, bias] = OPEN[this.demo], u = this.t - this.dt0;
      const c = u < 0.12 ? null : bias - 40 * Math.exp(-u * 5) + 9 * Math.sin(TAU * 5.6 * u) * sstep((u - 0.5) / 0.6) + (Math.random() - 0.5) * 1.2;
      this.push(c);
      this.cur = { name, cents: c == null ? bias : c };
      if (!this.pb) this.say(`demo: the open strings of a violin · now <b>${name}</b>`);
    }
    draw(g) {
      const { C, w, h } = this, mid = h * 0.58, k = (h * 0.34) / 50, x0 = 44;
      g.font = this.font(9.5); g.textBaseline = "middle"; g.textAlign = "left";
      // the in-tune band and the cents grid
      g.fillStyle = C.c; g.globalAlpha = 0.1; g.fillRect(x0, mid - 5 * k, w - x0, 10 * k);
      g.globalAlpha = 1; g.strokeStyle = C.line; g.lineWidth = 1;
      [-50, -25, 25, 50].forEach((c) => { g.beginPath(); g.moveTo(x0, mid - c * k); g.lineTo(w, mid - c * k); g.stroke(); });
      g.fillStyle = C.mute; [50, 0, -50].forEach((c) => g.fillText((c > 0 ? "+" : c < 0 ? "−" : "") + Math.abs(c) + "¢", 4, mid - c * k));
      g.strokeStyle = C.c; g.globalAlpha = 0.5; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(x0, mid); g.lineTo(w, mid); g.stroke(); g.setLineDash([]);
      // the trace, newest on the right
      g.globalAlpha = 1; g.strokeStyle = C.c; g.lineWidth = 2;
      g.beginPath();
      let pen = false, lx = 0, ly = 0;
      for (const [t, c] of this.tr) {
        if (c == null) { pen = false; continue; }
        const x = w - 6 - (this.t - t) * ((w - x0 - 6) / 3.2), y = mid - clamp(c, -60, 60) * k;
        if (x < x0) continue;
        pen ? g.lineTo(x, y) : g.moveTo(x, y);
        pen = true; lx = x; ly = y;
      }
      g.stroke();
      if (pen) { g.fillStyle = C.c; g.beginPath(); g.arc(lx, ly, 3.5, 0, TAU); g.fill(); }
      // the reading
      if (this.cur) {
        const c = this.cur.cents || 0;
        g.textBaseline = "alphabetic"; g.fillStyle = C.fg; g.font = `400 ${Math.round(clamp(h * 0.16, 26, 40))}px ${this.serif}`;
        g.fillText(this.cur.name.replace(/(\d)$/, "$1"), x0, h * 0.22);
        const nw = g.measureText(this.cur.name).width;
        g.font = this.font(12, 600); g.fillStyle = Math.abs(c) <= 5 ? C.c : C.warn;
        g.fillText((c >= 0 ? "+" : "−") + Math.abs(c).toFixed(Math.abs(c) < 10 ? 1 : 0) + "¢", x0 + nw + 10, h * 0.22);
      }
    }
  }

  /* ---------------------------------------------------------------- Arena */
  // A thousand players on one server. Each square is a client; it flashes when a flip comes back.
  // Click one to drop it: it reconnects and the server replays the board to it.
  class Arena extends Sim {
    init() {
      const N = (this.N = 1000);
      this.conn = new Float32Array(N); this.flip = new Float32Array(N).fill(-9); this.drop = new Float32Array(N).fill(-9);
      this.win = []; this.rate = 0; this.hov = -1; this.msg = "";
      this.bStorm = this.btn("drop 200 players", () => this.storm());
      this.connect(0);
    }
    reset() { this.msg = ""; }
    layout() {
      const { w, h, N } = this, cols = Math.max(10, Math.round(Math.sqrt((N * w) / h))), rows = Math.ceil(N / cols);
      const s = Math.min(w / cols, h / rows);
      Object.assign(this, { cols, rows, s, ox: (w - cols * s) / 2, oy: (h - rows * s) / 2 });
    }
    xy(i) { return [this.ox + (i % this.cols) * this.s, this.oy + Math.floor(i / this.cols) * this.s]; }
    connect(t0) {
      for (let i = 0; i < this.N; i++) { const a = (i % 40) / 40 - 0.5, b = Math.floor(i / 40) / 25 - 0.5; this.conn[i] = t0 + Math.hypot(a, b) * 2.2 + Math.random() * 0.2; }
    }
    storm() {
      let k = 0;
      while (k < 200) { const i = Math.floor(Math.random() * this.N); if (this.conn[i] <= this.t) { this.drop[i] = this.t; this.conn[i] = this.t + 0.5 + Math.random() * 1.6; k++; } }
      this.msg = "200 dropped · reconnecting, boards replayed";
      this.msgT = this.t;
    }
    step(dt) {
      let up = 0, flips = 0;
      const lam = 1.49 * dt; // flips per player per second, the load test's 1,491 per second over 1,000 players
      for (let i = 0; i < this.N; i++) {
        if (this.conn[i] > this.t) continue;
        up++;
        if (Math.random() < lam) { this.flip[i] = this.t; flips++; }
      }
      this.win.push([this.t, flips]);
      while (this.win.length && this.t - this.win[0][0] > 1) this.win.shift();
      const r = this.win.reduce((s, x) => s + x[1], 0);
      this.rate += (r - this.rate) * 0.1;
      if (this.msg && this.t - this.msgT > 3) this.msg = "";
      this.say(`<b>${fmt(up)}</b> players · <b>${fmt(Math.round(this.rate / 10) * 10)}</b> flips/s${this.msg ? " · " + this.msg : this.hov >= 0 ? ` · player #${this.hov + 1}, click to drop` : ""}`);
    }
    auto() {
      if (this.clock > 7) {
        this.clock = 0;
        for (let k = 0; k < 24; k++) { const i = Math.floor(Math.random() * this.N); this.drop[i] = this.t; this.conn[i] = this.t + 0.6 + Math.random(); }
      }
    }
    cell(x, y) { const c = Math.floor((x - this.ox) / this.s), r = Math.floor((y - this.oy) / this.s), i = r * this.cols + c; return c >= 0 && c < this.cols && r >= 0 && i < this.N ? i : -1; }
    down(x, y) { const i = this.cell(x, y); if (i >= 0) { this.drop[i] = this.t; this.conn[i] = this.t + 0.8; this.msg = `player #${i + 1} dropped · back in 0.8 s with the board replayed`; this.msgT = this.t; } }
    move(x, y) { this.hov = this.cell(x, y); this.cv.style.cursor = this.hov >= 0 ? "pointer" : ""; }
    leave() { this.hov = -1; }
    draw(g) {
      const { C, s, t } = this, q = Math.max(1, s - (s > 6 ? 1.6 : 1));
      g.fillStyle = C.line;
      for (let i = 0; i < this.N; i++) { if (this.conn[i] > t && t - this.drop[i] > 0.4) { const [x, y] = this.xy(i); g.fillRect(x, y, q, q); } }
      g.fillStyle = C.c;
      for (let i = 0; i < this.N; i++) {
        if (this.conn[i] > t) continue;
        const [x, y] = this.xy(i), f = Math.max(0, 1 - (t - this.flip[i]) / 0.35);
        g.globalAlpha = 0.2 + 0.8 * f;
        g.fillRect(x, y, q, q);
      }
      g.fillStyle = C.bad;
      for (let i = 0; i < this.N; i++) { if (t - this.drop[i] < 0.4 || (this.conn[i] > t && this.drop[i] > -9)) { const [x, y] = this.xy(i); g.globalAlpha = 0.85; g.fillRect(x, y, q, q); } }
      // reconnect rings
      g.strokeStyle = C.c; g.lineWidth = 1;
      for (let i = 0; i < this.N; i++) {
        const a = t - this.conn[i];
        if (this.drop[i] > -9 && a > 0 && a < 0.5) { const [x, y] = this.xy(i); g.globalAlpha = 1 - a / 0.5; g.beginPath(); g.arc(x + q / 2, y + q / 2, q * 0.6 + a * 16, 0, TAU); g.stroke(); }
        else if (this.drop[i] > -9 && a >= 0.5) this.drop[i] = -9;
      }
      if (this.hov >= 0) { const [x, y] = this.xy(this.hov); g.globalAlpha = 1; g.strokeStyle = C.fg; g.strokeRect(x - 1.5, y - 1.5, q + 3, q + 3); }
    }
  }

  /* ------------------------------------------------------------ Layerline */
  // A gear with a hub, sliced. Each layer prints its two walls, then 45° infill that turns 90°
  // every layer, and the nozzle draws it. Drag up or down to pick a layer.
  const LAYERS = 40;
  function gear(R, r, teeth, n) {
    const pts = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU, v = 0.5 + 0.5 * Math.cos(teeth * a); pts.push([Math.cos(a), Math.sin(a), r + (R - r) * sstep((v - 0.3) / 0.4)]); }
    return pts.map(([c, s, rad]) => [c * rad, s * rad]);
  }
  const ring = (r, n) => Array.from({ length: n }, (_, k) => [Math.cos((k / n) * TAU) * r, Math.sin((k / n) * TAU) * r]);
  const grow = (poly, d) => poly.map(([x, y]) => { const l = Math.hypot(x, y) || 1; return [(x * (l + d)) / l, (y * (l + d)) / l]; });
  function scan(polys, ang, gap) {
    const c = Math.cos(ang), s = Math.sin(ang), rot = (p) => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c], back = (p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
    const R = polys.map((p) => p.map(rot)), segs = [];
    let lo = Infinity, hi = -Infinity;
    R.forEach((p) => p.forEach((q) => { lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]); }));
    let flip = false;
    for (let y = lo + gap / 2; y < hi; y += gap) {
      const xs = [];
      R.forEach((p) => { for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1])); } });
      xs.sort((a, b) => a - b);
      const row = [];
      for (let i = 0; i + 1 < xs.length; i += 2) row.push([back([xs[i], y]), back([xs[i + 1], y])]);
      if (flip) row.reverse().forEach((sg) => sg.reverse());
      segs.push(...row);
      flip = !flip;
    }
    return segs;
  }
  class Layerline extends Sim {
    init() {
      this.L = 0; this.prog = 0; this.cache = new Map(); this.play = true; this.pause = 0; this.drag = false;
      this.bPlay = this.btn("❚❚ pause", () => this.setPlay(!this.play), "tog on");
      window.addEventListener("pointerup", () => { this.drag = false; });
    }
    reset() { this.setPlay(true); }
    setPlay(p) { this.play = p; this.bPlay.textContent = p ? "❚❚ pause" : "▶ print"; this.bPlay.classList.toggle("on", p); }
    layer(i) {
      if (this.cache.has(i)) return this.cache.get(i);
      const z = i / (LAYERS - 1), hubOnly = z > 0.6, d = 0.045;
      const outer = hubOnly ? ring(0.46, 90) : gear(1, 0.84, 12, 360), hole = ring(0.19, 60);
      const walls = [outer, grow(outer, -d), hole, grow(hole, d)];
      const fill = scan([grow(outer, -2 * d), grow(hole, 2 * d)], i % 2 ? Math.PI / 4 : -Math.PI / 4, 0.09);
      const path = [];
      walls.forEach((w) => path.push(w.concat([w[0]])));
      fill.forEach((sg) => path.push(sg));
      let len = 0;
      const runs = path.map((pts) => { const L = walk(pts); len += L[L.length - 1]; return { pts, L, len: L[L.length - 1] }; });
      const out = { runs, len, hubOnly, outer };
      this.cache.set(i, out);
      return out;
    }
    layout() {
      const { w, h } = this, side = Math.min(70, w * 0.18);
      this.side = { x: w - side, y: 8, w: side - 4, h: h - 16 };
      const size = Math.min(w - side - 12, h - 8);
      this.cx = (w - side) / 2; this.cy = h / 2; this.k = size / 2.12;
    }
    setLayerAt(y) { const s = this.side; this.L = clamp(Math.round((1 - (y - s.y) / s.h) * (LAYERS - 1)), 0, LAYERS - 1); this.prog = 1e9; this.setPlay(false); }
    down(x, y) { this.drag = true; this.setLayerAt(y); }
    move(x, y, e) { if (this.drag && e.buttons) this.setLayerAt(y); this.cv.style.cursor = "ns-resize"; }
    step(dt) {
      const lay = this.layer(this.L);
      if (this.play) {
        if (this.prog >= lay.len) { this.pause += dt; if (this.pause > 0.45) { this.pause = 0; this.prog = 0; this.L = (this.L + 1) % LAYERS; } }
        else this.prog += (lay.len / 2.6) * dt;
      }
      this.say(`layer <b>${this.L + 1}</b>/${LAYERS} · ${lay.hubOnly ? "hub" : "gear teeth"} · ${this.L % 2 ? "45°" : "−45°"} infill`);
    }
    draw(g) {
      const { C, cx, cy, k, side: s } = this, lay = this.layer(this.L), P = (p) => [cx + p[0] * k, cy + p[1] * k];
      // the layer below, faint
      if (this.L > 0) { const below = this.layer(this.L - 1).outer; g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); below.forEach((p, i) => { const q = P(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.stroke(); }
      // everything still to print, then what the nozzle has laid down
      let left = Math.min(this.prog, lay.len), nozzle = null;
      for (const r of lay.runs) {
        g.globalAlpha = 0.16; g.strokeStyle = C.dim; g.lineWidth = 1;
        g.beginPath(); r.pts.forEach((p, i) => { const q = P(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke();
        if (left <= 0) continue;
        const upto = Math.min(left, r.len);
        g.globalAlpha = 1; g.strokeStyle = C.c; g.lineWidth = Math.max(1.4, k * 0.035);
        g.beginPath();
        let q0 = P(r.pts[0]); g.moveTo(q0[0], q0[1]);
        for (let i = 1; i < r.pts.length && r.L[i - 1] < upto; i++) { const p = r.L[i] <= upto ? r.pts[i] : at(r.pts, r.L, upto), q = P(p); g.lineTo(q[0], q[1]); if (r.L[i] > upto) break; }
        g.stroke();
        if (upto < r.len) nozzle = P(at(r.pts, r.L, upto));
        left -= r.len;
      }
      if (nozzle && this.play) { g.globalAlpha = 1; g.fillStyle = C.fg; g.beginPath(); g.arc(nozzle[0], nozzle[1], 3, 0, TAU); g.fill(); g.globalAlpha = 0.25; g.beginPath(); g.arc(nozzle[0], nozzle[1], 8, 0, TAU); g.fill(); }
      // the side view: every layer, this one lit
      const lh = s.h / LAYERS;
      for (let i = 0; i < LAYERS; i++) {
        const hub = i / (LAYERS - 1) > 0.6, bw = (hub ? 0.46 : 1) * s.w, y = s.y + s.h - (i + 1) * lh;
        g.globalAlpha = i === this.L ? 1 : i < this.L ? 0.45 : 0.14;
        g.fillStyle = i === this.L ? C.c : C.fg2;
        g.fillRect(s.x + (s.w - bw) / 2, y + 0.5, bw, Math.max(1, lh - 1));
      }
    }
  }


  /* ------------------------------------------------------------- Dispatch */
  // Five technicians and a day of jobs across a city cut by a river with two bridges. The plan is
  // regret insertion, then relocate moves until a few milliseconds run out. When the day changes
  // (someone goes home, an urgent job lands, the traffic slows) whatever is done or under way is
  // frozen and the rest is re-planned from the current plan.
  const DAY = 600, RATE = 13; // minutes from 08:00 to 18:00; simulated minutes per second
  const CREW = [["Mei", 0.08, 0.14], ["Sam", 0.93, 0.16], ["Ravi", 0.09, 0.86], ["Jo", 0.92, 0.88], ["Lena", 0.4, 0.5]];
  const CREW_INK = {
    midnight: ["#ff7ab6", "#62b6ff", "#4fe3c1", "#ffc978", "#c9b6ff"],
    paper: ["#c2306f", "#1f6fb8", "#11806a", "#9c6200", "#6a4fc9"]
  };
  const SPLIT = 0.56, BRIDGES = [0.27, 0.73];
  const hhmm = (m) => { const t = Math.round(480 + m); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  const westOf = (p) => p.x < SPLIT;
  const blocks = (a, b) => {
    if (westOf(a) === westOf(b)) return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    return Math.min(...BRIDGES.map((y) => Math.abs(a.x - b.x) + Math.abs(a.y - y) + Math.abs(y - b.y)));
  };
  const streets = (a, b) => {
    if (westOf(a) === westOf(b)) return [a, { x: b.x, y: a.y }, b];
    const y = BRIDGES.reduce((m, q) => (Math.abs(a.y - q) + Math.abs(q - b.y) < Math.abs(a.y - m) + Math.abs(m - b.y) ? q : m));
    return [a, { x: a.x, y }, { x: b.x, y }, b];
  };
  const alongStreets = (pts, f) => {
    const seg = (i) => Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
    let tot = 0;
    for (let i = 1; i < pts.length; i++) tot += seg(i);
    let d = clamp(f, 0, 1) * tot;
    for (let i = 1; i < pts.length; i++) {
      const l = seg(i);
      if (d <= l || i === pts.length - 1) { const k = l ? d / l : 1; return { x: lerp(pts[i - 1].x, pts[i].x, k), y: lerp(pts[i - 1].y, pts[i].y, k) }; }
      d -= l;
    }
    return pts[pts.length - 1];
  };
  const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  class Dispatch extends Sim {
    init() {
      this.seed = 7; this.traffic = 0; this.hov = -1; this.last = 0; this.note = "";
      this.bHome = this.btn("send someone home", () => this.sendBusiest(), "warn");
      this.bJam = this.btn("traffic: clear", () => this.setJam(!this.traffic), "tog");
      this.btn("new day", () => this.newDay());
      this.newDay();
    }
    theme() {
      super.theme();
      const th = document.documentElement.dataset.theme;
      this.ink = th === "phosphor" ? CREW.map(() => this.C.c) : CREW_INK[th] || CREW_INK.midnight;
    }
    // back to demoing: let the script carry on from now rather than replaying what it missed
    reset() { (this.script || []).forEach((ev) => { if (ev[0] < this.T) ev[2] = true; }); }
    setJam(on) {
      this.traffic = on ? 0.5 : 0;
      this.bJam.textContent = on ? "traffic: rush hour" : "traffic: clear";
      this.bJam.classList.toggle("on", on);
      this.replan(on ? "rush hour, 50% slower" : "traffic clears");
    }
    tt(a, b) { return blocks(a, b) * 72 * (1 + this.traffic); }
    newDay() {
      const r = seeded(this.seed++ * 2654435761);
      this.T = 0;
      this.techs = CREW.map(([name, x, y], i) => ({ i, name, home: { x, y }, pos: { x, y }, free: 0, on: true, offAt: DAY, job: null, route: [], leg: null }));
      this.jobs = [];
      for (let k = 0; k < 24; k++) {
        let x = 0.05 + r() * 0.9;
        if (Math.abs(x - SPLIT) < 0.05) x += x < SPLIT ? -0.06 : 0.06;
        const appt = r() < 0.5, dur = 20 + Math.round(r() * 7) * 5, a = appt ? Math.round((r() * 420) / 30) * 30 : 0;
        this.jobs.push({ id: k, x, y: 0.06 + r() * 0.88, a, b: appt ? a + 120 : DAY - dur, dur, pr: 1, tech: -1, st: "plan", eta: 0, flash: 0 });
      }
      this.script = [[100, "home"], [175, "urgent"], [265, "urgent"], [350, "urgent"]];
      this.note = "";
      this.replan(null, true);
      this.bHome.disabled = false;
    }

    /* planning */
    startOf(t) {
      const j = t.job;
      if (j) return { from: j, avail: j.st === "work" ? j.start + j.dur : Math.max(t.leg.t1, j.a) + j.dur };
      return { from: t.pos, avail: Math.max(this.T, t.free) };
    }
    // lateness first, then driving, then overtime, then how long customers wait (which spreads the work)
    cost(t, st, route, write) {
      let time = st.avail, pos = st.from, late = 0, drive = 0, wait = 0;
      for (const id of route) {
        const j = this.jobs[id], d = this.tt(pos, j), s = Math.max(time + d, j.a);
        drive += d; late += Math.max(0, s - j.b) * j.pr; wait += s - j.a;
        if (write) j.eta = s;
        time = s + j.dur; pos = j;
      }
      return late * 8 + drive + Math.max(0, time + this.tt(pos, t.home) - DAY) * 3 + wait * 0.08;
    }
    bestSpot(id, routes, sts, costs) {
      let best = { c: Infinity, ti: -1, p: -1 }, second = Infinity;
      for (const t of this.techs) {
        if (!t.on) continue;
        const r = routes[t.i];
        let bc = Infinity, bp = -1;
        for (let p = 0; p <= r.length; p++) {
          r.splice(p, 0, id);
          const c = this.cost(t, sts[t.i], r) - costs[t.i];
          r.splice(p, 1);
          if (c < bc) { bc = c; bp = p; }
        }
        if (bc < best.c) { second = best.c; best = { c: bc, ti: t.i, p: bp }; } else if (bc < second) second = bc;
      }
      best.regret = second === Infinity ? 1e6 : second - best.c;
      return best;
    }
    replan(why, quiet, before = this.jobs.map((j) => j.tech)) {
      const t0 = performance.now(), T = this.techs;
      const sts = T.map((t) => this.startOf(t));
      const routes = T.map((t) => (t.on ? t.route.slice() : []));
      const pool = this.jobs.filter((j) => j.st === "plan" && (j.tech < 0 || !T[j.tech].on || !routes[j.tech].includes(j.id))).map((j) => j.id);
      const costs = T.map((t) => this.cost(t, sts[t.i], routes[t.i]));
      // regret insertion: place first the job that would cost most to place second-best
      while (pool.length && T.some((t) => t.on)) {
        let pick = null;
        for (const id of pool) {
          const b = this.bestSpot(id, routes, sts, costs);
          if (!pick || b.regret > pick.b.regret || (b.regret === pick.b.regret && b.c < pick.b.c)) pick = { id, b };
        }
        routes[pick.b.ti].splice(pick.b.p, 0, pick.id);
        costs[pick.b.ti] = this.cost(T[pick.b.ti], sts[pick.b.ti], routes[pick.b.ti]);
        pool.splice(pool.indexOf(pick.id), 1);
      }
      // then relocate moves until the budget runs out
      const r = seeded(this.seed * 31 + Math.round(this.T)), ids = routes.flat();
      for (let it = 0; it < 4000 && ids.length && performance.now() - t0 < 4; it++) {
        const id = ids[(r() * ids.length) | 0], ti = routes.findIndex((x) => x.includes(id)), p = routes[ti].indexOf(id), old = costs[ti];
        routes[ti].splice(p, 1);
        costs[ti] = this.cost(T[ti], sts[ti], routes[ti]);
        const b = this.bestSpot(id, routes, sts, costs);
        if (b.ti >= 0 && b.c < old - costs[ti] - 1e-9) { routes[b.ti].splice(b.p, 0, id); costs[b.ti] = this.cost(T[b.ti], sts[b.ti], routes[b.ti]); }
        else { routes[ti].splice(p, 0, id); costs[ti] = old; }
      }
      T.forEach((t) => { t.route = routes[t.i]; t.route.forEach((id) => (this.jobs[id].tech = t.i)); this.cost(t, sts[t.i], t.route, true); });
      this.last = performance.now() - t0;
      // a job has moved when it had a technician before the change and has another one now
      let moved = 0;
      this.jobs.forEach((j, k) => { if (j.st === "plan" && before[k] >= 0 && before[k] !== j.tech) { moved++; j.flash = 1; } });
      if (!quiet) {
        const fresh = this.jobs[before.length], who = fresh && fresh.tech >= 0 ? `, ${T[fresh.tech].name} takes it` : "";
        this.note = `${why}${who} · <b>${moved}</b> moved`;
        this.noteT = this.t;
      }
    }

    /* the day changes */
    sendHome(t) {
      if (!t.on || this.techs.filter((x) => x.on).length < 2) return;
      const before = this.jobs.map((j) => j.tech);
      t.on = false; t.offAt = this.T;
      // a job under way gets finished; one they were driving to goes back in the pool
      if (t.job && t.job.st === "go") { t.job.st = "plan"; t.job.tech = -1; t.job = null; t.leg = null; }
      t.route.forEach((id) => (this.jobs[id].tech = -1));
      t.route = [];
      this.replan(`${t.name} went home at ${hhmm(this.T)}`, false, before);
      this.bHome.disabled = this.techs.filter((x) => x.on).length < 2;
    }
    sendBusiest() {
      const on = this.techs.filter((t) => t.on);
      if (on.length > 1) this.sendHome(on.reduce((a, b) => (b.route.length > a.route.length ? b : a)));
    }
    urgent(x, y) {
      const T = Math.min(this.T, DAY - 90), before = this.jobs.map((j) => j.tech);
      this.jobs.push({ id: this.jobs.length, x: clamp(x, 0.03, 0.97), y: clamp(y, 0.03, 0.97), a: T, b: T + 90, dur: 30, pr: 3, tech: -1, st: "plan", eta: 0, flash: 1, hot: true });
      this.replan(`urgent job at ${hhmm(T)}`, false, before);
    }
    auto() {
      for (const ev of this.script) {
        if (ev[2] || this.T < ev[0]) continue;
        ev[2] = true;
        const r = seeded(this.seed * 7 + ev[0]);
        if (ev[1] === "home") { const on = this.techs.filter((t) => t.on && t.route.length); if (on.length > 1) this.sendHome(on[(r() * on.length) | 0]); }
        else this.urgent(0.1 + r() * 0.8, 0.1 + r() * 0.8);
      }
    }

    /* the clock */
    step(dt) {
      const T0 = this.T;
      this.T += dt * RATE;
      for (const t of this.techs) {
        for (let guard = 0; guard < 4; guard++) {
          const j = t.job;
          if (j) {
            if (j.st === "go" && this.T >= t.leg.t1) { j.st = "work"; j.start = Math.max(t.leg.t1, j.a); j.late = Math.max(0, j.start - j.b); }
            if (j.st === "work" && this.T >= j.start + j.dur) { j.st = "done"; t.pos = { x: j.x, y: j.y }; t.free = j.start + j.dur; t.job = null; t.leg = null; continue; }
            break;
          }
          if (!t.on || !t.route.length) break;
          const n = this.jobs[t.route.shift()], dep = Math.max(t.free, T0);
          n.st = "go"; t.job = n;
          t.leg = { from: { ...t.pos }, t0: dep, t1: dep + this.tt(t.pos, n) };
        }
      }
      this.jobs.forEach((j) => (j.flash = Math.max(0, j.flash - dt * 0.6)));
      if ((this.etaT = (this.etaT || 0) + dt) > 0.25) { this.etaT = 0; this.techs.forEach((t) => this.cost(t, this.startOf(t), t.route, true)); }
      if (this.T > DAY + 40) this.newDay();
      const all = this.jobs, done = all.filter((j) => j.st === "done").length;
      const ok = all.filter((j) => (j.st === "done" ? !j.late : j.tech >= 0 && j.eta <= j.b)).length, pct = Math.round((100 * ok) / all.length);
      const note = this.note && this.t - this.noteT < 5 ? this.note + " · " : this.hov >= 0 ? `click: send ${this.techs[this.hov].name} home · ` : "";
      this.say(`${note}<b${pct < 90 ? ' class="bad"' : ""}>${pct}%</b> on time · <b>${done}/${all.length}</b> done · re-plan <b>${this.last.toFixed(1)} ms</b>`);
    }
    where(t) {
      const j = t.job;
      if (!t.on && !j) return t.home;
      if (j && j.st === "go") return alongStreets(streets(t.leg.from, j), (this.T - t.leg.t0) / Math.max(1e-6, t.leg.t1 - t.leg.t0));
      return j || t.pos;
    }

    /* pointer */
    layout() {
      const { w, h } = this, strip = h >= 260 ? 5 * 10 + 12 : 0;
      this.M = { x: 8, y: 22, w: w - 16, h: h - 30 - strip };
      this.G = strip ? { x: 8, y: h - strip, w: w - 16, h: strip - 6 } : null;
    }
    X(x) { return this.M.x + x * this.M.w; }
    Y(y) { return this.M.y + y * this.M.h; }
    techAt(x, y) {
      for (const t of this.techs) { const p = this.where(t); if (t.on && Math.hypot(x - this.X(p.x), y - this.Y(p.y)) < 13) return t.i; }
      return -1;
    }
    down(x, y) {
      const k = this.techAt(x, y);
      if (k >= 0) return this.sendHome(this.techs[k]);
      if (inBox(this.M, x, y)) this.urgent((x - this.M.x) / this.M.w, (y - this.M.y) / this.M.h);
    }
    move(x, y) { this.hov = this.techAt(x, y); this.cv.style.cursor = this.hov >= 0 ? "pointer" : inBox(this.M, x, y) ? "crosshair" : ""; }
    leave() { this.hov = -1; }

    /* drawing */
    draw(g) {
      const { C, M, ink } = this;
      g.lineWidth = 1;
      // streets, then the river and its two bridges
      g.strokeStyle = C.line;
      for (let k = 0; k <= 12; k++) {
        g.globalAlpha = k % 4 ? 0.35 : 0.7;
        const gx = M.x + (k / 12) * M.w, gy = M.y + (k / 12) * M.h;
        g.beginPath(); g.moveTo(gx, M.y); g.lineTo(gx, M.y + M.h); g.moveTo(M.x, gy); g.lineTo(M.x + M.w, gy); g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = "rgba(98,182,255,0.12)"; g.strokeStyle = "rgba(98,182,255,0.35)";
      g.beginPath();
      for (let k = 0; k <= 24; k++) g.lineTo(this.X(SPLIT - 0.022 + Math.sin((k / 24) * 7) * 0.008), this.Y(k / 24));
      for (let k = 24; k >= 0; k--) g.lineTo(this.X(SPLIT + 0.022 + Math.sin((k / 24) * 7) * 0.008), this.Y(k / 24));
      g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = C.mute; g.lineWidth = 3;
      for (const by of BRIDGES) { g.beginPath(); g.moveTo(this.X(SPLIT - 0.04), this.Y(by)); g.lineTo(this.X(SPLIT + 0.04), this.Y(by)); g.stroke(); }
      // each route: the leg under way solid, the rest of the day dashed
      for (const t of this.techs) {
        if (!t.on && !t.job) continue;
        let from = this.where(t);
        g.strokeStyle = ink[t.i]; g.globalAlpha = this.hov === t.i ? 0.95 : 0.6; g.lineWidth = this.hov === t.i ? 2.2 : 1.4;
        (t.job ? [t.job] : []).concat(t.route.map((id) => this.jobs[id])).forEach((j, k) => {
          g.setLineDash(k ? [4, 4] : []);
          g.beginPath(); streets(from, j).forEach((p, q) => (q ? g.lineTo(this.X(p.x), this.Y(p.y)) : g.moveTo(this.X(p.x), this.Y(p.y)))); g.stroke();
          from = j;
        });
      }
      g.setLineDash([]); g.globalAlpha = 1;
      // jobs: hollow while planned, filled once done, red if it will be late, amber if nobody has it
      const js = 6.5;
      for (const j of this.jobs) {
        const x = this.X(j.x), y = this.Y(j.y), col = j.tech >= 0 ? ink[j.tech] : C.warn;
        const late = j.st === "done" ? j.late > 0 : j.tech >= 0 && j.eta > j.b;
        if (j.flash > 0) { g.strokeStyle = col; g.globalAlpha = j.flash; g.lineWidth = 1; g.beginPath(); g.arc(x, y, js + (1 - j.flash) * 18, 0, TAU); g.stroke(); g.globalAlpha = 1; }
        g.beginPath();
        if (j.hot) { g.moveTo(x, y - js * 0.9); g.lineTo(x + js * 0.9, y); g.lineTo(x, y + js * 0.9); g.lineTo(x - js * 0.9, y); g.closePath(); }
        else g.rect(x - js / 2, y - js / 2, js, js);
        if (j.st === "done") { g.fillStyle = late ? C.bad : C.dim; g.globalAlpha = 0.6; g.fill(); g.globalAlpha = 1; }
        else if (j.tech < 0) { g.strokeStyle = C.warn; g.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 6); g.lineWidth = 1.5; g.stroke(); g.globalAlpha = 1; }
        else { g.fillStyle = j.st === "plan" ? C.bg : col; g.fill(); g.strokeStyle = late ? C.bad : col; g.lineWidth = late ? 2 : 1.3; g.stroke(); }
      }
      // technicians, and the homes they start from
      g.font = this.font(10, 600); g.textBaseline = "middle"; g.textAlign = "left";
      for (const t of this.techs) {
        const hx = this.X(t.home.x), hy = this.Y(t.home.y), hs = 5;
        g.strokeStyle = ink[t.i]; g.globalAlpha = t.on ? 0.55 : 0.25; g.lineWidth = 1;
        g.beginPath(); g.moveTo(hx - hs, hy); g.lineTo(hx, hy - hs); g.lineTo(hx + hs, hy); g.lineTo(hx + hs, hy + hs); g.lineTo(hx - hs, hy + hs); g.closePath(); g.stroke();
        const p = this.where(t), x = this.X(p.x), y = this.Y(p.y), lit = t.on || t.job;
        g.globalAlpha = 1;
        g.beginPath(); g.arc(x, y, this.hov === t.i ? 8 : 6, 0, TAU);
        g.fillStyle = lit ? ink[t.i] : C.dim; g.fill();
        g.strokeStyle = C.bg; g.lineWidth = 2; g.stroke();
        g.fillStyle = lit ? ink[t.i] : C.mute;
        g.fillText(t.on ? t.name : t.name + " · home", x + 10, y - 9);
      }
      // the clock
      g.font = this.font(13, 600); g.fillStyle = C.fg; g.fillText(hhmm(Math.min(this.T, DAY)), M.x, 11);
      g.font = this.font(10.5, 500); g.fillStyle = C.mute; g.textAlign = "right";
      g.fillText(this.hov >= 0 ? `send ${this.techs[this.hov].name} home` : "click the map: urgent job", M.x + M.w, 11);
      g.textAlign = "left";
      // the day, one thin row per technician
      const G = this.G;
      if (!G) return;
      const rh = (G.h - 8) / 5, X = (m) => G.x + 34 + (m / DAY) * (G.w - 34);
      g.font = this.font(9, 500);
      this.techs.forEach((t, k) => {
        const yc = G.y + 8 + k * rh + rh / 2;
        g.fillStyle = t.on ? C.mute : C.dim; g.fillText(t.name, G.x, yc);
        g.fillStyle = C.line; g.fillRect(X(0), yc - 0.5, X(DAY) - X(0), 1);
        if (!t.on) { g.globalAlpha = 0.5; g.fillRect(X(t.offAt), yc - rh * 0.3, X(DAY) - X(t.offAt), rh * 0.6); g.globalAlpha = 1; }
        for (const j of this.jobs) {
          if (j.tech !== k) continue;
          const st = j.st === "plan" ? j.eta : j.st === "go" ? Math.max(t.leg ? t.leg.t1 : j.eta, j.a) : j.start;
          if (st == null) continue;
          const x0 = X(st), x1 = X(Math.min(DAY, st + j.dur)), late = j.st === "done" ? j.late > 0 : j.eta > j.b;
          g.fillStyle = late ? C.bad : ink[k]; g.globalAlpha = j.st === "done" ? 0.35 : j.st === "plan" ? 0.75 : 1;
          g.fillRect(x0, yc - rh * 0.3, Math.max(2, x1 - x0 - 1), rh * 0.6);
        }
        g.globalAlpha = 1;
      });
      g.fillStyle = C.fg; g.globalAlpha = 0.6; g.fillRect(X(Math.min(this.T, DAY)), G.y + 6, 1, G.h - 6); g.globalAlpha = 1;
    }
  }

  const KINDS = { relay: Relay, tracewise: Tracewise, onboard: Onboard, dispatch: Dispatch, atlas: Atlas, intonation: Studio, arena: Arena, layerline: Layerline };

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    let any = false;
    for (const s of all) if (s.seen) { s.tick(dt); any = true; }
    if (!any) { cancelAnimationFrame(raf); raf = 0; last = 0; }
  }
  const wake = () => { if (motion && !raf && !document.hidden) { last = 0; raf = requestAnimationFrame(loop); } };
  document.addEventListener("visibilitychange", wake);
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((en) => en.forEach((e) => { const s = e.target._sim; if (!s) return; s.seen = e.isIntersecting; if (s.seen) { s.size(); s.paint(); wake(); } }), { rootMargin: "60px 0px" })
    : null;

  window.Sims = {
    has: (kind) => !!KINDS[kind],
    mount(host, kind, o) {
      const K = KINDS[kind];
      if (!K) return null;
      const s = new K(host, o);
      host._sim = s;
      all.push(s);
      if (s.init) s.init();
      s.size();
      if (!motion && s.step) s.kick(); else s.paint();
      if (io) io.observe(host); else { s.seen = true; wake(); }
      return s;
    },
    motion(on) {
      motion = on;
      if (on) wake();
      else { cancelAnimationFrame(raf); raf = 0; all.forEach((s) => s.kick()); }
    },
    theme() { all.forEach((s) => { s.theme(); s.paint(); }); },
    resize() { all.forEach((s) => { s.size(); s.paint(); }); }
  };
})();
