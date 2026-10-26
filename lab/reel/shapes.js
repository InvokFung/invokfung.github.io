/*
 * The shapes the dust can take. Text and drawings are painted on a 2D canvas and sampled; a few
 * (the wave, the ring, the printed vase) are built in 3D. Every shape comes out as N points of
 * x, y, z, flag, where flag 1 marks the accent colour, in units where the shape is 1 tall and
 * centred on 0. Points are sorted along one diagonal, so point k of any shape sits roughly where
 * point k of every other shape sits, and a morph reads as one sweep instead of a scramble.
 */

const TAU = Math.PI * 2;
const INK = "#fff";
const ACC = "#f00";

export function rng(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finish(pts, n, w, h, marks) {
  // sort along the shared diagonal; buckets are close enough, and linear
  const key = new Float32Array(n);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const k = pts[i * 4] * 0.92 - pts[i * 4 + 1] * 0.38; key[i] = k; if (k < lo) lo = k; if (k > hi) hi = k; }
  const B = 4096, count = new Uint32Array(B + 1), slot = new Uint16Array(n), f = (B - 1) / (hi - lo || 1);
  for (let i = 0; i < n; i++) { const s = ((key[i] - lo) * f) | 0; slot[i] = s; count[s + 1]++; }
  for (let s = 0; s < B; s++) count[s + 1] += count[s];
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const k = count[slot[i]]++; out.set(pts.subarray(i * 4, i * 4 + 4), k * 4); }
  return { pos: out, w, h, marks: marks || [] };
}

/* Paint with draw(g, W, H), then sample n points from what was painted. Edge pixels count three
   times, so outlines stay crisp. Red paint becomes accent points. */
function sample(draw, W, H, n, seed, depth) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  const marks = draw(g, W, H) || [];
  const d = g.getImageData(0, 0, W, H).data;
  const A = new Uint8Array(W * H);
  let x0 = W, y0 = H, x1 = 0, y1 = 0, count = 0;
  for (let y = 0, p = 0; y < H; y++) for (let x = 0; x < W; x++, p++) {
    if (d[p * 4 + 3] <= 110) continue;
    A[p] = 1; count++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const cand = new Uint32Array(count * 3 + 1);
  let m = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0, p = y * W + x0; x <= x1; x++, p++) {
    if (!A[p]) continue;
    cand[m++] = p;
    if (!A[p - 1] || !A[p + 1] || !A[p - W] || !A[p + W]) { cand[m++] = p; cand[m++] = p; }
  }
  const r = rng(seed);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, cx = x0 + bw / 2, cy = y0 + bh / 2;
  const pts = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = m ? cand[(r() * m) | 0] : 0;
    const px = p % W, py = (p / W) | 0;
    const k = p * 4;
    pts[i * 4] = (px + r() - cx) / bh;
    pts[i * 4 + 1] = -(py + r() - cy) / bh;
    pts[i * 4 + 2] = (r() - 0.5) * depth;
    pts[i * 4 + 3] = d[k] > 128 && d[k + 1] < 100 ? 1 : 0;
  }
  const mk = marks.map((q) => ({ ch: q.ch, x: (q.x - cx) / bh, y: -(q.y - cy) / bh, r: (q.r || 0) / bh }));
  return finish(pts, n, bw / bh, 1, mk);
}

/* ------------------------------------------------------------------ text */

