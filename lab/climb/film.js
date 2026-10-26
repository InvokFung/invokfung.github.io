// The film inside the cloud. The homepage's flight from the climb to the camp holds, deep in the
// cloud, for LENGTH screens of scroll; this plays in that time, over the landscape, and hands the
// cloud back to it at the end. Scroll is its only clock: f is how far in, in screens.
//
//   0     cloud      what I do, one line at a time; the cloud rushes past
//   2.75  window     a window shaped like the mountain opens in the cloud, onto the first project
//   4     chapters   seven, 2.6 screens each: a diorama of what the project does, its story told by
//                    the scroll, and a different hand-over into each (film-gl.js)
//   21.35 ring       a ring of ink grows out of the last one, back into the cloud
//   23    the end    the cloud clears into the camp, and the homepage takes over again
import * as THREE from 'three';
import { createCompositor, MODE, windowHomography, typeMask } from './film-gl.js';
import { cloudScene, relayScene, traceScene, onboardScene, dispatchScene, atlasScene, studioScene, layerScene } from './film-scenes.js';

const gsap = window.gsap;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

const WIN = [2.75, 4.0], CH0 = 4.0, CH = 2.6, TR = 0.85, N = 7;
const S = (i) => CH0 + i * CH;            // where chapter i's story starts
const STORY = CH - TR;                     // and how long it runs
const OUT = [S(N - 1) + STORY, S(N - 1) + STORY + 0.85];
export const LENGTH = OUT[1] + 0.8;
// the hand-over into each chapter (the first comes through the window)
const INTO = [MODE.window, MODE.tear, MODE.mosaic, MODE.contour, MODE.type, MODE.dye, MODE.slats];
const BUILD = [relayScene, traceScene, onboardScene, dispatchScene, atlasScene, studioScene, layerScene];

