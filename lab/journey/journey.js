// Round 9: the whole page as one film on one canvas. Every part is a small 3D scene in the same
// paper (the sea of cloud at first light, the mountain as a paper relief, the seven projects, the
// ways I work, the toolbox, the camp at dusk), and every part hands over to the next with its own
// move (comp.js). The words are real text over it, played by one GSAP timeline (story.js); a layer
// of dust drifts over everything (dust.js).
//
// The scroll is the browser's own: nothing is held, snapped or hijacked. τ is how far down the page
// you are, in screens, and every frame is a function of it, so scrolling back plays it all in
// reverse. What is drawn follows the scroll a beat behind, so a flick of the wheel glides.
import * as THREE from 'three';
import { createCompositor, MODE, windowHomography, typeMask } from './comp.js';
import { cloudScene, relayScene, traceScene, onboardScene, dispatchScene, atlasScene, studioScene, layerScene } from './works.js';
import { skyScene } from './sky.js';
import { climbScene, howScene, toolsScene } from './places.js';
import { createDust } from './dust.js';
import { createStory } from './story.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const params = new URLSearchParams(location.search);

/* ------------------------------------------------------------------ the film's running order */
// Each shot is a scene for `len` screens; `into` is the move that brings it in and how many screens
// it takes. `part` is the section it belongs to, for the header and the rail.
const SEQ = [
  { id: 'hello', scene: 'dawn', len: 2.9, part: 0 },
  { id: 'path', scene: 'climb', len: 6.6, into: ['mist', 0.75], part: 1 },
  { id: 'work', scene: 'cloud', len: 1.15, into: ['mist', 0.6], part: 2 },
  { id: 'relay', scene: 'relay', len: 1.7, into: ['window', 1.2], part: 2, ch: 0 },
  { id: 'tracewise', scene: 'trace', len: 1.7, into: ['tear', 0.8], part: 2, ch: 1 },
  { id: 'onboard', scene: 'onboard', len: 1.7, into: ['mosaic', 0.8], part: 2, ch: 2 },
  { id: 'dispatch', scene: 'dispatch', len: 1.7, into: ['contour', 0.8], part: 2, ch: 3 },
  { id: 'atlas', scene: 'atlas', len: 1.7, into: ['type', 0.85], part: 2, ch: 4 },
  { id: 'studio', scene: 'studio', len: 1.7, into: ['dye', 0.8], part: 2, ch: 5 },
  { id: 'layerline', scene: 'layer', len: 1.7, into: ['slats', 0.8], part: 2, ch: 6 },
  { id: 'how', scene: 'how', len: 4.6, into: ['fold', 0.9], part: 3 },
  { id: 'tools', scene: 'tools', len: 2.5, into: ['ring', 0.8], part: 4 },
  { id: 'next', scene: 'climb', len: 1.9, into: ['shards', 0.85], part: 5, next: true },
  { id: 'contact', scene: 'dusk', len: 1.7, into: ['mist', 0.85], part: 6 }
];
const PARTS = ['Hello', 'How I got here', 'Selected work', 'How I work', 'Toolbox', "What's next", 'Contact'];
const ANCHOR = ['hello', 'path', 'work', 'how', 'tools', 'next', 'contact'];
let at = 0;
SEQ.forEach((s, i) => { if (s.into) at += s.into[1]; s.t0 = at; s.t1 = at + s.len; at = s.t1; if (i) s.from = SEQ[i - 1].ch != null ? 'chapter' : SEQ[i - 1].id; });
const TOTAL = at;
const T = Object.fromEntries(SEQ.map((s) => [s.id, s]));
// a section starts where the move into its first shot starts
const partAt = (k) => { const s = SEQ.find((x) => x.part === k); return s.t0 - (s.into ? s.into[1] : 0); };
// where a section is best seen: a little way into it
const partView = (k) => { const s = SEQ.find((x) => x.part === k); return k === 0 ? 0 : s.t0 + Math.min(0.35, s.len * 0.2); };