// parts: [{ t: "99.98" }, { t: "%", a: 1 }]; lines: array of parts arrays
export function text(lines, opt, n, seed) {
  const size = opt.size || 160;
  const font = (opt.style || "") + " " + (opt.weight || 900) + " " + size + "px " + opt.family;
  const lh = size * (opt.lh || 0.92);
  const probe = document.createElement("canvas").getContext("2d");
  const setup = (g) => {
    g.font = font;
    if ("fontStretch" in g && opt.stretch) g.fontStretch = opt.stretch;
    if ("letterSpacing" in g && opt.track) g.letterSpacing = opt.track * size + "px";
    g.textBaseline = "alphabetic";
  };
  setup(probe);
  const widths = lines.map((parts) => parts.reduce((s, p) => s + probe.measureText(p.t).width, 0));
  const W = Math.ceil(Math.max(...widths) + size * 0.6);
  const H = Math.ceil(lh * lines.length + size * 0.6);
  return sample((g) => {
    setup(g);
    const marks = [];
    lines.forEach((parts, li) => {
      let x = (W - widths[li]) / 2;
      const y = size * 0.3 + lh * li + size * 0.78;
      parts.forEach((p) => {
        g.fillStyle = p.a ? ACC : INK;
        g.fillText(p.t, x, y);
        // the centre of every glyph, so the camera can fly through one later
        for (const ch of p.t) {
          const cw = g.measureText(ch).width;
          marks.push({ ch, x: x + cw / 2, y: y - size * 0.36, r: cw * 0.22 });
          x += cw + (opt.track || 0) * size;
        }
        x -= (opt.track || 0) * size;
      });
    });
    return marks;
  }, W, H, n, seed, opt.depth || 0.05);
}

/* ------------------------------------------------------------------ drawings */

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h);
}

function cut(g, fn) {
  g.save(); g.globalCompositeOperation = "destination-out"; fn(); g.restore();
}

