// The whole portfolio as one scroll, with every effect from the lab doing one job:
//   hello    the badge (lab/badge) hangs in front of a wall of copy that flows around it (lab/reflow)
//   work     one stage runs each project's live figure; between projects the figure breaks into
//            points and rebuilds as the next one (handover.js, grown out of lab/assemble)
//   path     the job titles turn into each other, keeping the letters they share (lab/morph)
//   craft    the heading leans toward the cursor in a variable font (lab/pressure)
//   contact  the same badge comes back, turned over to its contact side
//   sign     the name as a fluid you can stir (lab/ink)
// Content comes from assets/portfolio/data.js, the same file the live site reads.
import { mountBadge } from '../badge/badge.js';
import { mountReflow } from '../reflow/reflow.js';
import { mountMorph, mountRoller } from '../morph/morph.js';
import { mountPressure } from '../pressure/pressure.js';
import { mountInk } from '../ink/ink.js';
import { mountHandover } from './handover.js';

const D = window.PORTFOLIO, F = window.Figs;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const md = (t) => esc(t).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, w, u) => `<a href="${u}">${w}</a>`);
const get = (path) => path.split('.').reduce((o, k) => o?.[k], D);
const wide = () => innerWidth >= 900;
const PROJ = Object.fromEntries(D.projects.map((p) => [p.id, p]));
const ORDER = ['relay', 'tracewise', 'onboard', 'dispatch', 'atlas', 'intonation', 'layerline'];
const FIG = { relay: F.Relay, tracewise: F.Tracewise, onboard: F.Onboard, dispatch: F.Dispatch, atlas: F.Atlas, intonation: F.Studio, layerline: F.Layerline };

// copy from data.js
for (const el of document.querySelectorAll('[data-html]')) el.innerHTML = get(el.dataset.html);
for (const el of document.querySelectorAll('[data-md]')) el.innerHTML = md(get(el.dataset.md));

// which sections are on screen; everything else stops working until it comes back
const onScreen = new Set();
const io = new IntersectionObserver((es) => { for (const e of es) e.isIntersecting ? onScreen.add(e.target.id) : onScreen.delete(e.target.id); }, { rootMargin: '15% 0px' });
for (const id of ['hello', 'work', 'path', 'craft', 'contact', 'sign']) io.observe(document.getElementById(id));
const live = (id) => onScreen.has(id);

await Promise.all([
  document.fonts.load('400 40px "Instrument Serif"'),
  document.fonts.load('italic 400 40px "Instrument Serif"'),
  document.fonts.load('400 20px Inter'),
  document.fonts.load('500 13px "JetBrains Mono"'),
  document.fonts.load('500 100px "Roboto Flex"')
]).catch(() => {});

/* ------------------------------------------------------------------ the badge */
const hello = $('#hello'), contact = $('#contact');
let frameNo = 0, rectsAt = -1, rects = null;
function boxes() {
  if (rectsAt !== frameNo) { rects = { h: hello.getBoundingClientRect(), c: contact.getBoundingClientRect() }; rectsAt = frameNo; }
  return rects;
}
// it hangs from the top of hello, and from the top of contact once you get there
let phase = 'hello';
const cardH = () => $('#card').offsetHeight;
const strapLen = (W, H, ch) => (phase === 'contact' && !wide() ? 64 : Math.max(90, H * (wide() ? 0.47 : 0.5) - ch * 0.5));
function anchor() {
  const r = boxes(), home = phase === 'contact' ? r.c : r.h;
  if (phase === 'contact') return { x: home.left + home.width * (wide() ? 0.7 : 0.5), y: home.top - 10 };
  // on the first screen it hangs near the right edge, so the copy keeps one readable column
  // beside it and only parts when you drag the card into it
  const half = $('#card').offsetWidth / 2;
  const x = wide() ? home.width - Math.max(28, home.width * 0.035) - half - 34 : home.width * 0.71;
  return { x: home.left + x, y: home.top - 10 };
}
let badgeState = null;
const badge = mountBadge($('#badge-layer'), $('#card'), $('#strap'), {
  anchor, strap: strapLen,
  visible() { const a = anchor(); return a.y < innerHeight + 30 && a.y + strapLen(0, innerHeight, cardH()) + cardH() * 1.3 > -30; },
  onFrame(s) { badgeState = s; }
});
// it arrives hanging still, with a small push: enough to show it moves, not enough to cover the copy
badge.hang(true);
badge.kick(wide() ? 4 : 2.5);
// the barcode encodes the bits of my GitHub handle
{
  const bits = [...'InvokFung'].flatMap((c) => c.charCodeAt(0).toString(2).padStart(8, '0').split(''));
  let stops = [], x = 0;
  for (const b of bits) { const w = b === '1' ? 2.6 : 1.1; stops.push(`#ecebe6 ${x}px ${x + w}px`, `transparent ${x + w}px ${x + w + 1.6}px`); x += w + 1.6; }
  $('#code').style.background = `linear-gradient(90deg, ${stops.join(', ')}) left / ${x}px 100% no-repeat`;
  // links on the back work as links, not as a grab
  $('#card').addEventListener('pointerdown', (e) => { if (e.target.closest('a')) e.stopImmediatePropagation(); }, true);
}
function watchPhase() {
  const r = boxes();
  const want = r.c.top < innerHeight * 1.15 ? 'contact' : 'hello';
  if (want === phase) return;
  // the switch happens while the card is off screen: it is re-hung at its new home, turned the right way
  phase = want;
  badge.flipped = phase === 'contact';
  badge.hang(true);
}

