// Cozy scenes 4 to 7: "Greenhouse", "Bookshop", "Snowed in" and "Tea at night".
// The same quiet evening as the other Cozy scenes, in four more places.
// The session clock (st.session) takes each one from dusk to night, the round clock (st.round)
// runs one small story, and breaks (st.mode !== 'focus') feel a little warmer.

import {
  VW, VH, TAU, lerp, clamp, span, noise, hash, mix, rgba, ramp, fillSky, glow, vignette, lightCone,
  makeStars, drawStars, drawMoon, makeClouds, drawClouds, ridgeY, ridgePath, pinesPath, makeTree,
  rain, makeGlass, drawGlass, flame, steam
} from './kit.js';

// Story helpers, the same values as in cozy.js and cozy-more.js.
const SKY = [
  ['#2a3a63', '#16203f', '#0a1022', '#060a1a'],
  ['#6e5f86', '#2c3c66', '#121a33', '#0c1430'],
  ['#d98f6f', '#56608c', '#1c2744', '#152246'],
  ['#f2b27a', '#8a7a95', '#263352', '#1e2f5a']
];
const CLOUD = ['#5b5273', '#2d3555', '#171e38', '#202b4e'];
const nightAt = s => span(s, 0.05, 0.55);
const DIM = '#0b0612';
const BOOK = ['#4f6d7a', '#c0a062', '#7a4f5e', '#7d8a68', '#a9492f', '#d2a96c', '#3e5a6e', '#8a5a3c', '#5a3540'];

// ---------- small local helpers ----------
function addPoly(p, pts) {
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}
const poly = pts => addPoly(new Path2D(), pts);
function oval(g, x, y, rx, ry, a = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, TAU); g.fill(); }
// A flat pool of light on a floor or a table top.
function pool(g, x, y, r, color, a, flat = 0.25) {
  g.save(); g.translate(x, y); g.scale(1, flat);
  glow(g, 0, 0, r, color, a);
  g.restore();
}
const warmBreak = (g, st) => { if (st.mode !== 'focus') glow(g, 800, 760, 900, '#ffb070', 0.08); };   // breaks feel a little warmer

// One shelf row of books (same idea as in cozy-more.js).
function shelfRow(rand, x0, x1, base, maxH, out) {
  const pick = () => BOOK[Math.floor(rand() * BOOK.length)];
  let x = x0;
  while (x < x1) {
    const r = rand();
    if (r < 0.07) { x += 10 + rand() * 16; continue; }
    if (r < 0.15 && x1 - x > 64) {
      let y = base;
      for (let k = 0, n = 2 + Math.floor(rand() * 3); k < n; k++) {
        const h = 9 + rand() * 5;
        y -= h;
        out.push({ x: x + rand() * 6, y, w: 46 + rand() * 12, h, c: pick(), flat: true });
      }
      x += 66;
      continue;
    }
    const w = 10 + rand() * 13, h = maxH * (0.62 + rand() * 0.36);
    if (x + w > x1) break;
    out.push({ x, y: base - h, w, h, c: pick(), band: rand() });
    x += w + 0.8;
  }
  return out;
}
function drawBooks(g, books) {
  for (const b of books) {
    g.fillStyle = b.c;
    g.fillRect(b.x, b.y, b.w, b.h);
    if (b.flat) {
      g.fillStyle = 'rgba(255,245,225,0.5)'; g.fillRect(b.x + b.w - 5, b.y + 2, 4, b.h - 4);
      continue;
    }
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(b.x + b.w - 2.5, b.y, 2.5, b.h);
    if (b.band > 0.35) {
      g.fillStyle = 'rgba(255,232,190,0.24)';
      g.fillRect(b.x + 1, b.y + 7, b.w - 3.5, 3); g.fillRect(b.x + 1, b.y + b.h - 12, b.w - 3.5, 3);
    }
  }
}

// =====================================================================
// Greenhouse: an old glass house at the end of the garden, seen down its middle path.
// Session: rainy dusk to night, the lanterns come on one by one from the far end,
// and mist slowly fogs the glass. Round: a moonflower on the near bench opens.
// =====================================================================
// Camera: x right, y up, z away from us, in metres. Eyes 1.5 m above the floor.
const GP = (x, y, z) => [800 + (640 * x) / z, 440 - (640 * y) / z];
const GW = 2.4, GE = 0.9, GR = 1.9, GF = -1.5, GK = -0.25, GB = -0.6, GZ0 = 0.9, GZ1 = 11;
const roofAt = x => GE + ((GW - Math.abs(x)) / GW) * (GR - GE);
const wpoly = (pts, p = new Path2D()) => addPoly(p, pts.map(q => GP(q[0], q[1], q[2])));
const ghRain = s => lerp(0.45, 0.9, span(s, 0, 0.45)) * (1 - 0.45 * span(s, 0.72, 1));

// A monstera leaf, 1 unit long along +x, with the cuts in its sides.
function monsteraPath() {
  const p = new Path2D(), N = 80;
  const w = u => 0.42 * Math.sin(Math.PI * (0.1 + 0.9 * u)) ** 0.7;
  // one side of the leaf, base to tip; each cut is a thin notch that leans back toward the stem
  const side = (sgn, cuts) => {
    const pts = [];
    let next = 0;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      if (next < cuts.length && u >= cuts[next]) {
        const c = cuts[next++];
        pts.push([c - 0.012, sgn * w(c - 0.012)], [c - 0.07, sgn * w(c) * 0.14], [c + 0.012, sgn * w(c + 0.012)]);
      }
      pts.push([u, sgn * w(u)]);
    }
    return pts;
  };
  const top = side(-1, [0.3, 0.45, 0.59, 0.72, 0.84]), bot = side(1, [0.34, 0.49, 0.63, 0.76]);
  p.moveTo(0, 0);
  for (const [x, y] of top) p.lineTo(x, y);
  for (let i = bot.length - 1; i >= 0; i--) p.lineTo(bot[i][0], bot[i][1]);
  p.closePath();
  return p;
}

function drawPot(g, p, t) {
  const x = p.sx, y = p.sy, k = p.k, h = 0.17 * k, w = 0.095 * k, top = y - h;
  g.fillStyle = 'rgba(0,0,0,0.3)'; oval(g, x, y, w * 1.5, w * 0.32);
  g.fillStyle = p.pot;
  g.beginPath(); g.moveTo(x - w, top); g.lineTo(x + w, top); g.lineTo(x + w * 0.74, y); g.lineTo(x - w * 0.74, y); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.moveTo(x + w * 0.25, top); g.lineTo(x + w, top); g.lineTo(x + w * 0.74, y); g.lineTo(x + w * 0.15, y); g.fill();
  g.fillStyle = p.rim; g.fillRect(x - w * 1.12, top - 0.035 * k, w * 2.24, 0.04 * k);
  const sw = Math.sin(t * 0.5 + p.ph) * 0.035, by = top - 0.02 * k, L = p.leaves;
  g.lineCap = 'round';
  for (let i = 0; i < L.length; i++) {
    const l = L[i], a = l.a + sw * (1 + i * 0.1), ll = l.l * k, ca = Math.cos(a), sa = Math.sin(a);
    if (p.type === 'succ') {
      g.fillStyle = l.c; oval(g, x + ca * ll * 0.5, by + sa * ll * 0.5, ll * 0.55, ll * 0.24, a);
    } else if (p.type === 'tall') {
      const bw = 0.02 * k, x0 = x + (i - 2) * bw * 0.7;
      g.fillStyle = l.c;
      g.beginPath(); g.moveTo(x0 - bw, by);
      g.quadraticCurveTo(x0 + ca * ll * 0.5 - bw, by + sa * ll * 0.5, x0 + ca * ll, by + sa * ll);
      g.quadraticCurveTo(x0 + ca * ll * 0.5 + bw, by + sa * ll * 0.5, x0 + bw, by); g.fill();
    } else if (p.type === 'fern') {
      const ex = x + ca * ll * 1.15, ey = by - ll * (0.55 - 0.5 * Math.abs(ca));
      g.strokeStyle = l.c2; g.lineWidth = 0.07 * k;
      g.beginPath(); g.moveTo(x, by); g.quadraticCurveTo(x + ca * ll * 0.45, by - ll * 0.85, ex, ey); g.stroke();
      g.strokeStyle = l.c; g.lineWidth = 0.014 * k; g.stroke();
    } else {
      g.strokeStyle = l.c; g.lineWidth = (p.type === 'flower' ? 0.035 : 0.05) * k;
      g.beginPath(); g.moveTo(x, by); g.quadraticCurveTo(x + ca * ll * 0.4, by + sa * ll * 0.9, x + ca * ll, by + sa * ll); g.stroke();
      if (p.type === 'flower' && i % 2 === 0) {
        g.fillStyle = p.bloom; const fr = 0.022 * k, fx = x + ca * ll, fy = by + sa * ll - fr;
        g.beginPath(); g.moveTo(fx + fr, fy); g.arc(fx, fy, fr, 0, TAU); g.moveTo(fx + fr * 2.2, fy + fr * 0.6); g.arc(fx + fr * 1.2, fy + fr * 0.6, fr, 0, TAU);
        g.moveTo(fx + fr * 0.6, fy - fr); g.arc(fx - fr * 0.4, fy - fr, fr, 0, TAU); g.fill();
      }
    }
  }
}

function drawLantern(g, L, t, on) {
  const ang = Math.sin(t * 0.45 + L.ph) * 0.02 + (noise(t * 0.25, L.ph) - 0.5) * 0.03;
  const u = L.s * 0.075, hh = L.s * 0.22, y0 = L.len;
  g.save(); g.translate(L.ax, L.ay); g.rotate(ang);
  g.strokeStyle = '#120a07'; g.lineWidth = Math.max(1, L.s * 0.006);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, y0); g.stroke();
  g.fillStyle = on > 0.01 ? mix('#3a3430', '#ffd08a', on) : 'rgba(120,140,150,0.28)';
  g.fillRect(-u, y0 + hh * 0.2, u * 2, hh * 0.66);
  if (on > 0.01) flame(g, 0, y0 + hh * 0.78, u * 0.55, hh * 0.36 * (0.5 + 0.5 * on), t, L.seed);
  g.strokeStyle = '#1a110c'; g.lineWidth = Math.max(1.2, u * 0.14);
  g.strokeRect(-u, y0 + hh * 0.2, u * 2, hh * 0.66);
  g.fillStyle = '#1a110c';
  g.beginPath(); g.moveTo(-u * 1.35, y0 + hh * 0.22); g.lineTo(-u * 0.3, y0); g.lineTo(u * 0.3, y0); g.lineTo(u * 1.35, y0 + hh * 0.22); g.fill();
  g.fillRect(-u * 1.15, y0 + hh * 0.84, u * 2.3, hh * 0.1);
  g.restore();
  L.cx = L.ax - Math.sin(ang) * (y0 + hh * 0.55);
  L.cy = L.ay + Math.cos(ang) * (y0 + hh * 0.55);
}