/* ------------------------------------------------------------------ how much it may cost */
// It starts from what the device says about itself, steps down when frames run slow while the page
// moves, and ?q=high|mid|low|least pins it. high: up to 1.5 device pixels per CSS pixel, soft
// shadows, 4× MSAA; mid: 1×, shadows; low: 0.85×, no shadows; least: 0.6×, no dust. The size of the
// frame never changes while you scroll (resizing it costs a hitch of its own on a phone).
const dpr = devicePixelRatio || 1;
const TIERS = {
  high: { res: Math.min(dpr, 1.5), shadows: 1024, samples: 4, dust: 2400 },
  mid: { res: 1, shadows: 1024, samples: 0, dust: 1500 },
  low: { res: 0.85, shadows: 0, samples: 0, dust: 800 },
  least: { res: 0.6, shadows: 0, samples: 0, dust: 0 }
};
const ORDER = ['high', 'mid', 'low', 'least'];
const pinned = TIERS[params.get('q')] ? params.get('q') : null;
const coarsePointer = matchMedia('(pointer: coarse)').matches;
let tier = pinned || ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 || coarsePointer ? 'mid' : 'high');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('rm');

const canvas = $('#gl');
let renderer = null;
if (!params.has('nogl')) {
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }); }
  catch (e) { renderer = null; }
}
const gl = !!renderer;
if (gl) {
  const ctx = renderer.getContext(), ext = ctx.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  if (/swiftshader|llvmpipe|software/i.test(name) && !pinned) tier = 'least';
  renderer.shadowMap.enabled = TIERS[tier].shadows > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
} else {
  canvas?.remove();
  document.documentElement.classList.add('nogl');
}
if (reduced) document.documentElement.classList.add('still');

