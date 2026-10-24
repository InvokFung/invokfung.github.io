// The portfolio as one paper landscape you move through: a day on a mountain, from first light on
// the cover to last light at contact. The page is one sticky stage and the scroll is the browser's
// own; it carries a camera through five scenes, without a cut, a turn or a snap.
//
// Every scene is a stack of paper, laid out flat by CSS. Each box gets a depth from where its bottom
// edge sits (lower on the screen is nearer, as in a diorama seen from above) and a scale that keeps
// it exactly where CSS put it. The landscape is painted on one WebGL canvas (scenery.js); the page's
// own words, flags, panels and specimens stand in front of it in CSS 3D, under the same projection.
//
// The scenes are placed in one world and the camera travels between them, a different way each
// time, so each move tells you something:
//   Hello → Climb    part:   the sea of cloud parts down the middle and the peaks tear, like a
//                            curtain; the mountain stands up behind it
//   Climb → Work     fly:    the camera flies to the 2026 camp; the work stands up there, under the
//                            camp's light
//   Work  → Craft    pan:    the camera pans along the camp; the panels lie down and the specimens
//                            stand up, each in a wave
//   Craft → Contact  clouds: the camera climbs; clouds rise, then part on the summit, now clear
// Everything is a function of the scroll position, so scrolling back plays it all in reverse.
//
// Round 5 (this folder), after two reels of portfolios that present their work louder than ours:
//   - the work is a drum of all seven, one in front at a time, big and running, its name huge behind
//     it. The scroll holds at the work while it turns the drum, and the drum can be grabbed and
//     turned by hand (which scrolls the page; nothing snaps).
//   - Climb → Work opens a window shaped like a peak at the camp, and the work is seen whole through
//     it as it grows, in place of the grey cloud the camera used to fly through.
//   - a pointer that says what it does over the drum (drag, open).
import { mountSpecimens } from '../book/specimens.js';
import { createScenery } from './scenery.js';
import { clamp, lerp, tint, rgba, skyline, valley, foot, along, trail, pennant, paintSky, paintRidge, paintMist, paintWisp, paintSea, paintPuff, paintRadial, paintFloor, paintText } from '../unfold/art.js';

const D = window.PORTFOLIO, F = window.Figs;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const md = (t) => esc(t).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, w, u) => `<a href="${u}">${w}</a>`);
const get = (path) => path.split('.').reduce((o, k) => o?.[k], D);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const bell = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
const smooth = (a, b, t) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };
// paper standing up: it lifts off the floor slowly, swings up, goes a little past upright and settles
const stand = (t) => {
  const c = 1.2 * 1.525;
  return Math.max(0, t < 0.5 ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2 : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2);
};
const narrow = () => innerWidth <= 760;

for (const el of $$('[data-md]')) el.innerHTML = md(get(el.dataset.md));
const rk = (el) => +el.className.match(/\br(\d)\b/)[1] - 1; // which ridge: r1 is the farthest
const sk = (el) => +el.className.match(/\bs(\d)\b/)[1];      // which sea of cloud: s0 is the farther

