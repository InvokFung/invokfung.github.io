// Cozy scenes 2 and 3: "Fireplace" and "Attic nook".
// Same house and the same rainy evening as the window seat in cozy.js.

import {
  VW, VH, TAU, lerp, span, noise, hash, mix, rgba, ramp, fillSky, glow, vignette, lightCone,
  makeStars, drawStars, drawMoon, makeClouds, drawClouds, ridgePath, rain, makeGlass, drawGlass,
  flame, embers, steam, stringLights
} from './kit.js';

// Story helpers, copied from cozy.js. Keep the values the same as there.
const SKY = [
  ['#2a3a63', '#16203f', '#0a1022', '#060a1a'],
  ['#6e5f86', '#2c3c66', '#121a33', '#0c1430'],
  ['#d98f6f', '#56608c', '#1c2744', '#152246'],
  ['#f2b27a', '#8a7a95', '#263352', '#1e2f5a']
];
const rainAt = s => lerp(0.5, 1, span(s, 0, 0.35)) * (1 - span(s, 0.62, 0.84));
const nightAt = s => span(s, 0.05, 0.55);
const WARM = ['#ffd9a0', '#ffc27a', '#ffe7c2'];

// Colours the rooms of this house share.
const BOOK = ['#4f6d7a', '#c0a062', '#7a4f5e', '#7d8a68', '#a9492f', '#d2a96c', '#3e5a6e', '#8a5a3c', '#5a3540'];
const CLOUD = ['#5b5273', '#2d3555', '#171e38', '#202b4e'];
const cloudAlpha = s => lerp(0.85, 0.22, span(s, 0.7, 0.95));
const DIM = '#0b0612';

// ---------- small local helpers ----------
function addPoly(p, pts) {
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}
const poly = pts => addPoly(new Path2D(), pts);

// One shelf row of books, left to right. Some gaps, some flat stacks, maybe one leaning book at the end.
function shelfRow(rand, x0, x1, base, maxH, out) {
  const pick = () => BOOK[Math.floor(rand() * BOOK.length)];
  let x = x0;
  while (x < x1) {
    const r = rand();
    if (r < 0.08) { x += 10 + rand() * 16; continue; }
    if (r < 0.17 && x1 - x > 64) {
      let y = base;
      for (let k = 0, n = 2 + Math.floor(rand() * 3); k < n; k++) {
        const h = 9 + rand() * 5;
        y -= h;
        out.push({ x: x + rand() * 6, y, w: 46 + rand() * 12, h, c: pick(), flat: true });
      }
      x += 66;
      continue;
    }
    const w = 10 + rand() * 13, h = maxH * (0.64 + rand() * 0.34);
    if (x + w > x1) break;
    out.push({ x, y: base - h, w, h, c: pick(), band: rand() });
    x += w + 0.8;
  }
  const h = maxH * 0.86, a = 0.32;
  if (x1 - x > 30) out.push({ x: x + h * Math.sin(a) - 2, y: base, w: 13, h, c: pick(), band: 1, lean: -a });
  return out;
}

function drawBook(g, b, x, y) {
  g.fillStyle = b.c;
  g.fillRect(x, y, b.w, b.h);
  if (b.flat) {
    g.fillStyle = 'rgba(255,245,225,0.55)'; g.fillRect(x + b.w - 5, y + 2, 4, b.h - 4);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, y + b.h - 1.5, b.w, 1.5);
    return;
  }
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x + b.w - 2.5, y, 2.5, b.h);
  if (b.band > 0.35) {
    g.fillStyle = 'rgba(255,232,190,0.26)';
    g.fillRect(x + 1, y + 7, b.w - 3.5, 3); g.fillRect(x + 1, y + b.h - 12, b.w - 3.5, 3);
  }
}
function drawBooks(g, books) {
  for (const b of books) {
    if (!b.lean) { drawBook(g, b, b.x, b.y); continue; }
    g.save(); g.translate(b.x, b.y); g.rotate(b.lean);
    drawBook(g, b, 0, -b.h);
    g.restore();
  }
}

// Leafy pot plant like the one on the window sill.
function makeLeaves(rand, n, minL, maxL) {
  return Array.from({ length: n }, (_, i) => ({ a: -Math.PI / 2 + (i - (n - 1) / 2) * 0.3 + (rand() - 0.5) * 0.15, l: minL + rand() * (maxL - minL), c: rand() }));
}
function drawPlant(g, leaves, x, y, t, k = 1) {
  g.lineCap = 'round';
  for (const [i, l] of leaves.entries()) {
    const a = l.a + Math.sin(t * 0.7 + i) * 0.03, ll = l.l * k, ex = x + Math.cos(a) * ll, ey = y - 4 + Math.sin(a) * ll;
    g.strokeStyle = mix('#35603f', '#6a9a63', l.c);
    g.lineWidth = 9 * k;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * ll * 0.4, y - 4 + Math.sin(a) * ll * 0.9, ex, ey); g.stroke();
  }
  const w = 28 * k, h = 44 * k;
  g.fillStyle = '#9a5637';
  g.beginPath(); g.moveTo(x - w, y - 4 * k); g.lineTo(x + w, y - 4 * k); g.lineTo(x + w * 0.72, y + h - 4 * k); g.lineTo(x - w * 0.72, y + h - 4 * k); g.fill();
  g.fillStyle = '#b56a47'; g.fillRect(x - w - 4 * k, y - 10 * k, (w + 4 * k) * 2, 9 * k);
}

function drawMug(g, x, y, k = 1) {      // (x, y) = bottom left
  g.strokeStyle = '#a9492f'; g.lineWidth = 7 * k;
  g.beginPath(); g.arc(x + 50 * k, y - 27 * k, 13 * k, -1.2, 1.2); g.stroke();
  g.fillStyle = '#c05b3f';
  g.beginPath(); g.roundRect(x, y - 54 * k, 50 * k, 54 * k, [4 * k, 4 * k, 12 * k, 12 * k]); g.fill();
  g.fillStyle = '#e8d9c0'; g.fillRect(x, y - 40 * k, 50 * k, 7 * k);
  g.fillStyle = '#3a2218'; g.beginPath(); g.ellipse(x + 25 * k, y - 53 * k, 23 * k, 5 * k, 0, 0, TAU); g.fill();
}