/* ------------------------------------------------------------------ hello: the wall of copy */
const wall = wide() ? [
  "I'm Alan Fung, a Forward Deployed Engineer. I sit next to the people who use the software and build what they need, from the customer's desk to production.",
  'Relay keeps model calls answering through an outage: 99.98%, against 68.6% without it. Tracewise breaks eleven services on purpose and names the culprit first 98.9% of the time. Onboard turns three messy exports into one customer table at 0.977 F1. Dispatch re-plans a bad day around a sick call and keeps 97.0% of visits on time.',
  'StudyLog Atlas searches 5,551 passages of my notes with no server. Intonation Studio hears a violin to the cent. Layerline slices a gear in 21 ms with 66 KB of WebAssembly.',
  'All seven run in your browser, a little further down. Grab the badge first.'
] : [
  // a phone gets the same story, shorter, so the type can stay big enough to read
  "I'm Alan Fung, a Forward Deployed Engineer. I build what the people using the software need, from the customer's desk to production.",
  'Relay keeps model calls answering through an outage. Tracewise names the broken service first 98.9% of the time. Onboard merges three messy exports into one customer table. Dispatch re-plans a bad day and keeps 97.0% of visits on time.',
  'StudyLog Atlas searches my notes with no server. Intonation Studio hears a violin to the cent. Layerline slices a gear in 21 ms.',
  'All seven run below. Grab the badge first.'
];
$('#wall-copy').textContent = wall.join(' ');
const highlight = [
  { re: /\bRelay\b/g, color: PROJ.relay.color, go: 'relay' },
  { re: /\bTracewise\b/g, color: PROJ.tracewise.color, go: 'tracewise' },
  { re: /\bOnboard\b/g, color: PROJ.onboard.color, go: 'onboard' },
  { re: /\bDispatch\b/g, color: PROJ.dispatch.color, go: 'dispatch' },
  { re: /\bStudyLog Atlas\b/g, color: PROJ.atlas.color, go: 'atlas' },
  { re: /\bIntonation Studio\b/g, color: PROJ.intonation.color, go: 'intonation' },
  { re: /\bLayerline\b/g, color: PROJ.layerline.color, go: 'layerline' },
  { re: /\bAlan Fung\b|\bForward Deployed Engineer\b/g, color: '#ecebe6' },
  { re: /\d[\d,.]*(%| KB| ms| F1)?/g, color: '#ecebe6' }
];
const strapW = () => Math.max(18, Math.min(26, innerWidth * 0.02));
mountReflow($('#wall'), {
  paragraphs: wall, highlight, glyphs: [],
  margins: (W, H, narrow) => ({ top: narrow ? 58 : 66, bottom: narrow ? 100 : 64, side: narrow ? 16 : Math.max(28, W * 0.035) }),
  maxSize: (narrow) => (narrow ? 19 : 34),
  minSpan: (narrow) => (narrow ? 6.5 : 6),
  isLive: () => live('hello'),
  // the badge, in the wall's own coordinates: its strap, then the card, as wide as it looks mid-turn
  obstacles(ctx, home) {
    const r = boxes().h, ox = r.left, oy = r.top;
    // while the type size is being chosen, the badge is where it comes to rest: straight down
    const s = home ? rest(r) : badgeState;
    if (!s || phase !== 'hello') return;
    ctx.fillStyle = ctx.strokeStyle = '#fff';
    ctx.lineWidth = strapW() + 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    s.strap.forEach((p, i) => (i ? ctx.lineTo(p.x - ox, p.y - oy) : ctx.moveTo(p.x - ox, p.y - oy)));
    ctx.stroke();
    const k = Math.max(0.08, Math.abs(Math.cos(s.turn * Math.PI / 180)));
    ctx.save();
    ctx.translate(s.cx - ox, s.cy - oy); ctx.rotate(s.ang); ctx.scale(k, 1);
    ctx.beginPath(); ctx.roundRect(-s.w / 2, -s.h / 2, s.w, s.h, 16); ctx.fill();
    ctx.restore();
  }
});
function rest(r) {
  const a = anchor(), card = $('#card'), w = card.offsetWidth, h = card.offsetHeight, L = strapLen(0, innerHeight, h);
  return { cx: a.x, cy: a.y + L + h / 2 - 22, ang: 0, w, h, turn: 0, strap: [a, { x: a.x, y: a.y + L }] };
}
// a project's name in the wall takes you to it
$('#wall').addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]')?.dataset.go;
  if (!go) return;
  const r = document.getElementById(go).getBoundingClientRect();
  // on a phone the stage sits on top, so the project's words land just under it
  const top = wide() ? r.top + r.height / 2 - innerHeight / 2 : r.top - $('.stage-col').offsetHeight - 8;
  scrollTo({ top: scrollY + top, behavior: 'smooth' });
});