// a smooth path through points (Catmull-Rom as Béziers)
function spline(g, P, closed) {
  const n = P.length;
  const at = (i) => P[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  g.moveTo(P[0][0], P[0][1]);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
}

const DRAW = {
  // Relay: a reply that still arrives, the backup bubble in accent
  relay(g) {
    g.fillStyle = INK;
    rr(g, 90, 150, 600, 400, 80); g.fill();
    g.beginPath(); g.moveTo(200, 530); g.lineTo(150, 700); g.lineTo(350, 540); g.fill();
    cut(g, () => {
      [[170, 250, 430], [170, 330, 360], [170, 410, 250]].forEach(([x, y, w]) => { rr(g, x, y, w, 38, 19); g.fill(); });
    });
    g.fillStyle = ACC;
    rr(g, 470, 520, 340, 210, 60); g.fill();
    g.beginPath(); g.moveTo(720, 715); g.lineTo(800, 820); g.lineTo(640, 725); g.fill();
    cut(g, () => { [560, 640, 720].forEach((x) => { g.beginPath(); g.arc(x, 625, 24, 0, TAU); g.fill(); }); });
  },
  // Tracewise: a service map, the slow one ringed in accent
  trace(g) {
    const N = [[150, 200], [420, 120], [700, 210], [260, 440], [560, 430], [150, 700], [450, 720], [760, 620]];
    const E = [[0, 1], [1, 2], [0, 3], [1, 3], [1, 4], [2, 4], [3, 5], [3, 6], [4, 6], [4, 7], [2, 7]];
    g.strokeStyle = INK; g.lineWidth = 16; g.lineCap = "round";
    E.forEach(([a, b]) => { if (b === 4 || a === 4) return; g.beginPath(); g.moveTo(...N[a]); g.lineTo(...N[b]); g.stroke(); });
    g.strokeStyle = ACC;
    E.forEach(([a, b]) => { if (a !== 4 && b !== 4) return; g.beginPath(); g.moveTo(...N[a]); g.lineTo(...N[b]); g.stroke(); });
    g.fillStyle = INK;
    N.forEach(([x, y], i) => { if (i === 4) return; g.beginPath(); g.arc(x, y, 48, 0, TAU); g.fill(); });
    g.fillStyle = ACC; g.beginPath(); g.arc(560, 430, 76, 0, TAU); g.fill();
    g.lineWidth = 14; g.beginPath(); g.arc(560, 430, 128, 0, TAU); g.stroke();
  },
  // Onboard, before: three exports that don't line up
  tables3(g) {
    const t = (x, y, w, h, a, rows, cols) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 12;
      rr(g, -w / 2, -h / 2, w, h, 14); g.stroke();
      g.fillRect(-w / 2, -h / 2, w, h / rows);
      g.lineWidth = 6;
      for (let r = 2; r < rows; r++) { g.beginPath(); g.moveTo(-w / 2, -h / 2 + (h * r) / rows); g.lineTo(w / 2, -h / 2 + (h * r) / rows); g.stroke(); }
      for (let c = 1; c < cols; c++) { g.beginPath(); g.moveTo(-w / 2 + (w * c) / cols, -h / 2); g.lineTo(-w / 2 + (w * c) / cols, h / 2); g.stroke(); }
      g.restore();
    };
    t(210, 260, 300, 260, -0.14, 5, 3);
    t(620, 300, 280, 330, 0.11, 6, 2);
    t(400, 640, 340, 240, -0.05, 4, 4);
  },
  // Onboard, after: one clean table, its header in accent
  table1(g) {
    const x = 90, y = 160, w = 720, h = 580, rows = 7, cols = 4;
    g.fillStyle = ACC; rr(g, x, y, w, h / rows, [20, 20, 0, 0]); g.fill();
    g.strokeStyle = INK; g.lineWidth = 14; rr(g, x, y, w, h, 20); g.stroke();
    g.lineWidth = 7;
    for (let r = 2; r < rows; r++) { g.beginPath(); g.moveTo(x, y + (h * r) / rows); g.lineTo(x + w, y + (h * r) / rows); g.stroke(); }
    for (let c = 1; c < cols; c++) { g.beginPath(); g.moveTo(x + (w * c) / cols, y + h / rows); g.lineTo(x + (w * c) / cols, y + h); g.stroke(); }
    g.fillStyle = INK;
    for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cw = (w / cols) * (0.35 + ((r * 7 + c * 3) % 5) * 0.09);
      rr(g, x + (w * c) / cols + 22, y + (h * r) / rows + h / rows / 2 - 9, cw, 18, 9); g.fill();
    }
  },
  // Dispatch: a day of visits; one stop moves and the route bends to reach it
  route(g) {
    const S = [[150, 230], [380, 140], [650, 210], [760, 450], [600, 690], [330, 720], [160, 520]];
    g.strokeStyle = INK; g.lineWidth = 18; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); spline(g, S, true); g.stroke();
    g.fillStyle = INK;
    S.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 40, 0, TAU); g.fill(); });
    g.strokeStyle = ACC; g.setLineDash([2, 34]); g.lineWidth = 22;
    g.beginPath(); spline(g, [[760, 450], [520, 470], [430, 420]], false); g.stroke();
    g.setLineDash([]);
    g.fillStyle = ACC;
    g.beginPath(); g.arc(430, 360, 70, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(430, 480); g.closePath(); g.fill();
    cut(g, () => { g.beginPath(); g.arc(430, 360, 28, 0, TAU); g.fill(); });
  },
  // Atlas: a page of notes, the right paragraph lit, a lens over it
  search(g) {
    g.strokeStyle = INK; g.lineWidth = 14; g.lineJoin = "round";
    g.beginPath(); g.moveTo(130, 90); g.lineTo(520, 90); g.lineTo(640, 210); g.lineTo(640, 800); g.lineTo(130, 800); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(520, 90); g.lineTo(520, 210); g.lineTo(640, 210); g.stroke();
    const L = [[200, 180, 260], [200, 240, 380], [200, 300, 330], [200, 400, 380, 1], [200, 455, 360, 1], [200, 510, 280, 1], [200, 610, 370], [200, 665, 300], [200, 720, 340]];
    L.forEach(([x, y, w, a]) => { g.fillStyle = a ? ACC : INK; rr(g, x, y, w, 26, 13); g.fill(); });
    g.strokeStyle = INK; g.lineWidth = 34;
    g.beginPath(); g.arc(560, 520, 150, 0, TAU); g.stroke();
    g.lineWidth = 58; g.lineCap = "round";
    g.beginPath(); g.moveTo(670, 630); g.lineTo(800, 760); g.stroke();
  },
  // Intonation Studio: a violin, the bow across it in accent
  violin(g) {
    const R = [[450, 300], [540, 308], [600, 352], [606, 430], [566, 498], [546, 560], [566, 622], [624, 690], [640, 780], [590, 848], [450, 868]];
    const P = R.concat(R.slice(1, -1).reverse().map(([x, y]) => [900 - x, y]));
    g.fillStyle = INK;
    g.beginPath(); spline(g, P, true); g.fill();
    rr(g, 425, 70, 50, 260, 12); g.fill();
    g.beginPath(); g.arc(450, 70, 38, 0, TAU); g.fill();
    cut(g, () => {
      g.lineWidth = 12; g.lineCap = "round";
      [-1, 1].forEach((s) => {
        g.beginPath(); g.moveTo(450 + s * 70, 580); g.bezierCurveTo(450 + s * 95, 620, 450 + s * 50, 660, 450 + s * 78, 712); g.stroke();
      });
      g.lineWidth = 4;
      [-18, -6, 6, 18].forEach((dx) => { g.beginPath(); g.moveTo(450 + dx, 110); g.lineTo(450 + dx, 760); g.stroke(); });
      g.beginPath(); g.arc(450, 70, 14, 0, TAU); g.fill();
    });
    g.strokeStyle = ACC; g.lineCap = "round";
    g.lineWidth = 14; g.beginPath(); g.moveTo(80, 700); g.lineTo(840, 420); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.moveTo(96, 728); g.lineTo(846, 452); g.stroke();
  }
};