/* ------------------------------------------------------------------ how much the landscape may cost */
// The cost is all in pixels, so below high the canvas is drawn coarser while the scroll moves
// (res × move), where blur goes unseen, and sharp again the moment it stops, a single frame. high:
// up to 1.5 device pixels per CSS pixel throughout; mid: 0.75 moving; low: 0.55 moving, and nothing
// drifts on its own or with the pointer; least: 0.34 moving. It starts from what the device says
// about itself, steps down a tier when frames run slow while moving, and ?q=least|low|mid|high pins
// one.
const TIERS = {
  high: { res: Math.min(devicePixelRatio || 1, 1.5), move: 1, art: 1, idle: true },
  mid: { res: 1, move: 0.75, art: 0.85, idle: true },
  low: { res: 1, move: 0.55, art: 0.7, idle: false },
  least: { res: 0.85, move: 0.4, art: 0.6, idle: false }
};
const ORDER = ['high', 'mid', 'low', 'least'];
const pinned = new URLSearchParams(location.search).get('q');
let tier = TIERS[pinned] ? pinned : (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 ? 'mid' : 'high';

const stage = $('#stage'), scroller = $('#scroll'), land = $('#land');
const gl = createScenery(land, { onRestore: () => { dirty = true; } });
if (gl?.software && !TIERS[pinned]) tier = 'least';
// with no WebGL, the painted landscape sits flat in its boxes and the scenes cross-fade
if (!gl) document.documentElement.classList.add('nogl');
const reduced = !gl || matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ the light, and the land's shapes */
// A day on the mountain: first light on the cover, a clear morning for the climb, afternoon at the
// camp for the work, golden hour for the craft, and last light at contact.
const PAL = {
  cover: { sky: ['#090b11', '#151826', '#463645', '#a8694a'], sun: { x: 0.6, y: 0.93, r: 0.05, c: '#ffe1b0', glow: ['#ffaa60', 0.5] },
    ridges: ['#6f5f6a', '#4d4555', '#121218'], rim: '#ffd3a1', rimA: [0.85, 0.6, 0.22], haze: 'rgba(255,205,165,0.22)', mist: '#ffd6aa', wisp: ['#b08a96', '#ffd2aa'],
    // the sea of cloud, drawn live: its lit tops, its shade and the shade deep down between heaps
    deck: { lit: tint('#ffc9a0'), shade: tint('#7a6482'), deep: tint('#2a2236'), feet: '#8a6670' },
    // painted, where it can't be drawn live: the far sea, toward the sun, and the near one
    sea: [{ light: '#ffd9b0', body: '#8a7488', deep: '#4a3e52', haze: '#a8694a', seed: 3, rows: 4, R: [5, 10], top: 0.12, heap: 1.4, glare: 0.3, fade: 0.3 },
      { light: '#ffd2a6', body: '#5e5068', deep: '#2a2433', haze: '#7a5a62', seed: 5, rows: 5, R: [12, 34], top: 0.07, heap: 1.8, glare: 0.25 }] },
  climb: { sky: ['#070a10', '#111925', '#2a3a4d', '#64798e'], sun: { x: 0.86, y: 0.5, r: 0, c: '#f3f6f8', glow: ['#dcebf5', 0.22] },
    ridges: ['#566a7e', '#12171e'], mountain: '#33414f', face: { at: [0.56, 0.8], side: 1, light: '#9fb6cb', a: 0.32 }, rim: '#e8f0f6', rimA: [0.6, 0.3], haze: 'rgba(215,230,240,0.18)', cloud: { light: '#ffffff', body: '#c5d0da', deep: '#8193a5' } },
  work: { sky: ['#080c13', '#111b29', '#24364b', '#5d6f80'], sun: { x: 0.18, y: 0.2, r: 0, c: '#ffffff', glow: ['#e6eef6', 0.12] },
    summit: '#2a394b', face: { at: [0.5], side: -1, light: '#a9c0d6', a: 0.3 }, ridges: ['#1d2937', '#131a24'], rim: '#d6e4f0', rimA: [0.42, 0.3], haze: 'rgba(205,222,240,0.12)', mist: '#cfdceb',
    cloud: { light: '#f4f7fa', body: '#a9b6c4', deep: '#5d6d7e' } },
  craft: { sky: ['#0a0910', '#1e1520', '#5c3430', '#d98c50'], sun: { x: 0.72, y: 0.97, r: 0.04, c: '#ffe6b8', glow: ['#ffa458', 0.55] },
    ridges: ['#2a1c22', '#1b1217', '#0f0b0e'], rim: '#ffc27a', rimA: [0.75, 0.55, 0.4], haze: 'rgba(255,176,104,0.28)', mist: '#ffb27a' },
  contact: { sky: ['#05060a', '#0c0f1d', '#2a2140', '#94523c'], sun: { x: 0.2, y: 1.0, r: 0.06, c: '#ffb07a', glow: ['#ff8250', 0.45] },
    summit: '#3a2d43', face: { at: [0.5], side: -1, light: '#ff9d76', a: 0.3 }, ridges: ['#2b2332', '#19151f', '#0c0b10'], rim: '#ffa679', rimA: [0.55, 0.32, 0.2], haze: 'rgba(255,150,110,0.16)' }
};
// the silhouette of each ridge: where its peaks sit, as fractions of its own box
const SHAPE = {
  // the cover: two far ranges of peaks standing out of the cloud, and the rock you stand on
  cover: [
    { seed: 11, base: 0.22, peaks: [[0.1, 0.62, 0.05], [0.4, 0.98, 0.055], [0.52, 0.7, 0.05], [0.76, 0.74, 0.06]], rough: 0.12 },
    { seed: 23, base: 0.25, peaks: [[0.2, 0.82, 0.05], [0.63, 0.55, 0.06], [0.9, 0.92, 0.055]], rough: 0.12 },
    { seed: 53, base: 0.6, peaks: [[0.1, 0.92, 0.2], [0.88, 0.95, 0.18]], rough: 0.06 }
  ],
  climb: [
    { seed: 91, base: 0.3, peaks: [[0.12, 0.8, 0.08], [0.3, 0.95, 0.07], [0.5, 0.6, 0.1]], rough: 0.14 },
    { seed: 97, base: 0.5, peaks: [[0.15, 0.85, 0.18], [0.8, 0.95, 0.16]], rough: 0.06 }
  ],
  work: [
    { seed: 31, base: 0.3, peaks: [[0.1, 0.75, 0.1], [0.34, 0.5, 0.1], [0.82, 0.8, 0.12]], rough: 0.12 },
    { seed: 33, base: 0.35, peaks: [[0.22, 0.85, 0.15], [0.62, 0.55, 0.12], [0.96, 0.8, 0.1]], rough: 0.08 }
  ],
  craft: [
    { seed: 43, base: 0.3, peaks: [[0.15, 0.75, 0.1], [0.45, 0.95, 0.08], [0.72, 0.6, 0.1]], rough: 0.14 },
    { seed: 47, base: 0.35, peaks: [[0.05, 0.9, 0.1], [0.36, 0.62, 0.12], [0.86, 0.88, 0.12]], rough: 0.1 },
    { seed: 49, base: 0.5, peaks: [[0.25, 0.85, 0.16], [0.7, 0.92, 0.15]], rough: 0.06 }
  ],
  contact: [
    { seed: 67, base: 0.4, peaks: [[0.1, 0.9, 0.12], [0.46, 0.7, 0.14], [0.86, 0.85, 0.1]], rough: 0.12 },
    { seed: 71, base: 0.5, peaks: [[0.15, 0.95, 0.16], [0.82, 0.9, 0.16]], rough: 0.1, dip: [0.5, 0.35, 0.3] },
    { seed: 79, base: 0.62, peaks: [[0.3, 0.8, 0.22], [0.75, 0.86, 0.2]], rough: 0.05 }
  ],
  // the climb's mountain: a trail to a camp on its shoulder, where 2026 stands, and a higher
  // summit beyond it, in cloud
  mountain: { seed: 5, base: 0.3, peaks: [[0.18, 0.42, 0.1], [0.36, 0.52, 0.08], [0.47, 0.62, 0.07], [0.56, 0.75, 0.07], [0.78, 0.86, 0.14], [0.8, 0.99, 0.05]], rough: 0.04 },
  // the same summit, seen from the camp in the afternoon, and clear at last light
  summit: { seed: 13, base: 0.08, peaks: [[0.5, 0.99, 0.085], [0.38, 0.64, 0.08], [0.63, 0.72, 0.07], [0.2, 0.36, 0.1], [0.86, 0.42, 0.1]], rough: 0.035 }
};
// the trail up the mountain, in fractions of its box (x, y from the top): to the camp, then on into
// the cloud
const TRAIL = [[0.14, 0.92], [0.28, 0.84], [0.23, 0.74], [0.37, 0.66], [0.33, 0.56], [0.46, 0.47], [0.56, 0.31]];
const BEYOND = [[0.56, 0.31], [0.6, 0.38], [0.65, 0.41], [0.69, 0.33], [0.72, 0.26], [0.745, 0.2]];
// and up the summit at contact, from where you stand to the top
const TRAIL_UP = [[0.36, 1.02], [0.46, 0.86], [0.4, 0.72], [0.5, 0.58], [0.46, 0.44], [0.5, 0.26]];
const peakOf = (sh, a, b) => { const f = skyline(sh); let x = a, y = 0; for (let q = a; q <= b; q += 0.002) if (f(q) > y) { y = f(q); x = q; } return [x, y]; };

/* ------------------------------------------------------------------ scene 2: the climb, from data.js */
const steps = D.path; // oldest first
const stepsEl = $('#steps');
stepsEl.innerHTML = steps.map((s, k) => {
  const now = k === steps.length - 1;
  return `<li class="layer step-flag${now ? ' now' : ''}" data-k="${k}" tabindex="0">
    <span class="pole" aria-hidden="true"></span>
    <p class="tag"><b>${esc(s.y)}${now ? ' · so far' : ''}</b><span>${esc(s.r)}</span></p>
    <p class="d">${esc(s.d)}</p>
  </li>`;
}).join('');

/* ------------------------------------------------------------------ scene 3: the work, on a drum */
// All seven on a drum, FDE work first. One stands in front at a time, big enough to read, running;
// the others wrap away round the drum each side. Its name stands huge behind it, and the number and
// what to try in it at the top right.
const PROJ = Object.fromEntries(D.projects.map((p) => [p.id, p]));
const WORK = ['relay', 'tracewise', 'onboard', 'dispatch', 'atlas', 'intonation', 'layerline'], LAST = WORK.length - 1;
const SHORT = { atlas: 'Atlas', intonation: 'Intonation' }; // the huge name is one word
const FIG = { relay: F.Relay, tracewise: F.Tracewise, onboard: F.Onboard, dispatch: F.Dispatch, atlas: F.Atlas, intonation: F.Studio, layerline: F.Layerline };
const drumEl = $('#drum'), titleEl = $('#title'), countEl = $('#count');
drumEl.innerHTML = WORK.map((id, k) => {
  const p = PROJ[id], L = D.live[id];
  const nums = p.metrics.slice(0, 2).map(([n, l]) => `<span class="num"><b>${esc(n)}</b><small>${esc(l)}</small></span>`).join('');
  return `<a class="tile" role="listitem" data-id="${id}" data-k="${k}" href="/explore/#work/${id}" draggable="false" style="--c:${p.color}" aria-label="${esc(p.name)}, ${esc(p.kind)}. ${esc(L.tag[0])} ${esc(L.tag[1])}. ${esc(L.line)}">
    <canvas aria-hidden="true"></canvas>
    <span class="bar" aria-hidden="true">${nums}<span class="nm"><i></i>${esc(p.name)}</span></span>
  </a>`;
}).join('');
titleEl.innerHTML = WORK.map((id) => `<span class="word">${[...(SHORT[id] || PROJ[id].name)].map((c) => `<span class="ch">${esc(c)}</span>`).join('')}</span>`).join('');
countEl.innerHTML = `<p class="n"><b>01</b><span>/ ${String(WORK.length).padStart(2, '0')}</span></p><p class="kind"></p><p class="try"></p>`;
const tiles = $$('.tile', drumEl).map((el) => ({ el, id: el.dataset.id, k: +el.dataset.k, c: $('canvas', el), fig: null, w: 0, h: 0, zoom: 1, hot: false, last: 0, shown: '' }));
const words = $$('.word', titleEl).map((el) => ({ el, chs: $$('.ch', el), shown: null }));
// the drum: the front one's box, and the turn between two (deg) and the drum's radius (px)
let DRUM = { w: 0, h: 0, a: 30, R: 1 };
function drumLayout(W, H) {
  const ph = narrow();
  const w = ph ? W * 0.84 : Math.min(W * 0.5, H * 0.84);
  const h = ph ? Math.min(H * 0.4, w * 1.05) : Math.min(w * 0.62, H * 0.5);
  const b = ph ? H * 0.79 : H * 0.92;
  return { l: (W - w) / 2, t: b - h, w, h };
}
/* ------------------------------------------------------------------ scene 4: the craft */
let moving = false;
const specs = mountSpecimens($('#specs'), { isLive: () => live.craft, slow: () => moving || tier !== 'high' });
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

/* ------------------------------------------------------------------ the scenes, measured */
let W = 0, H = 0, P = 0, ox = 0, oy = 0, Yf = 0, STEP = 1, DZ = 0;
// the scroll holds at the work (HOLDAT) while it turns the drum, HS of it a project
const HOLDAT = 2;
let HS = 1, HOLD = 0;
const scenes = $$('.page').map((el, i) => ({ el, i, id: el.id, items: [], floor: null, sky: null }));
const N = scenes.length;
const live = { work: false, craft: false };
let A = [], veil = [], camp = null, painted = [], radial = null, drumGlow = [];
const mists = new Map();

function place(el, r) { Object.assign(el.style, { left: r.l + 'px', top: r.t + 'px', width: r.w + 'px', height: r.h + 'px', right: 'auto', bottom: 'auto' }); }

function layout() {
  W = stage.clientWidth; H = stage.clientHeight;
  P = Math.max(W, H) * 1.2;
  ox = W / 2; oy = -0.4 * H; Yf = H;
  STEP = H * (narrow() ? 0.8 : 0.9); // the scroll from one scene to the next
  DZ = P * 0.42;                      // and how far apart two scenes stand
  HS = STEP * (narrow() ? 0.5 : 0.55); // and the scroll that turns the drum one project on
  HOLD = LAST * HS;
  scroller.style.height = ((N - 1) * STEP + HOLD + H) + 'px';
  threadH = thread ? thread.clientHeight : 0;
  threadLayout();
  stage.style.perspective = P + 'px';
  for (const t of painted) gl?.release(t);
  painted = [];
  const T = (c, o) => { if (!gl) return null; const t = gl.texture(c, o); painted.push(t); return t; };
  const K = TIERS[tier].art, KT = Math.min(devicePixelRatio || 1, 2);

  for (const sc of scenes) {
    sc.el.style.transform = '';
    sc.el.style.opacity = '';
    sc.el.classList.remove('off');
    for (const el of $$('.layer', sc.el)) Object.assign(el.style, { transform: 'none', opacity: '', visibility: '' });
  }
  // boxes that depend on the screen
  const mt = $('.mountain'), sr0 = stage.getBoundingClientRect(), mr = mt.getBoundingClientRect();
  const pts = along(TRAIL, steps.length);
  $$('.step-flag', stepsEl).forEach((el) => {
    const k = +el.dataset.k, [fx, fy] = pts[k];
    const x = mr.left - sr0.left + fx * mr.width, y = mr.top - sr0.top + fy * mr.height, fh = H * (narrow() ? 0.075 : 0.095);
    el.style.width = '';
    const fw = el.querySelector('.tag').offsetWidth + 2;
    const left = x + fw > W - 12 || el.classList.contains('now');
    el.classList.toggle('left', left);
    place(el, { l: left ? x - fw : x, t: y - fh, w: fw, h: fh });
  });
  // the drum, the huge name behind it (each word sized to fit the screen), and the number
  const dr = drumLayout(W, H);
  place(drumEl, dr);
  {
    const ph = narrow(), gap = dr.w * (ph ? 0.08 : 0.06);
    DRUM = { w: dr.w, h: dr.h, a: ph ? 36 : 30 };
    DRUM.R = (dr.w + gap) / (2 * Math.sin(DRUM.a * Math.PI / 360));
    const fs = ph ? W * 0.25 : Math.min(W * 0.17, H * 0.3);
    place(titleEl, { l: 0, t: dr.t - fs * 0.7, w: W, h: fs * 1.08 });
    titleEl.style.fontSize = fs + 'px';
    for (const wd of words) { wd.el.style.fontSize = ''; const k = Math.min(1, (W - 2 * Math.max(16, W * 0.04)) / wd.el.scrollWidth); wd.el.style.fontSize = (k < 1 ? fs * k : fs) + 'px'; }
    shownT = NaN;
  }
  craftLayout(W, H).forEach((r, i) => place(specs.items[i].el, r));

  const sr = stage.getBoundingClientRect();
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - sr.left, t: r.top - sr.top, w: r.width, h: r.height }; };
  const sFrom = (bottom) => (Math.max(bottom, oy + 40) - oy) / (Yf - oy);
  const mtS = sFrom(box(mt).t + box(mt).h);
  $$('.step-flag', stepsEl).forEach((el) => { const k = +el.dataset.k; el.dataset.s = (mtS + 0.015 + k * 0.002).toFixed(4); el.dataset.ord = (0.45 + k * 0.08).toFixed(3); });

  stage.classList.add('paint'); // the words in the landscape, in their real colours, to paint them
  for (const sc of scenes) {
    const pal = PAL[sc.id];
    const hz = parseFloat(getComputedStyle(sc.el).getPropertyValue('--hz')) / 100 || 0.5;
    sc.hy = hz * H; sc.skyS = sFrom(sc.hy); sc.skyZ = P * (1 - 1 / sc.skyS);
    sc.items = [];
    // every box gets its depth from its bottom edge (or says where it stands, as "sky+0.03")
    const item = (el, role, b, s) => {
      const z = P * (1 - 1 / s), bot = Math.max(b.t + b.h, oy + 40);
      const it = { el, role, b, s, z, Yb: oy + (bot - oy) / s, ord: 0, xf: clamp((b.l + b.w / 2) / W), alpha: 1, rise: 1, dx: 0, dy: 0 };
      sc.items.push(it);
      return it;
    };
    const sOf = (el, b) => { const ds = el.dataset.s; return ds ? (ds.startsWith('sky') ? sc.skyS + parseFloat(ds.slice(3)) : +ds) : sFrom(b.t + b.h); };

    // the landscape
    for (const el of $$('.gl', sc.el)) {
      const art = el.dataset.art, b = box(el);
      el.querySelector(':scope > canvas')?.remove();
      if (art === 'sky') {
        // drawn by the shader; painted only when there is no WebGL
        if (!gl) el.append(paintSky(b.w, b.h, 0.5, { sky: pal.sky, sun: { ...pal.sun, glow: `rgba(${tint(pal.sun.glow[0]).map((v) => Math.round(v * 255))},${pal.sun.glow[1]})` }, ground: [foot(pal.summit || pal.ridges[0]), foot(pal.ridges[pal.ridges.length - 1])] }, sc.hy - b.t, -0.3 * H - b.t, -0.12 * W + pal.sun.x * 1.24 * W));
        continue;
      }
      let c, it;
      if (art === 'mist' || art === 'wisp') {
        // (a wisp: thin cloud across the peaks, lit by the low sun; each its own, by its seed)
        const seed = +(el.dataset.seed || 3), key = art === 'wisp' ? `wisp${seed}` : pal.mist;
        if (!mists.has(key) || !gl) mists.set(key, art === 'wisp' ? paintWisp(pal.wisp[0], pal.wisp[1], seed) : paintMist(pal.mist));
        c = mists.get(key);
        it = item(el, 'mist', b, sOf(el, b));
        it.tex = T(c, { repeat: true });
        it.speed = +(el.dataset.speed || 1);
        if (!gl) { const cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0); el.append(cv); }
        continue;
      }
      if (art === 'text') {
        c = paintText(el, { l: b.l + sr.left, t: b.t + sr.top, w: b.w, h: b.h }, KT);
        it = item(el, 'text', b, sOf(el, b));
      } else if (art === 'sea') {
        // the sea of cloud is drawn live (deck.js); painted, it stands in only where that can't be
        if (gl?.deck) continue;
        // cloud runs on past each end like the land, and is lit from where the sky's sun stands (and
        // painted coarser: it's soft, and big)
        const o = pal.sea[sk(el)], sd = Math.round(b.w * 0.22), sunX = -0.12 * W + pal.sun.x * 1.24 * W;
        c = paintSea(b.w + 2 * sd, b.h, K * 0.7, { ...o, sun: (sunX - b.l + sd) / (b.w + 2 * sd), R: o.R.map((v) => v * H / 900 * (narrow() ? 0.75 : 1)) });
        it = item(el, 'paper', b, sOf(el, b));
        it.art = art; it.color = o.body; it.side = sd; it.drift = W * 0.005; // (the land under cloud is cloud)
      } else {
        const big = art !== 'ridge', k = big ? 0 : rk(el);
        // land runs on past each end, for when a scene is seen from further off than at rest
        const opt = { H, color: big ? pal[art] : pal.ridges[k], rim: pal.rim, rimA: big ? 0.7 : pal.rimA[k], haze: pal.haze, pad: big ? Math.round(H * 0.08) : 0, side: Math.round(b.w * 0.22), face: big ? pal.face : null };
        // (peaks standing in the sea of cloud go down into its haze, not into shade)
        if (gl?.deck && pal.deck && k < 2) opt.low = pal.deck.feet;
        if (art === 'ridge') c = paintRidge(b.w, b.h, K, SHAPE[sc.id][k], opt);
        else if (art === 'mountain') c = paintRidge(b.w, b.h, K, SHAPE.mountain, opt, (x, f) => mountainMarks(x, f, b.w, b.h, W - b.l));
        else c = paintRidge(b.w, b.h, K, SHAPE.summit, opt, (x, f) => summitMarks(x, f, b.w, b.h, sc.id === 'contact'));
        it = item(el, 'paper', b, sOf(el, b));
        it.art = art; it.color = opt.color; it.pad = opt.pad; it.side = opt.side;
      }
      it.tex = T(c);
      if (!gl) {
        // without WebGL the painting sits in its box, running on past it as it does on the canvas
        const pd = it.pad || 0, sd = it.side || 0;
        c.style.cssText = `left:${-sd}px;top:${-pd}px;width:${b.w + 2 * sd}px;height:${b.h + pd}px`;
        el.append(c);
      }
      // a sheet that tears in two: down its lowest point, or between its words
      if ('tear' in el.dataset) it.pieces = tear(el, it, art === 'ridge' ? SHAPE[sc.id][rk(el)] : null, it.side || 0);
    }
    // the page's own content
    for (const el of $$('.layer', sc.el)) {
      const b = box(el), s = sOf(el, b);
      const role = el.classList.contains('drum') ? 'panel' : el.classList.contains('spec') ? 'spec' : el.classList.contains('step-flag') ? 'flag' : el.classList.contains('foot') ? 'foot' : 'words';
      const it = item(el, role, b, s);
      it.dom = true;
      it.yb = it.Yb - b.t; // the bottom edge, in the layer's own pixels: the fold's hinge
      const cx = ox - b.l, cy = oy - b.t;
      // (the drum stands in 3D inside its box, so its depth is scaled with it)
      const sc3 = el === drumEl ? `scale3d(${(1 / s).toFixed(5)},${(1 / s).toFixed(5)},${(1 / s).toFixed(5)})` : `scale(${(1 / s).toFixed(5)})`;
      it.place = `translate(${cx.toFixed(2)}px,${cy.toFixed(2)}px) ${sc3} translate(${(-cx).toFixed(2)}px,${(-cy).toFixed(2)}px)`;
      if (role === 'flag') { it.k = +el.dataset.k; it.now = el.classList.contains('now'); }
    }
    // back to front: the order things stand up in (and lie down in, reversed)
    const sorted = sc.items.filter((it) => it.role !== 'mist').sort((a, b) => a.s - b.s);
    sorted.forEach((it, k) => { it.ord = it.el.dataset.ord ? +it.el.dataset.ord : sorted.length > 1 ? k / (sorted.length - 1) : 1; });
    for (const it of sc.items) if (it.role === 'mist') it.ord = sorted.find((o) => o.s >= it.s)?.ord ?? 1;

    // the floor, from just in front of the screen back to the foot of the sky. Under each ridge the
    // ground is the shade its foot fades into, so land runs on between them; the far edge fades.
    const near = P * 0.6, far = sc.skyZ, at = (z) => (near - z) / (near - far);
    const ground = sc.items.filter((it) => it.color).sort((a, b) => b.z - a.z);
    sc.ground = foot(ground[ground.length - 1].color); // the land at the horizon, under the farthest ridge
    sc.floor = { tex: T(paintFloor(ground.map((it) => [at(it.z), foot(it.color)]))), near, far, half: W * 2.6 };
    sc.sky = skyOf(sc, pal);
  }
  stage.classList.remove('paint');
  seaLayout(scenes[0]);

  radial = radial || paintRadial();
  const glow = T(radial);
  // the camp on the climb's mountain: a warm light, and the point the camera flies to
  {
    const sc = scenes[1], mtI = sc.items.find((it) => it.art === 'mountain'), b = mtI.b, [cx, cy] = TRAIL[TRAIL.length - 1];
    const fx = b.l + cx * b.w, fy = b.t + cy * b.h, r = Math.max(46, W * 0.05);
    // (it folds about its mountain's foot, as if painted on it)
    const g = { role: 'soft', b: { l: fx - r, t: fy - r * 0.8, w: r * 2, h: r * 1.6 }, s: mtI.s * 1.001, Yb: mtI.Yb, ord: mtI.ord, tex: glow, blend: 'add', tintC: tint('#ffb15e'), base: 0.55, pulse: true };
    g.z = P * (1 - 1 / g.s);
    sc.items.push(g);
    camp = { X: ox + (fx - ox) / mtI.s, Y: oy + (fy - oy) / mtI.s, Z: mtI.z };
    // and the cloud that hides the way from the camp to the summit
    summitCloud(sc, mtI, peakOf(SHAPE.mountain, 0.7, 0.9), PAL.climb.cloud, T, 0.17, 0.26);
  }
  {
    const sc = scenes[2], sm = sc.items.find((it) => it.art === 'summit');
    summitCloud(sc, sm, peakOf(SHAPE.summit, 0.4, 0.6), PAL.work.cloud, T, 0.2, 0.34);
  }
  // pools of light under the drum and the specimens, and a glow behind the drum (in the front
  // project's colour, which the drum sets as it turns)
  drumGlow = [];
  for (const [sc, role, col] of [[scenes[2], 'panel', null], [scenes[3], 'spec', '#ffb36b']]) {
    for (const it of sc.items.filter((o) => o.role === role)) {
      const c = tint(col || PROJ[WORK[0]].color), b = it.b;
      const x0 = ox + (b.l - b.w * 0.25 - ox) / it.s, x1 = ox + (b.l + b.w * 1.25 - ox) / it.s;
      const pool = { role: 'pool', owner: it, mode: 1, b: { l: x0, t: 0, w: x1 - x0, h: 0 }, fl: [it.z + P * 0.07, it.z - P * 0.05, Yf, 0], z: it.z, s: it.s, ord: it.ord, tex: glow, blend: 'add', tintC: c, base: col ? 0.42 : 0.5 };
      sc.items.push(pool);
      if (role === 'panel') {
        const e = Math.max(b.w, b.h) * 0.3;
        const hb = { l: b.l - e, t: b.t - e, w: b.w + 2 * e, h: b.h + 2 * e };
        const halo = { role: 'halo', owner: it, b: hb, s: it.s * 0.999, z: it.z - 1, Yb: it.Yb, ord: it.ord, tex: glow, blend: 'add', tintC: c, base: 0.34 };
        sc.items.push(halo);
        drumGlow = [pool, halo];
      }
    }
  }
  // the clouds between the craft and contact: three banks, nearer ones paler and lit, billowing up
  // and lit along their tops from the low sun on the left. Big and slow to paint, and not wanted
  // until the fourth scene, so painted once the first is on screen (or when first wanted, if sooner).
  veil = [];
  const VEIL = [
    { s: 0.72, t: -0.16, light: '#ffc2a0', body: '#6a4a62', deep: '#2e2238', seed: 3 },
    { s: 0.88, t: 0.02, light: '#ffcfae', body: '#59405a', deep: '#2a1f34', seed: 5 },
    { s: 1.04, t: 0.2, light: '#ffd9bc', body: '#4a3550', deep: '#1f1828', seed: 9 }
  ];
  VEIL.forEach((v, n) => {
    const b = { l: -0.3 * W, t: v.t * H, w: 1.6 * W, h: 1.3 * H };
    const it = { role: 'veil', n, b, s: v.s, z: P * (1 - 1 / v.s), cutX: 0.5 + (n - 1) * 0.04 };
    it.paint = () => T(paintSea(b.w, b.h, Math.min(0.5, K), { ...v, haze: v.body, sun: 0.27, rows: 3, R: [42, 80].map((r) => r * H / 900), top: 0.05, heap: 2.4, glare: 0.18, rim: 0.4 }));
    it.Yb = oy + (b.t + b.h - oy) / it.s;
    veil.push(it);
  });
  if (gl && !reduced) later(() => veil.forEach(paintVeil));

  // where each scene stands in the world, and so how the camera moves between them
  const flyZ = P * 0.7, Z1 = camp.Z + flyZ, ty = H * 0.62;
  const FLY = [camp.X - ox, camp.Y - (oy + (ty - oy) * (P - Z1) / P), -flyZ];
  A = [[0, 0, 0]];
  A[1] = [0, 0, -DZ];
  A[2] = A[1].map((v, k) => v + FLY[k]);
  A[3] = [A[2][0] + W * 1.25, A[2][1], A[2][2]];
  A[4] = [A[3][0], A[3][1] - H * 1.0, A[3][2] - P * 0.25];

  for (const t of tiles) sizeTile(t);
  sizeCanvas();
  dirty = true;
}
// the sky's colours and where its horizon and sun sit when the scene is at rest
function skyOf(sc, pal) {
  const s = pal.sun, g0 = sc.ground, g1 = sc.ground;
  const span = sc.hy + 0.3 * H;
  const sunX = -0.12 * W + s.x * 1.24 * W, sunY = -0.3 * H + s.y * span;
  const r = s.r * Math.min(1.24 * W, span * 1.6), gr = Math.max(r, 0.05 * Math.min(1.24 * W, span * 1.6)) * 6;
  return {
    colours: new Float32Array([...pal.sky, g0, g1, s.c].flatMap(tint)),
    span, sunX, sunY, r, gr, glow: [...tint(s.glow[0]), s.glow[1]],
    // the sun stands at the far edge of the floor, with the horizon
    sunW: [ox + (sunX - ox) / sc.skyS, oy + (sunY - oy) / sc.skyS]
  };
}
// Split a sheet in two for the cover's parting: down its lowest point (a ridge), or between its two
// words (the name), as two pieces that share its texture, each keeping its own side of the cut.
function tear(el, it, shape, side) {
  // cloud parts down its middle, softly
  // (each half runs on past the cut by its soft edge, so where they meet one is always whole)
  if (it.art === 'sea') return [-1, 1].map((s) => ({ side: s, sub: s < 0 ? [0, 0, 0.56, 1] : [0.44, 0, 1, 1], cut: [0.5 - s * 0.03, s, 0.016, 24], soft: 0.03 }));
  if (shape) {
    const w = it.b.w, x = (side + valley(shape, 0.36, 0.64) * w) / (w + 2 * side);
    return [{ side: -1, sub: [0, 0, Math.min(1, x + 0.05), 1], cut: [x, -1, 0.012, 34] }, { side: 1, sub: [Math.max(0, x - 0.05), 0, 1, 1], cut: [x, 1, 0.012, 34] }];
  }
  const [a, b] = $$('span', el).map((s) => s.getBoundingClientRect()), r = el.getBoundingClientRect();
  if (b.top >= a.bottom - 2) { // stacked, as on a phone: cut across, between the lines
    const y = ((a.bottom + b.top) / 2 - r.top) / r.height;
    return [{ side: -1, sub: [0, 0, 1, y], cut: [y, -1, 0, -1] }, { side: 1, sub: [0, y, 1, 1], cut: [y, 1, 0, -1] }];
  }
  const x = ((a.right + b.left) / 2 - r.left) / r.width;
  return [{ side: -1, sub: [0, 0, x, 1], cut: [x, -1, 0, 1] }, { side: 1, sub: [x, 0, 1, 1], cut: [x, 1, 0, 1] }];
}
// A cloud hanging on a summit's upper slopes, in two drifting halves, just in front of it.
function summitCloud(sc, mt, [px, py], col, T, top, hgt) {
  const b = mt.b, w = Math.max(200, b.w * 0.19), h = b.h * hgt;
  const cx = b.l + px * b.w, cy = b.t + (1 - py) * b.h + b.h * top;
  [-1, 1].forEach((side, n) => {
    const cb = { l: cx - w * 0.55 + side * w * 0.22, t: cy - h * 0.35, w, h };
    const it = { role: 'soft', b: cb, s: mt.s * 1.003 + n * 0.001, ord: mt.ord, tex: T(paintPuff(cb.w, cb.h, 0.6, { ...col, seed: 21 + n * 7 })), drift: side * Math.max(10, w * 0.05), phase: n * 2.1, base: 0.8 };
    it.z = P * (1 - 1 / it.s); it.Yb = mt.Yb; // it folds with its mountain
    sc.items.push(it);
  });
}
// the climb's mountain: the trail so far with a dot a year, the camp, the way on fading into cloud,
// and on the summit a bare pole with an empty pennant
function mountainMarks(x, f, w, h, room) {
  const at = (P) => P.map(([a, b]) => [a * w, b * h]);
  trail(x, at(TRAIL), '#e8f0f6', 0.5, 0.55);
  trail(x, at(BEYOND), '#e8f0f6', 0.5, 0);
  along(TRAIL, steps.length).forEach(([a, b], k) => {
    x.fillStyle = k === steps.length - 1 ? '#ffb547' : '#e8f0f6';
    x.beginPath(); x.arc(a * w, b * h, k === steps.length - 1 ? 4 : 3, 0, Math.PI * 2); x.fill();
  });
  // the camp: a tent beside the last flag
  const [cx, cy] = TRAIL[TRAIL.length - 1], tx = cx * w + 14, ty = cy * h + 2, ts = Math.max(9, h * 0.018);
  x.fillStyle = '#ffcf8a'; x.beginPath(); x.moveTo(tx, ty); x.lineTo(tx + ts * 0.7, ty - ts); x.lineTo(tx + ts * 1.4, ty); x.closePath(); x.fill();
  const [sx] = peakOf(SHAPE.mountain, 0.7, 0.9);
  // the pennant flies left if the screen ends too close on its right
  const ps = Math.max(30, h * 0.075);
  pennant(x, sx * w, (1 - f(sx)) * h + 1.5, ps, 'rgba(232,240,246,0.85)', 'next', room - sx * w < ps * 1.9 ? -1 : 1);
}
// the summit from the camp, with its pennant; at contact, with the trail up it too
function summitMarks(x, f, w, h, climbed) {
  const [sx] = peakOf(SHAPE.summit, 0.4, 0.6);
  if (climbed) trail(x, TRAIL_UP.map(([a, b]) => [a * w, b * h]), '#ffd2b4', 0.15, 0.7, 1.6);
  pennant(x, sx * w, (1 - f(sx)) * h + 1.5, Math.max(climbed ? 34 : 22, h * (climbed ? 0.09 : 0.06)), climbed ? 'rgba(255,214,186,0.9)' : 'rgba(232,240,246,0.7)', climbed ? 'next' : '');
}