export function createFilm({ canvas, root, reduced, tier, webgl = true }) {
  let renderer = null;
  if (canvas && webgl && !/[?&]nogl\b/.test(location.search)) {
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }); }
    catch (e) { renderer = null; }
  }
  const gl = !!renderer;
  if (!gl && canvas) canvas.remove();
  let W = 1, H = 1, res = 1, narrow = false, shadows = 0, samples = 0;
  const T = { high: [1024, 4], mid: [1024, 0], low: [0, 0], least: [0, 0] };
  const conf = (t) => { [shadows, samples] = T[t] || T.mid; if (reduced) samples = 0; };
  conf(tier);
  let comp = null, rtA = null, rtB = null, cloud = null;
  const scenes = new Array(N).fill(null);
  if (gl) {
    renderer.shadowMap.enabled = shadows > 0;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    comp = createCompositor(renderer);
    cloud = cloudScene();
  }
  const opts = () => ({ shadows: shadows || 0 });
  // a scene is built the first time it's wanted, or before, when the page is idle
  const want = (i) => {
    if (!gl) return null;
    if (!scenes[i]) {
      scenes[i] = BUILD[i](opts());
      scenes[i].size(W, H, narrow);
      scenes[i].update(0, 0, 0);
      renderer.compile(scenes[i].scene, scenes[i].camera);
    }
    return scenes[i];
  };
  let typeM = null;
  const typeMaskNow = () => (typeM = typeM || typeMask('Atlas', '400 420px "Instrument Serif"'));
  if (gl) {
    const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 300));
    let k = 0;
    const next = () => { if (k < N) { want(k++); idle(next); } else typeMaskNow(); };
    idle(next);
  }
  function makeRT() {
    const rt = new THREE.WebGLRenderTarget(1, 1, { samples, depthBuffer: true });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    return rt;
  }

  /* ------------------------------------------------------------------ the words */
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const chapters = $$('.f-ch');
  let tl = null, splits = [];
  // a number that rolls up on its digits, like a counter
  function odometer(el) {
    if (el.dataset.od) return $$('.od-col', el);
    const txt = el.textContent;
    el.dataset.od = txt;
    el.setAttribute('aria-label', txt);
    el.innerHTML = [...txt].map((ch) => /\d/.test(ch)
      ? `<span class="od" aria-hidden="true"><span class="od-col" data-d="${ch}">${'0123456789'.repeat(2).split('').map((d) => `<span>${d}</span>`).join('')}</span></span>`
      : `<span aria-hidden="true">${ch}</span>`).join('');
    return $$('.od-col', el);
  }
  function roll(t, el, at, dur = 0.6) {
    odometer(el).forEach((c, k, all) => {
      const d = +c.dataset.d;
      t.fromTo(c, { yPercent: 0 }, { yPercent: -((10 + d) / 20) * 100, duration: dur, ease: 'power3.out' }, at + (all.length - 1 - k) * 0.05);
    });
  }
  function count(t, el, at, from, to, digits, suffix, dur = 0.6, ease = 'power2.out') {
    const o = { v: from }, fmt = (v) => v.toFixed(digits) + suffix;
    t.fromTo(o, { v: from }, { v: to, duration: dur, ease, onUpdate: () => { el.textContent = fmt(o.v); } }, at);
  }
  const ZIN = { opacity: 0, rotateX: 40, rotateY: -20, rotateZ: -10, z: -100, yPercent: 30 };
  const ZOUT = { opacity: 0, rotateX: -20, rotateY: 60, z: 100 };
  const REST = { opacity: 1, rotateX: 0, rotateY: 0, rotateZ: 0, z: 0, yPercent: 0, xPercent: 0, x: 0, y: 0 };
  // Zentry's perspective fade, for lines of copy: up from below, tipped back
  const lineIn = (t, els, at, stagger = 0.08) => t.fromTo(els, { yPercent: 110, rotateX: -40, opacity: 0 }, { yPercent: 0, rotateX: 0, opacity: 1, duration: 0.45, ease: 'power4.out', stagger }, at);
  const leave = (t, els, at) => t.fromTo(els, { ...REST }, { ...ZOUT, duration: 0.4, ease: 'power2.in', stagger: 0.035, immediateRender: false }, at);

  function build() {
    if (!gsap) return;
    if (tl) { tl.kill(); splits.forEach((s) => s.revert()); splits = []; }
    tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
    const SplitText = window.SplitText;
    const split = (el, type) => { if (!SplitText) return null; const s = new SplitText(el, { type, mask: type === 'lines' ? 'lines' : undefined, linesClass: 'ln', charsClass: 'ch', wordsClass: 'wd' }); splits.push(s); return s; };

    /* what I do, in the cloud */
    const say = $('.f-say');
    tl.fromTo(say, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: 'none' }, 0.05);
    const rows = $$('.f-row', say);
    rows.forEach((r, k) => tl.fromTo(r, { xPercent: k ? -40 : 0, opacity: 0 }, { xPercent: k ? 0 : -40, opacity: 1, duration: 3.2, ease: 'none' }, 0));
    rows.forEach((r) => tl.to(r, { opacity: 0, duration: 0.3, ease: 'none' }, 2.7));
    const lines = $$('.f-ln', say);
    lines.forEach((l, k) => lineIn(tl, l, 0.3 + k * 0.42, 0));
    const counts = $$('.f-counts li', say);
    tl.fromTo(counts, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.08 }, 1.55);
    counts.forEach((li, k) => roll(tl, $('b', li), 1.6 + k * 0.1, 0.7));
    leave(tl, [...lines, ...counts], 2.45);
    tl.set(say, { autoAlpha: 0 }, 3.0);
    const win = $('.f-win');
    tl.fromTo(win, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.3 }, 2.9);
    tl.to(win, { autoAlpha: 0, y: -16, duration: 0.3, ease: 'power2.in' }, 3.65);

    /* the chapters */
    const shade = $('.f-shade');
    tl.fromTo(shade, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: 'none' }, S(0) - 0.6);
    tl.to(shade, { autoAlpha: 0, duration: 0.4, ease: 'none' }, OUT[0] + 0.2);
    chapters.forEach((ch, i) => {
      const s = S(i), out = i < N - 1 ? S(i + 1) - TR : OUT[0];
      const k = $('.f-k', ch), name = $('.f-n', ch), head = $('.f-h', ch), fits = $$('.f-fits li', ch), proof = $('.f-proof', ch), num = $('.f-proof b', ch), open = $('.f-open', ch), note = $('.f-note', ch);
      tl.fromTo(ch, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01, ease: 'none' }, s - 0.5);
      tl.fromTo(k, { opacity: 0 }, { opacity: 1, duration: 0.1, ease: 'none' }, s - 0.45);
      if (window.ScrambleTextPlugin) tl.fromTo($('span', k), { scrambleText: { text: ' ' } }, { scrambleText: { text: $('span', k).dataset.t || $('span', k).textContent, chars: 'lowerCase', speed: 0.6 }, duration: 0.4, ease: 'none' }, s - 0.45);
      nameIn(tl, ch, name, i, s - 0.4, split);
      const hl = split(head, 'lines');
      lineIn(tl, hl ? hl.lines : head, s - 0.05);
      tl.fromTo(fits, { opacity: 0, scale: 0.7, y: 12 }, { opacity: 1, scale: 1, y: 0, duration: 0.3, stagger: 0.06, ease: 'back.out(2)' }, s + 0.3);
      tl.fromTo(proof, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 }, s + 0.55);
      proofIn(tl, num, i, s + 0.58);
      if (open) tl.fromTo(open, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3 }, s + 0.85);
      if (note) {
        const at = s + (+note.dataset.q || 0.35) * STORY;
        tl.fromTo(note, { opacity: 0, y: 10, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: 'back.out(2)' }, at);
        if (note.dataset.type && window.ScrambleTextPlugin) tl.fromTo($('i', note), { scrambleText: { text: ' ' } }, { scrambleText: { text: note.dataset.type, chars: ' ', speed: 1, revealDelay: 0 }, duration: 0.4, ease: 'none' }, at + 0.1);
        tl.to(note, { opacity: 0, duration: 0.2 }, at + (+note.dataset.len || 0.5) * STORY);
      }
      leave(tl, [k, name, head, ...fits, proof, open].filter(Boolean), out);
      tl.set(ch, { autoAlpha: 0 }, out + 0.5);
    });
    tl.set({}, {}, LENGTH);
  }
  // each name comes in its own way, after its project
  function nameIn(t, ch, el, i, at, split) {
    const sp = split(el, 'words,chars'), chars = sp ? sp.chars : [el];
    t.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.01 }, at);
    if (i === 0) // Relay: Zentry's title, each letter turning in out of depth
      t.fromTo(chars, { ...ZIN }, { ...REST, duration: 0.6, ease: 'power4.out', stagger: 0.035 }, at);
    else if (i === 1 && window.ScrambleTextPlugin) { // Tracewise: decoded, like a trace id
      sp?.revert();
      t.fromTo(el, { scrambleText: { text: ' ' } }, { scrambleText: { text: el.dataset.t, chars: '01<>/{}#', revealDelay: 0.15, speed: 0.8 }, duration: 0.6, ease: 'none' }, at);
    } else if (i === 2) // Onboard: from three places into one
      t.fromTo(chars, { opacity: 0, x: (k) => ['-1.4em', '0em', '1.4em'][k % 3], y: (k) => ['0.7em', '-1em', '0.7em'][k % 3], rotate: (k) => [-25, 0, 25][k % 3] }, { opacity: 1, x: 0, y: 0, rotate: 0, duration: 0.6, ease: 'power3.out', stagger: 0.02 }, at);
    else if (i === 3) { // Dispatch: a block of colour wipes across and leaves the name behind
      const blk = $('.f-blk', ch);
      t.fromTo(blk, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.3, ease: 'power3.inOut' }, at);
      t.fromTo(chars, { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0 }, at + 0.3);
      t.fromTo(blk, { scaleX: 1, transformOrigin: '100% 50%' }, { scaleX: 0, duration: 0.3, ease: 'power3.inOut', immediateRender: false }, at + 0.3);
    } else if (i === 4) { // Atlas: found, a highlighter across it
      const hl = $('.f-hl', ch);
      t.fromTo(hl, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power2.inOut' }, at);
      t.fromTo(chars, { opacity: 0.12 }, { opacity: 1, duration: 0.12, stagger: 0.07, ease: 'none' }, at + 0.05);
    } else if (i === 5) // Intonation Studio: a wave runs through the letters, then they settle in tune
      t.fromTo(chars, { opacity: 0, yPercent: (k) => Math.sin(k * 0.9) * 90 }, { opacity: 1, yPercent: 0, duration: 0.7, ease: 'elastic.out(1, 0.35)', stagger: 0.025 }, at);
    else { // Layerline: printed, a layer at a time, from the bottom up
      const noz = $('.f-noz', ch);
      t.fromTo(el, { clipPath: 'inset(100% -5% -5% -5%)' }, { clipPath: 'inset(0% -5% -5% -5%)', duration: 0.7, ease: 'steps(14)' }, at);
      t.fromTo(noz, { yPercent: 0, opacity: 1 }, { yPercent: -100, duration: 0.7, ease: 'steps(14)' }, at);
      t.to(noz, { opacity: 0, duration: 0.1 }, at + 0.7);
    }
  }
  function proofIn(t, el, i, at) {
    const txt = el.dataset.v || (el.dataset.v = el.textContent);
    if (i === 0 || i === 3) roll(t, el, at, 0.7);
    else if (i === 1 && window.ScrambleTextPlugin) t.fromTo(el, { scrambleText: { text: ' ' } }, { scrambleText: { text: txt, chars: '0123456789', revealDelay: 0.2, speed: 0.6 }, duration: 0.6, ease: 'none' }, at);
    else if (i === 2) count(t, el, at, 0, 0.977, 3, '', 0.7);
    else if (i === 4) count(t, el, at, 0, 85, 0, '%', 0.6);
    else if (i === 5) count(t, el, at, 50, 0.17, 2, '¢', 0.8, 'expo.out');
    else count(t, el, at, 0, 21, 0, ' ms', 0.6);
  }

  /* ------------------------------------------------------------------ size */
  function size(w, h, r, n) {
    W = w; H = h; res = r; narrow = n;
    if (gl) {
      renderer.setPixelRatio(res);
      renderer.setSize(W, H, false);
      const bw = Math.max(1, Math.round(W * res)), bh = Math.max(1, Math.round(H * res));
      if (!rtA) { rtA = makeRT(); rtB = makeRT(); }
      rtA.setSize(bw, bh); rtB.setSize(bw, bh);
      comp.u.uRes.value.set(W, H);
      cloud.size(W, H);
      scenes.forEach((s) => s?.size(W, H, narrow));
    }
    if (gsap && built) { build(); if (lastF > -1) tl.time(clamp(lastF, 0, LENGTH)); }
  }
  function setTier(t) {
    if (!gl) return;
    const was = shadows;
    conf(t);
    if (!shadows && was) { renderer.shadowMap.enabled = false; scenes.forEach((s) => s?.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); })); }
  }
  let built = false;
  function init() { build(); built = true; }

  /* ------------------------------------------------------------------ the frame */
  let clock = 0, lastF = -9, shown = false;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { ptr.tx = e.clientX / innerWidth * 2 - 1; ptr.ty = e.clientY / innerHeight * 2 - 1; } }, { passive: true });
  const H3 = new THREE.Matrix3();
  function alphaAt(f) { return smooth(-0.05, 0.4, f) * (1 - smooth(LENGTH - 0.7, LENGTH - 0.05, f)); }
  function chapterAt(f) { let i = 0; for (let k = 0; k < N; k++) if (f >= S(k) - TR) i = k; return i; }
  function frame(f, dt, vel) {
    const a = alphaAt(f);
    const on = a > 0.001;
    if (on !== shown) { shown = on; root.classList.toggle('on', on); if (canvas) canvas.style.visibility = on ? 'visible' : 'hidden'; }
    if (!on) { lastF = f; return 0; }
    if (canvas) canvas.style.opacity = a.toFixed(3);
    root.style.opacity = clamp(a * 1.4).toFixed(3);
    if (tl && f !== lastF) tl.time(clamp(f, 0, LENGTH));
    lastF = f;
    if (!gl) return a;
    if (!reduced) { clock += dt; ptr.x += (ptr.tx - ptr.x) * 0.06; ptr.y += (ptr.ty - ptr.y) * 0.06; }
    // what is on screen, and how one hands over to the next
    let A, B = null, mode = MODE.fade, p = 0;
    const chap = (i) => { const sc = want(i); sc.update((f - S(i)) / STORY, clock, reduced ? 0 : dt); return sc; };
    const cl = () => { cloud.update(f * 0.32 + clock * 0.01, clock); return cloud; };
    if (f < WIN[0]) A = cl();
    else if (f < WIN[1]) { A = cl(); B = chap(0); mode = MODE.window; p = (f - WIN[0]) / (WIN[1] - WIN[0]); }
    else if (f >= OUT[1]) A = cl();
    else if (f >= OUT[0]) { A = chap(N - 1); B = cl(); mode = MODE.ring; p = (f - OUT[0]) / (OUT[1] - OUT[0]); }
    else {
      const i = chapterAt(f);
      if (i > 0 && f < S(i)) { A = chap(i - 1); B = chap(i); mode = INTO[i]; p = (f - (S(i) - TR)) / TR; }
      else A = chap(i);
    }
    if (reduced && B) mode = MODE.fade;
    // the scene leans a little toward the pointer
    if (!reduced) for (const sc of [A, B]) if (sc && sc.camera.isPerspectiveCamera) { sc.camera.rotateY(-ptr.x * 0.022); sc.camera.rotateX(-ptr.y * 0.014); }
    renderer.setRenderTarget(rtA); renderer.render(A.scene, A.camera);
    if (B) { renderer.setRenderTarget(rtB); renderer.render(B.scene, B.camera); }
    const u = comp.u;
    u.tA.value = rtA.texture; u.tB.value = (B ? rtB : rtA).texture;
    u.uMode.value = B ? mode : 0; u.uP.value = B ? clamp(p) : 0;
    u.uTime.value = clock; u.uVel.value = reduced ? 0 : vel;
    u.uInk.value.copy(B?.ink || A.ink || u.uPaper.value);
    if (mode === MODE.window) windowAt(p);
    if (mode === MODE.type) typeAt();
    if (mode === MODE.slats) u.uSlats.value = narrow ? 4 : 7;
    if (mode === MODE.ring) { u.uCorner.value.set(0.04, 0.06); u.uInk.value.set('#f3ede2'); }
    comp.draw();
    return a;
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
  // for the words: which chapter (or the cloud) is showing
  function label(f) {
    if (f < WIN[1] - 0.3) return null;
    if (f >= OUT[0] + 0.3) return null;
    const i = chapterAt(f + 0.3);
    return { i, name: chapters[i]?.dataset.name || '' };
  }
  // where to scroll to so a chapter is showing (for keyboard focus)
  const at = (el) => { const ch = el.closest?.('.f-ch'); if (ch) return S(chapters.indexOf(ch)) + STORY * 0.6; if (el.closest?.('.f-say')) return 1.6; return null; };
  return { length: LENGTH, gl, size, frame, setTier, init, label, at, renderer };
}
