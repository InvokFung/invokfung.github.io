// The words over the scenes. Igloo draws them as MSDF glyphs in an orthographic WebGL pass; here
// they are DOM text in the same font, so they can be read aloud, selected and reached by
// keyboard. They sit on Igloo's grid (margins 125/90, 50/45 under 1600×800, 25 under 640) and
// arrive the way theirs do: a box flickers on, then each glyph runs through its neighbours and
// settles. The name is never part of that: it is set once and stays still.
import { gsap } from './lib.js';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>_-+=*#';
const touch = matchMedia('(pointer: coarse)').matches;

// Boxes are inline so a wrapped line gets a box per row; a <br> between two boxes ends a line.
function breakLines(parent) {
  [...parent.children].forEach((c) => {
    if (c.classList.contains('box') && c.nextElementSibling && c.nextElementSibling.classList.contains('box')) c.after(document.createElement('br'));
  });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// ─── the glyph scramble (their uShow2): one rAF loop for every line that is typing ─────────
class Typer {
  constructor(calm) {
    this.calm = calm;
    this.jobs = new Map();
    this.raf = 0;
    this.tick = this.tick.bind(this);
  }

  type(node, { delay = 0, duration = 0.4 } = {}) {
    const text = node.dataset.text ?? node.textContent;
    node.dataset.text = text;
    node.classList.remove('is-on');
    if (this.calm) { node.textContent = text; node.classList.add('is-on'); return; }
    node.textContent = ' ';
    this.jobs.set(node, { text, t0: performance.now() + delay * 1000, dur: Math.max(1, duration * 1000), on: false });
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  stop(node) {
    if (!this.jobs.has(node)) return;
    this.jobs.delete(node);
    node.textContent = node.dataset.text;
  }

  tick(now) {
    this.raf = 0;
    this.jobs.forEach((j, node) => {
      const t = (now - j.t0) / j.dur;
      if (t < 0) return;
      if (!j.on) { j.on = true; node.classList.add('is-on'); }
      if (t >= 1) { node.textContent = j.text; this.jobs.delete(node); return; }
      const n = Math.floor(t * j.text.length);
      let out = j.text.slice(0, n);
      // The next few glyphs flicker through their neighbours before they land.
      for (let k = n; k < Math.min(j.text.length, n + 5); k++) {
        const c = j.text[k];
        out += c === ' ' || c === '\n' ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      node.textContent = out;
    });
    if (this.jobs.size) this.raf = requestAnimationFrame(this.tick);
  }
}

export class UI {
  constructor({ profile, projects, links, career, path, calm }) {
    Object.assign(this, { profile, projects, links, career, path, calm });
    this.home = (window.PORTFOLIO && window.PORTFOLIO.home) || {};
    this.typer = new Typer(calm);
    this.root = document.getElementById('ui');
    this.loader = document.getElementById('loader');
    this.started = false;
    this.slotKey = null;
    this.hintGone = false;
    this.detailOpen = false;
    this.cache = {};
    this.build();
  }

  // ── everything is built once; update() only flips classes when something changes ──
  build() {
    const r = this.root;
    const year = new Date().getFullYear();

    // Skip links for keyboards (the scenes have no tab order of their own).
    const skip = el('nav', 'skip');
    skip.setAttribute('aria-label', 'Jump to');
    this.skipWork = el('button', 'skip__btn', 'Skip to the work');
    this.skipContact = el('button', 'skip__btn', 'Skip to contact');
    skip.append(this.skipWork);
    this.projectButtons = this.projects.map((p) => {
      const b = el('button', 'skip__btn', `Open ${p.name}`);
      skip.append(b);
      return b;
    });
    skip.append(this.skipContact);
    r.append(skip);

    // Their top-left logo is the IGLOO wordmark; this one is the name, outlined, and still.
    const logo = el('a', 'logo');
    logo.href = '/';
    logo.setAttribute('aria-label', `${this.profile.name}, home`);
    logo.innerHTML = `<svg viewBox="0 0 400 84" aria-hidden="true"><text x="1" y="66" textLength="398" lengthAdjust="spacingAndGlyphs">${this.profile.name.toUpperCase()}</text></svg>`;
    r.append(logo);
    this.logo = logo;

    // Top left under the logo: who this is (their copyright block).
    const left = el('div', 'block block--left');
    left.setAttribute('aria-hidden', 'true');
    this.leftTitle = el('p', 'box box--title', `// ${this.profile.role}`);
    this.leftName = el('p', 'box box--static', `© ${year} ${this.profile.name}.`);
    this.leftRights = el('p', 'box', 'All Rights Reserved.');
    left.append(this.leftTitle, el('div', 'block__lines'));
    left.lastChild.append(this.leftName, this.leftRights);
    breakLines(left.lastChild);
    r.append(left);
    this.left = left;

    // Top right: one slot, one thing at a time: the manifesto, a step of the path, the contact.
    this.slot = el('div', 'block block--right');
    this.slot.setAttribute('aria-live', 'polite');
    r.append(this.slot);

    // Bottom left: the hint, then sound.
    this.hint = el('p', 'hint box', touch ? 'Swipe up to discover.' : 'Scroll down to discover.');
    this.hint.setAttribute('aria-hidden', 'true');
    this.soundBtn = el('button', 'sound');
    this.soundBtn.setAttribute('aria-pressed', 'false');
    this.soundBtn.innerHTML = '<span class="sound__icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="sound__label box">Sound: <b>OFF</b></span>';
    r.append(this.hint, this.soundBtn);

    // In the column of blocks: the hint under the centred one.
    this.explore = el('p', 'explore box', touch ? 'Tap to explore' : 'Click to explore');
    this.explore.setAttribute('aria-hidden', 'true');
    r.append(this.explore);

    // The room: arrows either side of the sculpture, the links on a strip with Visit in the middle.
    this.prev = el('button', 'arrow arrow--prev');
    this.next = el('button', 'arrow arrow--next');
    this.prev.setAttribute('aria-label', 'Previous link');
    this.next.setAttribute('aria-label', 'Next link');
    const arrowSvg = (d) => `<svg viewBox="0 0 64 16" aria-hidden="true"><path d="${d}" /></svg>`;
    this.prev.innerHTML = arrowSvg('M63 8H2M2 8l7-6M2 8l7 6');
    this.next.innerHTML = arrowSvg('M1 8h61M62 8l-7-6M62 8l-7 6');
    const room = el('div', 'room');
    this.strip = el('div', 'room__strip');
    this.stripItems = this.links.map((l) => {
      const s = el('span', 'room__name box', l.title.toUpperCase());
      this.strip.append(s);
      return s;
    });
    this.visit = el('a', 'visit');
    this.visit.innerHTML = '<span class="visit__corners" aria-hidden="true"></span><span class="visit__label">Visit</span><span class="visit__title"></span>';
    this.visitNote = el('p', 'room__note box');
    room.append(this.strip, this.visit, this.visitNote);
    r.append(this.prev, this.next, room);
    this.room = room;

    // The project view: Close top right, the text in a 500px column (their zF).
    this.close = el('button', 'close');
    this.close.innerHTML = '<span class="close__box" aria-hidden="true"></span><span class="close__label">Close</span>';
    this.panel = el('section', 'detail');
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-labelledby', 'detail-name');
    this.panel.tabIndex = -1;
    this.column = el('div', 'detail__column');
    this.panel.append(this.column);
    r.append(this.panel, this.close);

    // The whole page as text, for screen readers and for anyone without WebGL.
    this.buildAbout();
  }

  buildAbout() {
    const a = document.getElementById('about');
    if (!a) return;
    const career = this.path.map((s) => `<li><b>${s.y}</b> ${s.r}. ${s.d}</li>`).join('');
    const work = this.projects.map((p) => `
      <li>
        <h3>${p.name} <small>${p.year} · ${p.kind}</small></h3>
        <p>${p.question}</p>
        <p>${p.metrics.map((m) => `${m[0]} ${m[1]}`).join(' · ')}</p>
        <p><a href="${p.links.live}">Try it live</a> · <a href="${p.links.source}">Source</a></p>
      </li>`).join('');
    const contact = this.links.map((l) => `<li><a href="${l.url}">${l.title}</a> ${l.note}</li>`).join('');
    a.innerHTML = `
      <h1>${this.profile.name}</h1>
      <p>${this.profile.role}. ${this.profile.education} graduate.</p>
      <p>${MANIFESTO}</p>
      <h2>Selected work</h2><ol>${work}</ol>
      <h2>Path</h2><ol>${career}</ol>
      <h2>Get in touch.</h2><p>${this.home.contact || ''}</p><ul>${contact}</ul>
      <p><a href="/">Back to the portfolio</a></p>`;
  }

  // ── the slot's contents ──
  slotContent(key) {
    if (this.cache[key]) return this.cache[key];
    const frag = el('div', 'slot');
    const add = (title, lines) => {
      frag.append(el('p', 'box box--title', title));
      const wrap = el('div', 'block__lines');
      lines.forEach((t) => wrap.append(el('p', 'box', t)));
      breakLines(wrap);
      frag.append(wrap);
    };
    if (key === 'manifesto') add('////// Manifesto', [MANIFESTO]);
    else if (key === 'contact') {
      const now = this.path[this.path.length - 1];
      add(`/// ${now.y}, so far`, [now.r]);
      add('////// Get in touch.', [this.home.contact || 'Write to me.']);
    } else if (key.startsWith('path')) {
      const s = this.pathFor(+key.slice(5));
      add(s.title, s.lines);
    }
    this.cache[key] = frag;
    return frag;
  }

  // -1 is the degree above the shaft; 0, 1, 2 are the rings, one year each.
  pathFor(step) {
    if (step < 0) {
      const d = this.path.find((s) => /engineering/i.test(s.r) && !/deployed/i.test(s.r)) || { r: this.profile.education, d: '' };
      return { title: '/// Degree', lines: [d.r, d.d].filter(Boolean) };
    }
    const [title, y] = this.career[step];
    const s = this.path.find((p) => +p.y === y) || { d: '' };
    return { title: `/// ${y}`, lines: [title, s.d].filter(Boolean) };
  }

  setSlot(key) {
    if (key === this.slotKey) return;
    const old = this.slot.firstChild;
    if (old) {
      old.querySelectorAll('.box').forEach((b) => this.typer.stop(b));
      old.remove();
    }
    this.slotKey = key;
    if (!key) return;
    const c = this.slotContent(key);
    this.slot.append(c);
    this.reveal([...c.querySelectorAll('.box')], 0.1);
  }

  // Each line: the box flickers on, then its glyphs settle (their show(): 0.4 s, 1.75× for text).
  reveal(boxes, start = 0, step = 0.2) {
    boxes.forEach((b, i) => {
      const long = !b.classList.contains('box--title');
      if (b.classList.contains('box--static')) {
        if (b._dc) b._dc.kill();
        b._dc = gsap.delayedCall(start + i * step, () => b.classList.add('is-on'));
        return;
      }
      this.typer.type(b, { delay: start + i * step, duration: 0.4 * (long ? 1.75 : 1) });
    });
  }

  hideBoxes(boxes) {
    boxes.forEach((b) => {
      if (b._dc) { b._dc.kill(); b._dc = null; }
      this.typer.stop(b);
      b.classList.remove('is-on');
    });
  }

  // ── loader ──
  progress(p) {
    if (!this.loader) return;
    const n = Math.round(Math.min(1, p) * 100);
    this.loader.querySelector('.loader__count').textContent = String(n).padStart(3, '0');
    this.loader.querySelector('.loader__bar i').style.transform = `scaleX(${Math.min(1, p)})`;
  }

  done() {
    if (!this.loader) return;
    this.loader.classList.add('is-done');
    setTimeout(() => this.loader.remove(), 900);
    document.documentElement.classList.add('is-loaded');
  }

  // The intro has built the igloo: the frame types in (their webgl_show_ui_intro).
  intro() {
    if (this.started) return;
    this.started = true;
    document.documentElement.classList.add('is-started');
    this.firstShow = true;
    this.reveal([this.hint], 0.6);
    this.reveal([this.soundBtn.querySelector('.sound__label')], 0.4);
  }

  noWebGL() {
    document.documentElement.classList.add('no-webgl');
    if (this.loader) this.loader.remove();
  }

  // The project view scrolls natively; the scenes take every other wheel.
  wantsWheel() {
    return this.detailOpen;
  }

  bind({ onOpen, onClose, onSound, onLink, onHover, onJump, linkState }) {
    this.linkState = linkState;
    this.skipWork.addEventListener('click', () => onJump('work'));
    this.skipContact.addEventListener('click', () => onJump('contact'));
    this.projectButtons.forEach((b, i) => b.addEventListener('click', () => onOpen(i)));
    this.close.addEventListener('click', () => onClose());
    this.soundBtn.addEventListener('click', () => {
      const on = onSound();
      this.soundBtn.setAttribute('aria-pressed', String(!!on));
      this.soundBtn.classList.toggle('is-playing', !!on);
      this.soundBtn.querySelector('b').textContent = on ? 'ON' : 'OFF';
    });
    this.prev.addEventListener('click', () => onLink(-1));
    this.next.addEventListener('click', () => onLink(1));
    this.root.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' && e.target.matches && e.target.matches('button, a')) onHover();
    }, true);
  }

  // ── the project view ──
  showDetail(p, i, delay = 0) {
    this.detailOpen = true;
    const c = this.column;
    c.textContent = '';
    const idx = String(i + 1).padStart(2, '0');
    const parts = [];
    const title = (t) => { const e = el('p', 'detail__title', t); parts.push(e); return e; };
    const text = (t, cls = 'detail__text') => { const e = el('p', cls, t); parts.push(e); return e; };
    const head = el('header', 'detail__head');
    const kicker = el('p', 'detail__title', `PROJECT_${idx}`);
    const name = el('h2', 'detail__name', p.name);
    name.id = 'detail-name';
    const meta = el('p', 'detail__text', `${p.year} · ${p.kind}`);
    head.append(kicker, name, meta);
    parts.push(kicker, name, meta);
    c.append(head);

    c.append(title('////// Summary'), text(p.pitch));
    c.append(title('/// Measured'));
    const ul = el('ul', 'detail__metrics');
    p.metrics.forEach(([v, l]) => {
      const li = el('li');
      const b = el('b', null, v), s = el('span', null, l);
      li.append(b, s);
      parts.push(b, s);
      ul.append(li);
    });
    c.append(ul);
    c.append(title('/// Visit'));
    const links = el('p', 'detail__links');
    [['Try it live', p.links.live], ['Source', p.links.source]].forEach(([t, href]) => {
      if (!href) return;
      const a = el('a', null, t);
      a.href = href;
      if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
      links.append(a);
      parts.push(a);
    });
    c.append(links);

    this.panel.scrollTop = 0;
    document.documentElement.classList.add('is-detail');
    this.panel.classList.add('is-open');
    this.close.classList.add('is-open');
    // Their stagger: long text takes 0.75 s and pushes the next by 0.3, short lines 0.25 and 0.1.
    let d = delay;
    parts.forEach((e) => {
      const long = e.textContent.length > 100;
      this.typer.type(e, { delay: d, duration: long ? 0.75 : 0.25 });
      d += long ? 0.3 : 0.1;
    });
    gsap.delayedCall(delay, () => this.panel.focus({ preventScroll: true }));
  }

  hideDetail() {
    this.detailOpen = false;
    this.column.querySelectorAll('[data-text]').forEach((e) => this.typer.stop(e));
    this.panel.classList.remove('is-open');
    this.close.classList.remove('is-open');
    document.documentElement.classList.remove('is-detail');
  }

  // ── per frame: only touch the DOM when something changed ──
  flag(name, on) {
    if (this.cache['f:' + name] === on) return false;
    this.cache['f:' + name] = on;
    return true;
  }

  update(s) {
    if (!this.started) return;
    const free = s.enabled && !s.detailOpen;

    // The cursor says what a click will do.
    const pointer = free && ((s.cubes.visible && s.cubes.hover >= 0) || s.entry.room);
    if (this.flag('pointer', pointer)) document.body.style.cursor = pointer ? 'pointer' : '';

    // The slot (their manifesto rule: on between 25% and 80% of the igloo, off under 15%).
    let key = null;
    if (!s.detailOpen) {
      if (s.scene === 'igloo' && s.iglooVisible) {
        const p = s.iglooProgress, cutting = s.cut > 0.02;
        if (this.slotKey === 'manifesto') key = p < 0.15 || cutting ? null : 'manifesto';
        else key = !cutting && p > 0.25 && p < 0.8 ? 'manifesto' : null;
      } else if (s.scene === 'entry' && s.cut < 0.02) {
        key = s.entry.step >= 3 ? 'contact' : `path:${s.entry.step}`;
      }
    }
    this.setSlot(key);

    // The left block belongs to the igloo, as on the original.
    const leftOn = !s.detailOpen && s.scene === 'igloo' && s.cut < 0.5;
    if (this.flag('left', leftOn)) {
      // Their first show waits 0.75 s for the left block; later ones come straight back.
      if (leftOn) this.reveal([this.leftTitle, this.leftName, this.leftRights], this.firstShow ? 0.75 : 0, this.firstShow ? 0.2 : 0.15);
      else this.hideBoxes([this.leftTitle, this.leftName, this.leftRights]);
      this.firstShow = false;
    }

    // The hint goes for good once the igloo has been scrolled a quarter of its height.
    if (!this.hintGone && (s.scene !== 'igloo' || Math.abs(s.iglooProgress - 0.495) > 0.175)) {
      this.hintGone = true;
      this.hideBoxes([this.hint]);
    }

    const exploreOn = free && s.cubes.visible && Math.abs(s.cubes.nearest.delta) < 0.02;
    if (this.flag('explore', exploreOn)) {
      if (exploreOn) this.reveal([this.explore], 0.15);
      else this.hideBoxes([this.explore]);
    }

    const roomOn = free && s.entry.room;
    if (this.flag('room', roomOn)) {
      document.documentElement.classList.toggle('is-room', roomOn);
      [this.prev, this.next].forEach((b) => { b.tabIndex = roomOn ? 0 : -1; });
      this.visit.tabIndex = roomOn ? 0 : -1;
      if (roomOn) this.reveal([this.visitNote, ...this.stripItems], 0.2, 0.08);
      else this.hideBoxes([this.visitNote, ...this.stripItems]);
    }
    if (this.flag('link', s.entry.link)) this.setLink(s.entry.link, roomOn);
  }

  // The strip slides so the current link sits in the Visit box; its neighbours fade either side.
  setLink(i, animate) {
    const l = this.links[i], n = this.links.length;
    this.visit.href = l.url;
    const external = /^https?:/.test(l.url);
    this.visit.target = external ? '_blank' : '';
    this.visit.rel = external ? 'noopener' : '';
    this.visit.setAttribute('aria-label', `Visit ${l.title}: ${l.note}`);
    this.visit.querySelector('.visit__title').textContent = l.title.toUpperCase();
    this.visitNote.dataset.text = l.note;
    if (animate) this.typer.type(this.visitNote, { duration: 0.4 });
    else this.visitNote.textContent = l.note;
    this.stripItems.forEach((s, k) => {
      let d = k - i;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      s.style.setProperty('--d', d);
      s.classList.toggle('is-current', d === 0);
    });
  }
}

const MANIFESTO = 'I build software next to the people who use it, ship it where they work, and stay until it holds.';