/* ------------------------------------------------------------------ the sea of cloud */
// The cover's sea of cloud has its own camera (deck.js): its horizon is the sky's, the peaks stand at
// its far edge with their feet in it (where --sea says), and the name stands in it a little, so the
// nearest heaps rise over its foot. In world units: the eye sits CAM over the cloud tops, which heap
// up to DEEP from their floor.
const CAM = 1.35, DEEP = 0.75, FOG = 0.012, NOTHIN = [1e8, 2e8];
let sea = null;
function seaLayout(sc) {
  sea = null;
  if (!gl?.deck) return;
  const f = Math.max(H * 0.9, W * 0.75), hy = sc.hy;
  const far = parseFloat(getComputedStyle(sc.el).getPropertyValue('--sea')) / 100 * H || hy + H * 0.03;
  const name = sc.items.find((it) => it.role === 'text'), ridges = sc.items.filter((it) => it.art === 'ridge' && it.s < name.s);
  sea = {
    f, name, ridges,
    far: f * CAM / Math.max(4, far - hy),
    // the name's foot is down among the heaps, not on their tops
    near: f * (CAM + DEEP * 0.45) / Math.max(4, name.b.t + name.b.h - hy),
    // the drift of each layer of heaps, in world units a second: across, and toward you
    v: [[0.18, 0.25], [0.28, 0.14], [0.35, 0.3], [0.04, 0.06]]
  };
}
const fract = (v) => v - Math.floor(v);
// the cover's sea as up to three passes, each a sprite slotted into the paper by depth (d)
function pushSea(into, sc, off, po, sky, u, alpha) {
  const { f, name, ridges } = sea;
  // its horizon, where the sky's is now; it slides with the pointer as far things do, and comes
  // nearer as the camera does, as fast as the peaks at its far edge
  const Zs = sc.skyZ + off[2], w = (P - Zs) / P, hz = po[1] + (Yf + off[1] - po[1]) / w;
  const slide = (po[0] - ox) * (1 - sc.skyS);
  const zr = Math.max(...ridges.map((it) => it.z)), sr = P / (P - zr), sr2 = P / (P - zr - off[2]);
  const ahead = sea.far * (1 - sr / sr2);
  // first light: the eye rises a little out of the cloud tops as the light comes
  const intro = sc.i === 0 && introT < 1 ? introT : 1, hc = CAM * (0.8 + 0.2 * easeOut(intro));
  const light = 0.18 + 0.82 * smooth(0, 0.56, intro);
  const T = reduced ? 0 : clock, ws = sea.v.map(([a, b]) => [a * T, b * T]);
  const R = (v) => [v[0] * 0.8 - v[1] * 0.6, v[0] * 0.6 + v[1] * 0.8];
  const w0 = [fract(-ws[0][0] * 0.03), fract(-ws[0][1] * 0.03), fract(0.37 - R(ws[1])[0] * 0.045), fract(0.37 - R(ws[1])[1] * 0.045)];
  const w1 = [fract(0.53 - ws[2][0] * 0.075), fract(0.53 - ws[2][1] * 0.075), fract(-ws[3][0] * 0.006), fract(-ws[3][1] * 0.006)];
  const [sx, sy, , gr] = sky.sky.sun, ga = sky.sky.glow[3];
  const sun = [(sx - W / 2 - slide) / f, Math.max(0.02, -(sy - hz) / f), -1], sl = Math.hypot(...sun);
  const c = sky.sky.colours, P0 = PAL.cover.deck;
  const colours = { lit: P0.lit, shade: P0.shade, deep: P0.deep, glow: [...sky.sky.glow.slice(0, 3)], haze: [c[9], c[10], c[11]] };
  // as the cover parts, so does the sea, down its middle
  const part = !reduced && u > 0 ? easeInOut(clamp((u - 0.1) / 0.56)) * W * 0.8 : 0;
  const halves = part > 0.5 ? [-1, 1] : [0];
  const base = { view: [hz, f, slide, 0], cam: [slide * 3 / f, hc, -ahead, DEEP], w0, w1, sun: [sun[0] / sl, sun[1] / sl, sun[2] / sl, 1], glow: [sx, sy, gr, ga], colours };
  // (fewer steps a ray on a slower tier; rays that meet the tops beyond aa[0] are taken aa[1] times,
  // spread down the pixel, against stair-steps along the heaps' edges)
  const steps = tier === 'high' ? 12 : tier === 'mid' ? 10 : 8, aa = tier === 'high' ? [4, 2] : tier === 'mid' ? [6, 2] : [0, 1];
  const pass = (rect, r0, r1, d, a = alpha, thin = NOTHIN) => {
    if (rect[3] <= rect[1] + 1 || !(a > 0.002)) return;
    for (const side of halves) {
      into.paper.push({ deck: { ...base, view: [hz, f, slide, side * part], rect, range: [r0, r1, FOG, steps], cut: [side, 0.03, light, a], thin, aa }, alpha: a, d });
    }
  };
  // the peaks stand in its far haze: the last stretch before them thins to nothing over their feet,
  // and the pass behind them starts there too, so where no peak stands the sea runs on unbroken
  const mist = sea.far * 0.45, yFar = hz + f * hc / sea.far, yFloor = hz + f * (hc + DEEP) / mist;
  const zFar = Math.min(...ridges.map((it) => it.z)) + off[2], zName = name.z + off[2];
  // past the peaks, behind them
  pass([0, hz - 1, W, Math.min(H, yFloor + 2)], mist, 1e4, zFar - 1);
  // from the peaks to you, in front of them and behind the name
  pass([0, Math.max(hz, yFar - 2), W, H], 0, sea.far, zr + off[2] + 0.1, alpha, [mist, sea.far]);
  // and nearer than the name, over its foot (only while it stands whole)
  if (name.alpha > 0.002 && !(name.part > 0.5)) {
    const b = name.b, s2 = P / (P - zName), X0 = ox + (b.l - ox) / name.s, X1 = ox + (b.l + b.w - ox) / name.s, Yb = oy + (b.t + b.h - oy) / name.s;
    const at = (X) => po[0] + (X + off[0] - po[0]) * s2, yb = po[1] + (Yb + off[1] + name.dy - po[1]) * s2;
    // (marched just as the pass before, so the two agree on every heap, but thinning out past the
    // name, so its letters go down into the cloud softly rather than cut along a line)
    pass([Math.max(0, at(X0)), Math.max(hz, hz + f * hc / (sea.near * 1.12)), Math.min(W, at(X1)), Math.min(H, yb + 4)], 0, sea.far, zName + 0.5, alpha * name.alpha, [sea.near * 0.9, sea.near * 1.12]);
  }
}

