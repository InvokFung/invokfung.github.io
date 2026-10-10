/* Relay: the gateway toy that greets you on arrival. */
(function (root) {
  "use strict";
  const { TAU, SANS, INK, RED, AMBER, lerp, ink, rgba, rng, font, rrect, bez, bezPath, inside, label, fmtInt, pct, Fig } = root.FigKit;

  /* ================================================================ Relay
   * An LLM gateway between you and three model deployments. Requests pass nine stages; some are
   * answered from cache; the rest are routed to the healthiest deployment, retried elsewhere on
   * failure, and a circuit breaker per deployment (Wilson lower bound on the failure rate) stops
   * sending traffic to one that is down, then probes it until it recovers.
   * "Without Relay" sends each request to a fixed deployment once, with no cache and no retry.
   */
  class Relay extends Fig {
    constructor(o) {
      super(o);
      this.rand = rng(11);
      this.prov = ["us-east", "eu-west", "ap-south"].map((id, i) => ({
        id, i, up: true, lat: [0.85, 1, 1.2][i], win: [], state: "closed", until: 0, probe: false, glow: 0,
      }));
      this.failRate = 0;
      this.pk = [];
      this.acc = 0;
      this.n = 0;
      this.hist = [];
      this.glow = new Float32Array(9);
      this.you = 0;
      this.youBad = 0;
      this.poked = false;
      this.hit = -1;
      this.stages = ["redact", "screen", "cache", "route", "breaker", "hedge", "budget", "canary", "audit"];
      this.slider = { label: "Upstream failure rate", min: 0, max: 0.6, step: 0.01, value: 0, fmt: (v) => Math.round(v * 100) + "%" };
    }
    set(v) { this.failRate = v; this.slider.value = v; this.auto = false; }
    setOffline(on) {
      if (on) { this.saved = this.prov.map((p) => p.up); this.prov.forEach((p) => (p.up = false)); }
      else if (this.saved) { this.prov.forEach((p, i) => (p.up = this.saved[i])); this.saved = null; }
    }
    lay() {
      if (this.L) return this.L;
      const { w, h } = this, L = {};
      if (!this.tall) {
        L.C = [w * 0.07, h * 0.46];
        L.g = { x: w * 0.24, y: h * 0.22, w: w * 0.3, h: h * 0.48 };
        const gy = L.g.y + L.g.h / 2;
        L.gin = [L.g.x, gy];
        L.gout = [L.g.x + L.g.w, gy];
        L.P = [0, 1, 2].map((i) => ({ x: w * 0.72, y: h * (0.16 + 0.3 * i) - h * 0.075, w: w * 0.23, h: h * 0.15 }));
        L.paths = {
          in: [L.C, [L.C[0] + w * 0.08, L.C[1]], [L.gin[0] - w * 0.08, gy], L.gin],
          thru: [L.gin, [L.gin[0] + L.g.w / 3, gy], [L.gout[0] - L.g.w / 3, gy], L.gout],
        };
        L.P.forEach((p, i) => {
          const e = [p.x, p.y + p.h / 2];
          L.paths["o" + i] = [L.gout, [L.gout[0] + w * 0.09, gy], [e[0] - w * 0.09, e[1]], e];
        });
      } else {
        L.C = [w * 0.5, h * 0.1];
        L.g = { x: w * 0.18, y: h * 0.27, w: w * 0.64, h: h * 0.26 };
        const gx = L.g.x + L.g.w / 2;
        L.gin = [gx, L.g.y];
        L.gout = [gx, L.g.y + L.g.h];
        L.P = [0, 1, 2].map((i) => ({ x: w * (0.04 + 0.32 * i), y: h * 0.72, w: w * 0.28, h: h * 0.1 }));
        L.paths = {
          in: [L.C, [L.C[0], L.C[1] + h * 0.06], [gx, L.gin[1] - h * 0.06], L.gin],
          thru: [L.gin, [gx, L.gin[1] + L.g.h / 3], [gx, L.gout[1] - L.g.h / 3], L.gout],
        };
        L.P.forEach((p, i) => {
          const e = [p.x + p.w / 2, p.y];
          L.paths["o" + i] = [L.gout, [gx, L.gout[1] + h * 0.07], [e[0], e[1] - h * 0.07], e];
        });
      }
      this.L = L;
      return L;
    }
    spawn() {
      const r = this.rand;
      this.n++;
      const p0 = this.prov[this.n % 3];
      const cache = r() < 0.3;
      this.pk.push({
        q: [{ p: "in", a: 0, b: 1, d: 0.6 }, { p: "thru", a: 0, b: cache ? 0.25 : 1, d: cache ? 0.16 : 0.5 }],
        next: cache ? "cache" : "route",
        naive: p0.up && r() >= this.failRate,
        tried: [], tries: 0, col: 0, done: false,
      });
    }
    route(pk) {
      let best = null, bs = Infinity;
      for (const pv of this.prov) {
        if (pk.tried.includes(pv.i)) continue;
        if (!(pv.state === "closed" || (pv.state === "half" && !pv.probe))) continue;
        const sc = pv.lat * (0.6 + 0.8 * this.rand());
        if (sc < bs) { bs = sc; best = pv; }
      }
      if (best && best.state === "half") best.probe = true;
      return best;
    }
    record(pv, ok) {
      if (pv.state === "half") {
        pv.probe = false;
        if (ok) { pv.state = "closed"; pv.win = []; }
        else { pv.state = "open"; pv.until = this.t + 2.6; }
        return;
      }
      pv.win.push(ok ? 0 : 1);
      if (pv.win.length > 20) pv.win.shift();
      if (pv.state === "closed" && pv.win.length >= 5) {
        // open when even the optimistic end of the 95% interval says it is failing
        const n = pv.win.length, f = pv.win.reduce((a, b) => a + b, 0) / n, z = 1.96;
        const lb = (f + (z * z) / (2 * n) - z * Math.sqrt((f * (1 - f) + (z * z) / (4 * n)) / n)) / (1 + (z * z) / n);
        if (lb > 0.5) { pv.state = "open"; pv.until = this.t + 2.6; pv.win = []; this.fx("trip", pv.i); }
      }
    }
    act(pk) {
      const nx = pk.next;
      pk.next = null;
      const home = (then) => { pk.q.push({ p: "thru", a: 1, b: 0, d: 0.4 }, { p: "in", a: 1, b: 0, d: 0.55 }); pk.next = then; };
      if (nx === "route") {
        const pv = this.route(pk);
        if (!pv) { pk.col = 2; home("failed"); return; }
        pk.cur = pv.i;
        pk.tried.push(pv.i);
        pk.q.push({ p: "o" + pv.i, a: 0, b: 1, d: 0.32 * pv.lat });
        pk.next = "arrive";
      } else if (nx === "arrive") {
        const pv = this.prov[pk.cur];
        const ok = pv.up && this.rand() >= this.failRate;
        this.record(pv, ok);
        pv.glow = 1;
        pk.col = ok ? 1 : 2;
        pk.q.push({ p: "o" + pv.i, a: 1, b: 0, d: ok ? 0.32 * pv.lat : 0.2 });
        if (ok) home("served"); else pk.next = "retry";
      } else if (nx === "retry") {
        pk.tries++;
        if (pk.tries < 3) { pk.col = 0; pk.next = "route"; } else { pk.col = 2; home("failed"); }
      } else if (nx === "cache") {
        pk.col = 1;
        pk.q.push({ p: "thru", a: 0.25, b: 0, d: 0.14 }, { p: "in", a: 1, b: 0, d: 0.55 });
        pk.next = "served";
      } else if (nx === "served" || nx === "failed") {
        const ok = nx === "served";
        pk.done = true;
        this.hist.push(ok ? 1 : 0, pk.naive ? 1 : 0);
        if (this.hist.length > 80) this.hist.splice(0, 2);
        if (ok) this.you = 1; else this.youBad = 1;
        this.fx(ok ? "served" : "failed", pk.cur);
      }
    }
    adv(pk, dt) {
      for (let guard = 0; dt > 0 && !pk.done && guard < 10; guard++) {
        const sg = pk.q[0];
        if (!sg) { this.act(pk); continue; }
        const prev = sg.u || 0;
        sg.u = Math.min(1, prev + dt / sg.d);
        dt -= (sg.u - prev) * sg.d;
        if (sg.p === "thru" && sg.b > sg.a) {
          const t0 = lerp(sg.a, sg.b, prev), t1 = lerp(sg.a, sg.b, sg.u);
          for (let i = 0; i < 9; i++) { const st = (i + 0.5) / 9; if (st > t0 && st <= t1) this.glow[i] = 1; }
        }
        if (sg.u >= 1) pk.q.shift(); else break;
      }
    }
    step(dt) {
      super.step(dt);
      this.lay();
      for (const pv of this.prov) {
        if (pv.state === "open" && this.t > pv.until) pv.state = "half";
        pv.glow = Math.max(0, pv.glow - dt * 3);
      }
      this.acc += dt * 6.5;
      while (this.acc >= 1) { this.acc -= 1; this.spawn(); }
      for (let i = 0; i < 9; i++) this.glow[i] = Math.max(0, this.glow[i] - dt * 4);
      this.you = Math.max(0, this.you - dt * 3);
      this.youBad = Math.max(0, this.youBad - dt * 2);
      for (const pk of this.pk) this.adv(pk, dt);
      this.pk = this.pk.filter((p) => !p.done);
    }
    rates() {
      const hs = this.hist;
      if (hs.length < 8) return [1, 1];
      let a = 0, b = 0;
      for (let i = 0; i < hs.length; i += 2) { a += hs[i]; b += hs[i + 1]; }
      return [a / (hs.length / 2), b / (hs.length / 2)];
    }
    pos(sg, u) {
      const P = this.L.paths[sg.p];
      const t = lerp(sg.a, sg.b, u);
      const [x, y] = bez(P, t);
      if (sg.b >= sg.a) return [x, y];
      // replies travel in their own lane, just beside the requests
      const [x2, y2] = bez(P, Math.min(1, t + 0.01));
      const dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1, o = 5 * this.s;
      return [x - (dy / l) * o, y + (dx / l) * o];
    }
    move(x, y) {
      super.move(x, y);
      const L = this.lay();
      this.hit = L.P.findIndex((p) => inside(x, y, p, 6));
      return this.hit >= 0 ? "pointer" : "";
    }
    leave() { super.leave(); this.hit = -1; }
    down(x, y) {
      this.move(x, y);
      if (this.hit < 0) return false;
      const pv = this.prov[this.hit];
      pv.up = !pv.up;
      this.poked = true;
      this.auto = false;
      this.fx("toggle", { i: pv.i, up: pv.up });
      return true;
    }
    draw(ctx) {
      const L = this.lay(), { w, h, s } = this, c = this.color;
      ctx.lineCap = "round";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 1;

      // wires
      ctx.strokeStyle = ink(0.16);
      ctx.beginPath(); bezPath(ctx, L.paths.in); ctx.stroke();
      for (const pv of this.prov) {
        const bad = !pv.up || pv.state === "open";
        ctx.strokeStyle = bad ? rgba(RED, 0.35) : ink(0.16);
        ctx.setLineDash(bad ? [3 * s, 5 * s] : []);
        ctx.beginPath(); bezPath(ctx, L.paths["o" + pv.i]); ctx.stroke();
      }
      ctx.setLineDash([]);

      // the gateway and its nine stages
      const g = L.g;
      rrect(ctx, g.x, g.y, g.w, g.h, 12 * s);
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fill();
      ctx.strokeStyle = ink(0.22);
      ctx.stroke();
      label(ctx, "relay", g.x, g.y - 14 * s, 11 * s, ink(0.62), "left", 500);
      label(ctx, "9 stages", g.x + g.w, g.y - 14 * s, 10 * s, ink(0.36), "right");
      for (let i = 0; i < 9; i++) {
        const [x, y] = bez(L.paths.thru, (i + 0.5) / 9), gl = this.glow[i];
        ctx.strokeStyle = gl > 0.02 ? rgba(c, 0.1 + gl * 0.6) : ink(0.1);
        ctx.lineWidth = 1 + gl * 1.5;
        ctx.beginPath();
        if (!this.tall) { ctx.moveTo(x, g.y + 10 * s); ctx.lineTo(x, g.y + g.h - 10 * s); }
        else { ctx.moveTo(g.x + 12 * s, y); ctx.lineTo(g.x + g.w - 12 * s, y); }
        ctx.stroke();
        font(ctx, 9 * s, 400);
        ctx.fillStyle = gl > 0.05 ? rgba(c, 0.45 + gl * 0.55) : ink(0.3);
        if (!this.tall) {
          ctx.save();
          ctx.translate(x, g.y + g.h + 8 * s);
          ctx.rotate(Math.PI / 2);
          ctx.textAlign = "left";
          ctx.fillText(this.stages[i], 0, 0);
          ctx.restore();
        } else {
          ctx.textAlign = "left";
          ctx.fillText(this.stages[i], g.x + g.w + 8 * s, y);
        }
      }
      ctx.lineWidth = 1;

      // deployments
      for (const pv of this.prov) {
        const p = L.P[pv.i], hov = this.hit === pv.i;
        if (!this.poked && pv.i === 0 && this.auto) {
          const k = (this.t * 0.8) % 1;
          rrect(ctx, p.x - k * 10 * s, p.y - k * 10 * s, p.w + k * 20 * s, p.h + k * 20 * s, p.h / 2 + k * 10 * s);
          ctx.strokeStyle = rgba(c, 0.5 * (1 - k));
          ctx.stroke();
        }
        rrect(ctx, p.x, p.y, p.w, p.h, p.h / 2);
        ctx.fillStyle = pv.up ? (hov ? rgba(c, 0.08) : "rgba(255,255,255,0.03)") : rgba(RED, 0.08);
        ctx.fill();
        ctx.strokeStyle = !pv.up ? rgba(RED, 0.75) : hov ? rgba(c, 0.95) : ink(0.24 + pv.glow * 0.4);
        ctx.lineWidth = hov ? 1.5 : 1;
        ctx.stroke();
        ctx.lineWidth = 1;
        const bx = p.x + p.h * 0.5, by = p.y + p.h / 2, br = 4.5 * s;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, TAU);
        if (pv.state === "open") { ctx.strokeStyle = RED; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1; }
        else if (pv.state === "half") { ctx.fillStyle = AMBER; ctx.fill(); }
        else { ctx.fillStyle = pv.up ? c : RED; ctx.fill(); }
        label(ctx, pv.id, bx + 12 * s, by - 7 * s, 12.5 * s, pv.up ? INK : RED, "left", 500);
        const st = pv.state === "open" ? "breaker open" : pv.state === "half" ? "probing" : pv.up ? "healthy" : "failing";
        label(ctx, st, bx + 12 * s, by + 8 * s, 10 * s, pv.state === "open" || !pv.up ? rgba(RED, 0.85) : ink(0.45));
        if (hov) {
          const ty = this.tall ? p.y + p.h + 14 * s : p.y - 11 * s;
          label(ctx, pv.up ? "click to take it down" : "click to bring it back", p.x + p.w / 2, ty, 10 * s, c, "center");
        }
      }

      // you
      const [cx, cy] = L.C;
      ctx.beginPath();
      ctx.arc(cx, cy, 10 * s, 0, TAU);
      ctx.fillStyle = this.youBad > 0.05 ? rgba(RED, this.youBad * 0.5) : rgba(INK, this.you * 0.25);
      ctx.fill();
      ctx.strokeStyle = this.youBad > 0.05 ? RED : ink(0.6);
      ctx.stroke();
      if (this.tall) label(ctx, "you", cx + 18 * s, cy, 11 * s, ink(0.7), "left", 500);
      else label(ctx, "you", cx, cy + 24 * s, 11 * s, ink(0.7), "center", 500);

      // packets, each with a short tail along its own path
      for (const pk of this.pk) {
        const sg = pk.q[0];
        if (!sg) continue;
        const col = pk.col === 2 ? RED : pk.col === 1 ? INK : c;
        const u0 = sg.u || 0;
        ctx.fillStyle = col;
        for (let k = 4; k >= 0; k--) {
          const u = Math.max(0, u0 - k * 0.03);
          const [x, y] = this.pos(sg, u);
          ctx.globalAlpha = k ? 0.1 * (5 - k) : 1;
          ctx.beginPath();
          ctx.arc(x, y, (k ? 2 : 2.8) * s, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // readout
      const [ok, naive] = this.rates();
      const allDown = this.prov.every((p) => !p.up);
      const rx = this.tall ? w * 0.06 : w * 0.035, ry = this.tall ? h * 0.92 : h * 0.86;
      label(ctx, pct(ok), rx, ry, 30 * s, ok < 0.9 ? RED : INK, "left", 600, SANS);
      label(ctx, "answered, live", rx, ry + 24 * s, 10 * s, ink(0.5));
      const nx = rx + 150 * s;
      label(ctx, pct(naive), nx, ry, 20 * s, ink(0.55), "left", 500, SANS);
      label(ctx, "without Relay", nx, ry + 24 * s, 10 * s, ink(0.4));
      if (allDown) label(ctx, "Every deployment is down. Only cached answers get through.", g.x + g.w / 2, this.tall ? g.y - 34 * s : g.y - 40 * s, 11 * s, rgba(RED, 0.9), "center");
    }
    stats() {
      const [ok, naive] = this.rates();
      return [[pct(ok), "answered, live"], [pct(naive), "without Relay"], [fmtInt(this.n), "requests so far"]];
    }
  }

  root.Figs.Relay = Relay;
})(window);
