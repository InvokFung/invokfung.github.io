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
// Round 8 (lab/climb) is the homepage's own engine with one change to the journey: deep in the
// cloud by the camp, on the flight from the climb to the work, the scroll holds the landscape still
// for the film (film.js), seven projects as seven small 3D scenes, and lets it fly on after. The
// cover says what I do instead of showing my name.
import { mountSpecimens } from '../book/specimens.js';
import { createScenery } from '../unfold/scenery.js';
import { clamp, lerp, tint, rgba, skyline, valley, foot, along, trail, pennant, paintSky, paintRidge, paintMist, paintWisp, paintSea, paintPuff, paintRadial, paintFloor, paintText } from '../unfold/art.js';
import { createFilm } from './film.js';

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

/* ------------------------------------------------------------------ the film, inside the cloud */
// The flight from the climb to the camp holds at HOLD (scenes), deep in the cloud, for the film's
// length in screens; y is the scroll in pixels, f how far into the film, in screens.
const HOLD = 1.53;
const film = createFilm({ canvas: $('#filmgl'), root: $('#film'), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, tier, webgl: !!gl });
if (!film.gl) document.documentElement.classList.add('nofilm');
let FILMH = 0;
const sceneY = (i) => i * STEP + (i > HOLD ? FILMH : 0);
const maxY = () => (N - 1) * STEP + FILMH;
function split(y) {
  const y0 = HOLD * STEP, f = (y - y0) / H;
  if (y <= y0) return [y / STEP, f];
  if (y < y0 + FILMH) return [HOLD, f];
  return [(y - FILMH) / STEP, f];
}

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

