// Reflow: a wall of text that flows around giant letters you can drag, and around the cursor.
//
// Every frame: draw the obstacles into a small mask canvas, read back which columns each line band
// is free in, then ask Pretext for the next line that fits each free span. Nothing is measured
// through the DOM; the spans are only painted. Pretext: https://github.com/chenglou/pretext
import { prepareWithSegments, layoutNextLineRange, materializeLineRange } from '../vendor/pretext.js';

const MASK = 0.25;            // mask pixels per CSS pixel
const PAD_X = 14, PAD_Y = 4;  // breathing room between text and an obstacle, in CSS px

export function mountReflow(stage, opts) {
  const {
    paragraphs,                       // array of strings
    family = 'Inter',
    glyphFamily = '"Instrument Serif"',
    glyphs = [{ ch: 'A' }, { ch: 'F', italic: true }],
    highlight = [],                   // [{ re: /…/g, color }] painted over matching words (colour only, so widths don't change)
    onFrame = () => {}
  } = opts;

  const dpr = Math.min(devicePixelRatio || 1, 2);
  const textLayer = document.createElement('div');
  textLayer.className = 'flow';
  textLayer.setAttribute('aria-hidden', 'true');
  const art = document.createElement('canvas');
  art.className = 'glyphs';
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  const actx = art.getContext('2d');
  stage.append(textLayer, art);

  let W = 0, H = 0, top = 0, bottom = 0, side = 0;
  let size = 18, lh = 27, font = '';
  let prepared = [];
  const pool = [];
  const pointer = { x: -1e4, y: -1e4, r: 0, target: 0, inside: false };
  let drag = null;

  // glyph state: home position (fractions of the stage), current position, velocity, angle
  const G = glyphs.map((g, i) => ({
    ...g, i, x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, hx: 0, hy: 0, size: 0, box: null,
    phase: i * 2.1, held: false, free: 0
  }));

  function glyphFont(g, px) { return `${g.italic ? 'italic ' : ''}400 ${px}px ${glyphFamily}`; }

  // the ink box of each glyph at 1000px, so it can be centred on its position and hit-tested
  function measureGlyphs() {
    for (const g of G) {
      mctx.font = glyphFont(g, 1000);
      const m = mctx.measureText(g.ch);
      g.box = { l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, t: m.actualBoundingBoxAscent, b: m.actualBoundingBoxDescent };
    }
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    W = r.width; H = r.height;
    const narrow = W < 700;
    top = narrow ? 64 : 72; bottom = narrow ? 44 : 52; side = narrow ? 16 : Math.max(28, W * 0.04);
    art.width = Math.round(W * dpr); art.height = Math.round(H * dpr);
    art.style.width = W + 'px'; art.style.height = H + 'px';
    mask.width = Math.ceil(W * MASK); mask.height = Math.ceil(H * MASK);
    const gs = Math.min(H * (narrow ? 0.42 : 0.74), W * (narrow ? 0.62 : 0.4));
    const homes = narrow ? [[0.3, 0.42], [0.7, 0.66]] : [[0.3, 0.5], [0.69, 0.54]];
    G.forEach((g, i) => {
      g.size = gs;
      const [fx, fy] = homes[i % homes.length];
      g.hx = W * fx; g.hy = H * fy;
      if (!g.x) { g.x = g.hx; g.y = g.hy; }
    });
    fitType();
  }

  // pick the body size whose layout, with the letters at home, ends just above the bottom edge
  function fitType() {
    let lo = 11, hi = W < 700 ? 17 : 24;
    for (let k = 0; k < 7; k++) {
      const mid = (lo + hi) / 2;
      setType(mid);
      drawMask(true);
      const { overflow } = flow(false);
      if (overflow) hi = mid; else lo = mid;
    }
    setType(lo);
  }

  function setType(px) {
    size = Math.round(px * 4) / 4;
    lh = Math.round(size * 1.5);
    font = `400 ${size}px ${family}`;
    prepared = paragraphs.map((p) => prepareWithSegments(p, font));
    textLayer.style.font = font;
    textLayer.style.lineHeight = lh + 'px';
  }

  function placeGlyph(ctx, g, scale, x = g.x, y = g.y, a = g.a) {
    const k = g.size / 1000;
    const cx = (g.box.r - g.box.l) / 2 * k, cy = (g.box.t - g.box.b) / 2 * k;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(x, y); ctx.rotate(a);
    ctx.font = glyphFont(g, g.size);
    ctx.fillText(g.ch, -cx, cy);
    ctx.restore();
  }

  function drawMask(home = false) {
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mask.width, mask.height);
    mctx.fillStyle = '#fff';
    for (const g of G) placeGlyph(mctx, g, MASK, home ? g.hx : g.x, home ? g.hy : g.y, home ? 0 : g.a);
    if (!home && pointer.r > 1) {
      mctx.beginPath();
      mctx.arc(pointer.x * MASK, pointer.y * MASK, pointer.r * MASK, 0, Math.PI * 2);
      mctx.fill();
    }
  }

  // free horizontal spans for the band [y, y + lh), in CSS px
  let pixels = null;
  function readMask() { pixels = mctx.getImageData(0, 0, mask.width, mask.height).data; }
  function spans(y) {
    const mw = mask.width, mh = mask.height;
    const r0 = Math.max(0, Math.floor((y - PAD_Y) * MASK)), r1 = Math.min(mh - 1, Math.ceil((y + lh + PAD_Y) * MASK));
    const c0 = Math.floor(side * MASK), c1 = Math.ceil((W - side) * MASK);
    const occ = new Uint8Array(mw);
    for (let r = r0; r <= r1; r++) {
      const row = r * mw * 4;
      for (let c = c0; c < c1; c++) if (pixels[row + c * 4 + 3] > 40) occ[c] = 1;
    }
    const out = [];
    const minW = size * (W < 700 ? 7 : 6), pad = PAD_X;
    let start = -1;
    for (let c = c0; c <= c1; c++) {
      const free = c < c1 && !occ[c];
      if (free && start < 0) start = c;
      if (!free && start >= 0) {
        const L = start === c0 ? side : start / MASK + pad;
        const R = c === c1 ? W - side : c / MASK - pad;
        if (R - L >= minW) out.push([L, R]);
        start = -1;
      }
    }
    return out;
  }

  // lay the paragraphs into the free spans, top to bottom; paint when `paint`
  function flow(paint) {
    if (!paint) readMask();
    let p = 0, cursor = { segmentIndex: 0, graphemeIndex: 0 };
    let y = top, used = 0, lines = 0;
    const limit = H - bottom;
    while (p < prepared.length && y + lh <= limit) {
      const row = spans(y);
      let gap = false;
      for (const [L, R] of row) {
        const range = layoutNextLineRange(prepared[p], R - L, cursor);
        if (!range) { p++; cursor = { segmentIndex: 0, graphemeIndex: 0 }; gap = true; break; }
        lines++;
        if (paint) {
          const line = materializeLineRange(prepared[p], range);
          const last = !layoutNextLineRange(prepared[p], R - L, range.end);
          put(used++, line.text, L, y, R - L, line.width, last);
        }
        cursor = range.end;
      }
      y += gap ? Math.round(lh * 1.6) : lh;
    }
    if (paint) for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
    return { overflow: p < prepared.length, lines };
  }

  function put(i, text, x, y, width, natural, last) {
    let el = pool[i];
    if (!el) { el = document.createElement('span'); el.className = 'ln'; textLayer.append(el); pool[i] = el; }
    const t = text.replace(/\s+$/, '');
    if (el._t !== t) {
      el._t = t;
      el.innerHTML = paintRuns(t);
    }
    // justify every line but a paragraph's last, so the text hugs the letters on both sides
    const spaces = (t.match(/ /g) || []).length;
    const extra = width - natural;
    // but only while the gaps stay under half an em; past that a ragged edge reads better than rivers
    const ws = !last && spaces && extra / spaces < size * 0.5 ? extra / spaces : 0;
    el.style.display = '';
    el.style.transform = `translate(${x.toFixed(1)}px, ${y}px)`;
    el.style.wordSpacing = ws ? ws.toFixed(2) + 'px' : '';
  }

  // colour the highlighted words of a line; the first rule to claim a character wins
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  function paintRuns(t) {
    const owner = new Array(t.length).fill(-1);
    highlight.forEach((h, k) => {
      for (const m of t.matchAll(h.re)) {
        const a = m.index, b = a + m[0].length;
        if (owner.slice(a, b).some((o) => o >= 0)) continue;
        owner.fill(k, a, b);
      }
    });
    let html = '', i = 0;
    while (i < t.length) {
      let j = i;
      while (j < t.length && owner[j] === owner[i]) j++;
      const s = esc(t.slice(i, j));
      html += owner[i] < 0 ? s : `<i style="color:${highlight[owner[i]].color}">${s}</i>`;
      i = j;
    }
    return html;
  }

  function drawArt() {
    actx.setTransform(1, 0, 0, 1, 0, 0);
    actx.clearRect(0, 0, art.width, art.height);
    for (const g of G) {
      actx.fillStyle = g.color || '#ecebe6';
      placeGlyph(actx, g, dpr);
    }
    if (pointer.r > 2) {
      actx.save(); actx.scale(dpr, dpr);
      actx.strokeStyle = 'rgba(236,235,230,0.22)'; actx.lineWidth = 1;
      actx.beginPath(); actx.arc(pointer.x, pointer.y, Math.max(0, pointer.r - PAD_X), 0, Math.PI * 2); actx.stroke();
      actx.restore();
    }
  }

  // hit test in the glyph's own frame against its ink box
  function hit(x, y) {
    for (let i = G.length - 1; i >= 0; i--) {
      const g = G[i], k = g.size / 1000;
      const dx = x - g.x, dy = y - g.y, c = Math.cos(-g.a), s = Math.sin(-g.a);
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      const hw = (g.box.r + g.box.l) / 2 * k, hh = (g.box.t + g.box.b) / 2 * k;
      if (Math.abs(lx) < hw * 0.9 && Math.abs(ly) < hh * 0.92) return g;
    }
    return null;
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function step(dt, t) {
    const R = W < 700 ? 46 : 72;
    pointer.target = pointer.inside && !drag ? R : 0;
    pointer.r += (pointer.target - pointer.r) * Math.min(1, dt * 10);
    for (const g of G) {
      if (g.held) continue;
      // idle drift around home, so the page is never still; a thrown letter coasts, then comes home
      const drift = reduced ? 0 : 1;
      const tx = g.hx + drift * Math.sin(t * 0.21 + g.phase) * W * 0.035;
      const ty = g.hy + drift * Math.cos(t * 0.17 + g.phase * 1.3) * H * 0.03;
      const ta = drift * Math.sin(t * 0.13 + g.phase) * 0.05;
      g.free = Math.max(0, g.free - dt);
      const k = g.free > 0 ? 0.6 : 7;
      g.vx += (tx - g.x) * k * dt; g.vy += (ty - g.y) * k * dt; g.va += (ta - g.a) * k * dt;
      const damp = Math.exp(-dt * (g.free > 0 ? 1.1 : 3.2));
      g.vx *= damp; g.vy *= damp; g.va *= damp;
      g.x += g.vx * dt; g.y += g.vy * dt; g.a += g.va * dt;
      // stay on the stage
      const m = g.size * 0.2;
      if (g.x < m) { g.x = m; g.vx = Math.abs(g.vx) * 0.6; }
      if (g.x > W - m) { g.x = W - m; g.vx = -Math.abs(g.vx) * 0.6; }
      if (g.y < m) { g.y = m; g.vy = Math.abs(g.vy) * 0.6; }
      if (g.y > H - m) { g.y = H - m; g.vy = -Math.abs(g.vy) * 0.6; }
    }
  }

  stage.addEventListener('pointerdown', (e) => {
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const g = hit(x, y);
    if (!g) return;
    stage.setPointerCapture(e.pointerId);
    g.held = true; g.vx = g.vy = 0;
    drag = { g, dx: g.x - x, dy: g.y - y, px: x, py: y, t: performance.now(), vx: 0, vy: 0 };
    G.push(G.splice(G.indexOf(g), 1)[0]); // grabbed letter draws on top
    stage.classList.add('grabbing');
  });
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    pointer.x = x; pointer.y = y; pointer.inside = e.pointerType === 'mouse';
    stage.classList.toggle('over', !drag && !!hit(x, y));
    if (!drag) return;
    const now = performance.now(), dt = Math.max(1, now - drag.t) / 1000;
    drag.vx = drag.vx * 0.6 + ((x - drag.px) / dt) * 0.4;
    drag.vy = drag.vy * 0.6 + ((y - drag.py) / dt) * 0.4;
    drag.px = x; drag.py = y; drag.t = now;
    drag.g.x = x + drag.dx; drag.g.y = y + drag.dy;
    drag.g.a += (Math.max(-0.4, Math.min(0.4, drag.vx * 0.00025)) - drag.g.a) * 0.15; // leans into the drag
  });
  const release = () => {
    if (!drag) return;
    const g = drag.g;
    g.held = false; g.vx = drag.vx; g.vy = drag.vy; g.va = drag.vx * 0.0008; g.free = 2.4;
    drag = null;
    stage.classList.remove('grabbing');
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('pointerleave', () => { pointer.inside = false; });

  let last = performance.now(), t0 = last, raf = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt, (now - t0) / 1000);
    const a = performance.now();
    drawMask();
    readMask();
    const { lines } = flow(true);
    const cost = performance.now() - a;
    drawArt();
    onFrame({ cost, lines, size });
    raf = requestAnimationFrame(frame);
  }

  measureGlyphs();
  resize();
  addEventListener('resize', () => { resize(); });
  raf = requestAnimationFrame(frame);
  return { stop() { cancelAnimationFrame(raf); } };
}