/* ------------------------------------------------------------------ the moves */
// Each move between two scenes has its own way in and out. t: how far through the move, 0 to 1.
// Each sets an item's pose: rise (1 standing, 0 flat), alpha, and dx, dy (moved in the world).
const KIND = ['part', 'fly', 'pan', 'clouds'];
const rising = (it, t, from, span, gap = 0.36) => { const r = stand(clamp((t - from - it.ord * gap) / span)); it.rise = r; it.alpha = clamp(r / 0.12); };
const MOVES = {
  // the cover's cloud and peaks part down the middle, nearer sheets further; the mountain stands up behind
  part: {
    out(it, t) {
      if (it.role === 'mist') it.alpha = 1 - clamp(t / 0.3);
      else if (it.role === 'foot') { it.alpha = 1 - clamp(t / 0.16); it.dy = t * H * 0.05; }
      // each piece goes far enough to clear the screen, the nearer ones first
      else { it.part = easeInOut(clamp((t - 0.03 - (1 - it.ord) * 0.14) / 0.56)) * W * 0.8 / it.s; it.alpha = 1 - clamp((t - 0.6) / 0.25); }
    },
    in(it, t) {
      if (it.role === 'mist') it.alpha = clamp((t - 0.3) / 0.4);
      else if (it.role === 'words') rising(it, t, 0.45, 0.4, 0);
      else rising(it, t, 0.1, 0.42, 0.4);
    },
    // dawn gives way to day as the tears open; the land behind comes in with it, not at the
    // first pixel of scroll
    sky: (t) => 1 - easeInOut(clamp((t - 0.08) / 0.34)),
    floor: (t) => 1 - clamp((t - 0.12) / 0.3),
    floorIn: (t) => smooth(0.06, 0.24, t)
  },
  // the camera flies to the camp; the years fall away, and the camp's light opens into a window
  // shaped like a peak, with the work seen whole through it, coming nearer as it grows
  fly: {
    out(it, t) {
      if (it.role === 'flag') it.alpha = it.now ? 1 - clamp((t - 0.24) / 0.2) : 1 - clamp((t - (5 - it.k) * 0.02) / 0.18);
      else if (it.role === 'words') { it.alpha = 1 - clamp(t / 0.2); it.dy = -t * H * 0.1; }
      else it.alpha = t < 0.6 ? 1 : 0; // (until the window has opened over all of it)
    },
    in(it, t) {
      if (it.dom) rising(it, t, 0.52, 0.32, 0.2);
      else { it.alpha = t > 0.26 ? 1 : 0; it.rise = 0.5 + 0.5 * stand(clamp((t - 0.3 - it.ord * 0.12) / 0.5)); }
    },
    sky: (t) => (t < 0.6 ? 1 : 0),
    floor: (t) => (t < 0.6 ? 1 : 0),
    skyIn: (t) => (t > 0.26 ? 1 : 0),
    floorIn: (t) => (t > 0.26 ? 1 : 0),
    // how far the window has opened: from nothing at the camp to past every corner of the screen
    win: (t) => clamp((t - 0.27) / 0.33)
  },
  // the camera pans along the camp: the panels lie down in a wave from the left, and the specimens
  // stand up in one behind them
  pan: {
    out(it, t) {
      if (it.role === 'panel') { const k = easeInOut(clamp((t - 0.02 - it.xf * 0.3) / 0.3)); it.rise = 1 - k; it.alpha = clamp(it.rise / 0.12); }
      else if (it.role === 'words') it.alpha = 1 - clamp(t / 0.25);
      else it.alpha = 1 - clamp((t - 0.35) / 0.35);
    },
    in(it, t) {
      if (it.role === 'spec') { const r = stand(clamp((t - 0.36 - it.xf * 0.3) / 0.36)); it.rise = r; it.alpha = clamp(r / 0.12); }
      else if (it.role === 'words') rising(it, t, 0.5, 0.35, 0);
      else it.alpha = clamp((t - 0.2) / 0.35);
    },
    sky: (t) => 1 - easeInOut(clamp((t - 0.25) / 0.45)),
    floor: (t) => 1 - clamp((t - 0.3) / 0.4),
    // the camera draws back a little as it goes, like a crane
    cam: (t, c) => { c[2] += P * 0.12 * Math.sin(Math.PI * t); c[1] -= H * 0.04 * Math.sin(Math.PI * t); }
  },
  // the camera climbs; the craft sinks away, clouds rise and fill the screen, then part on the
  // summit, clear now, and the trail up it
  clouds: {
    // the page's own content goes before the clouds reach it (it is drawn over the canvas)
    out(it, t) { it.alpha = it.dom ? 1 - clamp((t - 0.04) / 0.2) : 1 - clamp((t - 0.28) / 0.25); },
    in(it, t) {
      if (it.role === 'foot') { it.alpha = clamp((t - 0.8) / 0.18); it.dy = (1 - it.alpha) * H * 0.04; }
      else if (it.role === 'text') { it.alpha = clamp((t - 0.66) / 0.2); it.rise = stand(clamp((t - 0.6) / 0.4)); }
      else { it.alpha = clamp((t - 0.45) / 0.1); it.rise = 0.8 + 0.2 * easeOut(clamp((t - 0.58) / 0.42)); }
    },
    sky: (t) => 1 - clamp((t - 0.3) / 0.25),
    floor: (t) => 1 - clamp((t - 0.3) / 0.25),
    skyIn: (t) => clamp((t - 0.25) / 0.2),
    floorIn: (t) => clamp((t - 0.4) / 0.1)
  }
};
const later = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 400));
const paintVeil = (it) => { it.tex = it.tex || it.paint(); };
// the cloud banks between craft and contact, by t of that move
function veilPose(it, t) {
  const n = it.n, up = easeOut(clamp((t - 0.1 - n * 0.06) / 0.36));
  it.dy = (1 - up) * (H * 1.05 - it.b.t) / it.s;
  it.part = easeInOut(clamp((t - 0.6 - (2 - n) * 0.03) / 0.33)) * W * (0.75 + 0.35 * n) / it.s;
  it.alpha = clamp((t - 0.1) / 0.08) * (1 - clamp((t - 0.88) / 0.12));
}