/* ------------------------------------------------------------------ the scenes, built when wanted */
const BUILD = {
  dawn: () => skyScene('dawn', { tier }),
  dusk: () => skyScene('dusk', { tier }),
  climb: () => climbScene({ shadows: TIERS[tier].shadows }),
  how: () => howScene({ shadows: TIERS[tier].shadows }),
  tools: () => toolsScene(),
  cloud: () => { const c = cloudScene(); return { ...c, ink: new THREE.Color('#e9e3da'), update: (q, t) => c.update(tau * 0.32 + t * 0.01, t) }; },
  relay: () => relayScene({ shadows: TIERS[tier].shadows }),
  trace: () => traceScene({ shadows: TIERS[tier].shadows }),
  onboard: () => onboardScene({ shadows: TIERS[tier].shadows }),
  dispatch: () => dispatchScene({ shadows: TIERS[tier].shadows }),
  atlas: () => atlasScene({ shadows: TIERS[tier].shadows }),
  studio: () => studioScene({ shadows: TIERS[tier].shadows }),
  layer: () => layerScene({ shadows: TIERS[tier].shadows })
};
const scenes = {};
let W = innerWidth, H = innerHeight, narrow = W <= 760, res = 1;
function want(key) {
  if (!gl) return null;
  let sc = scenes[key];
  if (!sc) sc = make(key);
  if (!sc.warmed) warm(sc);
  return sc;
}
function make(key) {
  const a = performance.now(), sc = scenes[key] = BUILD[key]();
  sc.key = key;
  sc.size(W, H, narrow, res);
  sc.update(0, 0, 0, {});
  builds[key] = [Math.round(performance.now() - a)];
  return sc;
}
// Draw a new scene once, small and out of sight, so its first real frame has nothing left to do:
// shaders compiled as they'll be used (into a render target, not the screen, which changes them),
// the shadow pass's too, and textures up on the GPU. Ahead of time, the shaders compile in the
// background where the browser can (compileAsync), so the next scene never holds up the scroll.
let warmRT = null;
const builds = {};
function warmTarget() {
  if (!warmRT) { warmRT = new THREE.WebGLRenderTarget(8, 8, { depthBuffer: true }); warmRT.texture.colorSpace = THREE.SRGBColorSpace; }
  return warmRT;
}
function warm(sc) {
  const a = performance.now(), prev = renderer.getRenderTarget(), hidden = [];
  // (everything, even what only shows up later in the scene)
  sc.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  renderer.setRenderTarget(warmTarget());
  renderer.compile(sc.scene, sc.camera);
  renderer.render(sc.scene, sc.camera);
  renderer.setRenderTarget(prev);
  hidden.forEach((o) => (o.visible = false));
  sc.warmed = true;
  builds[sc.key]?.push(Math.round(performance.now() - a));
}
function compileLater(sc) {
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(warmTarget());
  const done = renderer.extensions.has('KHR_parallel_shader_compile') ? renderer.compileAsync(sc.scene, sc.camera) : Promise.resolve(renderer.compile(sc.scene, sc.camera));
  renderer.setRenderTarget(prev);
  return done;
}
// build the rest while the page is idle, in the order they come
if (gl) {
  const order = [...new Set(SEQ.map((s) => s.scene))];
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));
  let k = 0;
  const next = () => {
    if (k >= order.length) { typeMaskNow(); return; }
    const key = order[k++];
    if (scenes[key]) { idle(next); return; }
    const sc = make(key);
    compileLater(sc).then(() => calm(() => { if (!sc.warmed) warm(sc); idle(next); }), () => idle(next));
  };
  // (the first draw can take a moment on a phone: wait for the scroll to rest, though not forever)
  const calm = (fn, waited = 0) => (performance.now() - lastMove < 400 && waited < 3000 ? setTimeout(() => calm(fn, waited + 250), 250) : idle(fn));
  idle(next);
}
let comp = null, rtA = null, rtB = null;
const H3 = new THREE.Matrix3();
let typeM = null;
const typeMaskNow = () => (typeM = typeM || typeMask('Atlas', '400 420px "Instrument Serif"'));
const makeRT = () => { const rt = new THREE.WebGLRenderTarget(1, 1, { samples: reduced ? 0 : TIERS[tier].samples, depthBuffer: true }); rt.texture.colorSpace = THREE.SRGBColorSpace; return rt; };
if (gl) { comp = createCompositor(renderer); rtA = makeRT(); rtB = makeRT(); }
const dust = gl && TIERS[tier].dust ? createDust(renderer, { count: TIERS[tier].dust, reduced }) : null;

/* ------------------------------------------------------------------ the words */
const story = createStory({ root: $('#story'), T, SEQ, TOTAL, reduced });

/* ------------------------------------------------------------------ scroll */
const spacer = $('#scroll');
let tau = 0, target = 0, vel = 0, lastNow = 0, clock = 0, introT = reduced ? 1 : 0, introStart = 0;
const INTRO = 2600; // first light, in ms
const maxY = () => TOTAL * H;
const readTarget = () => clamp(scrollY / H, 0, TOTAL);
function layout() {
  W = innerWidth; H = innerHeight; narrow = W <= 760;
  spacer.style.height = Math.round(TOTAL * H + H) + 'px';
  sizeGL();
  story.size(W, H, narrow);
  railLayout();
}
function sizeGL() {
  if (!gl) return;
  const t = TIERS[tier];
  res = t.res;
  renderer.setPixelRatio(res);
  renderer.setSize(W, H, false);
  const bw = Math.max(1, Math.round(W * res)), bh = Math.max(1, Math.round(H * res));
  rtA.setSize(bw, bh); rtB.setSize(bw, bh);
  comp.u.uRes.value.set(W, H);
  for (const k in scenes) scenes[k].size(W, H, narrow, res);
  dust?.size(W, H, res);
}
// go to τ: smoothly for a link or the rail, at once for focus
// (a long way is a cut, under a quick veil of paper, not a fast-forward through everything between)
const veil = $('#veil');
let veiling = 0;
function go(t, instant) {
  t = clamp(t, 0, TOTAL);
  if (!instant && !reduced && veil && Math.abs(t - tau) > 4) {
    clearTimeout(veiling);
    veil.classList.add('on');
    veiling = setTimeout(() => { go(t, true); requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.remove('on'))); }, 260);
    return;
  }
  scrollTo({ top: t * H, behavior: instant || reduced ? 'instant' : 'smooth' });
  if (instant) { target = tau = readTarget(); }
}
addEventListener('scroll', () => { target = readTarget(); }, { passive: true });
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const k = ANCHOR.indexOf(a.getAttribute('href').slice(1));
  if (k >= 0) { e.preventDefault(); go(partView(k)); history.replaceState(null, '', '#' + ANCHOR[k]); }
});
// a link that takes focus brings its part of the film on screen
document.addEventListener('focusin', (e) => {
  const t = story.at(e.target);
  if (t != null && Math.abs(t - tau) > 0.5) go(t, true);
});

