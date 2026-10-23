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
//   Hello → Climb    part:   the cover tears at its valleys and parts like a curtain; the mountain
//                            stands up behind it
//   Climb → Work     fly:    the camera flies to the 2026 camp; the work stands up there, under the
//                            camp's light
//   Work  → Craft    pan:    the camera pans along the camp; the panels lie down and the specimens
//                            stand up, each in a wave
//   Craft → Contact  clouds: the camera climbs; clouds rise, then part on the summit, now clear
// Everything is a function of the scroll position, so scrolling back plays it all in reverse.
import { mountSpecimens } from '../book/specimens.js';
import { createScenery } from './scenery.js';
import { clamp, lerp, tint, skyline, valley, foot, along, trail, pennant, paintSky, paintRidge, paintMist, paintCloud, paintPuff, paintRadial, paintFloor, paintText } from './art.js';

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
    ridges: ['#6f5f6a', '#4d4555', '#34303f', '#22212c', '#121218'], rim: '#ffd3a1', rimA: [0.85, 0.6, 0.45, 0.32, 0.22], haze: 'rgba(255,205,165,0.22)', mist: '#ffd6aa' },
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
  scroller.style.height = ((N - 1) * STEP + H) + 'px';
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
    const ridges = $$('.gl[data-art="ridge"]', sc.el);
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
      if (art === 'mist') {
        const key = pal.mist;
        if (!mists.has(key) || !gl) mists.set(key, paintMist(pal.mist));
        c = mists.get(key);
        it = item(el, 'mist', b, sOf(el, b));
        it.tex = T(c, { repeat: true }); it.tile = b.w / 640;
        if (!gl) { const cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0); el.append(cv); }
        continue;
      }
      if (art === 'text') {
        c = paintText(el, { l: b.l + sr.left, t: b.t + sr.top, w: b.w, h: b.h }, KT);
        it = item(el, 'text', b, sOf(el, b));
      } else {
        const k = ridges.indexOf(el), big = art !== 'ridge';
        // land runs on past each end, for when a scene is seen from further off than at rest
        const opt = { H, color: big ? pal[art] : pal.ridges[k], rim: pal.rim, rimA: big ? 0.7 : pal.rimA[k], haze: pal.haze, pad: big ? Math.round(H * 0.08) : 0, side: Math.round(b.w * 0.22), face: big ? pal.face : null };
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
      if ('tear' in el.dataset) it.pieces = tear(el, it, art === 'ridge' ? SHAPE[sc.id][ridges.indexOf(el)] : null, it.side || 0);
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
  // the clouds between the craft and contact: three banks, nearer ones paler and lit
  veil = [];
  const VEIL = [
    { s: 0.72, t: -0.16, light: '#ffc2a0', body: '#6a4a62', deep: '#2e2238', seed: 3 },
    { s: 0.88, t: 0.02, light: '#ffcfae', body: '#59405a', deep: '#2a1f34', seed: 5 },
    { s: 1.04, t: 0.2, light: '#ffd9bc', body: '#4a3550', deep: '#1f1828', seed: 9 }
  ];
  VEIL.forEach((v, n) => {
    const b = { l: -0.3 * W, t: v.t * H, w: 1.6 * W, h: 1.3 * H };
    const tex = T(paintCloud(b.w, b.h, Math.min(0.5, K), v));
    const it = { role: 'veil', n, b, s: v.s, z: P * (1 - 1 / v.s), tex, cutX: 0.5 + (n - 1) * 0.04 };
    it.Yb = oy + (b.t + b.h - oy) / it.s;
    veil.push(it);
  });

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

/* ------------------------------------------------------------------ the moves */
// Each move between two scenes has its own way in and out. t: how far through the move, 0 to 1.
// Each sets an item's pose: rise (1 standing, 0 flat), alpha, and dx, dy (moved in the world).
const KIND = ['part', 'fly', 'pan', 'clouds'];
const rising = (it, t, from, span, gap = 0.36) => { const r = stand(clamp((t - from - it.ord * gap) / span)); it.rise = r; it.alpha = clamp(r / 0.12); };
const MOVES = {
  // the cover tears at its valleys and parts, nearer sheets further; the mountain stands up behind
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
// the cloud banks between craft and contact, by t of that move
function veilPose(it, t) {
  const n = it.n, up = easeOut(clamp((t - 0.1 - n * 0.06) / 0.36));
  it.dy = (1 - up) * (H * 1.05 - it.b.t) / it.s;
  it.part = easeInOut(clamp((t - 0.6 - (2 - n) * 0.03) / 0.33)) * W * (0.75 + 0.35 * n) / it.s;
  it.alpha = clamp((t - 0.1) / 0.08) * (1 - clamp((t - 0.88) / 0.12));
}

/* ------------------------------------------------------------------ scroll and pointer */
// The scroll is the browser's own: nothing is held, snapped or hijacked. What is drawn follows it
// a beat behind, so a flick of the wheel glides instead of jumping.
let p = 0, dirty = true, introT = reduced ? 1 : 0, introStart = 0, lastNow = 0;
const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => { ptr.tx = e.clientX / innerWidth * 2 - 1; ptr.ty = e.clientY / innerHeight * 2 - 1; }, { passive: true });
addEventListener('scroll', () => { dirty = true; }, { passive: true });
const want = () => clamp(scrollY / STEP, 0, N - 1);

function goTo(i, instant) {
  const y = clamp(i, 0, N - 1) * STEP;
  scrollTo({ top: y, behavior: instant || reduced ? 'instant' : 'smooth' });
  if (instant) { p = want(); dirty = true; }
}
// links and focus go to the scene that holds them
document.addEventListener('focusin', (e) => {
  const pg = e.target.closest?.('.page');
  const i = pg ? scenes.findIndex((x) => x.el === pg) : -1;
  if (i >= 0 && Math.abs(p - i) > 0.02) goTo(i, true);
});
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  const i = a ? scenes.findIndex((x) => '#' + x.id === a.getAttribute('href')) : -1;
  if (i >= 0) { e.preventDefault(); goTo(i); }
});

