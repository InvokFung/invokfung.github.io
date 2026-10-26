// The landscape's paper, painted once per screen size on 2D canvases: skies, ridges, the mountain,
// mist, cloud banks, light and the big words. scenery.js turns each canvas into a texture; with no
// WebGL the same canvases are shown flat. Every painter takes its box in CSS pixels and a scale k for
// how many canvas pixels to spend per CSS pixel.

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
const rgb = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export const mix = (a, b, t) => { const B = rgb(b); return '#' + rgb(a).map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); };
export const rgba = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };
export const tint = (c) => rgb(c).map((v) => v / 255);

// mulberry32
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// smooth 1D value noise in [-1, 1]
function noise1(seed) {
  const r = rng(seed), v = Array.from({ length: 256 }, () => r() * 2 - 1);
  return (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(v[i & 255], v[(i + 1) & 255], u); };
}
// height of a ridge's skyline at x (0..1 of its width), as a fraction of its box (1 = top)
export function skyline(sh) {
  const n = noise1(sh.seed);
  return (x) => {
    let y = sh.base;
    for (const [cx, hgt, wd] of sh.peaks) { const d = (x - cx) / wd; y = Math.max(y, sh.base + (hgt - sh.base) * Math.exp(-d * d * 0.5) * (1 - Math.abs(d) * 0.02)); }
    y += (n(x * 6) * 0.5 + n(x * 17 + 40) * 0.3 + n(x * 47 + 90) * 0.2) * sh.rough;
    if (sh.dip) { const [cx, depth, wd] = sh.dip, d = (x - cx) / wd; y -= depth * Math.exp(-d * d * 2) * (y - 0.05); }
    return clamp(y, 0.02, 1);
  };
}
// the lowest point of a skyline between two x: where a ridge tears in two
export function valley(sh, a = 0.38, b = 0.62) {
  const f = skyline(sh);
  let best = a, lo = 2;
  for (let x = a; x <= b; x += 0.005) { const y = f(x); if (y < lo) { lo = y; best = x; } }
  return best;
}

const noise = (seed) => noise1(Math.floor(seed * 1000));
const CAN_BLUR = 'filter' in CanvasRenderingContext2D.prototype; // not in older Safari: clouds keep a hard edge there
function canvas(w, h, k) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w * k)); c.height = Math.max(2, Math.round(h * k));
  const x = c.getContext('2d');
  x.scale(c.width / w, c.height / h);
  return [c, x];
}
// paper grain: light flecks at random strength, laid over painted paper only
const GRAIN = (() => {
  const [c, x] = canvas(220, 220, 1), img = x.createImageData(220, 220), r = rng(7);
  for (let i = 0; i < img.data.length; i += 4) { const v = 120 + r() * 135; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = r() * 38; }
  x.putImageData(img, 0, 0);
  return c;
})();
function grain(x, w, h, a = 1) {
  x.save();
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = a;
  x.fillStyle = x.createPattern(GRAIN, 'repeat');
  x.fillRect(0, 0, w, h);
  x.restore();
}

/* ------------------------------------------------------------------ sky */
// A sky from well above the screen down past its foot. hy: the horizon, st: the top of the screen,
// both in the box's pixels. Below the horizon it is ground, for wherever the floor fades.
export function paintSky(w, h, k, { sky: [a, b, c, d], sun, ground: [g0, g1] }, hy, st, sunX) {
  const [cv, x] = canvas(w, h, k), span = hy - st;
  const g = x.createLinearGradient(0, st, 0, hy);
  g.addColorStop(0, a); g.addColorStop(0.45, b); g.addColorStop(0.8, c); g.addColorStop(1, d);
  x.fillStyle = g; x.fillRect(0, 0, w, hy + 1);
  if (sun) {
    const cx = sunX, cy = st + sun.y * span, r = sun.r * Math.min(w, span * 1.6), gr = Math.max(r, 0.05 * Math.min(w, span * 1.6)) * 6;
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, gr);
    rg.addColorStop(0, sun.glow); rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.save(); x.beginPath(); x.rect(0, 0, w, hy); x.clip();
    x.fillStyle = rg; x.fillRect(cx - gr, cy - gr, gr * 2, gr * 2);
    if (r) { x.globalAlpha = 0.92; x.fillStyle = sun.c; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
    x.restore();
  }
  const gg = x.createLinearGradient(0, hy, 0, h);
  gg.addColorStop(0, g0); gg.addColorStop(1, g1);
  x.fillStyle = gg; x.fillRect(0, hy, w, h - hy);
  grain(x, w, h, 0.5);
  return cv;
}