/* ------------------------------------------------------------------ pointer: lean, drag, hover */
const ptr = { x: 0, y: 0, tx: 0, ty: 0, px: -1, py: -1, moved: false, mouse: !coarsePointer };
const drag = { on: false, id: -1, x: 0, y: 0, ox: 0, oy: 0, vx: 0, vy: 0 };
const hit = $('#hit');
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { ptr.tx = e.clientX / W * 2 - 1; ptr.ty = e.clientY / H * 2 - 1; ptr.mouse = true; }
  ptr.px = e.clientX; ptr.py = e.clientY; ptr.moved = true;
  if (drag.on && e.pointerId === drag.id) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    const s = shotAt(tau);
    if (s.scene === 'tools') scenes.tools?.spinBy(dx * 0.0035, dy * 0.0025);
    else { drag.ox = clamp(drag.ox - dx * 0.004, -0.9, 0.9); drag.oy = clamp(drag.oy - dy * 0.003, -0.35, 0.3); }
  }
}, { passive: true });
// drags turn the scene (orbit) or spin the toolbox; on touch, sideways only, so the page still scrolls
hit.addEventListener('pointerdown', (e) => {
  if (!dragHere()) return;
  drag.on = true; drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY;
  hit.setPointerCapture(e.pointerId);
  document.documentElement.classList.add('dragging');
});
const release = () => { drag.on = false; document.documentElement.classList.remove('dragging'); };
hit.addEventListener('pointerup', release); hit.addEventListener('pointercancel', release);
function dragHere() { if (!gl) return false; const s = shotAt(tau); return s.t0 <= tau && tau <= s.t1 && ['climb', 'how', 'tools'].includes(s.scene); }
// the toolbox: the tag under the pointer lights up and says where I used it
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let hovered = -1;
function hoverTools(sc) {
  if (!ptr.mouse || ptr.px < 0) return;
  ndc.set(ptr.px / W * 2 - 1, -(ptr.py / H) * 2 + 1);
  ray.setFromCamera(ndc, sc.camera);
  const h = ray.intersectObject(sc.tags, false)[0];
  const i = h ? h.instanceId : -1;
  if (i !== hovered) { hovered = i; sc.hover(i); story.tool(i >= 0 ? sc.all[i] : null); }
  if (i >= 0) story.toolAt(ptr.px, ptr.py);
}