export const greenhouse = {
  id: 'greenhouse', name: 'Rainy greenhouse', focus: [0.5, 0.45],

  setup(rand) {
    // (no path for the glass: the garden, rain and drops are painted first, and the house covers what is not glass)
    // the iron frame: posts and rafters, rails along the length, the far wall bars
    const frame = new Path2D();
    for (let z = 1.3; z < GZ1; z += 1.25) {
      const d = 0.035 + 0.012 * z;
      for (const sx of [-1, 1]) {
        wpoly([[sx * GW, GK, z], [sx * GW, GE, z], [sx * GW, GE, z + d], [sx * GW, GK, z + d]], frame);
        wpoly([[sx * GW, GE, z], [0, GR, z], [0, GR, z + d], [sx * GW, GE, z + d]], frame);
      }
    }
    const rail = (x0, y0, x1, y1) => wpoly([[x0, y0, GZ0], [x1, y1, GZ0], [x1, y1, GZ1], [x0, y0, GZ1]], frame);
    for (const sx of [-1, 1]) {
      rail(sx * GW, GE - 0.08, sx * GW, GE + 0.02);
      rail(sx * GW, 0.3, sx * GW, 0.35);
      rail(sx * GW, GK, sx * GW, GK + 0.06);
      rail(sx * 1.25, roofAt(1.25), sx * 1.12, roofAt(1.12));
    }
    rail(-0.07, GR - 0.02, 0.07, GR - 0.02);
    const fq = (x0, y0, x1, y1) => wpoly([[x0, y0, GZ1], [x1, y0, GZ1], [x1, y1, GZ1], [x0, y1, GZ1]], frame);
    for (const x of [-GW, -1.2, 1.15, GW - 0.05]) fq(x, GK, x + 0.05, roofAt(x));
    for (const x of [-0.6, 0.55]) fq(x, GF, x + 0.05, roofAt(x));
    fq(-0.6, 0.72, 0.6, 0.77); fq(-0.6, -0.4, 0.6, -0.36); fq(-0.02, -0.36, 0.02, 0.72);
    fq(-GW, 0.3, -0.6, 0.35); fq(0.6, 0.3, GW, 0.35);

    // brick walls under the glass
    const knee = new Path2D(), bricks = new Path2D();
    for (const sx of [-1, 1]) {
      wpoly([[sx * GW, GF, GZ0], [sx * GW, GK, GZ0], [sx * GW, GK, GZ1], [sx * GW, GF, GZ1]], knee);
      let c = 0;
      for (let y = GF + 0.075; y < GK; y += 0.075, c++) {
        bricks.moveTo(...GP(sx * GW, y, GZ0)); bricks.lineTo(...GP(sx * GW, y, GZ1));
        if (y > GB) for (let z = 1 + (c % 2) * 0.12; z < 6; z += 0.24) { bricks.moveTo(...GP(sx * GW, y, z)); bricks.lineTo(...GP(sx * GW, y + 0.075, z)); }
      }
    }
    wpoly([[-GW, GF, GZ1], [-0.6, GF, GZ1], [-0.6, GK, GZ1], [-GW, GK, GZ1]], knee);
    wpoly([[0.6, GF, GZ1], [GW, GF, GZ1], [GW, GK, GZ1], [0.6, GK, GZ1]], knee);

    // floor and the tiled middle path
    const floor = wpoly([[-GW, GF, GZ0], [GW, GF, GZ0], [GW, GF, GZ1], [-GW, GF, GZ1]]);
    const path = wpoly([[-0.85, GF, GZ0], [0.85, GF, GZ0], [0.85, GF, GZ1], [-0.85, GF, GZ1]]);
    const tiles = new Path2D(), joints = new Path2D(), zs = [];
    for (let z = GZ0; z < GZ1; z += 0.34) zs.push(z);
    for (let i = 0; i < 5; i++) for (let j = 0; j + 1 < zs.length; j++) {
      const x0 = -0.85 + i * 0.34;
      if (rand() < 0.3) wpoly([[x0, GF, zs[j]], [x0 + 0.34, GF, zs[j]], [x0 + 0.34, GF, zs[j + 1]], [x0, GF, zs[j + 1]]], tiles);
    }
    for (let i = 0; i <= 5; i++) { joints.moveTo(...GP(-0.85 + i * 0.34, GF, GZ0)); joints.lineTo(...GP(-0.85 + i * 0.34, GF, GZ1)); }
    for (const z of zs) { joints.moveTo(...GP(-0.85, GF, z)); joints.lineTo(...GP(0.85, GF, z)); }

    // potting benches down both sides
    const benchTop = new Path2D(), benchFront = new Path2D(), benchUnder = new Path2D(), legs = new Path2D(), planks = new Path2D();
    const BZ0 = 1.0, BZ1 = 10.4, BX = 1.35;
    for (const sx of [-1, 1]) {
      wpoly([[sx * GW, GB, BZ0], [sx * BX, GB, BZ0], [sx * BX, GB, BZ1], [sx * GW, GB, BZ1]], benchTop);
      wpoly([[sx * BX, GB, BZ0], [sx * BX, GB, BZ1], [sx * BX, GB - 0.08, BZ1], [sx * BX, GB - 0.08, BZ0]], benchFront);
      wpoly([[sx * BX, GB - 0.08, BZ0], [sx * BX, GB - 0.08, BZ1], [sx * BX, GF, BZ1], [sx * BX, GF, BZ0]], benchUnder);
      for (const z of [1.5, 3.3, 5.3, 7.6, 10.2]) wpoly([[sx * BX, GB - 0.08, z], [sx * BX, GB - 0.08, z + 0.07], [sx * BX, GF, z + 0.07], [sx * BX, GF, z]], legs);
      for (const x of [1.6, 1.86, 2.12]) { planks.moveTo(...GP(sx * x, GB, BZ0)); planks.lineTo(...GP(sx * x, GB, BZ1)); }
    }

    // pots on the benches; colours fade toward the dark at the far end
    const pots = [], TYPES = ['leafy', 'fern', 'succ', 'flower', 'tall', 'leafy', 'fern', 'flower'];
    const BLOOM = ['#e2725b', '#d9566a', '#f0a07a', '#ffb46a', '#e88aa0'];
    for (const sx of [-1, 1]) for (let z = 1.25; z < 9.8; z += 0.42 + rand() * 0.5) {
      if (sx > 0 && z > 1.55 && z < 2.5) continue;                              // room for the moonflower
      const type = TYPES[Math.floor(rand() * TYPES.length)], sz = 0.8 + rand() * 0.5, x = sx * lerp(1.6, 2.15, rand());
      const far = span(z, 2, 10) * 0.7, n = type === 'succ' ? 8 : type === 'tall' ? 5 : 7;
      const spread = { leafy: 0.34, fern: 0.4, succ: 0.44, flower: 0.36, tall: 0.12 }[type];
      const len = { leafy: [0.16, 0.3], fern: [0.24, 0.36], succ: [0.06, 0.1], flower: [0.12, 0.22], tall: [0.3, 0.5] }[type];
      const [sxp, syp] = GP(x, GB, z);
      pots.push({
        sx: sxp, sy: syp, k: (640 / z) * sz, z, type, ph: rand() * TAU,
        pot: mix(mix('#9a5637', '#7a4a34', rand()), '#1a0f0c', far), rim: mix('#b56a47', '#1a0f0c', far),
        bloom: mix(BLOOM[Math.floor(rand() * BLOOM.length)], '#1a0f0c', far * 0.8),
        leaves: Array.from({ length: n }, (_, i) => {
          const c = mix(mix('#2f5a3a', '#6a9a63', rand()), '#1a0f0c', far);
          return { a: -Math.PI / 2 + (i - (n - 1) / 2) * spread + (rand() - 0.5) * 0.18, l: lerp(len[0], len[1], rand()), c, c2: rgba(c, 0.45) };
        })
      });
    }
    pots.sort((a, b) => b.z - a.z);

    // lanterns hang from the roof, three each side; the far ones light first
    const lanterns = [];
    [[5.0, 0.0], [3.5, 0.34], [2.3, 0.68]].forEach(([z, k0]) => [-1, 1].forEach((sx, j) => {
      const x = sx * 1.75, [ax, ay] = GP(x, roofAt(1.75), z), [, by] = GP(x, 0.62, z);
      lanterns.push({ ax, ay, len: by - ay, s: 640 / z, k: k0 + j * 0.16, ph: rand() * TAU, seed: 40 + lanterns.length, cx: ax, cy: by, pool: GP(x * 0.95, GB, z) });
    }));

    // trailing plants in hanging baskets
    const basket = (x, y, sc) => ({
      x, y, sc,
      vines: Array.from({ length: 7 }, (_, i) => {
        const x0 = x + (i - 3) * 15 * sc, len = (110 + rand() * 190) * sc;
        return Array.from({ length: 9 }, (_, k) => [x0 + Math.sin(k * 0.8 + i) * 9 * sc, y + 4 + (k / 8) * len, rand()]);
      })
    });

    return {
      frame, knee, bricks, floor, path, tiles, joints, benchTop, benchFront, benchUnder, legs, planks, pots, lanterns,
      baskets: [basket(1400, 128, 1), basket(452, 96, 0.72)],
      leaf: monsteraPath(),
      monstera: [
        { x: -30, y: 990, a: -0.95, l: 290 }, { x: -80, y: 900, a: -0.3, l: 250 },
        { x: 1630, y: 990, a: Math.PI + 0.95, l: 290 }, { x: 1680, y: 900, a: Math.PI + 0.3, l: 250 }
      ],
      clouds: makeClouds(rand, 7, 0, 20, 1600, 300),
      hills: ridgePath(5, 446, 60, 220),
      trees: pinesPath(rand, 80, -20, 1620, x => ridgeY(x, 5, 446, 60, 220), 16, 40),
      hedge: [-1, 1].map(sx => {
        const pts = [];
        for (let z = 0.9; z <= 18; z += 0.25) pts.push(GP(sx * 3.3, -0.15 + 0.32 * noise(z * 1.2, sx + 3), z));
        pts.push(GP(sx * 3.3, GF, 18), GP(sx * 3.3, GF, 0.9));
        return poly(pts);
      }),
      outPath: wpoly([[-0.6, GF, GZ1], [0.6, GF, GZ1], [0.45, GF, 40], [-0.45, GF, 40]]),
      drops: makeGlass(rand, 40, 0, 0, 1600, 560)
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, r = st.round, n = nightAt(s), wet = ghRain(s);

    // ---- the garden outside ----
    fillSky(g, SKY.map(k => ramp(k, s)), 0, 450);
    drawClouds(g, S.clouds, t, ramp(CLOUD, s), 0.75);
    g.fillStyle = ramp(['#262a3c', '#161b2c', '#0b0f1c', '#0b111f'], s); g.fillRect(0, 440, VW, VH - 440);
    g.fillStyle = ramp(['#3e4060', '#252c4a', '#11182e', '#131b36'], s); g.fill(S.hills);
    g.fillStyle = ramp(['#262b40', '#161d33', '#0a0f20', '#0b1226'], s); g.fill(S.trees);
    g.fillStyle = ramp(['#3a3a48', '#262838', '#14161f', '#161a24'], s); g.fill(S.outPath);
    g.fillStyle = ramp(['#1e2a26', '#141c1c', '#0a100f', '#0b1211'], s); g.fill(S.hedge[0]); g.fill(S.hedge[1]);
    // a garden lamp beyond the door comes on at dusk
    const gl = span(s, 0.08, 0.22), [lx, ly] = GP(0.9, 0.45, 19), [, lb] = GP(0.9, GF, 19);
    g.fillStyle = '#0a0d14'; g.fillRect(lx - 1, ly, 2.5, lb - ly);
    glow(g, lx, ly, 90, '#ffb46a', 0.16 * gl);
    glow(g, lx, ly, 14, '#ffe0b0', 0.8 * gl);
    rain(g, t, wet, { n: 300, alpha: lerp(0.2, 0.32, n), len: 24, slant: 0.1 });
    rain(g, t, wet, { n: 60, alpha: 0.4, len: 40, speed: 2, width: 1.7, slant: 0.1, seed: 31 });

    // ---- the glass: a faint tint, mist that builds up, drops ----
    // No clip needed: everything that is not glass is painted over these afterwards.
    g.fillStyle = rgba('#a9c2c8', lerp(0.05, 0.15, s)); g.fillRect(0, 0, VW, VH);
    drawGlass(g, S.drops, dt, wet * 0.9);

    // ---- the house ----
    g.fillStyle = '#21170f'; g.fill(S.frame);
    g.fillStyle = '#4a2a20'; g.fill(S.knee);
    g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = 1.4; g.stroke(S.bricks);
    const fl = g.createLinearGradient(0, 520, 0, VH);
    fl.addColorStop(0, '#140d09'); fl.addColorStop(1, '#2a1a12');
    g.fillStyle = fl; g.fill(S.floor);
    g.fillStyle = '#3e2c22'; g.fill(S.path);
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fill(S.tiles);
    g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 1.5; g.stroke(S.joints);
    g.fillStyle = 'rgba(8,5,4,0.78)'; g.fill(S.benchUnder);
    g.fillStyle = '#20140e'; g.fill(S.legs);
    g.fillStyle = '#4a3024'; g.fill(S.benchTop);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.5; g.stroke(S.planks);
    g.fillStyle = '#2c1b15'; g.fill(S.benchFront);
    for (const p of S.pots) drawPot(g, p, t);

    // the moonflower's pot and leaves on the near right bench (its flower comes later, it glows)
    const mfx = 1424, mfy = 632;
    drawPot(g, MOON_POT, t);
    const fx = mfx - 22 + Math.sin(t * 0.4) * 3, fy = 452;
    g.strokeStyle = '#2f5a3a'; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(mfx, mfy - 60); g.bezierCurveTo(mfx + 30, mfy - 120, mfx - 40, mfy - 140, fx, fy + 6); g.stroke();
    g.fillStyle = '#3f6e45';
    for (const [dx, dy, a] of [[24, -98, 0.5], [-14, -130, -0.7], [10, -150, 0.3]]) oval(g, mfx + dx, mfy + dy, 15, 9, a + Math.sin(t * 0.5 + dx) * 0.05);

    // a watering can and a stack of empty pots on the floor
    g.fillStyle = 'rgba(0,0,0,0.3)'; oval(g, 968, 842, 70, 10);
    g.fillStyle = '#8a5236';
    g.beginPath(); g.roundRect(930, 776, 74, 62, [10, 10, 4, 4]); g.fill();
    g.strokeStyle = '#8a5236'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(934, 820); g.lineTo(886, 770); g.stroke();
    g.beginPath(); g.arc(967, 776, 26, Math.PI, TAU); g.stroke();
    g.fillStyle = '#a8653f'; oval(g, 882, 766, 9, 5, -0.8);
    g.fillStyle = 'rgba(255,220,180,0.12)'; g.fillRect(936, 780, 8, 54);
    for (let i = 0; i < 3; i++) {
      const y = 812 - i * 14, w = 34;
      g.fillStyle = i % 2 ? '#8a4c32' : '#9a5637';
      g.beginPath(); g.moveTo(612 - w, y + 18); g.lineTo(612 + w, y + 18); g.lineTo(612 + w * 0.72, y - 14); g.lineTo(612 - w * 0.72, y - 14); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(612, 770, 34, 60);

    // hanging baskets near the camera
    for (const [bi, B] of S.baskets.entries()) {
      const sc = B.sc, sw = Math.sin(t * 0.35 + bi * 2) * 0.012 + (noise(t * 0.2, bi + 7) - 0.5) * 0.02;
      g.save(); g.translate(B.x, 0); g.rotate(sw); g.translate(-B.x, 0);
      g.strokeStyle = '#120a07'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(B.x, 0); g.lineTo(B.x - 58 * sc, B.y); g.moveTo(B.x, 0); g.lineTo(B.x + 58 * sc, B.y); g.moveTo(B.x, 0); g.lineTo(B.x + 6 * sc, B.y - 4); g.stroke();
      g.lineWidth = 2;
      for (let v = 0; v < B.vines.length; v++) {
        const vine = B.vines[v], vs = Math.sin(t * 0.6 + v * 1.3) * 5 * sc;
        g.strokeStyle = '#2a4a30';
        g.beginPath();
        for (let k = 0; k < vine.length; k++) { const [x, y] = vine[k]; k ? g.lineTo(x + (vs * k) / 8, y) : g.moveTo(x, y); }
        g.stroke();
        for (let k = 1; k < vine.length; k++) {
          const [x, y, c] = vine[k];
          g.fillStyle = c < 0.5 ? '#35603f' : '#4f7d52';
          oval(g, x + (vs * k) / 8 + (k % 2 ? 6 : -6) * sc, y, 8 * sc, 4.5 * sc, k % 2 ? 0.5 : -0.5);
        }
      }
      g.fillStyle = '#3a2416'; g.beginPath(); g.ellipse(B.x, B.y, 64 * sc, 44 * sc, 0, 0, Math.PI); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2;
      g.beginPath(); for (let k = 1; k < 4; k++) g.ellipse(B.x, B.y, 64 * sc, 11 * k * sc, 0, 0.2, Math.PI - 0.2); g.stroke();
      g.fillStyle = '#3d5a32'; oval(g, B.x, B.y, 66 * sc, 10 * sc);
      g.fillStyle = '#4f7d52';
      for (let k = 0; k < 6; k++) oval(g, B.x + (k - 2.5) * 20 * sc, B.y - 8 * sc - (k % 2) * 6 * sc, 14 * sc, 8 * sc, (k - 2.5) * 0.3);
      g.restore();
    }

    // big monstera leaves in the near corners
    for (let i = 0; i < S.monstera.length; i++) {
      const m = S.monstera[i], a = m.a + Math.sin(t * 0.35 + i * 1.7) * 0.014, bx = m.x + Math.cos(a) * 110, by = m.y + Math.sin(a) * 110;
      g.strokeStyle = '#132018'; g.lineWidth = 10;
      g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(bx, by); g.stroke();
      g.save(); g.translate(bx, by); g.rotate(a); g.scale(m.l, m.l);
      g.fillStyle = i % 2 ? '#13221a' : '#17291d'; g.fill(S.leaf);
      g.strokeStyle = rgba('#ffb46a', 0.04 + 0.05 * n); g.lineWidth = 2 / m.l; g.stroke(S.leaf);
      g.strokeStyle = '#26432e'; g.lineWidth = 3.5 / m.l;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0.96, 0); g.stroke();
      g.restore();
    }

    // ---- the evening dims the house ----
    g.fillStyle = rgba(DIM, 0.1 + 0.26 * n); g.fillRect(0, 0, VW, VH);

    // ---- lanterns ----
    const lit = lerp(-0.1, 1.04, span(s, 0.06, 0.62));
    glow(g, 800, 400, 720, '#ff9a48', 0.13 * clamp(lit));                    // all the lanterns together warm the house
    for (const L of S.lanterns) {
      const on = clamp((lit - L.k) / 0.08), f = 0.85 + 0.15 * noise(t * 5 + L.ph, L.seed);
      drawLantern(g, L, t, on);
      if (on <= 0.01) continue;
      glow(g, L.cx, L.cy, L.s * 0.85, '#ff9a48', 0.24 * on * f);
      glow(g, L.cx, L.cy, L.s * 0.3, '#ffe0b0', 0.5 * on * f);
      pool(g, L.pool[0], L.pool[1], L.s * 1.1, '#ffb46a', 0.32 * on * f, 0.3);
    }
    // a moth circles the nearest right lantern once it is lit
    const ML = S.lanterns[5], mOn = clamp((lit - ML.k) / 0.08);
    if (mOn > 0.5) {
      const ox = ML.cx + Math.sin(t * 1.3) * 46 + Math.sin(t * 0.47) * 18, oy = ML.cy + Math.cos(t * 1.7) * 26 - 10, fl2 = Math.abs(Math.sin(t * 22));
      g.fillStyle = rgba('#efe2cc', 0.85 * mOn);
      oval(g, ox - 3 * fl2, oy, 3.5 * fl2 + 0.6, 2.4, 0.3); oval(g, ox + 3 * fl2, oy, 3.5 * fl2 + 0.6, 2.4, -0.3);
    }

    // ---- the moonflower opens over the round ----
    const open = st.mode === 'focus' ? span(r, 0.04, 0.9) : 1 - 0.4 * span(r, 0, 1);
    glow(g, fx, fy, 70 + 50 * open, '#e8ecff', 0.08 + 0.2 * open);
    g.fillStyle = mix('#c9d6a8', '#fbf8ee', open);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2 + t * 0.01, d = 4 + 9 * open;
      oval(g, fx + Math.cos(a) * d, fy + Math.sin(a) * d * 0.8, 5 + 9 * open, 3 + 5 * open, a);
    }
    g.fillStyle = mix('#a8b878', '#f2e2a0', open); oval(g, fx, fy, 3 + 2 * open, 3 + 2 * open);

    // low mist drifting along the floor
    for (let i = 0; i < 2; i++) pool(g, 800 + (noise(t * 0.03, i * 3) - 0.5) * 1300, 650 + i * 80, 460, '#9aa8b8', 0.06, 0.3);
    warmBreak(g, st);
    vignette(g, 0.5);
  }
};
const MOON_POT = { sx: 1424, sy: 632, k: 320, type: 'leafy', ph: 1, pot: '#9a5637', rim: '#b56a47', leaves: [] };

