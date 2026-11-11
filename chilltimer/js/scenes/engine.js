// Scene stage. Four stacked surfaces: two canvases for drawn scenes, two <video> tags for real footage.
// The next scene always fades in over the old one, so nothing ever cuts. Drawn scenes are painted
// every frame from the clock; a video clip fades into its own start before it ends.

import { bus } from '../bus.js';
import { VW, VH, rng, clamp } from './kit.js';
import { CLIPS } from './video.js';

// Vibes are registered by the page (app.js or lab.html), so one broken vibe file cannot stop the stage.
export const VIBES = {};

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LOOP_FADE = 2.5;         // seconds a clip takes to dissolve into its own start
const surfaces = [];           // { el, kind: 'drawn' | 'video', g, scene, state, alive }
let cur = null, vibe = null, index = 0, kind = 'drawn', busy = false, queued = null;
let story = { session: 0, round: 0, mode: 'focus', running: false };
let preview = null;            // { t0, dur } while the time-lapse plays
let last = 0, lastPaint = -9, covered = false;

// The scenes of a vibe for the kind in use: drawn scenes, or video clips when there are some.
const list = (v = vibe, k = kind) => (k === 'video' && CLIPS[v.id]?.length ? CLIPS[v.id] : v.scenes);
const usesVideo = () => kind === 'video' && !!CLIPS[vibe.id]?.length;

function fit() {
  // Cap the pixel count: scenes are soft, and a 4K canvas would cost a lot for nothing.
  const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(2.4e6 / (innerWidth * innerHeight)));
  for (const L of surfaces) if (L.kind === 'drawn') {
    L.el.width = Math.max(2, Math.round(innerWidth * ratio));
    L.el.height = Math.max(2, Math.round(innerHeight * ratio));
  }
}

function liveStory(t) {
  if (!preview) return story;
  const k = (t - preview.t0) / preview.dur;
  if (k >= 1) { preview = null; bus.emit('scene:preview', false); return story; }
  return { session: k, round: (k * 4) % 1, mode: 'focus', running: true };
}

function paint(L, t, dt, st) {
  const { el, g, scene } = L, cw = el.width, ch = el.height;
  const sc = Math.max(cw / VW, ch / VH) * 1.03;                 // 3% overscan for the slow drift
  const [fx, fy] = scene.focus || [0.5, 0.5];
  const ox = clamp((cw - VW * sc) * fx + Math.sin(t * 0.045) * 10 * sc, cw - VW * sc, 0);
  const oy = clamp((ch - VH * sc) * fy + Math.cos(t * 0.037) * 5 * sc, ch - VH * sc, 0);
  g.setTransform(sc, 0, 0, sc, ox, oy);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  scene.draw(g, L.state, t, dt, st);
}

function frame(ms) {
  requestAnimationFrame(frame);
  const t = ms / 1000;
  if (covered || (reduced && t - lastPaint < 1)) return;       // behind a YouTube video: no painting. Reduced motion: one frame a second
  const dt = Math.min(0.05, Math.max(0.001, t - last));
  last = lastPaint = t;
  const st = liveStory(t);
  for (const L of surfaces) if (L.alive && L.kind === 'drawn') paint(L, t, dt, st);
}

// Fade `inc` in over whatever is on show. `quiet` = a clip looping into itself: no camera push, no title.
function dissolve(inc, secs, quiet) {
  const s = inc.el.style;
  s.transition = 'none'; s.opacity = 0; s.zIndex = 1; s.transform = quiet ? 'scale(1)' : 'scale(1.05)';
  for (const o of surfaces) if (o !== inc) o.el.style.zIndex = 0;
  inc.el.offsetWidth;                                           // commit the start state
  s.transition = `opacity ${secs}s ease-in-out, transform ${secs * 1.7}s cubic-bezier(.2,.6,.2,1)`;
  s.opacity = 1; s.transform = 'scale(1)';
  cur = inc;
  setTimeout(() => {
    for (const o of surfaces) if (o !== cur) {
      o.alive = false;
      o.el.style.transition = 'none';
      o.el.style.opacity = 0;
      if (o.kind === 'video') o.el.pause();
    }
    busy = false;
    if (queued) { const q = queued; queued = null; show(...q); }
  }, secs * 1000 + 80);
  if (!quiet) bus.emit('scene:change', stage.info());
}

