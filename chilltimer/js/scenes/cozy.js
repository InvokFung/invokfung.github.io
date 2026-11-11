// Cozy vibe — "A rainy evening in".
// Story (session 0→1): rainy dusk → blue hour → night rain → rain stops, stars and moon.

import {
  VW, VH, TAU, lerp, span, noise, hash, mix, rgba, ramp, fillSky, glow, fog, vignette, lightCone,
  makeStars, drawStars, drawMoon, makeClouds, drawClouds, ridgeY, ridgePath, pinesPath, makeTree, drawTree,
  rain, makeGlass, drawGlass, flame, steam, stringLights
} from './kit.js';
import { fireplace, attic } from './cozy-more.js';
import { greenhouse, bookshop, cabin, teatime } from './cozy-extra.js';

// Sky colours top→horizon, each a ramp over the story.
const SKY = [
  ['#2a3a63', '#16203f', '#0a1022', '#060a1a'],
  ['#6e5f86', '#2c3c66', '#121a33', '#0c1430'],
  ['#d98f6f', '#56608c', '#1c2744', '#152246'],
  ['#f2b27a', '#8a7a95', '#263352', '#1e2f5a']
];
const rainAt = s => lerp(0.5, 1, span(s, 0, 0.35)) * (1 - span(s, 0.62, 0.84));
const nightAt = s => span(s, 0.05, 0.55);
const WARM = ['#ffd9a0', '#ffc27a', '#ffe7c2'];

function curtain(g, x, w, flip) {
  const top = 56, bot = 748;
  g.save();
  if (flip) { g.translate(2 * x + w, 0); g.scale(-1, 1); }
  const body = g.createLinearGradient(x, 0, x + w, 0);
  body.addColorStop(0, '#4a1f20'); body.addColorStop(0.5, '#7a3430'); body.addColorStop(1, '#52221f');
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(x, top); g.lineTo(x + w, top);
  g.bezierCurveTo(x + w + 14, 280, x + w - 30, 520, x + w - 8, bot - 10);
  for (let i = 5; i >= 0; i--) g.quadraticCurveTo(x + (i + 0.5) * (w / 6), bot + 16, x + i * (w / 6), bot - 6);
  g.closePath();
  g.fill();
  for (let i = 0; i < 6; i++) {                       // folds
    const fx = x + i * (w / 6), fold = g.createLinearGradient(fx, 0, fx + w / 6, 0);
    fold.addColorStop(0, 'rgba(0,0,0,0.34)'); fold.addColorStop(0.55, 'rgba(255,190,150,0.07)'); fold.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.fillStyle = fold;
    g.fillRect(fx, top, w / 6, bot - top - 12);
  }
  g.restore();
}

