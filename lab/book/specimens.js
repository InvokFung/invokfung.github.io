// The craft page: the six lab effects, each shown doing its one trick in a small space, each a
// door to its own page. Nothing runs until the page is open; the one under the pointer gets the
// pointer. Reflow and Assemble are small rewrites for a small box; Morph, Pressure and Ink mount
// the same components their own pages use.
import { prepareWithSegments, layoutNextLineRange, materializeLineRange } from '../vendor/pretext.js';
import { mountMorph } from '../morph/morph.js';
import { mountPressure } from '../pressure/pressure.js';
import { mountInk } from '../ink/ink.js';

const SPECS = [
  { slug: 'reflow', name: 'Reflow', line: 'Copy that makes room, every frame', mount: reflow },
  { slug: 'badge', name: 'Badge', line: 'A card with weight, a turn and a shine', mount: badge },
  { slug: 'morph', name: 'Morph', line: 'Titles that keep the letters they share', mount: morph },
  { slug: 'assemble', name: 'Assemble', line: 'Thousands of points finding their place', mount: assemble },
  { slug: 'pressure', name: 'Pressure', line: 'Type that leans toward your cursor', mount: pressure },
  { slug: 'ink', name: 'Ink', line: 'A name you can stir', mount: ink }
];
const dpr = Math.min(devicePixelRatio || 1, 2);
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

// slow (optional): while it returns true, only the specimen under the pointer runs every frame and
// the rest every other frame, for a page that needs the frame time for something else.
export function mountSpecimens(root, { isLive, slow }) {
  // each effect's own page, found from this file, so the door works from any page that mounts these
  root.innerHTML = SPECS.map((s) => `<a class="layer spec spec-${s.slug}" href="${new URL(`../${s.slug}/index.html`, import.meta.url).pathname}">
    <span class="art" aria-hidden="true"></span>
    <span class="cap"><b>${s.name}</b><span>${s.line}</span><em>open</em></span>
  </a>`).join('');
  const items = [...root.children].map((el, i) => ({ el, art: el.querySelector('.art'), spec: SPECS[i], hot: false, px: 0.5, py: 0.5, api: null }));
  for (const it of items) {
    it.el.addEventListener('pointerenter', () => { it.hot = true; });
    it.el.addEventListener('pointerleave', () => { it.hot = false; });
    it.el.addEventListener('pointermove', (e) => { const r = it.art.getBoundingClientRect(); it.px = (e.clientX - r.left) / r.width; it.py = (e.clientY - r.top) / r.height; });
    it.el.addEventListener('focus', () => { it.hot = true; });
    it.el.addEventListener('blur', () => { it.hot = false; });
  }
  let mounted = false, last = performance.now(), odd = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!isLive()) return;
    if (!mounted) { mounted = true; for (const it of items) it.api = it.spec.mount(it.art, it, isLive); }
    const half = slow?.();
    odd = !odd;
    for (const it of items) {
      if (!half || it.hot) it.api?.tick?.(dt, now / 1000);
      else if (odd) it.api?.tick?.(Math.min(0.1, dt * 2), now / 1000);
    }
  }
  requestAnimationFrame(frame);
  return { items };
}

// a canvas the size of its box, redrawn at the device's pixel ratio
function canvasIn(box) {
  const c = document.createElement('canvas');
  box.append(c);
  const ctx = c.getContext('2d');
  const s = { c, ctx, w: 0, h: 0 };
  s.fit = () => {
    const w = box.clientWidth, h = box.clientHeight;
    if (w === s.w && h === s.h) return false;
    s.w = w; s.h = h; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    return true;
  };
  s.fit();
  return s;
}