function show(i, secs, quiet) {
  if (busy) { if (!quiet) queued = [i, secs]; return; }
  const items = list(), video = usesVideo();
  index = ((i % items.length) + items.length) % items.length;
  const item = items[index];
  const inc = surfaces.find(s => s.kind === (video ? 'video' : 'drawn') && s !== cur);
  busy = true;
  if (!video) {
    inc.scene = item;
    inc.state = item.setup(rng(1234 + index * 77));
    inc.alive = true;
    return dissolve(inc, secs, quiet);
  }
  // Video: wait until it can play, then fade. If it never can, say so and let the page fall back.
  const v = inc.el;
  let settled = false;
  const ok = () => { if (settled) return; settled = true; clearTimeout(timer); v.play().catch(() => {}); dissolve(inc, secs, quiet); };
  const fail = () => { if (settled) return; settled = true; clearTimeout(timer); busy = false; queued = null; bus.emit('scene:videofail', item); };
  const timer = setTimeout(fail, 12000);
  v.oncanplay = ok;
  v.onerror = fail;
  if (v.dataset.url === item.url && v.readyState >= 3) { v.currentTime = 0; ok(); }
  else { v.dataset.url = item.url; v.src = item.url; v.load(); }
}

// A clip is about to end: bring the same clip in again from its start, underneath a soft fade.
function loopCheck(v) {
  if (busy || !cur || cur.el !== v || !v.duration) return;
  if (v.duration - v.currentTime < LOOP_FADE + 0.3) show(index, Math.min(LOOP_FADE, v.duration / 3), true);
}

export const stage = {
  register(...vibes) { for (const v of vibes) VIBES[v.id] = v; },
  init(a, b) {
    for (const el of [a, b]) surfaces.push({ el, kind: 'drawn', g: el.getContext('2d', { alpha: false }), scene: null, state: null, alive: false });
    for (let i = 0; i < 2; i++) {
      const v = Object.assign(document.createElement('video'), { className: 'scene scene-video', muted: true, playsInline: true, preload: 'auto' });
      v.setAttribute('aria-hidden', 'true');
      v.addEventListener('timeupdate', () => loopCheck(v));
      v.addEventListener('ended', () => { if (cur && cur.el === v && !busy) show(index, 1, true); });
      b.after(v);
      surfaces.push({ el: v, kind: 'video', alive: false });
    }
    fit();
    addEventListener('resize', fit);
    document.addEventListener('visibilitychange', () => {
      if (cur && cur.kind === 'video') { if (document.hidden) cur.el.pause(); else cur.el.play().catch(() => {}); }
    });
    requestAnimationFrame(frame);
  },
  // 'drawn' or 'video'. A vibe with no clips stays drawn.
  setKind(k) {
    if (k === kind) return;
    const was = stage.kind();
    kind = k;
    if (vibe && stage.kind() !== was) show(index, 4);   // YouTube sits on top of the drawn scene, so going to or from it changes nothing here
  },
  kind: () => (vibe && usesVideo() ? 'video' : 'drawn'),
  setVibe(id, sceneIndex = 0) {
    vibe = VIBES[id] || Object.values(VIBES)[0];
    show(sceneIndex, cur ? 4 : 2.2);
  },
  // dir ±1 steps through the vibe's scenes. secs is the dissolve length.
  nextScene(dir = 1, secs = 3) { show(index + dir, secs); },
  goScene(i, secs = 3) { if (i !== index) show(i, secs); },
  setStory(s) { story = s; },
  cover(on) { covered = on; },                                   // something covers the stage: stop painting
  info: () => (vibe ? { vibe, scene: list()[index], index, count: list().length, kind: stage.kind() } : null),
  items: id => list(VIBES[id]),                                  // scenes or clips of a vibe, for the picker
  canvas: () => (cur ? cur.el : null),                           // what is on show (canvas or video), for the mini window
  preview(secs = 20) {
    preview = { t0: performance.now() / 1000, dur: secs };
    bus.emit('scene:preview', true);
  },
  // Small still picture of a scene, for the vibe picker.
  thumb(id, i, w = 192, h = 108) {
    const item = list(VIBES[id])[i];
    if (item.url) return Object.assign(document.createElement('video'), { muted: true, playsInline: true, preload: 'metadata', src: item.url + '#t=2' });
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h }), g = c.getContext('2d');
    const S = item.setup(rng(1234 + i * 77));
    g.setTransform(w / VW, 0, 0, h / VH, 0, 0);
    for (let k = 0; k < 3; k++) item.draw(g, S, 20 + k * 0.4, 0.4, { session: 0.38, round: 0.3, mode: 'focus', running: true });
    return c;
  }
};
