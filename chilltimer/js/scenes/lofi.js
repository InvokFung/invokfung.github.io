// Lofi vibe — "Night shift".
// Story (session 0→1): magenta dusk → indigo neon night with light rain → teal and peach first light.

import {
  VW, VH, TAU, lerp, span, noise, hash, mix, rgba, fillSky, glow, fog, lightCone,
  makeStars, drawStars, drawMoon, makeClouds, drawClouds, makeSkyline, drawSkyline,
  rain, makeGlass, drawGlass, stringLights
} from './kit.js';
import { train, corner, studio, harbour } from './lofi-extra.js';

// ---------- story ----------
const nightAt = s => span(s, 0.03, 0.28);
const dawnAt = s => span(s, 0.8, 0.98);
// c = [dusk, night, dawn]. Gives the colour for this point in the story.
const tone = (c, s) => mix(mix(c[0], c[1], nightAt(s)), c[2], dawnAt(s));
// Share of windows that are on: a few at dusk, most at night, going off at dawn.
const litAt = s => lerp(0.05, 0.88, span(s, 0.03, 0.42)) - 0.8 * span(s, 0.8, 1);
const neonAt = s => span(s, 0.04, 0.24) * (1 - 0.9 * span(s, 0.84, 1));
// Light rain around the middle of the night. It comes and goes with the clock.
const rainAt = (s, t) => Math.exp(-(((s - 0.5) / 0.13) ** 2)) * (0.4 + 0.6 * noise(t / 30, 7));

// Sky, top → horizon.
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
const NEARDIM = ['#2c1838', '#0f0f26', '#26364a'];
const WIN = ['#ffd28a', '#ffb76b', '#ffe9c4', '#8fd8ff', '#ff9fd0', '#ffd28a'];
const PINK = '#ff4fa3', CYAN = '#4fe3ff';

// A repeating event: about every p seconds (± j/2), lasting d seconds.
// Returns { u: 0..1 progress, k: which time } or null. Pure function of t.
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

// Rings on puddles while it rains. No stored state.
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

// Puddles add a little of the sky and neon colour to the ground.
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

// Dark edges. Four thin strips instead of one full-screen gradient: far fewer pixels to shade.
function edges(g, a) {
  const c0 = 'rgba(0,0,0,0)', c1 = `rgba(0,0,0,${a})`;
  for (const [x0, y0, x1, y1, x, y, w, h] of [[0, 0, 0, 150, 0, 0, VW, 150], [0, VH, 0, VH - 150, 0, VH - 150, VW, 150], [0, 0, 260, 0, 0, 0, 260, VH], [VW, 0, VW - 260, 0, VW - 260, 0, 260, VH]]) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, c1); gr.addColorStop(1, c0);
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  }
}
// Breaks feel a little warmer. A flat tint costs almost nothing.
function breakTint(g, st) {
  if (st.mode === 'focus') return;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,154,200,0.035)';
  g.fillRect(0, 0, VW, VH);
  g.globalCompositeOperation = 'source-over';
}

// Soft oval of air colour. Used to keep the middle of a scene calm behind the timer.
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
// 1. Night desk
// ======================================================================
const X0 = 150, X1 = 1450, Y0 = 56, Y1 = 630, SH = 654, OY = 30;   // OY: shelf objects were laid out for a sill at 600   // window box and shelf front edge

function drawTrain(g, t, color, lit) {
  const e = event(t, 50, 10, 18, 4);       // one crossing every 40–60 s
  if (!e) return;
  const cars = 5, cw = 150, gap = 6, len = cars * (cw + gap), top = Y1 - 70;
  const head = lerp(X0 - len - 30, X1 + 30, e.u);
  const x0 = hash(e.k * 2.7 + 1) < 0.5 ? head : X0 + X1 - head - len;
  g.fillStyle = color;
  g.beginPath();
  for (let c = 0; c < cars; c++) g.roundRect(x0 + c * (cw + gap), top, cw, 34, c === 0 ? [12, 4, 4, 4] : c === cars - 1 ? [4, 12, 4, 4] : 4);
  g.fill();
  g.fillStyle = mix('#fff0c8', color, 0.25 * (1 - lit));
  g.beginPath();
  for (let c = 0; c < cars; c++) for (let i = 0; i < 7; i++) g.rect(x0 + c * (cw + gap) + 10 + i * 19.5, top + 8, 13, 11);
  g.fill();
  g.fillStyle = rgba(PINK, 0.7);
  g.fillRect(x0 + 4, top + 24, len - gap - 8, 2.5);
  g.fillStyle = rgba('#ffe6b8', 0.07 + 0.08 * lit);   // light spilling onto the track
  g.fillRect(x0, top + 34, len, 10);
}

