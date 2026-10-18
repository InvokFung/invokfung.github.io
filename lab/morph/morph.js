// Morph: one line of type that turns into the next. Three ways to do it, swappable live:
//   glide   letters the two words share slide to their new place; the rest blur out and in (Keynote's Magic Move, for text)
//   decode  each letter slot spins through random glyphs and settles left to right (ScrambleText, DecryptedText)
//   liquid  the words melt into each other through an SVG alpha threshold (the gooey morph Magic UI ships)

const CHARS = 'abcdeghknopqsuvxyz'; // letters of similar width, so a spinning slot doesn't spill into its neighbours
const ease = 'cubic-bezier(0.65, 0, 0.2, 1)';

export function mountMorph(root, { font = (px) => `400 ${px}px "Instrument Serif"`, titles }) {
  const ctx = document.createElement('canvas').getContext('2d');
  const layer = document.createElement('div');
  layer.className = 'morph-layer';
  root.append(layer);
  let size = 80, text = '', style = 'glide', spans = [], liquid = null;

  // Split into lines that fit, then give every visible letter its own box.
  function layout(str) {
    const W = root.clientWidth;
    ctx.font = font(size);
    const words = str.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const tryLine = line ? line + ' ' + w : w;
      if (line && ctx.measureText(tryLine).width > W) { lines.push(line); line = w; } else line = tryLine;
    }
    lines.push(line);
    const lh = size * 1.02, out = [];
    const top = (root.clientHeight - lh * lines.length) / 2;
    lines.forEach((l, li) => {
      const total = ctx.measureText(l).width, left = (W - total) / 2;
      for (let i = 0; i < l.length; i++) {
        if (l[i] === ' ') continue;
        const x0 = ctx.measureText(l.slice(0, i)).width, x1 = ctx.measureText(l.slice(0, i + 1)).width;
        out.push({ ch: l[i], x: left + x0, y: top + li * lh, w: x1 - x0 });
      }
    });
    return out;
  }

  // The size where every title fits: one line on a wide screen, at most two on a phone.
  function fit() {
    const W = root.clientWidth, narrow = W < 700;
    ctx.font = font(100);
    const wd = (t) => ctx.measureText(t).width / 100;
    const need = Math.max(...titles.map((t) => {
      if (!narrow) return wd(t);
      const w = t.split(' ');
      let best = wd(t);
      for (let k = 1; k < w.length; k++) best = Math.min(best, Math.max(wd(w.slice(0, k).join(' ')), wd(w.slice(k).join(' '))));
      return best;
    }));
    size = Math.min(narrow ? 72 : 132, (W * (narrow ? 0.94 : 0.96)) / need);
    root.style.font = font(size);
    root.style.height = (narrow ? size * 2.1 : size * 1.25) + 'px';
  }

  // longest common subsequence of two strings, as index pairs
  function lcs(a, b) {
    const n = a.length, m = b.length, T = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i][j] = a[i] === b[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
    const pairs = [];
    for (let i = 0, j = 0; i < n && j < m;) {
      if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; } else if (T[i + 1][j] >= T[i][j + 1]) i++; else j++;
    }
    return pairs;
  }

  const at = (b) => `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px)`;
  function make(b) {
    const s = document.createElement('span');
    s.className = 'ch'; s.textContent = b.ch;
    s.style.transform = at(b); s.style.width = b.w + 'px';
    layer.append(s);
    return s;
  }

  function glide(next) {
    const boxes = layout(next);
    const oldStr = spans.map((s) => s.b.ch).join(''), newStr = boxes.map((b) => b.ch).join('');
    const pairs = lcs(oldStr, newStr);
    const keepOld = new Map(pairs), keepNew = new Map(pairs.map(([i, j]) => [j, i]));
    const nextSpans = [];
    spans.forEach((s, i) => {
      if (keepOld.has(i)) return;
      s.el.animate([{ opacity: 1, filter: 'blur(0px)', transform: at(s.b) },
        { opacity: 0, filter: 'blur(10px)', transform: at({ x: s.b.x, y: s.b.y + size * 0.22 }) }],
      { duration: 520, delay: i * 14, easing: ease, fill: 'forwards' }).onfinish = () => s.el.remove();
    });
    boxes.forEach((b, j) => {
      if (keepNew.has(j)) {
        const s = spans[keepNew.get(j)];
        s.el.animate([{ transform: at(s.b) }, { transform: at(b) }], { duration: 900, delay: 120 + j * 10, easing: ease, fill: 'backwards' });
        s.el.style.transform = at(b); s.el.style.width = b.w + 'px';
        s.b = b; nextSpans.push(s);
      } else {
        const el = make(b);
        el.animate([{ opacity: 0, filter: 'blur(10px)', transform: at({ x: b.x, y: b.y - size * 0.22 }) },
          { opacity: 1, filter: 'blur(0px)', transform: at(b) }],
        { duration: 700, delay: 380 + j * 22, easing: ease, fill: 'backwards' });
        nextSpans.push({ el, b });
      }
    });
    spans = nextSpans;
  }

  let decodeRaf = 0;
  function decode(next) {
    cancelAnimationFrame(decodeRaf);
    const boxes = layout(next);
    for (const s of spans) s.el.remove();
    spans = boxes.map((b) => ({ el: make(b), b }));
    const start = performance.now(), per = 34, settle = 380;
    const tick = (now) => {
      const t = now - start;
      let done = true;
      spans.forEach((s, i) => {
        const reveal = settle + i * per;
        if (t < reveal) {
          done = false;
          if ((t / 50 | 0) !== s.k) { s.k = t / 50 | 0; s.el.textContent = CHARS[(Math.random() * CHARS.length) | 0]; }
          s.el.classList.add('scr');
        } else if (s.el.classList.contains('scr')) { s.el.textContent = s.b.ch; s.el.classList.remove('scr'); }
      });
      if (!done) decodeRaf = requestAnimationFrame(tick);
    };
    decodeRaf = requestAnimationFrame(tick);
  }

  function melt(next) {
    for (const s of spans) s.el.remove();
    spans = [];
    if (!liquid) {
      liquid = document.createElement('div');
      liquid.className = 'liquid';
      liquid.innerHTML = '<span class="a"></span><span class="b"></span>';
      root.append(liquid);
    }
    const [a, b] = liquid.children;
    a.textContent = text; b.textContent = next;
    const start = performance.now(), D = 1100;
    const blur = (f) => Math.min(10, 6 / Math.max(f, 0.01) - 6);
    const tick = (now) => {
      const f = Math.min(1, (now - start) / D);
      b.style.filter = `blur(${blur(f)}px)`; b.style.opacity = Math.pow(f, 0.4);
      a.style.filter = `blur(${blur(1 - f)}px)`; a.style.opacity = Math.pow(1 - f, 0.4);
      if (f < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function set(next, instant) {
    if (instant || !text) {
      for (const s of spans) s.el.remove();
      spans = layout(next).map((b) => ({ el: make(b), b }));
      if (liquid) { liquid.remove(); liquid = null; }
      if (style === 'liquid') melt(next);
    } else if (style === 'glide') glide(next);
    else if (style === 'decode') decode(next);
    else melt(next);
    text = next;
  }

  fit();
  addEventListener('resize', () => { fit(); set(text, true); });
  return {
    set,
    setStyle(s) {
      style = s;
      root.dataset.style = s;
      if (s !== 'liquid' && liquid) { liquid.remove(); liquid = null; }
      set(text, true);
    }
  };
}

// Rolling digits, one strip of 0-9 per place (NumberFlow's trick for numbers that change).
export function mountRoller(el, value) {
  el.classList.add('roller');
  el.setAttribute('aria-label', value);
  const cols = [...value].map((c) => {
    const col = document.createElement('span');
    col.className = /\d/.test(c) ? 'col' : 'sym';
    col.setAttribute('aria-hidden', 'true');
    col.innerHTML = /\d/.test(c) ? '<span class="strip">' + [...'0123456789'].map((d) => `<span>${d}</span>`).join('') + '</span>' : c;
    el.append(col);
    return col;
  });
  function set(v) {
    el.setAttribute('aria-label', v);
    [...v].forEach((c, i) => {
      const strip = cols[i]?.querySelector('.strip');
      if (strip) strip.style.transform = `translateY(${-Number(c)}em)`;
    });
  }
  set(value);
  return { set };
}
