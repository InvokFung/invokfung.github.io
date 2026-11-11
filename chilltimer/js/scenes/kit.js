// Shared painters for the scene canvases. Everything draws in a 1600×900 space;
// the engine scales that to the screen.

export const VW = 1600, VH = 900, TAU = Math.PI * 2;

// ---------- numbers ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const span = (t, a, b) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };   // 0 before a, 1 after b
export const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
// Smooth 1D noise in 0..1. Same input, same output: scenes need no stored motion state.
export function noise(t, seed = 0) {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 57.3), hash(i + 1 + seed * 57.3), u);
}

// ---------- colour ----------
const hexCache = new Map();
function rgb(c) {
  if (c[0] !== '#') return c.match(/[\d.]+/g).map(Number);
  let v = hexCache.get(c);
  if (!v) { const n = parseInt(c.slice(1), 16); v = [n >> 16, (n >> 8) & 255, n & 255]; hexCache.set(c, v); }
  return v;
}
export function mix(a, b, t, alpha = 1) {
  const A = rgb(a), B = rgb(b); t = clamp(t);
  const r = Math.round(A[0] + (B[0] - A[0]) * t), gr = Math.round(A[1] + (B[1] - A[1]) * t), bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return alpha >= 1 ? `rgb(${r},${gr},${bl})` : `rgba(${r},${gr},${bl},${Math.max(0, alpha).toFixed(3)})`;
}
export const rgba = (c, a) => mix(c, c, 0, a);
// Colour at t along evenly spaced stops. Used for time-of-day palettes.
export function ramp(stops, t, alpha = 1) {
  const x = clamp(t) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i, alpha);
}

// ---------- light and air ----------
export function fillSky(g, colors, y0 = 0, y1 = VH, x0 = 0, x1 = VW) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  colors.forEach((c, i) => gr.addColorStop(i / (colors.length - 1), c));
  g.fillStyle = gr;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
}

// Additive soft light.
export function glow(g, x, y, r, color, a = 1) {
  if (a <= 0.004 || r <= 0) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(color, a));
  gr.addColorStop(0.4, rgba(color, a * 0.32));
  gr.addColorStop(1, rgba(color, 0));
  const op = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.globalCompositeOperation = op;
}

export function fog(g, y0, y1, color, a, x0 = 0, x1 = VW) {
  if (a <= 0.01) return;
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, rgba(color, 0)); gr.addColorStop(0.55, rgba(color, a)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
}

export function vignette(g, a = 0.5) {
  const gr = g.createRadialGradient(VW / 2, VH / 2, VH * 0.32, VW / 2, VH / 2, VW * 0.74);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, VW, VH);
}

// Soft beam from a lamp: narrow at the top, wide at the bottom.
export function lightCone(g, x, y, topW, botW, h, color, a) {
  if (a <= 0.01) return;
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, rgba(color, a)); gr.addColorStop(1, rgba(color, 0));
  const op = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x - topW / 2, y); g.lineTo(x + topW / 2, y); g.lineTo(x + botW / 2, y + h); g.lineTo(x - botW / 2, y + h);
  g.fill();
  g.globalCompositeOperation = op;
}

// ---------- sky ----------
export function makeStars(rand, n, x0, y0, x1, y1) {
  return Array.from({ length: n }, () => ({
    x: lerp(x0, x1, rand()), y: lerp(y0, y1, rand() ** 1.6), r: 0.9 + rand() * 1.7, sp: 0.4 + rand() * 1.8, ph: rand() * TAU
  }));
}
export function drawStars(g, stars, t, alpha, color = '#ffffff') {
  if (alpha <= 0.01) return;
  g.fillStyle = color;
  for (const s of stars) {
    g.globalAlpha = alpha * (0.4 + 0.6 * Math.sin(t * s.sp + s.ph) ** 2);
    g.fillRect(s.x, s.y, s.r, s.r);
  }
  g.globalAlpha = 1;
}