/* ------------------------------------------------------------------ work: one stage, seven figures */
const list = $('#projects');
list.innerHTML = ORDER.map((id, i) => {
  const p = PROJ[id], L = D.live[id];
  return `
  <article class="proj" id="${id}" data-i="${i}" style="--c:${p.color}">
    <p class="kind"><i aria-hidden="true"></i>${esc(p.kind)} · ${p.year}</p>
    <h3 class="name"><a href="/explore/#work/${id}">${esc(p.name)}</a></h3>
    <p class="q">${esc(p.question)}</p>
    <p class="tag"><b>${esc(L.tag[0])}</b><span>${esc(L.tag[1])}</span></p>
    <p class="try">${esc(L.line)}</p>
    <p class="links"><a href="${esc(p.links.live)}">Open ${esc(p.name)} ↗</a><a href="/explore/#work/${id}">How it works</a><a href="${esc(p.links.source)}" target="_blank" rel="noopener">Source</a></p>
  </article>`;
}).join('');
const arts = [...list.children];

const stage = $('#stage'), figC = $('#fig');
const fctx = figC.getContext('2d');
const off = document.createElement('canvas'), octx = off.getContext('2d');
const hand = mountHandover($('#dots'), { count: innerWidth < 700 ? 9000 : 16000, bg: [14, 15, 18] });
const BG = '#0e0f12';
const dpr = Math.min(devicePixelRatio || 1, 2);
const nodes = ORDER.map((id) => {
  const n = { id, p: PROJ[id], warm: false };
  n.fig = new FIG[id]({ color: n.p.color, fx: (name, data) => onFx(n, name, data) });
  return n;
});
nodes[ORDER.indexOf('atlas')].fig.external = true; // its query box is an input over the stage

