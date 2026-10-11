/*
 * Onboard: three systems remember the same customers differently. Every pair of records is
 * compared field by field (name by Jaro-Winkler after nickname folding, email, phone, postcode),
 * each agreement level carries a Fellegi-Sunter weight log2(m/u), and pairs whose total clears the
 * threshold are joined with union-find. Precision, recall and F1 are scored live against the
 * generator's truth. Here m and u are counted from that truth; the real Onboard learns them with EM.
 */
(function (root) {
  "use strict";
  const { SANS, INK, RED, AMBER, clamp, ink, rgba, rng, font, rrect, fit, label, Fig } = root.FigKit;

  const FIRST = [["Robert", "Bob"], ["Christopher", "Chris"], ["Katherine", "Kate"], ["William", "Will"], ["Benjamin", "Ben"], ["Thomas", "Tom"], ["Elizabeth", "Liz"], ["Jennifer", "Jen"], ["Michael", "Mike"], ["Samantha", "Sam"], ["Daniel", "Dan"], ["Rebecca", "Becky"], ["Anthony", "Tony"], ["Margaret", "Maggie"], ["Jonathan", "Jon"], ["Victoria", "Vicky"], ["Matthew", "Matt"], ["Patricia", "Pat"], ["Nicholas", "Nick"], ["Alexandra", "Alex"], ["Stephen", "Steve"], ["Catherine", "Cathy"]];
  const LAST = ["Chan", "Wong", "Lee", "Cheung", "Lau", "Ng", "Ho", "Tsang", "Leung", "Yip", "Kwok", "Lam", "Tang", "Chow", "Mak", "Siu"];
  const NICK = {};
  FIRST.forEach(([f, n]) => (NICK[n.toLowerCase()] = f.toLowerCase()));
  const SRC = ["CRM", "BILL", "DESK"];

  function jaro(a, b) {
    if (a === b) return 1;
    const la = a.length, lb = b.length;
    if (!la || !lb) return 0;
    const md = Math.max(0, (Math.max(la, lb) >> 1) - 1), ma = new Uint8Array(la), mb = new Uint8Array(lb);
    let m = 0;
    for (let i = 0; i < la; i++) {
      for (let j = Math.max(0, i - md); j < Math.min(lb, i + md + 1); j++) {
        if (!mb[j] && a[i] === b[j]) { ma[i] = mb[j] = 1; m++; break; }
      }
    }
    if (!m) return 0;
    let t = 0, k = 0;
    for (let i = 0; i < la; i++) if (ma[i]) { while (!mb[k]) k++; if (a[i] !== b[k]) t++; k++; }
    return (m / la + m / lb + (m - t / 2) / m) / 3;
  }
  function jw(a, b) {
    const j = jaro(a, b);
    let p = 0;
    while (p < 4 && a[p] && a[p] === b[p]) p++;
    return j + p * 0.1 * (1 - j);
  }
  function normName(n) {
    let s = n.toLowerCase();
    if (s.includes(",")) { const [l, f] = s.split(","); s = f.trim() + " " + l.trim(); }
    const parts = s.replace(/[^a-z ]/g, "").split(/\s+/).filter(Boolean);
    if (parts.length) parts[0] = NICK[parts[0]] || parts[0];
    return parts.join(" ");
  }

  // a seeded, deliberately messy customer base: nicknames, typos, households, namesakes
  function generate(seed) {
    const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)];
    const ids = [];
    const firsts = FIRST.slice().sort(() => r() - 0.5);
    for (let i = 0; i < 22; i++) {
      const [first, nick] = firsts[i];
      const last = pick(LAST);
      ids.push({ first, nick, last, zip: "K" + (10 + Math.floor(r() * 80)), mob: "9" + String(Math.floor(r() * 1e7)).padStart(7, "0") });
    }
    // households share a surname, a landline, a postcode and a family inbox
    for (const [a, b] of [[3, 4], [9, 10], [15, 16]]) {
      ids[b].last = ids[a].last; ids[b].zip = ids[a].zip;
      ids[a].home = ids[b].home = "2" + String(Math.floor(r() * 1e7)).padStart(7, "0");
      ids[a].fam = ids[b].fam = ids[a].last.toLowerCase() + ".family@mail.hk";
    }
    // two different people with the same name
    ids[13].first = ids[12].first; ids[13].nick = ids[12].nick; ids[13].last = ids[12].last;
    // and two more who also share a postcode: neighbours with the same name
    ids[19].first = ids[18].first; ids[19].nick = ids[18].nick; ids[19].last = ids[18].last; ids[19].zip = ids[18].zip;
    // someone who moved: the help desk has a new address, number and inbox
    ids[7].moved = true;
    const recs = [];
    ids.forEach((p, id) => {
      const work = (p.first[0] + "." + p.last + "@" + pick(["northwind", "contoso", "fabrikam", "initech"]) + ".com").toLowerCase();
      const own = (p.nick + p.last + Math.floor(r() * 90 + 10) + "@gmail.com").toLowerCase();
      recs.push({ src: 0, id, name: p.first + " " + p.last, email: work, phone: p.mob, zip: p.zip });
      if (r() < 0.86) recs.push({ src: 1, id, name: p.last.toUpperCase() + ", " + p.first, email: p.fam && r() < 0.8 ? p.fam : r() < 0.6 ? work : own, phone: p.home || p.mob, zip: p.zip });
      if (r() < 0.8) {
        let last = p.last;
        if (r() < 0.25 && last.length > 3) { const k = 1 + Math.floor(r() * (last.length - 2)); last = last.slice(0, k) + last[k + 1] + last[k] + last.slice(k + 2); }
        if (p.moved) recs.push({ src: 2, id, name: p.first + " " + last, email: own, phone: "6" + String(Math.floor(r() * 1e7)).padStart(7, "0"), zip: "K" + (10 + Math.floor(r() * 80)) });
        else recs.push({ src: 2, id, name: (r() < 0.55 ? p.nick : p.first) + " " + last, email: r() < 0.6 ? own : work, phone: r() < 0.4 ? "" : p.mob, zip: p.zip });
      }
    });
    return recs;
  }

  function levels(a, b) {
    const n = jw(a.nn, b.nn);
    const exact = (x, y) => (!x || !y ? 1 : x === y ? 2 : 0);
    return [n >= 0.96 ? 2 : n >= 0.88 ? 1 : 0, exact(a.email, b.email), exact(a.phone, b.phone), a.zip === b.zip ? 2 : 0];
  }

  function f1(groupOf, recs) {
    let tp = 0, fp = 0, fn = 0;
    for (let i = 0; i < recs.length; i++) for (let j = i + 1; j < recs.length; j++) {
      const same = recs[i].id === recs[j].id, joined = groupOf[i] === groupOf[j];
      if (same && joined) tp++; else if (joined) fp++; else if (same) fn++;
    }
    const p = tp / (tp + fp || 1), r = tp / (tp + fn || 1);
    return { p, r, f: p + r ? (2 * p * r) / (p + r) : 0 };
  }

  class Onboard extends Fig {
    constructor(o) {
      super(o);
      const recs = (this.recs = generate(42));
      recs.forEach((q) => { q.nn = normName(q.name); q.u = q.v = null; });
      const pairs = (this.pairs = []);
      for (let i = 0; i < recs.length; i++) for (let j = i + 1; j < recs.length; j++) pairs.push({ i, j, lv: levels(recs[i], recs[j]), same: recs[i].id === recs[j].id });
      // m and u for each field and level, with a little smoothing
      const cnt = (same) => [0, 1, 2, 3].map((f) => [0, 1, 2].map((l) => pairs.filter((p) => p.same === same && p.lv[f] === l).length + 0.5));
      const M = cnt(true), U = cnt(false), sum = (a) => a.reduce((x, y) => x + y, 0);
      this.wt = M.map((row, f) => row.map((m, l) => Math.log2(m / sum(row) / (U[f][l] / sum(U[f])))));
      pairs.forEach((p) => (p.score = p.lv.reduce((t, l, f) => t + this.wt[f][l], 0)));
      this.no = new Set(pairs.filter((p) => p.lv[0] === 0).map((p) => p.i * 1000 + p.j));
      // the baseline: join on email alone
      const byMail = {}, g = recs.map((q, i) => (q.email ? (byMail[q.email] ??= i) : i));
      this.mailF = f1(g, recs).f;
      this.people = new Set(recs.map((q) => q.id)).size;
      this.th = 9;
      this.slider = { label: "Match threshold", min: -6, max: 24, step: 0.5, value: 9, fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(1) + " bits" };
      this.hit = -1;
      this.cluster();
    }
    set(v) { this.th = v; this.slider.value = v; this.auto = false; this.cluster(); }
    cluster() {
      const n = this.recs.length, par = Array.from({ length: n }, (_, i) => i);
      const find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
      const mem = this.recs.map((_, i) => [i]);
      // guard rule: two clearly different names never end up in one customer, however strong
      // the rest of the evidence (a shared family inbox, landline and postcode is a household)
      const clash = (a, b) => mem[a].some((i) => mem[b].some((j) => this.no.has(i < j ? i * 1000 + j : j * 1000 + i)));
      for (const p of this.pairs) {
        if (p.score < this.th) continue;
        const a = find(p.i), b = find(p.j);
        if (a === b || clash(a, b)) continue;
        par[a] = b;
        mem[b] = mem[b].concat(mem[a]);
      }
      const g = this.recs.map((_, i) => find(i));
      this.m = f1(g, this.recs);
      const map = new Map();
      g.forEach((root, i) => { if (!map.has(root)) map.set(root, []); map.get(root).push(i); });
      const groups = [...map.values()].map((m) => m.sort((a, b) => this.recs[a].src - this.recs[b].src || a - b));
      groups.sort((a, b) => Math.min(...a.map((i) => this.recs[i].id)) - Math.min(...b.map((i) => this.recs[i].id)));
      const homes = {};
      groups.forEach((m, k) => m.forEach((i) => { const id = this.recs[i].id; (homes[id] ??= new Set()).add(k); }));
      this.groups = groups.map((m) => {
        const ids = new Set(m.map((i) => this.recs[i].id));
        return { m, merged: ids.size > 1, split: [...ids].some((id) => homes[id].size > 1) };
      });
      this.L = null;
    }
    step(dt) {
      super.step(dt);
      if (this.auto) {
        const th = Math.round((9 + 10 * Math.sin(this.t * 0.32)) * 2) / 2;
        if (th !== this.th) { this.th = th; this.slider.value = th; this.cluster(); }
      }
      // positions live in 0..1 of the box, so zooming the map does not send records flying
      const L = this.lay(), k = 1 - Math.exp(-dt * 7);
      this.recs.forEach((q, i) => {
        const tx = L.pos[i][0] / this.w, ty = L.pos[i][1] / this.h;
        if (q.u === undefined || q.u === null) { q.u = tx; q.v = ty; }
        q.u += (tx - q.u) * k;
        q.v += (ty - q.v) * k;
      });
    }
    lay() {
      if (this.L) return this.L;
      const { w, h, s } = this;
      const L = { cards: [], pos: [] };
      const area = this.tall ? { x: w * 0.04, y: h * 0.03, w: w * 0.92, h: h * 0.72 } : { x: w * 0.03, y: h * 0.06, w: w * 0.68, h: h * 0.9 };
      L.panel = this.tall ? { x: w * 0.06, y: h * 0.8, w: w * 0.88 } : { x: w * 0.74, y: h * 0.1, w: w * 0.23 };
      const dense = s < 0.72;
      const gap = 8 * s, cw0 = dense ? 70 * s : 150 * s;
      const maxCols = Math.max(2, Math.floor((area.w + gap) / (cw0 + gap)));
      const rhMax = dense ? 12 * s : 21 * s;
      // size from the true customer count, not the current grouping, so sliding never reflows the columns
      const rowsAll = this.recs.length + this.people * 1.2;
      let cols = 2;
      while (cols < maxCols && (rowsAll * rhMax) / cols > area.h) cols++;
      const cw = (area.w - gap * (cols - 1)) / cols;
      const rh = clamp(area.h * cols / rowsAll, dense ? 6 * s : 13 * s, rhMax), pad = Math.max(4 * s, rh * 0.4);
      const top = area.y + Math.max(0, (area.h - (rowsAll * rh) / cols) / 2);
      const colY = new Array(cols).fill(top);
      for (const gp of this.groups) {
        let ci = 0;
        for (let k = 1; k < cols; k++) if (colY[k] < colY[ci] - 1) ci = k;
        const x = area.x + ci * (cw + gap), y = colY[ci], ch = pad * 2 + gp.m.length * rh;
        L.cards.push({ x, y, w: cw, h: ch, g: gp });
        gp.m.forEach((i, r) => (L.pos[i] = [x + pad, y + pad + r * rh + rh / 2]));
        colY[ci] += ch + gap;
      }
      // if the cards ran past the bottom, squeeze them to fit
      const over = Math.max(...colY) - (area.y + area.h);
      if (over > 0) {
        const k = area.h / (area.h + over);
        L.cards.forEach((cd) => { cd.y = area.y + (cd.y - area.y) * k; cd.h *= k; });
        L.pos = L.pos.map(([x, y]) => [x, area.y + (y - area.y) * k]);
        L.rh = rh * k;
      } else L.rh = rh;
      L.cw = cw;
      L.pad = pad;
      L.dense = dense;
      this.L = L;
      return L;
    }
    move(x, y) {
      super.move(x, y);
      const L = this.lay();
      this.hit = L.cards.findIndex((cd) => x >= cd.x && x <= cd.x + cd.w && y >= cd.y && y <= cd.y + cd.h);
      return "";
    }
    leave() { super.leave(); this.hit = -1; }
    draw(ctx) {
      const L = this.lay(), { s } = this, c = this.color;
      const tag = [c, INK, AMBER];
      ctx.textBaseline = "middle";
      const hot = this.hit >= 0 ? new Set(L.cards[this.hit].g.m.map((i) => this.recs[i].id)) : null;
      for (const cd of L.cards) {
        rrect(ctx, cd.x, cd.y, cd.w, cd.h, 6 * s);
        ctx.fillStyle = cd.g.merged ? rgba(RED, 0.07) : "rgba(255,255,255,0.025)";
        ctx.fill();
        ctx.strokeStyle = cd.g.merged ? rgba(RED, 0.8) : cd.g.split ? rgba(AMBER, 0.55) : ink(0.16);
        ctx.setLineDash(cd.g.split && !cd.g.merged ? [3 * s, 3 * s] : []);
        ctx.stroke();
        ctx.setLineDash([]);
        if (!L.dense && cd.g.merged) label(ctx, new Set(cd.g.m.map((i) => this.recs[i].id)).size + " people", cd.x + cd.w - 6 * s, cd.y + 9 * s, 8.5 * s, RED, "right", 600);
      }
      font(ctx, Math.min(10.5 * s, L.rh * 0.72), 400);
      ctx.textAlign = "left";
      this.recs.forEach((q, i) => {
        if (q.u === undefined || q.u === null) { q.u = L.pos[i][0] / this.w; q.v = L.pos[i][1] / this.h; }
        q.x = q.u * this.w;
        q.y = q.v * this.h;
        const dim = hot && !hot.has(q.id);
        ctx.globalAlpha = dim ? 0.3 : 1;
        if (L.dense) {
          ctx.fillStyle = tag[q.src];
          ctx.beginPath();
          ctx.arc(q.x + 3 * s, q.y, Math.max(1.2, L.rh * 0.3), 0, 7);
          ctx.fill();
          ctx.fillStyle = ink(0.35);
          ctx.fillRect(q.x + 8 * s, q.y - 0.5, L.cw * 0.55, 1);
          return;
        }
        ctx.fillStyle = tag[q.src];
        ctx.fillRect(q.x, q.y - L.rh * 0.3, 3 * s, L.rh * 0.6);
        ctx.fillStyle = hot && hot.has(q.id) ? INK : ink(0.78);
        ctx.fillText(fit(ctx, q.name, L.cw - 18 * s), q.x + 8 * s, q.y);
      });
      ctx.globalAlpha = 1;

      const P = L.panel;
      let y = P.y + 4 * s;
      label(ctx, "match F1, live", P.x, y, 10 * s, ink(0.45));
      y += 28 * s;
      label(ctx, this.m.f.toFixed(3), P.x, y, 30 * s, this.m.f > 0.9 ? INK : RED, "left", 600, SANS);
      y += 30 * s;
      label(ctx, "precision " + this.m.p.toFixed(2), P.x, y, 10.5 * s, this.m.p < 0.9 ? RED : ink(0.6));
      label(ctx, "recall " + this.m.r.toFixed(2), P.x + P.w, y, 10.5 * s, this.m.r < 0.9 ? AMBER : ink(0.6), "right");
      y += 22 * s;
      label(ctx, "email only " + this.mailF.toFixed(3), P.x, y, 10.5 * s, ink(0.42));
      y += 30 * s;
      label(ctx, this.recs.length + " records → " + this.groups.length + " customers", P.x, y, 10.5 * s, ink(0.7));
      y += 18 * s;
      label(ctx, "truth: " + this.people, P.x, y, 10 * s, ink(0.4));
      y += 28 * s;
      SRC.forEach((nm, k) => {
        ctx.fillStyle = tag[k];
        ctx.fillRect(P.x + k * 58 * s, y - 4 * s, 3 * s, 8 * s);
        label(ctx, nm, P.x + k * 58 * s + 8 * s, y, 9.5 * s, ink(0.55));
      });
      y += 22 * s;
      if (s > 0.7) {
        ctx.strokeStyle = rgba(RED, 0.8); rrect(ctx, P.x, y - 5 * s, 14 * s, 10 * s, 2 * s); ctx.stroke();
        label(ctx, "strangers merged", P.x + 20 * s, y, 9.5 * s, ink(0.5));
        y += 18 * s;
        ctx.strokeStyle = rgba(AMBER, 0.7); ctx.setLineDash([3 * s, 3 * s]); rrect(ctx, P.x, y - 5 * s, 14 * s, 10 * s, 2 * s); ctx.stroke(); ctx.setLineDash([]);
        label(ctx, "one person split", P.x + 20 * s, y, 9.5 * s, ink(0.5));
      }
    }
    stats() {
      return [[this.m.f.toFixed(3), "match F1, live"], [this.mailF.toFixed(3), "matching on email alone"], [this.groups.length + " / " + this.people, "customers found / true"]];
    }
  }

  root.Figs.Onboard = Onboard;
})(window);