/* ------------------------------------------------------------------ cursor and magnets */
const cur = $('#cursor');
const cursor = { x: W / 2, y: H / 2, s: 0, mode: '' };
let magnets = $$('[data-magnet]');
function cursorFrame(dt) {
  if (!cur || !ptr.mouse || ptr.px < 0) return;
  const k = 1 - Math.exp(-dt * 18);
  cursor.x += (ptr.px - cursor.x) * k; cursor.y += (ptr.py - cursor.y) * k;
  const over = document.elementFromPoint(ptr.px, ptr.py);
  const link = over?.closest?.('a, button, [data-magnet]');
  const mode = link ? 'link' : dragHere() ? 'drag' : '';
  if (mode !== cursor.mode) { cursor.mode = mode; cur.dataset.mode = mode; }
  cur.style.transform = `translate3d(${cursor.x.toFixed(1)}px,${cursor.y.toFixed(1)}px,0)`;
  // magnets: a button leans toward the pointer when it comes near
  for (const m of magnets) {
    const r = m.getBoundingClientRect();
    if (!r.width) continue;
    const cx = r.left + r.width / 2 - (m._mx || 0), cy = r.top + r.height / 2 - (m._my || 0);
    const dx = ptr.px - cx, dy = ptr.py - cy, d = Math.hypot(dx, dy), reach = Math.max(r.width, r.height) * 0.9 + 40;
    const pull = d < reach ? (1 - d / reach) * 0.35 : 0;
    const tx = dx * pull, ty = dy * pull;
    m._mx = lerp(m._mx || 0, tx, k * 0.6); m._my = lerp(m._my || 0, ty, k * 0.6);
    if (Math.abs(m._mx) > 0.05 || Math.abs(m._my) > 0.05 || m._was) { m.style.translate = `${m._mx.toFixed(2)}px ${m._my.toFixed(2)}px`; m._was = Math.abs(m._mx) > 0.05 || Math.abs(m._my) > 0.05; }
  }
}

/* ------------------------------------------------------------------ the rail: where you are */
// A thin line down the right edge with a mark for each part. Dragging along it scrolls the page,
// as a scroll bar's thumb would; a mark takes you to its part.
const rail = $('#rail'), knob = rail ? $('.knob', rail) : null;
let railH = 0, railTop = 0;
function railLayout() {
  if (!rail) return;
  const r = rail.getBoundingClientRect(); railH = r.height; railTop = r.top;
  $$('.tick', rail).forEach((el, k) => { el.style.top = (partAt(k) / TOTAL * 100).toFixed(3) + '%'; });
}
if (rail) {
  rail.innerHTML += PARTS.map((p, k) => `<a class="tick" href="#${ANCHOR[k]}" aria-label="${p}"><span>${p}</span></a>`).join('');
  const to = (e) => { const q = clamp((e.clientY - railTop) / railH); go(q * TOTAL, true); };
  rail.addEventListener('pointerdown', (e) => { if (e.target.closest('.tick')) return; rail.setPointerCapture(e.pointerId); rail.classList.add('held'); to(e); });
  rail.addEventListener('pointermove', (e) => { if (rail.hasPointerCapture(e.pointerId)) to(e); });
  const up = () => rail.classList.remove('held');
  rail.addEventListener('pointerup', up); rail.addEventListener('pointercancel', up);
}
const where = $('#where');
let shownPart = -1, shownCh = -1;
function header(s) {
  const k = s.part, ch = s.ch ?? -1;
  if (k === shownPart && ch === shownCh) return;
  shownPart = k; shownCh = ch;
  const name = ch >= 0 ? `${PARTS[k]} · ${story.chapterName(ch)}` : PARTS[k];
  story.label(where, name, String(k + 1).padStart(2, '0'));
  document.documentElement.dataset.part = ANCHOR[k];
  document.documentElement.dataset.tone = ch >= 0 || s.id === 'tools' || s.id === 'contact' ? 'dark' : 'light';
  $$('.tick', rail).forEach((el, i) => el.classList.toggle('on', i === k));
}