/* ------------------------------------------------------------------ ridges */
// the ground a ridge stands on: its own colour, in its own shade
export const foot = (color) => mix(color, '#000000', 0.34);
// a ridge's skyline as a path, closed down to the bottom of its box if asked; side: how far it runs
// on past each end of its box
function edge(f, w, h, closed, side = 0) {
  const p = new Path2D(), step = Math.max(2, w / 600);
  for (let px = -side; px <= w + side + step; px += step) { const xx = Math.min(px, w + side); p[px > -side ? 'lineTo' : 'moveTo'](xx, (1 - f(xx / w)) * h); }
  if (closed) { p.lineTo(w + side, h); p.lineTo(-side, h); p.closePath(); }
  return p;
}
// A ridge of paper: its fill, light catching the crest and fading down the slope, the base darkening
// into the ground it stands on, grain, and a rim of light along the top.
// pad: room above the box for marks that stand on the crest (a pole on a summit); side: land drawn
// on past each end, for when the ridge is seen from further off than its box. face: a lit face
// on each of the peaks it names, on the side the light comes from ({ at: [x...], side: -1 | 1,
// light, a }), as a lighter sheet laid on the ridge. low: the colour its base goes down into (its own
// shade unless given, as for peaks standing in haze).
export function paintRidge(w, h, k, sh, { color, rim, rimA = 0.5, haze, H, pad = 0, side = 0, face, low }, extra) {
  const [cv, x] = canvas(w + 2 * side, h + pad, k), f = skyline(sh), fill = edge(f, w, h, true, side), top = edge(f, w, h, false, side);
  x.translate(side, pad);
  x.fillStyle = color; x.fill(fill);
  x.save(); x.clip(fill);
  if (face) for (const px of face.at) {
    // a facet: from the peak down the crest toward the light, then straight back to a point on the
    // peak's spine, part way down; lighter at the top, gone by its lower edge
    const py = (1 - f(px)) * h;
    let q = px;
    for (let s2 = px; Math.abs(s2 - px) < 0.16 && s2 > 0 && s2 < 1; s2 += face.side * 0.003) { q = s2; if (f(s2) < f(px) - 0.32) break; }
    const qy = (1 - f(q)) * h, low = py + (Math.max(qy, py) - py) * 1.5 + h * 0.06;
    const poly = new Path2D(), n = noise(px * 97);
    poly.moveTo(px * w, py);
    for (let s2 = px; (q - s2) * face.side > 0; s2 += face.side * 0.003) poly.lineTo(s2 * w, (1 - f(s2)) * h);
    poly.lineTo(q * w, qy);
    for (let y = 1; y >= 0; y -= 0.1) poly.lineTo((px - face.side * 0.012 * y + n(y * 4) * 0.006) * w, lerp(py, low, y));
    poly.closePath();
    const g = x.createLinearGradient(0, py, 0, low);
    g.addColorStop(0, rgba(face.light, face.a)); g.addColorStop(1, rgba(face.light, 0));
    x.fillStyle = g; x.fill(poly);
  }
  if (haze) {
    // the crest drawn far above the canvas and only its blurred shadow brought back down
    const hz = clamp(h * 0.09, 10, 44), ky = cv.height / (h + pad), far = h + pad + 200;
    x.translate(0, -far);
    x.shadowColor = haze; x.shadowBlur = hz * 1.2 * ky; x.shadowOffsetY = far * ky;
    x.lineWidth = hz * 1.4; x.strokeStyle = '#000'; x.stroke(top);
    x.setTransform(cv.width / (w + 2 * side), 0, 0, ky, side * cv.width / (w + 2 * side), pad * ky);
    x.shadowColor = 'transparent';
  }
  const fade = Math.min(h * 0.6, H * 0.18), fg = x.createLinearGradient(0, h - fade, 0, h);
  fg.addColorStop(0, rgba(low || foot(color), 0)); fg.addColorStop(1, low || foot(color));
  x.fillStyle = fg; x.fillRect(-side, h - fade, w + 2 * side, fade);
  x.restore();
  x.strokeStyle = rgba(rim, rimA); x.lineWidth = 1.3; x.lineJoin = 'round'; x.stroke(top);
  extra?.(x, f);
  return cv;
}