// =====================================================================
// Bookshop: a small shop after closing. Tall shelves and a ladder, the front window onto the street.
// Session: the low sun through the window fades, the street and the shop lamps come on one by one,
// and the pile of books to put away gets smaller. Round: the tea cools. Breaks: the cat wakes a little.
// =====================================================================
const BFL = 716;                                      // where the back wall meets the floor
const sunAt = (x, y) => [x - 200 - (542 - y) * 0.9, BFL + (542 - y) * 0.4];   // where sun through the window at (x, y) lands

function drawCat(g, x, y, t, awake) {
  const br = 1 + 0.035 * Math.sin(t * 1.25);
  g.save(); g.translate(x, y); g.scale(1, br);
  g.fillStyle = 'rgba(0,0,0,0.3)'; oval(g, 0, -2, 84, 8);
  g.fillStyle = '#b8743c'; oval(g, 0, -30, 76, 32);
  g.fillStyle = 'rgba(255,214,160,0.16)'; oval(g, -8, -46, 54, 11);
  g.strokeStyle = 'rgba(120,62,24,0.55)'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath();
  for (let k = -1; k <= 2; k++) { g.moveTo(k * 22 - 4, -60); g.quadraticCurveTo(k * 22 + 10, -50, k * 22 + 4, -36); }
  g.stroke();
  // head
  const hy = awake ? -40 : -26;
  g.fillStyle = '#b8743c';
  g.beginPath(); g.moveTo(-88, hy - 12); g.lineTo(-84, hy - 36); g.lineTo(-68, hy - 18); g.lineTo(-58, hy - 20); g.lineTo(-48, hy - 36); g.lineTo(-44, hy - 10); g.fill();
  g.fillStyle = '#d9967a';
  g.beginPath(); g.moveTo(-84, hy - 16); g.lineTo(-82, hy - 30); g.lineTo(-73, hy - 19); g.moveTo(-50, hy - 18); g.lineTo(-49, hy - 30); g.lineTo(-58, hy - 20); g.fill();
  g.fillStyle = '#b8743c'; oval(g, -66, hy, 27, 22);
  g.fillStyle = '#e6b07c'; oval(g, -70, hy + 9, 13, 8);
  g.fillStyle = '#b4584a'; oval(g, -70, hy + 4, 3, 2);
  g.strokeStyle = '#3a2014'; g.lineWidth = 2;
  if (awake) {
    g.fillStyle = '#2a1a10'; oval(g, -80, hy - 4, 4, 1.6); oval(g, -59, hy - 4, 4, 1.6);
  } else {
    g.beginPath(); g.arc(-80, hy - 6, 4.5, 0.3, Math.PI - 0.3); g.moveTo(-54.5, hy - 5); g.arc(-59, hy - 6, 4.5, 0.3, Math.PI - 0.3); g.stroke();
  }
  // paws and the tail round the front
  g.fillStyle = '#e6b07c'; oval(g, -40, -6, 15, 7); oval(g, -20, -5, 13, 6);
  const tw = awake ? Math.sin(t * 1.1) * 12 : Math.sin(t * 0.25) * 2;
  g.strokeStyle = '#a9662f'; g.lineWidth = 14;
  g.beginPath(); g.moveTo(64, -20); g.bezierCurveTo(96, 0, 40, 6, 0, 2); g.quadraticCurveTo(-30, 0, -46 + tw * 0.4, -10 - tw); g.stroke();
  g.restore();
}