export function drawMoon(g, x, y, r, color, halo, a = 1) {
  if (a <= 0.01) return;
  glow(g, x, y, r * 6, halo, 0.22 * a);
  g.globalAlpha = a;
  g.fillStyle = color;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = 'rgba(110,110,150,0.16)';
  for (const [dx, dy, k] of [[-0.3, -0.2, 0.24], [0.28, 0.3, 0.17], [0.1, -0.5, 0.1], [-0.35, 0.4, 0.12]]) {
    g.beginPath(); g.arc(x + dx * r, y + dy * r, k * r, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
}

export function makeClouds(rand, n, x0, y0, x1, y1) {
  return Array.from({ length: n }, () => ({
    x0, x1, x: lerp(x0, x1, rand()), y: lerp(y0, y1, rand()), w: 200 + rand() * 300, h: 22 + rand() * 38, v: 2.5 + rand() * 6,
    puffs: Array.from({ length: 6 }, () => [rand(), rand(), 0.45 + rand() * 0.55])
  }));
}
// Clouds drift and wrap. One fill for all, so overlaps do not stack alpha.
export function drawClouds(g, clouds, t, color, alpha) {
  if (alpha <= 0.01) return;
  g.fillStyle = rgba(color, alpha);
  g.beginPath();
  for (const c of clouds) {
    const lane = c.x1 - c.x0 + c.w * 2;
    const x = c.x0 - c.w + ((c.x - c.x0 + c.w + t * c.v) % lane);
    g.moveTo(x + c.w * 0.5, c.y + c.h * 0.35);
    g.ellipse(x, c.y + c.h * 0.35, c.w * 0.5, c.h * 0.45, 0, 0, TAU);
    for (const [px, py, pr] of c.puffs) {
      const ex = x + (px - 0.5) * c.w * 0.8, ey = c.y + (py - 0.5) * c.h * 0.5, rx = c.w * 0.26 * pr;
      g.moveTo(ex + rx, ey);
      g.ellipse(ex, ey, rx, c.h * 0.9 * pr, 0, 0, TAU);
    }
  }
  g.fill();
}

// ---------- land ----------
export const ridgeY = (x, seed, base, amp, scale) =>
  base - amp * (0.65 * noise(x / scale, seed) + 0.35 * noise(x / (scale * 0.31), seed + 11));

export function ridgePath(seed, base, amp, scale, floor = VH, x0 = -20, x1 = VW + 20) {
  const p = new Path2D();
  p.moveTo(x0, floor);
  for (let x = x0; x <= x1; x += 12) p.lineTo(x, ridgeY(x, seed, base, amp, scale));
  p.lineTo(x1, floor);
  p.closePath();
  return p;
}

export function pinesPath(rand, n, x0, x1, yAt, minH, maxH) {
  const p = new Path2D();
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, rand()), h = lerp(minH, maxH, rand()), y = yAt(x) + 5, w = h * 0.34;
    for (let k = 0; k < 3; k++) {
      const yy = y - h * k * 0.26, ww = w * (1 - k * 0.25);
      p.moveTo(x - ww, yy); p.lineTo(x, yy - h * 0.52); p.lineTo(x + ww, yy); p.closePath();
    }
  }
  return p;
}

export function makeTree(rand, x, y, len, ang, depth, w = depth * 2.4, out = []) {
  const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
  out.push([x, y, x1, y1, w]);
  if (depth > 1) {
    const n = 2 + (rand() < 0.35 ? 1 : 0);
    for (let i = 0; i < n; i++) makeTree(rand, x1, y1, len * (0.6 + rand() * 0.22), ang + (rand() - 0.5) * 1.5, depth - 1, w * 0.6, out);
  }
  return out;
}
export function drawTree(g, segs, color) {
  g.strokeStyle = color;
  g.lineCap = 'round';
  for (const [x0, y0, x1, y1, w] of segs) { g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
}

// ---------- city ----------
export function makeSkyline(rand, { x0 = -40, x1 = VW + 40, base, minH, maxH, minW = 50, maxW = 130, win = 9 }) {
  const out = [];
  let x = x0;
  while (x < x1) {
    const w = lerp(minW, maxW, rand()), h = lerp(minH, maxH, rand() ** 1.7);
    const cols = Math.max(1, Math.floor((w - 10) / (win * 1.8))), rows = Math.max(1, Math.floor((h - 16) / (win * 2.1)));
    const padX = (w - cols * win * 1.8 + win * 0.8) / 2;
    const wins = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (rand() < 0.9) wins.push({ x: x + padX + c * win * 1.8, y: base - h + 12 + r * win * 2.1, k: rand(), ph: rand() * 100, c: rand() });
    }
    out.push({ x, w, h, top: rand(), wins });
    x += w + (rand() < 0.3 ? rand() * 14 : 0);
  }
  return out;
}
// `lit` 0..1 is the share of windows that are on. Raising it switches windows on one by one.
export function drawSkyline(g, sky, base, color, { lit = 0.5, colors = ['#ffd58a'], t = 0, win = 9, floor = VH, dim = null, glowA = 0 } = {}) {
  g.fillStyle = color;
  g.beginPath();
  for (const b of sky) {
    g.rect(b.x, base - b.h, b.w + 1, floor - base + b.h);
    if (b.top > 0.72) g.rect(b.x + b.w * 0.45, base - b.h - b.h * 0.16, 3, b.h * 0.16);       // antenna
    else if (b.top < 0.25) g.rect(b.x + b.w * 0.2, base - b.h - 10, b.w * 0.6, 10);             // roof box
  }
  g.fill();
  for (const b of sky) for (const w of b.wins) {
    const on = w.k + 0.06 * Math.sin(t * 0.07 + w.ph) < lit;
    if (!on && !dim) continue;
    g.fillStyle = on ? colors[Math.floor(w.c * colors.length)] : dim;
    g.fillRect(w.x, w.y, win, win * 1.25);
  }
  if (glowA > 0) for (const b of sky) if (b.top > 0.72) {
    const blink = Math.sin(t * 1.6 + b.x) > 0.3 ? 1 : 0.15;
    glow(g, b.x + b.w * 0.45 + 1.5, base - b.h - b.h * 0.16, 14, '#ff4040', glowA * blink);
  }
}

