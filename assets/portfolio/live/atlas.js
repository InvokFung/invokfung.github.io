/*
 * Atlas, small: search my 174 StudyLog notes right here, with no server. Each note is its title
 * plus its ten most distinctive terms. Two rankers run side by side: BM25 over words, and latent
 * semantic analysis (a TF-IDF matrix reduced to 24 dimensions by subspace iteration on the
 * note-by-note Gram matrix, queries folded in). Reciprocal rank fusion merges them; the slider
 * weighs one against the other. Every stage is timed on your device.
 */
(function (root) {
  "use strict";
  const { SANS, INK, clamp, ink, rgba, rng, font, fit, label, Fig } = root.FigKit;

  const STOP = new Set("the and for with from into that this what when how why are was were can its your you our not but all any use using via per vs part dev essentials series".split(" "));
  const tok = (s) => s.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  const DEMO = ["how does a database plan a query", "make docker images smaller", "retrieval with bm25 and reranking", "lighting and shadows in shaders", "why estimates slip", "consistent hashing and sharding"];
  const K = 24;

  function shortTitle(t) {
    const parts = t.split(" · ");
    const s = parts.length > 1 ? parts.slice(1).join(" · ") : t;
    return s.split(" — ")[0].trim();
  }

  class Index {
    constructor(rows) {
      const t0 = performance.now();
      this.docs = rows.map(([title, url, terms]) => ({ title: shortTitle(title), url, toks: tok(title).concat(tok(terms)) }));
      const N = (this.N = this.docs.length);
      // BM25
      this.df = new Map();
      this.tf = this.docs.map((d) => { const m = new Map(); d.toks.forEach((w) => m.set(w, (m.get(w) || 0) + 1)); m.forEach((_, w) => this.df.set(w, (this.df.get(w) || 0) + 1)); return m; });
      this.len = this.docs.map((d) => d.toks.length);
      this.avg = this.len.reduce((a, b) => a + b, 0) / N;
      // TF-IDF rows, unit length
      this.idf = new Map();
      this.df.forEach((n, w) => this.idf.set(w, Math.log(N / n)));
      this.rows = this.tf.map((m) => {
        const r = new Map();
        let nn = 0;
        m.forEach((c, w) => { const v = (1 + Math.log(c)) * this.idf.get(w); if (v > 0) { r.set(w, v); nn += v * v; } });
        nn = Math.sqrt(nn) || 1;
        r.forEach((v, w) => r.set(w, v / nn));
        return r;
      });
      // Gram matrix G = A Aᵀ through the inverted lists
      const post = new Map();
      this.rows.forEach((r, i) => r.forEach((v, w) => { if (!post.has(w)) post.set(w, []); post.get(w).push(i, v); }));
      const G = new Float64Array(N * N);
      post.forEach((l) => {
        for (let a = 0; a < l.length; a += 2) for (let b = 0; b < l.length; b += 2) G[l[a] * N + l[b]] += l[a + 1] * l[b + 1];
      });
      // top-K eigenvectors by subspace iteration: G = U Σ² Uᵀ
      const r = rng(3);
      let Q = new Float64Array(N * K).map(() => r() - 0.5);
      const orth = (M) => {
        for (let k = 0; k < K; k++) {
          for (let j = 0; j < k; j++) {
            let d = 0;
            for (let i = 0; i < N; i++) d += M[i * K + k] * M[i * K + j];
            for (let i = 0; i < N; i++) M[i * K + k] -= d * M[i * K + j];
          }
          let n = 0;
          for (let i = 0; i < N; i++) n += M[i * K + k] ** 2;
          n = Math.sqrt(n) || 1;
          for (let i = 0; i < N; i++) M[i * K + k] /= n;
        }
        return M;
      };
      orth(Q);
      const mul = (M) => {
        const Z = new Float64Array(N * K);
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const g = G[i * N + j];
          if (g) for (let k = 0; k < K; k++) Z[i * K + k] += g * M[j * K + k];
        }
        return Z;
      };
      for (let it = 0; it < 30; it++) Q = orth(mul(Q));
      const GQ = mul(Q);
      this.sig = new Float64Array(K);
      for (let k = 0; k < K; k++) { let l = 0; for (let i = 0; i < N; i++) l += Q[i * K + k] * GQ[i * K + k]; this.sig[k] = Math.sqrt(Math.max(l, 1e-12)); }
      this.U = Q;
      // each note in concept space, U Σ, unit length
      this.emb = this.docs.map((_, i) => {
        const v = new Float64Array(K);
        let n = 0;
        for (let k = 0; k < K; k++) { v[k] = Q[i * K + k] * this.sig[k]; n += v[k] ** 2; }
        n = Math.sqrt(n) || 1;
        return v.map((x) => x / n);
      });
      // a 2D shadow of concept space: the top two principal axes of the note vectors
      const mean = new Float64Array(K);
      this.emb.forEach((v) => { for (let k = 0; k < K; k++) mean[k] += v[k] / N; });
      const C = new Float64Array(K * K);
      this.emb.forEach((v) => { for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) C[a * K + b] += (v[a] - mean[a]) * (v[b] - mean[b]); });
      const axes = [];
      for (let p = 0; p < 2; p++) {
        let x = new Float64Array(K).map(() => r() - 0.5);
        for (let it = 0; it < 60; it++) {
          axes.forEach((u) => { let d = 0; for (let k = 0; k < K; k++) d += x[k] * u[k]; for (let k = 0; k < K; k++) x[k] -= d * u[k]; });
          const y = new Float64Array(K);
          for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) y[a] += C[a * K + b] * x[b];
          let n = 0;
          for (let k = 0; k < K; k++) n += y[k] ** 2;
          n = Math.sqrt(n) || 1;
          x = y.map((v) => v / n);
        }
        axes.push(x);
      }
      // start from that shadow, spread out, then let neighbours pull together (see relax)
      this.pos = new Float64Array(N * 2);
      this.emb.forEach((v, i) => {
        for (let a = 0; a < 2; a++) {
          let d = 0;
          for (let k = 0; k < K; k++) d += (v[k] - mean[k]) * axes[a][k];
          this.pos[i * 2 + a] = Math.sign(d) * Math.sqrt(Math.abs(d)) * 0.8;
        }
      });
      // each note's six nearest neighbours in meaning
      this.nn = this.emb.map((v, i) => {
        const sims = this.emb.map((u, j) => { let d = 0; for (let k = 0; k < K; k++) d += v[k] * u[k]; return [j === i ? -2 : d, j]; });
        return sims.sort((x, y) => y[0] - x[0]).slice(0, 6).map((x) => x[1]);
      });
      this.iter = 0;
      this.relax(0);
      this.buildMs = performance.now() - t0;
    }
    // a small force layout: every pair pushes apart, neighbours pull together. Run a few steps a frame
    // so the map visibly settles into topics the first time it is drawn.
    relax(n) {
      const N = this.N, P = this.pos, END = 220;
      for (let s = 0; s < n && this.iter < END; s++, this.iter++) {
        const a = 0.12 * (1 - this.iter / END) + 0.004;
        for (let i = 0; i < N; i++) {
          for (let j = i + 1; j < N; j++) {
            const dx = P[i * 2] - P[j * 2], dy = P[i * 2 + 1] - P[j * 2 + 1], r2 = dx * dx + dy * dy + 0.002;
            const f = (a * 0.0035) / r2;
            P[i * 2] += dx * f; P[i * 2 + 1] += dy * f; P[j * 2] -= dx * f; P[j * 2 + 1] -= dy * f;
          }
          for (const j of this.nn[i]) {
            const dx = P[j * 2] - P[i * 2], dy = P[j * 2 + 1] - P[i * 2 + 1];
            P[i * 2] += dx * a * 0.25; P[i * 2 + 1] += dy * a * 0.25;
          }
          P[i * 2] *= 1 - a * 0.08; P[i * 2 + 1] *= 1 - a * 0.08;
        }
      }
      // fit to the box by a high percentile, so one stray note can't shrink the rest
      const fit = [0, 1].map((k) => {
        const m = [];
        for (let i = 0; i < N; i++) m.push(P[i * 2 + k]);
        m.sort((x, y) => x - y);
        const lo = m[Math.floor(N * 0.02)], hi = m[Math.floor(N * 0.98)];
        return [(lo + hi) / 2, (hi - lo) / 2 || 1];
      });
      this.xy = [];
      for (let i = 0; i < N; i++) this.xy.push([0, 1].map((k) => clamp((P[i * 2 + k] - fit[k][0]) / fit[k][1], -1.12, 1.12)));
      return this.iter < END;
    }
    // where a query lands: among the notes it is closest to in meaning
    place(sc) {
      const top = Array.from(sc.keys()).filter((i) => sc[i] > 0).sort((a, b) => sc[b] - sc[a]).slice(0, 5);
      if (!top.length) return null;
      let x = 0, y = 0, W = 0;
      top.forEach((i) => { const w = sc[i] * sc[i]; x += this.xy[i][0] * w; y += this.xy[i][1] * w; W += w; });
      return [x / W, y / W];
    }
    bm25(q) {
      const k1 = 1.2, b = 0.75, sc = new Float64Array(this.N);
      for (const w of q) {
        const df = this.df.get(w);
        if (!df) continue;
        const idf = Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
        for (let i = 0; i < this.N; i++) {
          const f = this.tf[i].get(w);
          if (f) sc[i] += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * this.len[i]) / this.avg));
        }
      }
      return sc;
    }
    lsa(q) {
      // fold the query in: q̂ = (A q)ᵀ U Σ⁻¹
      const qv = new Map();
      q.forEach((w) => { const idf = this.idf.get(w); if (idf) qv.set(w, (qv.get(w) || 0) + idf); });
      const sc = new Float64Array(this.N);
      if (!qv.size) return sc;
      const Aq = new Float64Array(this.N);
      this.rows.forEach((r, i) => { let d = 0; qv.forEach((v, w) => { const x = r.get(w); if (x) d += x * v; }); Aq[i] = d; });
      const qh = new Float64Array(K);
      let n = 0;
      for (let k = 0; k < K; k++) { let d = 0; for (let i = 0; i < this.N; i++) d += Aq[i] * this.U[i * K + k]; qh[k] = d / this.sig[k]; }
      // compare in the same space as U Σ
      for (let k = 0; k < K; k++) { qh[k] *= this.sig[k] * this.sig[k]; n += qh[k] ** 2; }
      n = Math.sqrt(n) || 1;
      for (let k = 0; k < K; k++) qh[k] /= n;
      for (let i = 0; i < this.N; i++) { let d = 0; for (let k = 0; k < K; k++) d += qh[k] * this.emb[i][k]; sc[i] = d; }
      return sc;
    }
  }
  const order = (sc) => Array.from(sc.keys()).filter((i) => sc[i] > 1e-9).sort((a, b) => sc[b] - sc[a]);

  class Atlas extends Fig {
    constructor(o) {
      super(o);
      this.q = "";
      this.res = null;
      this.blend = 0.5;
      this.typing = { i: 0, k: 0, wait: 0.6 };
      this.external = false;
      this.hit = -1;
      this.slider = { label: "Words ↔ meaning", min: 0, max: 1, step: 0.05, value: 0.5, fmt: (v) => (v === 0.5 ? "even" : v < 0.5 ? Math.round((1 - v) * 100) + "% words" : Math.round(v * 100) + "% meaning") };
    }
    ready() {
      if (this.ix) return true;
      const rows = root.PORTFOLIO_NOTES;
      if (!rows) return false;
      this.ix = new Index(rows);
      return true;
    }
    set(v) { this.blend = v; this.slider.value = v; this.auto = false; this.run(); }
    query(q) { this.q = q; this.auto = false; this.run(); }
    run() {
      if (!this.ready()) return;
      // browsers round the clock to 0.1 ms, so each stage is timed over a few repeats
      const q = tok(this.q), R = 8;
      let sb, sl;
      const t0 = performance.now();
      for (let i = 0; i < R; i++) sb = this.ix.bm25(q);
      const t1 = performance.now();
      for (let i = 0; i < R; i++) sl = this.ix.lsa(q);
      const t2 = performance.now();
      const ob = order(sb).slice(0, 50), ol = order(sl).slice(0, 50);
      const rb = new Map(ob.map((d, r) => [d, r + 1])), rl = new Map(ol.map((d, r) => [d, r + 1]));
      const w = this.blend, all = [...new Set([...ob, ...ol])];
      let fused;
      for (let i = 0; i < R; i++) fused = all.map((d) => ({ d, s: (1 - w) / (60 + (rb.get(d) || 1000)) + w / (60 + (rl.get(d) || 1000)) })).sort((a, b) => b.s - a.s).map((x) => x.d);
      const t3 = performance.now();
      this.res = { ob: ob.slice(0, 6), ol: ol.slice(0, 6), fu: fused.slice(0, 6), rb, rl, ms: [(t1 - t0) / R, (t2 - t1) / R, (t3 - t2) / R] };
      this.sl = sl;
      this.qxy = this.ix.place(sl);
      if (this.qxy && !this.qpos) this.qpos = this.qxy.slice();
    }
    step(dt) {
      super.step(dt);
      if (!this.ready()) return;
      if (this.ix.relax(6) && this.sl) this.qxy = this.ix.place(this.sl);
      if (this.qxy && this.qpos) { const k = 1 - Math.exp(-dt * 8); this.qpos[0] += (this.qxy[0] - this.qpos[0]) * k; this.qpos[1] += (this.qxy[1] - this.qpos[1]) * k; }
      if (!this.auto) { if (!this.res) this.run(); return; }
      const ty = this.typing;
      ty.wait -= dt;
      if (ty.wait > 0) return;
      const target = DEMO[ty.i % DEMO.length];
      if (ty.k < target.length) { ty.k++; this.q = target.slice(0, ty.k); this.run(); ty.wait = 0.05 + Math.random() * 0.05; }
      else { ty.i++; ty.k = 0; ty.wait = 3.2; }
    }
    lay() {
      if (this.L) return this.L;
      const { w, h, s } = this;
      const L = {};
      L.qy = this.external ? 0 : h * 0.08;
      const top = this.external ? h * 0.06 : h * 0.19;
      if (!this.tall) {
        L.map = { x: w * 0.04, y: top + 8 * s, w: w * 0.44, h: h * 0.86 - top - 8 * s };
        L.list = { x: w * 0.55, y: top, w: w * 0.41 };
        L.list.rh = Math.min(54 * s, (h * 0.88 - top - 30 * s) / 6);
      } else {
        L.map = { x: w * 0.06, y: top + 8 * s, w: w * 0.88, h: h * 0.38 };
        L.list = { x: w * 0.06, y: top + h * 0.44, w: w * 0.88 };
        L.list.rh = Math.min(44 * s, (h * 0.9 - L.list.y - 30 * s) / 6);
      }
      this.L = L;
      return L;
    }
    pt(i) {
      const M = this.L.map, q = typeof i === "number" ? this.ix.xy[i] : i;
      return [M.x + M.w / 2 + (q[0] / 1.15) * (M.w / 2), M.y + M.h / 2 - (q[1] / 1.15) * (M.h / 2)];
    }
    item(r) {
      const C = this.L.list;
      return { x: C.x, y: C.y + 28 * this.s + r * C.rh, w: C.w, h: C.rh };
    }
    move(x, y) {
      super.move(x, y);
      this.hit = -1;
      this.dot = -1;
      if (!this.res || !this.ix) return "";
      this.lay();
      for (let r = 0; r < this.res.fu.length; r++) {
        const it = this.item(r);
        if (x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) { this.hit = r; return "pointer"; }
      }
      let best = (10 * this.s) ** 2;
      this.ix.xy.forEach((_, i) => { const [px, py] = this.pt(i), d = (px - x) ** 2 + (py - y) ** 2; if (d < best) { best = d; this.dot = i; } });
      return this.dot >= 0 ? "pointer" : "";
    }
    leave() { super.leave(); this.hit = -1; this.dot = -1; }
    down(x, y) {
      this.move(x, y);
      const d = this.hit >= 0 ? this.res.fu[this.hit] : this.dot;
      if (d < 0 || d === undefined) return false;
      this.fx("open", this.ix.docs[d].url);
      return true;
    }
    draw(ctx) {
      const L = this.lay(), { w, h, s } = this, c = this.color;
      ctx.textBaseline = "middle";
      if (!this.ix) { label(ctx, "loading notes…", w / 2, h / 2, 12 * s, ink(0.5), "center"); return; }
      if (!this.external) {
        label(ctx, "›", w * 0.04, L.qy, 18 * s, c, "left", 500);
        font(ctx, 17 * s, 400, SANS);
        ctx.fillStyle = INK;
        ctx.textAlign = "left";
        const qx = w * 0.04 + 20 * s;
        ctx.fillText(this.q, qx, L.qy);
        if ((this.t * 2) % 2 < 1.2) ctx.fillRect(qx + ctx.measureText(this.q).width + 2, L.qy - 10 * s, 1.5 * s, 20 * s);
        ctx.fillStyle = ink(0.12);
        ctx.fillRect(w * 0.04, L.qy + 18 * s, w * 0.92, 1);
      }
      const R = this.res, M = L.map;
      const focus = this.hit >= 0 && R ? R.fu[this.hit] : this.dot;

      // the meaning map: every note, placed by what it is about
      label(ctx, "meaning map · " + this.ix.N + " notes", M.x, M.y - 4 * s, 10 * s, ink(0.45), "left", 500);
      // faint threads to each note's nearest neighbours turn the cloud into topics
      ctx.strokeStyle = ink(0.07);
      ctx.lineWidth = 1;
      ctx.beginPath();
      this.ix.nn.forEach((l, i) => { const [x, y] = this.pt(i); l.slice(0, 3).forEach((j) => { if (j < i) return; const [u, v] = this.pt(j); ctx.moveTo(x, y); ctx.lineTo(u, v); }); });
      ctx.stroke();
      ctx.fillStyle = ink(0.42);
      const r0 = Math.max(1.5, 3 * s);
      this.ix.xy.forEach((_, i) => { const [x, y] = this.pt(i); ctx.fillRect(x - r0 / 2, y - r0 / 2, r0, r0); });
      if (R) {
        // words hits as rings, meaning hits as filled dots
        R.ob.forEach((d) => { const [x, y] = this.pt(d); ctx.strokeStyle = ink(0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 5 * s, 0, 7); ctx.stroke(); });
        R.ol.forEach((d) => { const [x, y] = this.pt(d); ctx.fillStyle = rgba(c, 0.85); ctx.beginPath(); ctx.arc(x, y, 3 * s, 0, 7); ctx.fill(); });
        if (this.qpos) {
          const [qx, qy] = this.pt(this.qpos);
          R.fu.forEach((d, r) => {
            const [x, y] = this.pt(d), on = focus === d;
            ctx.strokeStyle = rgba(c, on ? 0.95 : 0.55 - r * 0.07);
            ctx.lineWidth = on ? 1.6 * s : 1;
            ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(x, y); ctx.stroke();
            label(ctx, String(r + 1), x + 7 * s, y - 7 * s, 9.5 * s, on ? INK : c, "left", 600);
          });
          ctx.lineWidth = 1;
          ctx.fillStyle = INK;
          ctx.beginPath(); ctx.arc(qx, qy, 4.5 * s, 0, 7); ctx.fill();
          ctx.strokeStyle = rgba(c, 0.5);
          ctx.beginPath(); ctx.arc(qx, qy, (8 + 3 * Math.sin(this.t * 3)) * s, 0, 7); ctx.stroke();
          label(ctx, "your question", qx, qy + 16 * s, 9.5 * s, ink(0.6), "center");
        }
      }
      if (this.dot >= 0 && this.hit < 0) {
        const [x, y] = this.pt(this.dot);
        ctx.strokeStyle = INK;
        ctx.beginPath(); ctx.arc(x, y, 6 * s, 0, 7); ctx.stroke();
        font(ctx, 11 * s, 500, SANS);
        const t = fit(ctx, this.ix.docs[this.dot].title, M.w * 0.8), tw = ctx.measureText(t).width;
        const bx = clamp(x - tw / 2 - 8 * s, M.x, M.x + M.w - tw - 16 * s), by = y - 30 * s;
        ctx.fillStyle = "rgba(10,11,13,0.92)";
        ctx.fillRect(bx, by - 10 * s, tw + 16 * s, 20 * s);
        ctx.fillStyle = INK;
        ctx.textAlign = "left";
        ctx.fillText(t, bx + 8 * s, by);
      }

      // the fused list, with where each result came from
      const C = L.list;
      label(ctx, "fused · RRF", C.x, C.y, 10 * s, c, "left", 500);
      const legend = "○ words · BM25   ● meaning · LSA";
      font(ctx, 9.5 * s, 400);
      if (ctx.measureText(legend).width < C.w - 90 * s) label(ctx, legend, C.x + C.w, C.y, 9.5 * s, ink(0.4), "right");
      const li = R ? R.fu : [];
      if (!li.length) label(ctx, this.q ? "no match" : "", C.x, C.y + 34 * s, 11 * s, ink(0.3));
      li.forEach((d, r) => {
        const it = this.item(r), doc = this.ix.docs[d], hov = this.hit === r || focus === d;
        const big = r === 0, ty = it.y + it.h * 0.36;
        font(ctx, (big ? 14 : 12.5) * s, big ? 600 : 400, SANS);
        ctx.fillStyle = hov ? c : r ? ink(0.84) : INK;
        ctx.textAlign = "left";
        const tw = it.w - 22 * s;
        ctx.fillText(fit(ctx, doc.title, tw), it.x + 22 * s, ty);
        label(ctx, String(r + 1), it.x, ty, 10.5 * s, c, "left", 600);
        if (hov) { ctx.fillStyle = c; ctx.fillRect(it.x + 22 * s, ty + 10 * s, Math.min(tw, ctx.measureText(doc.title).width), 1); }
        if (it.h > 30 * s) {
          const wr = R.rb.get(d), mr = R.rl.get(d), sy = it.y + it.h * 0.74;
          label(ctx, "○ " + (wr ? "#" + wr : "–") + "    ● " + (mr ? "#" + mr : "–"), it.x + 22 * s, sy, 9.5 * s, ink(0.42));
        }
      });
      if (R) {
        const ms = (v) => (v < 0.1 ? v.toFixed(3) : v.toFixed(2));
        label(ctx, `bm25 ${ms(R.ms[0])} ms · lsa ${ms(R.ms[1])} ms · fuse ${ms(R.ms[2])} ms · no server`, w * 0.04, h * 0.95, 10 * s, ink(0.38));
      }
    }
    stats() {
      const R = this.res;
      const tot = R ? R.ms[0] + R.ms[1] + R.ms[2] : 0;
      return [[R ? tot.toFixed(2) + " ms" : "…", "this query, on your device"], [this.ix ? this.ix.N : 174, "notes indexed"], [this.ix ? Math.round(this.ix.buildMs) + " ms" : "…", "to build the index here"]];
    }
  }

  root.Figs.Atlas = Atlas;
})(window);