let SW = 0, SH = 0, shown = -1, target = -1;
function sizeStage() {
  const r = figC.getBoundingClientRect();
  const w = Math.round(r.width), h = Math.round(r.height);
  if (w === SW && h === SH) return;
  SW = w; SH = h;
  for (const c of [figC, off]) { c.width = Math.round(SW * dpr); c.height = Math.round(SH * dpr); }
  hand.resize();
  if (shown >= 0) paint(fctx, nodes[shown]);
}
function paint(ctx, n) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BG; ctx.fillRect(0, 0, SW, SH);
  n.fig.size(SW, SH);
  n.fig.draw(ctx);
  ctx.restore();
}
// hand the stage to project i: the figure on screen becomes points, the points become the next one
function select(i) {
  if (i === target) return;
  target = i;
  const n = nodes[i];
  if (!n.warm) { n.fig.size(SW, SH); for (let k = 0; k < 90; k++) n.fig.step(1 / 60); n.warm = true; }
  paint(octx, n);
  hand.go(off, {
    from: shown >= 0 ? figC : null,
    onStart: () => figC.classList.add('gone'),
    onDone: () => { shown = i; paint(fctx, n); figC.classList.remove('gone'); }
  });
  arts.forEach((a, k) => a.classList.toggle('on', k === i));
  controls(n);
}
// the project you are reading: the one nearest the middle of the screen (below the stage on a phone)
function current() {
  let best = 0, bd = Infinity;
  // on a phone: the last project whose words have come up into the upper part of the space under the stage
  const sb = wide() ? 0 : $('.stage-col').getBoundingClientRect().bottom;
  arts.forEach((a, i) => {
    const r = a.getBoundingClientRect();
    if (!wide()) { if (r.top < sb + (innerHeight - sb) * 0.45) best = i; return; }
    const d = Math.abs((r.top + r.bottom) / 2 - innerHeight * 0.5);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

const rg = $('#rg'), rgl = $('#rgl'), rgo = $('#rgo'), query = $('#query'), stats = $('#stats');
function controls(n) {
  const s = n.fig.slider;
  stage.style.setProperty('--c', n.p.color);
  $('#stage-name span').textContent = `${n.p.name} · live`;
  $('#ctl').hidden = !s;
  if (s) {
    rg.min = s.min; rg.max = s.max; rg.step = s.step;
    if (document.activeElement !== rg) rg.value = s.value;
    rgl.textContent = s.label; rgo.textContent = s.fmt(Number(s.value));
  }
  query.hidden = n.id !== 'atlas';
  if (n.id === 'atlas' && document.activeElement !== query) query.value = n.fig.q || '';
}
rg.addEventListener('input', () => {
  const n = nodes[target];
  n.fig.set(Number(rg.value));
  rgo.textContent = n.fig.slider.fmt(Number(rg.value));
});
query.addEventListener('input', () => nodes[ORDER.indexOf('atlas')].fig.query(query.value));
function onFx(n, name, data) {
  if (name === 'open') { if (/^https?:/.test(data)) open(data, '_blank', 'noopener'); else location.href = data; return; }
  if (name === 'slider' && nodes[target] === n) controls(n);
}
const local = (e) => { const r = figC.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
figC.addEventListener('pointermove', (e) => { const n = nodes[shown]; if (n) figC.style.cursor = n.fig.move(...local(e)) || 'default'; });
figC.addEventListener('pointerdown', (e) => { const n = nodes[shown]; if (n && n.fig.down(...local(e))) { n.fig.auto = false; controls(n); } });
figC.addEventListener('pointerleave', () => nodes[shown]?.fig.leave());
let statAt = 0;
function showStats(n, now) {
  if (now - statAt < 300) return;
  statAt = now;
  stats.innerHTML = (n.fig.stats() || []).slice(0, 3).map(([v, l]) => `<div><dd>${esc(v)}</dd><dt>${esc(l)}</dt></div>`).join('');
}

/* ------------------------------------------------------------------ path: titles that keep what they share */
const steps = D.path.filter((s) => Number(s.y) >= 2023);
const morph = mountMorph($('#title'), { titles: steps.map((s) => s.r) });
const year = mountRoller($('#year'), steps[0].y);
const rail = $('#rail'), pathD = $('#path-d'), path = $('#path');
rail.innerHTML = steps.map((s) => `<li>${esc(s.y)}</li>`).join('');
let stepNow = -1;
function setStep(k) {
  if (k === stepNow) return;
  const first = stepNow < 0;
  stepNow = k;
  morph.set(steps[k].r, first);
  $('#title').setAttribute('aria-label', `${steps[k].y}: ${steps[k].r}`);
  year.set(steps[k].y);
  [...rail.children].forEach((li, i) => { li.classList.toggle('on', i === k); li.classList.toggle('done', i < k); });
  pathD.classList.add('out');
  setTimeout(() => { pathD.textContent = steps[k].d; pathD.classList.remove('out'); }, first ? 0 : 260);
}
function scrollPath() {
  const r = path.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
  setStep(Math.min(steps.length - 1, Math.floor(p * steps.length * 0.999)));
}
setStep(0);

/* ------------------------------------------------------------------ craft and sign-off */
mountPressure($('#type'), {
  lines: wide() ? [{ text: 'Hand-built,' }, { text: 'down to the type.', phase: 1.2 }] : [{ text: 'Hand-built,' }, { text: 'down to', phase: 0.8 }, { text: 'the type.', phase: 1.6 }],
  isLive: () => live('craft')
});
mountInk($('#ink'), { name: ['Alan Fung'], isLive: () => live('sign') });

/* ------------------------------------------------------------------ one loop for what the page itself drives */
const brand = $('#brand');
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  frameNo++;
  watchPhase();
  brand.classList.toggle('on', boxes().h.bottom < innerHeight * 0.35 && boxes().c.top > innerHeight * 0.4);
  // the stage wakes when most of it is in view, so the first figure is seen assembling
  const sr = live('work') ? stage.getBoundingClientRect() : null;
  if (sr && sr.bottom > 0 && sr.top < innerHeight && (target >= 0 || sr.top < innerHeight * 0.55)) {
    sizeStage();
    const i = current();
    if (i !== target) select(i);
    const n = nodes[target];
    n.fig.step(dt);
    if (shown === target && !hand.busy) paint(fctx, n);
    showStats(n, now);
    // Atlas types its own questions until you take over; keep the box in step
    if (n.id === 'atlas' && document.activeElement !== query && query.value !== (n.fig.q || '')) query.value = n.fig.q || '';
  }
  if (live('path')) scrollPath();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { SW = SH = 0; });
// for the lab's own checks (scratchpad tour scripts)
window.__flow = { get target() { return ORDER[target]; }, get shown() { return ORDER[shown]; }, get busy() { return hand.busy; }, get phase() { return phase; } };
requestAnimationFrame(frame);