// ---------- weather ----------
// Falling rain. Stateless: each streak's place comes from the clock, and it takes a new
// column every fall, so the pattern does not visibly repeat.
export function rain(g, t, amount, { x0 = 0, y0 = 0, x1 = VW, y1 = VH, n = 240, color = '#cfe3ff', alpha = 0.34, len = 26, slant = 0.16, speed = 1.5, width = 1.3, seed = 0 } = {}) {
  const count = Math.floor(n * clamp(amount));
  if (!count) return;
  const W = x1 - x0, H = y1 - y0;
  g.strokeStyle = rgba(color, alpha);
  g.lineWidth = width;
  g.beginPath();
  for (let i = 0; i < count; i++) {
    const sp = speed * (0.75 + 0.5 * hash(i * 3.3 + seed));
    const fall = hash(i * 1.37 + seed) + t * sp, ph = fall % 1, turn = Math.floor(fall);
    const y = y0 + ph * (H + len) - len;
    const x = x0 - 60 + hash(i * 2.11 + turn * 7.7 + seed) * (W + 120) - (y - y0) * slant;
    const l = len * (0.6 + 0.6 * hash(i + seed));
    g.moveTo(x, y);
    g.lineTo(x - l * slant, y + l);
  }
  g.stroke();
}

// Drops on a window pane: small still beads plus drops that wait, then run down with a trail.
export function makeGlass(rand, n, x0, y0, x1, y1) {
  const drops = Array.from({ length: n }, () => ({
    x: lerp(x0, x1, rand()), y: lerp(y0, y1, rand()), top: 0, r: 2 + rand() * 3.2, v: 0, wait: rand() * 16, sx: rand() * 100
  }));
  drops.forEach(d => { d.top = d.y; });
  const beads = Array.from({ length: n * 6 }, () => ({ x: lerp(x0, x1, rand()), y: lerp(y0, y1, rand()), r: 0.8 + rand() * 1.7, k: rand() }));
  return { drops, beads, x0, y0, x1, y1, rand };
}
export function drawGlass(g, G, dt, amount, color = '#dbe9ff') {
  if (amount <= 0.02) return;
  g.fillStyle = rgba(color, 0.2);
  g.beginPath();
  for (const d of G.beads) if (d.k < amount) { g.moveTo(d.x + d.r, d.y); g.arc(d.x, d.y, d.r, 0, TAU); }
  g.fill();
  g.lineCap = 'round';
  for (const d of G.drops) {
    if (d.wait > 0) d.wait -= dt * (0.25 + amount);
    else {
      d.v = Math.min(d.v + dt * 240, 130 + d.r * 45);
      d.y += d.v * dt;
      d.x += Math.sin(d.y * 0.045 + d.sx) * 0.3;
    }
    if (d.y > G.y1 + 8) {
      d.x = lerp(G.x0, G.x1, G.rand()); d.y = d.top = lerp(G.y0, lerp(G.y0, G.y1, 0.7), G.rand());
      d.v = 0; d.wait = 1 + G.rand() * 16; d.r = 2 + G.rand() * 3.2;
    }
    const a = Math.min(1, amount * 1.4);
    if (d.y - d.top > 3) {
      g.strokeStyle = rgba(color, 0.1 * a);
      g.lineWidth = d.r * 0.9;
      g.beginPath(); g.moveTo(d.x, Math.max(d.top, d.y - 150)); g.lineTo(d.x, d.y); g.stroke();
    }
    g.fillStyle = rgba(color, 0.42 * a);
    g.beginPath(); g.ellipse(d.x, d.y, d.r, d.r * 1.25, 0, 0, TAU); g.fill();
    g.fillStyle = `rgba(255,255,255,${(0.55 * a).toFixed(3)})`;
    g.fillRect(d.x - d.r * 0.4, d.y - d.r * 0.6, d.r * 0.45, d.r * 0.45);
  }
}