// The opening is first light: nothing moves into place, the light comes. It reaches the back ridges
// first and the front ones last, the mist lifts out of the dark, and the name comes up after it.
function dawn(it, t) {
  if (it.role === 'mist') it.alpha *= smooth(0.2, 0.85, t);
  else if (it.role === 'text') { const k = smooth(0.32, 0.78, t); it.alpha *= k; it.dy += (1 - k) * H * 0.02; }
  else if (it.dom) it.alpha *= smooth(0.72, 1, t);
  else it.light = 0.18 + 0.82 * smooth(it.ord * 0.3, it.ord * 0.3 + 0.56, t);
}

/* ------------------------------------------------------------------ scroll and pointer */
// The scroll is the browser's own: nothing is snapped or hijacked. What is drawn follows it a beat
// behind, so a flick of the wheel glides instead of jumping. At the work the eye holds still for a
// stretch of the scroll, and that stretch turns the drum instead (q: how far, in projects).
let p = 0, q = 0, dirty = true, introT = reduced ? 1 : 0, introStart = 0, lastNow = 0;
const INTRO = 3000; // the opening, first light, in ms
const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => { ptr.tx = e.clientX / innerWidth * 2 - 1; ptr.ty = e.clientY / innerHeight * 2 - 1; }, { passive: true });
const yOf = (i) => i * STEP + (i > HOLDAT ? HOLD : 0);   // where scene i rests (the work: with Relay in front)
const yAt = (pp, qq) => (pp < HOLDAT ? pp * STEP : pp > HOLDAT ? pp * STEP + HOLD : HOLDAT * STEP + qq * HS);
const maxY = () => (N - 1) * STEP + HOLD;
const want = () => { const y = scrollY, y0 = HOLDAT * STEP; return clamp(y <= y0 ? y / STEP : y <= y0 + HOLD ? HOLDAT : (y - HOLD) / STEP, 0, N - 1); };
const wantQ = () => clamp((scrollY - HOLDAT * STEP) / HS, 0, LAST);

function goTo(i, instant) {
  const y = yOf(clamp(i, 0, N - 1));
  scrollTo({ top: y, behavior: instant || reduced ? 'instant' : 'smooth' });
  if (instant) { p = want(); q = wantQ(); dirty = true; }
}
// links and focus go to the scene that holds them (a project on the drum: turned to the front)
document.addEventListener('focusin', (e) => {
  const tile = e.target.closest?.('.tile');
  if (tile) { const y = yOf(HOLDAT) + +tile.dataset.k * HS; if (Math.abs(scrollY - y) > 2) { scrollTo(0, y); p = want(); q = wantQ(); dirty = true; } return; }
  const pg = e.target.closest?.('.page');
  const i = pg ? scenes.findIndex((x) => x.el === pg) : -1;
  if (i >= 0 && Math.abs(p - i) > 0.02) goTo(i, true);
});
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  const i = a ? scenes.findIndex((x) => '#' + x.id === a.getAttribute('href')) : -1;
  if (i >= 0) { e.preventDefault(); goTo(i); }
});