// drawn on a 900 grid, sampled at 600
export function drawing(name, n, seed) {
  return sample((g) => { g.scale(600 / 900, 600 / 900); DRAW[name](g); }, 600, 600, n, seed, 0.06);
}

/* ------------------------------------------------------------------ built in 3D */

// a sheet of dust that the shader makes ripple; it lies down as a floor when tilted
export function wave(n, seed) {
  const r = rng(seed), pts = new Float32Array(n * 4);
  const cols = Math.ceil(Math.sqrt(n * 2.2)), rows = Math.ceil(n / cols);
  for (let i = 0; i < n; i++) {
    const cx = i % cols, cy = (i / cols) | 0;
    pts[i * 4] = ((cx + r() * 0.6) / cols - 0.5) * 2.2;
    pts[i * 4 + 1] = (cy + r() * 0.6) / rows - 0.5;
    pts[i * 4 + 2] = 0;
    pts[i * 4 + 3] = r() < 0.012 ? 1 : 0;
  }
  return finish(pts, n, 2.2, 1);
}

// a loose drift of dust, for the first frame and for the burst around the camera
export function cloud(n, seed, spread) {
  const r = rng(seed), pts = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    pts[i * 4] = (r() - 0.5) * 2.4;
    pts[i * 4 + 1] = r() - 0.5;
    pts[i * 4 + 2] = (r() - 0.5) * (spread || 0.8);
    pts[i * 4 + 3] = r() < 0.01 ? 1 : 0;
  }
  return finish(pts, n, 2.4, 1);
}

// a ring that the work chapter opens through
export function ring(n, seed) {
  const r = rng(seed), pts = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, rad = 0.5 - Math.pow(r(), 2.5) * 0.09;
    pts[i * 4] = Math.cos(a) * rad;
    pts[i * 4 + 1] = Math.sin(a) * rad;
    pts[i * 4 + 2] = (r() - 0.5) * 0.06;
    pts[i * 4 + 3] = r() < 0.18 ? 1 : 0;
  }
  return finish(pts, n, 1, 1);
}

