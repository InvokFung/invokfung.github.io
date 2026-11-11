// Lofi vibe — four more scenes: a night train, a corner shop in the rain, a bedroom studio, a harbour.
// Same story as lofi.js: session 0→1 runs dusk → neon night → first light; round 0→1 runs inside one block.

import {
  VW, VH, TAU, lerp, clamp, span, noise, hash, mix, rgba, fillSky, glow, fog, lightCone,
  makeStars, drawStars, drawMoon, makeClouds, drawClouds, makeSkyline, drawSkyline,
  rain, makeGlass, drawGlass, stringLights, steam, flame
} from './kit.js';

// ---------- story (the same curves as lofi.js, so all Lofi scenes keep one clock) ----------
const nightAt = s => span(s, 0.03, 0.28);
const dawnAt = s => span(s, 0.8, 0.98);
const tone = (c, s) => mix(mix(c[0], c[1], nightAt(s)), c[2], dawnAt(s));
const litAt = s => lerp(0.05, 0.88, span(s, 0.03, 0.42)) - 0.8 * span(s, 0.8, 1);
const neonAt = s => span(s, 0.04, 0.24) * (1 - 0.9 * span(s, 0.84, 1));
const rainAt = (s, t) => Math.exp(-(((s - 0.5) / 0.13) ** 2)) * (0.4 + 0.6 * noise(t / 30, 7));

const SKY = [
  ['#2c1b55', '#05071a', '#1a2a52'],
  ['#5a2470', '#0b1033', '#2f4f78'],
  ['#b23a78', '#171a4a', '#5f8fa6'],
  ['#f06a6a', '#2a2160', '#a9c6b8'],
  ['#ffa66a', '#4a2a6e', '#ffcca0']
];
const FAR = ['#8a3f78', '#1d1c4a', '#6d8ea4'];
const MID = ['#4f2358', '#11122e', '#435f7a'];
const NEAR = ['#22112c', '#08081a', '#1d2b3d'];
const WIN = ['#ffd28a', '#ffb76b', '#ffe9c4', '#8fd8ff', '#ff9fd0', '#ffd28a'];
const FARWIN = ['#ffcf9a', '#ff9fd0', '#9fd8ff'];
const PINK = '#ff4fa3', CYAN = '#4fe3ff';

const wrap = (x, w) => ((x % w) + w) % w;

// A repeating event: about every p seconds (± j/2), lasting d seconds. { u: 0..1, k: which time } or null.
function event(t, p, j, d, seed) {
  const k0 = Math.floor(t / p);
  for (let k = k0; k >= k0 - 1; k--) {
    const u = (t - (k * p + hash(k * 1.31 + seed) * j)) / d;
    if (u >= 0 && u < 1) return { u, k };
  }
  return null;
}

