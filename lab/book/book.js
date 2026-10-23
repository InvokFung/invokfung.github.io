// The portfolio as a pop-up book. The page is one sticky stage; scrolling turns its pages.
//
// Every page is a stack of paper layers. CSS lays each layer out flat, the way the page looks when
// everything stands. Here each layer gets a depth from where its bottom edge sits (lower on the
// screen is nearer, as in a diorama seen from above) and a scale that keeps it exactly where CSS
// put it. All layers stand on one floor, the page, so each can fold flat around its bottom edge.
// The floor reaches back to the sky, which stands at its far edge.
// Turning a page: its layers fold down front first, the page swings over the spine on the left,
// and the next page's layers stand up back first. Everything is a function of the scroll position,
// so scrolling back plays it in reverse.
import { mountSpecimens } from './specimens.js';

const D = window.PORTFOLIO, F = window.Figs;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const md = (t) => esc(t).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, w, u) => `<a href="${u}">${w}</a>`);
const get = (path) => path.split('.').reduce((o, k) => o?.[k], D);
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const rgb = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => { const B = rgb(b); return '#' + rgb(a).map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); };
// a little past upright, then back: paper that snaps open
const snap = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = () => innerWidth <= 760;

for (const el of $$('[data-md]')) el.innerHTML = md(get(el.dataset.md));

const stage = $('#stage'), scroller = $('#scroll');
const pages = $$('.page').map((el, i) => ({ el, i, id: el.id, layers: [], floor: null, sky: null }));
const N = pages.length;
// The skies stand behind the book as plain backdrops and cross-fade on a turn. (As 3D layers this
// deep and this large, Chrome skipped painting parts of them.)
for (const pg of pages) {
  const sky = $('.sky', pg.el), wrap = document.createElement('div');
  wrap.className = 'skywrap ' + pg.id;
  wrap.append(sky);
  $('#skies').append(wrap);
  // and under each sky, flat ground, for wherever a lifting page shows what is behind it
  const ground = document.createElement('div');
  ground.className = 'ground';
  wrap.append(ground);
  pg.sky = { el: sky, wrap, ground };
}

// Chrome paints a 3D layer only within about a screen's width of its own left edge, and the
// ridges hang off both sides of the screen (so the eye can move without showing their ends). Each
// is drawn in two halves, two layers that always share one transform but for where they start.
for (const el of $$('.layer[data-art]:not(.front)')) {
  const half = document.createElement('div');
  half.className = 'layer-half';
  half.setAttribute('aria-hidden', 'true');
  el.after(half);
  el._half = half;
}

/* ------------------------------------------------------------------ art: paper, skies and ridges */
// mulberry32
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// smooth 1D value noise in [-1, 1]
function noise1(seed) {
  const r = rng(seed), v = Array.from({ length: 256 }, () => r() * 2 - 1);
  return (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(v[i & 255], v[(i + 1) & 255], u); };
}

// one shared paper grain, referenced by every layer's art and laid on the floor
const GRAIN = (function grain() {
  const c = document.createElement('canvas'); c.width = c.height = 220;
  const x = c.getContext('2d'), img = x.createImageData(220, 220), r = rng(7);
  for (let i = 0; i < img.data.length; i += 4) { const v = 120 + r() * 135; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = r() * 38; }
  x.putImageData(img, 0, 0);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.style.position = 'absolute';
  svg.innerHTML = `<defs><pattern id="grain" patternUnits="userSpaceOnUse" width="220" height="220"><image href="${c.toDataURL()}" width="220" height="220"/></pattern></defs>`;
  document.body.prepend(svg);
  return c.toDataURL();
})();