const windowSeat = {
  id: 'window', name: 'Window seat', focus: [0.5, 0.42],
  setup(rand) {
    const yNear = x => ridgeY(x, 9, 585, 70, 200);
    return {
      stars: makeStars(rand, 110, 300, 90, 1300, 430),
      clouds: makeClouds(rand, 8, 300, 110, 1300, 330),
      ridgeFar: ridgePath(3, 480, 120, 280, 700),
      ridgeNear: ridgePath(9, 585, 70, 200, 700),
      pines: pinesPath(rand, 46, 300, 1300, yNear, 26, 60),
      houses: [520, 640, 705, 860, 955, 1010, 1185].map((x, i) => ({ x, y: yNear(x + 20) + 12, w: 38 + rand() * 20, h: 24 + rand() * 12, k: rand(), tall: i % 3 === 0 })),
      tree: makeTree(rand, 432, 706, 120, -Math.PI / 2 - 0.06, 6),
      glass: makeGlass(rand, 46, 304, 94, 1296, 686),
      books: [['#4f6d7a', 118, 17], ['#c0a062', 104, 14], ['#7a4f5e', 92, 19]],
      leaves: Array.from({ length: 9 }, (_, i) => ({ a: -Math.PI / 2 + (i - 4) * 0.3 + (rand() - 0.5) * 0.15, l: 46 + rand() * 34, c: rand() }))
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, n = nightAt(s), wet = rainAt(s);
    const X0 = 300, X1 = 1300, Y0 = 90, Y1 = 690, W = X1 - X0;

    // wall
    const wall = g.createLinearGradient(0, 0, 0, VH);
    wall.addColorStop(0, '#412a23'); wall.addColorStop(1, '#27170f');
    g.fillStyle = wall;
    g.fillRect(0, 0, VW, VH);
    g.fillStyle = 'rgba(255,200,160,0.028)';
    for (let x = 14; x < VW; x += 52) g.fillRect(x, 0, 22, 730);

    // ---- outside, through the glass ----
    g.save();
    g.beginPath(); g.rect(X0, Y0, W, Y1 - Y0); g.clip();
    fillSky(g, SKY.map(k => ramp(k, s)), Y0, 610);
    drawStars(g, S.stars, t, span(s, 0.7, 0.95));
    const up = span(s, 0.72, 1);
    drawMoon(g, 1075, lerp(520, 215, up), 40, '#f4ecd2', '#cfd8ff', up);
    drawClouds(g, S.clouds, t, ramp(['#5b5273', '#2d3555', '#171e38', '#202b4e'], s), lerp(0.85, 0.22, span(s, 0.7, 0.95)));
    g.fillStyle = ramp(['#4e4c70', '#2a3558', '#131b37', '#17244c'], s);
    g.fill(S.ridgeFar);
    fog(g, 430, 600, ramp(['#eaa98c', '#7e86ad', '#2e3a5c', '#33487c'], s), 0.4, X0, X1);
    const near = ramp(['#30344f', '#1b2442', '#0c1326', '#0e1732'], s);
    g.fillStyle = near;
    g.fill(S.ridgeNear); g.fill(S.pines);

    // village: windows come on one by one as it gets dark
    const litShare = lerp(0.15, 1.05, n);
    for (const h of S.houses) {
      g.fillStyle = mix(near, '#000000', 0.25);
      g.fillRect(h.x, h.y - h.h, h.w, h.h + 8);
      g.beginPath(); g.moveTo(h.x - 6, h.y - h.h); g.lineTo(h.x + h.w / 2, h.y - h.h - h.w * 0.44); g.lineTo(h.x + h.w + 6, h.y - h.h); g.fill();
      if (h.tall) g.fillRect(h.x + h.w * 0.68, h.y - h.h - h.w * 0.4, 6, h.w * 0.3);
      if (h.k < litShare) {
        g.fillStyle = '#ffcf8a';
        g.fillRect(h.x + h.w * 0.18, h.y - h.h * 0.72, h.w * 0.22, h.h * 0.34);
        g.fillRect(h.x + h.w * 0.6, h.y - h.h * 0.72, h.w * 0.22, h.h * 0.34);
        glow(g, h.x + h.w / 2, h.y - h.h * 0.5, 34, '#ffae5c', 0.45);
      }
    }

    // garden, tree, street lamp
    const ground = ramp(['#1e2238', '#121930', '#080d1c', '#0a1124'], s);
    g.fillStyle = ground;
    g.beginPath(); g.rect(X0, 652, W, 60);
    for (let x = X0; x < X1 + 30; x += 44) { g.moveTo(x + 30, 656); g.arc(x, 656, 30 + 8 * hash(x), 0, TAU); }
    g.fill();
    g.save();
    g.translate(432, 706); g.rotate(Math.sin(t * 0.6) * 0.006 * (1 + wet)); g.translate(-432, -706);
    drawTree(g, S.tree, ground);
    g.restore();
    const lampOn = span(s, 0.08, 0.2);
    g.fillStyle = ground;
    g.fillRect(1146, 470, 5, 240); g.fillRect(1126, 470, 25, 4); g.fillRect(1118, 466, 22, 12);
    lightCone(g, 1129, 478, 18, 210, 215, '#ffd9a0', 0.2 * lampOn);
    glow(g, 1129, 480, 150, '#ffcf8a', 0.5 * lampOn);
    glow(g, 1129, 478, 22, '#fff4d8', 0.9 * lampOn);

    rain(g, t, wet, { x0: X0, y0: Y0, x1: X1, y1: Y1, n: 260, alpha: lerp(0.26, 0.4, n) });
    rain(g, t, wet, { x0: X0, y0: Y0, x1: X1, y1: Y1, n: 70, alpha: 0.5, len: 44, speed: 2.1, width: 1.8, seed: 40 });

    // the glass itself
    g.fillStyle = 'rgba(150,180,230,0.05)';
    g.fillRect(X0, Y0, W, Y1 - Y0);
    drawGlass(g, S.glass, dt, wet);
    g.fillStyle = 'rgba(255,255,255,0.035)';
    for (const [a, b] of [[420, 90], [470, 40], [980, 130]]) {
      g.beginPath(); g.moveTo(a, Y0); g.lineTo(a + b, Y0); g.lineTo(a + b - 330, Y1); g.lineTo(a - 330, Y1); g.fill();
    }
    g.restore();

    // ---- window frame ----
    const wood = '#2c1b15', woodHi = '#5a3a2b';
    g.fillStyle = wood;
    g.fillRect(X0 - 28, Y0 - 28, W + 56, 28); g.fillRect(X0 - 28, Y0, 28, Y1 - Y0); g.fillRect(X1, Y0, 28, Y1 - Y0);
    g.fillRect(X0 + W / 3 - 7, Y0, 14, Y1 - Y0); g.fillRect(X0 + (2 * W) / 3 - 7, Y0, 14, Y1 - Y0);
    g.fillRect(X0, Y0 + 228, W, 12);
    g.fillStyle = woodHi;
    g.fillRect(X0, Y0, W, 3); g.fillRect(X0, Y0 + 240, W, 2);
    for (const x of [X0, X0 + W / 3 + 7, X0 + (2 * W) / 3 + 7]) g.fillRect(x, Y0, 2, Y1 - Y0);
    // sill
    g.fillStyle = '#3d281e'; g.fillRect(232, Y1, 1136, 34);
    g.fillStyle = '#6a4632'; g.fillRect(232, Y1, 1136, 4);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(232, Y1 + 34, 1136, 10);

    // curtains + rod
    curtain(g, 150, 168, false);
    curtain(g, 1282, 168, true);
    g.fillStyle = '#1c110d';
    g.fillRect(110, 46, 1380, 9);
    g.beginPath(); g.arc(110, 50, 11, 0, TAU); g.arc(1490, 50, 11, 0, TAU); g.fill();

    // ---- on the sill ----
    const candleH = lerp(86, 20, st.round), cx = 598, cy = Y1 - candleH;
    g.fillStyle = '#7d5c3e';
    g.beginPath(); g.ellipse(cx, Y1 + 1, 34, 7, 0, 0, TAU); g.fill();
    const wax = g.createLinearGradient(cx - 14, 0, cx + 14, 0);
    wax.addColorStop(0, '#d9c7a6'); wax.addColorStop(0.45, '#f6ecd6'); wax.addColorStop(1, '#c9b592');
    g.fillStyle = wax;
    g.beginPath(); g.roundRect(cx - 14, cy, 28, candleH, [5, 5, 2, 2]); g.fill();
    g.beginPath(); g.ellipse(cx - 12, cy + 12, 4, 9, 0, 0, TAU); g.ellipse(cx + 11, cy + 20, 3.5, 12, 0, 0, TAU); g.fill();
    g.fillStyle = '#2a1c14'; g.fillRect(cx - 1, cy - 7, 2, 8);

    // mug
    g.strokeStyle = '#a9492f'; g.lineWidth = 7;
    g.beginPath(); g.arc(756, Y1 - 27, 13, -1.2, 1.2); g.stroke();
    g.fillStyle = '#c05b3f';
    g.beginPath(); g.roundRect(706, Y1 - 54, 50, 54, [4, 4, 12, 12]); g.fill();
    g.fillStyle = '#e8d9c0'; g.fillRect(706, Y1 - 40, 50, 7);
    g.fillStyle = '#3a2218'; g.beginPath(); g.ellipse(731, Y1 - 53, 23, 5, 0, 0, TAU); g.fill();

    // books
    let by = Y1;
    S.books.forEach(([c, w, h], i) => {
      by -= h;
      const bx = 962 + i * 9;
      g.fillStyle = c; g.beginPath(); g.roundRect(bx, by, w, h, 3); g.fill();
      g.fillStyle = 'rgba(255,245,225,0.75)'; g.fillRect(bx + w - 7, by + 3, 5, h - 6);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(bx + 14, by, 3, h);
    });

    // plant
    g.lineCap = 'round';
    for (const [i, l] of S.leaves.entries()) {
      const a = l.a + Math.sin(t * 0.7 + i) * 0.03, ex = 1156 + Math.cos(a) * l.l, ey = Y1 - 44 + Math.sin(a) * l.l;
      g.strokeStyle = mix('#35603f', '#6a9a63', l.c);
      g.lineWidth = 9;
      g.beginPath(); g.moveTo(1156, Y1 - 40); g.quadraticCurveTo(1156 + Math.cos(a) * l.l * 0.4, Y1 - 44 + Math.sin(a) * l.l * 0.9, ex, ey); g.stroke();
    }
    g.fillStyle = '#9a5637';
    g.beginPath(); g.moveTo(1128, Y1 - 44); g.lineTo(1184, Y1 - 44); g.lineTo(1176, Y1); g.lineTo(1136, Y1); g.fill();
    g.fillStyle = '#b56a47'; g.fillRect(1124, Y1 - 50, 64, 9);

    // ---- window seat ----
    g.fillStyle = '#24140f'; g.fillRect(0, Y1 + 44, VW, VH - Y1 - 44);
    g.fillStyle = '#5a3540';
    g.beginPath(); g.roundRect(90, 782, 1420, 170, 34); g.fill();
    g.fillStyle = 'rgba(255,200,190,0.08)'; g.beginPath(); g.roundRect(90, 782, 1420, 26, 20); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.3)';
    for (let x = 190; x < 1500; x += 150) { g.beginPath(); g.arc(x, 846, 5, 0, TAU); g.fill(); }
    // blanket
    g.fillStyle = '#7d8a68';
    g.beginPath(); g.moveTo(900, 776); g.quadraticCurveTo(1060, 756, 1230, 780); g.lineTo(1262, 900); g.lineTo(872, 900); g.fill();
    g.strokeStyle = 'rgba(240,235,210,0.3)'; g.lineWidth = 5;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(902 - i * 7, 802 + i * 28); g.quadraticCurveTo(1064, 782 + i * 28, 1238 + i * 7, 806 + i * 28); g.stroke(); }
    // pillow
    g.save(); g.translate(1385, 748); g.rotate(0.16);
    g.fillStyle = '#d2a96c'; g.beginPath(); g.roundRect(-70, -62, 140, 124, 26); g.fill();
    g.strokeStyle = 'rgba(120,70,40,0.5)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-40, -32); g.lineTo(40, 32); g.moveTo(40, -32); g.lineTo(-40, 32); g.stroke();
    g.restore();

    // ---- light ----
    // The room dims with the evening; the window stays as it is.
    g.fillStyle = rgba('#0b0612', 0.14 + 0.3 * n);
    g.beginPath(); g.rect(0, 0, VW, VH); g.rect(X0, Y0, W, Y1 - Y0); g.fill('evenodd');

    for (let i = 0; i < 4; i++) {
      const a = X0 - 12 + i * ((W + 24) / 4);
      stringLights(g, a, Y0 - 6, a + (W + 24) / 4, Y0 - 6, 20, 5, t, { colors: WARM, seed: i * 5 });
    }
    const flick = 0.8 + 0.2 * noise(t * 7, 2);
    flame(g, cx, cy - 6, 15, 36, t, 1);
    glow(g, cx, cy - 20, 460, '#ff9648', 0.2 * flick);
    glow(g, cx, cy - 20, 130, '#ffdca8', 0.42 * flick);
    glow(g, cx, 470, 120, '#ffb46a', 0.07 * flick);                       // candle seen in the glass
    steam(g, 731, Y1 - 58, t, 1 - span(st.round, 0.15, 0.7));
    if (st.mode !== 'focus') glow(g, 800, 760, 900, '#ffb070', 0.08);     // breaks feel a little warmer
    vignette(g, 0.5);
  }
};

export default {
  id: 'cozy',
  name: 'Cozy',
  tagline: 'A rainy evening in',
  accent: '#ffb46a', accent2: '#e2725b', ink: '#fff3e2', shade: '#1a0f0c',
  digits: "'Fraunces', 'Iowan Old Style', Georgia, serif",
  mix: { rain: 0.55, fire: 0.3, vinyl: 0, wind: 0.12 },
  music: 'piano',
  scenes: [windowSeat, fireplace, attic, greenhouse, bookshop, cabin, teatime]
};