/* ------------------------------------------------------------------ the frame */
function shotAt(t) {
  for (let i = 0; i < SEQ.length; i++) { const s = SEQ[i]; if (t < s.t1 || i === SEQ.length - 1) return s; }
  return SEQ[SEQ.length - 1];
}
const INK = { dawn: '#f3e6dc', dusk: '#e8c9b8' };
let slow = 0, lastMove = 0, frames = 0, drawn = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - (lastNow || now)) / 1000); lastNow = now;
  frames++;
  const t0 = tau;
  if (reduced || Math.abs(target - tau) < 0.0004) tau = target;
  else tau += (target - tau) * (1 - Math.exp(-dt * 7.5));
  vel = dt > 0 ? lerp(vel, (tau - t0) / dt, 0.2) : vel;
  const moving = tau !== t0 || drag.on;
  if (moving) lastMove = now;
  if (introStart && introT < 1) introT = clamp((now - introStart) / INTRO);
  if (!reduced) { ptr.x += (ptr.tx - ptr.x) * (1 - Math.exp(-dt * 4)); ptr.y += (ptr.ty - ptr.y) * (1 - Math.exp(-dt * 4)); }
  // a drag lets go slowly: the scene eases back to where the scroll has it
  if (!drag.on) { drag.ox *= Math.exp(-dt * 2.2); drag.oy *= Math.exp(-dt * 2.2); }
  clock += reduced ? 0 : dt;

  // the words
  story.seek(tau, vel, introT);
  const s = shotAt(tau);
  header(s);
  if (rail && knob) knob.style.transform = `translateY(${(tau / TOTAL * railH).toFixed(1)}px)`;
  cursorFrame(dt);
  if (!gl) { document.body.style.setProperty('--bg', story.bg(s.id)); return; }

  // slow frames while moving: step down a tier (not when one is pinned)
  if (moving && !pinned) {
    slow = dt > 0.05 ? slow + 4 : dt > 0.026 ? slow + 1 : Math.max(0, slow - 2);
    if (slow > 30 && tier !== 'least') { tier = ORDER[ORDER.indexOf(tier) + 1]; slow = 0; setTier(); }
  }
  // standing still on a slower tier, half the frames are enough
  if (!moving && tier !== 'high' && frames % 2 && introT >= 1) return;
  renderer?.info.reset();
  render(s, dt);
  drawn++;
}