// The light changes as you read: first light on the cover, a clear morning for the climb, dark
// rooms for the work and the craft, and the last light at the back cover.
const PAL = {
  cover: { floor: ['#121218', '#3b3341'], sky: ['#090b11', '#151826', '#463645', '#a8694a'], sun: { x: 0.6, y: 0.93, r: 0.05, c: '#ffe1b0', glow: 'rgba(255,170,96,0.5)' },
    ridges: ['#6f5f6a', '#4d4555', '#34303f', '#22212c', '#121218'], rim: '#ffd3a1', rimA: [0.85, 0.6, 0.45, 0.32, 0.22], haze: 'rgba(255,205,165,0.22)' },
  climb: { floor: ['#12171e', '#3a4a5b'], sky: ['#070a10', '#111925', '#2a3a4d', '#64798e'], sun: { x: 0.86, y: 0.5, r: 0, c: '#f3f6f8', glow: 'rgba(220,235,245,0.22)' },
    ridges: ['#566a7e', '#12171e'], rim: '#e8f0f6', rimA: [0.6, 0.3], haze: 'rgba(215,230,240,0.18)' },
  work: { floor: ['#0b0c0f', '#16181e'], sky: ['#08090b', '#0a0b0e', '#0e1014', '#13161c'], ridges: ['#0c0d10'], rim: '#62b6ff', rimA: [0.3] },
  craft: { floor: ['#0b0b0e', '#18151d'], sky: ['#08090b', '#0a0a0e', '#100e15', '#17131d'], ridges: ['#0c0b0f'], rim: '#a78bfa', rimA: [0.3] },
  contact: { floor: ['#0c0b10', '#2c2433'], sky: ['#05060a', '#0c0f1d', '#2a2140', '#94523c'], sun: { x: 0.32, y: 1.0, r: 0.06, c: '#ffb07a', glow: 'rgba(255,130,80,0.45)' },
    ridges: ['#43354a', '#2b2332', '#19151f', '#0c0b10'], rim: '#ffa679', rimA: [0.7, 0.45, 0.3, 0.2], haze: 'rgba(255,150,110,0.16)' }
};
// the silhouette of each ridge: where its peaks sit, as fractions of its own box
const SHAPE = {
  cover: [
    { seed: 11, base: 0.35, peaks: [[0.18, 0.62, 0.12], [0.47, 0.95, 0.09], [0.78, 0.7, 0.14]], rough: 0.16 },
    { seed: 23, base: 0.35, peaks: [[0.08, 0.7, 0.1], [0.34, 0.85, 0.12], [0.9, 0.95, 0.1]], rough: 0.14 },
    { seed: 37, base: 0.42, peaks: [[0.06, 0.95, 0.12], [0.94, 0.9, 0.12]], rough: 0.12, dip: [0.5, 0.3, 0.26] },
    { seed: 41, base: 0.45, peaks: [[0.25, 0.85, 0.16], [0.7, 0.8, 0.14]], rough: 0.1 },
    { seed: 53, base: 0.6, peaks: [[0.1, 0.92, 0.2], [0.88, 0.95, 0.18]], rough: 0.06 }
  ],
  climb: [
    { seed: 91, base: 0.3, peaks: [[0.12, 0.8, 0.08], [0.3, 0.95, 0.07], [0.5, 0.6, 0.1]], rough: 0.14 },
    { seed: 97, base: 0.5, peaks: [[0.15, 0.85, 0.18], [0.8, 0.95, 0.16]], rough: 0.06 }
  ],
  contact: [
    { seed: 61, base: 0.4, peaks: [[0.22, 0.8, 0.12], [0.68, 0.96, 0.1]], rough: 0.14 },
    { seed: 67, base: 0.4, peaks: [[0.1, 0.9, 0.12], [0.46, 0.7, 0.14], [0.86, 0.85, 0.1]], rough: 0.12 },
    { seed: 71, base: 0.5, peaks: [[0.15, 0.95, 0.16], [0.82, 0.9, 0.16]], rough: 0.1, dip: [0.5, 0.35, 0.3] },
    { seed: 79, base: 0.62, peaks: [[0.3, 0.8, 0.22], [0.75, 0.86, 0.2]], rough: 0.05 }
  ],
  // the climb's one mountain; the summit is where 2026 stands
  mountain: { seed: 5, base: 0.3, peaks: [[0.73, 0.99, 0.0825], [0.52, 0.66, 0.075], [0.91, 0.7, 0.06], [0.34, 0.5, 0.06], [0.1, 0.42, 0.09]], rough: 0.06 }
};
// the trail up the mountain, in fractions of its box (x, y from the top), bottom left to the summit
const TRAIL = [[0.27, 0.9], [0.4, 0.8], [0.34, 0.69], [0.505, 0.58], [0.45, 0.46], [0.6, 0.35], [0.66, 0.2], [0.73, 0.05]];

