/*
 * Tracewise: a checkout system of eleven services. Slow one down and the slowness climbs up the
 * call graph to the alert at the gateway. A personalised PageRank walk starts at the alert and
 * follows callers to callees in proportion to how much slower each callee got; a service whose
 * own time grew holds the walk. Its stationary weight times its own anomaly is the blame.
 * "Closest to the alert" is the guess a dashboard makes: blame the service that is paging.
 */
(function (root) {
  "use strict";
  const { TAU, SANS, INK, RED, lerp, ink, rgba, rng, font, rrect, bez, bezPath, inside, label, Fig } = root.FigKit;

  // [name, layer, own time in ms]
  const SV = [
    ["gateway", 0, 12], ["auth", 1, 8], ["orders", 1, 14], ["catalog", 1, 9],
    ["payments", 2, 18], ["inventory", 2, 10], ["notify", 2, 6],
    ["card-api", 3, 40], ["postgres", 3, 6], ["redis", 3, 2], ["kafka", 3, 4],
  ];
  const EDGES = [[0, 1], [0, 2], [0, 3], [2, 4], [2, 5], [2, 6], [4, 7], [4, 8], [5, 8], [5, 9], [3, 9], [1, 9], [6, 10]];
  const AUTO = [4, 7, 8, 5, 3, 9, 2, 10, 1, 6];

  class Tracewise extends Fig {
    constructor(o) {
      super(o);
      this.rand = rng(5);
      this.sv = SV.map(([id, layer, base], i) => ({ id, layer, base, i, ex: base, inc: 0, kids: [], glow: 0 }));
      for (const [a, b] of EDGES) this.sv[a].kids.push(b);
      const inc0 = (i) => this.sv[i].base + this.sv[i].kids.reduce((t, k) => t + inc0(k), 0);
      this.sv.forEach((v) => { v.inc0 = inc0(v.i); v.inc = v.inc0; });
      this.slo = Math.round((this.sv[0].inc0 * 1.35) / 10) * 10;
      this.target = 4;
      this.amount = 0;
      this.alert = false;
      this.rank = [];
      this.ae = new Float64Array(SV.length);
      this.ai = new Float64Array(SV.length);
      this.dots = [];
      this.acc = new Float32Array(EDGES.length);
      this.autoT = 1.5;
      this.autoI = 0;
      this.hit = -1;
      this.slider = { label: "Latency added", min: 0, max: 400, step: 5, value: 0, fmt: (v) => "+" + Math.round(v) + " ms" };
    }
    set(v) { this.amount = v; this.slider.value = v; this.auto = false; }
    autoplay(dt) {
      this.autoT -= dt;
      if (this.autoT > 0) return;
      if (this.amount > 0) { this.amount = 0; this.autoT = 2.2; }
      else { this.target = AUTO[this.autoI++ % AUTO.length]; this.amount = Math.round((120 + 140 * this.rand()) / 5) * 5; this.autoT = 6; }
      this.slider.value = this.amount;
    }
    step(dt) {
      super.step(dt);
      if (this.auto) this.autoplay(dt);
      const a = 1 - Math.exp(-dt / 0.6);
      for (const v of this.sv) {
        const want = (v.base + (v.i === this.target ? this.amount : 0)) * (1 + (this.rand() - 0.5) * 0.05);
        v.ex += (want - v.ex) * a;
        v.glow = Math.max(0, v.glow - dt * 2);
      }
      // a service waits on every call it makes, one after another
      const inc = (i) => { const v = this.sv[i]; v.inc = v.ex + v.kids.reduce((t, k) => t + inc(k), 0); return v.inc; };
      inc(0);
      const g = this.sv[0].inc;
      if (!this.alert && g > this.slo) { this.alert = true; this.fx("alert"); }
      else if (this.alert && g < this.slo * 0.95) this.alert = false;
      this.blame();
      // spans: requests travel down an edge, replies come back up; slow callees answer slowly
      EDGES.forEach((e, k) => {
        this.acc[k] += dt * 1.6;
        if (this.acc[k] >= 1) { this.acc[k] -= 1 + this.rand() * 0.4; this.dots.push({ k, u: 0, back: false }); }
      });
      for (const d of this.dots) {
        const callee = this.sv[EDGES[d.k][1]];
        const dur = d.back ? 0.25 + callee.inc / 220 : 0.45;
        d.u += dt / dur;
        if (d.u >= 1 && !d.back) { d.back = true; d.u = 0; }
      }
      this.dots = this.dots.filter((d) => !(d.back && d.u >= 1));
    }
    blame() {
      const n = this.sv.length, ae = this.ae, ai = this.ai;
      for (const v of this.sv) { ae[v.i] = Math.max(0, v.ex / v.base - 1); ai[v.i] = Math.max(0, v.inc / v.inc0 - 1); }
      let x = new Float64Array(n);
      x[0] = 1;
      const d = 0.85;
      for (let it = 0; it < 40; it++) {
        const y = new Float64Array(n);
        y[0] += 1 - d;
        for (const v of this.sv) {
          const stay = ae[v.i] + 0.02;
          let tot = stay;
          for (const k of v.kids) tot += ai[k] + 0.01;
          y[v.i] += (d * x[v.i] * stay) / tot;
          for (const k of v.kids) y[k] += (d * x[v.i] * (ai[k] + 0.01)) / tot;
        }
        x = y;
      }
      const sc = this.sv.map((v) => ({ i: v.i, s: x[v.i] * (ae[v.i] + 0.01) }));
      const tot = sc.reduce((t, q) => t + q.s, 0) || 1;
      sc.forEach((q) => (q.s /= tot));
      sc.sort((p, q) => q.s - p.s);
      this.rank = sc.slice(0, 3);
    }
    lay() {
      if (this.L) return this.L;
      const { w, h, s } = this, L = { n: [] };
      const layers = [[], [], [], []];
      this.sv.forEach((v) => layers[v.layer].push(v.i));
      if (!this.tall) {
        const x0 = w * 0.03, gw = w * 0.64, y0 = h * 0.1, gh = h * 0.8;
        const nw = Math.min((gw / 4) * 0.74, 128 * s), nh = 26 * s;
        layers.forEach((ids, l) => ids.forEach((i, j) => {
          const cx = x0 + (l + 0.5) * (gw / 4), cy = y0 + (j + 0.5) * (gh / ids.length);
          L.n[i] = { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
        }));
        L.e = EDGES.map(([a, b]) => {
          const A = L.n[a], B = L.n[b], p0 = [A.x + A.w, A.y + A.h / 2], p3 = [B.x, B.y + B.h / 2], m = (p3[0] - p0[0]) * 0.5;
          return [p0, [p0[0] + m, p0[1]], [p3[0] - m, p3[1]], p3];
        });
        L.panel = { x: w * 0.71, y: h * 0.1, w: w * 0.26 };
      } else {
        const x0 = w * 0.04, gw = w * 0.92, y0 = h * 0.04, gh = h * 0.58;
        const nh = 24 * s;
        layers.forEach((ids, l) => ids.forEach((i, j) => {
          const nw = Math.min((gw / ids.length) * 0.84, 120 * s);
          const cx = x0 + (j + 0.5) * (gw / ids.length), cy = y0 + (l + 0.5) * (gh / 4);
          L.n[i] = { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
        }));
        L.e = EDGES.map(([a, b]) => {
          const A = L.n[a], B = L.n[b], p0 = [A.x + A.w / 2, A.y + A.h], p3 = [B.x + B.w / 2, B.y], m = (p3[1] - p0[1]) * 0.5;
          return [p0, [p0[0], p0[1] + m], [p3[0], p3[1] - m], p3];
        });
        L.panel = { x: w * 0.06, y: h * 0.67, w: w * 0.88 };
      }
      this.L = L;
      return L;
    }
    move(x, y) {
      super.move(x, y);
      const L = this.lay();
      this.hit = L.n.findIndex((r) => inside(x, y, r, 4));
      return this.hit >= 0 ? "pointer" : "";
    }
    leave() { super.leave(); this.hit = -1; }
    down(x, y) {
      this.move(x, y);
      if (this.hit < 0) return false;
      this.auto = false;
      this.target = this.hit;
      this.sv[this.hit].glow = 1;
      if (this.amount < 40) { this.amount = 220; this.slider.value = 220; this.fx("slider", 220); }
      this.fx("pick", this.sv[this.hit].id);
      return true;
    }
    draw(ctx) {
      const L = this.lay(), { s } = this, c = this.color;
      ctx.lineCap = "round";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 1;
      L.e.forEach((p, k) => {
        const slow = this.ai[EDGES[k][1]];
        ctx.strokeStyle = slow > 0.4 ? rgba(RED, Math.min(0.55, 0.15 + slow * 0.1)) : ink(0.13);
        ctx.beginPath(); bezPath(ctx, p); ctx.stroke();
      });
      for (const d of this.dots) {
        const p = L.e[d.k], slow = this.ai[EDGES[d.k][1]];
        const [x, y] = bez(p, d.back ? 1 - d.u : d.u);
        ctx.fillStyle = d.back && slow > 0.4 ? RED : d.back ? INK : c;
        ctx.globalAlpha = d.back ? 0.85 : 0.95;
        ctx.beginPath();
        ctx.arc(x, y, 2.3 * s, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const top = this.alert ? this.rank[0].i : -1;
      this.sv.forEach((v) => {
        const r = L.n[v.i], ai = this.ai[v.i], ae = this.ae[v.i], hov = this.hit === v.i;
        rrect(ctx, r.x, r.y, r.w, r.h, 6 * s);
        ctx.fillStyle = ai > 0.05 ? rgba(RED, Math.min(0.28, ai * 0.1)) : hov ? rgba(c, 0.1) : "rgba(255,255,255,0.03)";
        ctx.fill();
        ctx.strokeStyle = ae > 0.5 ? RED : hov ? c : v.glow > 0 ? rgba(c, v.glow) : ink(0.22);
        ctx.lineWidth = ae > 0.5 || hov ? 1.5 : 1;
        ctx.stroke();
        ctx.lineWidth = 1;
        label(ctx, v.id, r.x + r.w / 2, r.y + r.h / 2, 11 * s, ai > 0.3 ? "#ffd6d6" : INK, "center", 500);
        if (s > 0.7) label(ctx, Math.round(v.inc) + " ms", r.x + r.w / 2, r.y + r.h + 9 * s, 9 * s, ai > 0.3 ? rgba(RED, 0.85) : ink(0.34), "center");
        if (v.i === top) {
          rrect(ctx, r.x - 5 * s, r.y - 5 * s, r.w + 10 * s, r.h + 10 * s, 9 * s);
          ctx.strokeStyle = c;
          ctx.setLineDash([4 * s, 3 * s]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (v.i === 0 && this.alert) label(ctx, "ALERT", r.x + r.w / 2, r.y - 11 * s, 9.5 * s, RED, "center", 600);
      });

      // panel: latency against the SLO, then the blame
      const P = L.panel, g = this.sv[0].inc;
      let y = P.y + 6 * s;
      label(ctx, "checkout latency", P.x, y, 10 * s, ink(0.45));
      y += 26 * s;
      label(ctx, Math.round(g) + " ms", P.x, y, 28 * s, this.alert ? RED : INK, "left", 600, SANS);
      label(ctx, "SLO " + this.slo + " ms", P.x + P.w, y + 4 * s, 10 * s, ink(0.4), "right");
      y += 34 * s;
      if (!this.alert) {
        label(ctx, "All quiet.", P.x, y, 12 * s, ink(0.6), "left", 500);
        label(ctx, "Click a service to slow it down.", P.x, y + 18 * s, 10.5 * s, ink(0.42));
        return;
      }
      label(ctx, "tracewise blames", P.x, y, 10 * s, ink(0.45));
      y += 20 * s;
      this.rank.forEach((q, k) => {
        const v = this.sv[q.i];
        label(ctx, (k + 1) + "  " + v.id, P.x, y, 12 * s, k ? ink(0.6) : INK, "left", k ? 400 : 600);
        label(ctx, Math.round(q.s * 100) + "%", P.x + P.w, y, 11 * s, k ? ink(0.5) : c, "right", 500);
        ctx.fillStyle = k ? ink(0.12) : rgba(c, 0.7);
        ctx.fillRect(P.x, y + 9 * s, P.w * q.s, 2 * s);
        y += 26 * s;
      });
      const right = this.rank[0].i === this.target;
      label(ctx, right ? "✓ that is the one I broke" : "✗ not the one I broke", P.x, y, 10.5 * s, right ? c : RED);
      y += 24 * s;
      label(ctx, "closest to the alert", P.x, y, 10 * s, ink(0.4));
      label(ctx, "gateway " + (this.target === 0 ? "✓" : "✗"), P.x + P.w, y, 10.5 * s, this.target === 0 ? ink(0.6) : rgba(RED, 0.8), "right");
    }
    stats() {
      const g = this.sv[0].inc;
      return [
        [Math.round(g) + " ms", "checkout latency"],
        [this.alert ? this.sv[this.rank[0].i].id : "none", "top suspect"],
        [this.sv[this.target].id, "service you slowed"],
      ];
    }
  }

  root.Figs.Tracewise = Tracewise;
})(window);