// =====================================================================
// Fireplace: the living room. A brick chimney breast right of centre,
// a side window on the left wall, books, a rug and an armchair.
// Round object: the fire. Tall flames at round 0, low flames on glowing coals at round 1.
// =====================================================================
const FX = 1160, FLOOR = 770, VPX = 820, VPY = 430, CORNER = 230;
// y on the left side wall at screen x, for a level line that meets the room corner at height h
const sideY = (x, h) => VPY + (h - VPY) * (x - VPX) / (CORNER - VPX);
const sideQuad = (x0, x1, h0, h1) => [[x0, sideY(x0, h0)], [x1, sideY(x1, h0)], [x1, sideY(x1, h1)], [x0, sideY(x0, h1)]];

export const fireplace = {
  id: 'fireplace', name: 'Fireplace', focus: [0.8, 0.6],

  setup(rand) {
    // left side wall, its lower panel, and the window on it
    const topX = VPX - VPY * (CORNER - VPX) / (36 - VPY);                     // where the wall top leaves the screen
    const side = poly([[0, 0], [topX, 0], [CORNER, 36], [CORNER, FLOOR], [0, sideY(0, FLOOR)]]);
    const sideLow = poly([[0, sideY(0, 584)], [CORNER, 584], [CORNER, FLOOR], [0, sideY(0, FLOOR)]]);
    const winGlassPts = sideQuad(46, 186, 170, 522);
    const winBars = new Path2D();
    winBars.moveTo(116, sideY(116, 170)); winBars.lineTo(116, sideY(116, 522));
    winBars.moveTo(46, sideY(46, 300)); winBars.lineTo(186, sideY(186, 300));
    const curtain = new Path2D();
    curtain.moveTo(0, sideY(0, 140)); curtain.lineTo(30, sideY(30, 140));
    curtain.bezierCurveTo(44, sideY(44, 300), 26, sideY(26, 460), 40, sideY(40, 600));
    curtain.lineTo(0, sideY(0, 600)); curtain.closePath();

    // everything except the window glass gets the evening dimming
    const hole = new Path2D();
    hole.rect(0, 0, VW, VH);
    addPoly(hole, winGlassPts);

    // bricks of the chimney breast, grouped by shade so each shade is one fill
    const brickCols = ['#5a3428', '#4e2d23', '#663c2d', '#46291f'];
    const bricks = brickCols.map(() => new Path2D());
    for (let row = 0, y = 0; y < FLOOR; row++, y += 26) {
      const off = (row % 2) * 32;
      for (let x = 950 - off; x < 1370; x += 64) {
        const x0 = Math.max(950, x), x1 = Math.min(1370, x + 61);
        if (x1 - x0 > 4) bricks[Math.floor(rand() * 4)].rect(x0, y, x1 - x0, 23);
      }
    }

    // stone arch around the fire opening
    const open = new Path2D();
    open.moveTo(1040, FLOOR); open.lineTo(1040, 640); open.ellipse(FX, 640, 120, 54, 0, Math.PI, TAU); open.lineTo(1280, FLOOR); open.closePath();
    const surround = new Path2D();
    surround.moveTo(996, FLOOR); surround.lineTo(996, 640); surround.ellipse(FX, 640, 164, 94, 0, Math.PI, TAU); surround.lineTo(1324, FLOOR); surround.closePath();
    const joints = new Path2D();
    for (let i = 1; i < 9; i++) {
      const a = Math.PI + (i / 9) * Math.PI;
      joints.moveTo(FX + Math.cos(a) * 120, 640 + Math.sin(a) * 54);
      joints.lineTo(FX + Math.cos(a) * 164, 640 + Math.sin(a) * 94);
    }
    for (const y of [672, 706, 740]) { joints.moveTo(996, y); joints.lineTo(1040, y); joints.moveTo(1280, y); joints.lineTo(1324, y); }

    // floor: planks run toward the vanishing point
    const floor = poly([[0, sideY(0, FLOOR)], [CORNER, FLOOR], [VW, FLOOR], [VW, VH], [0, VH]]);
    const seams = new Path2D();
    for (let bx = 20; bx < 2600; bx += 58) {
      const x770 = VPX + (bx - VPX) * (FLOOR - VPY) / (VH - VPY);
      if (x770 < CORNER) continue;
      seams.moveTo(x770, FLOOR); seams.lineTo(bx, VH);
    }
    for (const y of [786, 808, 836, 870]) {           // short end joints between planks
      for (let x = CORNER; x < VW; x += 90 + 80 * rand()) { seams.moveTo(x, y); seams.lineTo(x + 2 + (y - FLOOR) * 0.05, y + 6 + (y - FLOOR) * 0.08); }
    }

    // bookshelf rows
    const books = [];
    for (const base of [236, 352, 468, 584, 700]) shelfRow(rand, 278, 462, base, 98, books);

    // wainscot panels on the back wall
    const panels = new Path2D();
    for (const [a, b] of [[500, 940], [1384, 1600]]) {
      const n = Math.max(1, Math.round((b - a) / 150)), w = (b - a) / n;
      for (let i = 0; i < n; i++) panels.rect(a + i * w + 12, 604, w - 24, 140);
    }

    // logs in the fire, in local space: (x, y) is the left end, a the angle
    const logs = [
      { x: 1078, y: 744, len: 168, r: 13, a: -0.04 },
      { x: 1058, y: 766, len: 138, r: 12, a: -0.2 },
      { x: 1262, y: 768, len: 132, r: 11, a: Math.PI + 0.22 }
    ].map(l => ({ ...l, cracks: Array.from({ length: 5 }, (_, i) => [l.len * (0.12 + i * 0.17 + rand() * 0.05), (rand() - 0.5) * 8]) }));
    const coals = Array.from({ length: 34 }, () => ({ x: lerp(1056, 1264, rand()), y: lerp(756, 770, rand()), rx: 6 + rand() * 9, ry: 3 + rand() * 3, k: rand() }));
    const flames = [
      [-4, 56, 172, 1, 1], [-54, 42, 122, 2, 1.5], [52, 44, 134, 3, 1.3], [-92, 28, 70, 4, 2.2],
      [92, 26, 76, 5, 2.4], [24, 30, 100, 6, 1.2]
    ].map(([dx, w, h, seed, p]) => ({ dx, w, h, seed, p }));

    // picture over the mantel: a little painting of the valley at dusk
    const hillA = new Path2D();
    hillA.moveTo(1074, 352); hillA.quadraticCurveTo(1118, 316, 1168, 338); hillA.quadraticCurveTo(1214, 356, 1246, 326);
    hillA.lineTo(1246, 394); hillA.lineTo(1074, 394); hillA.closePath();
    const hillB = new Path2D();
    hillB.moveTo(1074, 374); hillB.quadraticCurveTo(1150, 346, 1246, 378); hillB.lineTo(1246, 394); hillB.lineTo(1074, 394); hillB.closePath();

    const ticks = new Path2D();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, r0 = i % 3 ? 27 : 24;
      ticks.moveTo(1010 + Math.cos(a) * r0, 426 + Math.sin(a) * r0); ticks.lineTo(1010 + Math.cos(a) * 30, 426 + Math.sin(a) * 30);
    }

    // trailing plant at the end of the mantel
    const vines = Array.from({ length: 4 }, (_, i) => {
      const x0 = 1356 + i * 8, len = 60 + rand() * 70, pts = [];
      for (let k = 0; k <= 6; k++) pts.push([x0 + 10 + k * 3 + Math.sin(k + i) * 6, 462 + (k / 6) * len]);
      return pts;
    });

    // armchair seen from the side, facing the fire
    const chair = new Path2D();
    chair.moveTo(1610, 452);
    chair.quadraticCurveTo(1540, 430, 1506, 470); chair.quadraticCurveTo(1488, 500, 1490, 560);
    chair.lineTo(1492, 636); chair.lineTo(1412, 640);
    chair.quadraticCurveTo(1356, 640, 1352, 676); chair.quadraticCurveTo(1350, 712, 1380, 716);
    chair.lineTo(1382, 864); chair.lineTo(1392, 900); chair.lineTo(1610, 900); chair.closePath();
    const rim = new Path2D();
    rim.moveTo(1566, 440);
    rim.quadraticCurveTo(1540, 430, 1506, 470); rim.quadraticCurveTo(1488, 500, 1490, 560);
    rim.lineTo(1492, 636); rim.lineTo(1412, 640);
    rim.quadraticCurveTo(1356, 640, 1352, 676); rim.quadraticCurveTo(1350, 712, 1380, 716);
    rim.lineTo(1382, 864);

    return {
      side, sideLow, curtain, winFrame: poly(sideQuad(34, 198, 156, 536)), winGlass: poly(winGlassPts), winBars,
      winSill: poly([[24, sideY(24, 536)], [206, sideY(206, 536)], [206, sideY(206, 550)], [24, sideY(24, 550)]]),
      hole, bricks, brickCols, open, surround, joints, floor, seams, books, panels, logs, coals, flames,
      hillA, hillB, ticks, vines, chair, rim,
      wStars: makeStars(rand, 22, 50, 92, 184, 400),
      wClouds: makeClouds(rand, 4, 20, 130, 220, 320).map(c => ({ ...c, w: c.w * 0.4, h: c.h * 0.6, v: c.v * 0.6 })),
      wHill1: ridgePath(3, 470, 70, 110, 600, 30, 210),
      wHill2: ridgePath(9, 512, 46, 80, 600, 30, 210),
      glass: makeGlass(rand, 8, 50, 100, 184, 540)
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, n = nightAt(s), wet = rainAt(s), r = st.round;
    const f = 1 - r;                                                           // fire strength this round
    const flick = 0.84 + 0.11 * noise(t * 5.3, 3) + 0.05 * noise(t * 13, 8);
    const L = lerp(0.58, 1, f) * flick;                                        // light from the fire

    // ---- ceiling and back wall ----
    g.fillStyle = '#1d120d'; g.fillRect(0, 0, VW, VH);
    const wall = g.createLinearGradient(0, 36, 0, FLOOR);
    wall.addColorStop(0, '#3d2720'); wall.addColorStop(1, '#2c1a13');
    g.fillStyle = wall; g.fillRect(CORNER, 36, VW - CORNER, FLOOR - 36);
    g.fillStyle = 'rgba(255,200,160,0.028)';
    for (let x = CORNER + 16; x < VW; x += 52) g.fillRect(x, 40, 22, 540);
    g.fillStyle = '#2c1b15'; g.fillRect(CORNER, 28, VW, 12);
    g.fillStyle = '#5a3a2b'; g.fillRect(CORNER, 40, VW, 2);
    // wood panels on the lower wall
    g.fillStyle = '#2a1912'; g.fillRect(CORNER, 584, VW, FLOOR - 584);
    g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = 3; g.stroke(S.panels);
    g.fillStyle = '#4a3024'; g.fillRect(CORNER, 576, VW, 9);
    g.fillStyle = '#6a4632'; g.fillRect(CORNER, 576, VW, 2);
    g.fillStyle = '#1e120c'; g.fillRect(CORNER, FLOOR - 16, VW, 16);

    // ---- left side wall with the window ----
    g.fillStyle = '#2b1a14'; g.fill(S.side);
    g.fillStyle = '#21140e'; g.fill(S.sideLow);
    g.fillStyle = '#1a100c'; g.fillRect(CORNER - 3, 36, 6, FLOOR - 36);   // the room corner
    g.fillStyle = '#2c1b15'; g.fill(S.winFrame);

    g.save();
    g.clip(S.winGlass);
    fillSky(g, SKY.map(k => ramp(k, s)), 80, 560, 30, 210);
    drawStars(g, S.wStars, t, span(s, 0.7, 0.95));
    const up = span(s, 0.72, 1);
    drawMoon(g, 132, lerp(480, 190, up), 15, '#f4ecd2', '#cfd8ff', up);
    drawClouds(g, S.wClouds, t, ramp(CLOUD, s), cloudAlpha(s));
    g.fillStyle = ramp(['#4e4c70', '#2a3558', '#131b37', '#17244c'], s); g.fill(S.wHill1);
    const near = ramp(['#30344f', '#1b2442', '#0c1326', '#0e1732'], s);
    g.fillStyle = near; g.fill(S.wHill2);
    if (n > 0.2) {                                                             // a far cottage window comes on
      g.fillStyle = rgba('#ffcf8a', span(n, 0.2, 0.5));
      g.fillRect(84, 500, 5, 4); g.fillRect(150, 492, 4, 4);
    }
    rain(g, t, wet, { x0: 40, y0: 80, x1: 200, y1: 560, n: 46, alpha: lerp(0.26, 0.4, n), len: 22 });
    g.fillStyle = 'rgba(150,180,230,0.05)'; g.fillRect(40, 80, 160, 480);
    drawGlass(g, S.glass, dt, wet);
    g.restore();
    g.strokeStyle = '#2c1b15'; g.lineWidth = 6; g.stroke(S.winBars);
    g.fillStyle = '#4a3024'; g.fill(S.winSill);
    // curtain beside the window
    g.fillStyle = '#5c2724'; g.fill(S.curtain);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(8, sideY(8, 150), 7, sideY(8, 590) - sideY(8, 150));
    g.fillRect(24, sideY(24, 150), 6, sideY(24, 590) - sideY(24, 150));

    // ---- tall bookshelf ----
    g.fillStyle = '#2c1b15'; g.fillRect(262, 116, 216, FLOOR - 116);
    g.fillStyle = '#3b271d'; g.fillRect(478, 120, 8, FLOOR - 120);            // side we can see
    g.fillStyle = '#170d09'; g.fillRect(276, 134, 188, 566);
    drawBooks(g, S.books);
    for (const base of [236, 352, 468, 584, 700]) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(276, base - 100, 188, 10);
      g.fillStyle = '#3d281e'; g.fillRect(270, base, 200, 14);
      g.fillStyle = '#5a3a2b'; g.fillRect(270, base, 200, 2);
    }
    g.fillStyle = '#4a3024'; g.fillRect(256, 110, 228, 12);

    // ---- chimney breast ----
    g.fillStyle = '#271812'; g.fillRect(950, 0, 420, FLOOR);
    S.bricks.forEach((p, i) => { g.fillStyle = S.brickCols[i]; g.fill(p); });
    g.fillStyle = '#1a0f0b'; g.fillRect(940, 0, 10, FLOOR);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(1370, 0, 16, FLOOR);

    // picture of the valley at dusk
    g.fillStyle = '#1f130e'; g.fillRect(1058, 234, 204, 176);
    g.fillStyle = '#a08050'; g.fillRect(1068, 244, 184, 156);
    const paint = g.createLinearGradient(0, 250, 0, 394);
    paint.addColorStop(0, '#6e5f86'); paint.addColorStop(0.6, '#d98f6f'); paint.addColorStop(1, '#f2b27a');
    g.fillStyle = paint; g.fillRect(1074, 250, 172, 144);
    g.fillStyle = '#fbe3b0'; g.beginPath(); g.arc(1196, 322, 12, 0, TAU); g.fill();
    g.fillStyle = '#4e4c70'; g.fill(S.hillA);
    g.fillStyle = '#30344f'; g.fill(S.hillB);
    g.fillRect(1104, 356, 18, 12);
    g.beginPath(); g.moveTo(1100, 357); g.lineTo(1113, 347); g.lineTo(1126, 357); g.fill();
    g.fillStyle = '#ffcf8a'; g.fillRect(1110, 360, 5, 5);

    // mantel shelf
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(950, 500, 420, 16);
    g.fillStyle = '#2c1b15';
    for (const x of [962, 1342]) { g.beginPath(); g.moveTo(x - 14, 500); g.lineTo(x + 14, 500); g.lineTo(x + 6, 548); g.lineTo(x - 6, 548); g.fill(); }
    g.fillStyle = '#5a3a2b'; g.fillRect(912, 462, 496, 9);
    g.fillStyle = '#3d281e'; g.fillRect(912, 470, 496, 30);
    g.fillStyle = '#7a5038'; g.fillRect(912, 470, 496, 2);

    // stone arch and the dark fire opening
    g.fillStyle = '#5e4f43'; g.fill(S.surround);
    g.strokeStyle = '#2f2620'; g.lineWidth = 3; g.stroke(S.joints);
    g.fillStyle = '#6e5e50'; g.beginPath(); g.moveTo(FX - 16, 548); g.lineTo(FX + 16, 548); g.lineTo(FX + 11, 588); g.lineTo(FX - 11, 588); g.fill();
    g.fillStyle = '#0d0605'; g.fill(S.open);

    g.save();
    g.clip(S.open);
    g.fillStyle = '#1a0d08'; g.fillRect(1084, 610, 152, 142);                 // back of the firebox
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
    g.beginPath();
    for (let y = 624; y < 752; y += 18) { g.moveTo(1084, y); g.lineTo(1236, y); }
    g.stroke();
    g.fillStyle = '#140a07'; g.beginPath(); g.moveTo(1040, FLOOR); g.lineTo(1280, FLOOR); g.lineTo(1236, 752); g.lineTo(1084, 752); g.fill();
    g.fillStyle = '#2a1209';
    for (const c of S.coals) { g.beginPath(); g.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, TAU); g.fill(); }
    const charK = 0.3 + 0.6 * r;
    for (const l of S.logs) {
      g.save(); g.translate(l.x, l.y); g.rotate(l.a);
      g.fillStyle = mix('#5a3a24', '#2c1a12', charK);
      g.beginPath(); g.roundRect(0, -l.r, l.len, l.r * 2, l.r); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(8, -l.r * 0.4); g.lineTo(l.len - 10, -l.r * 0.3); g.moveTo(12, l.r * 0.35); g.lineTo(l.len - 16, l.r * 0.45); g.stroke();
      g.fillStyle = mix('#a07048', '#3a2216', charK);
      g.beginPath(); g.ellipse(l.len - 3, 0, 5, l.r, 0, 0, TAU); g.fill();
      g.restore();
    }
    g.restore();

    // ---- floor ----
    const fl = g.createLinearGradient(0, FLOOR, 0, VH);
    fl.addColorStop(0, '#22140d'); fl.addColorStop(1, '#3a2318');
    g.fillStyle = fl; g.fill(S.floor);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; g.stroke(S.seams);

    // rug
    g.fillStyle = '#5e2622'; g.beginPath(); g.ellipse(860, 846, 440, 48, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(192,160,98,0.55)'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(860, 846, 404, 40, 0, 0, TAU); g.stroke();
    g.fillStyle = '#74302b'; g.beginPath(); g.ellipse(860, 846, 330, 30, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(192,160,98,0.4)'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(860, 846, 150, 14, 0, 0, TAU); g.stroke();

    // hearth slab
    g.fillStyle = '#4c3e35'; g.beginPath(); g.moveTo(992, FLOOR - 2); g.lineTo(1328, FLOOR - 2); g.lineTo(1346, 798); g.lineTo(974, 798); g.fill();
    g.fillStyle = '#2e251f'; g.fillRect(974, 798, 372, 8);
    g.fillStyle = 'rgba(255,220,180,0.08)'; g.fillRect(992, FLOOR - 2, 336, 2);
    // fire guard bar
    g.fillStyle = '#0c0605'; g.fillRect(1062, 760, 196, 5);
    for (const x of [1070, 1250]) g.fillRect(x - 3, 748, 6, 22);

    // log basket
    g.fillStyle = '#2c1b15';
    for (const [x, y, rr] of [[884, 704, 12], [910, 698, 13], [934, 706, 11]]) { g.beginPath(); g.arc(x, y, rr + 2, 0, TAU); g.fill(); }
    g.fillStyle = '#8a6040';
    for (const [x, y, rr] of [[884, 704, 12], [910, 698, 13], [934, 706, 11]]) { g.beginPath(); g.arc(x, y, rr - 1, 0, TAU); g.fill(); }
    g.fillStyle = '#6a4a30'; g.beginPath(); g.moveTo(866, 712); g.lineTo(954, 712); g.lineTo(944, FLOOR + 6); g.lineTo(876, FLOOR + 6); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2;
    g.beginPath(); for (let y = 722; y < FLOOR + 4; y += 10) { g.moveTo(868 + (y - 712) * 0.2, y); g.lineTo(952 - (y - 712) * 0.2, y); } g.stroke();

    // ---- on the mantel ----
    // clock with the real time
    g.fillStyle = '#4a3024'; g.fillRect(984, 452, 52, 10);
    g.fillStyle = '#5a3a2b'; g.beginPath(); g.arc(1010, 426, 38, 0, TAU); g.fill();
    g.fillStyle = '#efe3c8'; g.beginPath(); g.arc(1010, 426, 31, 0, TAU); g.fill();
    g.strokeStyle = '#6a5040'; g.lineWidth = 2; g.stroke(S.ticks);
    const now = new Date(), hr = (now.getHours() % 12) + now.getMinutes() / 60, mn = now.getMinutes() + now.getSeconds() / 60;
    g.strokeStyle = '#2a1c14'; g.lineCap = 'round';
    for (const [a, len, w] of [[(hr / 12) * TAU, 16, 4], [(mn / 60) * TAU, 25, 2.6]]) {
      g.lineWidth = w;
      g.beginPath(); g.moveTo(1010, 426); g.lineTo(1010 + Math.sin(a) * len, 426 - Math.cos(a) * len); g.stroke();
    }
    g.fillStyle = '#2a1c14'; g.beginPath(); g.arc(1010, 426, 3, 0, TAU); g.fill();

    // three candles
    const CANDLES = [[1266, 74, 20], [1294, 52, 18], [1318, 34, 18]];
    for (const [x, h, w] of CANDLES) {
      g.fillStyle = '#ecdcbc'; g.beginPath(); g.roundRect(x - w / 2, 462 - h, w, h, [4, 4, 1, 1]); g.fill();
      g.fillStyle = 'rgba(120,80,40,0.22)'; g.fillRect(x + w / 2 - 5, 462 - h + 3, 5, h - 3);
      g.fillStyle = '#2a1c14'; g.fillRect(x - 1, 456 - h, 2, 7);
    }
    // trailing plant
    g.strokeStyle = '#35603f'; g.lineWidth = 2.5;
    for (const [i, v] of S.vines.entries()) {
      const sw = Math.sin(t * 0.6 + i) * 2;
      g.beginPath(); v.forEach(([x, y], k) => (k ? g.lineTo(x + sw * k / 6, y) : g.moveTo(x, y))); g.stroke();
      for (const [k, [x, y]] of v.entries()) if (k) {
        g.fillStyle = mix('#35603f', '#6a9a63', hash(i * 7 + k));
        g.beginPath(); g.ellipse(x + sw * k / 6 + (k % 2 ? 5 : -5), y, 7, 4, k % 2 ? 0.5 : -0.5, 0, TAU); g.fill();
      }
    }
    g.fillStyle = '#9a5637'; g.beginPath(); g.moveTo(1344, 436); g.lineTo(1386, 436); g.lineTo(1380, 462); g.lineTo(1350, 462); g.fill();
    g.fillStyle = '#b56a47'; g.fillRect(1340, 432, 50, 7);
    g.fillStyle = '#4f7d52';
    for (const [x, y, a] of [[1352, 424, -0.6], [1366, 418, 0.1], [1380, 424, 0.7]]) { g.beginPath(); g.ellipse(x, y, 6, 12, a, 0, TAU); g.fill(); }

    // ---- the evening dims the room; the window keeps its own light ----
    // One fill: light near the fire, darker the further away (left side and high up).
    // It also does the job of the vignette, so this scene skips vignette() and saves a full-screen fill.
    const base = 0.16 + 0.3 * n;
    const dim = g.createRadialGradient(FX, 720, 120, FX, 720, 1250);
    dim.addColorStop(0, rgba(DIM, base)); dim.addColorStop(0.4, rgba(DIM, base + 0.1)); dim.addColorStop(1, rgba(DIM, Math.min(0.92, base + 0.5)));
    g.fillStyle = dim;
    g.fill(S.hole, 'evenodd');

    // ---- the fire ----
    g.save();
    g.clip(S.open);
    const em = lerp(0.35, 1, span(r, 0, 0.9));                               // how hot the coals glow
    const op = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    for (const c of S.coals) {
      g.fillStyle = mix('#ff5a14', '#ffb050', c.k, em * (0.3 + 0.7 * noise(t * 0.9 + c.k * 20, c.k * 9)));
      g.beginPath(); g.ellipse(c.x, c.y - 1, c.rx * 0.75, c.ry * 0.7, 0, 0, TAU); g.fill();
    }
    g.lineCap = 'round';
    for (const l of S.logs) {
      g.save(); g.translate(l.x, l.y); g.rotate(l.a);
      g.strokeStyle = rgba('#ff7a2a', (0.15 + 0.6 * em) * (0.7 + 0.3 * noise(t * 1.3, l.len)));
      g.lineWidth = 2.2;
      g.beginPath();
      for (const [cx, cy] of l.cracks) { g.moveTo(cx, -l.r * 0.7); g.lineTo(cx + 5, cy); g.lineTo(cx + 1, l.r * 0.7); }
      g.stroke();
      g.restore();
    }
    g.globalCompositeOperation = op;
    for (const fm of S.flames) {
      const k = 0.14 + 0.86 * f ** fm.p;
      flame(g, FX + fm.dx, 746, fm.w * (0.55 + 0.45 * f), fm.h * k, t, fm.seed);
    }
    embers(g, t, FX, 742, 160, 190, 30, lerp(0.3, 1, f), 3);
    glow(g, FX, 756, 130, '#ff7a2a', 0.45 * em);
    g.restore();

    // ---- light from the fire and the candles ----
    glow(g, FX, 700, 780, '#ff7a30', (0.14 + 0.08 * n) * L);
    glow(g, FX, 690, 460, '#ffa050', 0.2 * L);
    glow(g, FX, 730, 170, '#ffcf80', 0.22 * L);
    g.save(); g.translate(FX, 812); g.scale(1, 0.2);
    glow(g, 0, 0, 640, '#ff9a48', 0.42 * L);
    g.restore();
    // small wall lamp between the shelf and the fire, turned low
    lightCone(g, 706, 214, 30, 110, -140, '#ffc890', 0.05);                  // negative height: the beam goes up
    lightCone(g, 706, 258, 44, 180, 180, '#ffc890', 0.06);
    glow(g, 706, 240, 240, '#ff9a50', 0.08 + 0.05 * n);
    g.fillStyle = '#4a3428'; g.fillRect(703, 252, 6, 20); g.fillRect(692, 268, 28, 6);
    g.fillStyle = '#c9a57a';
    g.beginPath(); g.moveTo(690, 214); g.lineTo(722, 214); g.lineTo(732, 256); g.lineTo(680, 256); g.fill();
    g.fillStyle = 'rgba(90,50,20,0.3)'; g.fillRect(680, 250, 52, 6);
    glow(g, 706, 236, 50, '#ffd8a0', 0.18);

    const cf = 0.85 + 0.15 * noise(t * 6, 11);
    glow(g, 1292, 400, 280, '#ff9648', 0.13 * cf);
    for (const [i, [x, h]] of CANDLES.entries()) {
      flame(g, x, 456 - h, 9, 24, t, 20 + i);
      glow(g, x, 446 - h, 44, '#ffdca8', 0.4 * cf);
    }
    g.save(); g.translate(150, 852); g.scale(1, 0.18);                       // cool light from the window on the floor
    glow(g, 0, 0, 260, '#8fa6d8', 0.12 * (1 - 0.6 * n));
    g.restore();
    if (st.mode !== 'focus') glow(g, 800, 760, 900, '#ffb070', 0.08);       // breaks feel a little warmer

    // ---- armchair in front, lit along its edge by the fire ----
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(1500, 896, 160, 14, 0, 0, TAU); g.fill();
    g.fillStyle = '#150c09'; g.fill(S.chair);
    g.save();
    g.clip(S.chair);
    g.fillStyle = rgba('#ff8a40', 0.05 * L); g.fillRect(1380, 700, 120, 200);
    g.strokeStyle = rgba('#ff9a50', 0.14 * L); g.lineWidth = 30; g.stroke(S.rim);
    g.strokeStyle = rgba('#ffb470', 0.75 * L); g.lineWidth = 6; g.stroke(S.rim);
    g.restore();
  }
};