// Layerline: a vase printed in layers; the top layer is still being laid, in accent
export function vase(n, seed) {
  const r = rng(seed), pts = new Float32Array(n * 4);
  const L = 44, rad = (u) => 0.2 + 0.1 * Math.sin(u * Math.PI * 1.25 + 0.3) + 0.035 * Math.cos(u * Math.PI * 4.2);
  for (let i = 0; i < n; i++) {
    let x, y, z, f = 0;
    const pick = r();
    if (pick < 0.86) {
      const layer = (r() * L) | 0, u = layer / (L - 1), a = r() * TAU, w = rad(u) - r() * 0.012;
      // the top layer is only part laid: an arc, then the nozzle
      if (layer === L - 1) { f = 1; const a2 = r() * TAU * 0.72; x = Math.cos(a2) * w; z = Math.sin(a2) * w; }
      else { x = Math.cos(a) * w; z = Math.sin(a) * w; }
      y = u - 0.5 + (r() - 0.5) * 0.004;
    } else if (pick < 0.95) {
      // infill on the floor: a lattice
      const a = r() * TAU, d = Math.sqrt(r()) * rad(0);
      x = Math.cos(a) * d; z = Math.sin(a) * d;
      const s = 0.035; x = Math.round(x / s) * s + (r() - 0.5) * 0.006 * (r() < 0.5 ? 1 : 8);
      y = -0.5;
    } else {
      // the nozzle, a cone just above the last point laid
      f = 1;
      const h = r() * 0.11, a = r() * TAU, w = 0.012 + h * 0.32;
      const tx = Math.cos(TAU * 0.72) * rad(1), tz = Math.sin(TAU * 0.72) * rad(1);
      x = tx + Math.cos(a) * w; z = tz + Math.sin(a) * w; y = 0.52 + h;
    }
    pts[i * 4] = x; pts[i * 4 + 1] = y; pts[i * 4 + 2] = z; pts[i * 4 + 3] = f;
  }
  return finish(pts, n, 0.62, 1.1);
}

/* ------------------------------------------------------------------ a photo */

// A portrait as dust: darker pixels draw more points, like a halftone. Put a photo beside the page
// and name it in <body data-face="me.jpg"> (a plain, light background works best).
export function photo(img, n, seed) {
  const W = 360, H = Math.round((W * img.naturalHeight) / img.naturalWidth);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const r = rng(seed), pts = new Float32Array(n * 4);
  const L = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) L[p] = (0.2126 * d[p * 4] + 0.7152 * d[p * 4 + 1] + 0.0722 * d[p * 4 + 2]) / 255;
  // stretch the contrast between the 5th and 95th percentiles, and fade the edges to an oval
  const sorted = L.slice().sort(), lo = sorted[(W * H * 0.05) | 0], hi = sorted[(W * H * 0.95) | 0];
  const ink = (x, y) => {
    const v = Math.min(1, Math.max(0, (L[(y | 0) * W + (x | 0)] - lo) / (hi - lo || 1)));
    const ex = (x / W - 0.5) / 0.5, ey = (y / H - 0.5) / 0.5, e = Math.sqrt(ex * ex + ey * ey);
    return Math.pow(1 - v, 1.8) * Math.min(1, Math.max(0, (1 - e) / 0.25));
  };
  let i = 0, guard = 0;
  while (i < n && guard++ < n * 80) {
    const x = r() * W, y = r() * H;
    if (r() > ink(x, y)) continue;
    pts[i * 4] = (x - W / 2) / H;
    pts[i * 4 + 1] = -(y - H / 2) / H;
    pts[i * 4 + 2] = (r() - 0.5) * 0.04;
    pts[i * 4 + 3] = 0;
    i++;
  }
  // a nearly blank photo: repeat the points we did get
  for (const got = Math.max(1, i); i < n; i++) { const k = ((r() * got) | 0) * 4; pts.set(pts.subarray(k, k + 4), i * 4); }
  return finish(pts, n, W / H, 1);
}