// what is on screen at τ, and how one hands over to the next
function update(sh, q, dt) {
  const sc = want(sh.scene);
  const sway = reduced ? [0, 0] : [ptr.x, ptr.y];
  const orbit = { x: drag.ox + sway[0] * 0.06, y: drag.oy + sway[1] * 0.03 };
  if (sh.scene === 'dawn') sc.update(q, clock, dt, { light: easeOut(introT), sway });
  else if (sh.scene === 'dusk') sc.update(q, clock, dt, { light: 1, sway });
  else if (sh.scene === 'climb') sc.update(sh.next ? 1 : q, clock, dt, { orbit, next: sh.next ? clamp(q, 0, 1.2) : undefined });
  else if (sh.scene === 'how') sc.update(q, clock, dt, { orbit });
  else if (sh.scene === 'tools') sc.update(q, clock, dt, {});
  else {
    sc.update(q, clock, dt);
    // the dioramas lean a little toward the pointer
    if (!reduced && sc.camera.isPerspectiveCamera) { sc.camera.rotateY(-ptr.x * 0.022); sc.camera.rotateX(-ptr.y * 0.014); }
  }
  return sc;
}
function render(s, dt) {
  let A, B = null, mode = MODE.fade, p = 0, mv = null;
  const i = SEQ.indexOf(s);
  if (tau >= s.t0 || i === 0) A = update(s, (tau - s.t0) / s.len, dt);
  else {
    // in the move into s: the last shot runs on a little, the next starts a little early
    const pr = SEQ[i - 1], len = s.into[1];
    p = clamp((tau - (s.t0 - len)) / len);
    A = update(pr, (tau - pr.t0) / pr.len, dt);
    B = update(s, (tau - s.t0) / s.len, dt);
    mv = s.into[0]; mode = reduced ? MODE.fade : MODE[mv];
  }
  if (s.scene === 'tools' && tau >= s.t0 && !drag.on) hoverTools(scenes.tools);
  else if (hovered >= 0) { hovered = -1; scenes.tools?.hover(-1); story.tool(null); }
  renderer.setRenderTarget(rtA); renderer.render(A.scene, A.camera);
  if (B) { renderer.setRenderTarget(rtB); renderer.render(B.scene, B.camera); }
  const u = comp.u;
  u.tA.value = rtA.texture; u.tB.value = (B ? rtB : rtA).texture;
  u.uMode.value = B ? mode : 0; u.uP.value = B ? p : 0;
  u.uTime.value = clock; u.uVel.value = reduced ? 0 : vel;
  u.uInk.value.copy(B?.ink || A.ink || u.uPaper.value);
  if (mode === MODE.window) windowAt(p);
  if (mode === MODE.type) typeAt();
  if (mode === MODE.slats) u.uSlats.value = narrow ? 4 : 7;
  if (mode === MODE.ring) { u.uCorner.value.set(0.5, 0.5); u.uInk.value.set('#ffb547'); }
  if (mode === MODE.mist) {
    // the cloud between two places: warm at dawn, grey in the cloud, rose at dusk
    const to = s.id;
    u.uCorner.value.set(to === 'contact' ? 0.5 : 0.5, to === 'work' ? 0.85 : to === 'contact' ? 0.35 : 0.55);
    u.uMist.value.set(to === 'path' ? '#f4e9e1' : to === 'work' ? '#a9b0b9' : '#c7a7a4');
  }
  comp.draw();
  // the dust, over everything
  if (dust) {
    renderer.autoClear = false;
    dust.frame({ tau, t: clock, dt, vel, ptr, intro: introT, shot: s, move: mv, p, W, H, sun: scenes.dawn?.sunPx });
    renderer.autoClear = true;
  }
}
// the window: tilted and small in the cloud, it turns to face you, then grows past the screen
function windowAt(p) {
  const asp = narrow ? 0.95 : 1.4;
  const appear = easeOut(smooth(0, 0.2, p)), face = easeInOut(smooth(0.1, 0.62, p)), grow = easeInOut(smooth(0.45, 1, p));
  const w0 = (narrow ? 0.7 : 0.36) * W * (0.6 + 0.4 * appear);
  const wEnd = Math.max(W * 1.7, H * 2.8 * asp * 0.6), hEnd = H * 2.8;
  const w = lerp(w0, wEnd, grow), h = lerp(w0 / asp, hEnd, grow);
  const o = { w, h, rx: 16 * (1 - face), ry: -30 * (1 - face), rz: -7 * (1 - face), x: 0, y: lerp(H * 0.03, -H * 0.42, grow), z: 240 * (1 - face), fl: 800 };
  windowHomography(o, W, H, H3);
  const u = comp.u;
  u.uHinv.value.copy(H3);
  u.uWin.value.set(0.06, 1 - grow * 0.6, w / h, (1 - smooth(0.85, 1, p)) * appear);
  if (appear < 0.02) u.uP.value = 0;
}
function typeAt() {
  const m = typeMaskNow(), u = comp.u, asp = W / H;
  const width = narrow ? asp * 0.86 : Math.min(asp * 0.72, 1.5);
  u.tType.value = m.tex;
  const zEnd = 0.85 * Math.sqrt(asp * asp + 1) / (width * Math.max(0.004, m.depth));
  u.uType.value.set(m.centre[0], 1 - m.centre[1], zEnd, m.aspect);
  u.uType2.value.set(width, 0, 0.5, 0);
}
function setTier() {
  const t = TIERS[tier];
  if (!t.shadows && renderer.shadowMap.enabled) {
    renderer.shadowMap.enabled = false;
    for (const k in scenes) scenes[k].scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
  }
  if (!t.dust) dust?.off();
  sizeGL();
}