/* Reflow: a paragraph laid out again every frame around a word that drifts, or follows you */
function reflow(box, it) {
  const s = canvasIn(box);
  const TEXT = 'Every line here is laid out again on every frame, around whatever is in the way. Pretext measures the words once, then each line is plain arithmetic, so the text can part for a heading, a cursor or a card that swings through it, and close again behind. ';
  const fontPx = () => (s.w < 300 ? 10 : 11.5);
  let prepared = null, pf = 0;
  let cx = 0.5, cy = 0.5;
  return {
    tick(dt, t) {
      s.fit();
      const { ctx, w, h } = s, fp = fontPx(), lh = Math.round(fp * 1.45);
      if (pf !== fp) { pf = fp; prepared = prepareWithSegments(TEXT.repeat(8), `400 ${fp}px Inter`); }
      const tx = it.hot ? it.px : 0.5 + Math.sin(t * 0.55) * 0.26, ty = it.hot ? it.py : 0.5 + Math.sin(t * 0.9) * 0.14;
      cx += (tx - cx) * Math.min(1, dt * 6); cy += (ty - cy) * Math.min(1, dt * 6);
      const size = Math.min(h * 0.4, w * 0.17);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.font = `italic 400 ${size}px "Instrument Serif"`;
      const ww = ctx.measureText('Reflow').width, wx = clamp(cx * w, ww / 2, w - ww / 2), wy = clamp(cy * h, size * 0.4, h - size * 0.3);
      const pad = 8, box2 = { l: wx - ww / 2 - pad, r: wx + ww / 2 + pad, t: wy - size * 0.62, b: wy + size * 0.2 };
      ctx.font = `400 ${fp}px Inter`;
      ctx.fillStyle = 'rgba(236,235,230,0.5)';
      let cursor = { segmentIndex: 0, graphemeIndex: 0 };
      for (let y = 2; y + lh <= h; y += lh) {
        const spans = y + lh > box2.t && y < box2.b ? [[0, box2.l], [box2.r, w]] : [[0, w]];
        for (const [L, R] of spans) {
          if (R - L < fp * 4) continue;
          const range = layoutNextLineRange(prepared, R - L, cursor);
          if (!range) { cursor = { segmentIndex: 0, graphemeIndex: 0 }; continue; }
          ctx.fillText(materializeLineRange(prepared, range).text, L, y + fp);
          cursor = range.end;
        }
      }
      ctx.font = `italic 400 ${size}px "Instrument Serif"`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ecebe6';
      ctx.fillText('Reflow', wx, wy);
      ctx.textAlign = 'left';
    }
  };
}

/* Badge: the ID card, tilting toward the pointer with a shine that follows */
function badge(box, it) {
  box.innerHTML = `<span class="mb"><span class="mb-card">
    <span class="mb-top"><span>invokfung.github.io</span><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0a0b0d"/><rect x="5" y="5" width="6" height="6" rx="1.6" fill="#c8ff4a"/><rect x="13" y="5" width="6" height="6" rx="1.6" fill="#ff8a65"/><rect x="21" y="5" width="6" height="6" rx="1.6" fill="#b7b6b0"/><rect x="5" y="13" width="6" height="6" rx="1.6" fill="#a78bfa"/><rect x="13" y="13" width="6" height="6" rx="1.6" fill="#ecebe6"/><rect x="21" y="13" width="6" height="6" rx="1.6" fill="#ffb547"/><rect x="5" y="21" width="6" height="6" rx="1.6" fill="#ff7ab6"/><rect x="13" y="21" width="6" height="6" rx="1.6" fill="#4fe3c1"/><rect x="21" y="21" width="6" height="6" rx="1.6" fill="#62b6ff"/></svg></span>
    <span class="mb-seal">A<i>F</i></span>
    <span class="mb-who"><b>Alan Fung</b><small>Forward Deployed Engineer</small></span>
    <span class="mb-code"></span>
    <span class="mb-glare"></span>
  </span></span>`;
  const card = box.querySelector('.mb-card'), glare = box.querySelector('.mb-glare');
  let rx = 0, ry = 0, gx = 50, gy = 30;
  return {
    tick(dt, t) {
      const tx = it.hot ? (it.px - 0.5) * 34 : Math.sin(t * 0.7) * 12, ty = it.hot ? -(it.py - 0.5) * 26 : Math.sin(t * 0.5 + 1) * 5;
      ry += (tx - ry) * Math.min(1, dt * 7); rx += (ty - rx) * Math.min(1, dt * 7);
      gx += ((it.hot ? it.px * 100 : 50 + ry * 2) - gx) * Math.min(1, dt * 7); gy += ((it.hot ? it.py * 100 : 30 - rx * 2) - gy) * Math.min(1, dt * 7);
      card.style.transform = `rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg)`;
      card.style.setProperty('--gx', gx.toFixed(1) + '%'); card.style.setProperty('--gy', gy.toFixed(1) + '%');
      card.style.setProperty('--h', ((ry * 6 + t * 20) % 360).toFixed(0));
    }
  };
}

