/* Dispatch: a field-service day that re-plans itself when the day changes. */
(function (root) {
  "use strict";
  const { RED, AMBER, clamp, ink, rgba, rng, rrect, label, Fig } = root.FigKit;

  /* ================================================================ Dispatch
   * Five technicians and a day of jobs across a small city cut by a river with two bridges. Each
   * job has a place, a time window and a length. The plan comes from regret insertion, then
   * relocate moves until a few milliseconds run out. When the day changes (someone goes home, an
   * urgent job lands, traffic slows the city) the jobs already done or under way are frozen and the
   * rest is re-planned from the current plan. The full project, with its own measurements, is
   * /dispatch/; this is the small working version for the map.
   */
  const DAY = 600; // minutes, 08:00 to 18:00
  const RATE = 13; // simulated minutes per second
  const TECH = [["Mei", "#ff7ab6", 0.08, 0.14], ["Sam", "#7cc4ff", 0.93, 0.16], ["Ravi", "#9be7c4", 0.09, 0.86], ["Jo", "#ffc978", 0.92, 0.88], ["Lena", "#c9b6ff", 0.4, 0.5]];
  const SPLIT = 0.56, BRIDGES = [0.27, 0.73];
  const hhmm = (m) => { const t = Math.round(480 + m), h = Math.floor(t / 60), mm = t % 60; return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; };
  const west = (p) => p.x < SPLIT;

  function dist(a, b) {
    if (west(a) === west(b)) return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    let best = Infinity;
    for (const by of BRIDGES) best = Math.min(best, Math.abs(a.x - b.x) + Math.abs(a.y - by) + Math.abs(by - b.y));
    return best;
  }
  // the streets taken: across then down, or down to a bridge, over it, then down again
  function legPts(a, b) {
    if (west(a) === west(b)) return [a, { x: b.x, y: a.y }, b];
    let by = BRIDGES[0];
    for (const y of BRIDGES) if (Math.abs(a.y - y) + Math.abs(y - b.y) < Math.abs(a.y - by) + Math.abs(by - b.y)) by = y;
    return [a, { x: a.x, y: by }, { x: b.x, y: by }, b];
  }
  function along(pts, f) {
    let tot = 0;
    for (let i = 1; i < pts.length; i++) tot += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
    let d = clamp(f, 0, 1) * tot;
    for (let i = 1; i < pts.length; i++) {
      const s = Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
      if (d <= s || i === pts.length - 1) { const k = s ? d / s : 1; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k }; }
      d -= s;
    }
    return pts[pts.length - 1];
  }

  class Dispatch extends Fig {
    constructor(o) {
      super(o);
      this.seed = 7;
      this.traffic = 0;
      this.slider = { label: "Traffic", min: 0, max: 80, step: 5, value: 0, fmt: (v) => (v ? `+${v}% slower` : "free-flowing") };
      this.hit = -1;
      this.newDay();
    }
    set(v) {
      this.slider.value = v;
      this.auto = false;
      if (v / 100 === this.traffic) return;
      this.traffic = v / 100;
      this.replan(v ? `Traffic ${v}% slower` : "Traffic clears");
    }
    tt(a, b) { return dist(a, b) * 72 * (1 + this.traffic); }

    newDay() {
      const r = rng(this.seed++);
      this.T = 0;
      this.techs = TECH.map(([name, col, x, y], i) => ({ i, name, col, home: { x, y }, pos: { x, y }, free: 0, on: true, offAt: DAY, job: null, route: [], leg: null }));
      this.jobs = [];
      for (let k = 0; k < 24; k++) {
        let x = 0.05 + r() * 0.9;
        if (Math.abs(x - SPLIT) < 0.05) x += x < SPLIT ? -0.06 : 0.06;
        const appt = r() < 0.5, dur = 20 + Math.round(r() * 7) * 5;
        const a = appt ? Math.round((r() * 420) / 30) * 30 : 0;
        this.jobs.push({ id: k, x, y: 0.06 + r() * 0.88, a, b: appt ? a + 120 : DAY - dur, dur, pr: 1, tech: -1, st: "plan", eta: 0, flash: 0 });
      }
      this.script = [[100, "home"], [175, "urgent"], [265, "urgent"], [350, "urgent"]];
      this.msg = null;
      this.last = 0;
      this.replan(null, true);
    }

    /* ------------------------------------------------ planning */
    // where and when each technician can take a new job, after whatever is frozen
    startOf(t) {
      const j = t.job;
      if (j) return { from: j, avail: j.st === "work" ? j.start + j.dur : Math.max(t.leg.t1, j.a) + j.dur };
      return { from: t.pos, avail: Math.max(this.T, t.free) };
    }
    evalRoute(t, st, route, out) {
      // lateness first, then driving, then how long customers wait (which also spreads the work)
      let time = st.avail, pos = st.from, late = 0, drive = 0, wait = 0;
      for (const id of route) {
        const j = this.jobs[id], d = this.tt(pos, j);
        drive += d;
        const s = Math.max(time + d, j.a);
        late += Math.max(0, s - j.b) * j.pr;
        wait += s - j.a;
        if (out) j.eta = s;
        time = s + j.dur;
        pos = j;
      }
      const over = Math.max(0, time + this.tt(pos, t.home) - DAY);
      return late * 8 + drive + over * 3 + wait * 0.08;
    }
    bestSpot(id, routes, sts, costs) {
      let best = { c: Infinity, ti: -1, p: -1 }, second = Infinity;
      for (const t of this.techs) {
        if (!t.on) continue;
        const r = routes[t.i];
        let bt = Infinity, bp = -1;
        for (let p = 0; p <= r.length; p++) {
          r.splice(p, 0, id);
          const c = this.evalRoute(t, sts[t.i], r) - costs[t.i];
          r.splice(p, 1);
          if (c < bt) { bt = c; bp = p; }
        }
        if (bt < best.c) { second = best.c; best = { c: bt, ti: t.i, p: bp }; } else if (bt < second) second = bt;
      }
      best.regret = second === Infinity ? 1e6 : second - best.c;
      return best;
    }
    replan(why, quiet, before = this.jobs.map((j) => j.tech)) {
      const t0 = performance.now();
      const sts = this.techs.map((t) => this.startOf(t));
      const routes = this.techs.map((t) => (t.on ? t.route.slice() : []));
      const pool = this.jobs.filter((j) => j.st === "plan" && (j.tech < 0 || !this.techs[j.tech].on || !routes[j.tech].includes(j.id))).map((j) => j.id);
      const costs = this.techs.map((t) => this.evalRoute(t, sts[t.i], routes[t.i]));
      // regret insertion: place first the job that would cost most to place second-best
      while (pool.length && this.techs.some((t) => t.on)) {
        let pick = null;
        for (const id of pool) {
          const b = this.bestSpot(id, routes, sts, costs);
          if (!pick || b.regret > pick.b.regret || (b.regret === pick.b.regret && b.c < pick.b.c)) pick = { id, b };
        }
        routes[pick.b.ti].splice(pick.b.p, 0, pick.id);
        costs[pick.b.ti] = this.evalRoute(this.techs[pick.b.ti], sts[pick.b.ti], routes[pick.b.ti]);
        pool.splice(pool.indexOf(pick.id), 1);
      }
      // then relocate moves until the budget runs out
      const r = rng(this.seed * 31 + Math.round(this.T));
      const ids = routes.flat();
      for (let it = 0; it < 4000 && ids.length && performance.now() - t0 < 4; it++) {
        const id = ids[(r() * ids.length) | 0], ti = routes.findIndex((x) => x.includes(id)), p = routes[ti].indexOf(id);
        routes[ti].splice(p, 1);
        const old = costs[ti];
        costs[ti] = this.evalRoute(this.techs[ti], sts[ti], routes[ti]);
        const b = this.bestSpot(id, routes, sts, costs);
        if (b.ti >= 0 && b.c < old - costs[ti] - 1e-9) {
          routes[b.ti].splice(b.p, 0, id);
          costs[b.ti] = this.evalRoute(this.techs[b.ti], sts[b.ti], routes[b.ti]);
        } else {
          routes[ti].splice(p, 0, id);
          costs[ti] = old;
        }
      }
      this.techs.forEach((t) => {
        t.route = routes[t.i];
        t.route.forEach((id) => (this.jobs[id].tech = t.i));
        this.evalRoute(t, sts[t.i], t.route, true);
      });
      for (const id of pool) this.jobs[id].tech = -1;
      this.last = performance.now() - t0;
      // a job counts as moved when it had a technician before the change and has another now
      let moved = 0;
      this.jobs.forEach((j, k) => { if (j.st === "plan" && before[k] >= 0 && before[k] !== j.tech) { moved++; j.flash = 1; } });
      if (!quiet) {
        const fresh = this.jobs[before.length];
        const who = fresh && fresh.tech >= 0 ? ` · ${this.techs[fresh.tech].name} takes it` : "";
        this.msg = { text: `${why}${who} · ${moved} moved, re-planned in ${this.last.toFixed(1)} ms`, t: this.t };
        this.fx("replan", this.last);
      }
    }

    /* ------------------------------------------------ the day changes */
    sendHome(t) {
      if (!t.on) return;
      const before = this.jobs.map((j) => j.tech);
      t.on = false;
      t.offAt = this.T;
      // a job under way is finished; one they were driving to goes back in the pool
      if (t.job && t.job.st === "go") { t.job.st = "plan"; t.job.tech = -1; t.job = null; t.leg = null; }
      t.route.forEach((id) => (this.jobs[id].tech = -1));
      t.route = [];
      this.fx("home");
      this.replan(`${t.name} went home at ${hhmm(this.T)}`, false, before);
    }
    urgent(x, y) {
      const T = Math.min(this.T, DAY - 90), before = this.jobs.map((j) => j.tech);
      this.jobs.push({ id: this.jobs.length, x: clamp(x, 0.03, 0.97), y: clamp(y, 0.03, 0.97), a: T, b: T + 90, dur: 30, pr: 3, tech: -1, st: "plan", eta: 0, flash: 1, hot: true });
      this.replan(`Urgent job at ${hhmm(T)}`, false, before);
    }

    /* ------------------------------------------------ the clock */
    step(dt) {
      super.step(dt);
      const T0 = this.T;
      this.T += dt * RATE;
      if (this.auto) for (const ev of this.script) {
        if (ev[2] || this.T < ev[0]) continue;
        ev[2] = true;
        const r = rng(this.seed * 7 + ev[0]);
        if (ev[1] === "home") { const on = this.techs.filter((t) => t.on && t.route.length); if (on.length) this.sendHome(on[(r() * on.length) | 0]); }
        else this.urgent(0.1 + r() * 0.8, 0.1 + r() * 0.8);
      }
      for (const t of this.techs) {
        for (let guard = 0; guard < 4; guard++) {
          const j = t.job;
          if (j) {
            if (j.st === "go" && this.T >= t.leg.t1) { j.st = "work"; j.start = Math.max(t.leg.t1, j.a); j.late = Math.max(0, j.start - j.b); }
            if (j.st === "work" && this.T >= j.start + j.dur) { j.st = "done"; t.pos = { x: j.x, y: j.y }; t.free = j.start + j.dur; t.job = null; t.leg = null; this.fx("done"); continue; }
            break;
          }
          if (!t.on || !t.route.length) break;
          const n = this.jobs[t.route.shift()];
          const dep = Math.max(t.free, T0);
          n.st = "go";
          t.job = n;
          t.leg = { from: { ...t.pos }, t0: dep, t1: dep + this.tt(t.pos, n) };
        }
      }
      this.jobs.forEach((j) => (j.flash = Math.max(0, j.flash - dt * 0.6)));
      if ((this.etaT = (this.etaT || 0) + dt) > 0.25) { this.etaT = 0; this.techs.forEach((t) => this.evalRoute(t, this.startOf(t), t.route, true)); }
      if (this.T > DAY + 40) this.newDay();
    }
    where(t) {
      if (!t.on && !t.job) return t.home;
      const j = t.job;
      if (j && j.st === "go") return along(legPts(t.leg.from, j), (this.T - t.leg.t0) / Math.max(1e-6, t.leg.t1 - t.leg.t0));
      if (j) return j;
      return t.pos;
    }

    /* ------------------------------------------------ pointer */
    lay() {
      if (this.L) return this.L;
      const { w, h, s } = this, L = {};
      const gh = Math.max(5 * 17 * s + 30 * s, h * (this.tall ? 0.3 : 0.32));
      L.map = { x: w * 0.03, y: 34 * s, w: w * 0.94, h: h - gh - 50 * s };
      L.g = { x: w * 0.03, y: L.map.y + L.map.h + 16 * s, w: w * 0.94, h: gh };
      L.gx = L.g.x + 46 * s;
      L.rh = (L.g.h - 22 * s) / 5;
      this.L = L;
      return L;
    }
    X(x) { const m = this.lay().map; return m.x + x * m.w; }
    Y(y) { const m = this.lay().map; return m.y + y * m.h; }
    techAt(x, y) {
      const L = this.lay(), s = this.s;
      for (const t of this.techs) { const p = this.where(t); if (Math.hypot(x - this.X(p.x), y - this.Y(p.y)) < 14 * s) return t.i; }
      if (x >= L.g.x && x <= L.g.x + L.g.w && y >= L.g.y + 18 * s) { const k = Math.floor((y - L.g.y - 18 * s) / L.rh); if (k >= 0 && k < 5) return k; }
      return -1;
    }
    onMap(x, y) { const m = this.lay().map; return x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h; }
    move(x, y) {
      super.move(x, y);
      this.hit = this.techAt(x, y);
      if (this.hit >= 0) return this.techs[this.hit].on ? "pointer" : "";
      return this.onMap(x, y) ? "crosshair" : "";
    }
    leave() { super.leave(); this.hit = -1; }
    down(x, y) {
      const k = this.techAt(x, y);
      if (k >= 0) { this.sendHome(this.techs[k]); return true; }
      if (this.onMap(x, y)) { const m = this.lay().map; this.urgent((x - m.x) / m.w, (y - m.y) / m.h); return true; }
      return false;
    }
    stats() {
      const all = this.jobs, done = all.filter((j) => j.st === "done").length;
      const ok = all.filter((j) => (j.st === "done" ? !j.late : j.st !== "plan" || j.tech >= 0 ? j.eta <= j.b : false)).length;
      return [[Math.round((100 * ok) / all.length) + "%", "on time, projected"], [`${done} / ${all.length}`, "jobs done"], [this.last.toFixed(1) + " ms", "last re-plan"]];
    }

    /* ------------------------------------------------ drawing */
    draw(ctx) {
      const L = this.lay(), { s } = this, m = L.map, c = this.color;
      ctx.textBaseline = "middle";
      // streets, the river and its two bridges
      ctx.lineWidth = 1;
      for (let k = 0; k <= 12; k++) {
        ctx.strokeStyle = k % 4 ? ink(0.045) : ink(0.09);
        const gx = m.x + (k / 12) * m.w, gy = m.y + (k / 12) * m.h;
        ctx.beginPath(); ctx.moveTo(gx, m.y); ctx.lineTo(gx, m.y + m.h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(m.x, gy); ctx.lineTo(m.x + m.w, gy); ctx.stroke();
      }
      ctx.fillStyle = "rgba(98,182,255,0.10)";
      ctx.strokeStyle = "rgba(98,182,255,0.28)";
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) { const y = k / 24; ctx.lineTo(this.X(SPLIT - 0.022 + Math.sin(y * 7) * 0.008), this.Y(y)); }
      for (let k = 24; k >= 0; k--) { const y = k / 24; ctx.lineTo(this.X(SPLIT + 0.022 + Math.sin(y * 7) * 0.008), this.Y(y)); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = ink(0.4);
      ctx.lineWidth = 3 * s;
      for (const by of BRIDGES) { ctx.beginPath(); ctx.moveTo(this.X(SPLIT - 0.04), this.Y(by)); ctx.lineTo(this.X(SPLIT + 0.04), this.Y(by)); ctx.stroke(); }
      ctx.lineWidth = 1;

      // each route: the leg under way solid, the rest of the day dashed
      for (const t of this.techs) {
        if (!t.on && !t.job) continue;
        const stops = (t.job ? [t.job] : []).concat(t.route.map((id) => this.jobs[id]));
        let from = this.where(t);
        ctx.strokeStyle = rgba(t.col, this.hit === t.i ? 0.95 : 0.55);
        ctx.lineWidth = (this.hit === t.i ? 2.2 : 1.4) * s;
        stops.forEach((j, k) => {
          const pts = legPts(from, j);
          ctx.setLineDash(k ? [4 * s, 4 * s] : []);
          ctx.beginPath();
          pts.forEach((p, q) => (q ? ctx.lineTo(this.X(p.x), this.Y(p.y)) : ctx.moveTo(this.X(p.x), this.Y(p.y))));
          ctx.stroke();
          from = j;
        });
      }
      ctx.setLineDash([]);
      ctx.lineWidth = 1;

      // jobs: hollow while planned, filled once done, red if it will be late, amber if nobody has it
      const js = 6.5 * s;
      for (const j of this.jobs) {
        const x = this.X(j.x), y = this.Y(j.y), t = this.techs[j.tech];
        const late = j.st === "done" ? j.late > 0 : j.tech >= 0 && j.eta > j.b;
        if (j.flash > 0) {
          ctx.strokeStyle = rgba(t ? t.col : AMBER, j.flash);
          ctx.beginPath(); ctx.arc(x, y, js + (1 - j.flash) * 18 * s, 0, 7); ctx.stroke();
        }
        ctx.beginPath();
        if (j.hot) { ctx.moveTo(x, y - js * 0.9); ctx.lineTo(x + js * 0.9, y); ctx.lineTo(x, y + js * 0.9); ctx.lineTo(x - js * 0.9, y); ctx.closePath(); }
        else ctx.rect(x - js / 2, y - js / 2, js, js);
        if (j.st === "done") { ctx.fillStyle = late ? rgba(RED, 0.5) : ink(0.22); ctx.fill(); }
        else if (j.tech < 0) { ctx.strokeStyle = rgba(AMBER, 0.5 + 0.5 * Math.sin(this.t * 6)); ctx.lineWidth = 1.5 * s; ctx.stroke(); }
        else {
          ctx.fillStyle = j.st === "plan" ? "#0a0b0d" : rgba(t.col, 0.5);
          ctx.fill();
          ctx.strokeStyle = late ? RED : t.col;
          ctx.lineWidth = (late ? 2 : 1.3) * s;
          ctx.stroke();
        }
        ctx.lineWidth = 1;
      }

      // technicians, and the homes they start from
      for (const t of this.techs) {
        const hx = this.X(t.home.x), hy = this.Y(t.home.y), hs = 5 * s;
        ctx.strokeStyle = rgba(t.col, t.on ? 0.5 : 0.25);
        ctx.beginPath(); ctx.moveTo(hx - hs, hy); ctx.lineTo(hx, hy - hs); ctx.lineTo(hx + hs, hy); ctx.lineTo(hx + hs, hy + hs); ctx.lineTo(hx - hs, hy + hs); ctx.closePath(); ctx.stroke();
        const p = this.where(t), x = this.X(p.x), y = this.Y(p.y), on = t.on || t.job;
        ctx.beginPath(); ctx.arc(x, y, (this.hit === t.i && t.on ? 8 : 6) * s, 0, 7);
        ctx.fillStyle = on ? t.col : ink(0.25);
        ctx.fill();
        ctx.strokeStyle = "#0a0b0d"; ctx.lineWidth = 2 * s; ctx.stroke(); ctx.lineWidth = 1;
        label(ctx, t.on ? t.name : t.name + " · home", x + 10 * s, y - 9 * s, 10 * s, on ? t.col : ink(0.4), "left", 600);
      }

      // the clock, and what just changed
      label(ctx, hhmm(Math.min(this.T, DAY)), m.x, 14 * s, 17 * s, ink(0.9), "left", 600);
      if (this.msg && this.t - this.msg.t < 4) {
        ctx.globalAlpha = clamp(4 - (this.t - this.msg.t), 0, 1);
        label(ctx, this.msg.text, m.x + m.w, 14 * s, 10.5 * s, c, "right", 500);
        ctx.globalAlpha = 1;
      } else if (this.hit >= 0 && this.techs[this.hit].on) label(ctx, `send ${this.techs[this.hit].name} home`, m.x + m.w, 14 * s, 10.5 * s, ink(0.6), "right", 500);
      else label(ctx, "click the map: urgent job", m.x + m.w, 14 * s, 10 * s, ink(0.35), "right", 400);

      // the day, one row per technician
      const g = L.g, gx = L.gx, gw = g.x + g.w - gx, X = (mm) => gx + (mm / DAY) * gw;
      for (let hr = 0; hr <= 10; hr += 2) {
        const x = X(hr * 60);
        label(ctx, String(8 + hr).padStart(2, "0"), x, g.y + 6 * s, 9 * s, ink(0.4), "center", 400);
        ctx.fillStyle = ink(0.06);
        ctx.fillRect(x, g.y + 14 * s, 1, g.h - 14 * s);
      }
      this.techs.forEach((t, k) => {
        const y = g.y + 18 * s + k * L.rh, rh = L.rh * 0.62, yc = y + L.rh / 2;
        label(ctx, t.name, g.x, yc, 10 * s, t.on ? (this.hit === k ? t.col : ink(0.75)) : ink(0.35), "left", 500);
        ctx.fillStyle = ink(0.05);
        ctx.fillRect(gx, yc - 0.5, gw, 1);
        if (!t.on) {
          ctx.fillStyle = ink(0.06);
          ctx.fillRect(X(t.offAt), yc - rh / 2, X(DAY) - X(t.offAt), rh);
          label(ctx, "home", X(t.offAt) + 6 * s, yc, 9 * s, ink(0.4), "left", 400);
        }
        for (const j of this.jobs) {
          if (j.tech !== k) continue;
          const st = j.st === "plan" ? j.eta : j.st === "go" ? Math.max(t.leg ? t.leg.t1 : j.eta, j.a) : j.start;
          if (st == null) continue;
          const x0 = X(st), x1 = X(Math.min(DAY, st + j.dur)), late = j.st === "done" ? j.late > 0 : j.eta > j.b;
          rrect(ctx, x0, yc - rh / 2, Math.max(2, x1 - x0), rh, 2 * s);
          ctx.fillStyle = rgba(t.col, j.st === "done" ? 0.3 : j.st === "plan" ? 0.75 : 1);
          ctx.fill();
          if (late) { ctx.strokeStyle = RED; ctx.lineWidth = 1.5 * s; ctx.stroke(); ctx.lineWidth = 1; }
          if (j.flash > 0) { ctx.strokeStyle = rgba("#ffffff", j.flash); ctx.stroke(); }
        }
      });
      const nx = X(Math.min(this.T, DAY));
      ctx.fillStyle = ink(0.6);
      ctx.fillRect(nx, g.y + 14 * s, 1, g.h - 14 * s);
    }
  }

  root.Figs.Dispatch = Dispatch;
})(typeof window !== "undefined" ? window : globalThis);