/* ------------------------------------------------------------------ the frame */
// Where the eye is, in scenes: it slows near each scene, so there is time to read it, and moves
// fastest between two.
const travel = (q) => { const i = Math.min(Math.floor(q), N - 2), t = q - i; return i + t - 0.6 * Math.sin(2 * Math.PI * t) / (2 * Math.PI); };
const folio = $('#folio');
let shownFolio = -1, eye = 0, clock = 0, lastDraw = 0, slow = 0, was = 0, coarse = false, settle = 0;
const view = { W: 0, H: 0, P: 0, po: [0, 0], o: [0, 0] };

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - (lastNow || now)) / 1000); lastNow = now;
  const target = want();
  if (reduced || Math.abs(target - p) < 0.0005) { if (p !== target) { p = target; dirty = true; } }
  else { p += (target - p) * (1 - Math.exp(-dt * 7)); dirty = true; }
  if (introT < 1 && introStart) { introT = clamp((now - introStart) / 2200); dirty = true; }
  if (!reduced && TIERS[tier].idle && (Math.abs(ptr.tx - ptr.x) > 0.001 || Math.abs(ptr.ty - ptr.y) > 0.001)) { ptr.x += (ptr.tx - ptr.x) * 0.05; ptr.y += (ptr.ty - ptr.y) * 0.05; dirty = true; }
  moving = dirty;
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
    folio.querySelector('b').textContent = cur + 1;
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
      it.rise = 1; it.alpha = 1; it.dx = 0; it.dy = 0; it.part = 0;
      if (!reduced) {
        if (u < 0 && inK) inK.in(it, 1 + u);
        else if (u > 0 && outK) outK.out(it, u);
        if (sc.i === 0 && introT < 1 && it.role !== 'mist') { const r = stand(clamp((introT - it.ord * 0.42) / 0.5)); if (r < it.rise) { it.rise = r; it.alpha = Math.min(it.alpha, clamp(r / 0.12)); } }
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
      into.sky.push(skySprite(sc, off, po, sa));
      into.floor.push({ mode: 1, tex: sc.floor.tex, box: [ox - sc.floor.half, 0, sc.floor.half * 2, 0], fl: [sc.floor.near, sc.floor.far, Yf, 0], off, alpha: fa, fade: [0.9, 0.12, 0, 0.16], i: sc.i });
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
    veilPose(it, t);
    for (const side of [-1, 1]) {
      const cut = [it.cutX, side, 0.02, 22];
      list.top.push({ tex: it.tex, box: [it.b.l, it.b.t, it.b.w, it.b.h], sub: side < 0 ? [0, 0, it.cutX + 0.06, 1] : [it.cutX - 0.06, 0, 1, 1], L: [it.s, it.z, it.Yb, 0], off: [side * it.part, it.dy, 0], alpha: it.alpha, cut, depth: 'none', d: it.z });
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

const GRAIN = [2, 0, 0, 0.16];
// a scene's sky: the horizon and sun where its floor's far edge and its sun now project
function skySprite(sc, off, po, alpha) {
  const k = sc.sky, Zs = sc.skyZ + off[2], w = (P - Zs) / P, mag = (P / (P - Zs)) / sc.skyS;
  const hy = po[1] + (Yf + off[1] - po[1]) / w;
  const sx = po[0] + (k.sunW[0] + off[0] - po[0]) / w, sy = po[1] + (k.sunW[1] + off[1] - po[1]) / w;
  return { mode: 3, alpha, depth: 'none', sky: { colours: k.colours, g: [hy, k.span * mag, H * 0.5 * mag, 0.07], sun: [sx, sy, k.r * mag, k.gr * mag], glow: k.glow } };
}
function pushSprite(list, it, off) {
  if (!(it.alpha > 0.002)) return;
  const th = (90 * (1 - it.rise)) * Math.PI / 180;
  const o = [off[0] + it.dx, off[1] + it.dy, off[2]];
  const depthNow = it.z + o[2];
  if (it.role === 'pool') { list.soft.push({ mode: 1, tex: it.tex, box: [it.b.l, 0, it.b.w, 0], fl: it.fl, off: o, alpha: it.alpha * it.base * it.rise, tint: it.tintC, blend: 'add', depth: 'test', fade: [2, 0, 0, 0], d: depthNow }); return; }
  const L = [it.s, it.z, it.Yb, 0], pad = it.pad || 0, sd = it.side || 0, bx = [it.b.l - sd, it.b.t - pad, it.b.w + 2 * sd, it.b.h + pad];
  if (it.role === 'mist') {
    list.soft.push({ tex: it.tex, box: bx, sub: [0, 0, it.tile, 1], L, th, off: o, alpha: it.alpha, shift: [reduced ? 0 : clock * 0.006, 0], depth: 'test', d: depthNow });
    return;
  }
  if (it.role === 'soft' || it.role === 'halo') {
    const dx = it.drift && !reduced ? Math.sin(clock * 0.18 + it.phase) * it.drift : 0;
    const a = it.alpha * (it.base ?? 1) * (it.pulse && !reduced ? 0.85 + 0.15 * Math.sin(clock * 1.3) : 1);
    list.soft.push({ tex: it.tex, box: bx, L, th, off: [o[0] + dx, o[1], o[2]], alpha: a, tint: it.tintC, blend: it.blend || 'over', depth: 'test', d: depthNow });
    return;
  }
  // paper; a torn sheet as its two pieces, parted
  const bright = 1 - 0.45 * (1 - clamp(it.rise));
  const tnt = [bright, bright, bright];
  if (it.pieces) {
    for (const pc of it.pieces) list.paper.push({ tex: it.tex, box: bx, sub: pc.sub, cut: pc.cut, L, th, off: [o[0] + pc.side * (it.part || 0), o[1], o[2]], alpha: it.alpha, tint: tnt, depth: 'write', fade: GRAIN, d: depthNow });
  } else list.paper.push({ tex: it.tex, box: bx, L, th, off: o, alpha: it.alpha, tint: tnt, depth: 'write', fade: it.role === 'text' ? null : GRAIN, d: depthNow });
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
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const i = p; layout(); scrollTo(0, i * STEP); p = want(); dirty = true; }, 150); });
function start() {
  layout();
  const h = location.hash.slice(1), i = scenes.findIndex((x) => x.id === h);
  if (i > 0) { scrollTo(0, i * STEP); introT = 1; }
  else if (scrollY > 2) introT = 1;
  p = want();
  introStart = performance.now() + 250;
  requestAnimationFrame(frame);
}
// the big words are painted from the page's fonts, so wait for them
Promise.all([document.fonts?.ready, document.fonts?.load('400 100px "Instrument Serif"'), document.fonts?.load('italic 400 100px "Instrument Serif"'), document.fonts?.load('500 12px "JetBrains Mono"')].map((x) => Promise.resolve(x).catch(() => {}))).then(start);

window.__unfold = {
  get p() { return p; }, get eye() { return eye; }, get scene() { return Math.round(eye); }, get intro() { return introT; }, get tier() { return tier; }, get gl() { return !!gl; },
  scenes, goTo,
  catchUp() { p = want(); introT = introStart && performance.now() > introStart + 2200 ? 1 : introT; render(); }
};