const desk = {
  id: 'desk', name: 'Night desk', focus: [0.84, 0.5],
  setup(rand) {
    const near = [
      ...makeSkyline(rand, { x0: X0 - 20, x1: 430, base: Y1, minH: 190, maxH: 330, minW: 80, maxW: 150, win: 11 }),
      ...makeSkyline(rand, { x0: 1085, x1: X1 + 20, base: Y1, minH: 200, maxH: 340, minW: 80, maxW: 150, win: 11 })
    ];
    const nb = near.find(b => b.x >= 1085);
    const vines = Array.from({ length: 6 }, (_, i) => {
      const len = 150 + rand() * 260, x = 66 + i * 12 + rand() * 6;
      return { x, len, ph: rand() * TAU, leaves: Array.from({ length: Math.floor(len / 24) }, (_, j) => ({ u: (j + 0.6) / Math.floor(len / 24), side: j % 2 ? 1 : -1, s: 0.7 + rand() * 0.5, c: rand() })) };
    });
    return {
      stars: makeStars(rand, 70, X0, Y0, X1, 330),
      clouds: makeClouds(rand, 6, X0, 120, X1, 330),
      far: makeSkyline(rand, { x0: X0 - 30, x1: X1 + 30, base: Y1, minH: 60, maxH: 230, minW: 36, maxW: 90, win: 5 }),
      mid: [
        ...makeSkyline(rand, { x0: X0 - 30, x1: 600, base: Y1, minH: 120, maxH: 300, minW: 50, maxW: 110, win: 7 }),
        ...makeSkyline(rand, { x0: 600, x1: 1000, base: Y1, minH: 40, maxH: 110, minW: 50, maxW: 110, win: 7 }),
        ...makeSkyline(rand, { x0: 1000, x1: X1 + 30, base: Y1, minH: 120, maxH: 320, minW: 50, maxW: 110, win: 7 })
      ],
      near,
      sign: { x: nb.x + 18, y: Math.min(Y1 - nb.h + 30, Y1 - 250) },
      glass: makeGlass(rand, 36, X0, Y0, X1, Y1),
      vines,
      dust: Array.from({ length: 7 }, () => [36 + rand() * 50, rand() * TAU, 0.2 + rand() * 0.5])
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, n = nightAt(s), dw = dawnAt(s), wet = rainAt(s, t), lit = litAt(s), neon = neonAt(s);
    const hor = tone(SKY[4], s), W = X1 - X0;
    const rim = tone(['#ff9c84', '#b98cff', '#a8e6dc'], s);

    // room wall
    g.fillStyle = tone(['#26142a', '#0c0918', '#1a202c'], s);
    g.fillRect(0, 0, VW, VH);

    // ---- outside ----
    g.save();
    g.beginPath(); g.rect(X0, Y0, W, Y1 - Y0); g.clip();
    fillSky(g, SKY.map(c => tone(c, s)), Y0, Y1);
    drawStars(g, S.stars, t, 0.8 * n * (1 - dw));
    // Round object: the moon crosses the window, left to right.
    const u = st.round, mx = lerp(X0 + 90, X1 - 90, u), my = 215 - 120 * 4 * u * (1 - u);
    drawMoon(g, mx, my, 30, '#fff1dc', '#ffc6e8', 0.75 + 0.25 * n - 0.3 * dw);
    glow(g, mx, my, 150, '#ffd6ec', 0.26);
    drawClouds(g, S.clouds, t, tone(['#ff9a9a', '#2a2454', '#e9c0b0'], s), 0.42);
    fog(g, 430, 700, '#ff5fa2', 0.14 * neon, X0, X1);        // city glow on the low sky
    drawSkyline(g, S.far, Y1, tone(FAR, s), { lit: lit * 0.7, colors: ['#ffcf9a', '#ff9fd0', '#9fd8ff'], t, win: 5 });
    fog(g, 440, 680, hor, 0.38);
    haze(g, 800, 520, 420, 120, hor, 0.3);
    drawSkyline(g, S.mid, Y1, tone(MID, s), { lit, colors: WIN, t, win: 7, glowA: 0.85 * n });
    fog(g, 520, 690, hor, 0.22);
    haze(g, 800, 560, 360, 90, hor, 0.35);

    // elevated line
    const nearC = tone(NEAR, s);
    g.fillStyle = mix(nearC, hor, 0.18);
    g.fillRect(X0, Y1 - 36, W, 10);
    for (let x = X0 + 40; x < X1; x += 160) g.fillRect(x, Y1 - 26, 12, 30);
    drawTrain(g, t, mix(nearC, '#000000', 0.2), n);
    g.fillStyle = rgba(hor, 0.3); g.fillRect(X0, Y1 - 36, W, 1.5);

    drawSkyline(g, S.near, Y1, nearC, { lit, colors: WIN, t, win: 11, dim: tone(NEARDIM, s) });
    // rim of light on the near roofs
    g.fillStyle = rgba(hor, 0.35);
    for (const b of S.near) g.fillRect(b.x, Y1 - b.h, b.w, 1.5);

    // vertical neon sign on the near right building
    const { x: sx, y: sy } = S.sign, on = neon * (Math.sin(t * 31) > -0.97 ? 1 : 0.4);
    g.fillStyle = '#120a18'; g.fillRect(sx - 4, sy - 4, 40, 150);
    ['C', 'A', 'F', 'E'].forEach((c, i) => neonText(g, c, sx + 16, sy + 16 + i * 34, 26, PINK, on));
    glow(g, sx + 16, sy + 70, 140, PINK, 0.35 * on);
    g.fillStyle = rgba(CYAN, 0.9 * neon);
    g.fillRect(S.near[1].x + 6, Y1 - S.near[1].h + 6, S.near[1].w - 12, 2.5);

    rain(g, t, wet, { x0: X0, y0: Y0, x1: X1, y1: Y1, n: 200, alpha: 0.26, color: '#d8d0ff' });
    g.fillStyle = 'rgba(160,170,255,0.04)';
    g.fillRect(X0, Y0, W, Y1 - Y0);
    drawGlass(g, S.glass, dt, wet * 1.2, '#e6dcff');
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (const [a, b] of [[440, 80], [500, 30], [1060, 120]]) {
      g.beginPath(); g.moveTo(a, Y0); g.lineTo(a + b, Y0); g.lineTo(a + b - 300, Y1); g.lineTo(a - 300, Y1); g.fill();
    }
    g.restore();

    // ---- window frame: thin and dark ----
    g.fillStyle = '#0b0912';
    g.fillRect(X0 - 12, Y0 - 12, W + 24, 12); g.fillRect(X0 - 12, Y0, 12, Y1 - Y0); g.fillRect(X1, Y0, 12, Y1 - Y0);
    g.fillRect(X0 + W / 3 - 4, Y0, 8, Y1 - Y0); g.fillRect(X0 + (2 * W) / 3 - 4, Y0, 8, Y1 - Y0);
    g.fillStyle = rgba(rim, 0.25);
    g.fillRect(X0 + W / 3 - 4, Y0, 1.5, Y1 - Y0); g.fillRect(X0 + (2 * W) / 3 - 4, Y0, 1.5, Y1 - Y0);

    // poster on the right wall (abstract sun over waves)
    g.fillStyle = '#0d0a12'; g.fillRect(1476, 118, 100, 176);
    g.fillStyle = '#e48aa8'; g.fillRect(1482, 124, 88, 164);
    g.fillStyle = '#ffd59a'; g.beginPath(); g.arc(1526, 196, 26, 0, TAU); g.fill();
    g.fillStyle = '#5a3a8a'; g.fillRect(1482, 214, 88, 74);
    g.strokeStyle = '#8fd8e8'; g.lineWidth = 3;
    for (let k = 0; k < 3; k++) { g.beginPath(); for (let x = 0; x <= 88; x += 4) g.lineTo(1482 + x, 232 + k * 18 + Math.sin(x * 0.18 + k) * 3); g.stroke(); }

    // radiator under the window, only seen in the LED light
    g.fillStyle = tone(['#3a2230', '#1a1426', '#262c38'], s);
    g.fillRect(560, 724, 480, 104);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    for (let x = 572; x < 1030; x += 24) g.fillRect(x, 730, 8, 92);
    g.fillRect(540, 828, 520, 8);
    g.fillStyle = 'rgba(255,170,230,0.14)';
    for (let x = 564; x < 1030; x += 24) g.fillRect(x, 726, 6, 2);

    // ---- shelf ----
    g.fillStyle = tone(['#4a2c34', '#1b1424', '#2c303a'], s);
    g.beginPath(); g.moveTo(X0 - 40, Y1); g.lineTo(X1 + 40, Y1); g.lineTo(X1 + 80, SH); g.lineTo(X0 - 80, SH); g.fill();
    g.fillStyle = rgba(hor, 0.14); g.fillRect(X0 - 40, Y1, W + 80, 6);   // window light on the top
    g.fillStyle = tone(['#2e1a22', '#100b17', '#1c2028'], s);
    g.fillRect(X0 - 80, SH, W + 160, 18);
    g.save(); g.translate(0, OY);

    // cactus
    g.lineCap = 'round';
    g.strokeStyle = '#3f7a54'; g.lineWidth = 22;
    g.beginPath(); g.moveTo(395, 576); g.lineTo(395, 506); g.stroke();
    g.lineWidth = 12;
    g.beginPath(); g.moveTo(388, 548); g.lineTo(374, 548); g.lineTo(374, 526);
    g.moveTo(402, 536); g.lineTo(416, 536); g.lineTo(416, 512); g.stroke();
    g.strokeStyle = 'rgba(190,255,200,0.18)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(390, 572); g.lineTo(390, 506); g.stroke();
    g.fillStyle = '#c0674a';
    g.beginPath(); g.moveTo(372, 580); g.lineTo(418, 580); g.lineTo(412, 614); g.lineTo(378, 614); g.fill();
    g.fillStyle = '#d97c5c'; g.fillRect(368, 572, 54, 10);

    // cassette stack
    const tapes = ['#e8d9c0', '#ff7ac8', '#6ee7ff', '#c9a0ff', '#f2b36b'];
    tapes.forEach((c, i) => {
      const x = 446 + ((i * 7) % 11) - 4, y = 614 - (i + 1) * 15;
      g.fillStyle = '#1a1520'; g.beginPath(); g.roundRect(x, y, 104, 14, 2); g.fill();
      g.fillStyle = c; g.fillRect(x + 8, y + 3, 70, 8);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 40, y + 5, 22, 4);
    });

    // turntable
    const ttTop = tone(['#6b4636', '#2a1e2a', '#4a4248'], s);
    g.fillStyle = ttTop;
    g.beginPath(); g.moveTo(1124, 538); g.lineTo(1386, 538); g.lineTo(1400, 584); g.lineTo(1110, 584); g.fill();
    g.fillStyle = mix(ttTop, '#000000', 0.45); g.fillRect(1110, 584, 290, 28);
    g.fillStyle = '#6ee7ff'; g.fillRect(1124, 596, 5, 3);
    g.fillStyle = '#2b2430'; g.fillRect(1360, 594, 22, 6);
    const cx = 1226, cy = 562;
    g.save();
    g.translate(cx, cy); g.scale(1, 0.21);
    g.fillStyle = '#4a4550'; g.beginPath(); g.arc(0, 4, 98, 0, TAU); g.fill();
    g.fillStyle = '#0c0a10'; g.beginPath(); g.arc(0, 0, 92, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1.2;
    g.beginPath(); for (let r = 40; r < 90; r += 7) { g.moveTo(r, 0); g.arc(0, 0, r, 0, TAU); } g.stroke();
    g.strokeStyle = rgba(rim, 0.32); g.lineWidth = 9;
    g.beginPath(); g.arc(0, 0, 66, -2.7, -1.9); g.stroke();
    g.beginPath(); g.arc(0, 0, 66, 0.45, 1.25); g.stroke();
    g.rotate(t * 3.49);                                    // 33⅓ turns a minute
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2;
    for (const [r, a, l] of S.dust) { g.beginPath(); g.arc(0, 0, r, a, a + l); g.stroke(); }
    g.fillStyle = '#ff7ac8'; g.beginPath(); g.arc(0, 0, 28, 0, Math.PI); g.fill();
    g.fillStyle = '#f3e6d0'; g.beginPath(); g.arc(0, 0, 28, Math.PI, TAU); g.fill();
    g.fillStyle = '#ddd'; g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.fill();
    g.restore();
    // tonearm
    g.fillStyle = '#2a2530'; g.beginPath(); g.ellipse(1358, 552, 12, 5, 0, 0, TAU); g.fill();
    g.strokeStyle = '#cfc8d6'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(1368, 546); g.lineTo(1358, 548); g.lineTo(1300, 566); g.stroke();
    g.fillStyle = '#cfc8d6'; g.fillRect(1290, 563, 14, 6);
    g.fillStyle = '#3a3440'; g.beginPath(); g.arc(1372, 545, 5, 0, TAU); g.fill();

    // speaker
    g.fillStyle = '#1d1824'; g.beginPath(); g.roundRect(1418, 488, 84, 126, 6); g.fill();
    g.fillStyle = rgba(rim, 0.35); g.fillRect(1422, 488, 76, 1.5);
    const beat = st.running ? Math.max(0, Math.sin(t * TAU * 1.42)) ** 10 : 0;
    g.strokeStyle = '#3a3344'; g.lineWidth = 3;
    g.beginPath(); g.arc(1460, 574, 28 + beat * 1.5, 0, TAU); g.stroke();
    g.fillStyle = '#0d0b12'; g.beginPath(); g.arc(1460, 574, 24, 0, TAU); g.fill();
    g.fillStyle = '#2c2634'; g.beginPath(); g.arc(1460, 574, 8 + beat * 2, 0, TAU); g.fill();
    g.fillStyle = '#0d0b12'; g.beginPath(); g.arc(1460, 518, 10, 0, TAU); g.fill();
    g.strokeStyle = rgba(rim, 0.25); g.lineWidth = 1.5;
    g.beginPath(); g.arc(1460, 574, 28, -2.6, -1.2); g.stroke();
    g.restore();

    // hanging plant, top left
    g.strokeStyle = 'rgba(30,20,30,0.9)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(96, 0); g.lineTo(66, 66); g.moveTo(96, 0); g.lineTo(126, 66); g.stroke();
    for (const v of S.vines) {
      const sway = u2 => Math.sin(t * 0.45 + v.ph) * 6 * u2 * u2;
      g.strokeStyle = '#24452f'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(v.x, 92);
      for (let k = 1; k <= 8; k++) { const q = k / 8; g.lineTo(v.x + Math.sin(q * 3 + v.ph) * 8 + sway(q), 92 + q * v.len); }
      g.stroke();
      for (const L of v.leaves) {
        const lx = v.x + Math.sin(L.u * 3 + v.ph) * 8 + sway(L.u) + L.side * 7 * L.s, ly = 92 + L.u * v.len;
        g.fillStyle = mix('#2f6b45', '#5fa36a', L.c);
        g.beginPath(); g.ellipse(lx, ly, 9 * L.s, 5.5 * L.s, L.side * 0.6, 0, TAU); g.fill();
      }
    }
    g.fillStyle = '#b0604a'; g.beginPath(); g.moveTo(60, 64); g.lineTo(132, 64); g.lineTo(122, 98); g.lineTo(70, 98); g.fill();
    g.fillStyle = '#c87458'; g.fillRect(58, 62, 76, 7);

    // ---- light ----
    // The room gets darker with the night; the window keeps its own light.
    g.fillStyle = rgba('#06030d', 0.14 + 0.36 * n - 0.16 * dw);
    g.beginPath(); g.rect(0, 0, VW, VH); g.rect(X0, Y0, W, Y1 - Y0); g.fill('evenodd');

    // rim light from the window on the objects
    g.fillStyle = rgba(rim, 0.45);
    g.fillRect(1124, 538 + OY, 262, 1.5);
    tapes.forEach((_, i) => g.fillRect(446 + ((i * 7) % 11) - 4, 614 + OY - (i + 1) * 15, 104, 1));
    g.fillRect(384, 504 + OY, 3, 70);

    // LED strip under the shelf, pink → cyan
    const led = 0.55 + 0.45 * n - 0.3 * dw;
    const strip = g.createLinearGradient(X0 - 80, 0, X1 + 80, 0);
    strip.addColorStop(0, PINK); strip.addColorStop(0.5, '#b07cff'); strip.addColorStop(1, CYAN);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.16 * led;
    g.fillStyle = strip; g.fillRect(0, SH + 18, VW, VH - SH - 18);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = strip; g.fillRect(X0 - 70, SH + 18, W + 140, 3);
    fillSky(g, ['rgba(6,3,13,0)', rgba('#06030d', 0.85)], SH + 20, VH);
    glow(g, 420, SH + 40, 260, PINK, 0.22 * led);
    glow(g, 1240, SH + 40, 300, CYAN, 0.18 * led);

    breakTint(g, st);
    edges(g, 0.5);
  }
};

// ======================================================================
// 2. Rooftop
// ======================================================================
const TX = 1212, PAR = 700;          // tower centre, top of the parapet

const rooftop = {
  id: 'rooftop', name: 'Rooftop', focus: [0.88, 0.5],
  setup(rand) {
    const tower = [];
    for (const [w, top, bot] of [[100, 330, PAR], [76, 252, 330], [50, 192, 252]])
      for (let y = top + 10; y < bot - 6; y += 14)
        for (let x = TX - w / 2 + 7; x < TX + w / 2 - 7; x += 10) tower.push({ x, y, k: rand(), c: rand() });
    return {
      stars: makeStars(rand, 160, 0, 10, VW, 520),
      hi: makeClouds(rand, 7, -100, 70, VW + 100, 250),
      lo: makeClouds(rand, 6, -100, 330, VW + 100, 470),
      far: makeSkyline(rand, { x0: -40, x1: VW + 40, base: 712, minH: 40, maxH: 150, minW: 30, maxW: 80, win: 4 }),
      mid: [
        ...makeSkyline(rand, { x0: -40, x1: 560, base: 712, minH: 90, maxH: 270, minW: 40, maxW: 100, win: 6 }),
        ...makeSkyline(rand, { x0: 560, x1: 1060, base: 712, minH: 50, maxH: 150, minW: 40, maxW: 100, win: 6 }),
        ...makeSkyline(rand, { x0: 1060, x1: VW + 40, base: 712, minH: 90, maxH: 250, minW: 40, maxW: 100, win: 6 })
      ],
      tower,
      pools: [{ x: 760, y: 850, rx: 170, ry: 12, n: 10, k: 1.2 }, { x: 1110, y: 826, rx: 110, ry: 8, n: 6, k: 1 }, { x: 560, y: 878, rx: 90, ry: 9, n: 5, k: 1.1 }]
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, n = nightAt(s), dw = dawnAt(s), wet = rainAt(s, t), lit = litAt(s), neon = neonAt(s);
    const hor = tone(SKY[4], s);

    // sky
    fillSky(g, SKY.map(c => tone(c, s)), 0, 720);
    const sunA = 1 - span(s, 0.02, 0.22);
    glow(g, 400, lerp(600, 740, span(s, 0, 0.22)), 420, '#ffb070', 0.45 * sunA);
    if (sunA > 0.01) {
      g.fillStyle = rgba('#ffd7a0', sunA); g.beginPath(); g.arc(400, lerp(600, 740, span(s, 0, 0.22)), 62, 0, TAU); g.fill();
    }
    glow(g, 1000, 720, 480, '#ffd0a8', 0.3 * dw);
    drawStars(g, S.stars, t, n * (1 - dw));
    g.save(); g.translate(0, 7);                        // lit undersides
    drawClouds(g, S.hi, t * 0.7, tone(['#ffc08a', '#5a2f6e', '#ffd6b8'], s), 0.5);
    g.restore();
    drawClouds(g, S.hi, t * 0.7, tone(['#ff9a8a', '#2b2554', '#f0b8a6'], s), 0.5);

    // plane, now and then
    const e = event(t, 80, 30, 46, 9);
    if (e) {
      const dir = hash(e.k + 0.5) < 0.5 ? 1 : -1, py = 110 + hash(e.k * 3.3) * 150;
      const x = dir > 0 ? lerp(-40, VW + 40, e.u) : lerp(VW + 40, -40, e.u), y = py + e.u * 40;
      g.fillStyle = 'rgba(20,16,30,0.9)'; g.fillRect(x - 10, y - 1, 20, 2);
      const flash = (t % 1.3) < 0.07 || ((t % 1.3) > 0.16 && (t % 1.3) < 0.22);
      g.fillStyle = '#ff5050'; g.fillRect(x - 1.5, y + 1, 3, 3);
      if (flash) { g.fillStyle = '#ffffff'; g.fillRect(x - 2, y - 2, 4, 4); glow(g, x, y, 30, '#ffffff', 0.6); }
      if ((t % 1) < 0.5) glow(g, x, y + 2, 16, '#ff5050', 0.5);
    }

    drawClouds(g, S.lo, t * 1.2, tone(['#c8507a', '#1c1a42', '#a7b8c0'], s), 0.45);
    fog(g, 520, 760, hor, 0.5);
    fog(g, 560, 760, '#ff5fa2', 0.12 * neon);

    drawSkyline(g, S.far, 712, tone(FAR, s), { lit: lit * 0.7, colors: ['#ffcf9a', '#ff9fd0', '#9fd8ff'], t, win: 4 });
    fog(g, 560, 720, hor, 0.32);

    // the tower
    const tc = tone(MID, s);
    g.fillStyle = mix(tc, '#000000', 0.15);
    g.fillRect(TX - 50, 330, 100, 400); g.fillRect(TX - 38, 252, 76, 80); g.fillRect(TX - 25, 192, 50, 62);
    g.fillRect(TX - 2, 110, 4, 84);
    g.fillStyle = rgba(hor, 0.3);
    g.fillRect(TX - 50, 330, 2, 380); g.fillRect(TX - 38, 252, 2, 78); g.fillRect(TX - 25, 192, 2, 60);
    for (const w of S.tower) if (w.k < lit * 0.28) { g.fillStyle = WIN[Math.floor(w.c * 3)]; g.fillRect(w.x, w.y, 4, 7); }
    // neon trim on the crown
    g.fillStyle = rgba(CYAN, 0.25 + 0.65 * neon);
    g.fillRect(TX - 38, 252, 76, 2.5); g.fillRect(TX - 25, 192, 50, 2.5);
    g.fillStyle = rgba(PINK, 0.25 + 0.65 * neon);
    g.fillRect(TX - 50, 330, 100, 2.5);
    glow(g, TX, 250, 120, CYAN, 0.18 * neon);
    const beacon = (0.5 + 0.5 * Math.sin(t * 2.2)) ** 3;
    g.fillStyle = mix('#5a1a1a', '#ff5a5a', beacon); g.fillRect(TX - 3, 104, 6, 6);
    glow(g, TX, 107, 70, '#ff4040', 0.7 * beacon);

    drawSkyline(g, S.mid, 712, tc, { lit, colors: WIN, t, win: 6, glowA: 0.85 * n });
    fog(g, 640, 730, hor, 0.25);

    // ---- our roof ----
    const wall = tone(['#3a2236', '#121022', '#2d3644'], s);
    g.fillStyle = wall; g.fillRect(0, PAR, VW, 92);
    g.fillStyle = tone(['#7a4458', '#2a2444', '#6a7a88'], s); g.fillRect(0, PAR, VW, 11);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = PAR + 24; y < PAR + 90; y += 16) g.fillRect(0, y, VW, 2);
    g.fillStyle = rgba(hor, 0.25); g.fillRect(0, PAR, VW, 2);
    fillSky(g, [tone(['#24141f', '#0a0915', '#1a1f28'], s), tone(['#140a12', '#050409', '#0f1218'], s)], PAR + 92, VH);
    // wet roof shows the sky
    const sheen = Math.max(wet, span(s, 0.4, 0.55) * (1 - span(s, 0.7, 0.9)) * 0.6);
    puddles(g, S.pools, mix(hor, '#ff7ac8', 0.3 * neon), 0.05 + 0.1 * sheen);
    ripples(g, t, S.pools, wet, '#e6dcff');

    // antenna
    const ac = mix(wall, '#000000', 0.45);
    g.strokeStyle = ac; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(262, 330); g.lineTo(178, 800); g.moveTo(262, 330); g.lineTo(350, 800); g.stroke();
    g.fillStyle = ac;
    g.fillRect(259, 316, 6, 530);
    for (const [y, w] of [[340, 110], [372, 84], [404, 60]]) g.fillRect(262 - w / 2, y, w, 4);
    g.beginPath(); g.ellipse(276, 520, 8, 26, 0.3, 0, TAU); g.fill();
    const tip = Math.sin(t * 3.1) > 0.4;
    g.fillStyle = tip ? '#ff5a5a' : '#5a2020'; g.fillRect(259, 310, 6, 6);
    if (tip) glow(g, 262, 313, 26, '#ff4040', 0.6);

    // AC unit with a slow fan
    const metal = tone(['#6a4a5a', '#24223a', '#56606e'], s);
    g.fillStyle = mix(metal, '#000000', 0.35);
    g.beginPath(); g.moveTo(590, 652); g.lineTo(618, 640); g.lineTo(618, 800); g.lineTo(590, 812); g.fill();
    g.fillStyle = mix(metal, '#ffffff', 0.12);
    g.beginPath(); g.moveTo(408, 652); g.lineTo(436, 640); g.lineTo(618, 640); g.lineTo(590, 652); g.fill();
    g.fillStyle = metal; g.fillRect(408, 652, 182, 160);
    g.fillStyle = mix(metal, '#000000', 0.5); g.fillRect(414, 812, 12, 14); g.fillRect(572, 812, 12, 14);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 670; y < 800; y += 9) g.fillRect(548, y, 32, 3);
    g.fillStyle = '#0e0c16'; g.beginPath(); g.arc(478, 732, 54, 0, TAU); g.fill();
    g.save(); g.translate(478, 732); g.rotate(t * 2.6);
    g.fillStyle = mix(metal, '#000000', 0.2);
    for (let k = 0; k < 4; k++) { g.rotate(TAU / 4); g.beginPath(); g.ellipse(26, 0, 24, 9, 0.35, 0, TAU); g.fill(); }
    g.restore();
    g.strokeStyle = mix(metal, '#ffffff', 0.15); g.lineWidth = 1.5;
    g.beginPath(); for (const r of [20, 36, 52]) { g.moveTo(478 + r, 732); g.arc(478, 732, r, 0, TAU); } g.moveTo(424, 732); g.lineTo(532, 732); g.moveTo(478, 678); g.lineTo(478, 786); g.stroke();
    g.fillStyle = mix(metal, '#000000', 0.3); g.beginPath(); g.arc(478, 732, 8, 0, TAU); g.fill();
    g.fillStyle = rgba(hor, 0.3); g.fillRect(408, 652, 2, 160);

    // water tank on legs
    const wood = tone(['#4a2a2e', '#17121f', '#3a3a40'], s), dark = mix(wood, '#000000', 0.4);
    g.fillStyle = dark;
    for (const x of [1340, 1468]) g.fillRect(x - 6, 650, 12, 220);
    for (const x of [1372, 1436]) g.fillRect(x - 4, 650, 8, 196);
    g.strokeStyle = dark; g.lineWidth = 4;
    g.beginPath();
    g.moveTo(1340, 660); g.lineTo(1468, 760); g.moveTo(1468, 660); g.lineTo(1340, 760);
    g.moveTo(1340, 760); g.lineTo(1468, 860); g.moveTo(1468, 760); g.lineTo(1340, 860);
    g.stroke();
    g.fillRect(1324, 646, 160, 10);
    g.fillStyle = wood; g.fillRect(1322, 460, 164, 188);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let x = 1330; x < 1484; x += 12) g.fillRect(x, 460, 2, 188);
    g.fillStyle = mix(wood, '#9a8aa0', 0.35);
    for (const y of [482, 524, 566, 608, 636]) g.fillRect(1320, y, 168, 4);
    g.fillStyle = mix(wood, '#000000', 0.2);
    g.beginPath(); g.moveTo(1310, 462); g.lineTo(1404, 396); g.lineTo(1498, 462); g.fill();
    g.fillRect(1401, 382, 6, 16);
    g.fillStyle = rgba(hor, 0.4);
    g.beginPath(); g.moveTo(1310, 462); g.lineTo(1404, 396); g.lineTo(1406, 400); g.lineTo(1314, 463); g.fill();
    g.fillRect(1322, 464, 3, 184);
    g.strokeStyle = dark; g.lineWidth = 2.5;            // ladder
    g.beginPath(); g.moveTo(1306, 470); g.lineTo(1306, 870); g.moveTo(1318, 470); g.lineTo(1318, 870);
    for (let y = 480; y < 870; y += 16) { g.moveTo(1306, y); g.lineTo(1318, y); }
    g.stroke();

    // Round object: string lights switch on bulb by bulb.
    const L0 = [266, 694], L1 = [1336, 714], sag = 30, nb = 16;   // hangs in front of the dark parapet
    const lcx = (L0[0] + L1[0]) / 2, lcy = (L0[1] + L1[1]) / 2 + sag * 2;
    for (let i = 1; i < nb; i += 2) {                  // a wide warm pool around each pair of lit bulbs
      const q = i / nb, v = 1 - q;
      if ((i + 0.5) / nb > st.round) break;
      glow(g, v * v * L0[0] + 2 * v * q * lcx + q * q * L1[0], v * v * L0[1] + 2 * v * q * lcy + q * q * L1[1] + 10, 110, '#ffc27a', 0.2);
    }
    stringLights(g, L0[0], L0[1], L1[0], L1[1], sag, nb, t, { colors: ['#ffd9a0', '#ffc27a', '#ffb0d0'], lit: st.round, r: 7.5, glowR: 6, wire: 'rgba(10,6,14,0.9)' });

    rain(g, t, wet, { n: 260, alpha: 0.24, color: '#d8d0ff', len: 30 });
    rain(g, t, wet, { n: 50, alpha: 0.4, len: 50, speed: 2.2, width: 1.8, seed: 31, color: '#d8d0ff' });
    breakTint(g, st);
    edges(g, 0.45);
  }
};