// Neon tube text. `on` 0..1. Off tubes still show as dark glass.
function neonText(g, txt, x, y, size, color, on, off = '#4a2c4a') {
  g.font = `700 ${size}px "Trebuchet MS", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  if (on < 0.05) {
    g.strokeStyle = off; g.lineWidth = size * 0.07;
    g.strokeText(txt, x, y);
    return;
  }
  g.strokeStyle = rgba(color, 0.35 * on); g.lineWidth = size * 0.2;
  g.strokeText(txt, x, y);
  g.strokeStyle = mix(off, color, on); g.lineWidth = size * 0.09;
  g.strokeText(txt, x, y);
  g.strokeStyle = mix(off, mix(color, '#ffffff', 0.65), on); g.lineWidth = size * 0.035;
  g.strokeText(txt, x, y);
}

// Rings on puddles or water while it rains. No stored state.
function ripples(g, t, list, amount, color) {
  if (amount < 0.05) return;
  g.strokeStyle = rgba(color, 0.22 * amount);
  g.lineWidth = 1;
  g.beginPath();
  for (const p of list) for (let i = 0; i < p.n; i++) {
    const life = hash(i * 2.3 + p.x) + t * 1.3, ph = life % 1, turn = Math.floor(life);
    const x = p.x + (hash(i + turn * 3.7 + p.y) - 0.5) * p.rx * 1.5, y = p.y + (hash(i * 5.1 + turn * 1.3 + p.x) - 0.5) * p.ry;
    const r = 2 + ph * 12 * p.k;
    g.moveTo(x + r, y); g.ellipse(x, y, r, r * 0.28, 0, 0, TAU);
  }
  g.stroke();
}

function puddles(g, list, color, a) {
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = rgba(color, a);
  g.beginPath();
  for (const p of list) { g.moveTo(p.x + p.rx, p.y); g.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, TAU); }
  g.fill();
  g.globalCompositeOperation = 'source-over';
}

// Light seen in wet ground: thin vertical streaks under the source that shimmer.
function wetStreaks(g, t, cx, y0, w, h, color, a, n = 22, seed = 0) {
  if (a <= 0.01) return;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = cx + (hash(i * 1.7 + seed) - 0.5) * w, len = h * (0.35 + 0.65 * hash(i * 3.1 + seed));
    const y = y0 + hash(i * 5.3 + seed) * h * 0.15, sw = 1.5 + hash(i + seed) * 4;
    const al = a * (0.3 + 0.7 * noise(t * 1.4 + i * 3.3, seed));
    for (let k = 0; k < 3; k++) {
      g.fillStyle = rgba(color, al * (1 - k * 0.33));
      g.fillRect(x, y + (len * k) / 3, sw, len / 3);
    }
  }
  g.globalCompositeOperation = 'source-over';
}

// Light on calm water: a column of short dashes that sway and change width.
function shimmer(g, t, x, y, w, h, color, a, seed = 0) {
  if (a <= 0.01) return;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = rgba(color, a);
  g.beginPath();
  for (let yy = 0; yy < h; yy += 5) {
    const k = yy / h, ww = w * (0.3 + 0.7 * noise(t * 1.2 + yy * 0.23, seed)) * (1 - 0.6 * k);
    g.rect(x - ww / 2 + Math.sin(t * 1.1 + yy * 0.17 + seed) * (2 + 4 * k), y + yy, ww, 2);
  }
  g.fill();
  g.globalCompositeOperation = 'source-over';
}

// Dark edges, four thin strips.
function edges(g, a) {
  const c0 = 'rgba(0,0,0,0)', c1 = `rgba(0,0,0,${a})`;
  for (const [x0, y0, x1, y1, x, y, w, h] of [[0, 0, 0, 150, 0, 0, VW, 150], [0, VH, 0, VH - 150, 0, VH - 150, VW, 150], [0, 0, 260, 0, 0, 0, 260, VH], [VW, 0, VW - 260, 0, VW - 260, 0, 260, VH]]) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, c1); gr.addColorStop(1, c0);
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  }
}
function breakTint(g, st) {
  if (st.mode === 'focus') return;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,154,200,0.035)';
  g.fillRect(0, 0, VW, VH);
  g.globalCompositeOperation = 'source-over';
}
// Soft oval of air colour, to keep the middle calm behind the timer.
function haze(g, x, y, rx, ry, color, a) {
  g.save();
  g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, rgba(color, a)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.fillRect(-rx, -rx, rx * 2, rx * 2);
  g.restore();
}

// ======================================================================
// 1. Night train — across the carriage, looking out of the far windows
// Story: stations light up on the line map, passengers get off one by one,
// and in a break the train slows into a lit station and waits there.
// ======================================================================
const TW = [[120, 520], [580, 1020], [1080, 1480]], TY0 = 150, TY1 = 590;
const LANE = 2400;            // the outside repeats every LANE px
const VMAX = 240;             // px a second for the nearest layer
const BRAKE = 1750;           // a station comes in from the right edge and stops over this distance
const DECEL = VMAX * VMAX / (2 * BRAKE);
const STRAPS = [210, 330, 450, 1150, 1270, 1390];

// A looping strip of buildings shifted left by `off`. Only the buildings on screen go to paint().
function strip(g, S, sky, off, paint) {
  const o0 = -wrap(off, LANE);
  for (let o = o0; o < VW; o += LANE) {
    const vis = S.vis;
    vis.length = 0;
    for (const b of sky) if (b.x + o < VW + 20 && b.x + b.w + o > -20) vis.push(b);
    g.translate(o, 0); paint(vis, o); g.translate(-o, 0);
  }
}

// The station seen through the windows during a break. px = screen x of its left end.
function platform(g, px, t, s) {
  const lamp = '#fff0d8', L = 1800;
  // floor and the yellow line
  g.fillStyle = tone(['#4a3a56', '#2a2840', '#3c4656'], s); g.fillRect(px, 512, L, 90);
  g.fillStyle = tone(['#6a5876', '#45435e', '#5a6676'], s); g.fillRect(px, 512, L, 7);
  g.fillStyle = '#d8b850'; g.fillRect(px, 526, L, 3);
  // roof
  g.fillStyle = '#16121f'; g.fillRect(px - 20, TY0 - 10, L + 40, 54);
  g.fillStyle = '#2a2436'; g.fillRect(px - 20, TY0 + 44, L + 40, 6);
  // pillars, placed so none stands in the middle of the middle window
  g.fillStyle = '#1d1828';
  for (let x = px + 175; x < px + L; x += 450) g.fillRect(x - 8, TY0 + 50, 16, 362);
  // bench
  g.fillStyle = '#2a2232'; g.fillRect(px + 520, 484, 150, 10); g.fillRect(px + 520, 466, 150, 6);
  g.fillRect(px + 530, 494, 6, 18); g.fillRect(px + 654, 494, 6, 18);
  // vending machine
  g.fillStyle = '#b8c4dc'; g.fillRect(px + 220, 404, 86, 108);
  g.fillStyle = '#eaf6ff'; g.fillRect(px + 228, 412, 70, 52);
  const cans = ['#ff5f7a', '#4fb8ff', '#ffc24f', '#5fd38a'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) { g.fillStyle = cans[(r + c) % 4]; g.fillRect(px + 233 + c * 13, 417 + r * 16, 8, 11); }
  g.fillStyle = '#3a3a4a'; g.fillRect(px + 236, 484, 54, 12);
  glow(g, px + 263, 450, 150, '#cfeaff', 0.3);
  // station board hanging from the roof
  const sx = px + 1250;
  g.fillStyle = '#1d1828'; g.fillRect(sx - 60, TY0 + 50, 3, 30); g.fillRect(sx + 57, TY0 + 50, 3, 30);
  g.fillStyle = '#f4f0e6'; g.fillRect(sx - 90, TY0 + 78, 180, 48);
  g.fillStyle = PINK; g.beginPath(); g.arc(sx - 64, TY0 + 102, 14, 0, TAU); g.fill();
  g.fillStyle = '#f4f0e6'; g.fillRect(sx - 69, TY0 + 96, 10, 12);
  g.fillStyle = '#2a2232'; g.fillRect(sx - 40, TY0 + 90, 96, 10); g.fillRect(sx - 40, TY0 + 106, 64, 6);
  g.fillStyle = '#6ee7ff'; g.fillRect(sx - 90, TY0 + 122, 180, 4);
  glow(g, sx, TY0 + 102, 170, '#fff4e0', 0.28);
  // tube lights under the roof and their pools on the floor
  for (let x = px + 100; x < px + L; x += 300) {
    g.fillStyle = lamp; g.fillRect(x - 44, TY0 + 50, 88, 4);
    glow(g, x, TY0 + 56, 110, lamp, 0.2);
    glow(g, x, 530, 150, lamp, 0.09);
  }
  // a little flicker on one tube
  if (noise(t * 3, 9) > 0.8) { g.fillStyle = 'rgba(20,16,30,0.7)'; g.fillRect(px + 1300 - 44, TY0 + 50, 88, 4); }
}

export const train = {
  id: 'train', name: 'Night train', focus: [0.5, 0.5],
  setup(rand) {
    const keep = sky => sky.filter(b => b.x + b.w <= LANE);
    const far = keep(makeSkyline(rand, { x0: 0, x1: LANE, base: 520, minH: 50, maxH: 190, minW: 36, maxW: 90, win: 5 }));
    const mid = keep(makeSkyline(rand, { x0: 0, x1: LANE, base: 600, minH: 70, maxH: 210, minW: 60, maxW: 150, win: 8 }));
    const signs = [];
    for (const b of mid) if (rand() < 0.28) signs.push({ x: b.x + b.w * 0.18, y: 600 - b.h - 22, w: b.w * 0.64, h: 13, c: [PINK, CYAN, '#ffb070'][Math.floor(rand() * 3)], k: rand() });
    const win = new Path2D(), corners = new Path2D(), R = 26;
    for (const [a, b] of TW) {
      win.roundRect(a, TY0, b - a, TY1 - TY0, R);
      for (const [cx, cy, dx, dy] of [[a, TY0, 1, 1], [b, TY0, -1, 1], [a, TY1, 1, -1], [b, TY1, -1, -1]]) {
        corners.moveTo(cx, cy); corners.lineTo(cx + dx * R, cy); corners.arcTo(cx, cy, cx, cy + dy * R, R); corners.closePath();
      }
    }
    const weave = new Path2D();
    for (let y = 652; y < 730; y += 12) for (let x = 104 + (y % 24); x < 1496; x += 24) weave.rect(x, y, 3, 3);
    return {
      far, mid, signs, win, corners, weave, vis: [],
      stars: makeStars(rand, 60, 120, 160, 1480, 380),
      clouds: makeClouds(rand, 5, 0, 190, VW, 320),
      dist: rand() * 5000, drift: 0, v: VMAX, acc: 0, stopAt: null, plat: -1e9, first: true,
      // people sitting on our side, seen only as reflections; each gets off at session k
      pax: [{ x: 300, k: 0.34, c: '#ff9fd0', ph: rand() * TAU }, { x: 1230, k: 0.56, c: '#9fe8ff', ph: rand() * TAU }, { x: 1390, k: 0.74, c: '#ffd28a', ph: rand() * TAU }]
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, n = nightAt(s), dw = dawnAt(s), wet = rainAt(s, t), lit = litAt(s), neon = neonAt(s);
    const hor = tone(SKY[4], s);

    // ---- motion: run at speed, or brake into a station when a break starts ----
    const brk = st.mode !== 'focus';
    if (brk && S.stopAt === null) { S.stopAt = S.first ? S.dist : S.dist + BRAKE; if (S.first) S.v = 0; }
    if (!brk && S.stopAt !== null) S.stopAt = null;
    S.first = false;
    const v0 = S.v;
    if (S.stopAt !== null) {
      S.plat = S.stopAt;
      S.v = Math.min(VMAX, S.v + 22 * dt, Math.sqrt(2 * DECEL * Math.max(0, S.stopAt - S.dist)));
    } else S.v = Math.min(VMAX, S.v + 18 * dt);
    S.dist += S.v * dt;
    S.drift += (S.v + 30) * dt;
    S.acc += ((S.v - v0) / dt - S.acc) * Math.min(1, dt * 2);
    const run = S.v / VMAX;

    // carriage wall
    const wallC = mix('#3a2c4c', '#271f38', n);
    g.fillStyle = wallC;
    g.fillRect(0, 0, VW, VH);

    // ---- outside: drawn in one plain rectangle; the pillars and round corners are painted over it after ----
    g.save();
    g.beginPath(); g.rect(TW[0][0], TY0, TW[2][1] - TW[0][0], TY1 - TY0); g.clip();
    const bob = (Math.sin(t * 2.3) * 1.2 + (noise(t * 3, 5) - 0.5) * 2) * run;
    g.translate(0, bob);
    fillSky(g, SKY.map(c => tone(c, s)), TY0 - 4, TY1 + 4);
    drawStars(g, S.stars, t, 0.8 * n * (1 - dw));
    const u = st.round, mx = lerp(200, 1400, u), my = 250 - 70 * 4 * u * (1 - u);
    drawMoon(g, mx, my, 26, '#fff1dc', '#ffc6e8', 0.75 + 0.25 * n - 0.3 * dw);
    drawClouds(g, S.clouds, t, tone(['#ff9a9a', '#2a2454', '#e9c0b0'], s), 0.4);
    fog(g, 380, 600, '#ff5fa2', 0.13 * neon);
    const farC = tone(FAR, s);
    strip(g, S, S.far, S.dist * 0.035, vis => drawSkyline(g, vis, 520, farC, { lit: lit * 0.7, colors: FARWIN, t, win: 5, glowA: 0.7 * n }));
    fog(g, 420, 600, hor, 0.36);
    haze(g, 800, 470, 380, 90, hor, 0.25);
    const midC = tone(MID, s), signOn = 1 - 0.85 * span(s, 0.55, 0.85);
    strip(g, S, S.mid, S.dist * 0.16, (vis, o) => {
      drawSkyline(g, vis, 600, midC, { lit, colors: WIN, t, win: 8 });
      // rooftop signs: they go dark one by one late in the night
      for (const sg of S.signs) {
        if (sg.x + o > VW + 40 || sg.x + sg.w + o < -40) continue;
        let on = neon * (sg.k < signOn ? 1 : 0);
        if (sg.k < 0.12) on *= noise(t * 2, sg.k * 99) > 0.25 ? 1 : 0.3;
        g.fillStyle = midC; g.fillRect(sg.x + 4, sg.y + sg.h, 3, 22); g.fillRect(sg.x + sg.w - 7, sg.y + sg.h, 3, 22);
        g.fillStyle = mix('#2a1a30', sg.c, 0.25 + 0.65 * on); g.fillRect(sg.x, sg.y, sg.w, sg.h);
        g.fillStyle = rgba('#ffffff', 0.35 * on); g.fillRect(sg.x + 4, sg.y + 5, sg.w - 8, 2);
        glow(g, sg.x + sg.w / 2, sg.y + sg.h / 2, sg.w * 0.9, sg.c, 0.28 * on);
      }
    });
    fog(g, 500, 600, hor, 0.2);

    // viaduct with another train on it now and then, overtaking slowly
    const vC = mix(midC, '#000000', 0.25);
    g.fillStyle = vC; g.fillRect(0, 552, VW, 10);
    for (let x = -wrap(S.dist * 0.3, 150); x < VW; x += 150) g.fillRect(x, 560, 12, 40);
    const e = event(t, 64, 24, 34, 13);
    if (e) {
      const x0 = lerp(-1000, VW + 40, e.u), car = 156;
      g.fillStyle = mix(vC, '#000000', 0.2);
      g.beginPath();
      for (let c = 0; c < 6; c++) g.roundRect(x0 + c * (car + 5), 526, car, 26, c === 5 ? [4, 12, 4, 4] : 4);
      g.fill();
      g.fillStyle = mix('#fff0c8', vC, 0.15);
      g.beginPath();
      for (let c = 0; c < 6; c++) for (let i = 0; i < 8; i++) g.rect(x0 + c * (car + 5) + 9 + i * 18.5, 532, 11, 8);
      g.fill();
      g.fillStyle = rgba(CYAN, 0.75); g.fillRect(x0 + 4, 546, 6 * (car + 5) - 13, 2);
      glow(g, x0 + 6 * (car + 5), 538, 70, '#fff4d8', 0.5);
    }

    // near: a low wall with lamps, and poles for the overhead wire
    const nearC = tone(NEAR, s);
    g.fillStyle = nearC; g.fillRect(0, 574, VW, 30);
    g.fillStyle = rgba(hor, 0.25); g.fillRect(0, 574, VW, 1.5);
    for (let x = -wrap(S.dist, 820); x < VW + 80; x += 820) {
      g.fillStyle = nearC; g.fillRect(x, 470, 5, 106); g.fillRect(x - 8, 468, 22, 6);
      g.fillStyle = '#ffd9a0'; g.fillRect(x - 5, 474, 16, 3);
      glow(g, x + 3, 478, 90, '#ffbf70', 0.4 * (0.3 + 0.7 * n));
    }
    for (let x = -wrap(S.dist + 400, 1300); x < VW + 40; x += 1300) {
      g.fillStyle = nearC; g.fillRect(x, TY0, 6, 430); g.fillRect(x - 30, 196, 70, 5);
    }
    g.fillStyle = rgba(nearC, 0.9); g.fillRect(0, 202, VW, 1.5);       // the wire

    // the station, while it is in view
    const px = S.plat - S.dist - 100;
    if (px < VW && px + 1800 > 0) platform(g, px, t, s);
    g.translate(0, -bob);

    // ---- reflections of the carriage in the glass: stronger when it is dark outside ----
    const refl = 0.4 + 0.6 * n * (1 - dw);
    g.fillStyle = rgba('#fff3e0', 0.07 * refl); g.fillRect(0, 160, VW, 24);
    g.fillStyle = rgba('#fff3e0', 0.18 * refl); g.fillRect(0, 170, VW, 4);
    g.fillStyle = rgba('#7a5a8a', 0.2 * refl); g.fillRect(0, 498, VW, 100);
    g.fillStyle = rgba('#d0aae0', 0.14 * refl); g.fillRect(0, 496, VW, 3);
    for (const p of S.pax) {
      const a = refl * (1 - span(s, p.k, p.k + 0.03));
      if (a <= 0.01) continue;
      const nod = Math.sin(t * 0.35 + p.ph) * 3;
      g.fillStyle = rgba('#8a70a0', 0.3 * a);
      g.beginPath(); g.roundRect(p.x - 46, 464, 92, 140, [32, 32, 0, 0]); g.fill();
      g.beginPath(); g.ellipse(p.x + nod, 434 + Math.abs(nod) * 0.6, 21, 25, nod * 0.04, 0, TAU); g.fill();
      g.fillStyle = rgba(p.c, 0.22 * a); g.fillRect(p.x - 26, 462, 52, 9);
    }
    g.fillStyle = 'rgba(150,160,255,0.035)'; g.fillRect(0, TY0, VW, TY1 - TY0);

    // ---- rain on the glass: blown back while running, sliding down when stopped ----
    if (wet > 0.02) {
      const count = Math.floor(70 * Math.min(1, wet * 1.4)), W = 1360, H = TY1 - TY0;
      g.strokeStyle = rgba('#e6dcff', 0.16); g.lineWidth = 1.6; g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < count; i++) {
        const sp = 0.6 + 0.8 * hash(i * 4.1), fall = 18 + 30 * hash(i * 5.2);
        const x = 120 + wrap(hash(i * 1.3) * W - S.drift * sp * 1.1, W), y = TY0 + wrap(hash(i * 2.7) * H + t * fall, H);
        const vx = -(S.v + 30) * sp * 1.1, m = Math.hypot(vx, fall), L = 4 + Math.min(26, m * 0.09);
        g.moveTo(x, y); g.lineTo(x - (vx / m) * L, y - (fall / m) * L);
      }
      g.stroke();
      g.fillStyle = rgba('#f4eeff', 0.45);
      g.beginPath();
      for (let i = 0; i < count; i++) {
        const sp = 0.6 + 0.8 * hash(i * 4.1), fall = 18 + 30 * hash(i * 5.2);
        g.rect(120 + wrap(hash(i * 1.3) * W - S.drift * sp * 1.1, W) - 1.5, TY0 + wrap(hash(i * 2.7) * H + t * fall, H) - 1.5, 3, 3);
      }
      g.fill();
    }
    g.restore();

    // ---- carriage ----
    g.fillStyle = wallC;
    g.fillRect(TW[0][1], TY0, TW[1][0] - TW[0][1], TY1 - TY0); g.fillRect(TW[1][1], TY0, TW[2][0] - TW[1][1], TY1 - TY0);
    g.fill(S.corners);
    g.lineWidth = 12; g.strokeStyle = '#141020'; g.stroke(S.win);
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(230,210,255,0.22)'; g.stroke(S.win);

    // ceiling with its light
    fillSky(g, ['#4a3e60', '#2e2642'], 0, 60);
    g.fillStyle = '#f6ecdc'; g.fillRect(420, 10, 760, 10);
    g.fillStyle = 'rgba(255,240,220,0.3)'; g.fillRect(420, 20, 760, 3);
    // ad strip
    g.fillStyle = '#251e33'; g.fillRect(0, 60, VW, 52);
    g.fillStyle = 'rgba(255,240,230,0.08)'; g.fillRect(0, 60, VW, 2);
    // three small posters: a cup, waves, a moon
    for (const [x, c, kind] of [[400, '#ff9fd0', 0], [1040, '#9fe8ff', 1], [1240, '#ffd28a', 2]]) {
      g.fillStyle = mix(c, '#251e33', 0.25); g.fillRect(x, 68, 150, 36);
      g.fillStyle = mix(c, '#251e33', 0.65);
      if (kind === 0) { g.fillRect(x + 16, 78, 16, 16); g.fillRect(x + 32, 82, 5, 7); }
      else if (kind === 1) for (let k = 0; k < 3; k++) g.fillRect(x + 12 + k * 14, 86 - (k % 2) * 4, 12, 3);
      else { g.beginPath(); g.arc(x + 26, 86, 10, 0, TAU); g.fill(); }
      g.fillRect(x + 60, 78, 74, 5); g.fillRect(x + 60, 90, 50, 4);
    }
    // line map: one station lights up after another over the session; the next one blinks
    g.fillStyle = '#0d0a15'; g.beginPath(); g.roundRect(612, 66, 376, 40, 6); g.fill();
    g.fillStyle = rgba(CYAN, 0.3); g.fillRect(640, 85, 320, 2);
    g.fillStyle = rgba(CYAN, 0.85); g.fillRect(640, 85, 320 * s, 2);
    const cur = Math.min(7, Math.floor(s * 7 + 1e-6));
    for (let i = 0; i < 8; i++) {
      const x = 640 + (i * 320) / 7;
      let c = i <= cur ? CYAN : '#2c3444';
      if (i === cur + 1 && Math.sin(t * 3) > 0) c = PINK;
      g.fillStyle = c; g.fillRect(x - 4, 82, 8, 8);
      if (i <= cur) glow(g, x, 86, 16, CYAN, 0.25);
    }
    g.fillStyle = PINK; g.beginPath(); g.moveTo(640 + 320 * s - 5, 98); g.lineTo(640 + 320 * s + 5, 98); g.lineTo(640 + 320 * s, 92); g.fill();

    // rail and hand straps: they sway with the track and lean forward when the train brakes
    g.fillStyle = '#a8a0bc'; g.fillRect(100, 114, 1400, 5);
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(100, 114, 1400, 1.5);
    const lean = clamp(S.acc * 0.006, -0.22, 0.22);
    STRAPS.forEach((x, i) => {
      const a = lean + (Math.sin(t * 1.15 + i * 0.7) * 0.05 + (noise(t * 0.8, i) - 0.5) * 0.06) * (0.25 + run);
      g.save(); g.translate(x, 118); g.rotate(a);
      g.fillStyle = '#2a2234'; g.fillRect(-4, 0, 8, 78);
      g.strokeStyle = '#e8e0f2'; g.lineWidth = 5;
      g.beginPath(); g.roundRect(-15, 78, 30, 28, 9); g.stroke();
      g.restore();
    });
    // grab poles in front of the pillars
    for (const x of [550, 1050]) {
      g.fillStyle = '#8a82a0'; g.fillRect(x - 4, 118, 8, 782);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x - 2, 118, 2, 782);
    }

    // seat: a long bench along the wall
    g.fillStyle = 'rgba(255,240,230,0.06)'; g.fillRect(0, 612, VW, 3);
    g.fillStyle = '#58304f'; g.beginPath(); g.roundRect(94, 644, 1412, 96, 14); g.fill();
    g.fillStyle = 'rgba(255,170,220,0.09)'; g.fill(S.weave);
    g.fillStyle = '#6e3c62'; g.beginPath(); g.roundRect(84, 734, 1432, 34, 12); g.fill();
    g.fillStyle = 'rgba(255,220,240,0.12)'; g.fillRect(96, 736, 1408, 3);
    g.fillStyle = '#3e1f38'; g.fillRect(96, 766, 1408, 46);
    g.fillStyle = '#120e1a'; g.fillRect(0, 812, VW, 88);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 140; x < 1480; x += 36) g.fillRect(x, 830, 20, 3);
    // end screens of the bench
    for (const x of [60, 1504]) {
      g.fillStyle = 'rgba(200,190,230,0.16)'; g.beginPath(); g.roundRect(x, 610, 36, 210, 10); g.fill();
      g.fillStyle = '#9890ae'; g.fillRect(x + 14, 600, 6, 220);
    }

    // a folded umbrella leaning on the end of the bench, still wet
    g.save(); g.translate(132, 814); g.rotate(-0.1);
    g.fillStyle = '#2c2a4a';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-8, -46); g.lineTo(-10, -104); g.lineTo(-4, -136); g.lineTo(4, -136); g.lineTo(10, -104); g.lineTo(8, -46); g.fill();
    g.fillStyle = 'rgba(200,190,255,0.18)'; g.beginPath(); g.moveTo(0, -4); g.lineTo(-6, -50); g.lineTo(-7, -104); g.lineTo(-4, -104); g.lineTo(-3, -50); g.fill();
    g.fillStyle = '#ff9fd0'; g.fillRect(-9, -98, 18, 4);
    g.fillStyle = '#1a1424'; g.fillRect(-1.5, -168, 3, 34);
    g.strokeStyle = '#1a1424'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.arc(-8, -168, 8, 0, Math.PI, true); g.stroke();
    g.restore();
    g.fillStyle = rgba('#cfd8ff', 0.12 * wet + 0.04); g.beginPath(); g.ellipse(134, 822, 26, 4, 0, 0, TAU); g.fill();

    // ---- light ----
    // lamps outside throw a warm patch that slides along the seat
    for (let x = -wrap(S.dist, 820); x < VW + 300; x += 820) glow(g, x - 160, 700, 230, '#ffbf70', 0.06 * (0.3 + 0.7 * n));
    fillSky(g, ['rgba(255,240,220,0.07)', 'rgba(255,240,220,0)'], 22, 150);
    fillSky(g, ['rgba(6,3,13,0)', rgba('#06030d', 0.7)], 620, VH);
    // the station's light comes in through the windows
    if (px < VW && px + 1800 > 0) glow(g, 800, 700, 800, '#ffe6c0', 0.06);
    breakTint(g, st);
    edges(g, 0.5);
  }
};

// ======================================================================
// 2. Corner shop — across a wet street at night
// Story: windows above light up and go dark, the laundromat runs its loads through
// each block and closes late in the night, the street lamp goes off at first light.
// In a break the shop door opens and the cat wakes up.
// ======================================================================
const FAC = { l: ['#5a2f4e', '#1f1832', '#3f4652'], m: ['#4a2844', '#191428', '#353c48'], r: ['#62344a', '#221a34', '#46404c'] };
const SIDE = 702;    // top of the pavement

// One cat that gets up: w = 0 curled asleep (breathing), w = 1 sitting with the tail moving.
function drawCat(g, x, y, t, w, rim) {
  const fur = '#1e1626', L = (a, b) => a + (b - a) * w;
  const br = 1 + 0.06 * Math.sin(t * 1.5) * (1 - w), sw = Math.sin(t * 1.3) * 10 * w;
  const hx = x + L(-24, -2), hy = y - L(10, 42);
  g.fillStyle = fur;
  g.beginPath(); g.ellipse(x + L(0, 4), y - L(11, 18) * br, L(30, 15), L(12, 19) * br, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(hx, hy, L(11, 11), L(9, 10), 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(hx - 9, hy - 4); g.lineTo(hx - 7, hy - 16); g.lineTo(hx - 1, hy - 7); g.moveTo(hx + 3, hy - 7); g.lineTo(hx + 8, hy - 16); g.lineTo(hx + 10, hy - 3); g.fill();
  g.strokeStyle = fur; g.lineWidth = L(6, 5); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x + L(26, 16), y - 4); g.quadraticCurveTo(x + L(8, 34), y + L(4, -6), x + L(-14, 34) + sw * 0.3, y - L(1, 26) - sw); g.stroke();
  if (w > 0.8 && Math.sin(t * 0.7) > -0.96) { g.fillStyle = '#ffd86a'; g.fillRect(hx - 5, hy - 2, 3, 2); g.fillRect(hx + 3, hy - 2, 3, 2); }
  // warm light from the shop catches the back and the ears
  g.fillStyle = rgba(rim, 0.85);
  g.fillRect(x + L(-10, 17), y - L(23, 34) * br, L(32, 2), L(2, 26));
  g.fillRect(hx - 8, hy - L(8, 10), L(10, 2), L(2, 8));
}

function drawBike(g, x, y, frame) {
  const R = 30, x1 = x, x2 = x + 104;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = '#0c0912'; g.lineWidth = 4;
  g.beginPath(); g.arc(x1, y, R, 0, TAU); g.moveTo(x2 + R, y); g.arc(x2, y, R, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(200,190,230,0.25)'; g.lineWidth = 1;
  g.beginPath(); g.arc(x1, y, R - 3, -2.4, -0.9); g.moveTo(x2 + R - 3, y); g.arc(x2, y, R - 3, -2.4, -0.9); g.stroke();
  g.strokeStyle = frame; g.lineWidth = 4;
  const bb = [x + 46, y], seat = [x + 36, y - 46], head = [x + 90, y - 50];
  g.beginPath();
  g.moveTo(x1, y); g.lineTo(...bb); g.lineTo(...seat); g.lineTo(x1, y);
  g.moveTo(...bb); g.lineTo(head[0] - 4, head[1] + 10); g.lineTo(...seat);
  g.moveTo(x2, y); g.lineTo(...head);
  g.stroke();
  g.strokeStyle = '#0c0912'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(head[0] - 8, head[1] - 4); g.lineTo(head[0] + 8, head[1] - 8); g.stroke();
  g.fillStyle = '#0c0912'; g.fillRect(seat[0] - 10, seat[1] - 5, 22, 5);
  // a basket on the front
  g.fillStyle = '#2a1e26'; g.fillRect(head[0] + 2, head[1] - 4, 30, 20);
  g.strokeStyle = 'rgba(255,220,180,0.15)'; g.lineWidth = 1;
  g.beginPath(); for (let k = 6; k < 30; k += 6) { g.moveTo(head[0] + 2 + k, head[1] - 4); g.lineTo(head[0] + 2 + k, head[1] + 16); } g.stroke();
}

export const corner = {
  id: 'corner', name: 'Corner shop', focus: [0.84, 0.5],
  setup(rand) {
    const flats = [];
    const grid = (x0, cols, dx, rows, w, h, bias) => {
      for (const y of rows) for (let c = 0; c < cols; c++) flats.push({ x: x0 + c * dx, y, w, h, k: bias + rand() * (1 - bias), c: Math.floor(rand() * 5), b: rand(), ph: rand() * 100 });
    };
    grid(196, 4, 84, [238, 330], 50, 62, 0);
    grid(612, 4, 104, [196, 300], 56, 70, 0.45);      // the middle building stays mostly dark
    grid(1086, 5, 100, [278], 56, 58, 0);
    const bricks = new Path2D();
    for (let y = 214; y < 450; y += 15) { bricks.rect(0, y, 566, 1.5); }
    for (let y = 166; y < 456; y += 15) { bricks.rect(566, y, 470, 1.5); }
    for (let y = 246; y < 380; y += 15) { bricks.rect(1036, y, 564, 1.5); }
    const ribs = new Path2D();
    for (let y = 476; y < 700; y += 9) ribs.rect(600, y, 400, 2.5);
    // goods on the shop shelves, one path per colour
    const goodsC = ['#ff7a9a', '#ffd06a', '#7ad0ff', '#9ae08a', '#c89aff', '#f2f0e6'];
    const goods = goodsC.map(() => new Path2D());
    for (const y of [536, 578, 620]) for (let x = 1092; x < 1314;) {
      const w = 7 + rand() * 9, h = 12 + rand() * 18;
      goods[Math.floor(rand() * goodsC.length)].rect(x, y - h, w, h);
      x += w + 2 + rand() * 3;
    }
    const fruit = [];
    for (let i = 0; i < 40; i++) {
      const c = i % 3, x0 = 1104 + c * 96;
      fruit.push({ x: x0 + 8 + rand() * 70, y: 654 + rand() * 8, r: 7 + rand() * 3, c: ['#ff9a3a', '#ff5a5a', '#a8e05a'][c] });
    }
    fruit.sort((a, b) => a.y - b.y);
    return {
      stars: makeStars(rand, 50, 0, 10, VW, 200),
      clouds: makeClouds(rand, 5, -100, 40, VW + 100, 170),
      far: makeSkyline(rand, { x0: -40, x1: VW + 40, base: 340, minH: 60, maxH: 210, minW: 34, maxW: 90, win: 4 }),
      flats, bricks, ribs, goods, goodsC, fruit,
      order: Array.from({ length: 8 }, () => rand() * 0.85),
      clothes: Array.from({ length: 8 }, () => [rand() * TAU, 0.8 + rand() * 0.6, Math.floor(rand() * 4)]),
      pools: [{ x: 760, y: 728, rx: 110, ry: 7, n: 6, k: 0.9 }, { x: 1260, y: 818, rx: 210, ry: 13, n: 10, k: 1.3 }, { x: 380, y: 856, rx: 170, ry: 12, n: 9, k: 1.2 }, { x: 900, y: 880, rx: 120, ry: 10, n: 6, k: 1 }],
      cat: 0, door: 0
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, n = nightAt(s), dw = dawnAt(s), lit = litAt(s), neon = neonAt(s);
    const wet = 0.3 + 0.7 * rainAt(s, t);            // always a light drizzle here
    const hor = tone(SKY[4], s);
    const open = 1 - span(s, 0.62, 0.7);             // the laundromat closes late in the night
    const lamp = 1 - span(s, 0.86, 0.96);            // the street lamp goes off at first light
    const brk = st.mode !== 'focus' ? 1 : 0;
    S.cat += (brk - S.cat) * Math.min(1, dt * 0.6);
    S.door += (brk - S.door) * Math.min(1, dt * 1.2);
    const warm = '#ffd9a0', cool = '#cfeef5';

    // ---- sky and the far city ----
    fillSky(g, SKY.map(c => tone(c, s)), 0, 470);
    drawStars(g, S.stars, t, 0.7 * n * (1 - dw));
    const u = st.round, mx = lerp(280, 1320, u), my = 112 - 56 * 4 * u * (1 - u);
    drawMoon(g, mx, my, 24, '#fff1dc', '#ffc6e8', 0.75 + 0.25 * n - 0.3 * dw);
    drawClouds(g, S.clouds, t, tone(['#ff9a9a', '#2a2454', '#e9c0b0'], s), 0.4);
    fog(g, 180, 380, '#ff5fa2', 0.14 * neon);
    drawSkyline(g, S.far, 340, tone(FAR, s), { lit: lit * 0.7, colors: FARWIN, t, win: 4, glowA: 0.8 * n });
    // one tall tower behind the shop, with a slow red light
    const tc = tone(FAR, s);
    g.fillStyle = mix(tc, '#000000', 0.12); g.fillRect(1236, 70, 54, 280); g.fillRect(1250, 40, 26, 32); g.fillRect(1261, 4, 4, 38);
    g.fillStyle = rgba(CYAN, 0.2 + 0.6 * neon); g.fillRect(1236, 70, 54, 2);
    const bl = (0.5 + 0.5 * Math.sin(t * 2)) ** 3;
    glow(g, 1263, 6, 40, '#ff4040', 0.8 * bl * n);
    fog(g, 170, 360, hor, 0.3);

    // ---- buildings across the street ----
    const fl = tone(FAC.l, s), fm = tone(FAC.m, s), fr = tone(FAC.r, s);
    g.fillStyle = fl; g.fillRect(0, 200, 566, 520);
    g.fillStyle = fm; g.fillRect(566, 150, 470, 570);
    g.fillStyle = fr; g.fillRect(1036, 232, 564, 488);
    g.fillStyle = 'rgba(0,0,0,0.13)'; g.fill(S.bricks);
    g.fillStyle = mix(fl, '#ffffff', 0.07); g.fillRect(0, 200, 566, 9);
    g.fillStyle = mix(fm, '#ffffff', 0.07); g.fillRect(566, 150, 470, 9);
    g.fillStyle = mix(fr, '#ffffff', 0.07); g.fillRect(1036, 232, 564, 9);
    g.fillStyle = rgba(hor, 0.4); g.fillRect(0, 200, 566, 2); g.fillRect(566, 150, 470, 2); g.fillRect(1036, 232, 564, 2);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(560, 209, 6, 500); g.fillRect(1036, 241, 8, 470);
    // roofs: a dryer vent (puffs while the laundromat runs), a kitchen pipe, a water tank
    g.fillStyle = mix(fl, '#000000', 0.3); g.fillRect(420, 176, 52, 24); g.fillRect(436, 168, 20, 10);
    steam(g, 446, 166, t, 0.9 * open, 90);
    g.fillStyle = mix(fr, '#000000', 0.35); g.fillRect(1148, 192, 14, 40); g.fillRect(1142, 186, 26, 8);
    steam(g, 1155, 184, t * 0.8 + 3, 0.7, 110);
    const tk = mix(fr, '#000000', 0.3);
    g.fillStyle = tk; g.fillRect(1420, 150, 90, 70); g.fillRect(1428, 220, 6, 12); g.fillRect(1496, 220, 6, 12);
    g.beginPath(); g.moveTo(1414, 152); g.lineTo(1465, 124); g.lineTo(1516, 152); g.fill();
    g.fillStyle = rgba(hor, 0.35); g.fillRect(1420, 150, 2, 70);

    // windows above the shops
    for (const w of S.flats) {
      const mid = w.x > 566 && w.x < 1036;
      const on = w.k + 0.05 * Math.sin(t * 0.05 + w.ph) < lit * (mid ? 0.55 : 1);
      const base = mid ? fm : w.x < 566 ? fl : fr;
      g.fillStyle = mix(base, '#000000', 0.45); g.fillRect(w.x - 4, w.y - 4, w.w + 8, w.h + 8);
      g.fillStyle = on ? mix(WIN[w.c], base, mid ? 0.45 : 0.2) : mix(base, '#0a0814', 0.55);
      g.fillRect(w.x, w.y, w.w, w.h);
      if (on && w.b < 0.45) { g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = w.y + 5; y < w.y + w.h; y += 7) g.fillRect(w.x, y, w.w, 2); }
      if (on && w.b > 0.8) { g.fillStyle = 'rgba(20,10,20,0.55)'; g.beginPath(); g.ellipse(w.x + w.w * 0.3, w.y + w.h - 8, 9, 10, 0, 0, TAU); g.fill(); g.fillRect(w.x + w.w * 0.3 - 6, w.y + w.h - 4, 12, 4); }
      g.fillStyle = mix(base, '#000000', 0.15); g.fillRect(w.x - 6, w.y + w.h + 4, w.w + 12, 5);
      g.fillStyle = rgba(hor, 0.2); g.fillRect(w.x - 6, w.y + w.h + 4, w.w + 12, 1.5);
    }
    // air conditioners under two windows, dripping now and then
    g.fillStyle = mix(fl, '#c8c0d0', 0.25); g.fillRect(270, 410, 54, 30);
    g.fillStyle = mix(fr, '#c8c0d0', 0.25); g.fillRect(1290, 352, 54, 30);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (const [x, y] of [[270, 410], [1290, 352]]) for (let k = 0; k < 4; k++) g.fillRect(x + 4, y + 6 + k * 6, 46, 2);
    {
      const d = (t * 0.6) % 1, dy = d * d * 300;
      g.fillStyle = rgba('#dfe8ff', 0.5 * (1 - d)); g.fillRect(1316, 384 + dy, 2, 5);
    }

    // ---- the middle: a closed shop behind a shutter ----
    g.fillStyle = mix(fm, '#000000', 0.35); g.fillRect(600, 404, 400, 40);
    g.fillStyle = mix(fm, '#ffffff', 0.05); g.fillRect(606, 410, 388, 28);
    g.fillStyle = mix(fm, '#000000', 0.45); g.fillRect(590, 452, 420, 18);
    g.fillStyle = mix(fm, '#9a94b0', 0.22); g.fillRect(600, 470, 400, 232);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fill(S.ribs);
    // a faded painted circle on the shutter and two flyers on the wall
    g.fillStyle = rgba('#ff9fd0', 0.07); g.beginPath(); g.arc(800, 580, 60, 0, TAU); g.fill();
    g.fillStyle = mix(fm, '#f2e8d8', 0.35); g.fillRect(1006, 520, 22, 30); g.fillRect(568, 540, 24, 32);
    // the lamp's warm light on the shutter
    glow(g, 640, 560, 260, '#ffcf8a', 0.12 * lamp);

    // ---- laundromat, left ----
    const lx0 = 176, lx1 = 540, ly0 = 470, ly1 = 698;
    g.fillStyle = mix('#1e2838', '#b4dce6', 0.12 + 0.8 * open); g.fillRect(lx0, ly0, lx1 - lx0, ly1 - ly0);
    g.fillStyle = mix('#18202c', '#9cc8d0', 0.1 + 0.6 * open); g.fillRect(lx0, 640, lx1 - lx0, ly1 - 640);
    const body = mix('#2a3240', '#dce8ec', 0.25 + 0.6 * open), drumC = '#22344a';
    const clothC = ['#ff9fd0', '#ffd28a', '#9fe8ff', '#f2f0e6'];
    for (let i = 0; i < 8; i++) {
      const top = i >= 4, col = i % 4, x = 188 + col * 88, y = top ? 486 : 576, h = top ? 82 : 112, cx = x + 39, cy = top ? 530 : 632, r = top ? 22 : 27;
      g.fillStyle = body; g.fillRect(x, y, 78, h);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y + 12, 78, 2);
      g.fillStyle = '#7a8a98'; g.beginPath(); g.arc(cx, cy, r + 5, 0, TAU); g.fill();
      g.fillStyle = drumC; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
      const running = open > 0.5 && st.round > S.order[i];
      const [ph, sp, c] = S.clothes[i];
      if (running) {
        const a = t * sp * 2.2 + ph;
        for (let k = 0; k < 3; k++) {
          g.fillStyle = clothC[(c + k) % 4];
          g.beginPath(); g.ellipse(cx + Math.cos(a + k * 2.1) * r * 0.5, cy + Math.sin(a + k * 2.1) * r * 0.5, r * 0.42, r * 0.3, a + k, 0, TAU); g.fill();
        }
      } else {
        g.fillStyle = clothC[c]; g.beginPath(); g.arc(cx, cy, r * 0.94, 0.45, Math.PI - 0.45); g.fill();     // a load waiting at the bottom
      }
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(cx - r * 0.6, cy - r * 0.6, r * 0.5, 3);
      g.fillStyle = running ? '#7dffb0' : '#4a5a60'; g.fillRect(x + 62, y + 4, 8, 4);
    }
    fillSky(g, ['rgba(10,20,40,0)', 'rgba(10,20,40,0.3)'], 500, ly1, lx0, lx1);
    // ceiling tubes
    g.fillStyle = mix('#5a6470', '#ffffff', open); g.fillRect(200, 476, 130, 4); g.fillRect(390, 476, 130, 4);
    // glass: frame, mullions and a soft streak
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.beginPath(); g.moveTo(250, ly0); g.lineTo(300, ly0); g.lineTo(230, ly1); g.lineTo(180, ly1); g.fill();
    g.fillStyle = mix(fl, '#000000', 0.5);
    g.fillRect(lx0 - 8, ly0 - 8, lx1 - lx0 + 16, 8); g.fillRect(lx0 - 8, ly0, 8, ly1 - ly0); g.fillRect(lx1, ly0, 8, ly1 - ly0);
    g.fillRect(354, ly0, 6, ly1 - ly0);
    glow(g, 358, 580, 330, cool, 0.16 * open);
    // sign
    g.fillStyle = '#100a16'; g.beginPath(); g.roundRect(198, 410, 320, 46, 6); g.fill();
    const lOn = neon * open * (noise(t * 0.6, 4) > 0.1 ? 1 : 0.35);
    neonText(g, 'LAUNDRY', 358, 434, 32, CYAN, lOn);
    glow(g, 358, 434, 200, CYAN, 0.26 * lOn);

    // ---- corner shop, right: open all night ----
    // sign board and the awning
    g.fillStyle = '#120a14'; g.beginPath(); g.roundRect(1070, 372, 460, 52, 6); g.fill();
    const sOn = neon * (Math.sin(t * 23) > -0.95 ? 1 : 0.5);
    neonText(g, '24H', 1150, 399, 34, PINK, sOn);
    g.fillStyle = mix('#3a2a3a', '#fff2dc', 0.3 + 0.6 * neon); g.fillRect(1214, 386, 280, 7); g.fillRect(1214, 403, 190, 6);
    glow(g, 1150, 398, 170, PINK, 0.3 * sOn);
    // window
    fillSky(g, ['#ffe8c0', '#f2c690', '#d89a70'], 476, 696, 1080, 1404);
    g.fillStyle = 'rgba(120,60,50,0.25)'; g.fillRect(1080, 640, 324, 56);
    g.fillStyle = 'rgba(120,70,60,0.5)'; for (const y of [536, 578, 620]) g.fillRect(1086, y, 236, 4);
    S.goods.forEach((p, i) => { g.fillStyle = S.goodsC[i]; g.fill(p); });
    // drinks fridge at the back
    g.fillStyle = '#bff0ff'; g.fillRect(1326, 490, 70, 150);
    g.fillStyle = 'rgba(40,90,120,0.35)'; for (const y of [526, 562, 598]) g.fillRect(1326, y, 70, 3);
    g.fillStyle = 'rgba(40,90,120,0.5)'; g.fillRect(1360, 490, 2, 150);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath(); g.moveTo(1150, 476); g.lineTo(1210, 476); g.lineTo(1130, 696); g.lineTo(1080, 696); g.fill();
    // door: swings open in a break
    g.fillStyle = mix('#ffe4b8', '#fff4e0', 0.4); g.fillRect(1420, 470, 100, 230);
    const dwid = 100 - 70 * S.door;
    g.fillStyle = 'rgba(80,60,70,0.35)'; g.fillRect(1420, 470, dwid, 230);
    g.fillStyle = mix(fr, '#000000', 0.5); g.fillRect(1420 + dwid - 4, 470, 4, 230); g.fillRect(1420, 470, 4, 230);
    neonText(g, 'OPEN', 1420 + dwid / 2, 510, 15, CYAN, neon * (1 - 0.5 * S.door));
    // frames
    g.fillStyle = mix(fr, '#000000', 0.5);
    g.fillRect(1072, 468, 340, 8); g.fillRect(1072, 468, 8, 230); g.fillRect(1404, 468, 8, 230); g.fillRect(1412, 462, 116, 8); g.fillRect(1520, 462, 8, 238);
    // awning with stripes and a scalloped edge
    const awn = 0.55 + 0.45 * (1 - n * 0.5);
    for (let x = 1050, k = 0; x < 1590; x += 36, k++) {
      g.fillStyle = mix(k % 2 ? '#f3e6d0' : '#ff7ac8', '#1a1020', 0.35 + 0.3 * n - 0.2 * awn);
      g.fillRect(x, 432, 36, 38);
      g.beginPath(); g.arc(x + 18, 470, 18, 0, Math.PI); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(1050, 432, 540, 8);
    g.fillStyle = rgba(warm, 0.16); g.fillRect(1050, 466, 540, 4);
    glow(g, 1240, 590, 360, warm, 0.2);
    glow(g, 1470, 600, 200 + 80 * S.door, warm, 0.16 + 0.12 * S.door);

    // ---- pavement and the street ----
    g.fillStyle = tone(['#3a2836', '#18131f', '#2a3038'], s); g.fillRect(0, SIDE, VW, 44);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 40; x < VW; x += 96) g.fillRect(x, SIDE, 2, 44);
    g.fillStyle = tone(['#5a4050', '#2a2434', '#4a525a'], s); g.fillRect(0, 746, VW, 10);
    fillSky(g, [tone(['#24161f', '#0b0a14', '#1a1f26'], s), tone(['#140b14', '#050409', '#0f1218'], s)], 756, VH);
    // light from the windows on the wet pavement
    g.globalCompositeOperation = 'lighter';
    for (const [x0, x1, c, a, spread] of [[lx0, lx1, cool, 0.1 * open, 40], [1080, 1404, warm, 0.12, 36], [1420, 1520, warm, 0.06 + 0.14 * S.door, 30 + 40 * S.door]]) {
      const gr = g.createLinearGradient(0, SIDE, 0, 746);
      gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x0, SIDE); g.lineTo(x1, SIDE); g.lineTo(x1 + spread, 746); g.lineTo(x0 - spread, 746); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // reflections in the road
    wetStreaks(g, t, 358, 760, 360, 140, cool, 0.14 * open, 16, 11);
    wetStreaks(g, t, 1240, 760, 320, 140, warm, 0.17, 16, 12);
    wetStreaks(g, t, 358, 770, 240, 110, CYAN, 0.12 * lOn, 14, 13);
    wetStreaks(g, t, 1150, 770, 120, 120, PINK, 0.16 * sOn, 12, 14);
    wetStreaks(g, t, 612, 760, 50, 140, '#ffcf8a', 0.2 * lamp, 10, 15);
    puddles(g, S.pools, mix(hor, PINK, 0.4 * neon), 0.08 + 0.08 * wet);
    ripples(g, t, S.pools, wet, '#f0e4ff');

    // fruit crates under the shop window
    for (let c = 0; c < 3; c++) {
      const x = 1100 + c * 96;
      g.fillStyle = '#5a3a2e'; g.fillRect(x, 662, 84, 38);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, 676, 84, 3); g.fillRect(x, 688, 84, 3);
      g.fillStyle = rgba(warm, 0.3); g.fillRect(x, 662, 84, 2);
    }
    for (const f of S.fruit) {
      g.fillStyle = f.c; g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(f.x - f.r * 0.5, f.y - f.r * 0.6, 3, 3);
    }
    // step at the door, and the shop cat
    g.fillStyle = tone(['#6a5060', '#3a3446', '#5a6068'], s); g.fillRect(1412, 698, 124, 10);
    drawCat(g, 1470, 698, t, S.cat, warm);
    // bicycle parked in front of the laundromat
    drawBike(g, 216, 708, mix('#6fd6c0', '#1a1424', 0.35 + 0.25 * n));

    // street lamp, with the rain showing in its light
    const lampC = '#ffcf8a', post = '#0e0a14';
    g.fillStyle = post; g.fillRect(544, 270, 8, 470); g.fillRect(538, 728, 20, 14);
    g.strokeStyle = post; g.lineWidth = 6;
    g.beginPath(); g.moveTo(548, 274); g.quadraticCurveTo(552, 244, 612, 252); g.stroke();
    g.fillStyle = post; g.beginPath(); g.moveTo(592, 250); g.lineTo(632, 250); g.lineTo(622, 262); g.lineTo(602, 262); g.fill();
    g.fillStyle = mix('#4a3a30', '#fff2d0', lamp); g.fillRect(602, 262, 20, 3);
    lightCone(g, 612, 266, 22, 320, 440, lampC, 0.1 * lamp);
    glow(g, 612, 266, 110, lampC, 0.5 * lamp);
    // rain lit by the lamp: three bands that get wider going down, roughly the shape of the light
    if (lamp > 0.02) for (const [y0, y1, hw, k] of [[270, 430, 50, 0], [430, 580, 105, 1], [580, 706, 150, 2]]) {
      rain(g, t, wet, { x0: 612 - hw + 72, y0, x1: 612 + hw - 48, y1, n: 18 + k * 12, alpha: (0.5 - k * 0.1) * lamp, color: '#ffe6c0', len: 22, seed: 5 + k });
    }

    // a car goes by now and then, lights on the wet road
    const e = event(t, 30, 14, 7, 41);
    if (e) {
      const dir = hash(e.k * 1.7) < 0.5 ? 1 : -1, x = dir > 0 ? lerp(-480, VW + 480, e.u) : lerp(VW + 480, -480, e.u);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - 200, 856, 400, 30);
      g.fillStyle = '#0d0a14';
      g.beginPath(); g.roundRect(x - 200, 786, 400, 64, 14); g.fill();
      g.beginPath(); g.moveTo(x - 130, 790); g.lineTo(x - 80, 742); g.lineTo(x + 70, 742); g.lineTo(x + 130, 790); g.fill();
      g.fillStyle = rgba(hor, 0.28);
      g.beginPath(); g.moveTo(x - 112, 788); g.lineTo(x - 74, 750); g.lineTo(x - 8, 750); g.lineTo(x - 8, 788); g.moveTo(x + 4, 788); g.lineTo(x + 4, 750); g.lineTo(x + 64, 750); g.lineTo(x + 108, 788); g.fill();
      g.fillStyle = rgba(warm, 0.25); g.fillRect(x - 196, 800, 392, 2);
      g.fillStyle = '#060509';
      for (const wx of [x - 120, x + 120]) { g.beginPath(); g.arc(wx, 850, 24, 0, TAU); g.fill(); }
      glow(g, x + dir * 200, 812, 200, '#fff4dc', 0.55);
      glow(g, x - dir * 200, 812, 70, '#ff3040', 0.6);
      wetStreaks(g, t, x + dir * 190, 860, 60, 50, '#fff4dc', 0.35, 8, 16);
    }

    rain(g, t, wet, { n: 220, alpha: 0.2, color: '#d8d0ff', len: 26 });
    breakTint(g, st);
    edges(g, 0.5);
  }
};

// ======================================================================
// 3. Bedroom studio — a CRT, a tape deck, a lava lamp, fairy lights
// Story: sticky notes fill the board over the session, the lava lamp warms up,
// the tape winds from one reel to the other in each block, the tea goes cold in focus
// and is fresh again in a break, when the screen shows a slow wave instead of the bars.
// ======================================================================
const WX0 = 170, WX1 = 560, WY0 = 130, WY1 = 540;

export const studio = {
  id: 'studio', name: 'Bedroom studio', focus: [0.84, 0.5],
  setup(rand) {
    const bars = Array.from({ length: 20 }, (_, i) => mix(CYAN, PINK, i / 19));
    const scan = new Path2D();
    for (let y = 352; y < 506; y += 3) scan.rect(1166, y, 198, 1.2);
    const notes = Array.from({ length: 12 }, (_, i) => ({
      x: 1458 + (i % 3) * 40, y: 172 + Math.floor(i / 3) * 52, a: (rand() - 0.5) * 0.24,
      c: ['#ffe07a', '#ff9fd0', '#9fe8ff', '#c9a0ff', '#a8f0b8'][Math.floor(rand() * 5)], l: 0.4 + rand() * 0.5
    }));
    // shuffle the order notes appear in
    for (let i = notes.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [notes[i], notes[j]] = [notes[j], notes[i]]; }
    const quilt = new Path2D();
    for (let x = -20; x < 600; x += 40) quilt.rect(x, 700, 20, 150);
    const planks = new Path2D();
    for (let y = 664; y < VH; y += 26) planks.rect(560, y, 1040, 1.5);
    const bottle = new Path2D(), lx = 1074;      // the lava lamp's glass
    bottle.moveTo(lx - 12, 444); bottle.lineTo(lx + 12, 444); bottle.lineTo(lx + 20, 546); bottle.lineTo(lx - 20, 546); bottle.closePath();
    return {
      stars: makeStars(rand, 30, WX0, WY0, WX1, 330),
      clouds: makeClouds(rand, 3, WX0 - 100, 160, WX1 + 100, 300),
      far: makeSkyline(rand, { x0: WX0 - 20, x1: WX1 + 20, base: WY1, minH: 50, maxH: 170, minW: 26, maxW: 60, win: 4 }),
      mid: makeSkyline(rand, { x0: WX0 - 20, x1: WX1 + 20, base: WY1, minH: 30, maxH: 120, minW: 40, maxW: 90, win: 6 }),
      glass: makeGlass(rand, 14, WX0, WY0, WX1, WY1),
      bars, scan, notes, quilt, planks, bottle,
      blobs: Array.from({ length: 5 }, () => ({ ph: rand() * TAU, sp: 0.5 + rand() * 0.7, r: 7 + rand() * 6, x: (rand() - 0.5) * 12 })),
      aL: 0, aR: 0
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, n = nightAt(s), dw = dawnAt(s), wet = rainAt(s, t), lit = litAt(s), neon = neonAt(s);
    const hor = tone(SKY[4], s), brk = st.mode !== 'focus';
    const wall = tone(['#3a2240', '#1c1530', '#2c2e3c'], s);

    g.fillStyle = wall; g.fillRect(0, 0, VW, VH);
    // soft vertical stripes on the wallpaper
    g.fillStyle = 'rgba(255,255,255,0.018)';
    for (let x = 0; x < VW; x += 64) g.fillRect(x, 0, 30, 660);

    // ---- window ----
    g.save();
    g.beginPath(); g.rect(WX0, WY0, WX1 - WX0, WY1 - WY0); g.clip();
    fillSky(g, SKY.map(c => tone(c, s)), WY0, WY1);
    drawStars(g, S.stars, t, 0.8 * n * (1 - dw));
    const u = st.round, mx = lerp(WX0 + 50, WX1 - 50, u), my = 210 - 50 * 4 * u * (1 - u);
    drawMoon(g, mx, my, 20, '#fff1dc', '#ffc6e8', 0.75 + 0.25 * n - 0.3 * dw);
    drawClouds(g, S.clouds, t * 0.6, tone(['#ff9a9a', '#2a2454', '#e9c0b0'], s), 0.4);
    fog(g, 380, 560, '#ff5fa2', 0.14 * neon, WX0, WX1);
    drawSkyline(g, S.far, WY1, tone(FAR, s), { lit: lit * 0.7, colors: FARWIN, t, win: 4, glowA: 0.8 * n });
    fog(g, 400, 560, hor, 0.3, WX0, WX1);
    drawSkyline(g, S.mid, WY1, tone(MID, s), { lit, colors: WIN, t, win: 6, glowA: 0.8 * n });
    rain(g, t, wet, { x0: WX0, y0: WY0, x1: WX1, y1: WY1, n: 70, alpha: 0.26, color: '#d8d0ff' });
    g.fillStyle = 'rgba(160,170,255,0.05)'; g.fillRect(WX0, WY0, WX1 - WX0, WY1 - WY0);
    drawGlass(g, S.glass, dt, wet * 1.2, '#e6dcff');
    g.restore();
    const frame = '#160f1c';
    g.fillStyle = frame;
    g.fillRect(WX0 - 12, WY0 - 12, WX1 - WX0 + 24, 12); g.fillRect(WX0 - 12, WY0, 12, WY1 - WY0); g.fillRect(WX1, WY0, 12, WY1 - WY0);
    g.fillRect((WX0 + WX1) / 2 - 4, WY0, 8, WY1 - WY0); g.fillRect(WX0, 332, WX1 - WX0, 8);
    g.fillStyle = tone(['#5a3a4a', '#2a2238', '#3c3c48'], s); g.fillRect(WX0 - 24, WY1, WX1 - WX0 + 48, 16);
    g.fillStyle = rgba(hor, 0.25); g.fillRect(WX0 - 24, WY1, WX1 - WX0 + 48, 2);
    // a candle and a small plant on the sill
    g.fillStyle = '#efe2cc'; g.fillRect(232, 512, 16, 28);
    flame(g, 240, 512, 9, 22, t, 3);
    glow(g, 240, 500, 90, '#ffb060', 0.35 * (0.85 + 0.15 * noise(t * 5, 2)));
    g.fillStyle = '#b0604a'; g.fillRect(470, 516, 34, 24);
    g.fillStyle = '#3f7a54';
    for (const [dx, dy, a] of [[-10, -12, -0.6], [4, -20, 0.1], [16, -10, 0.7], [-2, -26, -0.2]]) { g.beginPath(); g.ellipse(487 + dx, 516 + dy, 6, 13, a, 0, TAU); g.fill(); }
    // curtains
    g.fillStyle = '#2a1e2a'; g.fillRect(96, 106, 540, 6);
    for (const [x0, x1] of [[112, 206], [524, 620]]) {
      g.fillStyle = tone(['#7a3a62', '#4a2448', '#5a4a5a'], s);
      g.beginPath(); g.moveTo(x0, 112); g.lineTo(x1, 112); g.lineTo(x1 + 6, 620); g.lineTo(x0 - 6, 620); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let x = x0 + 12; x < x1; x += 22) g.fillRect(x, 112, 8, 508);
      g.fillStyle = rgba(hor, 0.12); g.fillRect(x0 === 112 ? x1 - 3 : x0, 112, 3, 508);
    }

    // ---- bed, lower left ----
    g.fillStyle = '#1a1220'; g.fillRect(-20, 560, 40, 300);                                   // bed head
    const pil = tone(['#e4c8d8', '#7e70a0', '#c8c8d4'], s);
    g.fillStyle = pil; g.beginPath(); g.ellipse(90, 632, 92, 30, -0.06, 0, TAU); g.fill();       // pillow
    g.fillStyle = mix(pil, '#ffffff', 0.25); g.beginPath(); g.ellipse(80, 620, 60, 10, -0.06, 0, TAU); g.fill();
    const blk = tone(['#5a3a78', '#2c2450', '#46506a'], s);
    g.fillStyle = blk;
    g.beginPath(); g.moveTo(150, 652); g.quadraticCurveTo(380, 630, 620, 662); g.lineTo(624, 860); g.lineTo(-20, 860); g.lineTo(-20, 668); g.quadraticCurveTo(60, 660, 150, 652); g.fill();
    g.fillStyle = tone(['#f0dcc8', '#9a8cb0', '#d8d4d8'], s);                                   // turned-down sheet
    g.beginPath(); g.moveTo(-20, 668); g.quadraticCurveTo(60, 660, 150, 652); g.quadraticCurveTo(200, 648, 256, 646); g.lineTo(262, 666); g.quadraticCurveTo(140, 672, -20, 690); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.moveTo(262, 666); g.quadraticCurveTo(140, 672, -20, 690); g.lineTo(-20, 696); g.quadraticCurveTo(140, 678, 262, 670); g.fill();
    g.fillStyle = 'rgba(255,160,220,0.08)'; g.fill(S.quilt);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(300, 680); g.quadraticCurveTo(380, 700, 470, 690); g.moveTo(330, 740); g.quadraticCurveTo(420, 752, 540, 736); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(-20, 700, 644, 3);
    // a record sleeve left on the blanket
    g.fillStyle = '#ff7ac8'; g.beginPath(); g.moveTo(380, 664); g.lineTo(452, 660); g.lineTo(470, 676); g.lineTo(392, 682); g.fill();
    g.fillStyle = '#1a1220'; g.beginPath(); g.ellipse(424, 671, 18, 6, -0.05, 0, TAU); g.fill();
    g.fillStyle = '#ffd28a'; g.beginPath(); g.ellipse(424, 671, 5, 2, 0, 0, TAU); g.fill();
    g.fillStyle = '#120c18'; g.fillRect(-20, 860, 644, 40);
    // moonlight from the window on the blanket
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rgba('#b8c8ff', 0.05 + 0.04 * n);
    g.beginPath(); g.moveTo(300, 646); g.lineTo(560, 650); g.lineTo(640, 760); g.lineTo(340, 760); g.fill();
    g.globalCompositeOperation = 'source-over';

    // ---- floor and rug ----
    g.fillStyle = tone(['#3a2430', '#16111e', '#262a30'], s); g.fillRect(620, 660, 980, 240);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fill(S.planks);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(620, 656, 980, 6);
    g.fillStyle = tone(['#7a3a5a', '#3a2448', '#4a4a5a'], s);
    g.beginPath(); g.ellipse(820, 820, 280, 54, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,200,230,0.14)'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(820, 820, 240, 42, 0, 0, TAU); g.stroke();
    g.beginPath(); g.ellipse(820, 820, 180, 30, 0, 0, TAU); g.stroke();

    // ---- cork board: a new note now and then over the session ----
    g.fillStyle = '#2a1a16'; g.fillRect(1436, 150, 146, 232);
    g.fillStyle = tone(['#9a6a48', '#5a3e30', '#7a6050'], s); g.fillRect(1444, 158, 130, 216);
    S.notes.forEach((p, i) => {
      if (s < i / 12) return;
      g.save(); g.translate(p.x + 17, p.y + 17); g.rotate(p.a);
      g.fillStyle = mix(p.c, '#2a2030', 0.25 + 0.2 * n); g.fillRect(-17, -17, 34, 34);
      g.fillStyle = 'rgba(40,20,40,0.35)'; g.fillRect(-11, -6, 22 * p.l + 2, 2); g.fillRect(-11, 2, 18 * p.l, 2);
      g.fillStyle = '#ff5a7a'; g.fillRect(-2, -16, 4, 4);
      g.restore();
    });

    // ---- desk ----
    const desk = tone(['#5a3a34', '#241a26', '#3a3438'], s);
    g.fillStyle = mix(desk, '#000000', 0.35); g.fillRect(1018, 640, 16, 260); g.fillRect(1566, 640, 16, 260);
    // records in a crate under the desk
    g.fillStyle = '#2a1e22'; g.fillRect(1070, 780, 150, 92);
    const sleeves = ['#ff7ac8', '#6ee7ff', '#ffd28a', '#c9a0ff', '#f3e6d0', '#ff9a6a', '#7affc8'];
    for (let i = 0; i < 12; i++) { g.fillStyle = mix(sleeves[i % 7], '#120c18', 0.45); g.fillRect(1078 + i * 11, 762 + (i % 3) * 4, 9, 30); }
    g.fillStyle = '#3a2a2e'; g.fillRect(1066, 790, 158, 8);
    g.fillStyle = desk; g.fillRect(990, 598, 610, 18);
    g.fillStyle = mix(desk, '#000000', 0.25); g.fillRect(1000, 616, 600, 26);
    g.fillStyle = 'rgba(255,220,240,0.12)'; g.fillRect(990, 598, 610, 2);

    // plant
    g.fillStyle = '#b0604a'; g.beginPath(); g.moveTo(1500, 548); g.lineTo(1560, 548); g.lineTo(1552, 598); g.lineTo(1508, 598); g.fill();
    g.fillStyle = '#c87458'; g.fillRect(1496, 542, 68, 8);
    for (const [dx, dy, rx, ry, a, c] of [[-26, -42, 14, 34, -0.7, '#2f6b45'], [0, -62, 15, 40, 0, '#3f7a54'], [26, -46, 14, 32, 0.6, '#2f6b45'], [-12, -24, 12, 22, -1.1, '#4a8a5c'], [16, -24, 12, 22, 1.1, '#4a8a5c']]) {
      g.fillStyle = mix(c, '#140c1c', 0.25 + 0.25 * n); g.beginPath(); g.ellipse(1530 + dx, 540 + dy, rx, ry, a, 0, TAU); g.fill();
    }
    // mug: steam fades while you focus and is back in a break
    g.fillStyle = '#e8d9c0'; g.fillRect(1440, 566, 30, 32);
    g.strokeStyle = '#e8d9c0'; g.lineWidth = 4; g.beginPath(); g.arc(1472, 580, 8, -1.3, 1.3); g.stroke();
    g.fillStyle = '#ff7ac8'; g.fillRect(1440, 576, 30, 5);
    steam(g, 1455, 562, t, brk ? 1 : 1 - st.round * 0.9, 70);

    // ---- room darkness, with the window keeping its own light ----
    g.fillStyle = rgba('#06030d', 0.12 + 0.34 * n - 0.14 * dw);
    g.beginPath(); g.rect(0, 0, VW, VH); g.rect(WX0, WY0, WX1 - WX0, WY1 - WY0); g.fill('evenodd');

    // ---- lava lamp: it warms up over the first part of the session ----
    const warm = span(s, 0, 0.3), lx = 1074;
    g.fillStyle = '#2a2232'; g.beginPath(); g.moveTo(lx - 22, 598); g.lineTo(lx + 22, 598); g.lineTo(lx + 13, 546); g.lineTo(lx - 13, 546); g.fill();
    g.fillStyle = '#3a3044'; g.beginPath(); g.moveTo(lx - 9, 430); g.lineTo(lx + 9, 430); g.lineTo(lx + 12, 444); g.lineTo(lx - 12, 444); g.fill();
    g.fillStyle = mix('#5a2050', '#ff6aa8', 0.35 + 0.35 * warm); g.fill(S.bottle);
    g.save(); g.clip(S.bottle);
    g.fillStyle = mix('#ff9a4a', '#ffd06a', 0.4);
    g.beginPath(); g.ellipse(lx, 548, 22, 12, 0, 0, TAU); g.fill();    // the warm pool at the bottom
    for (const b of S.blobs) {
      const k = (0.5 - 0.5 * Math.cos(t * 0.09 * b.sp + b.ph)) * warm;
      const y = lerp(538, 456, k), r = b.r * (1 + 0.15 * Math.sin(t * 0.4 + b.ph));
      g.beginPath(); g.ellipse(lx + b.x * (1 - k * 0.5), y, r * 0.9, r * (1.1 + 0.2 * Math.sin(t * 0.3 + b.ph)), 0, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(lx - 9, 452, 3, 80);
    g.restore();
    glow(g, lx, 500, 240, '#ff6aa8', 0.16 + 0.14 * warm);

    // ---- tape deck with the CRT on top ----
    g.fillStyle = '#242030'; g.beginPath(); g.roundRect(1110, 532, 316, 66, 6); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(1114, 532, 308, 2);
    const play = st.running && !brk;
    const rL = lerp(15, 6, st.round), rR = lerp(6, 15, st.round);
    if (play) { S.aL += dt * 34 / rL; S.aR += dt * 34 / rR; }
    for (const [x0, live] of [[1130, true], [1296, false]]) {
      g.fillStyle = '#0e0b14'; g.fillRect(x0, 542, 110, 42);
      g.fillStyle = live ? '#e8d9c0' : '#5a5060'; g.fillRect(x0 + 6, 546, 98, 34);
      g.fillStyle = live ? '#ff7ac8' : '#3a3444'; g.fillRect(x0 + 6, 546, 98, 8);
      g.fillStyle = '#2a2232'; g.fillRect(x0 + 18, 558, 74, 18);
      for (const [cx, r, a] of [[x0 + 34, live ? rL : 10, S.aL], [x0 + 76, live ? rR : 10, S.aR]]) {
        g.fillStyle = '#4a2e24'; g.beginPath(); g.arc(cx, 567, Math.min(r, 9), 0, TAU); g.fill();
        g.fillStyle = '#d8d0e0'; g.beginPath(); g.arc(cx, 567, 4.5, 0, TAU); g.fill();
        g.strokeStyle = '#2a2232'; g.lineWidth = 1.5;
        g.beginPath();
        for (let k = 0; k < 3; k++) { const aa = (live ? a : 0) + (k * TAU) / 3; g.moveTo(cx, 567); g.lineTo(cx + Math.cos(aa) * 4.5, 567 + Math.sin(aa) * 4.5); }
        g.stroke();
      }
    }
    // VU meters
    for (const [x, sd] of [[1250, 1], [1272, 2]]) {
      g.fillStyle = '#ffd9a0'; g.fillRect(x - 9, 544, 18, 14);
      const lv = play ? 0.2 + 0.7 * noise(t * 4.2, sd) : 0;
      g.strokeStyle = '#2a1a1a'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, 557); g.lineTo(x + Math.cos(-2.6 + lv * 1.6) * 11, 557 + Math.sin(-2.6 + lv * 1.6) * 11); g.stroke();
    }
    g.fillStyle = play ? '#7dffb0' : '#ff5a6a'; g.fillRect(1254, 572, 5, 4);
    g.fillStyle = '#3a3444'; for (let k = 0; k < 4; k++) g.fillRect(1246 + k * 9, 582, 6, 8);

    // CRT
    const crt = tone(['#8a7a84', '#4a4458', '#6a6a74'], s);
    g.fillStyle = mix(crt, '#000000', 0.3); g.fillRect(1162, 516, 186, 16);
    g.fillStyle = crt; g.beginPath(); g.roundRect(1144, 330, 242, 190, 12); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(1150, 332, 230, 3);
    g.fillStyle = '#05060a'; g.beginPath(); g.roundRect(1158, 344, 214, 168, 14); g.fill();
    g.save();
    g.beginPath(); g.roundRect(1166, 352, 198, 152, 12); g.clip();
    g.fillStyle = '#0a1420'; g.fillRect(1166, 352, 198, 152);
    if (!brk) {
      // the visualiser: bars that breathe with the music
      const lv = st.running ? 1 : 0.18;
      for (let i = 0; i < 20; i++) {
        const env = 0.55 + 0.45 * Math.sin((i / 19) * Math.PI);
        const h = 6 + 96 * lv * env * noise(t * 1.6 + i * 0.41, i) ** 1.4;
        g.fillStyle = S.bars[i];
        g.fillRect(1172 + i * 9.6, 494 - h, 7, h);
        g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(1172 + i * 9.6, 490 - h - 4 * noise(t * 0.9 + i, 3), 7, 2);
      }
    } else {
      // in a break: a slow wave and a small moon
      g.strokeStyle = CYAN; g.lineWidth = 2.5;
      g.beginPath();
      for (let x = 0; x <= 198; x += 6) g.lineTo(1166 + x, 440 + Math.sin(x * 0.045 + t * 0.8) * 16 * Math.sin(t * 0.3 + x * 0.01));
      g.stroke();
      g.fillStyle = PINK; g.beginPath(); g.arc(1320, 386, 12, 0, TAU); g.fill();
      g.fillStyle = '#0a1420'; g.beginPath(); g.arc(1326, 382, 10, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill(S.scan);
    g.fillStyle = 'rgba(200,240,255,0.05)'; g.fillRect(1166, 352 + wrap(t * 22, 170) - 10, 198, 12);
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.ellipse(1210, 380, 50, 24, -0.3, 0, TAU); g.fill();
    g.restore();
    g.fillStyle = '#2a2232'; g.fillRect(1350, 500, 22, 8); g.fillStyle = '#7dffb0'; g.fillRect(1180, 500, 6, 4);
    glow(g, 1265, 430, 360, CYAN, 0.12 + 0.06 * n);
    glow(g, 1265, 600, 200, CYAN, 0.08);

    // ---- fairy lights along the top ----
    const fc = ['#ffd9a0', '#ff9fd0', '#ffc27a', '#9fe8ff'];
    stringLights(g, 80, 96, 800, 132, 32, 16, t, { colors: fc, r: 4.5, glowR: 8, wire: 'rgba(10,6,14,0.8)' });
    stringLights(g, 800, 132, 1540, 92, 36, 16, t, { colors: fc, r: 4.5, glowR: 8, wire: 'rgba(10,6,14,0.8)', seed: 2 });

    breakTint(g, st);
    edges(g, 0.5);
  }
};

// ======================================================================
// 4. Harbour lights — a cable bridge going away on the left, the far bank across the water
// Story: traffic thins out late in the night and picks up at first light, fog comes
// in over the water and the last ferry goes, the bridge lights switch off at dawn.
// In a break the bridge cables play a slow colour wave.
// ======================================================================
const HZ = 505;                              // the far waterline
// Bridge in depth z (1 = near edge): x = BX + BXN / z, deck y = HZ - BDH / z, water y = HZ + BWH / z
const BX = 700, BXN = -760, BDH = 205, BWH = 290;
const bx = z => BX + BXN / z, by = z => HZ - BDH / z, bw = z => HZ + BWH / z;
const PYLONS = [[1.6, 760, 34], [3.6, 760, 34]];
const CABLES = [[1.6, [1.0, 1.12, 1.25, 1.4, 1.86, 2.1, 2.36, 2.66]], [3.6, [2.95, 3.12, 3.3, 3.46, 3.9, 4.3, 4.8, 5.4]]];

function ferry(g, x, y, k, on, a) {
  if (a <= 0.01) return;
  g.globalAlpha = a;
  const w = 230 * k;
  g.fillStyle = '#0d0b16';
  g.beginPath(); g.moveTo(x - w / 2, y - 24 * k); g.lineTo(x + w / 2, y - 24 * k); g.lineTo(x + w / 2 - 16 * k, y); g.lineTo(x - w / 2 + 12 * k, y); g.fill();
  g.fillStyle = '#d8d0e4'; g.fillRect(x - w / 2 + 6 * k, y - 18 * k, w - 14 * k, 3 * k);
  g.fillStyle = '#1c1828'; g.fillRect(x - 96 * k, y - 48 * k, 192 * k, 24 * k); g.fillRect(x - 60 * k, y - 68 * k, 120 * k, 20 * k); g.fillRect(x - 14 * k, y - 82 * k, 28 * k, 14 * k);
  g.fillStyle = rgba('#ffe0a8', 0.25 + 0.75 * on);
  for (let i = 0; i < 12; i++) g.fillRect(x - 90 * k + i * 15.5 * k, y - 43 * k, 10 * k, 9 * k);
  for (let i = 0; i < 7; i++) g.fillRect(x - 54 * k + i * 16 * k, y - 63 * k, 10 * k, 8 * k);
  g.fillStyle = '#0d0b16'; g.fillRect(x - 1, y - 104 * k, 2.5, 22 * k);
  g.fillStyle = '#fff'; g.fillRect(x - 2, y - 106 * k, 4, 4);
  g.fillStyle = '#ff4a5a'; g.fillRect(x - w / 2 + 14 * k, y - 30 * k, 4, 4);
  g.fillStyle = '#5aff9a'; g.fillRect(x + w / 2 - 18 * k, y - 30 * k, 4, 4);
  glow(g, x, y - 50 * k, 180 * k, '#ffd28a', 0.22 * on);
  g.globalAlpha = 1;
}

export const harbour = {
  id: 'harbour', name: 'Harbour lights', focus: [0.22, 0.5],
  setup(rand) {
    const bank = [
      ...makeSkyline(rand, { x0: -40, x1: 560, base: HZ, minH: 60, maxH: 200, minW: 36, maxW: 90, win: 6 }),
      ...makeSkyline(rand, { x0: 560, x1: 1060, base: HZ, minH: 26, maxH: 100, minW: 40, maxW: 100, win: 6 }),
      ...makeSkyline(rand, { x0: 1060, x1: VW + 40, base: HZ, minH: 110, maxH: 300, minW: 44, maxW: 110, win: 6 })
    ];
    // window reflections: a short dash in the water under about half the windows
    const refl = [];
    for (const b of bank) for (const w of b.wins) if (rand() < 0.5) {
      const y = HZ + 6 + (HZ - w.y) * 0.42;
      if (y < 780) refl.push({ x: w.x, y, k: w.k, c: Math.floor(w.c * 3), ph: rand() * TAU });
    }
    const silo = new Path2D();
    for (const b of bank) silo.rect(b.x, HZ, b.w + 1, b.h * 0.4);
    return {
      stars: makeStars(rand, 120, 0, 10, VW, 360),
      clouds: makeClouds(rand, 5, -100, 120, VW + 100, 330),
      far: makeSkyline(rand, { x0: -40, x1: VW + 40, base: HZ - 4, minH: 40, maxH: 150, minW: 30, maxW: 80, win: 4 }),
      bank, refl, silo,
      ripl: Array.from({ length: 70 }, () => ({ x: rand() * (VW + 200), y: HZ + 8 + rand() ** 1.6 * 280, w: 20 + rand() * 70, v: 3 + rand() * 6 })),
      pools: [{ x: 900, y: 600, rx: 300, ry: 30, n: 10, k: 1 }, { x: 1250, y: 700, rx: 260, ry: 40, n: 10, k: 1.3 }, { x: 600, y: 740, rx: 220, ry: 30, n: 8, k: 1.4 }]
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, n = nightAt(s), dw = dawnAt(s), wet = rainAt(s, t), lit = litAt(s), neon = neonAt(s);
    const hor = tone(SKY[4], s), brk = st.mode !== 'focus';
    const fogK = span(s, 0.5, 0.8) * (1 - span(s, 0.88, 1));     // fog comes in late and lifts at dawn
    const traffic = 1 - 0.7 * span(s, 0.2, 0.62) + 0.55 * span(s, 0.82, 1);
    const ferryOn = 1 - span(s, 0.74, 0.8);                          // the last ferry
    const bridgeOn = neon;

    // ---- sky ----
    fillSky(g, SKY.map(c => tone(c, s)), 0, HZ + 4);
    drawStars(g, S.stars, t, n * (1 - dw));
    const u = st.round, mx = lerp(1010, 1490, u), my = 150 - 60 * 4 * u * (1 - u);
    const moonA = 0.75 + 0.25 * n - 0.3 * dw;
    drawMoon(g, mx, my, 28, '#fff1dc', '#ffc6e8', moonA);
    drawClouds(g, S.clouds, t * 0.8, tone(['#ff9a9a', '#2a2454', '#e9c0b0'], s), 0.42);
    fog(g, 330, 540, '#ff5fa2', 0.14 * neon);

    // ---- far bank ----
    drawSkyline(g, S.far, HZ - 4, tone(FAR, s), { lit: lit * 0.6, colors: FARWIN, t, win: 4 });
    fog(g, 360, 530, hor, 0.36);
    const bankC = tone(MID, s);
    // two tall towers on the right with slow red lights
    g.fillStyle = mix(bankC, '#000000', 0.1);
    g.fillRect(1300, 170, 72, 340); g.fillRect(1314, 130, 44, 42); g.fillRect(1334, 74, 4, 58);
    g.fillRect(1508, 230, 6, 280); g.beginPath(); g.ellipse(1511, 268, 20, 12, 0, 0, TAU); g.fill(); g.fillRect(1509, 120, 3, 112);
    g.fillStyle = rgba(CYAN, 0.2 + 0.6 * neon); g.fillRect(1300, 170, 72, 2.5); g.fillRect(1314, 130, 44, 2);
    g.fillStyle = rgba(PINK, 0.2 + 0.6 * neon); g.fillRect(1491, 266, 40, 3);
    const b1 = (0.5 + 0.5 * Math.sin(t * 1.9)) ** 3, b2 = (0.5 + 0.5 * Math.sin(t * 1.9 + 2.2)) ** 3;
    g.fillStyle = mix('#5a1a1a', '#ff5a5a', b1); g.fillRect(1333, 70, 6, 6);
    g.fillStyle = mix('#5a1a1a', '#ff5a5a', b2); g.fillRect(1508, 116, 5, 5);
    glow(g, 1336, 73, 50, '#ff4040', 0.7 * b1);
    glow(g, 1510, 118, 40, '#ff4040', 0.7 * b2);
    drawSkyline(g, S.bank, HZ, bankC, { lit, colors: WIN, t, win: 6, glowA: 0.8 * n });
    // ferry pier
    const pierOn = 1 - span(s, 0.86, 0.96);
    g.fillStyle = mix(bankC, '#000000', 0.2); g.fillRect(1110, 478, 150, 28); g.fillRect(1100, 472, 170, 7);
    g.fillStyle = rgba('#ffe0a8', 0.3 + 0.6 * pierOn); for (let k = 0; k < 7; k++) g.fillRect(1118 + k * 20, 486, 12, 8);
    g.fillStyle = rgba(CYAN, 0.25 + 0.6 * neon * pierOn); g.fillRect(1100, 472, 170, 2);
    glow(g, 1185, 490, 120, '#ffd28a', 0.2 * pierOn);
    fog(g, 440, 540, hor, 0.3);

    // ---- water ----
    fillSky(g, [mix(hor, bankC, 0.45), tone(['#2a1430', '#070818', '#1a2632'], s), tone(['#160a1c', '#04050c', '#0e141c'], s)], HZ, 800);
    g.fillStyle = rgba(bankC, 0.5); g.fill(S.silo);                     // the far bank upside down, soft
    g.fillStyle = rgba(hor, 0.1);
    g.beginPath();
    for (const r of S.ripl) g.rect(wrap(r.x + t * r.v, VW + 200) - 100, r.y, r.w, 1.5);
    g.fill();
    // window lights in the water
    g.globalCompositeOperation = 'lighter';
    for (let c = 0; c < 3; c++) {
      g.fillStyle = rgba(FARWIN[c], 0.32);
      g.beginPath();
      for (const r of S.refl) if (r.c === c && r.k < lit) g.rect(r.x + Math.sin(t * 1.2 + r.ph) * 2.5, r.y, 7 + 3 * Math.sin(t * 0.9 + r.ph), 1.6);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    shimmer(g, t, mx, HZ + 8, 46, 250 - (my - 120) * 0.6, '#ffe8f4', 0.3 * moonA, 1);
    shimmer(g, t, 1336, HZ + 8, 12, 150, '#ff6060', 0.3 * b1, 2);
    shimmer(g, t, 1185, HZ + 6, 60, 70, '#ffd28a', 0.25 * pierOn, 3);
    shimmer(g, t, 1336, HZ + 8, 40, 110, CYAN, 0.12 * neon, 4);
    // the bridge upside down in the water
    g.fillStyle = 'rgba(4,3,10,0.35)';
    g.beginPath();
    g.moveTo(bx(13), HZ + (2 * BWH + BDH) / 13); g.lineTo(bx(1), HZ + (2 * BWH + BDH)); g.lineTo(bx(1), HZ + (2 * BWH + BDH - 30)); g.lineTo(bx(13), HZ + (2 * BWH + BDH - 30) / 13);
    g.fill();
    for (const [z, h, w] of PYLONS) {
      const x = bx(z), yw = bw(z), top = HZ + (2 * BWH + h) / z;
      g.fillRect(x - w / 2 / z * 1.6, yw, (w / z) * 1.6, top - yw);
    }

    // ---- the bridge ----
    const deck = mix(bankC, '#000000', 0.35);
    // piers under the deck
    g.fillStyle = mix(deck, '#000000', 0.2);
    for (const z of [6, 9]) g.fillRect(bx(z) - 7 / z * 4, by(z), (14 / z) * 4, bw(z) - by(z));
    // pylons
    for (const [z, h, w] of PYLONS) {
      const x = bx(z), top = HZ - h / z, base = bw(z), wb = (w / z) * 1.6, wt = wb * 0.55;
      g.fillStyle = deck;
      g.beginPath(); g.moveTo(x - wb / 2, base); g.lineTo(x + wb / 2, base); g.lineTo(x + wt / 2, top); g.lineTo(x - wt / 2, top); g.fill();
      g.fillStyle = rgba(hor, 0.3); g.fillRect(x + wt / 2 - 2, top, 2, base - top);
      // light washing up the pylon from the deck
      glow(g, x, by(z) - 20 / z, 160 / z * 2, '#ffd0a0', 0.12 * bridgeOn);
      const bl = (0.5 + 0.5 * Math.sin(t * 2.1 + z)) ** 3;
      g.fillStyle = mix('#5a1a1a', '#ff5a5a', bl); g.fillRect(x - 3, top - 6, 6, 6);
      glow(g, x, top - 3, 50, '#ff4040', 0.7 * bl);
    }
    // cables with small lights on them; a slow colour wave runs along them in a break
    g.strokeStyle = rgba(mix(hor, '#ffffff', 0.3), 0.3); g.lineWidth = 1.2;
    g.beginPath();
    for (const [zp, list] of CABLES) for (const z of list) { g.moveTo(bx(zp), HZ - 760 / zp + 8); g.lineTo(bx(z), by(z)); }
    g.stroke();
    if (bridgeOn > 0.02) {
      let i = 0;
      for (const [zp, list] of CABLES) for (const z of list) {
        const x0 = bx(zp), y0 = HZ - 760 / zp + 8, x1 = bx(z), y1 = by(z);
        for (let k = 1; k <= 4; k++, i++) {
          const f = k / 5, c = brk ? mix(PINK, CYAN, 0.5 + 0.5 * Math.sin(t * 0.9 - i * 0.18)) : (i % 2 ? PINK : CYAN);
          g.fillStyle = c; g.globalAlpha = bridgeOn;
          g.fillRect(lerp(x0, x1, f) - 1.5, lerp(y0, y1, f) - 1.5, 3, 3);
        }
      }
      g.globalAlpha = 1;
    }
    // deck
    const dT0 = [bx(0.95), by(0.95)], dT1 = [bx(13), by(13)];
    g.fillStyle = deck;
    g.beginPath(); g.moveTo(...dT0); g.lineTo(...dT1); g.lineTo(dT1[0], HZ - (BDH - 26) / 13); g.lineTo(dT0[0], HZ - (BDH - 26) / 0.95); g.fill();
    g.fillStyle = rgba(hor, 0.35);
    g.beginPath(); g.moveTo(...dT0); g.lineTo(...dT1); g.lineTo(dT1[0], dT1[1] + 0.3); g.lineTo(dT0[0], dT0[1] + 2); g.fill();
    // deck lamps
    for (let z = 1.1; z < 12; z *= 1.22) {
      const x = bx(z), y = by(z) - 16 / z;
      g.fillStyle = '#ffe0b0'; g.fillRect(x - 1, y - 1, 2.5, 2.5);
      if (z < 5) glow(g, x, y, 40 / Math.sqrt(z), '#ffc888', 0.3 * bridgeOn + 0.1);
    }
    // light trails: red going away, white coming in; fewer in the small hours
    const count = Math.round(34 * traffic);
    g.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const away = i % 2 === 0, q = wrap(hash(i * 3.7) + t * (0.018 + 0.01 * hash(i * 1.9)) * (away ? 1 : -1), 1);
      const z = 1 + q * 12, lane = away ? -14 : 14;
      const zt = away ? z - 0.25 : z + 0.25;
      const x = BX + (BXN + lane) / z, y = HZ - (BDH + 7) / z, xt = BX + (BXN + lane) / zt, yt = HZ - (BDH + 7) / zt;
      const fade = Math.min(1, (13 - z) * 0.6);
      g.strokeStyle = away ? rgba('#ff4a5a', 0.9 * fade) : rgba('#fff6e4', fade);
      g.lineWidth = Math.max(1.4, 6 / z);
      g.beginPath(); g.moveTo(xt, yt); g.lineTo(x, y); g.stroke();
      if (z < 3) glow(g, x, y, 60 / z, away ? '#ff3a4a' : '#fff0d0', 0.35 * fade);
    }
    // parapet in front of the cars
    g.strokeStyle = deck; g.lineWidth = 2;
    g.beginPath(); g.moveTo(bx(0.95), HZ - (BDH + 2) / 0.95); g.lineTo(bx(13), HZ - (BDH + 2) / 13); g.stroke();
    // bridge lights in the water under the bridge
    for (const z of [2.6, 3.3, 4.4, 6, 8.5]) shimmer(g, t, bx(z), 2 * bw(z) - by(z) - 30 / z, 30 / z + 6, 140 / z + 10, '#ffc888', 0.22 * (0.3 + 0.7 * bridgeOn), z);

    // ---- ferry: in from the right, waits at the pier, back out ----
    {
      const c = wrap(t + 20, 96);
      const k = c < 34 ? 1 - span(c, 0, 34) : c < 60 ? 0 : c < 92 ? span(c, 60, 92) : 1;
      if (k < 1) {
        const x = lerp(1186, 1780, k), y = lerp(522, 650, k), sc = lerp(0.42, 1, k);
        const a = ferryOn * (1 - 0.6 * fogK);
        shimmer(g, t, x, y + 4, 150 * sc, 70 * sc + 20, '#ffd28a', 0.3 * a, 5);
        ferry(g, x, y, sc, 1, a);
      }
    }

    // a small boat with a lantern, bobbing under the bridge
    {
      const x = 318, y = 712 + Math.sin(t * 0.9) * 2.5, tilt = Math.sin(t * 0.7) * 0.04;
      shimmer(g, t, x + 18, y + 6, 22, 70, '#ffb060', 0.35, 6);
      g.save(); g.translate(x, y); g.rotate(tilt);
      g.fillStyle = '#0b0912';
      g.beginPath(); g.moveTo(-50, -12); g.lineTo(52, -14); g.lineTo(40, 2); g.lineTo(-40, 2); g.fill();
      g.fillRect(-20, -26, 30, 14);
      g.fillRect(16, -56, 2.5, 44);
      g.fillStyle = '#ffd08a'; g.fillRect(14, -60, 7, 9);
      g.restore();
      glow(g, x + 18, y - 54, 70, '#ffb060', 0.45 * (0.85 + 0.15 * noise(t * 4, 8)));
    }

    // ---- air ----
    fog(g, 440, 640, hor, 0.08 + 0.4 * fogK);
    fog(g, 520, 760, mix(hor, '#ffffff', 0.2), 0.3 * fogK);
    haze(g, 820, 470, 360, 100, hor, 0.18);
    ripples(g, t, S.pools, wet, '#f0e4ff');
    rain(g, t, wet, { n: 220, alpha: 0.22, color: '#d8d0ff', len: 26 });

    // ---- promenade in front ----
    const near = tone(NEAR, s);
    g.fillStyle = tone(['#4a3446', '#1e1a2c', '#3a424c'], s); g.fillRect(0, 796, VW, 12);
    g.fillStyle = rgba(hor, 0.3); g.fillRect(0, 796, VW, 1.5);
    g.fillStyle = near; g.fillRect(0, 808, VW, 92);
    g.fillStyle = near;
    for (let x = 30; x < VW; x += 132) g.fillRect(x, 724, 7, 74);
    g.fillRect(0, 722, VW, 5); g.fillRect(0, 760, VW, 3);
    g.fillStyle = rgba(hor, 0.28); g.fillRect(0, 722, VW, 1.5);
    // lamp post on the right
    g.fillStyle = near; g.fillRect(1455, 404, 7, 394); g.fillRect(1446, 790, 25, 10); g.fillRect(1451, 520, 15, 6);
    g.beginPath(); g.moveTo(1442, 380); g.lineTo(1475, 380); g.lineTo(1466, 368); g.lineTo(1451, 368); g.fill();
    g.fillRect(1456, 360, 5, 9);
    g.fillStyle = mix('#5a4a3a', '#ffe0a8', pierOn);
    g.beginPath(); g.moveTo(1446, 381); g.lineTo(1471, 381); g.lineTo(1467, 401); g.lineTo(1450, 401); g.fill();
    g.fillStyle = near; g.fillRect(1457, 381, 3, 20); g.fillRect(1444, 400, 29, 5);
    glow(g, 1458, 392, 170, '#ffc888', 0.5 * pierOn);
    glow(g, 1458, 740, 220, '#ffc888', 0.12 * pierOn);
    g.fillStyle = rgba('#ffd8a8', 0.4 * pierOn); g.fillRect(1260, 722, 400, 1.5);

    breakTint(g, st);
    edges(g, 0.5);
  }
};