/* ------------------------------------------------------------------ the thread */
// No scroll bar (unfold.css): where you are shows on a faint thread at the right edge, a camp for
// each scene and a light in the colour of that scene's sun, there only while you move. Dragging
// along it scrolls the page there, as a scroll bar's thumb would.
const thread = $('#thread'), THREAD_IN = 0.2; // the camps run from THREAD_IN to 1 - THREAD_IN down it
const mark = thread ? document.createElement('b') : null;
let threadH = 0, threadOn = false, threadUntil = 0, shownThread = -1;
if (thread) {
  thread.innerHTML = scenes.map(() => '<i></i>').join('');
  thread.append(mark);
  const to = (e) => {
    const r = thread.getBoundingClientRect(), f = clamp(((e.clientY - r.top) / r.height - THREAD_IN) / (1 - 2 * THREAD_IN));
    scrollTo(0, f * maxY());
  };
  thread.addEventListener('pointerdown', (e) => { thread.setPointerCapture(e.pointerId); thread.classList.add('held'); to(e); });
  thread.addEventListener('pointermove', (e) => { if (thread.hasPointerCapture(e.pointerId)) to(e); });
  const up = () => thread.classList.remove('held');
  thread.addEventListener('pointerup', up); thread.addEventListener('pointercancel', up);
}
// a camp for each scene, spaced as the scroll is (the work's, then a longer stretch while the drum turns)
function threadLayout() {
  if (!thread) return;
  $$('i', thread).forEach((el, i) => { el.style.top = ((THREAD_IN + (1 - 2 * THREAD_IN) * yOf(i) / maxY()) * 100).toFixed(2) + '%'; });
}
function threadAt(i) {
  if (!thread || i === shownThread) return;
  shownThread = i;
  const sun = PAL[scenes[i].id].sun.c;
  thread.style.setProperty('--sun', sun);
  thread.style.setProperty('--glow', rgba(sun, 0.5));
}
function markAt() { if (mark) mark.style.transform = `translateY(${((THREAD_IN + (1 - 2 * THREAD_IN) * yAt(p, q) / maxY()) * threadH).toFixed(1)}px)`; }
function threadMove(now, moved) {
  if (!thread) return;
  if (moved) { threadUntil = now + 1100; if (!threadOn) { threadOn = true; thread.classList.add('on'); } }
  else if (threadOn && now > threadUntil) { threadOn = false; thread.classList.remove('on'); }
}

/* ------------------------------------------------------------------ the frame */
// Where the eye is, in scenes: it slows near each scene, so there is time to read it, and moves
// fastest between two.
const travel = (q) => { const i = Math.min(Math.floor(q), N - 2), t = q - i; return i + t - 0.6 * Math.sin(2 * Math.PI * t) / (2 * Math.PI); };
const folio = $('#folio');
let shownFolio = -1, eye = 0, clock = 0, lastDraw = 0, slow = 0, was = 0, wasQ = 0, coarse = false, settle = 0;
const view = { W: 0, H: 0, P: 0, po: [0, 0], o: [0, 0] };

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - (lastNow || now)) / 1000); lastNow = now;
  if (coast) coastOn(dt);
  const forced = dirty, p0 = p, q0 = q;
  const target = want(), tq = wantQ();
  if (reduced || Math.abs(target - p) < 0.0005) { if (p !== target) { p = target; dirty = true; } }
  else { p += (target - p) * (1 - Math.exp(-dt * 7)); dirty = true; }
  // (the drum follows a hand on it more closely than it follows the wheel)
  if (reduced || Math.abs(tq - q) < 0.0005) { if (q !== tq) { q = tq; dirty = true; } }
  else { q += (tq - q) * (1 - Math.exp(-dt * (drag?.moved ? 16 : 7))); dirty = true; }
  if (introT < 1 && introStart) { introT = clamp((now - introStart) / INTRO); dirty = true; }
  const ptrMoved = !reduced && TIERS[tier].idle && (Math.abs(ptr.tx - ptr.x) > 0.001 || Math.abs(ptr.ty - ptr.y) > 0.001);
  if (ptrMoved) { ptr.x += (ptr.tx - ptr.x) * 0.05; ptr.y += (ptr.ty - ptr.y) * 0.05; dirty = true; }
  moving = dirty;
  // Only the drum turning (the scene holds still): the landscape needn't be drawn again, but for the
  // light under the drum taking the next one's colour, now and then.
  if (dirty && !forced && p === p0 && q !== q0 && introT >= 1 && !ptrMoved) {
    dirty = false;
    clock += dt;
    threadMove(now, true);
    wasQ = q;
    markAt();
    poseDrum(dwell(q));
    const c = drumGlow[0]?.tintC;
    if (c && drawnTint && Math.max(...c.map((v, j) => Math.abs(v - drawnTint[j]))) > 0.04) { lastDraw = now; render(); drawnTint = c; }
    if (live.work) tickTiles(now);
    return;
  }
  // frames running slow while moving: step down a tier (not when one is pinned)
  if (moving && !pinned && gl) {
    slow = dt > 0.05 ? slow + 4 : dt > 0.026 ? slow + 1 : Math.max(0, slow - 2);
    if (slow > 30 && tier !== ORDER[ORDER.length - 1]) { tier = ORDER[ORDER.indexOf(tier) + 1]; slow = 0; sizeCanvas(); }
  }
  // coarse while the scroll moves, sharp once it has been still a moment
  if (gl && TIERS[tier].move < 1) {
    if (p !== was || introT < 1) { settle = now + 180; if (!coarse) { coarse = true; sizeCanvas(); } }
    else if (coarse && now > settle) { coarse = false; sizeCanvas(); }
  }
  threadMove(now, p !== was || q !== wasQ);
  was = p; wasQ = q;
  clock += dt;
  const idle = !dirty && TIERS[tier].idle && gl && !reduced && now - lastDraw > 33;
  if (!dirty && !idle) { if (live.work) tickTiles(now); return; }
  dirty = false;
  lastDraw = now;
  render();
  drawnTint = drumGlow[0]?.tintC;
  if (live.work) tickTiles(now);
  else if (eye > 1.15 && eye < 3) wakeOne(); // so the work is running when you arrive
}

function render() {
  eye = travel(p);
  const cur = Math.round(eye);
  if (cur !== shownFolio) {
    shownFolio = cur;
    threadAt(cur);
    folio.querySelector('b').textContent = cur + 1;
    folio.querySelector('i').textContent = scenes[cur].el.dataset.name;
  }
  markAt();
  live.work = Math.abs(eye - 2) < 0.35;
  live.craft = Math.abs(eye - 3) < 0.35;
  if (eye > 1 && eye < 3) poseDrum(dwell(q));
  // the eye drifts a little with the pointer, so the layers part
  const po = reduced ? [ox, oy] : [ox + ptr.x * W * 0.05, oy + ptr.y * H * 0.06];
  stage.style.perspectiveOrigin = `${po[0].toFixed(1)}px ${po[1].toFixed(1)}px`;
  Object.assign(view, { W, H, P, po, o: [ox, oy] });

  // the camera: from one scene's place toward the next's
  const i = Math.min(Math.floor(eye), N - 2), t = eye - i, kind = KIND[i], mv = MOVES[kind];
  const cam = A[i].map((v, k) => lerp(v, A[i + 1][k], t));
  mv.cam?.(t, cam);

  const fresh = () => ({ sky: [], floor: [], paper: [], soft: [], top: [] });
  const list = fresh(), whole = [];
  // mid-move, the scene coming in may be seen through a window: then it is drawn whole, apart, over
  // the one going out
  const winK = !reduced && gl && mv.win ? mv.win(t) : 0, winOn = winK > 0 && winK < 1;
  const inc = winOn ? fresh() : null;
  for (const sc of scenes) {
    const u = eye - sc.i;
    const vis = reduced ? Math.abs(p - sc.i) < 1 : u > -1 && u < 1;
    sc.el.classList.toggle('off', !vis);
    if (!vis) continue;
    // (a scene seen through a window stands where it will rest, only a little further off, and comes
    // the rest of the way as the window opens; the camera's flight is the other scene's)
    const off = reduced ? [0, 0, 0] : mv.win && sc.i === i + 1 ? [0, 0, -P * 0.16 * (1 - easeOut(clamp((t - 0.27) / 0.73)))] : A[sc.i].map((v, k) => v - cam[k]);
    sc.el.style.transform = reduced || Math.hypot(...off) < 0.01 ? '' : `translate3d(${off[0].toFixed(2)}px,${off[1].toFixed(2)}px,${off[2].toFixed(2)}px)`;
    // with reduced motion, nothing moves: the scenes cross-fade, each drawn whole. On the canvas
    // the next scene waits underneath and this one fades off it, while the words hand over without
    // overlapping; without WebGL the next scene's own page fades in over this one.
    const d = p - sc.i;
    const fade = !reduced ? 1 : gl ? (d <= 0 ? 1 : 1 - smooth(0.2, 0.8, d)) : d <= 0 ? smooth(-0.65, -0.35, d) : d < 0.65 ? 1 : 0;
    // (opacity on a section would flatten its 3D, so on the canvas each box of words fades itself)
    const words = reduced && gl ? (d <= 0 ? smooth(-0.4, -0.1, d) : 1 - smooth(0.1, 0.4, d)) : 1;
    if (reduced && !gl) sc.el.style.opacity = fade.toFixed(3);
    const into = reduced ? (whole[sc.i] = fresh()) : winOn && sc.i === i + 1 ? inc : list;
    const inK = sc.i > 0 ? MOVES[KIND[sc.i - 1]] : null, outK = MOVES[KIND[sc.i]] || null;
    for (const it of sc.items) {
      it.rise = 1; it.alpha = 1; it.dx = 0; it.dy = 0; it.part = 0; it.light = 1;
      if (!reduced) {
        if (u < 0 && inK) inK.in(it, 1 + u);
        else if (u > 0 && outK) outK.out(it, u);
        if (sc.i === 0 && introT < 1) dawn(it, introT);
      }
      it.alpha *= it.dom ? words : fade;
    }
    // what follows another (a pool under its panel) takes its pose
    for (const it of sc.items) if (it.owner) { it.rise = it.owner.rise; it.alpha *= it.owner.alpha; }
    for (const it of sc.items) {
      if (it.dom) poseDom(it);
      else pushSprite(into, it, off);
    }
    // sky and floor
    if (gl) {
      const sa = (u < 0 && inK ? (inK.skyIn ? inK.skyIn(1 + u) : 1) : u > 0 && outK ? outK.sky(u) : 1) * fade;
      const fa = (u < 0 && inK ? (inK.floorIn ? inK.floorIn(1 + u) : 1) : u > 0 && outK ? outK.floor(u) : 1) * fade;
      const sky = skySprite(sc, off, po, sa, sc.i === 0 ? introT : 1);
      into.sky.push(sky);
      if (sc.i === 0 && sea) pushSea(into, sc, off, po, sky, u, (u > 0 ? 1 - clamp((u - 0.6) / 0.25) : 1) * fade);
      const lit = sc.i === 0 && introT < 1 ? 0.18 + 0.82 * smooth(0.02, 0.6, introT) : 1; // the land lights with the back ridges
      into.floor.push({ mode: 1, tex: sc.floor.tex, box: [ox - sc.floor.half, 0, sc.floor.half * 2, 0], fl: [sc.floor.near, sc.floor.far, Yf, 0], off, alpha: fa, tint: [lit, lit, lit], fade: [0.9, 0.12, 0, 0.16], i: sc.i });
    }
  }
  if (!gl) return;
  const byDepth = (a, b) => a.d - b.d;
  if (reduced) {
    // the scene underneath first, then the one fading off it, each on a clean depth buffer
    const out = [];
    for (let j = whole.length - 1; j >= 0; j--) if (whole[j]) {
      const L = whole[j];
      out.push(...L.sky, ...L.floor, ...[...L.paper, ...L.soft].sort(byDepth), { clearDepth: true });
    }
    gl.draw(view, out);
    return;
  }
  // the clouds between craft and contact
  if (!reduced && i === 3 && t > 0.1) for (const it of veil) {
    paintVeil(it);
    veilPose(it, t);
    for (const side of [-1, 1]) {
      const cut = [it.cutX - side * 0.03, side, 0.02, 22];
      // (its torn edge soft, as cloud; each half runs on past the cut by that much, so no seam shows
      // before they draw apart)
      list.top.push({ tex: it.tex, box: [it.b.l, it.b.t, it.b.w, it.b.h], sub: side < 0 ? [0, 0, it.cutX + 0.06, 1] : [it.cutX - 0.06, 0, 1, 1], L: [it.s, it.z, it.Yb, 0], off: [side * it.part, it.dy, 0], alpha: it.alpha, cut, fade: [2, 0, 0.03, 0], depth: 'none', d: it.z });
    }
  }
  // mid-flight, the camp's light swells, and opens into the window; its foot stays on the camp
  let win = null;
  if (!reduced && i === 1) {
    const o = A[1].map((v, k) => v - cam[k]), Z = camp.Z + o[2], w = (P - Z) / P;
    const x = po[0] + (camp.X + o[0] - po[0]) / w, y = po[1] + (camp.Y + o[1] - po[1]) / w;
    const g = bell(t, 0.36, 0.16);
    if (g > 0.01) list.top.push({ mode: 2, alpha: g * 0.42, tint: tint('#ffa860'), fade: [x, y, Math.max(W, H * 0.65) * lerp(0.2, 0.6, clamp(t / 0.5)), 0], blend: 'add', depth: 'none', d: 1e9 });
    // (it grows slowly at first, a peak of the camp's light on the trail, then fast, and its foot sinks
    // as it grows; at its full size its foot is under the screen and the farthest corner well inside)
    if (winOn) win = [x, lerp(y + H * 0.004, H * 1.06 + 40, smooth(0, 0.72, winK)), lerp(3, Math.max(W, H) * 2.4, Math.pow(winK, 2.2)), 1];
  }
  // skies and floors: the scene coming in (behind) first, the one going out over it
  list.sky.reverse(); list.floor.reverse();
  // paper and the soft things between it (mist, cloud, light) in one order, back to front, so a
  // nearer sheet covers a farther mist rather than cutting a hole in it
  const mid = [...list.paper, ...list.soft].sort(byDepth);
  list.top.sort(byDepth);
  const out = [...list.sky, ...list.floor, ...mid, ...list.top];
  if (inc && win) {
    // the scene coming in, whole, through the window, and the window's lit edge
    const winC = [...tint('#ffcf8a'), 0.9 * (1 - smooth(0.75, 1, winK))];
    const through = [...inc.sky, ...inc.floor, ...[...inc.paper, ...inc.soft].sort(byDepth), ...inc.top.sort(byDepth)];
    for (const sp of through) sp.win = win;
    // (while it is small it is full of the camp's light, which thins as it opens)
    out.push({ clearDepth: true }, ...through, { mode: 4, alpha: 1, win, winC, fade: [0.6 * (1 - smooth(0, 0.5, winK)), 0, 0, 0], blend: 'add', depth: 'none' });
  }
  gl.draw(view, out);
}