export const bookshop = {
  id: 'bookshop', name: 'Old bookshop', focus: [0.5, 0.5],

  setup(rand) {
    const books = [];
    for (let i = 1; i <= 6; i++) shelfRow(rand, 62, 498, 58 + i * 118, 100, books);
    const low = [];
    shelfRow(rand, 574, 1026, 652, 50, low);
    shelfRow(rand, 574, 1026, 708, 50, low);

    // sunlight: a soft beam from the window, and the window's shape on the floor
    const cols = [1168, 1283, 1397, 1512], rows = [128, 266, 404, 542], patch = new Path2D();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const a = cols[i] + 5, b = cols[i + 1] - 5, c = rows[j] + 5, d = rows[j + 1] - 5;
      addPoly(patch, [sunAt(a, c), sunAt(b, c), sunAt(b, d), sunAt(a, d)]);
    }
    // two layers, the inner one narrower, so the beam has soft edges
    const beam = poly([[1168, 128], [1512, 128], [1512, 542], sunAt(1512, 542), sunAt(1512, 128), sunAt(1168, 128)]);
    const beam2 = poly([[1240, 190], [1450, 190], [1450, 480], sunAt(1450, 480), sunAt(1450, 190), sunAt(1240, 190)]);
    const noCounter = new Path2D(); noCounter.rect(0, 0, VW, VH); noCounter.rect(1000, 742, 600, 158);
    const hole = new Path2D(); hole.rect(0, 0, VW, VH); hole.rect(1168, 128, 344, 414);

    // the street across the road
    const houses = new Path2D(), wins = [];
    for (const [x0, x1, top, peak] of [[1150, 1292, 262, 222], [1292, 1430, 214, 176], [1430, 1540, 280, 246]]) {
      addPoly(houses, [[x0, 560], [x0, top], [(x0 + x1) / 2, peak], [x1, top], [x1, 560]]);
      for (let y = top + 22; y < 470; y += 72) for (let x = x0 + 20; x < x1 - 30; x += 48) wins.push({ x, y, k: rand() });
    }
    const floorSeams = new Path2D();
    for (let bx = -900; bx < 2600; bx += 64) {
      const x0 = 800 + ((bx - 800) * (BFL - 300)) / (VH - 300);
      floorSeams.moveTo(x0, BFL); floorSeams.lineTo(bx, VH);
    }
    for (const y of [740, 772, 812, 860]) for (let x = 0; x < VW; x += 90 + 90 * rand()) { floorSeams.moveTo(x, y); floorSeams.lineTo(x + (x - 800) * 0.03, y + 6 + (y - BFL) * 0.07); }
    const panels = new Path2D();
    for (const [a, b] of [[534, 560], [1040, 1600]]) for (let x = a + 10; x + 60 < b; x += 130) panels.rect(x, 580, Math.min(110, b - x - 20), 112);

    return {
      books, low, patch, beam, beam2, noCounter, hole, houses, wins, floorSeams, panels,
      clouds: makeClouds(rand, 4, 1150, 140, 1530, 230).map(c => ({ ...c, w: c.w * 0.5, h: c.h * 0.6, v: c.v * 0.5 })),
      canopy: Array.from({ length: 16 }, () => [1180 + (rand() - 0.5) * 140, 300 + (rand() - 0.5) * 120, 26 + rand() * 30, rand()]),
      stack: Array.from({ length: 7 }, (_, i) => ({ w: 70 + rand() * 24, h: 12 + rand() * 6, dx: (rand() - 0.5) * 10, c: BOOK[(i * 4 + 1) % BOOK.length] })),
      vines: Array.from({ length: 4 }, (_, i) => Array.from({ length: 7 }, (_, k) => [1004 + i * 7 + Math.sin(k + i) * 5, 590 + k * (12 + i * 3)])),
      motes: Array.from({ length: 80 }, () => [rand(), rand(), 0.004 + rand() * 0.01, rand() * TAU])
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, r = st.round, n = nightAt(s), sun = 1 - span(s, 0.02, 0.5);

    // ---- wall, ceiling, floor ----
    const wall = g.createLinearGradient(0, 0, 0, BFL);
    wall.addColorStop(0, '#3a2620'); wall.addColorStop(1, '#2c1b15');
    g.fillStyle = wall; g.fillRect(0, 0, VW, BFL);
    g.fillStyle = 'rgba(255,200,160,0.03)';
    for (let x = 540; x < VW; x += 44) g.fillRect(x, 36, 18, 530);
    g.fillStyle = '#1d120d'; g.fillRect(0, 0, VW, 26);
    g.fillStyle = '#3d281e'; g.fillRect(0, 26, VW, 10);
    g.fillStyle = '#2a1912'; g.fillRect(0, 566, VW, BFL - 566);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3; g.stroke(S.panels);
    g.fillStyle = '#4a3024'; g.fillRect(0, 558, VW, 9);
    g.fillStyle = '#6a4632'; g.fillRect(0, 558, VW, 2);
    const fl = g.createLinearGradient(0, BFL, 0, VH);
    fl.addColorStop(0, '#24150e'); fl.addColorStop(1, '#3e261a');
    g.fillStyle = fl; g.fillRect(0, BFL, VW, VH - BFL);
    g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = 1.5; g.stroke(S.floorSeams);
    g.fillStyle = '#1e120c'; g.fillRect(0, BFL - 12, VW, 12);

    // ---- the street through the window ----
    g.save();
    g.beginPath(); g.rect(1168, 128, 344, 414); g.clip();
    fillSky(g, [SKY[1], SKY[2], SKY[3]].map(k => ramp(k, s)), 128, 420, 1168, 1512);
    drawClouds(g, S.clouds, t, ramp(CLOUD, s), 0.6);
    const hc = ramp(['#5a4450', '#34304a', '#191a2e', '#181c32'], s);
    g.fillStyle = hc; g.fill(S.houses);
    const litW = lerp(0.04, 0.72, n);
    for (const w of S.wins) {
      const on = w.k < litW;
      g.fillStyle = on ? (w.k > 0.4 ? '#e8b070' : '#d89a5a') : mix(hc, '#000000', 0.3);
      g.fillRect(w.x, w.y, 16, 22);
      if (on) glow(g, w.x + 8, w.y + 11, 30, '#ffae5c', 0.16);
    }
    g.fillStyle = ramp(['#3a2e30', '#221e28', '#100e16', '#12121c'], s); g.fillRect(1168, 506, 344, 40);
    g.fillStyle = 'rgba(255,220,180,0.06)'; g.fillRect(1168, 506, 344, 2);
    // tree with autumn leaves, a few falling
    g.fillStyle = mix(hc, '#000000', 0.35); g.fillRect(1172, 330, 12, 180);
    g.beginPath(); g.moveTo(1178, 380); g.lineTo(1214, 330); g.lineTo(1218, 334); g.lineTo(1182, 392); g.fill();
    for (const [x, y, rr, c] of S.canopy) {
      g.fillStyle = mix(mix('#7a3a22', '#a8592e', c), hc, 0.25 + 0.5 * n);
      oval(g, x + Math.sin(t * 0.4 + c * 6) * 2, y, rr, rr * 0.8);
    }
    for (let i = 0; i < 12; i++) {
      const fall = hash(i * 1.7) + t * (0.045 + 0.035 * hash(i * 2.3)), ph = fall % 1, turn = Math.floor(fall);
      const x = 1110 + hash(i * 3.1 + turn * 7.7) * 200 + Math.sin(t * 0.9 + i) * 16 + ph * 60, y = 300 + ph * 220;
      g.globalAlpha = Math.min(1, (1 - ph) * 5, ph * 8);
      g.fillStyle = i % 3 ? '#b8622e' : '#d98a3a';
      oval(g, x, y, 5, 2.4, t * (0.8 + hash(i)) + i);
    }
    g.globalAlpha = 1;
    // street lamp
    const sl = span(s, 0.1, 0.24);
    g.fillStyle = '#0e0c12'; g.fillRect(1466, 300, 6, 220); g.fillRect(1456, 286, 26, 16);
    g.beginPath(); g.moveTo(1452, 288); g.lineTo(1469, 274); g.lineTo(1486, 288); g.fill();
    lightCone(g, 1469, 302, 20, 150, 210, '#ffd9a0', 0.14 * sl);
    glow(g, 1469, 296, 120, '#ffcf8a', 0.4 * sl);
    glow(g, 1469, 296, 16, '#fff4d8', 0.9 * sl);
    // the shop's own sign, hanging outside above the window
    const sa = Math.sin(t * 0.7) * 0.04 + (noise(t * 0.2, 9) - 0.5) * 0.06;
    g.fillStyle = '#120c0a'; g.fillRect(1420, 146, 92, 5);
    g.save(); g.translate(1450, 150); g.rotate(sa);
    g.strokeStyle = '#120c0a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-26, 0); g.lineTo(-26, 14); g.moveTo(26, 0); g.lineTo(26, 14); g.stroke();
    g.fillStyle = '#2c1b15'; g.fillRect(-36, 14, 72, 42);
    g.fillStyle = '#c0a062';
    g.beginPath(); g.moveTo(-16, 26); g.lineTo(-1, 30); g.lineTo(-1, 46); g.lineTo(-16, 42); g.moveTo(16, 26); g.lineTo(1, 30); g.lineTo(1, 46); g.lineTo(16, 42); g.fill();
    g.restore();
    g.fillStyle = 'rgba(160,180,220,0.05)'; g.fillRect(1168, 128, 344, 414);
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (const [a, b] of [[1250, 60], [1300, 24], [1460, 70]]) { g.beginPath(); g.moveTo(a, 128); g.lineTo(a + b, 128); g.lineTo(a + b - 160, 542); g.lineTo(a - 160, 542); g.fill(); }
    g.restore();

    // window frame and the display ledge
    g.fillStyle = '#2c1b15';
    g.fillRect(1150, 110, 380, 18); g.fillRect(1150, 110, 18, 450); g.fillRect(1512, 110, 18, 450);
    g.fillRect(1278, 128, 10, 414); g.fillRect(1392, 128, 10, 414); g.fillRect(1168, 261, 344, 10); g.fillRect(1168, 399, 344, 10);
    g.fillStyle = '#5a3a2b'; g.fillRect(1168, 128, 344, 2);
    g.fillStyle = '#4a3024'; g.fillRect(1136, 542, 408, 24);
    g.fillStyle = '#6a4632'; g.fillRect(1136, 542, 408, 3);
    for (const [x, w, h, c, a] of [[1190, 40, 56, '#3e5a6e', -0.12], [1236, 42, 60, '#a9492f', 0.04], [1420, 40, 54, '#c0a062', 0.1]]) {
      g.save(); g.translate(x + w / 2, 542); g.rotate(a);
      g.fillStyle = c; g.fillRect(-w / 2, -h, w, h);
      g.fillStyle = 'rgba(255,240,210,0.35)'; g.fillRect(-w / 2 + 6, -h + 10, w - 12, 3); g.fillRect(-w / 2 + 6, -h + 18, w - 20, 2);
      g.restore();
    }

    // ---- the pendulum clock between the shelves and the window ----
    g.fillStyle = '#24150f'; g.fillRect(1052, 150, 66, 290);
    g.beginPath(); g.moveTo(1044, 156); g.quadraticCurveTo(1085, 104, 1126, 156); g.fill();
    g.fillStyle = '#4a3024'; g.fillRect(1046, 210, 78, 8); g.fillRect(1046, 436, 78, 10);
    g.fillStyle = '#efe3c8'; oval(g, 1085, 180, 24, 24);
    g.fillStyle = '#120a07'; g.fillRect(1064, 226, 42, 200);
    const pa = Math.sin((t * Math.PI) / 1.1) * 0.1, pbx = 1085 + Math.sin(pa) * 160, pby = 230 + Math.cos(pa) * 160;
    g.strokeStyle = '#a07a40'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(1085, 230); g.lineTo(pbx, pby); g.stroke();
    g.fillStyle = '#c9a050'; oval(g, pbx, pby, 11, 11);
    g.fillStyle = 'rgba(255,240,200,0.5)'; oval(g, pbx - 3, pby - 3, 3, 3);
    g.fillStyle = 'rgba(255,255,255,0.04)'; g.beginPath(); g.moveTo(1066, 226); g.lineTo(1086, 226); g.lineTo(1066, 300); g.fill();
    const now = new Date(), hr = (now.getHours() % 12) + now.getMinutes() / 60, mn = now.getMinutes() + now.getSeconds() / 60;
    g.strokeStyle = '#2a1c14'; g.lineCap = 'round';
    for (const [a, len, w] of [[(hr / 12) * TAU, 12, 3], [(mn / 60) * TAU, 18, 2]]) {
      g.lineWidth = w; g.beginPath(); g.moveTo(1085, 180); g.lineTo(1085 + Math.sin(a) * len, 180 - Math.cos(a) * len); g.stroke();
    }

    // ---- the low shelf in the middle, a globe and a plant on it ----
    g.fillStyle = '#2c1b15'; g.fillRect(560, 590, 480, BFL - 590);
    g.fillStyle = '#170d09'; g.fillRect(570, 600, 460, 108);
    drawBooks(g, S.low);
    g.fillStyle = '#3d281e'; g.fillRect(566, 652, 468, 6);
    g.fillStyle = '#4a3024'; g.fillRect(552, 584, 496, 10);
    g.fillStyle = '#6a4632'; g.fillRect(552, 584, 496, 2);
    g.fillStyle = '#7a5a32'; g.fillRect(604, 570, 14, 14); g.fillRect(594, 580, 34, 5);
    g.fillStyle = '#3e5a6e'; oval(g, 611, 540, 28, 28);
    g.fillStyle = '#b09060'; oval(g, 602, 530, 11, 8, 0.4); oval(g, 620, 552, 8, 11, -0.2);
    g.strokeStyle = '#8a6a3a'; g.lineWidth = 2.5; g.beginPath(); g.arc(611, 540, 33, -2.2, 1.0); g.stroke();
    g.fillStyle = '#9a5637'; g.fillRect(990, 556, 30, 28);
    g.strokeStyle = '#35603f'; g.lineWidth = 2;
    for (const [i, v] of S.vines.entries()) {
      const sw = Math.sin(t * 0.5 + i) * 2;
      g.beginPath(); v.forEach(([x, y], k) => (k ? g.lineTo(x + (sw * k) / 6, y) : g.moveTo(x, y))); g.stroke();
      g.fillStyle = '#4f7d52';
      for (let k = 1; k < v.length; k++) oval(g, v[k][0] + (sw * k) / 6 + (k % 2 ? 5 : -5), v[k][1], 6, 3.5, k % 2 ? 0.5 : -0.5);
    }
    g.fillStyle = '#4f7d52'; for (const [dx, a] of [[-8, -0.5], [4, 0.1], [14, 0.6]]) oval(g, 1005 + dx, 548, 6, 11, a);

    // ---- the tall bookcase on the left, with its ladder ----
    g.fillStyle = 'rgba(0,0,0,0.3)'; oval(g, 290, 778, 280, 14);
    g.fillStyle = '#2c1b15'; g.fillRect(40, 40, 480, 736);
    g.fillStyle = '#3b271d'; g.fillRect(520, 46, 12, 728);
    g.fillStyle = '#170d09'; g.fillRect(58, 58, 444, 708);
    drawBooks(g, S.books);
    for (let i = 1; i <= 6; i++) {
      const y = 58 + i * 118;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(58, y - 118 + 10, 444, 10);
      g.fillStyle = '#3d281e'; g.fillRect(50, y, 460, 12);
      g.fillStyle = '#5a3a2b'; g.fillRect(50, y, 460, 2);
    }
    g.fillStyle = '#4a3024'; g.fillRect(30, 30, 500, 16);
    g.fillStyle = '#b08a4a'; g.fillRect(40, 64, 480, 4);
    g.lineCap = 'round';
    for (const [col, off] of [['rgba(0,0,0,0.32)', 16], ['#6a4632', 0]]) {
      g.strokeStyle = col; g.lineWidth = 11;
      g.beginPath(); g.moveTo(426 + off, 60); g.lineTo(546 + off, 892); g.moveTo(484 + off, 60); g.lineTo(612 + off, 892); g.stroke();
      g.lineWidth = 7; g.beginPath();
      for (let u = 0.08; u < 0.98; u += 0.1) { g.moveTo(426 + off + 120 * u, 60 + 832 * u); g.lineTo(484 + off + 128 * u, 60 + 832 * u); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,220,170,0.18)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(422, 60); g.lineTo(542, 892); g.stroke();

    // ---- the counter in front ----
    g.fillStyle = '#3d281e'; g.fillRect(1000, 750, 600, 150);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3;
    for (let x = 1030; x < VW; x += 150) g.strokeRect(x, 776, 120, 100);
    g.fillStyle = '#5a3a2b'; g.fillRect(990, 734, 610, 18);
    g.fillStyle = '#7a5038'; g.fillRect(990, 734, 610, 2);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(1000, 752, 600, 8);

    // reading lamp
    g.fillStyle = '#b08a4a'; oval(g, 1112, 734, 34, 7);
    g.fillRect(1108, 680, 8, 54);
    g.fillStyle = '#2f6a4a';
    g.beginPath(); g.moveTo(1056, 690); g.quadraticCurveTo(1060, 660, 1112, 658); g.quadraticCurveTo(1164, 660, 1168, 690); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(1070, 684); g.quadraticCurveTo(1076, 666, 1104, 663); g.lineTo(1100, 668); g.quadraticCurveTo(1080, 672, 1076, 686); g.fill();
    // tea
    g.fillStyle = '#e8d9c0'; oval(g, 1246, 734, 32, 6);
    g.strokeStyle = '#e8d9c0'; g.lineWidth = 5; g.beginPath(); g.arc(1270, 716, 9, -1.3, 1.3); g.stroke();
    g.fillStyle = '#e8d9c0'; g.beginPath(); g.roundRect(1226, 700, 42, 32, [3, 3, 12, 12]); g.fill();
    g.fillStyle = '#a9492f'; g.fillRect(1226, 708, 42, 5);
    g.fillStyle = '#5a3418'; oval(g, 1247, 701, 19, 4);
    // books still to put away
    const left = lerp(7, 1, span(s, 0.04, 0.96));
    let sy = 734;
    for (let i = 0; i < 7 && i < Math.ceil(left); i++) {
      const b = S.stack[i];
      sy -= b.h;
      g.globalAlpha = Math.min(1, left - i);
      g.fillStyle = b.c; g.fillRect(1510 + b.dx, sy, b.w, b.h);
      g.fillStyle = 'rgba(255,245,225,0.5)'; g.fillRect(1510 + b.dx + 4, sy + 3, 4, b.h - 6);
    }
    g.globalAlpha = 1;
    drawCat(g, 1380, 738, t, st.mode !== 'focus');

    // ---- the evening dims the shop; the window keeps its own light ----
    g.fillStyle = rgba(DIM, 0.12 + 0.3 * n); g.fill(S.hole, 'evenodd');

    // ---- sunlight through the window, fading ----
    if (sun > 0.01) {
      const sc = ramp(['#ffd08a', '#ffa86a', '#e2725b'], 1 - sun);
      g.save(); g.clip(S.noCounter, 'evenodd');
      const op = g.globalCompositeOperation;
      g.globalCompositeOperation = 'lighter';
      const bg = g.createLinearGradient(1340, 260, 760, 860);
      bg.addColorStop(0, rgba(sc, 0.07 * sun)); bg.addColorStop(1, rgba(sc, 0.015 * sun));
      g.fillStyle = bg; g.fill(S.beam); g.fill(S.beam2);
      g.fillStyle = rgba(sc, 0.16 * sun); g.fill(S.patch);
      g.globalCompositeOperation = op;
      g.restore();
    }
    // dust drifting in the light: in the sunbeam, then under the shop lamp
    const lampL = span(s, 0.14, 0.3), lampR = span(s, 0.34, 0.5);
    const op = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    for (const [clipPath, a, col, x0, y0, w, h] of [[S.beam, sun, '#ffe0b0', 600, 130, 920, 750], [null, lampL, '#ffe0b0', 560, 170, 170, 520]]) {
      if (a < 0.02) continue;
      g.save();
      if (clipPath) g.clip(clipPath);
      g.fillStyle = col;
      for (const [hx, hy, sp, ph] of S.motes) {
        const u = (hy + t * sp) % 1, tw = Math.sin(u * Math.PI);
        const x = x0 + hx * w + (noise(t * 0.06 + ph, hx * 9) - 0.5) * 70, y = y0 + u * h;
        g.globalAlpha = a * tw * (0.35 + 0.45 * Math.sin(t * 0.8 + ph) ** 2);
        g.fillRect(x, y, 2.2, 2.2);
      }
      g.restore();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = op;

    // ---- shop lamps ----
    for (const [x, len, on] of [[640, 120, lampL], [1340, 70, lampR]]) {
      g.strokeStyle = '#120a07'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, len); g.stroke();
      lightCone(g, x, len + 34, 60, 420, 640, '#ffd9a0', 0.07 * on);
      g.fillStyle = '#2e4a3c';
      g.beginPath(); g.moveTo(x - 8, len); g.lineTo(x + 8, len); g.lineTo(x + 40, len + 36); g.lineTo(x - 40, len + 36); g.fill();
      g.fillStyle = mix('#4a3a2a', '#fff0c8', on); oval(g, x, len + 36, 40, 6);
      glow(g, x, len + 40, 420, '#ff9a50', 0.14 * on);
      glow(g, x, len + 38, 70, '#ffe0b0', 0.45 * on);
    }
    pool(g, 640, 790, 420, '#ffb46a', 0.18 * lampL, 0.18);
    pool(g, 1340, 742, 300, '#ffb46a', 0.25 * lampR, 0.12);
    // the reading lamp is on all evening
    lightCone(g, 1112, 692, 100, 230, 46, '#ffe2a8', 0.2);
    pool(g, 1150, 742, 330, '#ffc27a', 0.3 + 0.1 * n, 0.12);
    glow(g, 1112, 700, 300, '#ffa860', 0.1 + 0.08 * n);
    steam(g, 1247, 698, t, 1 - span(r, 0.1, 0.85), 70);
    glow(g, 1360, 700, 140, '#ffb46a', 0.08);                                 // the cat in the lamplight
    warmBreak(g, st);
    vignette(g, 0.5);
  }
};

// =====================================================================
// Snowed in: a log cabin at night. Snow outside, a wood stove, a kettle, washing drying on a line.
// Session: snowy dusk to clear moonlit night, frost creeps over the glass,
// snow piles up on the sill outside, the oil lamp and a far cabin light come on.
// Round: the kettle comes slowly to the boil. Breaks: the dog's tail wags.
// =====================================================================
const CSKY = [
  ['#3a4a72', '#202a52', '#121a38', '#0a1028'],
  ['#6a7aa6', '#38487a', '#1c2a52', '#141f42'],
  ['#b0a8c8', '#6a6f9c', '#2c3a66', '#22305a']
];
const snowAt = s => lerp(0.4, 1, span(s, 0, 0.4)) * (1 - 0.8 * span(s, 0.66, 0.9));
const CG = { x0: 190, x1: 630, y0: 160, y1: 560 };                  // window glass

// Falling snow. Stateless like rain(): every flake comes from the clock.
function snow(g, t, amount, { x0, y0, x1, y1, n, size, speed, drift, wind = 0, color = '#f2f4ff', alpha = 0.8, seed = 0 }) {
  const count = Math.floor(n * clamp(amount));
  if (!count) return;
  const W = x1 - x0, H = y1 - y0 + 20;
  g.fillStyle = rgba(color, alpha);
  g.beginPath();
  for (let i = 0; i < count; i++) {
    const fall = hash(i * 1.37 + seed) + (t * speed * (0.7 + 0.6 * hash(i * 3.3 + seed))) / H, ph = fall % 1, turn = Math.floor(fall);
    const y = y0 - 10 + ph * H;
    const x = x0 - 30 + hash(i * 2.11 + turn * 7.7 + seed) * (W + 60) + Math.sin(t * (0.4 + hash(i + seed) * 0.6) + i) * drift + ph * wind;
    const rr = size * (0.6 + 0.7 * hash(i * 5.1 + seed));
    g.moveTo(x + rr, y); g.arc(x, y, rr, 0, TAU);
  }
  g.fill();
}

// Frost crystals for the four panes, drawn ahead into five layers.
// Layer k holds the crystals that grow in the k-th fifth of the session, so they can fade in one after another.
function makeFrost(rand, W, H, panes) {
  const N = 5, segs = Array.from({ length: N }, () => []);
  // A stem with short side twigs at a fixed angle, like a frost fern. Twigs get shorter toward the tip.
  const grow = (x, y, a, steps, born, reach, depth) => {
    const st = depth ? 5 : 3.5;
    for (let i = 0; i < steps; i++) {
      const nx = x + Math.cos(a) * st, ny = y + Math.sin(a) * st, b = born + (i * st) / reach;
      if (b >= 1) return;
      segs[Math.floor(b * N)].push([x, y, nx, ny]);
      if (depth > 0 && i > 1 && rand() < 0.7) {
        const len = Math.max(1, Math.round((steps - i) * 0.3 * (0.6 + rand() * 0.6)));
        grow(nx, ny, a + (i % 2 ? 1 : -1) * 1.0, len, b, reach, depth - 1);
      }
      x = nx; y = ny; a += (rand() - 0.5) * 0.18;
    }
  };
  for (const [px0, py0, px1, py1] of panes) {
    const reach = Math.min(px1 - px0, py1 - py0) * 0.5, cx = (px0 + px1) / 2, cy = (py0 + py1) / 2;
    for (let c = 0; c < 34; c++) {
      // start on the pane edge, mostly near a corner
      const corner = Math.floor(rand() * 4), along = rand() ** 2 * 0.7, onX = rand() < 0.5;
      const ex = corner % 2 ? px1 : px0, ey = corner < 2 ? py0 : py1;
      const x = onX ? lerp(ex, cx, along) : ex, y = onX ? ey : lerp(ey, cy, along);
      const a = Math.atan2(cy - y, cx - x) + (rand() - 0.5) * 1.3;
      grow(x, y, a, 8 + Math.floor(rand() * 22), along * 0.4 + rand() * 0.15, reach, 1);
    }
  }
  return segs.map(list => {
    const c = Object.assign(document.createElement('canvas'), { width: W * 1.5, height: H * 1.5 }), cg = c.getContext('2d');
    cg.scale(1.5, 1.5); cg.lineCap = 'round';
    const p = new Path2D();
    for (const [a, b, c2, d] of list) { p.moveTo(a, b); p.lineTo(c2, d); }
    cg.strokeStyle = 'rgba(220,232,250,0.045)'; cg.lineWidth = 8; cg.stroke(p);
    cg.strokeStyle = 'rgba(236,243,255,0.36)'; cg.lineWidth = 1; cg.stroke(p);
    return c;
  });
}

function drawDog(g, x, y, t, awake) {
  const br = 1 + 0.03 * Math.sin(t * 1.0);
  g.save(); g.translate(x, y); g.scale(1, br);
  g.fillStyle = 'rgba(0,0,0,0.3)'; oval(g, 0, -2, 120, 9);
  const wag = awake ? Math.sin(t * 2.4) * 0.35 : Math.sin(t * 0.3) * 0.03;
  g.save(); g.translate(92, -26); g.rotate(-0.5 + wag);
  g.strokeStyle = '#6e4428'; g.lineWidth = 12; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(30, -10, 48, 6); g.stroke();
  g.restore();
  g.fillStyle = '#8a5a3c'; oval(g, 10, -34, 96, 34);
  g.fillStyle = 'rgba(255,214,160,0.13)'; oval(g, 6, -52, 70, 11);
  g.fillStyle = '#7a4c30'; oval(g, 62, -22, 36, 22);
  g.fillStyle = '#e8d8c0'; oval(g, -52, -16, 26, 15);
  g.fillStyle = '#c89a6a'; oval(g, -96, -6, 26, 7); oval(g, -78, -4, 22, 6);
  const hy = awake ? -34 : -28;
  g.fillStyle = '#8a5a3c'; oval(g, -84, hy, 32, 23);
  g.fillStyle = '#c89a6a'; oval(g, -114, hy + 10, 21, 13);
  g.fillStyle = '#2a1a14'; oval(g, -131, hy + 5, 6, 4.5);
  g.fillStyle = '#5e3a24';
  g.beginPath(); g.moveTo(-76, hy - 20); g.quadraticCurveTo(-52, hy - 14, -58, hy + 20); g.quadraticCurveTo(-70, hy + 16, -82, hy - 12); g.fill();
  g.strokeStyle = '#2a1a14'; g.lineWidth = 2;
  if (awake) { g.fillStyle = '#1a100c'; oval(g, -96, hy - 6, 3.2, 3.2); }
  else { g.beginPath(); g.arc(-96, hy - 8, 5, 0.4, Math.PI - 0.4); g.stroke(); }
  g.restore();
}

export const cabin = {
  id: 'snowbound', name: 'Snowed in', focus: [0.5, 0.5],

  setup(rand) {
    // log wall: each shade is one path, so the whole wall is a few fills
    const logs = [new Path2D(), new Path2D(), new Path2D()], logHi = new Path2D(), logLo = new Path2D(), chink = new Path2D(), grain = new Path2D(), ends = new Path2D();
    for (let i = 0, y = 56; y < 742; i++, y += 50) {
      logs[i % 3].rect(0, y, VW, 50);
      logHi.rect(0, y + 4, VW, 9); logLo.rect(0, y + 36, VW, 11); chink.rect(0, y + 46, VW, 4);
      for (let x = rand() * 200; x < VW; x += 80 + rand() * 220) { grain.moveTo(x, y + 18 + rand() * 18); grain.lineTo(x + 40 + rand() * 90, y + 18 + rand() * 18); }
      ends.moveTo(42, y + 25); ends.arc(18, y + 25, 24, 0, TAU);
    }
    const hole = new Path2D(); hole.rect(0, 0, VW, VH); hole.rect(CG.x0, CG.y0, CG.x1 - CG.x0, CG.y1 - CG.y0);

    // stones behind the stove
    const stoneCols = ['#5e5048', '#6e5e50', '#4e4038', '#665648'], stones = stoneCols.map(() => new Path2D());
    for (let y = 330; y < 742; y += 34) for (let x = 1066 + (Math.floor(y / 34) % 2) * 22; x < 1384; x += 40 + rand() * 18) {
      const w = Math.min(36 + rand() * 18, 1388 - x);
      if (w > 10) stones[Math.floor(rand() * 4)].roundRect(x, y + 2, w, 29, 8);
    }
    // firewood stack, log ends facing us
    const woodEnds = new Path2D(), woodRings = new Path2D(), woodBark = new Path2D();
    for (const [row, y] of [[0, 748], [1, 706], [2, 664], [3, 624]]) for (let x = 1424 + (row % 2) * 20; x < 1600 - row * 14; x += 42) {
      const rr = 19 + rand() * 4;
      woodBark.moveTo(x + rr + 3, y); woodBark.arc(x, y, rr + 3, 0, TAU);
      woodEnds.moveTo(x + rr, y); woodEnds.arc(x, y, rr, 0, TAU);
      woodRings.moveTo(x + rr * 0.6, y); woodRings.arc(x, y, rr * 0.6, 0, TAU);
      woodRings.moveTo(x + rr * 0.25, y); woodRings.arc(x, y, rr * 0.25, 0, TAU);
    }
    // the washing on the line
    const sock = new Path2D();
    sock.moveTo(-9, 0); sock.lineTo(9, 0); sock.lineTo(9, 56); sock.quadraticCurveTo(10, 70, 26, 72); sock.lineTo(30, 72);
    sock.quadraticCurveTo(40, 80, 30, 88); sock.lineTo(6, 88); sock.quadraticCurveTo(-10, 88, -9, 70); sock.closePath();
    const mitten = new Path2D();
    mitten.roundRect(-14, 0, 28, 58, [3, 3, 14, 14]); mitten.ellipse(15, 28, 6, 12, -0.4, 0, TAU);
    const valance = new Path2D();
    valance.moveTo(156, 138); valance.lineTo(664, 138); valance.lineTo(664, 196);
    for (let i = 7; i >= 0; i--) valance.quadraticCurveTo(156 + (i + 0.5) * 63.5, 222, 156 + i * 63.5, 196);
    valance.closePath();
    const checks = new Path2D();
    for (let x = 156; x < 664; x += 22) checks.rect(x, 138, 11, 90);
    for (let y = 138; y < 230; y += 22) checks.rect(156, y, 508, 11);

    const yMid = x => ridgeY(x, 13, 468, 40, 90);
    return {
      logs, logHi, logLo, chink, grain, ends, hole, stoneCols, stones, woodEnds, woodRings, woodBark, sock, mitten, valance, checks,
      frost: makeFrost(rand, 440, 400, [[0, 0, 214, 194], [226, 0, 440, 194], [0, 206, 214, 400], [226, 206, 440, 400]]),
      stars: makeStars(rand, 50, 200, 168, 620, 340),
      clouds: makeClouds(rand, 4, 150, 170, 670, 300).map(c => ({ ...c, w: c.w * 0.6, h: c.h * 0.7, v: c.v * 0.5 })),
      mtn: ridgePath(7, 390, 120, 120, 600, 180, 640),
      mid: ridgePath(13, 468, 40, 90, 600, 180, 640),
      pines: pinesPath(rand, 28, 190, 640, yMid, 34, 84),
      drift: Array.from({ length: 23 }, (_, i) => 0.75 + 0.25 * Math.sin(i * 1.7 + rand() * 2)),
      ground: (() => { const p = new Path2D(); p.moveTo(180, 600); for (let x = 180; x <= 640; x += 20) p.lineTo(x, 506 + 10 * Math.sin(x * 0.02) + 6 * Math.sin(x * 0.053)); p.lineTo(640, 600); p.closePath(); return p; })()
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, r = st.round, n = nightAt(s), sn = snowAt(s), clear = span(s, 0.68, 0.92), focus = st.mode === 'focus';

    // ---- log walls and ceiling beam ----
    ['#4e321f', '#563824', '#4a2f1d'].forEach((c, i) => { g.fillStyle = c; g.fill(S.logs[i]); });
    g.fillStyle = 'rgba(255,210,160,0.07)'; g.fill(S.logHi);
    g.fillStyle = 'rgba(0,0,0,0.24)'; g.fill(S.logLo);
    g.fillStyle = '#7a6650'; g.fill(S.chink);
    g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 1.5; g.stroke(S.grain);
    g.fillStyle = '#8a6a48'; g.fill(S.ends);
    g.fillStyle = '#24150f'; g.fillRect(0, 0, VW, 56);
    g.fillStyle = '#3a2418'; g.fillRect(0, 44, VW, 12);
    g.fillStyle = 'rgba(255,210,160,0.08)'; g.fillRect(0, 44, VW, 2);

    // ---- outside ----
    g.save();
    g.beginPath(); g.rect(CG.x0, CG.y0, CG.x1 - CG.x0, CG.y1 - CG.y0); g.clip();
    fillSky(g, CSKY.map(k => ramp(k, s)), CG.y0, 480, CG.x0, CG.x1);
    drawStars(g, S.stars, t, clear);
    const up = span(s, 0.7, 1);
    drawMoon(g, 520, lerp(420, 236, up), 20, '#f4ecd2', '#cfd8ff', up);
    drawClouds(g, S.clouds, t, ramp(['#8a88a8', '#4a5480', '#222c50', '#2a3660'], s), 0.7 * (1 - clear));
    g.fillStyle = ramp(['#9a9cc0', '#6a72a0', '#2e3866', '#3c4a7c'], s); g.fill(S.mtn);
    const snowCol = ramp(['#d2d2e6', '#9aa2c8', '#4a5888', '#6a7cb0'], s);
    g.fillStyle = snowCol; g.fill(S.mid);
    g.fill(S.pines);
    g.save(); g.translate(0, 4);
    g.fillStyle = ramp(['#34404e', '#222c3c', '#0e1424', '#121c30'], s); g.fill(S.pines);
    g.restore();
    // the far cabin: its window lights up, smoke from the chimney
    const fc = ramp(['#3a3440', '#262636', '#12141e', '#161a28'], s);
    g.fillStyle = fc; g.fillRect(290, 470, 46, 28); g.fillRect(324, 452, 7, 16);
    g.fillStyle = snowCol; g.beginPath(); g.moveTo(284, 472); g.lineTo(313, 448); g.lineTo(342, 472); g.fill();
    const fw = span(n, 0.25, 0.55);
    g.fillStyle = mix(fc, '#ffcf8a', fw); g.fillRect(300, 480, 8, 8);
    if (fw > 0.02) glow(g, 304, 484, 26, '#ffae5c', 0.4 * fw);
    steam(g, 327, 450, t * 0.6, 0.6, 50);
    g.fillStyle = mix(snowCol, '#ffffff', 0.15); g.fill(S.ground);
    // fence
    g.fillStyle = ramp(['#4a3a34', '#2e2a30', '#14141c', '#181c26'], s);
    for (let x = 214; x < 640; x += 70) g.fillRect(x, 500, 7, 52);
    g.fillRect(190, 512, 440, 5); g.fillRect(190, 530, 440, 5);
    g.fillStyle = snowCol; for (let x = 214; x < 640; x += 70) oval(g, x + 3.5, 500, 7, 3.5);
    g.fillRect(190, 510, 440, 2);
    snow(g, t, sn, { x0: CG.x0, y0: CG.y0, x1: CG.x1, y1: CG.y1, n: 150, size: 1.3, speed: 26, drift: 10, wind: 30, alpha: 0.7 });
    snow(g, t, sn, { x0: CG.x0, y0: CG.y0, x1: CG.x1, y1: CG.y1, n: 60, size: 2.6, speed: 50, drift: 18, wind: 50, alpha: 0.85, seed: 17 });
    // snow piling up on the sill outside
    const ph = lerp(6, 46, span(s, 0, 0.9));
    g.fillStyle = mix(snowCol, '#ffffff', 0.3);
    g.beginPath(); g.moveTo(CG.x0, CG.y1);
    S.drift.forEach((m, i) => g.lineTo(CG.x0 + i * 20, CG.y1 - ph * m));
    g.lineTo(CG.x1, CG.y1); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(160,180,230,0.05)'; g.fillRect(CG.x0, CG.y0, 440, 400);
    // frost creeps in from the corners
    const fr = span(s, 0.03, 0.95) * 5;
    for (let k = 0; k < 5 && k < fr; k++) {
      g.globalAlpha = Math.min(1, fr - k);
      g.drawImage(S.frost[k], CG.x0, CG.y0, 440, 400);
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (const [a, b] of [[300, 50], [340, 20], [520, 60]]) { g.beginPath(); g.moveTo(a, CG.y0); g.lineTo(a + b, CG.y0); g.lineTo(a + b - 180, CG.y1); g.lineTo(a - 180, CG.y1); g.fill(); }
    g.restore();

    // window frame, sill and the checked valance
    g.fillStyle = '#3a2418';
    g.fillRect(170, 140, 480, 20); g.fillRect(170, 140, 20, 440); g.fillRect(630, 140, 20, 440);
    g.fillRect(404, 160, 12, 400); g.fillRect(190, 354, 440, 12);
    g.fillStyle = 'rgba(255,220,180,0.1)'; g.fillRect(190, 160, 440, 2); g.fillRect(190, 366, 440, 2);
    g.fillStyle = '#5a3a26'; g.fillRect(150, 574, 520, 18);
    g.fillStyle = '#7a5038'; g.fillRect(150, 574, 520, 2);
    g.fillStyle = '#3a2418'; g.fillRect(156, 592, 508, 10);
    g.fillStyle = '#8f3b2c'; g.fill(S.valance);
    g.save(); g.clip(S.valance);
    g.fillStyle = 'rgba(255,236,214,0.16)'; g.fill(S.checks);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(156, 138, 508, 10);
    g.restore();
    g.fillStyle = '#2c1b15'; g.fillRect(140, 132, 540, 7);

    // oil lamp and an enamel mug on the sill
    g.fillStyle = '#b08a4a'; oval(g, 252, 572, 26, 5); g.fillRect(244, 552, 16, 20);
    g.fillStyle = 'rgba(210,150,80,0.7)'; oval(g, 252, 546, 24, 13);
    g.fillStyle = '#b08a4a'; g.fillRect(240, 526, 24, 8);
    g.fillStyle = 'rgba(255,240,220,0.12)';
    g.beginPath(); g.moveTo(244, 526); g.bezierCurveTo(226, 500, 232, 470, 244, 452); g.lineTo(260, 452); g.bezierCurveTo(272, 470, 278, 500, 260, 526); g.fill();
    g.strokeStyle = 'rgba(255,240,220,0.22)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#e8e4da'; g.beginPath(); g.roundRect(572, 534, 40, 40, [2, 2, 8, 8]); g.fill();
    g.strokeStyle = '#e8e4da'; g.lineWidth = 5; g.beginPath(); g.arc(612, 552, 9, -1.2, 1.2); g.stroke();
    g.fillStyle = '#3e5a6e'; g.fillRect(572, 534, 40, 4);
    g.fillStyle = '#4a2a18'; oval(g, 592, 536, 18, 3.5);

    // ---- stove corner: stones, hearth, stove, pipe, kettle ----
    g.fillStyle = '#3a302a'; g.fillRect(1062, 330, 330, 412);
    S.stones.forEach((p, i) => { g.fillStyle = S.stoneCols[i]; g.fill(p); });
    g.fillStyle = '#4a4038'; g.beginPath(); g.moveTo(1040, 742); g.lineTo(1414, 742); g.lineTo(1430, 796); g.lineTo(1024, 796); g.fill();
    g.fillStyle = '#2e2622'; g.fillRect(1024, 796, 406, 8);
    g.fillStyle = 'rgba(255,220,180,0.08)'; g.fillRect(1040, 742, 374, 2);
    g.fillStyle = '#1c1818';
    g.fillRect(1214, 0, 32, 512);
    for (let y = 80; y < 500; y += 110) { g.fillStyle = '#2a2424'; g.fillRect(1210, y, 40, 8); }
    g.fillStyle = 'rgba(255,200,150,0.08)'; g.fillRect(1216, 0, 4, 512);
    g.fillStyle = '#141212'; for (const x of [1146, 1310]) g.fillRect(x, 716, 14, 54);
    g.fillStyle = '#1e1a1a'; g.beginPath(); g.roundRect(1130, 520, 200, 204, 10); g.fill();
    g.fillStyle = '#2a2626'; g.fillRect(1118, 506, 224, 16);
    g.fillStyle = 'rgba(255,220,190,0.1)'; g.fillRect(1118, 506, 224, 2);
    const door = new Path2D(); door.roundRect(1172, 566, 116, 116, [40, 40, 6, 6]);
    g.fillStyle = '#2e2828'; g.beginPath(); g.roundRect(1162, 556, 136, 136, [46, 46, 8, 8]); g.fill();
    g.fillStyle = '#120806'; g.fill(door);
    // the fire behind the stove's glass
    const flick = 0.84 + 0.11 * noise(t * 5.1, 3) + 0.05 * noise(t * 13, 8);
    g.save(); g.clip(door);
    g.fillStyle = '#3a1a0e'; g.fillRect(1180, 660, 100, 22);
    g.fillStyle = '#5a3420'; g.beginPath(); g.roundRect(1182, 652, 96, 14, 7); g.fill();
    flame(g, 1206, 664, 34, 72, t, 3); flame(g, 1246, 664, 38, 86, t, 5); flame(g, 1228, 666, 28, 54, t, 9);
    glow(g, 1230, 664, 70, '#ff7a2a', 0.5 * flick);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.beginPath(); g.moveTo(1180, 566); g.lineTo(1210, 566); g.lineTo(1180, 640); g.fill();
    g.restore();
    g.strokeStyle = '#2e2828'; g.lineWidth = 4;
    g.beginPath(); for (const x of [1200, 1230, 1260]) { g.moveTo(x, 576); g.lineTo(x, 682); } g.stroke();
    g.fillStyle = '#4a4040'; g.fillRect(1300, 612, 18, 8);
    // kettle
    const heat = focus ? r : 1 - r;
    const rattle = focus ? span(r, 0.85, 1) : 0, lidDy = -Math.abs(Math.sin(t * 24)) * 2.2 * rattle;
    g.fillStyle = '#9a5637';
    g.beginPath(); g.moveTo(1168, 506); g.bezierCurveTo(1160, 450, 1260, 450, 1252, 506); g.fill();
    g.strokeStyle = '#9a5637'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(1176, 492); g.quadraticCurveTo(1156, 480, 1146, 464); g.stroke();
    g.fillStyle = 'rgba(255,220,180,0.22)'; oval(g, 1188, 478, 7, 14, -0.4);
    g.fillStyle = '#7a4430'; oval(g, 1210, 462 + lidDy, 22, 5); oval(g, 1210, 456 + lidDy, 5, 4);
    g.strokeStyle = '#2a1c14'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(1180, 470); g.bezierCurveTo(1184, 420, 1236, 420, 1240, 470); g.stroke();

    // firewood
    g.fillStyle = '#3a2416'; g.fill(S.woodBark);
    g.fillStyle = '#b08058'; g.fill(S.woodEnds);
    g.strokeStyle = 'rgba(110,64,34,0.6)'; g.lineWidth = 1.5; g.stroke(S.woodRings);

    // the washing line over the stove
    const x0 = 1010, y0 = 236, x1 = 1600, y1 = 222, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + 48;
    g.strokeStyle = '#d8c8a8'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
    for (const [i, u, kind, c1, c2] of [[0, 0.14, 'sock', '#a9492f', '#e8d9c0'], [1, 0.25, 'sock', '#e8d9c0', '#a9492f'], [2, 0.5, 'mitten', '#4f6d7a', '#e8d9c0'], [3, 0.6, 'mitten', '#4f6d7a', '#e8d9c0'], [4, 0.8, 'towel', '#e8d9c0', '#a9492f']]) {
      const v = 1 - u, bx = v * v * x0 + 2 * v * u * cx + u * u * x1, by = v * v * y0 + 2 * v * u * cy + u * u * y1;
      const a = Math.sin(t * 0.5 + i * 1.7) * 0.04 + (noise(t * 0.25, i + 4) - 0.5) * 0.12;
      g.save(); g.translate(bx, by); g.rotate(a);
      if (kind === 'sock') {
        g.fillStyle = c1; g.fill(S.sock);
        g.fillStyle = c2; g.fillRect(-9, 8, 18, 6); g.fillRect(-9, 20, 18, 6); oval(g, 30, 80, 6, 8);
      } else if (kind === 'mitten') {
        g.fillStyle = c1; g.fill(S.mitten);
        g.fillStyle = c2; g.fillRect(-14, 0, 28, 10);
      } else {
        g.fillStyle = c1; g.fillRect(-30, 0, 60, 84);
        g.fillStyle = c2; g.fillRect(-30, 56, 60, 6); g.fillRect(-30, 66, 60, 3);
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(8, 0, 22, 84);
      }
      g.fillStyle = '#8a6a48'; g.fillRect(-3, -6, 6, 12);
      g.restore();
    }

    // ---- floor, rug, dog, boots ----
    const fl = g.createLinearGradient(0, 742, 0, VH);
    fl.addColorStop(0, '#2a1a10'); fl.addColorStop(1, '#4a2e1c');
    g.fillStyle = fl; g.fillRect(0, 742, VW, VH - 742);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.5;
    g.beginPath(); for (const y of [760, 784, 816, 856]) { g.moveTo(0, y); g.lineTo(VW, y); } g.stroke();
    g.fillStyle = '#1e120c'; g.fillRect(0, 734, 1040, 10);
    const RUG = ['#7a3a2a', '#a0603a', '#5a3540', '#7d8a68', '#a9492f', '#c0a062', '#5a3540', '#7a3a2a'];
    for (let j = 0; j < RUG.length; j++) {
      g.fillStyle = RUG[j]; oval(g, 820, 846, 330 - j * 38, 56 - j * 6.6);
    }
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
    g.beginPath(); for (let j = 0; j < RUG.length; j++) { g.moveTo(820 + 330 - j * 38, 846); g.ellipse(820, 846, 330 - j * 38, 56 - j * 6.6, 0, 0, TAU); } g.stroke();
    drawDog(g, 960, 862, t, !focus);
    // boots by the door, with a little melted snow
    g.fillStyle = 'rgba(150,170,210,0.13)'; oval(g, 200, 852, 130, 13);
    for (const [bx, by, c] of [[170, 838, '#3e2618'], [112, 850, '#4e3020']]) {
      g.fillStyle = c;                                                   // shaft, heel, foot and a round toe
      g.beginPath(); g.moveTo(bx, by - 76); g.lineTo(bx + 40, by - 76); g.lineTo(bx + 42, by - 30);
      g.quadraticCurveTo(bx + 52, by - 30, bx + 76, by - 22); g.quadraticCurveTo(bx + 94, by - 16, bx + 92, by); g.lineTo(bx - 4, by);
      g.quadraticCurveTo(bx - 6, by - 20, bx, by - 30); g.closePath(); g.fill();
      g.fillStyle = '#1e120c'; g.beginPath(); g.roundRect(bx - 5, by - 4, 99, 8, 3); g.fill();
      g.strokeStyle = '#c0a062'; g.lineWidth = 2;
      g.beginPath(); for (let k = 0; k < 3; k++) { g.moveTo(bx + 30, by - 60 + k * 11); g.lineTo(bx + 44 + k * 3, by - 54 + k * 11); } g.stroke();
      g.fillStyle = '#d8c8b0'; g.beginPath(); g.roundRect(bx - 5, by - 86, 50, 16, 8); g.fill();
      g.fillStyle = 'rgba(240,244,255,0.7)'; oval(g, bx + 78, by - 18, 9, 3.5, 0.3); oval(g, bx + 64, by - 24, 5, 2.5);
    }

    // ---- the evening dims the room; the window keeps its own light ----
    g.fillStyle = rgba(DIM, 0.12 + 0.3 * n); g.fill(S.hole, 'evenodd');

    // ---- light ----
    const L = flick;
    glow(g, 1230, 620, 640, '#ff7a30', 0.16 * L);
    glow(g, 1230, 624, 120, '#ffb060', 0.35 * L);
    pool(g, 1180, 800, 560, '#ff9a48', 0.36 * L, 0.2);
    // oil lamp, lit as it gets dark
    const lamp = span(s, 0.1, 0.28), lf = 0.9 + 0.1 * noise(t * 4, 12);
    if (lamp > 0.01) {
      flame(g, 252, 520, 9 * lamp, 24 * lamp, t, 21);
      glow(g, 252, 500, 520, '#ffb46a', 0.18 * lamp * lf);
      glow(g, 252, 504, 60, '#ffe0b0', 0.5 * lamp * lf);
    }
    // cool snow light from the window on the floor
    const cool = 0.05 + 0.06 * clear;
    const op = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    const cg = g.createLinearGradient(0, 742, 0, 880);
    cg.addColorStop(0, rgba('#9ab0e0', cool)); cg.addColorStop(1, rgba('#9ab0e0', 0));
    g.fillStyle = cg;
    g.beginPath(); g.moveTo(190, 742); g.lineTo(630, 742); g.lineTo(760, 880); g.lineTo(150, 880); g.fill();
    g.globalCompositeOperation = op;
    glow(g, 410, 560, 240, '#9ab0e0', 0.05 + 0.05 * clear);

    // kettle steam: a thin wisp at first, a strong plume at the end of the round
    steam(g, 1142, 458, t, 0.25 + 0.75 * span(heat, 0.2, 0.85), lerp(40, 130, heat));
    if (heat > 0.6) steam(g, 1140, 456, t + 3.7, span(heat, 0.6, 1), lerp(60, 150, heat));
    steam(g, 592, 532, t + 1.3, 0.45, 50);
    warmBreak(g, st);
    vignette(g, 0.5);
  }
};

// =====================================================================
// Tea at night: on a wooden veranda under a deep roof, looking into a small garden with a pond.
// Session: blue hour to deep night, the moon rises and shows in the pond, the stone lantern
// is lit, more and more fireflies. Round: the candle on the tray burns down and the tea cools.
// =====================================================================
const TSKY = [
  ['#2a3560', '#18204a', '#0e1433', '#0a0f28'],
  ['#5a5a88', '#2a3463', '#161f45', '#121a3a'],
  ['#d9907a', '#6a6890', '#2a3258', '#1e2850']
];
const EAVE = 92, DECK = 752, LX = 1250;

export const teatime = {
  id: 'teatime', name: 'Tea at night', focus: [0.5, 0.5],

  setup(rand) {
    const near = x => ridgeY(x, 12, 652, 50, 150);
    const blobs = new Path2D();
    for (let x = 330; x < 1480; x += 26 + rand() * 26) { const rr = 18 + rand() * 30, y = near(x) + 12; blobs.moveTo(x + rr, y); blobs.arc(x, y, rr, 0, TAU); }
    // maple beyond the left post
    const tree = makeTree(rand, 420, DECK - 40, 140, -Math.PI / 2 - 0.08, 6);
    const leafA = new Path2D(), leafB = new Path2D();
    for (const [, , x1, y1, w] of tree) if (w < 2.4 && x1 < 600) for (let k = 0; k < 6; k++) {
      const x = x1 + (rand() - 0.5) * 44, y = y1 + (rand() - 0.5) * 30, rr = 6 + rand() * 9, p = rand() < 0.5 ? leafA : leafB;
      p.moveTo(x + rr, y); p.arc(x, y, rr, 0, TAU);
    }
    const shrubs = new Path2D(), shrubHi = new Path2D();
    for (const [cx, cy, n0] of [[420, 742, 6], [1370, 744, 6], [700, 750, 4]]) for (let k = 0; k < n0; k++) {
      const x = cx + (k - n0 / 2) * 26 + rand() * 10, y = cy - rand() * 18, rr = 26 + rand() * 16;
      shrubs.moveTo(x + rr, y); shrubs.arc(x, y, rr, 0, TAU);
      shrubHi.moveTo(x + rr * 0.5, y - rr * 0.45); shrubHi.arc(x - 2, y - rr * 0.45, rr * 0.52, 0, TAU);
    }
    const rafters = new Path2D();
    for (let xe = 300; xe < 1560; xe += 72) { const xt = 800 + (xe - 800) * 1.7; addPoly(rafters, [[xt - 16, 0], [xt + 16, 0], [xe + 7, EAVE - 14], [xe - 7, EAVE - 14]]); }
    const lattice = new Path2D();
    lattice.rect(0, EAVE, 300, 10); lattice.rect(0, 690, 300, 10); lattice.rect(290, EAVE, 10, 680);
    for (let x = 48; x < 290; x += 50) lattice.rect(x, EAVE, 4, 600);
    for (let y = EAVE + 74; y < 690; y += 74) lattice.rect(0, y, 290, 4);
    const seams = new Path2D();
    for (const y of [792, 818, 850, 888]) { seams.moveTo(0, y); seams.lineTo(VW, y); }
    for (const [y0, y1] of [[770, 792], [792, 818], [818, 850], [850, 888]]) for (let x = rand() * 300; x < VW; x += 260 + rand() * 300) { seams.moveTo(x, y0); seams.lineTo(x, y1); }

    return {
      blobs, tree, leafA, leafB, shrubs, shrubHi, rafters, lattice, seams,
      stars: makeStars(rand, 130, 340, 100, 1460, 520),
      clouds: makeClouds(rand, 6, 300, 130, 1500, 380).map(c => ({ ...c, v: c.v * 0.45, h: c.h * 0.7 })),
      far: ridgePath(4, 610, 150, 300),
      near: ridgePath(12, 652, 50, 150),
      rim: Array.from({ length: 13 }, (_, i) => {
        const a = (i / 13) * TAU + rand() * 0.25;
        return [880 + Math.cos(a) * 318, 714 + Math.sin(a) * 40, 20 + rand() * 16, 8 + rand() * 5, mix('#6e6a62', '#4a4842', rand())];
      }).sort((a, b) => a[1] - b[1]),
      reeds: Array.from({ length: 13 }, () => ({ x: 548 + rand() * 70, h: 60 + rand() * 70, a: (rand() - 0.5) * 0.4, ph: rand() * TAU })),
      flies: Array.from({ length: 36 }, () => ({ x: 360 + rand() * 1080, y: 520 + rand() * 210, sp: 0.6 + rand() * 0.8, ph: rand() * TAU, k: rand() })),
      steps: [[640, 770, 40, 9], [760, 764, 34, 7], [1100, 766, 36, 8]]
    };
  },

  draw(g, S, t, dt, st) {
    const s = st.session, r = st.round, n = nightAt(s), up = span(s, 0.06, 0.85), moonA = span(s, 0.06, 0.2);
    const garden = s => ramp(['#2a3428', '#1c2420', '#0e1410', '#121a16'], s);

    // ---- sky, moon, hills ----
    fillSky(g, TSKY.map(k => ramp(k, s)), 0, 660);
    drawStars(g, S.stars, t, span(s, 0.3, 0.8));
    const mx = lerp(1190, 1090, up), my = lerp(620, 196, up);
    drawMoon(g, mx, my, 34, '#f6eed6', '#cfd8ff', moonA);
    drawClouds(g, S.clouds, t, ramp(['#6a6488', '#3a4068', '#1e2648', '#2a3458'], s), 0.45);
    g.fillStyle = ramp(['#4a4a70', '#2a3058', '#141a36', '#161e3c'], s); g.fill(S.far);
    g.fillStyle = ramp(['#2e3446', '#1c2236', '#0c1020', '#0e1426'], s); g.fill(S.near);
    g.fillStyle = ramp(['#26302e', '#182024', '#0a0f12', '#0c1216'], s); g.fill(S.blobs);
    g.fillStyle = garden(s); g.fillRect(0, 676, VW, DECK - 676);

    // ---- pond with the moon in it ----
    const pg = g.createLinearGradient(0, 674, 0, 750);                      // the water shows the sky: light far off, dark near
    pg.addColorStop(0, ramp(['#8a7a98', '#4e5a88', '#26305a', '#2e3a66'], s)); pg.addColorStop(1, ramp(['#2e3048', '#1a2038', '#0c1022', '#10162a'], s));
    g.fillStyle = pg; oval(g, 880, 712, 316, 38);
    g.save();
    g.beginPath(); g.ellipse(880, 712, 312, 35, 0, 0, TAU); g.clip();
    const rx = clamp(mx, 600, 1160), ra = span(s, 0.25, 0.6) * moonA;
    if (ra > 0.01) {
      pool(g, rx, 704, 90, '#e8ecff', 0.2 * ra, 0.4);
      g.fillStyle = '#f2ecd8';
      for (let i = 0; i < 8; i++) {
        const w = (10 + 26 * noise(t * 0.5 + i * 1.3, 3)) * (1 - i * 0.07);
        g.globalAlpha = ra * (0.15 + 0.3 * noise(t * 0.8 + i, 6));
        g.fillRect(rx - w / 2 + Math.sin(t * 0.7 + i) * 3, 686 + i * 6, w, 1.5);
      }
      g.globalAlpha = 1;
    }
    // slow rings on the water
    g.strokeStyle = 'rgba(200,210,240,1)'; g.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.12 + i / 3) % 1, turn = Math.floor(t * 0.12 + i / 3), cx = 680 + hash(turn * 3.1 + i) * 400, rr = 6 + ph * 70;
      g.globalAlpha = (1 - ph) * 0.22;
      g.beginPath(); g.ellipse(cx, 704 + hash(turn + i * 7) * 16, rr, rr * 0.16, 0, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
    g.restore();
    g.globalAlpha = 1 - 0.55 * n;
    for (const [x, y, a, b, c] of S.rim) { g.fillStyle = c; oval(g, x, y, a, b); }
    g.fillStyle = 'rgba(220,226,255,0.12)';
    for (const [x, y, a, b] of S.rim) oval(g, x - a * 0.15, y - b * 0.4, a * 0.6, b * 0.35);
    g.globalAlpha = 1;
    // reeds
    g.strokeStyle = ramp(['#3a4a34', '#24302a', '#121a16', '#16201a'], s); g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath();
    for (const rd of S.reeds) {
      const a = rd.a + Math.sin(t * 0.6 + rd.ph) * 0.05;
      g.moveTo(rd.x, 712); g.quadraticCurveTo(rd.x + a * rd.h * 0.3, 712 - rd.h * 0.6, rd.x + Math.sin(a) * rd.h, 712 - rd.h * Math.cos(a));
    }
    g.stroke();
    for (const [x, y, rx2, ry] of S.steps) { g.fillStyle = ramp(['#5a5650', '#3a3a3e', '#1e1e24', '#24262e'], s); oval(g, x, y, rx2, ry); }

    // ---- stone lantern ----
    const stone = ramp(['#6a6460', '#4a4648', '#2a2a32', '#34343e'], s), lan = span(s, 0.1, 0.3), lf = 0.88 + 0.12 * noise(t * 3, 15);
    g.fillStyle = stone;
    g.beginPath(); g.moveTo(LX - 34, 748); g.lineTo(LX + 34, 748); g.lineTo(LX + 26, 730); g.lineTo(LX - 26, 730); g.fill();
    g.fillRect(LX - 10, 664, 20, 68); g.fillRect(LX - 32, 652, 64, 14); g.fillRect(LX - 24, 612, 48, 42);
    g.beginPath(); g.moveTo(LX - 54, 614); g.quadraticCurveTo(LX - 20, 606, LX, 580); g.quadraticCurveTo(LX + 20, 606, LX + 54, 614); g.lineTo(LX + 50, 620); g.lineTo(LX - 50, 620); g.fill();
    oval(g, LX, 576, 8, 8);
    g.fillStyle = mix('#151418', '#ffcf8a', lan * lf); g.fillRect(LX - 12, 620, 24, 26);
    g.fillStyle = ramp(['#3a4a34', '#28342a', '#121a14', '#16201a'], s); oval(g, LX - 20, 616, 14, 3);

    g.fillStyle = ramp(['#24342a', '#18241e', '#0a120e', '#0c1610'], s); g.fill(S.shrubs);
    g.fillStyle = ramp(['#34483a', '#22322a', '#101a14', '#142018'], s); g.fill(S.shrubHi);

    // maple tree, its leaves moving a little
    const sw = Math.sin(t * 0.4) * 0.006 + (noise(t * 0.15, 3) - 0.5) * 0.008;
    g.save(); g.translate(420, DECK); g.rotate(sw); g.translate(-420, -DECK);
    g.strokeStyle = ramp(['#2a2020', '#1a1418', '#0c0a0e', '#0e0c12'], s); g.lineCap = 'round';
    for (const [a, b, c, d, w] of S.tree) { g.lineWidth = w; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
    g.fillStyle = ramp(['#6e2a22', '#4a1e1e', '#24101a', '#2a141e'], s); g.fill(S.leafA);
    g.fillStyle = ramp(['#8e3a2a', '#622820', '#30141a', '#381820'], s); g.fill(S.leafB);
    g.restore();

    // ---- the house: roof, posts, paper door, deck ----
    g.fillStyle = '#1a100b'; g.fillRect(0, 0, VW, EAVE);
    g.fillStyle = '#2a1912'; g.fill(S.rafters);
    g.fillStyle = '#3d281e'; g.fillRect(0, EAVE - 16, VW, 18);
    g.fillStyle = '#5a3a2b'; g.fillRect(0, EAVE + 1, VW, 2);
    // paper door glowing from the room inside
    const sj = lerp(0.82, 1, n);
    const paper = g.createLinearGradient(0, EAVE, 300, EAVE);
    paper.addColorStop(0, mix('#a86a38', '#f0c088', sj)); paper.addColorStop(1, mix('#8a5630', '#d89a60', sj));
    g.fillStyle = paper; g.fillRect(0, EAVE, 300, 600);
    g.fillStyle = '#3d281e'; g.fillRect(0, 690, 300, DECK - 690);
    g.fillStyle = '#2c1b15'; g.fill(S.lattice);
    g.fillStyle = '#2c1b15'; g.fillRect(300, EAVE, 36, DECK - EAVE + 18); g.fillRect(1466, EAVE, 36, DECK - EAVE + 18);
    g.fillStyle = '#5a3a2b'; g.fillRect(334, EAVE, 2, DECK - EAVE); g.fillRect(1466, EAVE, 2, DECK - EAVE);
    g.fillStyle = '#1d120d'; g.fillRect(1502, EAVE, 98, DECK - EAVE);
    g.fillStyle = 'rgba(255,200,160,0.03)'; g.fillRect(1530, EAVE, 3, DECK - EAVE); g.fillRect(1566, EAVE, 3, DECK - EAVE);
    g.fillStyle = '#4a3024'; g.fillRect(0, DECK, VW, 18);
    g.fillStyle = '#6a4632'; g.fillRect(0, DECK, VW, 2);
    const dk = g.createLinearGradient(0, DECK + 18, 0, VH);
    dk.addColorStop(0, '#3a2418'); dk.addColorStop(1, '#5a3a2b');
    g.fillStyle = dk; g.fillRect(0, DECK + 18, VW, VH - DECK - 18);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.5; g.stroke(S.seams);

    // cushion
    g.fillStyle = '#5a3540'; g.strokeStyle = '#5a3540'; g.lineWidth = 16; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(570, 806); g.lineTo(830, 806); g.lineTo(866, 884); g.lineTo(534, 884); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,200,190,0.07)'; g.beginPath(); g.moveTo(574, 806); g.lineTo(826, 806); g.lineTo(834, 822); g.lineTo(566, 822); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.3)'; oval(g, 700, 846, 8, 4);
    // tray, teapot, cups, candle
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(1010, 812); g.lineTo(1410, 812); g.lineTo(1444, 896); g.lineTo(980, 896); g.fill();
    g.fillStyle = '#6a4632'; g.beginPath(); g.moveTo(1024, 800); g.lineTo(1396, 800); g.lineTo(1426, 884); g.lineTo(994, 884); g.fill();
    g.fillStyle = '#7a5038'; g.beginPath(); g.moveTo(1034, 806); g.lineTo(1386, 806); g.lineTo(1412, 878); g.lineTo(1008, 878); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.3)'; oval(g, 1140, 864, 54, 9);
    g.strokeStyle = '#9a5637'; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath(); g.moveTo(1098, 836); g.quadraticCurveTo(1076, 828, 1064, 810); g.stroke();
    g.fillStyle = '#5a3020'; g.save(); g.translate(1186, 836); g.rotate(-0.45); g.beginPath(); g.roundRect(0, -6, 50, 12, 6); g.fill(); g.restore();
    g.fillStyle = '#9a5637'; oval(g, 1140, 836, 50, 34);
    g.fillStyle = 'rgba(255,220,180,0.16)'; oval(g, 1124, 822, 20, 12, -0.4);
    g.fillStyle = '#8a4a2f'; oval(g, 1140, 804, 28, 7);
    g.fillStyle = '#7a3e28'; oval(g, 1140, 798, 7, 5);
    for (const [x, y] of [[1262, 858], [1326, 846]]) {
      g.fillStyle = '#e8d9c0'; g.beginPath(); g.roundRect(x - 20, y - 34, 40, 36, [2, 2, 10, 10]); g.fill();
      g.fillStyle = '#3e5a6e'; g.fillRect(x - 20, y - 20, 40, 6);
      g.fillStyle = '#f4ecd8'; oval(g, x, y - 34, 20, 5);
      g.fillStyle = '#9a8a40'; oval(g, x, y - 33, 16, 3.5);
    }
    const ch = lerp(34, 8, r), cyTop = 852 - ch;
    g.fillStyle = '#ecdcbc'; g.fillRect(1366, cyTop, 22, ch);
    g.fillStyle = '#2a1c14'; g.fillRect(1376, cyTop - 6, 2, 7);
    g.fillStyle = 'rgba(255,230,200,0.14)'; g.beginPath(); g.roundRect(1356, 812, 42, 42, [4, 4, 8, 8]); g.fill();
    g.strokeStyle = 'rgba(255,230,200,0.25)'; g.lineWidth = 1.5; g.stroke();

    // wind chime under the eave
    const ca = Math.sin(t * 0.8) * 0.04 + (noise(t * 0.35, 5) - 0.5) * 0.14;
    g.save(); g.translate(1360, EAVE + 2); g.rotate(ca);
    g.strokeStyle = '#120a07'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 40); g.stroke();
    g.fillStyle = 'rgba(232,236,240,0.8)';
    g.beginPath(); g.moveTo(-16, 72); g.quadraticCurveTo(-16, 40, 0, 40); g.quadraticCurveTo(16, 40, 16, 72); g.closePath(); g.fill();
    g.fillStyle = '#e2725b'; oval(g, -4, 60, 5, 3); oval(g, 7, 64, 4, 2.5);
    g.beginPath(); g.moveTo(0, 72); g.lineTo(0, 96); g.stroke();
    g.rotate(ca * 1.6 + (noise(t * 0.6, 8) - 0.5) * 0.2);
    g.fillStyle = '#e8d9c0'; g.fillRect(-10, 96, 20, 92);
    g.fillStyle = 'rgba(169,73,47,0.6)'; g.fillRect(-10, 96, 20, 6);
    g.restore();

    // ---- light ----
    // the night slowly darkens the house too
    g.fillStyle = rgba(DIM, 0.05 + 0.18 * n); g.fillRect(0, EAVE, VW, VH - EAVE);
    glow(g, 160, 420, 760, '#ffb46a', 0.12 + 0.08 * n);
    pool(g, 220, 830, 700, '#ffb46a', 0.28 + 0.1 * n, 0.2);
    if (lan > 0.01) {
      glow(g, LX, 632, 200, '#ff9a48', 0.22 * lan * lf);
      glow(g, LX, 632, 30, '#ffe0b0', 0.6 * lan * lf);
      pool(g, LX, 740, 220, '#ffb46a', 0.2 * lan * lf, 0.2);
    }
    const cf = 0.85 + 0.15 * noise(t * 6, 11);
    flame(g, 1377, cyTop - 6, 8, 22, t, 30);
    glow(g, 1377, cyTop - 14, 300, '#ff9648', 0.2 * cf);
    glow(g, 1377, cyTop - 12, 50, '#ffdca8', 0.45 * cf);
    pool(g, 1300, 850, 260, '#ffb46a', 0.22 * cf, 0.25);
    // fireflies over the garden, more as the night goes on
    const nf = Math.floor(S.flies.length * lerp(0.12, 1, span(s, 0.15, 0.8)));
    const op = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = '#f2f0a0';
    for (let i = 0; i < nf; i++) {
      const f = S.flies[i];
      const b = Math.max(0, Math.sin(t * f.sp * 0.7 + f.ph)) ** 3;
      if (b < 0.02) continue;
      const x = f.x + (noise(t * 0.06 * f.sp, i) - 0.5) * 240, y = f.y + (noise(t * 0.08 * f.sp, i + 40) - 0.5) * 110;
      g.globalAlpha = 0.16 * b; g.beginPath(); g.arc(x, y, 8, 0, TAU); g.fill();
      g.globalAlpha = 0.9 * b; g.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = op;
    // tea steam: fresh at the start of a round, cooling by its end; a fresh pot in breaks
    const tea = st.mode === 'focus' ? 1 - 0.85 * span(r, 0.08, 0.85) : 1;
    steam(g, 1062, 806, t, tea, 80);
    steam(g, 1262, 822, t + 2.1, tea * 0.6, 50);
    warmBreak(g, st);
    vignette(g, 0.5);
  }
};