// a smooth curve through points (Catmull-Rom)
export function curve(x, P) {
  x.moveTo(P[0][0], P[0][1]);
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    x.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
}
// points spaced evenly along a polyline (in fractions of a box), n of them from end to end
export function along(pts, n) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], (pts[i][1] - pts[i - 1][1]) * 0.8); seg.push(l); total += l; }
  return Array.from({ length: n }, (_, k) => {
    let want = (k / (n - 1)) * total, i = 0;
    while (i < seg.length - 1 && want > seg[i]) { want -= seg[i]; i++; }
    const f = Math.min(1, want / seg[i]);
    return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)];
  });
}
// A dotted trail, fading from a to b in opacity along its length.
export function trail(x, P, color, a0, a1, width = 1.4) {
  const n = 24;
  x.save();
  x.lineCap = 'round'; x.setLineDash([2, 6]); x.lineWidth = width;
  // drawn in short runs so its opacity can change along the way
  const dense = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    for (let j = 0; j < n; j++) {
      const t = j / n, u = 1 - t;
      dense.push([u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0], u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1]]);
    }
  }
  dense.push(P[P.length - 1]);
  let off = 0;
  for (let i = 0; i < dense.length - 1; i++) {
    const a = lerp(a0, a1, i / (dense.length - 2));
    x.strokeStyle = rgba(color, a);
    x.lineDashOffset = -off;
    x.beginPath(); x.moveTo(dense[i][0], dense[i][1]); x.lineTo(dense[i + 1][0], dense[i + 1][1]); x.stroke();
    off += Math.hypot(dense[i + 1][0] - dense[i][0], dense[i + 1][1] - dense[i][1]);
  }
  x.restore();
}
// A bare pole on a summit and an empty pennant, drawn dashed: the flag nobody has planted yet.
export function pennant(x, px, py, size, color, label, dir = 1) {
  const ph = size, fw = size * 0.62 * dir, fh = size * 0.36;
  x.save();
  x.strokeStyle = color; x.lineWidth = Math.max(1.2, size / 40);
  x.beginPath(); x.moveTo(px, py); x.lineTo(px, py - ph); x.stroke();
  x.setLineDash([3, 3]); x.lineWidth = Math.max(1, size / 50);
  x.beginPath(); x.moveTo(px, py - ph); x.lineTo(px + fw, py - ph + fh / 2); x.lineTo(px, py - ph + fh); x.stroke();
  if (label) {
    x.setLineDash([]);
    x.fillStyle = color;
    x.font = `500 ${Math.max(9, size * 0.15).toFixed(1)}px "JetBrains Mono", ui-monospace, monospace`;
    x.textBaseline = 'middle'; x.textAlign = dir < 0 ? 'right' : 'left';
    x.fillText(label, px + fw + size * 0.08 * dir, py - ph + fh / 2);
  }
  x.restore();
}