// paper's grain, and its ends and foot softened, so a sheet seen from off its usual place (in a pan, or
// standing on another scene's floor) never shows a hard edge
const GRAIN = [0.85, 0.05, 0, 0.16];
// a scene's sky: the horizon and sun where its floor's far edge and its sun now project
// t: how far the day has come (the opening's first light; 1 for the rest of the time)
function skySprite(sc, off, po, alpha, t = 1) {
  const k = sc.sky, Zs = sc.skyZ + off[2], w = (P - Zs) / P, mag = (P / (P - Zs)) / sc.skyS;
  const hy = po[1] + (Yf + off[1] - po[1]) / w;
  const sx = po[0] + (k.sunW[0] + off[0] - po[0]) / w, sy = po[1] + (k.sunW[1] + off[1] - po[1]) / w;
  let colours = k.colours, glow = k.glow, rise = 0;
  if (t < 1) {
    // before first light the sky is the night's, lightening from the horizon up; the sun comes up
    // from below the ridges and its glow grows
    colours = k.colours.slice();
    for (let i = 0; i < 6; i++) {
      const at = i < 4 ? (3 - i) * 0.08 : 0.02, m = smooth(at, at + (i < 4 ? 0.62 : 0.58), t);
      for (let c = 0; c < 3; c++) colours[i * 3 + c] = lerp(NIGHT[i][c], k.colours[i * 3 + c], m);
    }
    glow = [k.glow[0], k.glow[1], k.glow[2], k.glow[3] * smooth(0.05, 0.85, t)];
    rise = (1 - easeOut(t)) * H * 0.14;
  }
  return { mode: 3, alpha, depth: 'none', sky: { colours, g: [hy, k.span * mag, H * 0.5 * mag, 0.07], sun: [sx, sy + rise, k.r * mag, k.gr * mag], glow } };
}
// the sky an hour before dawn: top to horizon, then the ground under it
const NIGHT = ['#04050a', '#070912', '#0d101c', '#171824', '#0a0a10', '#0a0a10'].map(tint);
function pushSprite(list, it, off) {
  if (!(it.alpha > 0.002)) return;
  const th = (90 * (1 - it.rise)) * Math.PI / 180;
  const o = [off[0] + it.dx, off[1] + it.dy, off[2]];
  const depthNow = it.z + o[2];
  if (it.role === 'pool') { list.soft.push({ mode: 1, tex: it.tex, box: [it.b.l, 0, it.b.w, 0], fl: it.fl, off: o, alpha: it.alpha * it.base * it.rise, tint: it.tintC, blend: 'add', depth: 'test', fade: [2, 0, 0, 0], d: depthNow }); return; }
  const L = [it.s, it.z, it.Yb, 0], pad = it.pad || 0, sd = it.side || 0, bx = [it.b.l - sd, it.b.t - pad, it.b.w + 2 * sd, it.b.h + pad];
  if (it.role === 'mist') {
    // one width of mist across its box, drifting; it wraps round, so the box is always full (sub would
    // also cut the sheet itself short, which on a phone left a hard edge in the cover's mist)
    list.soft.push({ tex: it.tex, box: bx, L, th, off: o, alpha: it.alpha, shift: [reduced ? 0 : (clock * 0.006 * it.speed) % 1, 0], depth: 'test', d: depthNow });
    return;
  }
  if (it.role === 'soft' || it.role === 'halo') {
    const dx = it.drift && !reduced ? Math.sin(clock * 0.18 + it.phase) * it.drift : 0;
    const a = it.alpha * (it.base ?? 1) * (it.pulse && !reduced ? 0.85 + 0.15 * Math.sin(clock * 1.3) : 1);
    list.soft.push({ tex: it.tex, box: bx, L, th, off: [o[0] + dx, o[1], o[2]], alpha: a, tint: it.tintC, blend: it.blend || 'over', depth: 'test', d: depthNow });
    return;
  }
  // paper; a torn sheet as its two pieces, parted. A sea of cloud drifts.
  const bright = (1 - 0.45 * (1 - clamp(it.rise))) * it.light;
  const tnt = [bright, bright, bright];
  if (it.drift && !reduced) o[0] += Math.sin(clock * 0.07 + it.ord * 4) * it.drift;
  if (it.pieces) {
    // (soft halves blend where they overlap, so they test depth without writing it)
    for (const pc of it.pieces) list.paper.push({ tex: it.tex, box: bx, sub: pc.sub, cut: pc.cut, L, th, off: [o[0] + pc.side * (it.part || 0), o[1], o[2]], alpha: it.alpha, tint: tnt, depth: pc.soft ? 'test' : 'write', fade: pc.soft ? [2, 0, pc.soft, 0.08] : it.fade || GRAIN, d: depthNow });
  } else list.paper.push({ tex: it.tex, box: bx, L, th, off: o, alpha: it.alpha, tint: tnt, depth: 'write', fade: it.role === 'text' ? null : it.fade || GRAIN, d: depthNow });
}
// the page's own content: the same fold, written as a CSS transform
function poseDom(it) {
  const el = it.el, gone = it.alpha < 0.002;
  if (el._gone !== gone) { el.style.visibility = gone ? 'hidden' : ''; el._gone = gone; }
  if (gone) return;
  const op = it.alpha < 0.999 ? it.alpha.toFixed(3) : '';
  // (opacity on the drum would flatten it, so its tiles take its fade)
  if (el === drumEl) { if (drumA !== it.alpha) { drumA = it.alpha; shownT = NaN; } }
  else if (el._op !== op) { el.style.opacity = op; el._op = op; }
  // without WebGL nothing moves, and the page lies flat, each box where the layout put it
  if (!gl) return;
  const th = 90 * (1 - it.rise);
  const shift = it.dx || it.dy ? `translate3d(${it.dx.toFixed(2)}px,${it.dy.toFixed(2)}px,0px) ` : '';
  const tf = shift + `translate3d(0px,${it.yb.toFixed(2)}px,${it.z.toFixed(2)}px) rotateX(${th.toFixed(2)}deg) translate3d(0px,${(-it.yb).toFixed(2)}px,0px) ` + it.place;
  if (el._tf !== tf) { el.style.transform = tf; el._tf = tf; }
}

function sizeCanvas() {
  if (!gl) return;
  gl.size(W, H, TIERS[tier].res * (coarse ? TIERS[tier].move : 1));
  dirty = true;
}