/* Morph: the job titles, one after another, keeping the letters they share */
function morph(box, it, isLive) {
  const wrap = document.createElement('span');
  wrap.className = 'mm';
  box.append(wrap);
  const titles = ['Web Developer', 'Full Stack Engineer', 'Software Engineer', 'Forward Deployed Engineer'];
  const m = mountMorph(wrap, { titles });
  let i = 0, next = 0;
  m.set(titles[0], true);
  return {
    tick(dt, t) {
      if (!next) next = t + 1.6;
      if (t > next) { i = (i + 1) % titles.length; m.set(titles[i]); next = t + (it.hot ? 1.3 : 2.4); }
    }
  };
}

/* Assemble: points that find their letters, and scatter from the pointer */
function assemble(box, it) {
  const s = canvasIn(box);
  let pts = null;
  function build() {
    const { w, h } = s, off = document.createElement('canvas'), k = 2;
    off.width = Math.max(1, Math.round(w / k)); off.height = Math.max(1, Math.round(h / k));
    const o = off.getContext('2d');
    const size = Math.min(off.height * 0.62, off.width * 0.2);
    o.font = `400 ${size}px "Instrument Serif"`; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
    o.fillText('Assemble', off.width / 2, off.height / 2);
    const d = o.getImageData(0, 0, off.width, off.height).data, cand = [];
    for (let y = 0; y < off.height; y++) for (let x = 0; x < off.width; x++) if (d[(y * off.width + x) * 4 + 3] > 120) cand.push([x * k + 1, y * k + 1]);
    const n = Math.min(1800, cand.length);
    pts = new Float32Array(n * 6); // x y vx vy tx ty
    for (let i = 0; i < n; i++) {
      const c = cand[Math.floor(Math.random() * cand.length)];
      pts.set([Math.random() * w, Math.random() * h, 0, 0, c[0], c[1]], i * 6);
    }
  }
  let next = 0;
  return {
    tick(dt, t) {
      if (s.fit() || !pts) build();
      const { ctx, w, h } = s, n = pts.length / 6, mx = it.px * w, my = it.py * h;
      if (!next) next = t + 5;
      if (!it.hot && t > next) { next = t + 5.5; for (let i = 0; i < n; i++) { pts[i * 6 + 2] += (Math.random() - 0.5) * 900; pts[i * 6 + 3] += (Math.random() - 0.5) * 600; } }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < n; i++) {
        const j = i * 6;
        let ax = (pts[j + 4] - pts[j]) * 40, ay = (pts[j + 5] - pts[j + 1]) * 40;
        if (it.hot) {
          const dx = pts[j] - mx, dy = pts[j + 1] - my, d2 = dx * dx + dy * dy, r = 46;
          if (d2 < r * r) { const f = (1 - Math.sqrt(d2) / r) * 9000 / Math.sqrt(d2 + 1); ax += dx * f; ay += dy * f; }
        }
        pts[j + 2] = (pts[j + 2] + ax * dt) * Math.pow(0.0025, dt);
        pts[j + 3] = (pts[j + 3] + ay * dt) * Math.pow(0.0025, dt);
        pts[j] += pts[j + 2] * dt; pts[j + 1] += pts[j + 3] * dt;
        const sp = Math.min(1, Math.hypot(pts[j + 2], pts[j + 3]) / 300);
        ctx.fillStyle = sp > 0.15 ? `rgba(255,181,71,${0.5 + sp * 0.5})` : 'rgba(236,235,230,0.88)';
        ctx.fillRect(pts[j] - 0.8, pts[j + 1] - 0.8, 1.6, 1.6);
      }
    }
  };
}

/* Pressure: the word, swelling toward the cursor on three font axes */
function pressure(box, it, isLive) {
  const wrap = document.createElement('span');
  wrap.className = 'mp';
  box.append(wrap);
  mountPressure(wrap, { lines: [{ text: 'Pressure' }], isLive });
  return null;
}

/* Ink: the name as characters on a fluid you can stir */
function ink(box, it, isLive) {
  const c = document.createElement('canvas');
  box.append(c);
  // a heavier face than the page's own: at this size a thin serif is only a cell or two wide
  try { mountInk(c, { name: ['Ink'], cellFont: '500 8px "JetBrains Mono"', nameFont: (px) => `700 ${px}px Inter`, isLive }); } catch (e) { box.classList.add('no-gl'); }
  return null;
}
