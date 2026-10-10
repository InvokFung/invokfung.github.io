/*
 * Layerline, small: a twisted gear as a real triangle mesh, sliced the way the C++ slicer does it.
 * Each triangle that crosses the plane gives a segment; segment ends are keyed by the mesh edge
 * they lie on, so stitching them into loops is exact. Loops are oriented (outline anticlockwise,
 * holes clockwise), offset inward for two walls, and the space between filled with rectilinear
 * lines at ±45°. A nozzle then traces the layer. The left view is the same slices, stacked.
 */
(function (root) {
  "use strict";
  const { TAU, INK, ink, rgba, label, Fig } = root.FigKit;

  const LAYERS = 36, M = 132, RINGS = 19, TEETH = 12, H = 0.9, TWIST = 0.55, BORE = 0.34, LW = 0.035;

  function toothR(th) {
    const k = (((th * TEETH) / TAU) % 1 + 1) % 1;
    const t = k < 0.38 ? 1 : k < 0.5 ? 1 - (k - 0.38) / 0.12 : k < 0.88 ? 0 : (k - 0.88) / 0.12;
    return 0.82 + 0.16 * t;
  }
  function hexR(th) {
    const a = ((th % (TAU / 6)) + TAU / 6) % (TAU / 6) - TAU / 12;
    return BORE / Math.cos(a) * Math.cos(TAU / 12);
  }

  function buildMesh() {
    const V = [], T = [];
    for (let j = 0; j < RINGS; j++) {
      const z = (j / (RINGS - 1)) * H, tw = (z / H) * TWIST;
      for (let i = 0; i < M; i++) { const th = (i / M) * TAU, r = toothR(th - tw); V.push([Math.cos(th) * r, Math.sin(th) * r, z]); }
      for (let i = 0; i < M; i++) { const th = (i / M) * TAU, r = hexR(th); V.push([Math.cos(th) * r, Math.sin(th) * r, z]); }
    }
    const o = (j, i) => j * 2 * M + (i % M), n = (j, i) => j * 2 * M + M + (i % M);
    for (let j = 0; j < RINGS - 1; j++) for (let i = 0; i < M; i++) {
      T.push([o(j, i), o(j, i + 1), o(j + 1, i + 1)], [o(j, i), o(j + 1, i + 1), o(j + 1, i)]);
      T.push([n(j, i), n(j + 1, i + 1), n(j, i + 1)], [n(j, i), n(j + 1, i), n(j + 1, i + 1)]);
    }
    for (const j of [0, RINGS - 1]) for (let i = 0; i < M; i++) T.push([o(j, i), n(j, i), n(j, i + 1)], [o(j, i), n(j, i + 1), o(j, i + 1)]);
    return { V, T };
  }

  function slice(mesh, z) {
    const { V, T } = mesh;
    const pt = new Map(), adj = new Map();
    const key = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
    const cut = (a, b) => {
      const k = key(a, b);
      if (!pt.has(k)) { const [p, q] = a < b ? [V[a], V[b]] : [V[b], V[a]]; const t = (z - p[2]) / (q[2] - p[2]); pt.set(k, [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
      return k;
    };
    let segs = 0;
    for (const [a, b, c] of T) {
      const za = V[a][2], zb = V[b][2], zc = V[c][2];
      if (Math.min(za, zb, zc) > z || Math.max(za, zb, zc) < z) continue;
      const ks = [];
      if ((za < z) !== (zb < z)) ks.push(cut(a, b));
      if ((zb < z) !== (zc < z)) ks.push(cut(b, c));
      if ((zc < z) !== (za < z)) ks.push(cut(c, a));
      if (ks.length !== 2) continue;
      segs++;
      for (const [p, q] of [[ks[0], ks[1]], [ks[1], ks[0]]]) { if (!adj.has(p)) adj.set(p, []); adj.get(p).push(q); }
    }
    // walk the segment graph into closed loops
    const seen = new Set(), loops = [];
    for (const start of adj.keys()) {
      if (seen.has(start)) continue;
      const loop = [];
      let cur = start, prev = -1;
      while (cur !== undefined && !seen.has(cur)) {
        seen.add(cur);
        loop.push(pt.get(cur));
        const nb = adj.get(cur);
        const nx = nb[0] !== prev ? nb[0] : nb[1];
        prev = cur;
        cur = nx;
      }
      if (loop.length > 2) loops.push(loop);
    }
    const area = (l) => l.reduce((t, p, i) => { const q = l[(i + 1) % l.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
    loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    loops.forEach((l, i) => { const a = area(l); if ((i === 0 && a < 0) || (i > 0 && a > 0)) l.reverse(); });
    return { loops, segs };
  }

  // move every edge left (into the material) by d, mitred, with a miter limit
  function offset(loop, d) {
    const n = loop.length, out = [];
    for (let i = 0; i < n; i++) {
      const p0 = loop[(i - 1 + n) % n], p1 = loop[i], p2 = loop[(i + 1) % n];
      let ax = p1[0] - p0[0], ay = p1[1] - p0[1], bx = p2[0] - p1[0], by = p2[1] - p1[1];
      const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
      ax /= la; ay /= la; bx /= lb; by /= lb;
      let nx = -ay - by, ny = ax + bx;
      const ln = Math.hypot(nx, ny) || 1;
      nx /= ln; ny /= ln;
      const cosh = nx * -ay + ny * ax;
      const k = d / Math.max(0.5, cosh);
      out.push([p1[0] + nx * k, p1[1] + ny * k]);
    }
    return out;
  }

  function infill(bounds, angle, gap) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const rot = (p) => [p[0] * ca + p[1] * sa, -p[0] * sa + p[1] * ca];
    const back = (x, y) => [x * ca - y * sa, x * sa + y * ca];
    const polys = bounds.map((l) => l.map(rot));
    let y0 = Infinity, y1 = -Infinity;
    polys[0].forEach((p) => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    const lines = [];
    let flip = false;
    for (let y = y0 + gap / 2; y < y1; y += gap) {
      const xs = [];
      for (const l of polys) for (let i = 0; i < l.length; i++) {
        const a = l[i], b = l[(i + 1) % l.length];
        if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      const row = [];
      for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > gap * 0.3) row.push([back(xs[i], y), back(xs[i + 1], y)]);
      if (flip) row.reverse().forEach((s) => s.reverse());
      flip = !flip;
      lines.push(...row);
    }
    return lines;
  }

  class Layerline extends Fig {
    constructor(o) {
      super(o);
      this.mesh = buildMesh();
      this.tris = this.mesh.T.length;
      this.stack = [];
      for (let k = 0; k < LAYERS; k++) this.stack.push(slice(this.mesh, ((k + 0.5) / LAYERS) * H).loops);
      this.layer = 0;
      this.prog = 0;
      this.slider = { label: "Layer", min: 1, max: LAYERS, step: 1, value: 1, fmt: (v) => Math.round(v) + " of " + LAYERS };
      this.cut();
    }
    set(v) { this.layer = Math.round(v) - 1; this.slider.value = this.layer + 1; this.auto = false; this.prog = 0; this.cut(); }
    cut() {
      const t0 = performance.now();
      const { loops, segs } = slice(this.mesh, ((this.layer + 0.5) / LAYERS) * H);
      const walls = [];
      for (let k = 0; k < 2; k++) loops.forEach((l) => walls.push(offset(l, LW * (k + 0.5))));
      const inner = loops.map((l) => offset(l, LW * 2.2));
      const fill = infill(inner, this.layer % 2 ? -Math.PI / 4 : Math.PI / 4, LW * 3.2);
      this.ms = performance.now() - t0;
      this.cur = { loops, walls, fill, segs };
      // the nozzle's route: walls first, then infill, as one list of strokes with lengths
      const strokes = walls.map((l) => ({ pts: l.concat([l[0]]) })).concat(fill.map((s) => ({ pts: s })));
      let total = 0;
      strokes.forEach((s) => { s.len = 0; for (let i = 1; i < s.pts.length; i++) s.len += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]); s.at = total; total += s.len; });
      this.strokes = strokes;
      this.total = total;
    }
    step(dt) {
      super.step(dt);
      this.prog += dt / 2.6;
      if (this.prog >= 1) {
        this.prog = this.auto ? 0 : 1;
        if (this.auto) { this.layer = (this.layer + 1) % LAYERS; this.slider.value = this.layer + 1; this.cut(); this.fx("layer", this.layer); }
        else this.prog = 0;
      }
    }
    draw(ctx) {
      const { w, h, s } = this, c = this.color;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.textBaseline = "middle";
      const V = this.tall ? { x: w * 0.5, y: h * 0.4, sc: Math.min(w * 0.3, h * 0.17) } : { x: w * 0.26, y: h * 0.66, sc: Math.min(w * 0.16, h * 0.25) };
      const S = this.tall ? { x: w * 0.5, y: h * 0.76, sc: Math.min(w * 0.38, h * 0.16) } : { x: w * 0.73, y: h * 0.5, sc: Math.min(w * 0.2, h * 0.34) };

      // stacked view: slices drawn bottom to top, filled so the part reads as solid
      const a = 0.5 + this.t * 0.12, ca = Math.cos(a), sa = Math.sin(a), tilt = 0.42, zs = V.sc * 1.25;
      const proj = (p, z) => { const X = p[0] * ca - p[1] * sa, Y = p[0] * sa + p[1] * ca; return [V.x + X * V.sc, V.y + Y * V.sc * tilt - z * zs]; };
      for (let k = 0; k < LAYERS; k++) {
        const z = ((k + 0.5) / LAYERS) * H, loops = this.stack[k], done = k < this.layer, now = k === this.layer;
        if (k > this.layer + 0) {
          if (k % 2) continue;
          ctx.strokeStyle = ink(0.05);
          ctx.beginPath();
          loops.forEach((l) => l.forEach((p, i) => { const q = proj(p, z); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }));
          ctx.stroke();
          continue;
        }
        ctx.beginPath();
        loops.forEach((l) => { l.forEach((p, i) => { const q = proj(p, z); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); });
        ctx.fillStyle = now ? rgba(c, 0.32) : "#121316";
        ctx.fill("evenodd");
        ctx.strokeStyle = now ? c : rgba(c, done ? 0.25 + 0.4 * (k / LAYERS) : 0.2);
        ctx.lineWidth = now ? 1.5 : 1;
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      // the cutting plane
      const zc = ((this.layer + 0.5) / LAYERS) * H, pr = 1.12;
      const corners = [[-pr, -pr], [pr, -pr], [pr, pr], [-pr, pr]].map((p) => proj(p, zc));
      ctx.beginPath();
      corners.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.closePath();
      ctx.fillStyle = rgba(c, 0.05);
      ctx.fill();
      ctx.strokeStyle = rgba(c, 0.35);
      ctx.stroke();
      const lc = corners.reduce((a, q) => (q[0] < a[0] ? q : a));
      label(ctx, "layer " + (this.layer + 1) + " / " + LAYERS, lc[0] + 4 * s, lc[1] - 14 * s, 10 * s, c);

      // the layer itself: outline, walls, infill and the nozzle working through them
      const P = (p) => [S.x + p[0] * S.sc, S.y - p[1] * S.sc];
      const cur = this.cur;
      ctx.strokeStyle = ink(0.18);
      cur.loops.forEach((l) => { ctx.beginPath(); l.forEach((p, i) => { const q = P(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke(); });
      const done = this.prog * this.total;
      let nozzle = null;
      for (const st of this.strokes) {
        ctx.strokeStyle = rgba(c, 0.16);
        ctx.lineWidth = Math.max(1, LW * S.sc * 0.8);
        ctx.beginPath();
        st.pts.forEach((p, i) => { const q = P(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
        ctx.stroke();
        if (st.at >= done) continue;
        // the printed part of this stroke
        ctx.strokeStyle = c;
        ctx.beginPath();
        let left = done - st.at;
        for (let i = 0; i < st.pts.length; i++) {
          const q = P(st.pts[i]);
          if (i === 0) { ctx.moveTo(q[0], q[1]); continue; }
          const seg = Math.hypot(st.pts[i][0] - st.pts[i - 1][0], st.pts[i][1] - st.pts[i - 1][1]);
          if (left >= seg) { ctx.lineTo(q[0], q[1]); left -= seg; continue; }
          const t = left / seg, pp = st.pts[i - 1];
          const m = P([pp[0] + (st.pts[i][0] - pp[0]) * t, pp[1] + (st.pts[i][1] - pp[1]) * t]);
          ctx.lineTo(m[0], m[1]);
          nozzle = m;
          break;
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      if (nozzle) {
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(nozzle[0], nozzle[1], 3.5 * s, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(c, 0.5);
        ctx.beginPath(); ctx.arc(nozzle[0], nozzle[1], 8 * s, 0, TAU); ctx.stroke();
      }
      const ty = this.tall ? h * 0.96 : h * 0.93, tx = this.tall ? w * 0.06 : S.x - S.sc;
      label(ctx, `${cur.segs} segments · 2 walls · ${cur.fill.length} infill lines · sliced in ${this.ms.toFixed(2)} ms`, tx, ty, 10 * s, ink(0.4));
    }
    stats() {
      return [[(this.layer + 1) + " / " + LAYERS, "layer"], [this.cur.segs, "triangle cuts in this layer"], [this.ms.toFixed(2) + " ms", "to slice it, here"]];
    }
  }

  root.Figs.Layerline = Layerline;
})(window);