/* ------------------------------------------------------------------ soft things */
// Mist: soft warm patches, tiling across (a power-of-two width, so it can drift for ever).
export function paintMist(color, seed = 3) {
  const w = 512, h = 128, [c, x] = canvas(w, h, 1), r = rng(seed);
  for (let i = 0; i < 9; i++) {
    const cx = r() * w, cy = h * (0.45 + r() * 0.3), rx = w * (0.12 + r() * 0.12), a = 0.05 + r() * 0.06;
    for (const dx of [-w, 0, w]) {
      x.save(); x.translate(cx + dx, cy); x.scale(1, 0.42);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
      x.fillStyle = g; x.fillRect(-rx, -rx, rx * 2, rx * 2);
      x.restore();
    }
  }
  return c;
}
// Thin cloud lying across the sky in streaks, lit along its top by a low sun: drawn once, 1024 wide
// and tiling, to drift across a box. color: its body; light: its lit edge.
export function paintWisp(color, light, seed = 1) {
  const w = 1024, h = 128, [c, x] = canvas(w, h, 1), r = rng(seed);
  const streak = (cx, cy, rx, ry, a) => {
    for (const dx of [-w, 0, w]) {
      x.save(); x.translate(cx + dx, cy); x.scale(1, ry / rx);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, rgba(color, a)); g.addColorStop(0.55, rgba(color, a * 0.45)); g.addColorStop(1, rgba(color, 0));
      x.fillStyle = g; x.fillRect(-rx, -rx, rx * 2, rx * 2);
      // its top, toward the sun, a little lighter
      x.translate(0, -rx * 0.4);
      const l = x.createRadialGradient(0, 0, 0, 0, 0, rx * 0.75);
      l.addColorStop(0, rgba(light, a * 0.55)); l.addColorStop(1, rgba(light, 0));
      x.fillStyle = l; x.fillRect(-rx, -rx, rx * 2, rx * 2);
      x.restore();
    }
  };
  // a few long banks, and finer strands along them
  for (let i = 0; i < 4; i++) streak(r() * w, h * (0.42 + r() * 0.2), w * (0.1 + r() * 0.12), h * (0.06 + r() * 0.05), 0.14 + r() * 0.16);
  for (let i = 0; i < 12; i++) streak(r() * w, h * (0.3 + r() * 0.42), w * (0.04 + r() * 0.09), h * (0.012 + r() * 0.02), 0.18 + r() * 0.3);
  if (CAN_BLUR) {
    const soft = document.createElement('canvas'); soft.width = w; soft.height = h;
    const s = soft.getContext('2d');
    s.filter = 'blur(1.5px)';
    // (drawn three times across, so the blur wraps round like the streaks do)
    for (const dx of [-w, 0, w]) s.drawImage(c, dx, 0);
    x.clearRect(0, 0, w, h); x.drawImage(soft, 0, 0);
  }
  return c;
}
// A sea of cloud, seen from just above it toward a low sun, as paper: rows of billowing sheets, small
// and hazy at its far edge (the top of the box) and bigger toward its near one. Each sheet's edge is
// heaps of every size with smaller billows on their crowns; it is lit along that edge and goes over
// into shade below it, so where a nearer sheet stands over a farther one, a line of light divides
// them. R: the size of a billow in the far row and the near one, in CSS pixels; sun: where the sun
// stands across the box (0..1); haze: the colour the far rows fade into; rows: how many; top: where
// the far row sits; heap: how high the heaps rise, in billows; fade: how much of the box's foot thins
// out to nothing, for a sheet whose foot would show.
export function paintSea(w, h, k, { light, body, deep, haze, sun = 0.5, seed = 1, rows = 4, R = [8, 20], top = 0.1, heap = 1.6, glare = 0.4, rim = 0.3, fade = 0 }) {
  const [c, x] = canvas(w, h, k), r = rng(seed);
  // a billowing edge: the upper envelope of all the circles of its heaps and billows
  const edge = (base, rad, hgt) => {
    const C = [];
    for (let px = -w * 0.05; px < w * 1.05;) {
      // most heaps barely rise out of the sea; now and then one towers
      const ra = rad * (1.6 + r() * 2.6), cy = base - rad * hgt * (0.2 + Math.pow(r(), 3) * 2.5) + ra * 1.1;
      C.push([px, cy, ra]);
      for (let m = 3 + Math.floor(r() * 4); m > 0; m--) {
        const a = (r() * 2 - 1) * 1.2, rb = ra * (0.18 + r() * 0.22), o = ra - rb * 0.5, bx = px + Math.sin(a) * o, by = cy - Math.cos(a) * o;
        C.push([bx, by, rb]);
        // and smaller ones on those
        if (r() < 0.6) { const a2 = a + (r() - 0.5) * 1.4, rc = rb * (0.35 + r() * 0.2), o2 = rb - rc * 0.4; C.push([bx + Math.sin(a2) * o2, by - Math.cos(a2) * o2, rc]); }
      }
      // one that towers has billows down its flanks, so it doesn't stand on a wall
      for (let y = cy + ra * 0.45, n = 1; y < base + rad * 0.4; y += ra * 0.5, n++) for (const sd of [-1, 1]) { const rf = ra * (0.45 + r() * 0.25); C.push([px + sd * ra * (0.7 + n * 0.22), y + rf * 0.35, rf]); }
      px += ra * (0.6 + r() * 0.9);
    }
    // bucketed by x, so each point only looks at the circles over it
    const B = rad * 4.2, bins = new Map();
    for (const q of C) for (let i = Math.floor((q[0] - q[2]) / B); i <= Math.floor((q[0] + q[2]) / B); i++) { if (!bins.has(i)) bins.set(i, []); bins.get(i).push(q); }
    return (px) => { let y = base + rad * 0.4; for (const [cx, cy, rr] of bins.get(Math.floor(px / B)) || []) { const d = px - cx; if (d * d < rr * rr) y = Math.min(y, cy - Math.sqrt(rr * rr - d * d)); } return y; };
  };
  const ky = c.height / h;
  let base0 = 0;
  const sheet = (f, rad, col, dk, lit) => {
    // the sheet, and a band of it under its crest (only there does the light go over into shade, so
    // only there need it be blurred)
    const p = new Path2D(), band = new Path2D(), step = Math.max(1, rad * 0.2), d = rad * 0.6, deep2 = rad * 3.5, ys = [];
    for (let px = -rad * 2; px <= w + rad * 2; px += step) ys.push([px, f(px)]);
    ys.forEach(([px, y], i) => { p[i ? 'lineTo' : 'moveTo'](px, y); band[i ? 'lineTo' : 'moveTo'](px, y); });
    p.lineTo(w + rad * 2, h); p.lineTo(-rad * 2, h); p.closePath();
    for (let i = ys.length - 1; i >= 0; i--) band.lineTo(ys[i][0], ys[i][1] + deep2);
    band.closePath();
    x.save(); x.clip(p);
    x.fillStyle = mix(col, light, lit); x.fill(p);
    // the shade: the band's blurred shadow, a little lower, so the light goes over into it slowly (the
    // band is drawn far above the canvas and only its shadow brought back down); below it, plain shade
    const far = h + 4 * rad + 200;
    x.translate(0, -far);
    x.shadowColor = col; x.shadowBlur = rad * 1.1 * ky; x.shadowOffsetY = (far + d) * ky;
    x.fillStyle = '#000'; x.fill(band);
    x.shadowColor = 'transparent';
    x.translate(0, far + d + deep2 * 0.6);
    x.fillStyle = col; x.fill(p);
    x.translate(0, -(d + deep2 * 0.6));
    // and deeper in shade further down the row
    const g = x.createLinearGradient(0, base0, 0, base0 + rad * 8);
    g.addColorStop(0, rgba(dk, 0)); g.addColorStop(1, rgba(dk, 0.45));
    x.fillStyle = g; x.fillRect(-rad * 2, base0, w + rad * 4, h - base0);
    x.restore();
    if (rim) { x.strokeStyle = rgba(light, rim * lit); x.lineWidth = Math.max(0.8, rad * 0.05); x.lineJoin = 'round'; x.stroke(p); }
  };
  for (let j = 0; j < rows; j++) {
    const v = rows > 1 ? j / (rows - 1) : 1, far = 1 - v;
    // (the far row low enough that its tallest heaps still fit in the box)
    const rad = lerp(R[0], R[1], v), hg = heap * (0.35 + 0.65 * v), base = Math.max(h * lerp(top, top + (1 - top) * 0.6, Math.pow(v, 1.15)), rad * (2.7 * hg + 1.4));
    const col = mix(body, haze, far * 0.55), dk = mix(deep, haze, far * 0.35);
    // backlit: the far tops, toward the sun, take the most light
    const lit = lerp(0.7, 0.4, v);
    base0 = base;
    sheet(edge(base, rad, hg), rad, col, dk, lit);
    // and the billows inside the row, a little lower, smaller and in more shade
    sheet(edge(base + rad * 0.9, rad * 0.75, hg * 0.6), rad * 0.75, mix(col, dk, 0.2), dk, lit * 0.8);
  }
  // toward the sun the tops of the cloud take the light
  if (glare) {
    x.save(); x.globalCompositeOperation = 'source-atop';
    x.translate(sun * w, h * top); x.scale(1, 0.45);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, w * 0.42);
    g.addColorStop(0, rgba(light, glare)); g.addColorStop(0.4, rgba(light, glare * 0.35)); g.addColorStop(1, rgba(light, 0));
    x.fillStyle = g; x.fillRect(-w * 0.42, -w * 0.42, w * 0.84, w * 0.84);
    x.restore();
  }
  if (CAN_BLUR) {
    const soft = document.createElement('canvas'); soft.width = c.width; soft.height = c.height;
    const s = soft.getContext('2d');
    s.filter = `blur(${Math.max(0.6, R[0] * k * 0.1).toFixed(1)}px)`;
    s.drawImage(c, 0, 0);
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.drawImage(soft, 0, 0); x.restore();
  }
  if (fade) {
    const m = x.createLinearGradient(0, h * (1 - fade), 0, h);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    x.save(); x.globalCompositeOperation = 'destination-in'; x.fillStyle = m; x.fillRect(0, 0, w, h); x.restore();
  }
  grain(x, w, h, 0.15);
  return c;
}
// A cloud of soft puffs, lit from above, fuller in the middle and thinning at its ends: one that
// hangs on a mountain's upper slopes.
export function paintPuff(w, h, k, { light, body, seed = 1, n = 26 }) {
  const [c, x] = canvas(w, h, k), r = rng(seed);
  for (let i = 0; i < n; i++) {
    const u = 0.06 + r() * 0.88, full = Math.sin(Math.PI * u);
    const rr = h * (0.16 + r() * 0.2) * (0.45 + 0.55 * full);
    const cx = w * u, cy = h * (0.58 + (r() - 0.5) * 0.22 * full);
    const g = x.createRadialGradient(cx, cy - rr * 0.35, rr * 0.05, cx, cy, rr);
    g.addColorStop(0, rgba(light, 0.7)); g.addColorStop(0.45, rgba(body, 0.42)); g.addColorStop(1, rgba(body, 0));
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.fill();
  }
  return c;
}
// a round soft light, white, for pools and halos (tinted when drawn)
export function paintRadial(n = 128) {
  const [c, x] = canvas(n, n, 1), g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, n, n);
  return c;
}
// a floor's colour from near (v = 0) to far (v = 1): stops [[at, colour], ...]
export function paintFloor(stops) {
  const [c, x] = canvas(2, 256, 1), g = x.createLinearGradient(0, 0, 0, 256);
  for (const [at, col] of stops) g.addColorStop(clamp(at), col);
  x.fillStyle = g; x.fillRect(0, 0, 2, 256);
  return c;
}