// ---------- fire ----------
export function flame(g, x, y, w, h, t, seed = 0) {
  const op = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter';
  const tongues = [['#ff4d1a', 1, 0.5], ['#ff8a2a', 0.74, 0.65], ['#ffc65a', 0.5, 0.8], ['#fff2c4', 0.26, 0.9]];
  tongues.forEach(([c, k, a], i) => {
    const hh = h * k * (0.8 + 0.34 * noise(t * 6 + i, seed)), hw = (w / 2) * k;
    const sway = (noise(t * 3.1 + i * 0.7, seed + 5) - 0.5) * w * 0.7;
    g.fillStyle = rgba(c, a);
    g.beginPath();
    g.moveTo(x - hw, y);
    g.bezierCurveTo(x - hw * 1.25, y - hh * 0.45, x - hw * 0.35 + sway * 0.5, y - hh * 0.7, x + sway, y - hh);
    g.bezierCurveTo(x + hw * 0.35 + sway * 0.5, y - hh * 0.7, x + hw * 1.25, y - hh * 0.45, x + hw, y);
    g.quadraticCurveTo(x, y + hw * 0.7, x - hw, y);
    g.fill();
  });
  g.globalCompositeOperation = op;
}

// Sparks that rise and fade. Stateless, same idea as rain().
export function embers(g, t, x, y, w, h, n, amount = 1, seed = 0) {
  const op = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < Math.floor(n * amount); i++) {
    const rise = hash(i * 1.9 + seed) + t * (0.12 + 0.2 * hash(i + seed)), ph = rise % 1, turn = Math.floor(rise);
    const px = x + (hash(i * 3.1 + turn * 5.3 + seed) - 0.5) * w + Math.sin(t * 2 + i) * 10 * ph;
    const py = y - ph * h;
    g.fillStyle = `rgba(255,${150 + Math.floor(80 * (1 - ph))},70,${(0.9 * (1 - ph) ** 1.5).toFixed(3)})`;
    g.fillRect(px, py, 2.4, 2.4);
  }
  g.globalCompositeOperation = op;
}

export function steam(g, x, y, t, a = 1, h = 80) {
  if (a <= 0.02) return;
  g.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const px = u => x + (k - 1) * 9 + Math.sin(u * 5 + t * 1.2 + k * 2.1) * 12 * u;
    for (let i = 0; i < 9; i++) {
      const u0 = i / 9, u1 = (i + 1) / 9;
      g.strokeStyle = `rgba(255,255,255,${(0.13 * a * (1 - u0)).toFixed(3)})`;
      g.lineWidth = 3 + u0 * 6;
      g.beginPath(); g.moveTo(px(u0), y - u0 * h); g.lineTo(px(u1), y - u1 * h); g.stroke();
    }
  }
}

// A sagging wire of bulbs. `lit` 0..1 is how many bulbs are on, counted from the left.
export function stringLights(g, x0, y0, x1, y1, sag, n, t, { colors = ['#ffd9a0'], lit = 1, r = 5, wire = 'rgba(18,10,8,0.85)', seed = 0, glowR = 7 } = {}) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + sag * 2;
  g.strokeStyle = wire;
  g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, v = 1 - u;
    const bx = v * v * x0 + 2 * v * u * cx + u * u * x1, by = v * v * y0 + 2 * v * u * cy + u * u * y1 + r + 2;
    const c = colors[(i + seed) % colors.length];
    if (u <= lit) {
      const tw = 0.72 + 0.28 * Math.sin(t * (1.1 + hash(i + seed) * 2) + i * 1.7);
      glow(g, bx, by, r * glowR, c, 0.34 * tw);
      g.fillStyle = mix(c, '#ffffff', 0.4);
    } else g.fillStyle = 'rgba(70,60,62,0.9)';
    g.beginPath(); g.arc(bx, by, r, 0, TAU); g.fill();
  }
}