let uid = 0;
// view: the part of the art this element shows, [x, width], for a layer drawn in halves
function svg(w, h, body, view = [0, w]) {
  return `<svg class="art" viewBox="${view[0].toFixed(1)} 0 ${view[1].toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="none" overflow="hidden" aria-hidden="true">${body}</svg>`;
}
function skyArt(w, h, pal) {
  const id = 'sky' + uid++, [a, b, c, d] = pal.sky, s = pal.sun;
  let sun = '';
  if (s) {
    const cx = s.x * w, cy = s.y * h, r = s.r * Math.min(w, h * 1.6), gr = Math.max(r, 0.05 * Math.min(w, h * 1.6));
    sun = `<radialGradient id="${id}g"><stop offset="0" stop-color="${s.glow}"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient>
      <circle cx="${cx}" cy="${cy}" r="${gr * 6}" fill="url(#${id}g)"/>
      ${r ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.c}" opacity="0.92"/>` : ''}`;
  }
  return svg(w, h, `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.45" stop-color="${b}"/><stop offset="0.8" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#${id})"/>${sun}<rect width="${w}" height="${h}" fill="url(#grain)" opacity="0.5"/>`);
}
// height of a ridge's skyline at x (0..1 of its width), as a fraction of its box (1 = top)
function skyline(sh) {
  const n = noise1(sh.seed);
  return (x) => {
    let y = sh.base;
    for (const [cx, hgt, wd] of sh.peaks) { const d = (x - cx) / wd; y = Math.max(y, sh.base + (hgt - sh.base) * Math.exp(-d * d * 0.5) * (1 - Math.abs(d) * 0.02)); }
    y += (n(x * 6) * 0.5 + n(x * 17 + 40) * 0.3 + n(x * 47 + 90) * 0.2) * sh.rough;
    if (sh.dip) { const [cx, depth, wd] = sh.dip, d = (x - cx) / wd; y -= depth * Math.exp(-d * d * 2) * (y - 0.05); }
    return clamp(y, 0.02, 1);
  };
}
// the ground a ridge stands on: its own colour, in its own shade
const foot = (color) => mix(color, '#000000', 0.34);
function ridgeArt(w, h, sh, color, rim, rimA, haze, extra, view) {
  const id = 'rg' + uid++, f = skyline(sh), step = Math.max(3, w / 420);
  let top = '';
  for (let x = 0; x <= w + step; x += step) top += `${top ? 'L' : 'M'}${Math.min(x, w).toFixed(1)} ${((1 - f(Math.min(x, w) / w)) * h).toFixed(1)}`;
  const fill = `${top}L${w} ${h}L0 ${h}Z`;
  // light catches the crest and fades down the slope; the base darkens into the ground it stands on
  const hz = clamp(h * 0.09, 10, 44), fade = Math.min(h * 0.6, H * 0.18);
  const glow = haze ? `<g clip-path="url(#${id}c)"><path d="${top}" fill="none" stroke="${haze}" stroke-width="${(hz * 2).toFixed(1)}" filter="url(#${id}b)"/></g>` : '';
  return svg(w, h, `<defs><clipPath id="${id}c"><path d="${fill}"/></clipPath>
    <filter id="${id}b" filterUnits="userSpaceOnUse" x="${-hz * 3}" y="${-hz * 3}" width="${w + hz * 6}" height="${h + hz * 6}"><feGaussianBlur stdDeviation="${(hz * 0.5).toFixed(1)}"/></filter>
    <linearGradient id="${id}f" gradientUnits="userSpaceOnUse" x1="0" y1="${(h - fade).toFixed(1)}" x2="0" y2="${h.toFixed(1)}"><stop offset="0" stop-color="${foot(color)}" stop-opacity="0"/><stop offset="1" stop-color="${foot(color)}"/></linearGradient></defs>
    <path d="${fill}" fill="${color}"/>${glow}<path d="${fill}" fill="url(#${id}f)"/><path d="${fill}" fill="url(#grain)"/>
    <path d="${top}" fill="none" stroke="${rim}" stroke-opacity="${rimA}" stroke-width="1.3" stroke-linejoin="round"/>${extra || ''}`, view);
}
// the colour a layer's art is painted in, for the ridges and the mountain
function artColor(pg, el) {
  if (el.dataset.art === 'mountain') return '#33414f';
  if (el.dataset.art !== 'ridge') return null;
  return PAL[pg.id].ridges[$$('[data-art="ridge"]', pg.el).indexOf(el)];
}

/* ------------------------------------------------------------------ page 2: the climb, from data.js */
const steps = D.path; // oldest first
const stepsEl = $('#steps');
stepsEl.innerHTML = steps.map((s, k) => `
  <li class="layer step-flag${k === steps.length - 1 ? ' now' : ''}" data-k="${k}">
    <span class="pole" aria-hidden="true"></span>
    <p class="tag"><b>${esc(s.y)}</b><span>${esc(s.r)}</span></p>
  </li>`).join('');
// the trail as a smooth curve, and the points along it where each year's flag stands
function trailPath(w, h) {
  const P = TRAIL.map(([x, y]) => [x * w, y * h]);
  let d = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
function trailPoints(n) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < TRAIL.length; i++) { const l = Math.hypot(TRAIL[i][0] - TRAIL[i - 1][0], (TRAIL[i][1] - TRAIL[i - 1][1]) * 0.8); seg.push(l); total += l; }
  return Array.from({ length: n }, (_, k) => {
    let want = (k / (n - 1)) * total, i = 0;
    while (i < seg.length - 1 && want > seg[i]) { want -= seg[i]; i++; }
    const f = Math.min(1, want / seg[i]);
    return [lerp(TRAIL[i][0], TRAIL[i + 1][0], f), lerp(TRAIL[i][1], TRAIL[i + 1][1], f)];
  });
}

/* ------------------------------------------------------------------ page 3: the work, all seven */
const PROJ = Object.fromEntries(D.projects.map((p) => [p.id, p]));
const FRONT = ['relay', 'tracewise', 'onboard', 'dispatch'], BACK = ['atlas', 'intonation', 'layerline'];
const FIG = { relay: F.Relay, tracewise: F.Tracewise, onboard: F.Onboard, dispatch: F.Dispatch, atlas: F.Atlas, intonation: F.Studio, layerline: F.Layerline };
const panelsEl = $('#panels');
panelsEl.innerHTML = [...BACK, ...FRONT].map((id) => {
  const p = PROJ[id], L = D.live[id], back = BACK.includes(id);
  return `<a class="layer panel${back ? ' back' : ''}" data-id="${id}" href="/explore/#work/${id}" style="--c:${p.color}" aria-label="${esc(p.name)}: ${esc(p.kind)}. ${esc(L.tag[0])} ${esc(L.tag[1])}.">
    <canvas aria-hidden="true"></canvas>
    <span class="cap"><i></i><b>${esc(p.name)}</b><small>${esc(p.kind)}</small><span>${esc(L.tag[0])}</span></span>
  </a>`;
}).join('');
const panels = $$('.panel', panelsEl).map((el) => ({ el, id: el.dataset.id, c: $('canvas', el), fig: null, warm: false, w: 0, h: 0, hot: false, last: 0 }));
function workLayout(W, H) {
  const ph = narrow(), out = {};
  if (!ph) {
    const g = Math.max(28, W * 0.04), gap = 18;
    const fw = (W - 2 * g - 3 * gap) / 4, fh = Math.min(H * 0.33, fw * 0.95), fb = H * 0.93;
    FRONT.forEach((id, i) => { out[id] = { l: g + i * (fw + gap), t: fb - fh, w: fw, h: fh }; });
    const bw = Math.min(fw * 0.92, (W * 0.6 - 2 * gap) / 3), bh = Math.min(H * 0.24, bw * 0.78), bb = H * 0.535;
    const bl = W - g - (3 * bw + 2 * gap);
    BACK.forEach((id, i) => { out[id] = { l: bl + i * (bw + gap), t: bb - bh, w: bw, h: bh }; });
  } else {
    const g = 16, gap = 10;
    const fw = (W - 2 * g - gap) / 2, fh = H * 0.205;
    FRONT.forEach((id, i) => { const r = i >> 1, c = i & 1; const b = H * (r ? 0.915 : 0.675); out[id] = { l: g + c * (fw + gap), t: b - fh, w: fw, h: fh }; });
    const bw = (W - 2 * g - 2 * 8) / 3, bh = H * 0.15, bb = H * 0.435;
    BACK.forEach((id, i) => { out[id] = { l: g + i * (bw + 8), t: bb - bh, w: bw, h: bh }; });
  }
  return out;
}

/* ------------------------------------------------------------------ page 4: the craft */
const specs = mountSpecimens($('#specs'), { isLive: () => live.craft });
function craftLayout(W, H) {
  const ph = narrow(), out = [];
  if (!ph) {
    const g = Math.max(28, W * 0.04), gap = W * 0.035;
    const w = (W - 2 * g - 2 * gap) / 3;
    for (let i = 0; i < 6; i++) {
      const r = i < 3 ? 0 : 1, c = i % 3, h = r ? H * 0.29 : H * 0.25, b = r ? H * 0.93 : H * 0.575;
      out.push({ l: g + c * (w + gap), t: b - h, w, h });
    }
  } else {
    const g = 16, gap = 14, w = (W - 2 * g - gap) / 2, h = H * 0.18;
    for (let i = 0; i < 6; i++) { const r = i >> 1, c = i & 1, b = H * [0.47, 0.695, 0.92][r]; out.push({ l: g + c * (w + gap), t: b - h, w, h }); }
  }
  return out;
}

/* ------------------------------------------------------------------ the book */
let W = 0, H = 0, P = 0, ox = 0, oy = 0, Yf = 0, TURN = 1, spineX = 0;
const live = { work: false, craft: false };

function place(el, r) { Object.assign(el.style, { left: r.l + 'px', top: r.t + 'px', width: r.w + 'px', height: r.h + 'px', right: 'auto', bottom: 'auto' }); }

function layout() {
  W = stage.clientWidth; H = stage.clientHeight;
  P = Math.max(W, H) * 1.2;
  ox = W / 2; oy = -0.4 * H; Yf = H; spineX = -W; // the spine is off to the left: we see the right-hand page
  TURN = H * (narrow() ? 0.62 : 0.72);
  scroller.style.height = ((N - 1) * TURN + H) + 'px';
  stage.style.perspective = P + 'px';

  for (const pg of pages) {
    pg.el.style.transform = '';
    pg.el.classList.remove('off');
    pg.layers = $$('.layer', pg.el).map((el) => ({ el }));
    for (const L of pg.layers) {
      L.el.style.transform = 'none';
      if (L.el._half) { Object.assign(L.el.style, { left: '', width: '', right: '' }); L.el._half.style.display = 'none'; }
    }
  }
  // boxes that depend on the screen
  const mt = $('.mountain');
  const mr = mt.getBoundingClientRect(), so = stage.getBoundingClientRect();
  const pts = trailPoints(steps.length);
  $$('.step-flag', stepsEl).forEach((el) => {
    const k = +el.dataset.k, [fx, fy] = pts[k];
    const x = mr.left - so.left + fx * mr.width, y = mr.top - so.top + fy * mr.height, fh = H * (narrow() ? 0.075 : 0.095);
    el.style.width = '';
    const fw = el.querySelector('.tag').offsetWidth + 2;
    const left = x + fw > W - 12;
    el.classList.toggle('left', left);
    place(el, { l: left ? x - fw : x, t: y - fh, w: fw, h: fh });
  });
  const wl = workLayout(W, H);
  for (const p of panels) place(p.el, wl[p.id]);
  craftLayout(W, H).forEach((r, i) => place(specs.items[i].el, r));

  // read every layer's flat box, then give it depth
  $('#skies').style.transform = '';
  const sr = stage.getBoundingClientRect();
  const mtS = (() => { const r = mt.getBoundingClientRect(); return (r.bottom - sr.top - oy) / (Yf - oy); })();
  $$('.step-flag', stepsEl).forEach((el) => { const k = +el.dataset.k; el.dataset.s = (mtS + 0.015 + k * 0.002).toFixed(4); el.dataset.ord = (0.5 + k * 0.09).toFixed(3); });
  for (const pg of pages) {
    // the sky's foot is where the floor ends; layers just in front of it say so as "sky+0.03"
    const skr = pg.sky.el.getBoundingClientRect();
    const skyS = (skr.bottom - sr.top - oy) / (Yf - oy);
    pg.sky.w = skr.width; pg.sky.h = skr.height;
    paint(pg, pg.sky);
    for (const L of pg.layers) {
      const r = L.el.getBoundingClientRect();
      const l = r.left - sr.left, t = r.top - sr.top, w = r.width, h = r.height;
      // a layer that hangs off the screen is laid out from x = 0 in two halves, each moved back
      // into place by its transform (see the halves at the top)
      L.split = !!L.el._half && (l < -0.5 || w > W + 0.5);
      if (L.split) {
        Object.assign(L.el.style, { left: '0px', width: w / 2 + 'px', right: 'auto' });
        Object.assign(L.el._half.style, { display: 'block', left: '0px', top: t + 'px', width: w / 2 + 'px', height: h + 'px' });
      }
      const b = Math.max(t + h, oy + 40);
      const ds = L.el.dataset.s;
      L.s = ds ? (ds.startsWith('sky') ? skyS + parseFloat(ds.slice(3)) : +ds) : (b - oy) / (Yf - oy);
      L.z = P * (1 - 1 / L.s);
      L.yb = oy + (b - oy) / L.s - t; // the bottom edge, in the layer's own pixels: the fold's hinge
      const at = (x0, dx) => { const cx = ox - x0, cy = oy - t; return `translate(${cx.toFixed(2)}px,${cy.toFixed(2)}px) scale(${(1 / L.s).toFixed(5)}) translate(${(-cx).toFixed(2)}px,${(-cy).toFixed(2)}px)` + (dx ? ` translate(${dx.toFixed(2)}px,0px)` : ''); };
      L.place = L.split ? at(0, l) : at(l, 0);
      if (L.split) L.place2 = at(0, l + w / 2);
      L.w = w; L.h = h;
      L.color = artColor(pg, L.el);
      paint(pg, L);
    }
    // back to front: the order layers stand up in (and fold down in, reversed)
    const sorted = [...pg.layers].sort((a, b) => a.s - b.s);
    sorted.forEach((L, k) => { L.ord = L.el.dataset.ord ? +L.el.dataset.ord : sorted.length > 1 ? k / (sorted.length - 1) : 1; L.lift = k * 0.7; });
    // the page: a floor the layers stand on, from under the viewer back to the foot of the sky.
    // Where ridges stand, the ground under each is the shade its foot fades into, so land runs on
    // between them. (Drawn at its full size: scaled up from a smaller box, Chrome left parts unpainted.)
    if (!pg.floor) { pg.floor = document.createElement('div'); pg.floor.className = 'floor'; pg.el.prepend(pg.floor); }
    const far = -P * (1 - 1 / skyS) - 1, near = P * 0.5, span = far + near, fl = PAL[pg.id].floor;
    const at = (z) => (clamp((near - z) / span) * 100).toFixed(2) + '%';
    const ground = pg.layers.filter((L) => L.color).sort((a, b) => b.z - a.z);
    Object.assign(pg.floor.style, {
      left: spineX + 'px', top: (Yf + 0.5) + 'px', width: W * 2.6 + 'px', height: span + 'px',
      transform: `translate3d(0px,0,${near}px) rotateX(-90deg)`,
      background: `url(${GRAIN}), ` +
        (ground.length ? `linear-gradient(${ground.map((L) => `${foot(L.color)} ${at(L.z)}`).join(', ')})` : `linear-gradient(${fl[0]}, ${fl[0]} ${at(0)}, ${fl[1]})`)
    });
    const [gNear, gFar] = ground.length ? [foot(ground[0].color), foot(ground[ground.length - 1].color)] : fl;
    Object.assign(pg.sky.ground.style, { top: (skr.bottom - sr.top) + 'px', background: `url(${GRAIN}), linear-gradient(${gFar}, ${gNear})` });
    pg.el.style.transformOrigin = `${spineX}px ${Yf}px`;
  }
  for (const p of panels) sizePanel(p);
  dirty = true;
}

// draw a layer's art at its own size (both halves, for a layer drawn in two)
function paint(pg, L) {
  const kind = L.el.dataset.art;
  if (!kind) return;
  const key = `${kind}:${L.w.toFixed(0)}x${L.h.toFixed(0)}:${L.split ? 2 : 1}`;
  if (L.el._key === key) return;
  L.el._key = key;
  const pal = PAL[pg.id], { w, h } = L;
  const art = (view) => {
    if (kind === 'sky') return skyArt(w, h, pal);
    if (kind === 'ridge') {
      const k = $$('[data-art="ridge"]', pg.el).indexOf(L.el);
      return ridgeArt(w, h, SHAPE[pg.id][k], L.color, pal.rim, pal.rimA[k], pal.haze, '', view);
    }
    // the mountain, with its trail and a dot for each year
    const pts = trailPoints(steps.length);
    const dots = pts.map(([x, y], k) => `<circle cx="${(x * w).toFixed(1)}" cy="${(y * h).toFixed(1)}" r="${k === pts.length - 1 ? 4 : 3}" fill="${k === pts.length - 1 ? '#ffb547' : '#e8f0f6'}"/>`).join('');
    const trail = `<path d="${trailPath(w, h)}" fill="none" stroke="#e8f0f6" stroke-opacity="0.45" stroke-width="1.4" stroke-dasharray="2 6" stroke-linecap="round"/>${dots}`;
    return ridgeArt(w, h, SHAPE.mountain, L.color, PAL.climb.rim, 0.75, PAL.climb.haze, trail, view);
  };
  L.el.querySelector(':scope > svg.art')?.remove();
  L.el.insertAdjacentHTML('afterbegin', art(L.split ? [0, w / 2] : [0, w]));
  if (L.split) L.el._half.innerHTML = art([w / 2, w / 2]);
}

/* ------------------------------------------------------------------ scroll, settle, pointer */
let p = 0, dirty = true, introT = reduced ? 1 : 0, introStart = 0;
const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => { ptr.tx = e.clientX / innerWidth * 2 - 1; ptr.ty = e.clientY / innerHeight * 2 - 1; }, { passive: true });

let lastScroll = 0, dir = 0, lastY = 0, tween = null, held = false;
addEventListener('scroll', () => {
  const y = scrollY;
  if (!tween) { lastScroll = performance.now(); if (y !== lastY) dir = Math.sign(y - lastY); }
  lastY = y; dirty = true;
}, { passive: true });
const stopTween = () => { tween = null; };
addEventListener('wheel', stopTween, { passive: true });
addEventListener('touchstart', () => { stopTween(); held = true; }, { passive: true });
addEventListener('touchend', () => { held = false; lastScroll = performance.now(); }, { passive: true });
addEventListener('keydown', stopTween);

function goTo(i, instant) {
  const y = clamp(i, 0, N - 1) * TURN;
  if (instant || reduced) { tween = null; scrollTo(0, y); return; }
  tween = { from: scrollY, to: y, t0: performance.now(), dur: 520 + Math.abs(y - scrollY) / TURN * 140 };
}
// after a scroll stops, finish the turn: a nudge past a fifth of a page commits to it
function settle(now) {
  if (tween) {
    const k = clamp((now - tween.t0) / tween.dur);
    scrollTo(0, lerp(tween.from, tween.to, easeOut(k)));
    if (k >= 1) tween = null;
    return;
  }
  if (held || now - lastScroll < 150) return;
  const f = p - Math.floor(p);
  if (f < 0.002 || f > 0.998) return;
  const target = dir > 0 ? Math.ceil(p - 0.2) : dir < 0 ? Math.floor(p + 0.2) : Math.round(p);
  goTo(target);
}

// links and focus land on the page that holds them
document.addEventListener('focusin', (e) => {
  const pg = e.target.closest?.('.page');
  if (pg) goTo(pages.findIndex((x) => x.el === pg), true);
});
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  const i = a ? pages.findIndex((x) => '#' + x.id === a.getAttribute('href')) : -1;
  if (i >= 0) { e.preventDefault(); goTo(i); }
});

/* ------------------------------------------------------------------ the frame */
const folio = $('#folio');
let shownFolio = -1;
function frame(now) {
  requestAnimationFrame(frame);
  settle(now);
  const np = clamp(scrollY / TURN, 0, N - 1);
  if (np !== p) { p = np; dirty = true; }
  if (introT < 1 && introStart) { introT = clamp((now - introStart) / 2200); dirty = true; }

  // the eye drifts a little with the pointer, so the layers part
  if (!reduced) {
    ptr.x += (ptr.tx - ptr.x) * 0.05; ptr.y += (ptr.ty - ptr.y) * 0.05;
    stage.style.perspectiveOrigin = `${(ox + ptr.x * W * 0.05).toFixed(1)}px ${(oy + ptr.y * H * 0.06).toFixed(1)}px`;
  } else stage.style.perspectiveOrigin = `${ox}px ${oy}px`;

  const cur = Math.round(p);
  if (cur !== shownFolio) {
    shownFolio = cur;
    folio.querySelector('b').textContent = cur + 1;
    folio.querySelector('i').textContent = pages[cur].el.dataset.name;
  }
  live.work = p > 1.25 && p < 2.75;
  live.craft = p > 2.25 && p < 3.75;
  if (live.work) tickPanels(now);

  // the backdrops shift a little with the pointer too, as the deepest thing in the scene
  const sx = reduced ? 0 : -ptr.x * W * 0.05 * 0.42, sy = reduced ? 0 : -ptr.y * H * 0.06 * 0.42;
  $('#skies').style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;

  if (!dirty) return;
  dirty = false;
  for (const pg of pages) { turn(pg); skyOf(pg); }
}

function skyOf(pg) {
  const i = pg.i, tin = p - (i - 1), tout = p - i;
  let op = 1;
  if (reduced) op = Math.round(p) === i ? 1 : 0;
  else if (tout > 0) op = 1 - easeInOut(clamp((tout - 0.3) / 0.32));
  else if (i > 0) op = easeInOut(clamp((tin - 0.3) / 0.32));
  pg.sky.wrap.style.opacity = op.toFixed(3);
  pg.sky.wrap.style.visibility = op > 0.001 ? 'visible' : 'hidden';
}

function turn(pg) {
  const i = pg.i, tin = p - (i - 1), tout = p - i;
  let visible;
  if (reduced) visible = Math.round(p) === i;
  else visible = (i === 0 || tin > 0.2) && tout < 0.999;
  pg.el.classList.toggle('off', !visible);
  if (!visible) return;
  let phi = 0;
  if (!reduced && tout > 0) phi = 180 * easeInOut(clamp((tout - 0.2) / 0.66));
  // the next page lies a little under this one, so this page hides it until it lifts away
  const under = !reduced && i > 0 && tin < 1 ? 14 * (1 - clamp((tin - 0.22) / 0.13)) : 0;
  pg.el.style.transform = phi > 0.01 ? `rotateZ(${(-phi).toFixed(2)}deg)` : under > 0.01 ? `translate3d(0px,${under.toFixed(2)}px,0px)` : '';
  for (const L of pg.layers) {
    let rise = 1;
    if (!reduced) {
      if (tout > 0) rise = 1 - easeInOut(clamp((tout - (1 - L.ord) * 0.16) / 0.3));
      else if (i > 0 && tin < 1) rise = snap(clamp((tin - 0.44 - L.ord * 0.24) / 0.3));
      if (i === 0 && introT < 1) rise = Math.min(rise, snap(clamp((introT - L.ord * 0.42) / 0.5)));
    }
    // on a page still to come, a layer pressed flat is out of sight under the page above
    const flat = tout <= 0 && rise < 0.002;
    L.el.style.visibility = flat ? 'hidden' : '';
    if (L.split) L.el._half.style.visibility = flat ? 'hidden' : '';
    const th = 90 * (1 - rise);
    const fold = `translate3d(0px,${(L.yb - L.lift).toFixed(2)}px,${L.z.toFixed(2)}px) rotateX(${th.toFixed(2)}deg) translate3d(0px,${(-L.yb).toFixed(2)}px,0px) `;
    L.el.style.transform = fold + L.place;
    if (L.split) L.el._half.style.transform = fold + L.place2;
  }
}

/* ------------------------------------------------------------------ live figures on the work page */
const dpr = Math.min(devicePixelRatio || 1, 2);
function sizePanel(p) {
  const w = p.c.clientWidth, h = p.c.clientHeight;
  if (!w || !h || (w === p.w && h === p.h)) return;
  p.w = w; p.h = h;
  p.c.width = Math.round(w * dpr); p.c.height = Math.round(h * dpr);
  if (p.fig) { p.fig.size(w, h); draw(p); }
}
function draw(p) {
  const ctx = p.c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0e0f12'; ctx.fillRect(0, 0, p.w, p.h);
  p.fig.draw(ctx);
}
function wake(p) {
  if (p.fig) return;
  p.fig = new FIG[p.id]({ color: PROJ[p.id].color, fx: () => {} });
  if (p.id === 'atlas') p.fig.external = true;
  p.fig.size(p.w, p.h);
  for (let k = 0; k < 90; k++) p.fig.step(1 / 60);
  draw(p);
}
for (const p of panels) {
  p.el.addEventListener('pointerenter', () => { p.hot = true; });
  p.el.addEventListener('pointerleave', () => { p.hot = false; p.fig?.leave?.(); });
  p.el.addEventListener('pointermove', (e) => {
    if (!p.fig) return;
    const r = p.c.getBoundingClientRect();
    // the panel is drawn in perspective, so map the pointer back through its on-screen box
    p.fig.move?.((e.clientX - r.left) / r.width * p.w, (e.clientY - r.top) / r.height * p.h);
  });
  p.el.addEventListener('focus', () => { p.hot = true; });
  p.el.addEventListener('blur', () => { p.hot = false; });
}
// the one under the pointer runs every frame; the rest take turns, so all seven stay alive
let rr = 0, lastTick = 0;
function tickPanels(now) {
  const dt = Math.min(0.05, (now - (lastTick || now)) / 1000); lastTick = now;
  for (const p of panels) if (!p.fig) { wake(p); return; } // one a frame, so waking them never stalls
  rr = (rr + 1) % panels.length;
  panels.forEach((p, k) => {
    if (p.hot || reduced) { p.fig.step(dt); draw(p); p.last = now; return; }
    if (k === rr || k === (rr + 3) % panels.length) { const d = Math.min(0.12, (now - (p.last || now)) / 1000) || dt; p.fig.step(d); draw(p); p.last = now; }
  });
}

/* ------------------------------------------------------------------ start */
let rz = 0;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const i = p; layout(); scrollTo(0, i * TURN); }, 120); });
function start() {
  layout();
  const h = location.hash.slice(1), i = pages.findIndex((x) => x.id === h);
  if (i > 0) { scrollTo(0, i * TURN); introT = 1; }
  else if (scrollY > 2) introT = 1;
  introStart = performance.now() + 250;
  requestAnimationFrame(frame);
}
(document.fonts?.ready || Promise.resolve()).then(start);

window.__book = { get p() { return p; }, get page() { return Math.round(p); }, get intro() { return introT; }, pages, goTo, set hold(v) { held = v; } };