// the email, copied
const copy = $('.copy');
copy?.addEventListener('click', () => {
  const mail = $('.mail a')?.textContent.trim();
  const done = () => { copy.textContent = 'Copied'; copy.classList.add('done'); setTimeout(() => { copy.textContent = 'Copy'; copy.classList.remove('done'); }, 1600); };
  if (navigator.clipboard && mail) navigator.clipboard.writeText(mail).then(done, () => {}); 
});

// A small meter in the corner, to see how a real phone copes (frames a second, frames drawn, the
// worst frame in the last half second, the tier it settled on). ?fps shows it from the start; F,
// or a tap on the last line of the page, turns it on and off.
let meterEl = null, meterIv = 0;
function meter() {
  if (meterEl) { meterEl.remove(); meterEl = null; clearInterval(meterIv); return; }
  const m = meterEl = document.createElement('p');
  m.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;margin:0;padding:4px 7px;border-radius:6px;background:rgba(0,0,0,.6);color:#fff;font:11px/1.3 ui-monospace,monospace;pointer-events:none';
  document.body.appendChild(m);
  let n = 0, worst = 0, last = performance.now(), d0 = drawn;
  const tick = (now) => { if (meterEl !== m) return; requestAnimationFrame(tick); n++; worst = Math.max(worst, now - last); last = now; };
  requestAnimationFrame(tick);
  meterIv = setInterval(() => { m.textContent = `${n * 2} fps · drawn ${(drawn - d0) * 2} · worst ${worst.toFixed(0)} ms · ${gl ? tier : 'no WebGL'}`; n = 0; worst = 0; d0 = drawn; }, 500);
}
if (params.has('fps')) meter();
addEventListener('keydown', (e) => { if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) meter(); });
addEventListener('pointerup', (e) => {
  const c = $('.colophon'), r = c?.getBoundingClientRect();
  if (r && r.height && shotAt(tau).id === 'contact' && e.clientY >= r.top - 10 && e.clientY <= r.bottom + 10) meter();
});

/* ------------------------------------------------------------------ start */
let rz = 0, lastW = W, lastH = H;
addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    // a phone's address bar coming and going changes the height a little: leave the page alone then
    if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 120) return;
    lastW = innerWidth; lastH = innerHeight;
    const k = tau;
    layout();
    magnets = $$('[data-magnet]');
    go(k, true);
  }, 150);
});
function start() {
  layout();
  story.build();
  const h = location.hash.slice(1), k = ANCHOR.indexOf(h), jump = params.get('t');
  if (jump != null) { go(+jump, true); introT = 1; }
  else if (k > 0) { go(partView(k), true); introT = 1; }
  else if (scrollY > 2) introT = 1;
  target = tau = readTarget();
  introStart = performance.now() + 200;
  requestAnimationFrame(frame);
  document.documentElement.classList.add('ready');
}
// the words in the scenes are drawn from the page's fonts, so wait for them
Promise.all([document.fonts?.ready, document.fonts?.load('400 100px "Instrument Serif"'), document.fonts?.load('italic 400 100px "Instrument Serif"'), document.fonts?.load('500 12px "JetBrains Mono"')].map((x) => Promise.resolve(x).catch(() => {}))).then(start);

window.__journey = {
  get tau() { return tau; }, get tier() { return tier; }, builds, scenes, info: () => renderer && { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }, get gl() { return gl; }, get intro() { return introT; }, get frames() { return drawn; },
  SEQ, T, TOTAL, PARTS, partAt, partView,
  // jump straight to τ and draw it (for checks)
  set(t) { go(t, true); target = tau = clamp(t, 0, TOTAL); introT = 1; },
  orbit(x, y) { drag.ox = x; drag.oy = y; },
  pointer(x, y) { ptr.px = x; ptr.py = y; ptr.tx = x / W * 2 - 1; ptr.ty = y / H * 2 - 1; ptr.mouse = true; }
};