/* ------------------------------------------------------------------ scene 3: the work, all seven */
const PROJ = Object.fromEntries(D.projects.map((p) => [p.id, p]));
const FRONT = ['relay', 'tracewise', 'onboard', 'dispatch'], BACK = ['atlas', 'intonation', 'layerline'];
const FIG = { relay: F.Relay, tracewise: F.Tracewise, onboard: F.Onboard, dispatch: F.Dispatch, atlas: F.Atlas, intonation: F.Studio, layerline: F.Layerline };
const panelsEl = $('#panels');
panelsEl.innerHTML = [...BACK, ...FRONT].map((id) => {
  const p = PROJ[id], L = D.live[id], back = BACK.includes(id);
  // the front row carries two of the project's own measurements; the back row its headline number
  const nums = back ? '' : `<span class="nums">${p.metrics.slice(0, 2).map(([n, l]) => `<span><b>${esc(n)}</b><small>${esc(l)}</small></span>`).join('')}</span>`;
  return `<a class="layer panel${back ? ' back' : ' has-nums'}" data-id="${id}" href="/explore/#work/${id}" style="--c:${p.color}" aria-label="${esc(p.name)}: ${esc(p.kind)}. ${esc(L.tag[0])} ${esc(L.tag[1])}.">
    <canvas aria-hidden="true"></canvas>
    <span class="hint" aria-hidden="true">${esc(L.line)}</span>
    ${nums}
    <span class="cap"><i></i><b>${esc(p.name)}</b><small>${esc(p.kind)}</small>${back ? `<span>${esc(L.tag[0])}</span>` : ''}</span>
  </a>`;
}).join('');
const panels = $$('.panel', panelsEl).map((el) => ({ el, id: el.dataset.id, c: $('canvas', el), fig: null, w: 0, h: 0, hot: false, last: 0 }));
function workLayout(W, H) {
  const ph = narrow(), out = {};
  if (!ph) {
    const g = Math.max(28, W * 0.04), gap = 18;
    const fw = (W - 2 * g - 3 * gap) / 4, fh = Math.min(H * 0.36, fw * 1.02), fb = H * 0.93;
    FRONT.forEach((id, i) => { out[id] = { l: g + i * (fw + gap), t: fb - fh, w: fw, h: fh }; });
    const bw = Math.min(fw * 0.92, (W * 0.6 - 2 * gap) / 3), bh = Math.min(H * 0.22, bw * 0.74), bb = H * 0.5;
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
const scenes = $$('.page').map((el, i) => ({ el, i, id: el.id, items: [], floor: null, sky: null }));
const N = scenes.length;
const live = { work: false, craft: false };
let A = [], veil = [], camp = null, painted = [], radial = null;
const mists = new Map();

function place(el, r) { Object.assign(el.style, { left: r.l + 'px', top: r.t + 'px', width: r.w + 'px', height: r.h + 'px', right: 'auto', bottom: 'auto' }); }

function layout() {
  W = stage.clientWidth; H = stage.clientHeight;
  P = Math.max(W, H) * 1.2;
  ox = W / 2; oy = -0.4 * H; Yf = H;
  STEP = H * (narrow() ? 0.8 : 0.9); // the scroll from one scene to the next
  DZ = P * 0.42;                      // and how far apart two scenes stand
  FILMH = film.length * H;
  scroller.style.height = ((N - 1) * STEP + FILMH + H) + 'px';
  if (thread) {
    $$('i', thread).forEach((el) => el.remove());
    thread.insertAdjacentHTML('afterbegin', scenes.map((sc) => `<i style="top:${((THREAD_IN + (1 - 2 * THREAD_IN) * sceneY(sc.i) / maxY()) * 100).toFixed(1)}%"></i>`).join(''));
  }
  threadH = thread ? thread.clientHeight : 0;
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
  const wl = workLayout(W, H);
  for (const p of panels) place(p.el, wl[p.id]);
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
      const role = el.classList.contains('panel') ? 'panel' : el.classList.contains('spec') ? 'spec' : el.classList.contains('step-flag') ? 'flag' : el.classList.contains('foot') ? 'foot' : 'words';
      const it = item(el, role, b, s);
      it.dom = true;
      it.yb = it.Yb - b.t; // the bottom edge, in the layer's own pixels: the fold's hinge
      const cx = ox - b.l, cy = oy - b.t;
      it.place = `translate(${cx.toFixed(2)}px,${cy.toFixed(2)}px) scale(${(1 / s).toFixed(5)}) translate(${(-cx).toFixed(2)}px,${(-cy).toFixed(2)}px)`;
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
  // pools of light under the panels and the specimens, and a glow behind each panel
  for (const [sc, role, col] of [[scenes[2], 'panel', null], [scenes[3], 'spec', '#ffb36b']]) {
    for (const it of sc.items.filter((o) => o.role === role)) {
      const c = tint(col || PROJ[it.el.dataset.id].color), b = it.b;
      const x0 = ox + (b.l - b.w * 0.25 - ox) / it.s, x1 = ox + (b.l + b.w * 1.25 - ox) / it.s;
      sc.items.push({ role: 'pool', owner: it, mode: 1, b: { l: x0, t: 0, w: x1 - x0, h: 0 }, fl: [it.z + P * 0.07, it.z - P * 0.05, Yf, 0], z: it.z, s: it.s, ord: it.ord, tex: glow, blend: 'add', tintC: c, base: col ? 0.42 : 0.36 });
      if (role === 'panel') {
        const e = Math.max(b.w, b.h) * 0.22;
        const hb = { l: b.l - e, t: b.t - e, w: b.w + 2 * e, h: b.h + 2 * e };
        sc.items.push({ role: 'halo', owner: it, b: hb, s: it.s * 0.999, z: it.z - 1, Yb: it.Yb, ord: it.ord, tex: glow, blend: 'add', tintC: c, base: 0.26 });
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

  for (const p of panels) sizePanel(p);
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
  // the camera flies to the camp and into the cloud beside it; the years fall away, and the work is
  // there when it clears
  fly: {
    out(it, t) {
      if (it.role === 'flag') it.alpha = it.now ? 1 - clamp((t - 0.24) / 0.2) : 1 - clamp((t - (5 - it.k) * 0.02) / 0.18);
      else if (it.role === 'words') { it.alpha = 1 - clamp(t / 0.2); it.dy = -t * H * 0.1; }
      else it.alpha = 1 - clamp((t - 0.44) / 0.18);
    },
    in(it, t) {
      if (it.dom) rising(it, t, 0.56, 0.3, 0.2);
      else { it.alpha = clamp((t - 0.4) / 0.2); it.rise = 0.55 + 0.45 * stand(clamp((t - 0.4 - it.ord * 0.1) / 0.5)); }
    },
    sky: (t) => 1 - clamp((t - 0.44) / 0.18),
    floor: (t) => 1 - clamp((t - 0.44) / 0.18),
    skyIn: (t) => clamp((t - 0.3) / 0.15),
    floorIn: (t) => clamp((t - 0.35) / 0.15)
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
// The scroll is the browser's own: nothing is held, snapped or hijacked. What is drawn follows it
// a beat behind, so a flick of the wheel glides instead of jumping.
let p = 0, sy = 0, fz = -9, vel = 0, dirty = true, introT = reduced ? 1 : 0, introStart = 0, lastNow = 0;
const INTRO = 3000; // the opening, first light, in ms
const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => { ptr.tx = e.clientX / innerWidth * 2 - 1; ptr.ty = e.clientY / innerHeight * 2 - 1; }, { passive: true });
addEventListener('scroll', () => { dirty = true; }, { passive: true });
const want = () => clamp(scrollY, 0, maxY());
const settle = () => { sy = want(); [p, fz] = split(sy); p = clamp(p, 0, N - 1); };

function goTo(i, instant) {
  const y = sceneY(clamp(i, 0, N - 1));
  scrollTo({ top: y, behavior: instant || reduced ? 'instant' : 'smooth' });
  if (instant) { settle(); dirty = true; }
}
// to a place in the film (a chapter, when a link in it takes focus)
function goFilm(f) { scrollTo({ top: HOLD * STEP + f * H, behavior: 'instant' }); settle(); dirty = true; }
// links and focus go to the scene that holds them
document.addEventListener('focusin', (e) => {
  const ff = e.target.closest?.('#film') ? film.at(e.target) : null;
  if (ff != null) { if (Math.abs(fz - ff) > 0.6) goFilm(ff); return; }
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
  thread.append(mark);
  const to = (e) => {
    const r = thread.getBoundingClientRect(), q = clamp(((e.clientY - r.top) / r.height - THREAD_IN) / (1 - 2 * THREAD_IN));
    scrollTo(0, q * maxY());
  };
  thread.addEventListener('pointerdown', (e) => { thread.setPointerCapture(e.pointerId); thread.classList.add('held'); to(e); });
  thread.addEventListener('pointermove', (e) => { if (thread.hasPointerCapture(e.pointerId)) to(e); });
  const up = () => thread.classList.remove('held');
  thread.addEventListener('pointerup', up); thread.addEventListener('pointercancel', up);
}
function threadAt(i) {
  if (!thread || i === shownThread) return;
  shownThread = i;
  const sun = PAL[scenes[i].id].sun.c;
  thread.style.setProperty('--sun', sun);
  thread.style.setProperty('--glow', rgba(sun, 0.5));
}
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
let shownFolio = -1, eye = 0, clock = 0, lastDraw = 0, slow = 0, was = 0, coarse = false, settleAt = 0, filmWas = 0;
// while the film plays, the folio names its chapter
function filmFolio(f) {
  const l = film.label(f), key = l ? 'f' + l.i : 'cloud';
  if (shownFolio === key) return;
  shownFolio = key;
  folio.querySelector('b').textContent = l ? String(l.i + 1).padStart(2, '0') : '·';
  folio.querySelector('span').textContent = l ? '/ 07' : '';
  folio.querySelector('i').textContent = l ? l.name : 'In the cloud';
}
const view = { W: 0, H: 0, P: 0, po: [0, 0], o: [0, 0] };

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - (lastNow || now)) / 1000); lastNow = now;
  const target = want(), sy0 = sy;
  if (reduced || Math.abs(target - sy) < 0.4) { if (sy !== target) { sy = target; dirty = true; } }
  else { sy += (target - sy) * (1 - Math.exp(-dt * 7)); dirty = true; }
  vel = dt > 0 ? lerp(vel, (sy - sy0) / H / dt, 0.25) : vel;
  [p, fz] = split(sy);
  p = clamp(p, 0, N - 1);
  if (introT < 1 && introStart) { introT = clamp((now - introStart) / INTRO); dirty = true; }
  if (!reduced && TIERS[tier].idle && (Math.abs(ptr.tx - ptr.x) > 0.001 || Math.abs(ptr.ty - ptr.y) > 0.001)) { ptr.x += (ptr.tx - ptr.x) * 0.05; ptr.y += (ptr.ty - ptr.y) * 0.05; dirty = true; }
  moving = dirty;
  // frames running slow while moving: step down a tier (not when one is pinned)
  if (moving && !pinned && gl) {
    slow = dt > 0.05 ? slow + 4 : dt > 0.026 ? slow + 1 : Math.max(0, slow - 2);
    if (slow > 30 && tier !== ORDER[ORDER.length - 1]) { tier = ORDER[ORDER.indexOf(tier) + 1]; slow = 0; sizeCanvas(); film.setTier(tier); film.size(W, H, filmRes(), narrow()); }
  }
  // the film plays over the landscape while it's in; once it covers the screen the landscape waits
  const fa = film.frame(fz, dt, vel);
  if (fa > 0.001) filmFolio(fz);
  if (mark) mark.style.transform = `translateY(${((THREAD_IN + (1 - 2 * THREAD_IN) * sy / maxY()) * threadH).toFixed(1)}px)`;
  if (fa >= 0.999) { threadMove(now, sy !== sy0); dirty = false; was = p; filmWas = fa; return; }
  if (filmWas >= 0.999 && fa < 0.999) dirty = true;
  filmWas = fa;
  // coarse while the scroll moves, sharp once it has been still a moment
  if (gl && TIERS[tier].move < 1) {
    if (p !== was || introT < 1) { settleAt = now + 180; if (!coarse) { coarse = true; sizeCanvas(); } }
    else if (coarse && now > settleAt) { coarse = false; sizeCanvas(); }
  }
  threadMove(now, sy !== sy0);
  was = p;
  clock += dt;
  const idle = !dirty && TIERS[tier].idle && gl && !reduced && now - lastDraw > 33;
  if (!dirty && !idle) { if (live.work) tickPanels(now); return; }
  dirty = false;
  lastDraw = now;
  render();
  if (live.work) tickPanels(now);
}

function render() {
  eye = travel(p);
  const cur = Math.round(eye);
  if (cur !== shownFolio) {
    shownFolio = cur;
    threadAt(cur);
    folio.querySelector('b').textContent = cur + 1;
    folio.querySelector('span').textContent = '/ 5';
    folio.querySelector('i').textContent = scenes[cur].el.dataset.name;
  }
  live.work = Math.abs(eye - 2) < 0.35;
  live.craft = Math.abs(eye - 3) < 0.35;
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
  for (const sc of scenes) {
    const u = eye - sc.i;
    const vis = reduced ? Math.abs(p - sc.i) < 1 : u > -1 && u < 1;
    sc.el.classList.toggle('off', !vis);
    if (!vis) continue;
    const off = reduced ? [0, 0, 0] : A[sc.i].map((v, k) => v - cam[k]);
    sc.el.style.transform = reduced || Math.hypot(...off) < 0.01 ? '' : `translate3d(${off[0].toFixed(2)}px,${off[1].toFixed(2)}px,${off[2].toFixed(2)}px)`;
    // with reduced motion, nothing moves: the scenes cross-fade, each drawn whole. On the canvas
    // the next scene waits underneath and this one fades off it, while the words hand over without
    // overlapping; without WebGL the next scene's own page fades in over this one.
    const d = p - sc.i;
    const fade = !reduced ? 1 : gl ? (d <= 0 ? 1 : 1 - smooth(0.2, 0.8, d)) : d <= 0 ? smooth(-0.65, -0.35, d) : d < 0.65 ? 1 : 0;
    // (opacity on a section would flatten its 3D, so on the canvas each box of words fades itself)
    const words = reduced && gl ? (d <= 0 ? smooth(-0.4, -0.1, d) : 1 - smooth(0.1, 0.4, d)) : 1;
    if (reduced && !gl) sc.el.style.opacity = fade.toFixed(3);
    const into = reduced ? (whole[sc.i] = fresh()) : list;
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
  // mid-flight, the cloud by the camp fills the screen, lit by the camp; one scene becomes the
  // next inside it
  if (!reduced && i === 1) {
    const g = bell(t, 0.52, 0.17), fog = 0.92 * smooth(0.32, 0.47, t) * (1 - smooth(0.6, 0.74, t));
    if (g > 0.01) {
      const o = A[1].map((v, k) => v - cam[k]), Z = camp.Z + o[2], w = (P - Z) / P;
      const x = po[0] + (camp.X + o[0] - po[0]) / w, y = po[1] + (camp.Y + o[1] - po[1]) / w;
      if (fog > 0.01) list.top.push({ mode: 2, alpha: fog, tint: tint('#5f6a78'), fade: [x, y, Math.max(W, H) * 2, 1], blend: 'over', depth: 'none', d: 1e9 - 1 });
      list.top.push({ mode: 2, alpha: g * 0.38, tint: tint('#ffa860'), fade: [x, y, Math.max(W, H * 0.65) * lerp(0.22, 0.8, clamp(t / 0.7)), 0], blend: 'add', depth: 'none', d: 1e9 });
    }
  }
  // skies and floors: the scene coming in (behind) first, the one going out over it
  list.sky.reverse(); list.floor.reverse();
  // paper and the soft things between it (mist, cloud, light) in one order, back to front, so a
  // nearer sheet covers a farther mist rather than cutting a hole in it
  const mid = [...list.paper, ...list.soft].sort(byDepth);
  list.top.sort(byDepth);
  gl.draw(view, [...list.sky, ...list.floor, ...mid, ...list.top]);
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
  if (el._op !== op) { el.style.opacity = op; el._op = op; }
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
// the film draws at the landscape's resolution, a little lower: it moves all the time
const filmRes = () => Math.min(TIERS[tier].res, 1.25) * (tier === 'high' ? 1 : 0.85);

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
// The one under the pointer runs every frame; the rest take turns, two a frame (one on a slower
// tier), so all seven stay alive without all seven costing a frame.
let rr = 0, lastTick = 0;
function tickPanels(now) {
  const dt = Math.min(0.05, (now - (lastTick || now)) / 1000); lastTick = now;
  for (const p of panels) if (!p.fig) { wake(p); return; } // one a frame, so waking them never stalls
  rr = (rr + 1) % panels.length;
  const two = tier === 'high' && !moving;
  panels.forEach((p, k) => {
    if (p.hot || (reduced && !gl)) { p.fig.step(dt); draw(p); p.last = now; return; }
    if (k === rr || (two && k === (rr + 3) % panels.length)) { const d = Math.min(0.12, (now - (p.last || now)) / 1000) || dt; p.fig.step(d); draw(p); p.last = now; }
  });
}

/* ------------------------------------------------------------------ start */
let rz = 0;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const k = sy / Math.max(1, maxY()); layout(); film.size(W, H, filmRes(), narrow()); scrollTo(0, k * maxY()); settle(); dirty = true; }, 150); });
function start() {
  layout();
  film.size(W, H, filmRes(), narrow());
  film.init();
  const h = location.hash.slice(1), i = scenes.findIndex((x) => x.id === h);
  if (i > 0) { scrollTo(0, sceneY(i)); introT = 1; }
  else if (h === 'work-film') { goFilm(4.6); introT = 1; }
  else if (scrollY > 2) introT = 1;
  settle();
  introStart = performance.now() + 250;
  requestAnimationFrame(frame);
  document.documentElement.classList.add('posed'); // the first frame poses every scene before this is painted
}
// the big words are painted from the page's fonts, so wait for them
Promise.all([document.fonts?.ready, document.fonts?.load('400 100px "Instrument Serif"'), document.fonts?.load('italic 400 100px "Instrument Serif"'), document.fonts?.load('500 12px "JetBrains Mono"')].map((x) => Promise.resolve(x).catch(() => {}))).then(start);

window.__climb = {
  get p() { return p; }, get f() { return fz; }, get eye() { return eye; }, get scene() { return Math.round(eye); }, get intro() { return introT; }, get tier() { return tier; }, get gl() { return !!gl; },
  scenes, goTo, goFilm, film, sceneY, maxY, HOLD,
  catchUp() { settle(); introT = introStart && performance.now() > introStart + INTRO ? 1 : introT; film.frame(fz, 0, 0); render(); }
};