/* ------------------------------------------------------------------ the drum */
// Where the drum has turned to: it lingers with each project in front and moves fastest between two,
// as the eye does between scenes. Each tile stands on the drum at its own angle; the front one is
// whole and bright, the ones round each side darker and further gone.
const dwell = (v) => { const k = Math.min(Math.floor(v), LAST - 1), t = v - k; return k + t - 0.75 * Math.sin(2 * Math.PI * t) / (2 * Math.PI); };
let shownT = NaN, shownFront = -1, drumA = 1, drawnTint = null;
function poseDrum(T) {
  if (T === shownT) return;
  shownT = T;
  const front = clamp(Math.round(T), 0, LAST);
  for (const t of tiles) {
    const d = t.k - T, ad = Math.abs(d);
    const vis = reduced ? t.k === front : ad < 1.75;
    const op = reduced ? drumA : clamp((1.75 - ad) / 0.6) * drumA;
    const tf = reduced ? 'none' : `translateZ(${(-DRUM.R).toFixed(1)}px) rotateY(${(d * DRUM.a).toFixed(2)}deg) translateZ(${DRUM.R.toFixed(1)}px)`;
    const key = vis ? tf + op.toFixed(3) : 'off';
    if (t.shown === key) continue;
    t.shown = key;
    t.el.style.visibility = vis && op > 0.002 ? '' : 'hidden';
    if (!vis) continue;
    t.el.style.transform = tf;
    t.el.style.opacity = op < 0.999 ? op.toFixed(3) : '';
    t.el.style.setProperty('--shade', (Math.min(1, ad) * 0.55).toFixed(3));
    t.el.classList.toggle('front', t.k === front);
  }
  // the huge name: the outgoing one's letters go up out of sight, the next one's come up after
  // them, each a little after the one before; scrolled back, they go back down
  // (each word holds still while its project is near the front, then turns over within WV of it,
  // so two never stand together)
  const WV = 0.56, DZ0 = 0.08, LAG = 0.4;
  for (const [k, wd] of words.entries()) {
    const d = T - k, on = (reduced ? k === front : Math.abs(d) < WV);
    if (wd.shown !== on) { wd.el.style.visibility = on ? '' : 'hidden'; wd.shown = on; }
    if (!on) continue;
    const n = wd.chs.length;
    wd.chs.forEach((ch, i) => {
      const lag = (n > 1 ? i / (n - 1) : 0) * LAG, span = (WV - DZ0) / (1 + LAG);
      const y = reduced ? 0 : d <= 0 ? (1 - easeOut(clamp((d + WV) / span - lag))) * 110 : -Math.pow(clamp((d - DZ0) / span - lag), 2) * 110;
      ch.style.transform = y ? `translateY(${y.toFixed(1)}%)` : '';
    });
  }
  // the number and what to try, for the one in front
  if (front !== shownFront) {
    shownFront = front;
    const id = WORK[front], P0 = PROJ[id];
    countEl.style.setProperty('--c', P0.color);
    countEl.querySelector('.n b').textContent = String(front + 1).padStart(2, '0');
    countEl.querySelector('.kind').textContent = P0.kind;
    countEl.querySelector('.try').textContent = D.live[id].line;
    countEl.classList.remove('swap'); void countEl.offsetWidth; countEl.classList.add('swap');
  }
  // the light under the drum takes the colour of the one in front, blending as it turns
  const k0 = clamp(Math.floor(T), 0, LAST), k1 = Math.min(LAST, k0 + 1), f = smooth(0.25, 0.75, T - k0);
  const c0 = tint(PROJ[WORK[k0]].color), c1 = tint(PROJ[WORK[k1]].color), c = c0.map((v, j) => lerp(v, c1[j], f));
  for (const g of drumGlow) g.tintC = c;
}

/* ------------------------------------------------------------------ turning the drum by hand */
// Grab the drum and turn it. The drum turns with the page's scroll, so a drag scrolls the page, and a
// flick coasts to a stop wherever it stops. A tap on one round the side turns it to the front; a tap
// on the one in front opens it.
let drag = null, coast = null, dragged = 0;
const tilePx = () => DRUM.w * (narrow() ? 0.75 : 0.62);
const turnTo = (v, smoothly) => scrollTo({ top: yOf(HOLDAT) + clamp(v, 0, LAST) * HS, behavior: smoothly && !reduced ? 'smooth' : 'instant' });
drumEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  coast = null;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, q0: wantQ(), moved: false, v: 0, lx: e.clientX, lt: performance.now() };
});
drumEl.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved) {
    if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(e.clientY - drag.y)) return;
    drag.moved = true;
    drumEl.setPointerCapture(e.pointerId);
    drumEl.classList.add('held');
    pointerSay();
  }
  const now = performance.now(), dt = Math.max(8, now - drag.lt);
  drag.v = 0.7 * drag.v + 0.3 * (-(e.clientX - drag.lx) / tilePx()) / (dt / 1000);
  drag.lx = e.clientX; drag.lt = now;
  turnTo(drag.q0 - dx / tilePx());
});
const letGo = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (drag.moved) {
    dragged = performance.now();
    drumEl.classList.remove('held');
    // a flick keeps turning, slowing as it goes (if the hand was still moving when it let go)
    if (performance.now() - drag.lt < 80 && Math.abs(drag.v) > 0.4) coast = { v: clamp(drag.v, -9, 9), at: wantQ() };
  }
  drag = null;
  pointerSay();
};
drumEl.addEventListener('pointerup', letGo);
drumEl.addEventListener('pointercancel', letGo);
function coastOn(dt) {
  coast.v *= Math.exp(-dt * 3.2);
  coast.at += coast.v * dt;
  turnTo(coast.at);
  if (Math.abs(coast.v) < 0.08 || coast.at <= 0 || coast.at >= LAST) coast = null;
}
for (const ev of ['wheel', 'touchstart', 'keydown']) addEventListener(ev, () => { coast = null; }, { passive: true });
drumEl.addEventListener('click', (e) => {
  const a = e.target.closest('.tile');
  if (!a) return;
  if (performance.now() - dragged < 250) { e.preventDefault(); return; }
  const k = +a.dataset.k;
  if (k !== shownFront) { e.preventDefault(); turnTo(k, true); }
});
drumEl.addEventListener('dragstart', (e) => e.preventDefault());

/* ------------------------------------------------------------------ a pointer that says what it does */
// With a mouse, over the drum the pointer is a ring that says what a press will do: turn it, or open
// the one in front. Touch screens keep their own.
const pointerEl = $('#pointer'), pointerOn = !!pointerEl && matchMedia('(hover: hover) and (pointer: fine)').matches;
let overDrum = false, overFront = false;
function pointerSay() {
  if (!pointerOn) return;
  const say = drag?.moved ? 'Drag' : overFront ? 'Open' : overDrum ? 'Drag' : '';
  pointerEl.classList.toggle('on', !!say);
  pointerEl.classList.toggle('held', !!drag?.moved);
  if (say) pointerEl.firstChild.textContent = say;
}
if (pointerOn) {
  document.documentElement.classList.add('ring');
  addEventListener('pointermove', (e) => {
    pointerEl.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
    const t = e.target.closest?.('.tile');
    const od = !!e.target.closest?.('.drum') && drumEl.style.visibility !== 'hidden', of = od && !!t && t.classList.contains('front');
    if (od !== overDrum || of !== overFront) { overDrum = od; overFront = of; pointerSay(); }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { overDrum = overFront = false; pointerSay(); });
}

/* ------------------------------------------------------------------ live figures on the drum */
// Each tile's figure draws at a reading size and is scaled up to fill the tile, so its own labels
// grow with it: nothing in front is smaller than it was on the map.
const dpr = Math.min(devicePixelRatio || 1, 2);
function sizeTile(t) {
  const w = t.c.clientWidth, h = t.c.clientHeight;
  if (!w || !h || (w === t.w && h === t.h)) return;
  t.w = w; t.h = h; t.zoom = clamp(w / 430, 1, 1.9);
  t.c.width = Math.round(w * dpr); t.c.height = Math.round(h * dpr);
  if (t.fig) { t.fig.size(w / t.zoom, h / t.zoom); draw(t); }
}
function draw(t) {
  const ctx = t.c.getContext('2d');
  ctx.setTransform(dpr * t.zoom, 0, 0, dpr * t.zoom, 0, 0);
  ctx.fillStyle = '#0e0f12'; ctx.fillRect(0, 0, t.w / t.zoom, t.h / t.zoom);
  t.fig.draw(ctx);
}
function wake(t) {
  if (t.fig) return;
  sizeTile(t);
  t.fig = new FIG[t.id]({ color: PROJ[t.id].color, fx: () => {} });
  if (t.id === 'atlas') t.fig.external = true;
  t.fig.size(t.w / t.zoom, t.h / t.zoom);
  for (let k = 0; k < 90; k++) t.fig.step(1 / 60);
  draw(t);
}
// one a frame, nearest the front first, so waking them never stalls
const wakeOne = () => { const t = tiles.filter((o) => !o.fig).sort((a, b) => Math.abs(a.k - q) - Math.abs(b.k - q))[0]; if (t) wake(t); };
for (const t of tiles) {
  t.el.addEventListener('pointerenter', () => { t.hot = true; });
  t.el.addEventListener('pointerleave', () => { t.hot = false; t.fig?.leave?.(); });
  t.el.addEventListener('pointermove', (e) => {
    if (!t.fig || drag?.moved) return;
    const r = t.c.getBoundingClientRect();
    t.fig.move?.((e.clientX - r.left) / r.width * t.w / t.zoom, (e.clientY - r.top) / r.height * t.h / t.zoom);
  });
  t.el.addEventListener('focus', () => { t.hot = true; });
  t.el.addEventListener('blur', () => { t.hot = false; });
}
// The one in front runs every frame (every other on a slower tier; every third while the drum
// turns); the two beside it take turns, and wait while it turns; the rest are out of sight and wait.
let rr = 0, lastTick = 0, odd = false, third = 0;
function tickTiles(now) {
  const dt = Math.min(0.05, (now - (lastTick || now)) / 1000); lastTick = now;
  if (tiles.some((o) => !o.fig)) { wakeOne(); return; }
  odd = !odd; rr = (rr + 1) % 2; third = (third + 1) % 3;
  const front = shownFront, every = tier === 'high' && !moving;
  for (const t of tiles) {
    const d = t.k - shownT;
    if (Math.abs(d) >= 1.6) continue;
    const go = t.k === front || t.hot ? every || (moving ? third === 0 : odd) : !moving && !odd && (d < 0 ? rr === 0 : rr === 1);
    if (!go) continue;
    const step = Math.min(0.12, (now - (t.last || now)) / 1000) || dt;
    t.fig.step(step); draw(t); t.last = now;
  }
}

/* ------------------------------------------------------------------ start */
let rz = 0;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const i = p, k = q; layout(); scrollTo(0, yAt(i, k)); p = want(); q = wantQ(); dirty = true; }, 150); });
function start() {
  layout();
  const h = location.hash.slice(1), i = scenes.findIndex((x) => x.id === h);
  if (i > 0) { scrollTo(0, yOf(i)); introT = 1; }
  else if (scrollY > 2) introT = 1;
  p = want(); q = wantQ();
  introStart = performance.now() + 250;
  requestAnimationFrame(frame);
  document.documentElement.classList.add('posed'); // the first frame poses every scene before this is painted
}
// the big words are painted from the page's fonts, so wait for them
Promise.all([document.fonts?.ready, document.fonts?.load('400 100px "Instrument Serif"'), document.fonts?.load('italic 400 100px "Instrument Serif"'), document.fonts?.load('500 12px "JetBrains Mono"')].map((x) => Promise.resolve(x).catch(() => {}))).then(start);

window.__unfold = {
  get p() { return p; }, get eye() { return eye; }, get scene() { return Math.round(eye); }, get intro() { return introT; }, get tier() { return tier; }, get gl() { return !!gl; },
  scenes, goTo, yAt, get q() { return q; },
  catchUp() { p = want(); q = wantQ(); introT = introStart && performance.now() > introStart + INTRO ? 1 : introT; render(); }
};