// ======================================================================
// 3. Neon alley — one-point perspective, vanishing point right of centre
// ======================================================================
const VX = 1180, VY = 500, LW = -1500, RW = 700, FL = 700, ZF = 16, LT = -2600, RT = -1600;
const P = (X, Y, z) => [VX + X / z, VY + Y / z];
function quad(p, a, b, c, d) { p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); p.lineTo(c[0], c[1]); p.lineTo(d[0], d[1]); p.closePath(); }
// A box sign that sticks out from a wall, so it faces us.
const SIGN = { z: 1.4, x0: VX + 280 / 1.4, x1: VX + 450 / 1.4, y0: VY - 450 / 1.4, y1: VY + 120 / 1.4 };

const alley = {
  id: 'alley', name: 'Neon alley', focus: [0.93, 0.5],
  setup(rand) {
    const wins = [];
    const add = (X, zs, rows) => {
      for (const [z1, z2] of zs) for (const [y1, y2] of rows) {
        if (rand() < 0.18) continue;
        wins.push({ a: P(X, y1, z1), b: P(X, y1, z2), c: P(X, y2, z2), d: P(X, y2, z1), k: rand(), c2: Math.floor(rand() * 4) });
      }
    };
    add(LW, [[1.85, 2.1], [2.5, 2.8], [3.3, 3.7], [4.4, 4.9], [6, 6.7], [8.2, 9.2], [11, 12.4]], [[-2350, -2150], [-1950, -1750], [-1550, -1350], [-1150, -950], [-750, -560]]);
    add(RW, [[2.3, 2.6], [3, 3.4], [4, 4.5], [5.4, 6], [7.3, 8.1], [10, 11]], [[-1450, -1250], [-1100, -900], [-750, -560]]);
    const lines = new Path2D();
    for (let Y = LT + 200; Y < FL; Y += 180) { const a = P(LW, Y, ZF), b = P(LW, Y, 0.9); lines.moveTo(...a); lines.lineTo(...b); }
    for (let Y = RT + 150; Y < FL; Y += 180) { const a = P(RW, Y, ZF), b = P(RW, Y, 0.9); lines.moveTo(...a); lines.lineTo(...b); }
    for (const z of [1.62, 2.35, 3.05, 5.3, 7.8, 10.5]) { lines.moveTo(...P(LW, LT, z)); lines.lineTo(...P(LW, FL, z)); }
    for (const z of [2.0, 3.7, 6.8]) { lines.moveTo(...P(RW, RT, z)); lines.lineTo(...P(RW, FL, z)); }
    const farWins = [];
    for (let y = 312; y < 492; y += 16) for (let x = 1046; x < 1276; x += 13) if (rand() < 0.8) farWins.push({ x, y, k: rand(), c: Math.floor(rand() * 3) });
    return {
      stars: makeStars(rand, 40, 880, 10, 1420, 300),
      wins, lines, farWins,
      cables: [[2.4, -1150, -950, 160], [3.1, -1300, -1150, 200], [4.4, -1250, -1050, 180], [6.2, -1050, -1150, 160], [8.8, -1200, -1000, 150]],
      pools: [{ x: 880, y: 830, rx: 180, ry: 16, n: 12, k: 1.4 }, { x: 1170, y: 740, rx: 80, ry: 7, n: 5, k: 0.8 }, { x: 560, y: 888, rx: 150, ry: 14, n: 8, k: 1.3 }]
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, n = nightAt(s), dw = dawnAt(s), wet = rainAt(s, t), lit = litAt(s), neon = neonAt(s);
    const hor = tone(SKY[4], s);
    const shop = 0.35 + 0.65 * span(s, 0.02, 0.2) * (1 - 0.7 * dw);

    // sky between the roofs
    fillSky(g, SKY.map(c => tone(c, s)), 0, 470, 860, 1440);   // only the strip of sky between the roofs shows
    g.fillStyle = hor; g.fillRect(860, 470, 580, 100);
    drawStars(g, S.stars, t, 0.7 * n * (1 - dw));

    // the street across, at the far end
    g.fillStyle = tone(['#5a2e5e', '#1c1a40', '#56708a'], s);
    g.fillRect(1030, 290, 260, 260);
    for (const w of S.farWins) if (w.k < lit) { g.fillStyle = WIN[w.c]; g.fillRect(w.x, w.y, 6, 8); }
    g.fillStyle = mix('#3a2030', '#ffcf8a', shop); g.fillRect(1030, 500, 260, 30);
    g.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = 1036; x < 1290; x += 16) g.fillRect(x, 500, 8, 6);
    g.fillStyle = '#120e18'; g.fillRect(1030, 530, 260, 20);
    glow(g, 1155, 515, 180, '#ffb070', 0.4 * shop);
    // a car goes by now and then
    const car = event(t, 9, 5, 1.9, 21);
    let carK = 0;
    if (car) {
      const dir = hash(car.k * 1.9) < 0.5 ? 1 : -1, cx = dir > 0 ? lerp(1000, 1320, car.u) : lerp(1320, 1000, car.u);
      carK = Math.sin(Math.PI * car.u);
      g.fillStyle = '#0c0a12'; g.beginPath(); g.roundRect(cx - 34, 524, 68, 18, 6); g.fill();
      g.fillRect(cx - 20, 516, 38, 10);
      glow(g, cx + dir * 34, 534, 90, '#fff2d0', 0.75);
      glow(g, cx - dir * 34, 534, 34, '#ff3040', 0.7);
    }
    fog(g, 330, 600, hor, 0.32, 1000, 1320);

    // floor
    const floor = g.createLinearGradient(0, 544, 0, VH);
    floor.addColorStop(0, mix(tone(['#4a2848', '#262048', '#3a4a58'], s), '#ffb070', 0.2 * shop));
    floor.addColorStop(0.3, tone(['#22142a', '#0e0c1e', '#1a222c'], s));
    floor.addColorStop(1, tone(['#160c18', '#06050c', '#11161c'], s));
    g.fillStyle = floor;
    g.beginPath(); quad(g, P(LW, FL, ZF), P(RW, FL, ZF), P(RW, FL, 0.58), P(LW, FL, 0.58)); g.fill();
    // the bright far end shows in the wet ground
    const refl = g.createLinearGradient(0, 546, 0, VH);
    refl.addColorStop(0, rgba('#ffc890', 0.22 * shop + 0.3 * carK));
    refl.addColorStop(1, 'rgba(255,200,144,0)');
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = refl;
    g.beginPath(); g.moveTo(1094, 546); g.lineTo(1216, 546); g.lineTo(1262, VH); g.lineTo(1040, VH); g.fill();
    g.globalCompositeOperation = 'source-over';
    wetStreaks(g, t, 1155, 548, 130, 300, '#ffc890', 0.12 * shop + 0.25 * carK, 26, 1);
    puddles(g, S.pools, mix(hor, PINK, 0.5 * neon), 0.1 + 0.12 * wet);

    // walls
    const lw = tone(['#2e1a36', '#17142d', '#1e2836'], s), rw = tone(['#26162e', '#120f26', '#1a2430'], s);
    let gr = g.createLinearGradient(0, 0, 1086, 0);
    gr.addColorStop(0, mix(lw, '#000000', 0.55)); gr.addColorStop(1, mix(lw, hor, 0.22 + 0.13 * n * (1 - dw)));
    g.fillStyle = gr;
    g.beginPath(); quad(g, P(LW, LT, ZF), P(LW, FL, ZF), P(LW, FL, 0.9), P(LW, LT, 0.9)); g.fill();
    gr = g.createLinearGradient(VW, 0, 1224, 0);
    gr.addColorStop(0, mix(rw, '#000000', 0.5)); gr.addColorStop(1, mix(rw, hor, 0.2 + 0.1 * n * (1 - dw)));
    g.fillStyle = gr;
    g.beginPath(); quad(g, P(RW, RT, ZF), P(RW, FL, ZF), P(RW, FL, 0.9), P(RW, RT, 0.9)); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 1.5;
    g.stroke(S.lines);
    // roof edges catch the sky
    g.strokeStyle = rgba(hor, 0.5); g.lineWidth = 2;
    g.beginPath(); g.moveTo(...P(LW, LT, ZF)); g.lineTo(...P(LW, LT, 0.9)); g.moveTo(...P(RW, RT, ZF)); g.lineTo(...P(RW, RT, 0.9)); g.stroke();

    // wall windows: lit ones grouped by colour, the rest dark glass
    g.fillStyle = mix(lw, '#000000', 0.35);
    g.beginPath(); for (const w of S.wins) if (w.k >= lit) quad(g, w.a, w.b, w.c, w.d); g.fill();
    for (let c = 0; c < 4; c++) {
      g.fillStyle = mix(WIN[c], lw, 0.42);
      g.beginPath(); for (const w of S.wins) if (w.k < lit && w.c2 === c) quad(g, w.a, w.b, w.c, w.d); g.fill();
    }
    // window frames: a cross and a sill on each
    g.strokeStyle = mix(lw, '#000000', 0.55); g.lineWidth = 2;
    g.beginPath();
    for (const w of S.wins) {
      g.moveTo((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2); g.lineTo((w.d[0] + w.c[0]) / 2, (w.d[1] + w.c[1]) / 2);
      g.moveTo((w.a[0] + w.d[0]) / 2, (w.a[1] + w.d[1]) / 2); g.lineTo((w.b[0] + w.c[0]) / 2, (w.b[1] + w.c[1]) / 2);
    }
    g.stroke();
    g.strokeStyle = rgba(hor, 0.3);
    g.beginPath(); for (const w of S.wins) { g.moveTo(w.d[0], w.d[1] + 2); g.lineTo(w.c[0], w.c[1] + 2); } g.stroke();

    // pipes
    g.fillStyle = mix(lw, '#000000', 0.5);
    g.beginPath(); quad(g, P(LW + 40, -130, 1), P(LW + 40, -130, ZF), P(LW + 40, -90, ZF), P(LW + 40, -90, 1)); g.fill();
    g.fillRect(VX + (LW + 30) / 2.05 - 8, 0, 15, VY + FL / 2.05);
    g.fillStyle = mix(rw, '#000000', 0.5);
    g.fillRect(VX + (RW - 30) / 2.15 - 7, 0, 14, VY + FL / 2.15);
    g.fillStyle = rgba(hor, 0.25);
    g.beginPath(); quad(g, P(LW + 40, -130, 1), P(LW + 40, -130, ZF), P(LW + 40, -124, ZF), P(LW + 40, -124, 1)); g.fill();

    // AC boxes on the walls
    const box = (X, X2, y1, y2, z1, z2, col) => {
      g.fillStyle = mix(col, '#000000', 0.2);
      g.beginPath(); quad(g, P(X2, y1, z1), P(X2, y1, z2), P(X2, y2, z2), P(X2, y2, z1)); g.fill();
      g.fillStyle = col;
      const a = P(Math.min(X, X2), y1, z1), b = P(Math.max(X, X2), y2, z1);
      g.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let k = 1; k < 4; k++) g.fillRect(a[0] + 4, a[1] + (b[1] - a[1]) * k / 4, b[0] - a[0] - 8, 1.5);
    };
    const acC = tone(['#4a3048', '#26243e', '#3e4a58'], s);
    box(LW, LW + 170, -700, -560, 2.0, 2.3, acC);
    box(LW, LW + 150, -900, -780, 3.6, 3.9, acC);
    box(RW, RW - 160, -800, -680, 2.6, 2.9, acC);

    // door with a small lamp
    g.fillStyle = mix(lw, '#000000', 0.6);
    g.beginPath(); quad(g, P(LW, -250, 2.45), P(LW, -250, 2.85), P(LW, FL, 2.85), P(LW, FL, 2.45)); g.fill();
    const lamp = span(s, 0.05, 0.2) * (1 - 0.9 * dw);
    const [lx, ly] = P(LW + 40, -330, 2.65);
    g.fillStyle = '#1a1420'; g.fillRect(lx - 9, ly - 6, 18, 9);
    g.fillStyle = mix('#5a4a3a', '#fff0c8', lamp); g.fillRect(lx - 6, ly + 3, 12, 3);
    lightCone(g, lx, ly + 5, 12, 110, 190, '#ffcf8a', 0.1 * lamp);
    glow(g, lx, ly + 4, 80, '#ffbf70', 0.4 * lamp);

    // cables across the gap, and one line of small bulbs
    g.strokeStyle = '#07060c';
    S.cables.forEach(([z, ya, yb, sag], i) => {
      const a = P(LW, ya, z), b = P(RW, yb, z), sw = (noise(t * 0.15, i) - 0.5) * 20 / z;
      g.lineWidth = Math.max(1, 5 / z);
      g.beginPath(); g.moveTo(...a); g.quadraticCurveTo((a[0] + b[0]) / 2 + sw, (a[1] + b[1]) / 2 + (sag * 2) / z, ...b); g.stroke();
    });
    const ba = P(LW, -900, 3.4), bb = P(RW, -800, 3.4);
    stringLights(g, ba[0], ba[1], bb[0], bb[1], 50, 9, t, { colors: ['#ffd9a0', '#ff9fd0'], lit: neon > 0.1 ? 1 : 0, r: 3, glowR: 6, wire: '#07060c' });

    // far small sign
    {
      const [x0, y0] = P(450, -600, 4), [x1, y1] = P(680, -430, 4);
      g.fillStyle = '#100a14'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      neonText(g, 'CAFE', (x0 + x1) / 2, (y0 + y1) / 2 + 1, 15, '#ffb070', neon);
      glow(g, (x0 + x1) / 2, (y0 + y1) / 2, 70, '#ff9a50', 0.35 * neon);
    }

    // steam from a floor vent
    const [vx, vy] = P(150, FL, 3.2);
    g.fillStyle = '#0a0810'; g.beginPath(); g.ellipse(vx, vy, 42, 7, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(120,110,140,0.4)'; g.lineWidth = 1.5;
    g.beginPath(); for (let k = -30; k <= 30; k += 10) { g.moveTo(vx + k, vy - 5); g.lineTo(vx + k, vy + 5); } g.stroke();
    g.fillStyle = mix('#e8e4f4', hor, 0.3);
    for (let i = 0; i < 16; i++) {
      const rise = hash(i * 1.7) + t * (0.13 + 0.06 * hash(i + 4)), ph = rise % 1, turn = Math.floor(rise);
      const px = vx + (hash(i * 3.3 + turn * 1.9) - 0.5) * 34 - ph * ph * 70 + Math.sin(t * 0.7 + i) * 8 * ph;
      g.globalAlpha = 0.17 * Math.sin(Math.PI * ph);
      g.beginPath(); g.arc(px, vy - ph * 260, 12 + ph * 46, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;

    // vending machine, near left
    const vA = P(LW + 330, -100, 1.22), vB = P(LW + 330, -100, 1.5), vC = P(LW + 330, FL, 1.5), vD = P(LW + 330, FL, 1.22);
    g.fillStyle = tone(['#9aa4b8', '#5a6480', '#8a96a8'], s);
    g.beginPath(); quad(g, vA, vB, vC, vD); g.fill();
    const side = P(LW, -100, 1.22);
    g.fillStyle = tone(['#a8505c', '#7a2a3c', '#8a4a54'], s);
    g.fillRect(side[0], side[1], vA[0] - side[0], vD[1] - side[1]);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(side[0], side[1] + 30, vA[0] - side[0], 8);
    const at = (u, v) => [lerp(lerp(vA[0], vB[0], u), lerp(vD[0], vC[0], u), v), lerp(lerp(vA[1], vB[1], u), lerp(vD[1], vC[1], u), v)];
    g.fillStyle = '#dff3ff';
    g.beginPath(); quad(g, at(0.08, 0.04), at(0.92, 0.04), at(0.92, 0.52), at(0.08, 0.52)); g.fill();
    const cans = ['#ff5f7a', '#4fb8ff', '#ffc24f', '#5fd38a', '#c08aff'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      const p = at(0.14 + c * 0.16, 0.08 + r * 0.115), q = at(0.14 + c * 0.16 + 0.1, 0.08 + r * 0.115 + 0.075);
      g.fillStyle = cans[(r + c * 2) % 5];
      g.fillRect(p[0], p[1], q[0] - p[0], q[1] - p[1]);
    }
    g.fillStyle = '#20202a'; g.beginPath(); quad(g, at(0.15, 0.7), at(0.85, 0.7), at(0.85, 0.8), at(0.15, 0.8)); g.fill();
    const vm = 0.35 + 0.65 * n * (1 - 0.6 * dw);
    glow(g, 330, 480, 340, '#bfe8ff', 0.26 * vm);
    glow(g, 360, 860, 300, '#bfe8ff', 0.12 * vm);

    // OPEN sign high on the left
    g.fillStyle = '#0e0912'; g.fillRect(14, 132, 14, 8); g.fillRect(14, 184, 14, 8);
    g.fillStyle = '#100a16'; g.beginPath(); g.roundRect(28, 122, 176, 78, 8); g.fill();
    neonText(g, 'OPEN', 116, 162, 44, CYAN, neon * (noise(t * 0.8, 3) > 0.12 ? 1 : 0.25));
    glow(g, 116, 162, 230, CYAN, 0.3 * neon);

    // ---- Round object: tall neon sign, 6 segments, fills up from the bottom ----
    const { x0, x1, y0, y1 } = SIGN, sw = x1 - x0, cell = (y1 - y0 - 16) / 6;
    g.fillStyle = '#0c0810';
    g.fillRect(x1, y0 + 40, VW - x1, 10); g.fillRect(x1, y1 - 50, VW - x1, 10);
    g.fillStyle = '#140c1c'; g.beginPath(); g.roundRect(x0, y0, sw, y1 - y0, 10); g.fill();
    g.strokeStyle = rgba(CYAN, 0.25 + 0.6 * neon); g.lineWidth = 3;
    g.beginPath(); g.roundRect(x0 + 5, y0 + 5, sw - 10, y1 - y0 - 10, 7); g.stroke();
    const word = 'NOODLE';
    let level = 0;
    for (let i = 0; i < 6; i++) {
      const k = st.round * 6 - i;                     // i = 0 is the bottom cell
      let on = k >= 1 ? 1 : 0;
      if (k > 0.82 && k < 1) on = noise(t * 9, i) > 0.55 ? 0.8 : 0.1;   // warms up with a flicker
      level += on;
      const cy = y1 - 8 - cell * (i + 0.5);
      if (on > 0.05) { g.fillStyle = rgba(PINK, 0.12 * on); g.fillRect(x0 + 10, cy - cell / 2 + 3, sw - 20, cell - 6); }
      neonText(g, word[5 - i], (x0 + x1) / 2, cy + 2, 50, PINK, on);
      if (on > 0.05) glow(g, (x0 + x1) / 2, cy, 110, PINK, 0.3 * on);
    }
    // its light on the right wall and in the wet ground grows as it fills
    level /= 6;
    glow(g, 1500, 380, 360, PINK, 0.18 * level + 0.04);
    wetStreaks(g, t, (x0 + x1) / 2, 765, sw * 0.9, 150, PINK, (0.14 + 0.2 * wet) * (level + 0.1), 20, 2);
    wetStreaks(g, t, 470, 640, 110, 260, CYAN, (0.08 + 0.14 * wet) * neon, 16, 3);
    ripples(g, t, S.pools, wet, '#f0d8ff');

    rain(g, t, wet, { n: 240, alpha: 0.26, color: '#e0d6ff', len: 28 });
    rain(g, t, wet, { n: 40, alpha: 0.42, len: 52, speed: 2.3, width: 1.8, seed: 77, color: '#ffd0ec' });
    breakTint(g, st);
    edges(g, 0.55);
  }
};

export default {
  id: 'lofi',
  name: 'Lofi',
  tagline: 'Night shift',
  accent: '#ff7ac8', accent2: '#6ee7ff', ink: '#f3ecff', shade: '#0d0a1c',
  digits: "'VT323', 'Courier New', monospace",
  mix: { rain: 0.2, fire: 0, vinyl: 0.5, wind: 0.2 },
  music: 'beat',
  scenes: [desk, rooftop, alley, train, corner, studio, harbour]
};