// =====================================================================
// Attic nook: under the slanted roof, facing a big skylight.
// Round object: the moon crosses the skylight from left to right.
// While it rains the moon is a soft glow behind the clouds; after, the moon itself.
// =====================================================================
// Simple camera: x right, y up, z away from us, in metres. 600 px focal length.
const P = (x, y, z) => [800 + (600 * x) / z, 450 - (600 * y) / z];
// A point on the roof slope. v = 0 where the roof meets the low wall, bigger v = higher and nearer.
const slope = (x, v) => P(x, -0.3 + 2.3 * v, 4 - 2.5 * v);
// A point d metres below the roof slope (into the room).
const under = (x, v, d) => P(x, -0.3 + 2.3 * v - 0.736 * d, 4 - 2.5 * v - 0.677 * d);
const KNEE = 495, AFLOOR = 675;      // screen y of the low wall top and of the floor line

export const attic = {
  id: 'attic', name: 'Attic nook', focus: [0.8, 0.45],

  setup(rand) {
    // roof boards: level seams, closer together toward the back
    const boardY = [];
    for (let v = 0; v < 0.84; v += 0.045) boardY.push(slope(0, v)[1]);
    const boardsAlt = new Path2D(), boardSeams = new Path2D();
    boardY.forEach((y, i) => {
      boardSeams.moveTo(0, y); boardSeams.lineTo(VW, y);
      if (i % 2 && i + 1 < boardY.length) boardsAlt.rect(0, boardY[i + 1], VW, y - boardY[i + 1]);
    });

    // rafters: a side face and an under face each
    const sides = new Path2D(), bottoms = new Path2D(), edges = new Path2D();
    const hw = 0.075, d = 0.17;
    for (const x of [-5.1, -3.75, -2.4, -1.05, 0.3, 2.95, 4.3]) {
      const xs = x > 0 ? x - hw : x + hw;
      addPoly(sides, [slope(xs, 0), slope(xs, 0.9), under(xs, 0.9, d), under(xs, 0, d)]);
      addPoly(bottoms, [under(x - hw, 0, d), under(x + hw, 0, d), under(x + hw, 0.9, d), under(x - hw, 0.9, d)]);
      edges.moveTo(...under(xs, 0, d)); edges.lineTo(...under(xs, 0.9, d));
    }

    // skylight: outer lining and the glass
    const O = [slope(0.32, 0.72), slope(2.93, 0.72), slope(2.93, 0.04), slope(0.32, 0.04)];
    const G = [slope(0.45, 0.66), slope(2.8, 0.66), slope(2.8, 0.1), slope(0.45, 0.1)];
    const lining = [0, 1, 2, 3].map(i => poly([O[i], O[(i + 1) % 4], G[(i + 1) % 4], G[i]]));
    const glassPath = poly(G);
    const bar = [slope(1.625, 0.66), slope(1.625, 0.1)];
    const hole = new Path2D();
    hole.rect(0, 0, VW, VH);
    addPoly(hole, G);
    // light from the skylight falling to the floor
    // two layers, one narrower, so the beam has soft edges
    const shaft = [poly([G[3], G[0], G[1], G[2], [1220, 880], [620, 880]]), poly([slope(0.8, 0.6), slope(2.4, 0.6), slope(2.4, 0.14), [1150, 870], [700, 870]])];

    // low wall boards and floor boards
    const wallSeams = new Path2D();
    for (let x = 22; x < VW; x += 46) { wallSeams.moveTo(x, KNEE + 10); wallSeams.lineTo(x, AFLOOR - 12); }
    const floorSeams = new Path2D();
    for (let x = -7; x <= 7; x += 0.3) { floorSeams.moveTo(800 + 150 * x, AFLOOR); floorSeams.lineTo(800 + 300 * x, VH); }
    for (const y of [700, 734, 780, 840]) {
      for (let x = 0; x < VW; x += 110 + 90 * rand()) { floorSeams.moveTo(x, y); floorSeams.lineTo(x + (x - 800) * 0.02, y + 5 + (y - AFLOOR) * 0.06); }
    }

    // low bookshelf on the left
    const books = [];
    shelfRow(rand, 372, 756, 626, 40, books);
    shelfRow(rand, 372, 756, 668, 36, books);

    const stack = [[1402, 110, 16, '#4f6d7a'], [1410, 96, 13, '#c0a062'], [1398, 104, 15, '#7a4f5e'], [1414, 88, 12, '#7d8a68']];

    return {
      boardsAlt, boardSeams, sides, bottoms, edges, lining, glassPath, G, bar, hole, shaft,
      wallSeams, floorSeams, books, stack,
      leaves: makeLeaves(rand, 9, 40, 70),
      stars: makeStars(rand, 70, 860, 130, 1590, 470),
      clouds: makeClouds(rand, 7, 820, 150, 1640, 430),
      glass: makeGlass(rand, 30, 880, 150, 1500, 460)
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, n = nightAt(s), wet = rainAt(s), r = st.round;
    const clear = span(s, 0.7, 0.9);

    // ---- roof slope ----
    const roof = g.createLinearGradient(0, 0, 0, KNEE);
    roof.addColorStop(0, '#2a1912'); roof.addColorStop(1, '#3d281e');
    g.fillStyle = roof; g.fillRect(0, 0, VW, KNEE);
    g.fillStyle = 'rgba(255,210,170,0.035)'; g.fill(S.boardsAlt);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.stroke(S.boardSeams);

    // ---- skylight ----
    ['#5a3b2b', '#3a251b', '#2a1a13', '#4a3024'].forEach((c, i) => { g.fillStyle = c; g.fill(S.lining[i]); });

    g.save();
    g.clip(S.glassPath);
    fillSky(g, [0, 1, 2].map(i => ramp(SKY[i], s)), 110, 470, 840, 1600);
    drawStars(g, S.stars, t, span(s, 0.7, 0.95));
    // the moon moves across with the round
    const mx = lerp(960, 1370, r), my = 262 - 34 * Math.sin(r * Math.PI);
    glow(g, mx, my, 170, '#cfd8ff', 0.42 * (1 - clear) * (1 - 0.4 * wet));
    glow(g, mx, my, 50, '#eef0ff', 0.25 * (1 - clear));
    drawMoon(g, mx, my, 30, '#f4ecd2', '#cfd8ff', clear);
    drawClouds(g, S.clouds, t, ramp(CLOUD, s), cloudAlpha(s));
    rain(g, t, wet, { x0: 840, y0: 100, x1: 1600, y1: 480, n: 150, alpha: lerp(0.24, 0.36, n), len: 18, slant: 0.08, speed: 1.3 });
    g.fillStyle = 'rgba(150,180,230,0.05)'; g.fillRect(840, 100, 760, 380);
    drawGlass(g, S.glass, dt, wet);
    g.fillStyle = 'rgba(255,255,255,0.035)';
    for (const [a, b] of [[1000, 70], [1060, 30], [1380, 110]]) {
      g.beginPath(); g.moveTo(a, 100); g.lineTo(a + b, 100); g.lineTo(a + b - 200, 480); g.lineTo(a - 200, 480); g.fill();
    }
    g.restore();
    g.strokeStyle = '#24150f'; g.lineWidth = 9; g.lineJoin = 'round'; g.stroke(S.glassPath);
    g.lineWidth = 8; g.beginPath(); g.moveTo(...S.bar[0]); g.lineTo(...S.bar[1]); g.stroke();
    g.strokeStyle = 'rgba(255,220,180,0.12)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(...S.G[3]); g.lineTo(...S.G[2]); g.stroke();

    // ---- rafters ----
    g.fillStyle = '#1d110c'; g.fill(S.sides);
    g.fillStyle = '#3a2418'; g.fill(S.bottoms);
    g.strokeStyle = 'rgba(255,200,150,0.12)'; g.lineWidth = 2; g.stroke(S.edges);

    // ---- low wall ----
    g.fillStyle = '#3d271d'; g.fillRect(0, KNEE, VW, AFLOOR - KNEE);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.stroke(S.wallSeams);
    g.fillStyle = '#2c1b15'; g.fillRect(0, KNEE - 16, VW, 26);
    g.fillStyle = '#5a3a2b'; g.fillRect(0, KNEE - 16, VW, 2);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, KNEE + 10, VW, 8);
    g.fillStyle = '#1e120c'; g.fillRect(0, AFLOOR - 13, VW, 13);

    // ---- floor ----
    const fl = g.createLinearGradient(0, AFLOOR, 0, VH);
    fl.addColorStop(0, '#2a1911'); fl.addColorStop(1, '#4a2e1f');
    g.fillStyle = fl; g.fillRect(0, AFLOOR, VW, VH - AFLOOR);
    g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = 1.5; g.stroke(S.floorSeams);

    // round rug
    g.fillStyle = '#5e2622'; g.beginPath(); g.ellipse(1060, 800, 390, 76, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(192,160,98,0.5)'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(1060, 800, 356, 66, 0, 0, TAU); g.stroke();
    g.fillStyle = '#74302b'; g.beginPath(); g.ellipse(1060, 800, 290, 52, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(192,160,98,0.35)'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(1060, 800, 170, 30, 0, 0, TAU); g.stroke();

    // low bookshelf
    g.fillStyle = '#2c1b15'; g.fillRect(358, 576, 412, AFLOOR - 576 + 4);
    g.fillStyle = '#170d09'; g.fillRect(370, 586, 388, 82);
    drawBooks(g, S.books);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(370, 586, 388, 8); g.fillRect(370, 630, 388, 6);
    g.fillStyle = '#3d281e'; g.fillRect(364, 626, 400, 6);
    g.fillStyle = '#5a3a2b'; g.fillRect(352, 570, 424, 10);
    g.fillStyle = '#7a5038'; g.fillRect(352, 570, 424, 2);
    drawPlant(g, S.leaves, 412, 532, t, 0.85);
    // two books lying on top
    g.fillStyle = '#7a4f5e'; g.fillRect(650, 552, 92, 18);
    g.fillStyle = '#c0a062'; g.fillRect(660, 538, 78, 14);
    g.fillStyle = 'rgba(255,245,225,0.55)'; g.fillRect(736, 554, 4, 14); g.fillRect(734, 540, 3, 10);

    // leaning pillow, floor cushion, blanket
    g.save(); g.translate(1332, 642); g.rotate(-0.12);
    g.fillStyle = '#d2a96c'; g.beginPath(); g.roundRect(-64, -58, 128, 116, 24); g.fill();
    g.strokeStyle = 'rgba(120,70,40,0.5)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-36, -30); g.lineTo(36, 30); g.moveTo(36, -30); g.lineTo(-36, 30); g.stroke();
    g.restore();
    g.fillStyle = '#3e2430'; g.beginPath(); g.roundRect(994, 754, 252, 46, 22); g.fill();
    g.save(); g.translate(1120, 756); g.scale(1, 0.34);
    g.fillStyle = '#5a3540'; g.beginPath(); g.roundRect(-126, -116, 252, 232, 80); g.fill();
    g.fillStyle = 'rgba(255,200,190,0.08)'; g.beginPath(); g.ellipse(-10, -30, 90, 60, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill();
    g.restore();
    g.fillStyle = '#7d8a68';
    g.beginPath(); g.moveTo(1188, 744); g.quadraticCurveTo(1250, 734, 1300, 752); g.lineTo(1322, 812); g.quadraticCurveTo(1250, 826, 1196, 810); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(240,235,210,0.3)'; g.lineWidth = 4;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(1192 + i * 2, 762 + i * 16); g.quadraticCurveTo(1252, 752 + i * 17, 1306 + i * 5, 768 + i * 16); g.stroke(); }

    // round cushion
    g.fillStyle = '#34505c'; g.beginPath(); g.ellipse(872, 812, 98, 30, 0, 0, TAU); g.fill();
    g.fillStyle = '#4f6d7a'; g.beginPath(); g.ellipse(872, 800, 96, 30, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(230,240,240,0.18)'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(872, 800, 60, 17, 0, 0, TAU); g.stroke();

    // stack of books on the floor, a jar candle on top
    let by = 772;
    for (const [x, w, h, c] of S.stack) {
      by -= h;
      g.fillStyle = c; g.beginPath(); g.roundRect(x, by, w, h, 3); g.fill();
      g.fillStyle = 'rgba(255,245,225,0.7)'; g.fillRect(x + w - 7, by + 3, 5, h - 6);
    }
    g.fillStyle = '#e8d6b4'; g.fillRect(1446, by - 26, 24, 26);
    g.fillStyle = 'rgba(200,150,100,0.35)'; g.fillRect(1443, by - 30, 30, 30);
    drawMug(g, 1330, 838, 0.8);

    // ---- beam across the top, nearest to us ----
    g.fillStyle = '#24150f'; g.fillRect(0, 0, VW, 56);
    g.fillStyle = '#3d281e'; g.fillRect(0, 56, VW, 40);
    g.fillStyle = 'rgba(255,200,150,0.1)'; g.fillRect(0, 54, VW, 2);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 22); g.lineTo(VW, 24); g.moveTo(0, 40); g.lineTo(VW, 38); g.stroke();

    // ---- the evening dims the room; the skylight keeps its own light ----
    g.fillStyle = rgba(DIM, 0.16 + 0.32 * n);
    g.fill(S.hole, 'evenodd');

    // sky light falling into the room
    const skyLight = mix(ramp(['#c9a6a0', '#7f8fbf', '#5a6a9a'], s), '#c4d2ff', clear);
    const shaftA = lerp(0.07, 0.035, span(s, 0.15, 0.5)) + 0.06 * clear;
    const sh = g.createLinearGradient(0, 140, 0, 880);
    sh.addColorStop(0, rgba(skyLight, shaftA * 0.5)); sh.addColorStop(0.45, rgba(skyLight, shaftA * 0.3)); sh.addColorStop(1, rgba(skyLight, 0));
    const op = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = sh; g.fill(S.shaft[0]); g.fill(S.shaft[1]);
    g.globalCompositeOperation = op;
    g.save(); g.translate(960, 820); g.scale(1, 0.22);
    glow(g, 0, 0, 380, skyLight, shaftA * 2.2);
    g.restore();

    // paper lantern on a cord, swaying a little
    const sway = (noise(t * 0.35, 4) - 0.5) * 0.12 + Math.sin(t * 0.9) * 0.01;
    const lx = 400 - 176 * Math.sin(sway), ly = 96 + 176 * Math.cos(sway);
    const lf = 0.92 + 0.08 * noise(t * 2, 6);
    g.save(); g.translate(400, 96); g.rotate(sway);
    g.strokeStyle = '#120a07'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 120); g.stroke();
    const paper = g.createRadialGradient(-8, 170, 6, 0, 176, 60);
    paper.addColorStop(0, '#fff3d6'); paper.addColorStop(0.6, '#f6c98a'); paper.addColorStop(1, '#d98a4a');
    g.fillStyle = paper; g.beginPath(); g.ellipse(0, 176, 54, 58, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(150,80,30,0.28)'; g.lineWidth = 1.5;
    g.beginPath();
    for (let k = -3; k <= 3; k++) { const yy = 176 + k * 15, rx = 54 * Math.sqrt(1 - (k * 15 / 58) ** 2); g.moveTo(-rx, yy); g.quadraticCurveTo(0, yy + 6, rx, yy); }
    g.stroke();
    g.fillStyle = '#2a1a12'; g.fillRect(-16, 114, 32, 8); g.fillRect(-14, 230, 28, 7);
    g.restore();
    glow(g, lx, ly, 540, '#ff9a48', (0.13 + 0.08 * n) * lf);
    glow(g, lx, ly, 130, '#ffe0b0', 0.4 * lf);
    g.save(); g.translate(lx + 160, 700); g.scale(1, 0.3);
    glow(g, 0, 0, 520, '#ffa050', 0.18 * lf);
    g.restore();

    // fairy lights under the beam and down one rafter
    for (let i = 0; i < 4; i++) stringLights(g, i * 400, 92, (i + 1) * 400, 92, 16, 5, t, { colors: WARM, seed: i * 5 });
    const [ax, ay] = under(-2.4, 0.72, 0.17), [bx, by2] = under(-2.4, 0.36, 0.17), [cx, cy] = under(-2.4, 0.04, 0.17);
    stringLights(g, ax, ay, bx, by2, 10, 4, t, { colors: WARM, seed: 21 });
    stringLights(g, bx, by2, cx, cy, 10, 4, t, { colors: WARM, seed: 26 });

    // jar candle on the book stack
    const jf = 0.85 + 0.15 * noise(t * 6, 13);
    flame(g, 1458, 692, 8, 20, t, 31);
    glow(g, 1458, 680, 230, '#ff9648', 0.15 * jf);
    glow(g, 1458, 684, 40, '#ffdca8', 0.4 * jf);

    steam(g, 1350, 790, t, 0.8, 70);
    if (st.mode !== 'focus') glow(g, 800, 760, 900, '#ffb070', 0.08);       // breaks feel a little warmer
    vignette(g, 0.5);
  }
};
