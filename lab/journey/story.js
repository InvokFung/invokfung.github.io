// The words over the film: one paused GSAP timeline whose time is τ, the scroll in screens, so every
// line, number and name plays forward as you scroll down and backward as you scroll up. A few
// things follow the scroll's speed as well (the rows of where the work fits lean and run, the belt of
// how I work slides with the camera), and the cover's first lines play once on their own, at load.
import { WALK } from './places.js';
const gsap = window.gsap;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };
const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const D = window.PORTFOLIO || {};

// the background with no WebGL, per shot, the colour of its scene
const BG = { hello: '#e9d6c8', path: '#d9d6db', work: '#8d96a1', how: '#ebe5d8', tools: '#101317', next: '#cdd3db', contact: '#2b2433' };

export function createStory({ root, T, SEQ, TOTAL, reduced }) {
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const chapters = $$('.f-ch');
  const CH = SEQ.filter((s) => s.ch != null);
  let tl = null, splits = [], intro = null, last = -1, W = innerWidth, H = innerHeight, narrow = false;
  const has = (p) => !!window[p];

  /* ------------------------------------------------------------------ small pieces */
  // a number that rolls up on its digits, like a counter
  function odometer(el) {
    if (el.dataset.od) return $$('.od-col', el);
    const txt = el.textContent;
    el.dataset.od = txt;
    el.setAttribute('aria-label', txt);
    el.innerHTML = [...txt].map((ch) => /\d/.test(ch)
      ? `<span class="od" aria-hidden="true"><span class="od-col" data-d="${ch}">${'0123456789'.repeat(2).split('').map((d) => `<span>${d}</span>`).join('')}</span></span>`
      : `<span aria-hidden="true">${ch}</span>`).join('');
    // each digit's own width, in em: the serif has no tabular figures, and a narrow 1 in a column
    // as wide as an 8 reads as a gap ("201 8"), so each column narrows to the digit it shows
    const m = document.createElement('span'), fs = parseFloat(getComputedStyle(el).fontSize) || 16;
    m.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;display:inline-block';
    el.appendChild(m);
    el.dw = [...'0123456789'].map((d) => { m.textContent = d; return m.offsetWidth / fs; });
    m.remove();
    $$('.od', el).forEach((o) => (o.style.width = el.dw[0] + 'em'));
    return $$('.od-col', el);
  }
  // roll one column to digit d (its window narrows or widens to fit)
  const toDigit = (el, c, d) => ({ col: { yPercent: -((10 + d) / 20) * 100 }, box: { width: el.dw[d] + 'em' } });
  function roll(t, el, at, dur = 0.6) {
    odometer(el).forEach((c, k, all) => {
      const d = +c.dataset.d, to = toDigit(el, c, d), when = at + (all.length - 1 - k) * 0.05;
      t.fromTo(c, { yPercent: 0 }, { ...to.col, duration: dur, ease: 'power3.out' }, when);
      t.fromTo(c.parentNode, { width: el.dw[0] + 'em' }, { ...to.box, duration: dur, ease: 'power3.out' }, when);
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
  const leave = (t, els, at, stagger = 0.035) => t.fromTo(els, { ...REST }, { ...ZOUT, duration: 0.4, ease: 'power2.in', stagger, immediateRender: false }, at);
  const scramble = (t, el, at, text, chars = 'lowerCase', dur = 0.4) => {
    if (!has('ScrambleTextPlugin')) return t.fromTo(el, { opacity: 0 }, { opacity: 1, duration: dur }, at);
    return t.fromTo(el, { scrambleText: { text: ' ' } }, { scrambleText: { text, chars, speed: 0.6 }, duration: dur, ease: 'none' }, at);
  };
  const show = (t, el, a, b) => { t.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01, ease: 'none' }, a); if (b != null) t.set(el, { autoAlpha: 0 }, b); };

  /* ------------------------------------------------------------------ the timeline */
  function build() {
    if (!gsap) return;
    if (tl) { tl.kill(); splits.forEach((s) => s.revert()); splits = []; }
    tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
    const SplitText = window.SplitText;
    const split = (el, type) => { if (!SplitText || !el) return null; const s = new SplitText(el, { type, mask: type === 'lines' ? 'lines' : undefined, linesClass: 'ln', charsClass: 'ch', wordsClass: 'wd' }); splits.push(s); return s; };
    hello(split); path(split); work(split); how(split); tools(split); next(split); contact(split);
    tl.set({}, {}, TOTAL + 0.01);
    last = -1;
  }

  /* 1 · hello: what I do, over the sea of cloud at first light */
  let heroWords = [];
  function hello(split) {
    const sec = $('.hello'), h1 = $('h1', sec), role = $('.role', sec), cue = $('.cue', sec);
    const sp = split(h1, 'words,chars');
    heroWords = sp ? sp.words : [h1];
    // at load: the letters turn in out of depth, a line at a time (played by the clock, not the scroll)
    if (!intro && !reduced && sp) {
      intro = gsap.timeline({ paused: true });
      intro.fromTo(sp.chars, { ...ZIN }, { ...REST, duration: 1.1, ease: 'power4.out', stagger: 0.022 }, 0.25);
      intro.fromTo([role, cue], { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.12 }, 1.0);
    }
    // on the scroll: the words come apart and drift off, each its own way, as you sink into the cloud
    tl.fromTo(heroWords, { ...REST }, {
      opacity: 0, x: (k) => (k % 2 ? 1 : -1) * (40 + k * 18), y: (k) => -60 - k * 14, rotateZ: (k) => (k % 2 ? 6 : -6), rotateX: 50, z: 120,
      duration: 0.5, ease: 'power2.in', stagger: 0.03, immediateRender: false
    }, 0.05);
    tl.fromTo([role, cue], { opacity: 1 }, { opacity: 0, y: -20, duration: 0.25, ease: 'none', immediateRender: false }, 0.02);
    // what I do
    const what = $('.what', sec), lines = $$('.what .ln', sec), rows = $$('.row', sec), counts = $$('.counts li', sec), mark = $('.what .mark', sec);
    show(tl, what, 0.6);
    rows.forEach((r) => tl.fromTo(r, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'none' }, 0.65));
    lines.forEach((l, k) => lineIn(tl, l, 0.85 + k * 0.28, 0));
    if (mark) tl.fromTo(mark, { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: 'power2.inOut' }, 1.6);
    tl.fromTo(counts, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.08 }, 1.65);
    counts.forEach((li, k) => roll(tl, $('b', li), 1.7 + k * 0.08, 0.5));
    leave(tl, [...lines, ...counts], 2.45, 0.025);
    rows.forEach((r) => tl.to(r, { opacity: 0, duration: 0.3, ease: 'none' }, 2.45));
    tl.set(what, { autoAlpha: 0 }, T.path.t0 - 0.4);
  }

  /* 2 · how I got here: a flag a year up the paper mountain */
  function path(split) {
    const sec = $('.path'), s = T.path, len = s.len;
    const head = $('.intro', sec), k = $('.kicker', head), h2 = $('h2', head), lede = $('.lede', head);
    show(tl, head, s.t0 - 0.35, s.t0 + 1.05);
    scramble(tl, k, s.t0 - 0.3, k.textContent);
    const hw = split(h2, 'words');
    tl.fromTo(hw ? hw.words : h2, { yPercent: 120, opacity: 0, rotate: 4 }, { yPercent: 0, opacity: 1, rotate: 0, duration: 0.4, stagger: 0.04, ease: 'power4.out' }, s.t0 - 0.25);
    const ll = split(lede, 'lines');
    lineIn(tl, ll ? ll.lines : lede, s.t0 + 0.05);
    leave(tl, [k, ...(hw ? hw.words : [h2]), ...(ll ? ll.lines : [lede])], s.t0 + 0.62, 0.012);
    // the year: one number that rolls from flag to flag
    const yrs = $$('.yr', sec), stamp = $('.stamp', sec), big = $('.stamp b', sec), track = $('.track', sec), fill = $('.track .fill', sec), ticks = $$('.track i:not(.fill)', sec);
    const at = (j) => s.t0 + len * (WALK[0] + WALK[1] / 5 * j);   // when the walk reaches flag j (places.js walk())
    show(tl, stamp, at(0) - 0.3, s.t1 + 0.2);
    show(tl, track, at(0) - 0.3, s.t1 + 0.2);
    tl.fromTo(track, { scaleY: 0 }, { scaleY: 1, duration: 0.3, ease: 'power3.out' }, at(0) - 0.3);
    tl.fromTo(fill, { scaleY: 0 }, { scaleY: 1, duration: at(yrs.length - 1) - at(0), ease: 'none' }, at(0));
    ticks.forEach((tk, j) => tl.fromTo(tk, { scale: 0.4, background: 'rgba(30,34,42,0.25)' }, { scale: 1, background: j === ticks.length - 1 ? '#ff6a2b' : '#1e222a', duration: 0.12 }, at(j) - 0.05));
    const cols = odometer(big);
    const years = (D.path || []).map((p) => p.y);
    years.forEach((y, j) => {
      [...y].forEach((d, c) => {
        if (!cols[c]) return;
        const to = toDigit(big, cols[c], +d), box = cols[c].parentNode;
        if (j === 0) { const w = at(0) - 0.3 + (3 - c) * 0.05; tl.fromTo(cols[c], { yPercent: 0 }, { ...to.col, duration: 0.5, ease: 'power3.out' }, w); tl.fromTo(box, { width: big.dw[0] + 'em' }, { ...to.box, duration: 0.5, ease: 'power3.out' }, w); }
        else { const w = at(j) - 0.32 + (3 - c) * 0.04; tl.to(cols[c], { ...to.col, duration: 0.45, ease: 'power3.inOut' }, w); tl.to(box, { ...to.box, duration: 0.45, ease: 'power3.inOut' }, w); }
      });
    });
    tl.fromTo(stamp, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.3 }, at(0) - 0.3);
    tl.to(stamp, { opacity: 0, y: -30, duration: 0.3, ease: 'power2.in' }, s.t1 - 0.1);
    yrs.forEach((li, j) => {
      const a = at(j) - 0.3, b = j < yrs.length - 1 ? at(j + 1) - 0.5 : s.t1 - 0.1;
      const r = $('.r', li), d = $('.d', li);
      show(tl, li, a, b + 0.3);
      scramble(tl, r, a, r.textContent, 'upperAndLowerCase', 0.3);
      const dl = split(d, 'lines');
      lineIn(tl, dl ? dl.lines : d, a + 0.06, 0.05);
      tl.fromTo([r, ...(dl ? dl.lines : [d])], { ...REST }, { opacity: 0, yPercent: -40, rotateX: 30, duration: 0.25, ease: 'power2.in', stagger: 0.02, immediateRender: false }, b);
    });
  }

  /* 3 · selected work: the cloud, then the seven, each with its own way in (from round 8) */
  function work(split) {
    const sec = $('.work'), s = T.work;
    const head = $('.intro', sec), k = $('.kicker', head), h2 = $('h2', head), lede = $('.lede', head);
    show(tl, head, s.t0 - 0.3, s.t1 + 0.6);
    scramble(tl, k, s.t0 - 0.25, k.textContent);
    const hc = split(h2, 'words,chars');
    tl.fromTo(hc ? hc.chars : h2, { ...ZIN }, { ...REST, duration: 0.55, stagger: 0.012, ease: 'power4.out' }, s.t0 - 0.2);
    const ll = split(lede, 'lines');
    lineIn(tl, ll ? ll.lines : lede, s.t0 + 0.2);
    leave(tl, [k, ...(hc ? hc.words : [h2]), ...(ll ? ll.lines : [lede])], s.t1 + 0.05, 0.02);
    const shade = $('.shade', sec), first = CH[0], lastCh = CH[CH.length - 1];
    tl.fromTo(shade, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: 'none' }, first.t0 - 0.6);
    tl.to(shade, { autoAlpha: 0, duration: 0.4, ease: 'none' }, lastCh.t1 + 0.1);
    chapters.forEach((ch, i) => {
      const sh = CH[i], st = sh.t0, out = sh.t1;
      const k = $('.f-k', ch), name = $('.f-n', ch), head = $('.f-h', ch), fits = $$('.f-fits li', ch), proof = $('.f-proof', ch), num = $('.f-proof b', ch), open = $('.f-open', ch), note = $('.f-note', ch);
      tl.fromTo(ch, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01, ease: 'none' }, st - 0.5);
      tl.fromTo(k, { opacity: 0 }, { opacity: 1, duration: 0.1, ease: 'none' }, st - 0.45);
      const ks = $('span', k);
      scramble(tl, ks, st - 0.45, ks.dataset.t || ks.textContent);
      nameIn(tl, ch, name, i, st - 0.4, split);
      const hl = split(head, 'lines');
      lineIn(tl, hl ? hl.lines : head, st - 0.05);
      tl.fromTo(fits, { opacity: 0, scale: 0.7, y: 12 }, { opacity: 1, scale: 1, y: 0, duration: 0.3, stagger: 0.06, ease: 'back.out(2)' }, st + 0.3);
      tl.fromTo(proof, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 }, st + 0.5);
      proofIn(tl, num, i, st + 0.53);
      if (open) tl.fromTo(open, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3 }, st + 0.75);
      if (note) {
        const at = st + (+note.dataset.q || 0.35) * sh.len;
        tl.fromTo(note, { opacity: 0, y: 10, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: 'back.out(2)' }, at);
        if (note.dataset.type && has('ScrambleTextPlugin')) tl.fromTo($('i', note), { scrambleText: { text: ' ' } }, { scrambleText: { text: note.dataset.type, chars: ' ', speed: 1, revealDelay: 0 }, duration: 0.4, ease: 'none' }, at + 0.1);
        tl.to(note, { opacity: 0, duration: 0.2 }, at + (+note.dataset.len || 0.5) * sh.len);
      }
      leave(tl, [k, name, head, ...fits, proof, open].filter(Boolean), out);
      tl.set(ch, { autoAlpha: 0 }, out + 0.5);
    });
  }
  // each name comes in its own way, after its project
  function nameIn(t, ch, el, i, at, split) {
    const sp = split(el, 'words,chars'), chars = sp ? sp.chars : [el];
    t.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.01 }, at);
    if (i === 0) t.fromTo(chars, { ...ZIN }, { ...REST, duration: 0.6, ease: 'power4.out', stagger: 0.035 }, at);
    else if (i === 1 && has('ScrambleTextPlugin')) { sp?.revert(); t.fromTo(el, { scrambleText: { text: ' ' } }, { scrambleText: { text: el.dataset.t, chars: '01<>/{}#', revealDelay: 0.15, speed: 0.8 }, duration: 0.6, ease: 'none' }, at); }
    else if (i === 2) t.fromTo(chars, { opacity: 0, x: (k) => ['-1.4em', '0em', '1.4em'][k % 3], y: (k) => ['0.7em', '-1em', '0.7em'][k % 3], rotate: (k) => [-25, 0, 25][k % 3] }, { opacity: 1, x: 0, y: 0, rotate: 0, duration: 0.6, ease: 'power3.out', stagger: 0.02 }, at);
    else if (i === 3) {
      const blk = $('.f-blk', ch);
      t.fromTo(blk, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.3, ease: 'power3.inOut' }, at);
      t.fromTo(chars, { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0 }, at + 0.3);
      t.fromTo(blk, { scaleX: 1, transformOrigin: '100% 50%' }, { scaleX: 0, duration: 0.3, ease: 'power3.inOut', immediateRender: false }, at + 0.3);
    } else if (i === 4) {
      const hl = $('.f-hl', ch);
      t.fromTo(hl, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power2.inOut' }, at);
      t.fromTo(chars, { opacity: 0.12 }, { opacity: 1, duration: 0.12, stagger: 0.07, ease: 'none' }, at + 0.05);
    } else if (i === 5) t.fromTo(chars, { opacity: 0, yPercent: (k) => Math.sin(k * 0.9) * 90 }, { opacity: 1, yPercent: 0, duration: 0.7, ease: 'elastic.out(1, 0.35)', stagger: 0.025 }, at);
    else {
      const noz = $('.f-noz', ch);
      t.fromTo(el, { clipPath: 'inset(100% -5% -5% -5%)' }, { clipPath: 'inset(0% -5% -5% -5%)', duration: 0.7, ease: 'steps(14)' }, at);
      t.fromTo(noz, { yPercent: 0, opacity: 1 }, { yPercent: -100, duration: 0.7, ease: 'steps(14)' }, at);
      t.to(noz, { opacity: 0, duration: 0.1 }, at + 0.7);
    }
  }
  function proofIn(t, el, i, at) {
    const txt = el.dataset.v || (el.dataset.v = el.textContent);
    if (i === 0 || i === 3) roll(t, el, at, 0.7);
    else if (i === 1 && has('ScrambleTextPlugin')) t.fromTo(el, { scrambleText: { text: ' ' } }, { scrambleText: { text: txt, chars: '0123456789', revealDelay: 0.2, speed: 0.6 }, duration: 0.6, ease: 'none' }, at);
    else if (i === 2) count(t, el, at, 0, 0.977, 3, '', 0.7);
    else if (i === 4) count(t, el, at, 0, 85, 0, '%', 0.6);
    else if (i === 5) count(t, el, at, 50, 0.17, 2, '¢', 0.8, 'expo.out');
    else count(t, el, at, 0, 21, 0, ' ms', 0.6);
  }

  /* 4 · how I work: three ways, on a belt that slides with the camera */
  let belt = null, ways = [];
  function how(split) {
    const sec = $('.how'), s = T.how, len = s.len;
    belt = $('.belt', sec); ways = $$('.way', sec);
    const k = $('.kicker', sec);
    show(tl, sec, s.t0 - 0.5, s.t1 + 0.55);
    scramble(tl, k, s.t0 - 0.4, k.textContent);
    ways.forEach((w, j) => {
      // piece j has a third of the scroll; its words come in as the camera arrives
      const a = s.t0 + len * j / 3 - (j ? len * 0.08 : 0.35);
      const i = $('.i', w), h3 = $('h3', w), big = $('.big b', w), unit = $('.big span', w), proof = $('.proof', w), link = $('a', w);
      tl.fromTo(i, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3 }, a);
      const hc = split(h3, 'words,chars');
      tl.fromTo(hc ? hc.chars : h3, { yPercent: 110, opacity: 0, rotateX: -60 }, { yPercent: 0, opacity: 1, rotateX: 0, duration: 0.45, stagger: 0.014, ease: 'power4.out' }, a + 0.05);
      if (/^\d/.test(big.textContent)) { if (big.textContent.includes('.')) count(tl, big, a + 0.3, 0, parseFloat(big.textContent), 1, '%', 0.6); else roll(tl, big, a + 0.3, 0.6); }
      else scramble(tl, big, a + 0.3, big.textContent, 'upperCase', 0.5);
      tl.fromTo(unit, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3 }, a + 0.42);
      const pl = split(proof, 'lines');
      lineIn(tl, pl ? pl.lines : proof, a + 0.5);
      if (link) tl.fromTo(link, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3 }, a + 0.62);
    });
  }

  /* 5 · the toolbox */
  function tools(split) {
    const sec = $('.tools'), s = T.tools;
    const k = $('.kicker', sec), h2 = $('h2', sec), lede = $('.lede', sec), groups = $$('.groups li', sec);
    show(tl, sec, s.t0 - 0.45, s.t1 + 0.5);
    scramble(tl, k, s.t0 - 0.4, k.textContent);
    const hc = split(h2, 'words,chars');
    tl.fromTo(hc ? hc.chars : h2, { opacity: 0, filter: 'blur(8px)', y: 20 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.4, stagger: 0.018 }, s.t0 - 0.3);
    const ll = split(lede, 'lines');
    lineIn(tl, ll ? ll.lines : lede, s.t0 - 0.05);
    // the shelves' counts, as the tags sort onto them
    tl.fromTo(groups, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.06 }, s.t0 + s.len * 0.55);
    groups.forEach((g, j) => roll(tl, $('b', g), s.t0 + s.len * 0.55 + j * 0.06, 0.5));
    leave(tl, [k, ...(hc ? hc.words : [h2]), ...(ll ? ll.lines : [lede]), ...groups], s.t1 - 0.05, 0.015);
  }

  /* 6 · what's next: the camp, looking up the way on */
  function next(split) {
    const sec = $('.next'), s = T.next;
    const k = $('.kicker', sec), h2 = $('h2', sec), items = $$('.soon li', sec);
    show(tl, sec, s.t0 - 0.45, s.t1 + 0.55);
    scramble(tl, k, s.t0 - 0.4, k.textContent);
    const hw = split(h2, 'words');
    tl.fromTo(hw ? hw.words : h2, { yPercent: 120, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: 'power4.out' }, s.t0 - 0.3);
    items.forEach((li, j) => {
      const a = s.t0 + 0.1 + j * 0.13;
      tl.fromTo(li, { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.3 }, a);
      tl.fromTo($('i', li), { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: 'power2.inOut' }, a + 0.05);
      scramble(tl, $('span', li), a + 0.05, $('span', li).textContent, 'lowerCase', 0.4);
    });
    leave(tl, [k, ...(hw ? hw.words : [h2]), ...items], s.t1 - 0.05, 0.02);
  }

  /* 7 · contact, at dusk */
  function contact(split) {
    const sec = $('.contact'), s = T.contact;
    const k = $('.kicker', sec), h2 = $('h2', sec), lede = $('.lede', sec), mail = $('.mail', sec), links = $$('.links a', sec), colo = $('.colophon', sec);
    show(tl, sec, s.t0 - 0.5);
    scramble(tl, k, s.t0 - 0.4, k.textContent, 'lowerCase', 0.4);
    const hc = split(h2, 'words,chars');
    tl.fromTo(hc ? hc.chars : h2, { yPercent: 100, opacity: 0, rotateX: -80 }, { yPercent: 0, opacity: 1, rotateX: 0, duration: 0.6, stagger: 0.03, ease: 'power4.out' }, s.t0 - 0.3);
    const ll = split(lede, 'lines');
    lineIn(tl, ll ? ll.lines : lede, s.t0 + 0.1);
    tl.fromTo(mail, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4 }, s.t0 + 0.25);
    tl.fromTo(links, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.06 }, s.t0 + 0.4);
    tl.fromTo(colo, { opacity: 0 }, { opacity: 1, duration: 0.3 }, s.t0 + 0.6);
  }

  /* ------------------------------------------------------------------ per frame */
  const rows = () => $$('.hello .row');
  let skew = 0, beltX = 0;
  function seek(tau, vel, introT) {
    if (intro && introT != null) intro.progress(clamp(introT * 1.15));
    if (tl && tau !== last) { tl.time(clamp(tau, 0, TOTAL)); last = tau; }
    // things that follow the scroll's speed
    skew = lerp(skew, clamp(-vel * 3.5, -10, 10), 0.18);
    const rs = rows();
    if (rs.length && tau < 2.6) rs.forEach((r, k) => { r.style.transform = `translate3d(${((k ? -1 : 1) * (tau * 22 + 10) - (k ? 30 : 0)).toFixed(2)}vw,0,0) skewX(${skew.toFixed(2)}deg)`; });
    // the belt slides one way per piece, with the camera's truck in places.js
    if (belt) {
      const s = T.how, q = clamp((tau - s.t0) / s.len);
      const x = q * 3, i = Math.min(2, Math.floor(x)), f = x - i;
      const pos = i + (i < 2 ? easeInOut(smooth(0.72, 1.0, f)) : 0);
      beltX = pos;
      belt.style.transform = `translate3d(${(-pos * 100).toFixed(3)}vw,0,0) skewX(${(skew * 0.6).toFixed(2)}deg)`;
      ways.forEach((w, j) => { const d = Math.abs(pos - j); w.style.opacity = (1 - smooth(0.25, 0.6, d)).toFixed(3); });
    }
  }

  /* ------------------------------------------------------------------ the toolbox's tag */
  const tip = document.getElementById('tip');
  const used = (name) => (D.projects || []).filter((p) => p.tier === 'flagship' && [...(p.stack || []), ...(p.uses || [])].includes(name)).map((p) => p.name);
  function tool(it) {
    if (!tip) return;
    if (!it) { tip.classList.remove('on'); return; }
    const u = used(it.name);
    $('b', tip).textContent = it.name;
    $('span', tip).textContent = `since ${it.year}`;
    $('i', tip).textContent = u.length ? `in ${u.slice(0, 3).join(', ')}${u.length > 3 ? ` +${u.length - 3}` : ''}` : (it.proof || '');
    tip.classList.add('on');
  }
  function toolAt(x, y) { if (tip) tip.style.transform = `translate3d(${Math.min(x + 18, W - 300)}px,${y + 18}px,0)`; }

  /* ------------------------------------------------------------------ the header's label */
  function label(el, name, num) {
    if (!el) return;
    const b = el.querySelector('b'), sp = el.querySelector('span');
    b.textContent = num;
    if (gsap && has('ScrambleTextPlugin') && !reduced) gsap.to(sp, { scrambleText: { text: name, chars: 'lowerCase', speed: 0.8 }, duration: 0.5, ease: 'none', overwrite: true });
    else sp.textContent = name;
  }

  // where to scroll to so an element is on screen (for keyboard focus)
  function at(el) {
    const ch = el.closest?.('.f-ch');
    if (ch) { const s = CH[chapters.indexOf(ch)]; return s.t0 + s.len * 0.6; }
    const w = el.closest?.('.way');
    if (w) { const j = ways.indexOf(w); return T.how.t0 + T.how.len * (j + 0.5) / 3; }
    const sec = el.closest?.('.part');
    if (!sec) return null;
    const id = sec.id, s = T[id];
    return s ? s.t0 + Math.min(0.4, s.len * 0.3) : null;
  }
  return {
    build, seek, tool, toolAt, label, at,
    size(w, h, n) { W = w; H = h; narrow = n; if (tl) { const t = last; build(); if (t >= 0) tl.time(t); } },
    bg: (id) => BG[id] || (id in T && T[id].ch != null ? '#14110e' : '#101317'),
    chapterName: (i) => chapters[i]?.dataset.name || ''
  };
}