/* ------------------------------------------------------------------ words */
// The text inside an element, painted where the page laid it out, in the font and colour CSS gave
// it. Good for a line or two of plain text (the name on the cover, "Get in touch."), not for wrapping
// paragraphs.
export function paintText(el, box, k) {
  const [c, x] = canvas(box.w, box.h, k);
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.textContent.trim();
    if (!text) continue;
    const st = getComputedStyle(n.parentElement), rg = document.createRange();
    rg.selectNodeContents(n);
    const r = [...rg.getClientRects()].find((q) => q.width > 0);
    if (!r) continue;
    const size = parseFloat(st.fontSize);
    x.font = `${st.fontStyle} ${st.fontWeight} ${size}px ${st.fontFamily}`;
    const ls = st.letterSpacing === 'normal' ? 0 : parseFloat(st.letterSpacing) || 0;
    if ('letterSpacing' in x) x.letterSpacing = ls + 'px';
    const s = st.textTransform === 'uppercase' ? text.toUpperCase() : text;
    const m = x.measureText(s);
    const desc = m.fontBoundingBoxDescent ?? size * 0.25;
    const sh = st.textShadow && st.textShadow !== 'none' ? st.textShadow.match(/(rgba?\([^)]*\))\s+([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px/) : null;
    if (sh) { x.shadowColor = sh[1]; x.shadowOffsetX = +sh[2]; x.shadowOffsetY = +sh[3]; x.shadowBlur = +sh[4]; }
    x.fillStyle = st.color;
    // a leading space in the node moves the text right; trimmed, it starts at the first glyph
    const lead = n.textContent.length - n.textContent.trimStart().length;
    const dx = lead ? x.measureText(n.textContent.slice(0, lead)).width : 0;
    x.fillText(s, r.left - box.l + dx, r.bottom - box.t - desc);
    x.shadowColor = 'transparent';
  }
  return c;
}
