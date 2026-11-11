// The home screen without buttons:
//   - the ring around the clock: seven curved sliders (volume and the six room sounds)
//   - taps on the picture: one tap starts or pauses, two taps on a side skip or restart
//   - music icons under the ring and a line to pick the scene: both lists are long, so you slide to pick
//   - the tour: a welcome card on a first visit, then six steps where a finger shows each move
// Everything here is on the screen itself. Nothing opens a panel.

import { bus, store, settings, saveSettings } from './bus.js';
import { timer, clockText } from './timer.js';
import { t, tn } from './i18n.js';
import { stage, VIBES } from './scenes/engine.js';
import { tracks, TRACKS } from './tracks.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Ring geometry, in viewBox units and degrees: seven arcs with a small gap between them.
const R = 88, N = 7, STEP = 360 / N, SWEEP = STEP - 8;
const pt = (deg, r) => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];
const arc = (a0, a1) => { const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };

const ICON = {
  volume: 'M4 9.5h3l4-3.5v12l-4-3.5H4z M15 9a4 4 0 0 1 0 6 M17.6 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9.5h3l4-3.5v12l-4-3.5H4z M15.5 9.5l5 5 M20.5 9.5l-5 5',
  rain: 'M7.5 14.5h9a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.7 1.1 3 3 0 0 0 .2 5.86z M9 17.5v2 M12.5 17.5v2 M16 17.5v2',
  fire: 'M12 3.5c.6 3 4.8 4.8 4.8 9.6a4.8 4.8 0 0 1-9.6 0c0-1.9.9-3.2 2-4.2.1 1.7.8 2.7 1.8 2.9-.3-2.9-.6-5.4 1-8.3z',
  vinyl: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  wind: 'M4 9h9.5a2.5 2.5 0 1 0-2.5-2.5 M4 13h13a2.5 2.5 0 1 1-2.5 2.5 M4 17h6',
  forest: 'M12 3.5l5 7h-2.6l4 5.5H5.6l4-5.5H7z M12 16v4.5',
  ocean: 'M3.5 9c2 0 2-1.5 4.2-1.5S9.8 9 12 9s2.2-1.5 4.3-1.5S18.5 9 20.5 9 M3.5 14c2 0 2-1.5 4.2-1.5S9.8 14 12 14s2.2-1.5 4.3-1.5 2.2 1.5 4.2 1.5 M3.5 19c2 0 2-1.5 4.2-1.5S9.8 19 12 19s2.2-1.5 4.3-1.5 2.2 1.5 4.2 1.5',
  off: 'M9 17V6.5l9-2V15 M9 17a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0z M18 15a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0z M4 4l16 16',
  piano: 'M4.5 6h15v12h-15z M9.5 6v7 M14.5 6v7 M9.5 13v5 M14.5 13v5',
  beat: 'M8.5 19.5l2.2-14h2.6l2.2 14z M12 14.5l5.5-8',
  tracks: 'M4.5 7h9 M4.5 12h9 M4.5 17h5 M17.5 16.5V7.5l2.5 1.5 M17.5 16.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  youtube: 'M5.5 6.5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M10.3 9.6l4.2 2.4-4.2 2.4z',
  drawn: 'M14.5 4.5l5 5L9 20H4v-5z M12.5 6.5l5 5',
  video: 'M4.5 7h10.5v10H4.5z M15 10.5l4.5-2.5v8L15 13.5'
};
const glyph = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[name]}"/></svg>`;

export function initRing({ sound }) {
  const face = $('face'), dial = $('dial'), say = $('ringSay');
  const vibe = () => VIBES[settings.vibe] || Object.values(VIBES)[0];
  const mix = () => ({ ...vibe().mix, ...(settings.layers[vibe().id] || {}) });
  const layers = (sound.LAYERS.length ? sound.LAYERS : ['rain', 'fire', 'vinyl', 'wind', 'forest', 'ocean']).slice(0, N - 1);
  const keys = ['volume', ...layers];
  const level = k => (k === 'volume' ? (sound.muted ? 0 : settings.volume) : mix()[k] || 0);
  const nameOf = k => (k === 'volume' ? t('pop.sound.volume') : tn('layer', k, k));
  const before = {};                                               // a sound's level before it was switched off

  // ---------- the ring ----------
  dial.setAttribute('viewBox', '-108 -108 216 216');
  // A soft dark disc inside the ring, so the words read on a busy or bright picture (city lights, a real video).
  dial.innerHTML = `<defs><radialGradient id="dialDim"><stop offset="0" style="stop-color:var(--shade);stop-opacity:.4"/><stop offset=".7" style="stop-color:var(--shade);stop-opacity:.3"/><stop offset="1" style="stop-color:var(--shade);stop-opacity:0"/></radialGradient></defs>`
    + `<circle r="${R - 3}" fill="url(#dialDim)"/><circle class="dial-shade" r="${R}"/>` + keys.map((k, i) => {
    const mid = -90 + i * STEP, d = arc(mid - SWEEP / 2, mid + SWEEP / 2), [ix, iy] = pt(mid, R + 12.5), [ox, oy] = pt(mid, 8);   // the tap area sits a little outward, clear of the arc
    return `<g class="seg" data-k="${k}" data-mid="${mid}">
      <path class="seg-track" d="${d}"/><path class="seg-fill" d="${d}" pathLength="100"/>
      <path class="seg-hit" d="${d}" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(nameOf(k))}"/>
      <g class="seg-icon" role="button" tabindex="0" aria-label="${esc(nameOf(k))}" transform="translate(${ix.toFixed(2)} ${iy.toFixed(2)}) scale(.44) translate(-12 -12)"><rect x="${(ox - 14).toFixed(1)}" y="${(oy - 14).toFixed(1)}" width="52" height="52"/><path d="${ICON[k] || ICON.rain}"/></g>
    </g>`;
  }).join('');

  let sayTimer = 0;
  // Says what is being changed, in the place of the mode line: "Rain · 55".
  function tell(k, hold) {
    say.textContent = k === 'volume' && sound.muted ? `${nameOf(k)} · ${t('pop.sound.off')}` : `${nameOf(k)} · ${Math.round(level(k) * 100)}`;
    face.classList.add('saying');
    clearTimeout(sayTimer);
    if (!hold) sayTimer = setTimeout(() => face.classList.remove('saying'), 1300);
  }
  function draw() {
    for (const g of dial.querySelectorAll('.seg')) {
      const k = g.dataset.k, v = level(k);
      g.querySelector('.seg-fill').style.strokeDasharray = `${(v * 100).toFixed(1)} 300`;
      g.classList.toggle('off', v < 0.01);
      g.querySelector('.seg-hit').setAttribute('aria-valuenow', Math.round(v * 100));
      if (k === 'volume') g.querySelector('.seg-icon path').setAttribute('d', ICON[sound.muted ? 'mute' : 'volume']);
    }
  }
  function setLevel(k, v) {
    v = Math.round(clamp(v, 0, 1) * 100) / 100;
    if (k === 'volume') {
      if (sound.muted) { sound.mute(false); bus.emit('sound:mute', false); }
      saveSettings({ volume: v });
    } else {
      sound.setLayer(k, v);
      saveSettings({ layers: { ...settings.layers, [vibe().id]: { ...mix(), [k]: v } } });
    }
    tell(k);
  }
  function toggle(k) {
    if (k === 'volume') { sound.mute(!sound.muted); bus.emit('sound:mute', sound.muted); draw(); return tell(k); }
    const v = level(k);
    if (v > 0.01) { before[k] = v; setLevel(k, 0); } else setLevel(k, before[k] || 0.5);
  }
  // Where on its arc the pointer is, 0..1. Close to either end snaps to the end.
  function along(g, e) {
    const r = dial.getBoundingClientRect();
    const ang = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
    const off = ((ang - +g.dataset.mid + 540) % 360) - 180, v = clamp((off + SWEEP / 2) / SWEEP, 0, 1);
    return v < 0.04 ? 0 : v > 0.96 ? 1 : v;
  }
  let drag = null;
  dial.addEventListener('pointerdown', e => {
    const hit = e.target.closest('.seg-hit');
    if (e.button || !hit) return;
    e.preventDefault();
    drag = hit.parentNode;
    hit.setPointerCapture(e.pointerId);
    setLevel(drag.dataset.k, along(drag, e));
  });
  dial.addEventListener('pointermove', e => { if (drag) setLevel(drag.dataset.k, along(drag, e)); });
  for (const ev of ['pointerup', 'pointercancel']) dial.addEventListener(ev, () => { drag = null; });
  dial.addEventListener('click', e => { const icon = e.target.closest('.seg-icon'); if (icon) toggle(icon.parentNode.dataset.k); });
  dial.addEventListener('pointerover', e => { const g = e.target.closest('.seg'); if (g && e.pointerType !== 'touch') tell(g.dataset.k, true); });
  dial.addEventListener('pointerout', () => { if (!drag) { clearTimeout(sayTimer); sayTimer = setTimeout(() => face.classList.remove('saying'), 350); } });
  dial.addEventListener('keydown', e => {
    const g = e.target.closest('.seg');
    if (!g) return;
    const k = g.dataset.k;
    if (e.target.closest('.seg-icon')) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle(k); }
      return;
    }
    const step = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 }[e.key];
    if (step) { e.preventDefault(); e.stopPropagation(); setLevel(k, level(k) + step); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); e.stopPropagation(); setLevel(k, e.key === 'End' ? 1 : 0); }
  });

  // ---------- slide to pick ----------
  // One short line you slide along, with a small arrow at each end to step by one. It is a real range
  // input, so keys and touch work by themselves. While you slide only the name changes; the pick is made
  // when you let go, so a slide past twenty scenes does not load twenty scenes.
  const CHEV = { '-1': 'M14.5 6.5L9 12l5.5 5.5', 1: 'M9.5 6.5L15 12l-5.5 5.5' };
  const fillOf = r => r.style.setProperty('--v', (+r.max ? (+r.value / +r.max) * 100 : 0) + '%');
  const pickHTML = (label, prev, next, n, i, cut = '') => `<span class="pick">`
    + `<button class="pick-step" data-step="-1" aria-label="${esc(prev)}" data-tip="${esc(prev)}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${CHEV[-1]}"/></svg></button>`
    + `<span class="pick-line">${cut}<input type="range" min="0" max="${Math.max(0, n - 1)}" step="1" value="${i}" aria-label="${esc(label)}" style="--v:${n > 1 ? (i / (n - 1)) * 100 : 0}%"></span>`
    + `<button class="pick-step" data-step="1" aria-label="${esc(next)}" data-tip="${esc(next)}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${CHEV[1]}"/></svg></button></span>`;
  // say(i) shows the name of stop i; go(i) makes the pick.
  function wirePick(box, say, go) {
    box.addEventListener('input', e => { if (e.target.type === 'range') { fillOf(e.target); say(+e.target.value); } });
    box.addEventListener('change', e => { if (e.target.type === 'range') go(+e.target.value); });
    box.addEventListener('click', e => {
      const b = e.target.closest('.pick-step');
      if (!b) return;
      const r = b.parentNode.querySelector('input'), n = +r.max + 1, i = (+r.value + +b.dataset.step + n) % n;
      r.value = i;
      fillOf(r);
      say(i);
      go(i);
      if (e.detail) b.blur();
    });
  }

  // ---------- music: five small icons under the ring; with tracks on, a line to pick the track ----------
  const tunes = $('tunes');
  const source = () => (!settings.music ? 'off' : settings.musicStyle === 'tracks' || settings.musicStyle === 'youtube' ? settings.musicStyle : settings.musicStyle || vibe().music);
  const SOURCES = [['off', () => `${t('pop.sound.music')} · ${t('pop.sound.off')}`], ['piano', () => t('pop.sound.piano')], ['beat', () => t('pop.sound.beat')], ['tracks', () => t('pop.sound.tracks')], ['youtube', () => 'YouTube']];
  const needLink = () => bus.emit('toast', { text: t('ring.pasteYt'), ms: 6000 });
  const trackSay = i => `${i + 1} / ${TRACKS.length} · ${TRACKS[i].title} — ${TRACKS[i].by}`;
  // What the line under the icons picks from, for each music source that has a list.
  const kitList = (style, key) => ({
    n: () => sound.music.KITS[style].length,
    at: () => Math.max(0, sound.music.KITS[style].indexOf(settings[key])),
    say: i => `${i + 1} / ${sound.music.KITS[style].length} · ${tn('kit.' + style, sound.music.KITS[style][i], sound.music.KITS[style][i])}`,
    go: i => saveSettings({ [key]: sound.music.KITS[style][i] }),
    label: () => t('pop.sound.' + style), prev: () => t('pick.prev'), next: () => t('pick.next')
  });
  const LISTS = {
    tracks: { n: () => TRACKS.length, at: () => tracks.index(), say: trackSay, go: i => tracks.select(i, true), credit: i => TRACKS[i], label: () => t('pop.sound.tracks'), prev: () => t('tracks.prev'), next: () => t('tracks.next') },
    beat: kitList('beat', 'beatKit'),
    piano: kitList('piano', 'pianoKit')
  };
  const creditOf = tr => (tr.page ? ` href="${esc(tr.page)}" target="_blank" rel="noopener" data-tip="${esc([tr.license, t('tracks.source')].filter(Boolean).join(' · '))}"` : '');
  const sayHTML = (L, i) => `<a class="tunes-say"${L.credit ? creditOf(L.credit(i)) : ''}>${esc(L.say(i))}</a>`;   // a track's name is also its credit: it links to the track's own page
  const sayTrack = i => { const el = tunes.querySelector('.tunes-say'), L = LISTS[tunes.dataset.src]; if (el && L) el.outerHTML = sayHTML(L, i); };
  function drawTunes() {
    const cur = source(), r = tunes.querySelector('.pick input'), L = LISTS[cur];
    if (r && L && tunes.dataset.src === cur) {                        // only the pick moved: keep the line (a finger may be on it)
      r.value = L.at();
      fillOf(r);
      return sayTrack(L.at());
    }
    tunes.dataset.src = cur;
    tunes.innerHTML = '<span class="tunes-row">'
      + SOURCES.map(([id, name]) => `<button data-src="${id}" aria-pressed="${id === cur}" data-tip="${esc(name())}" aria-label="${esc(name())}">${glyph(id)}</button>`).join('')
      + (L ? pickHTML(L.label(), L.prev(), L.next(), L.n(), L.at()) : '') + '</span>'
      + (L ? sayHTML(L, L.at()) : '');
  }
  tunes.addEventListener('click', e => {
    const b = e.target.closest('button[data-src]');
    if (!b) return;
    const id = b.dataset.src;
    if (id === 'youtube' && !settings.ytUrl) needLink();
    saveSettings(id === 'off' ? { music: false } : { music: true, musicStyle: id });
    if (e.detail) b.blur();
  });
  wirePick(tunes, sayTrack, i => LISTS[tunes.dataset.src]?.go(i));

  // ---------- scenes: one line for every scene of every vibe, and the three kinds of scene ----------
  const scenes = $('scenes');
  let stops = [], sceneSayTimer = 0;
  function saySceneAt(i) {                                           // "Cozy 2 / 7 · Fireplace", next to the line
    const s = stops[i];
    if (!s) return;
    scenes.querySelector('.pick-say').textContent = `${tn('vibe', s.v.id, s.v.name)} ${s.i + 1} / ${stage.items(s.v.id).length} · ${tn(s.sc.url ? 'clip' : 'scene', s.sc.id, s.sc.name)}`;
    scenes.classList.add('saying');
    clearTimeout(sceneSayTimer);
    sceneSayTimer = setTimeout(() => scenes.classList.remove('saying'), 1800);
  }
  function drawScenes() {
    const info = stage.info();
    if (!info) return;
    const vibes = Object.values(VIBES);
    stops = vibes.flatMap(v => stage.items(v.id).map((sc, i) => ({ v, i, sc })));
    const at = Math.max(0, stops.findIndex(s => s.v.id === info.vibe.id && s.i === info.index)), key = stops.length + settings.sceneKind;
    const r = scenes.querySelector('.pick input');
    if (r && scenes.dataset.key === key) { r.value = at; return fillOf(r); }   // only the scene moved: keep the line
    scenes.dataset.key = key;
    let cut = '', sum = 0;                                            // a small mark where one vibe ends and the next begins
    for (const v of vibes.slice(0, -1)) { sum += stage.items(v.id).length; cut += `<i class="pick-cut" style="left:${((sum - 0.5) / Math.max(1, stops.length - 1)) * 100}%"></i>`; }
    scenes.innerHTML = pickHTML(t('cmd.group.scene'), t('action.prev'), t('action.next'), stops.length, at, cut)
      + '<span class="pick-say" aria-live="polite"></span>'
      + '<span class="scene-kinds">' + [['drawn', t('pop.vibe.drawn')], ['video', t('pop.vibe.video')], ['youtube', 'YouTube']].map(([id, name]) =>
        `<button data-kind="${id}" aria-pressed="${settings.sceneKind === id}" data-tip="${esc(name)}" aria-label="${esc(name)}">${glyph(id)}</button>`).join('') + '</span>';
  }
  scenes.addEventListener('click', e => {
    const b = e.target.closest('button[data-kind]');
    if (!b) return;
    if (b.dataset.kind === 'youtube' && !settings.ytUrl) needLink();
    saveSettings({ sceneKind: b.dataset.kind });
    if (e.detail) b.blur();
  });
  wirePick(scenes, saySceneAt, i => {
    const s = stops[i];
    if (!s) return;
    if (settings.sceneKind === 'youtube') saveSettings({ sceneKind: 'drawn' });   // a picked scene leaves the YouTube picture, or the pick would change nothing you can see
    if (s.v.id === settings.vibe) stage.goScene(s.i); else saveSettings({ vibe: s.v.id, scene: s.i });
  });

  // ---------- taps on the picture ----------
  // One tap: start or pause. Two quick taps: the right side goes to the next block, the left side
  // starts this block again (the way video players seek). Holding the time opens the time row.
  const stateLine = $('stateLine'), fx = $('tapFx'), tour = $('tour');
  function drawState() {
    const s = timer.state.status;
    stateLine.textContent = s === 'idle' ? t('state.idle') : s === 'paused' ? t('state.paused') : '';
  }
  function ripple(x, y) {
    const i = document.createElement('i');
    i.style.left = x + 'px';
    i.style.top = y + 'px';
    fx.append(i);
    setTimeout(() => i.remove(), 900);
  }
  function sweep(side) {                                            // two quick taps: a soft light from that side
    const b = document.createElement('b');
    b.className = side;
    fx.append(b);
    setTimeout(() => b.remove(), 900);
  }
  const busy = () => ['pop', 'strip', 'menu', 'cmd', 'ring'].some(id => !$(id).hidden) || !$('digitsEdit').hidden || !tour.hidden;
  let down = null, lastTap = null, single = 0;
  addEventListener('pointerdown', e => {                            // capture: read what is open before anything closes it
    down = null;
    if (e.button || busy()) return;
    if (e.target.closest('button:not(#digits), input, a, .pop, .strip, .menu, .cmd, .ring, .dock, .plan, .scenes, .tunes, .top, .seg')) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    if (e.target.closest('#digits')) down.hold = setTimeout(() => { down = null; bus.emit('ui:time'); }, 480);
  }, true);
  addEventListener('pointermove', e => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { clearTimeout(down.hold); down = null; }   // a swipe, not a tap
  });
  addEventListener('pointerup', e => {
    if (!down || down.id !== e.pointerId) return;
    clearTimeout(down.hold);
    const { x, y } = down, now = performance.now();
    down = null;
    ripple(x, y);
    if (lastTap && now - lastTap.at < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 60) {
      clearTimeout(single);
      lastTap = null;
      const side = x > innerWidth / 2 ? 'right' : 'left';
      sweep(side);
      if (side === 'right') timer.skip(); else timer.reset();
      return;
    }
    lastTap = { x, y, at: now };
    single = setTimeout(() => { lastTap = null; timer.toggle(); }, 250);
  });

  // ---------- the tour ----------
  // First visit: a welcome card (start, or not now). Then six steps, each with Skip and Next.
  // On each step a finger shows the move, with the very same ripple and side light a real tap gives.
  // The finger only draws: nothing it does changes the timer, the sound or the scene.
  const STEPS = [
    { key: 'tour.tap', demo: demoTap },
    { key: 'tour.sides', demo: demoSides },
    { key: 'tour.ring', sel: '#dial', demo: demoRing },
    { key: 'tour.time', sel: '#digits', demo: demoHold },
    { key: 'tour.scenes', sel: '#scenes', demo: demoScenes },
    { key: 'tour.type', sel: '[data-act="cmd"]' }
  ];
  tour.innerHTML = `<i class="tour-spot"></i><i class="tour-finger"></i><span class="tour-note"></span>
    <div class="tour-card glass">
      <div class="tour-hello">
        <svg class="tour-mark" viewBox="0 0 64 64" aria-hidden="true"><circle class="rim" cx="32" cy="32" r="24"/><circle class="wave" cx="32" cy="32" r="24"/><circle class="dot" cx="32" cy="32" r="5"/></svg>
        <h2>${esc(t('tour.hello.title'))}</h2>
        <p>${esc(t('tour.hello.body'))}</p>
        <div class="tour-go"><button class="tour-later">${esc(t('tour.later'))}</button><button class="tour-start">${esc(t('tour.start'))}</button></div>
        <small>${esc(t('tour.hello.again'))}</small>
      </div>
      <div class="tour-step">
        <small class="tour-count"></small>
        <p></p>
        <div class="tour-foot">
          <button class="tour-skip">${esc(t('tour.skip'))}</button>
          <span class="tour-dots"></span>
          <span class="tour-nav"><button class="tour-back" aria-label="${esc(t('tour.back'))}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5L9 12l5.5 5.5"/></svg></button><button class="tour-next"></button></span>
        </div>
      </div>
    </div>`;
  const spot = tour.querySelector('.tour-spot'), card = tour.querySelector('.tour-card'), finger = tour.querySelector('.tour-finger'), note = tour.querySelector('.tour-note');
  const help = $('tourBtn');
  let step = -1;                                                    // -1 is the welcome card
  let run = 0, undo = [], at = [0, 0];                              // the demo now playing, what it must put back, where the finger is

  // ---- the finger ----
  const wait = (ms, id) => new Promise((ok, stop) => setTimeout(() => (id === run ? ok() : stop()), ms));   // stops quietly once another step took over
  function glide(x, y, ms, id) {
    at = [x, y];
    finger.style.transitionDuration = ms + 'ms';
    finger.style.transform = `translate(${x}px, ${y}px)`;
    finger.classList.add('on');
    return wait(ms, id);
  }
  async function press(id) { finger.classList.add('down'); await wait(150, id); finger.classList.remove('down'); await wait(110, id); }
  const tap = id => { ripple(...at); return press(id); };          // a tap on the picture: the real ripple
  function did(key) {                                               // a small label by the finger: what the move just did
    note.textContent = t(key);
    Object.assign(note.style, { left: clamp(at[0], 96, innerWidth - 96) + 'px', top: at[1] + (at[1] < innerHeight * 0.6 ? 34 : -64) + 'px' });
    note.classList.remove('on');
    void note.offsetWidth;
    note.classList.add('on');
  }
  function tidy() {
    for (const back of undo.splice(0)) back();
    finger.classList.remove('down', 'hold');
    note.classList.remove('on');
  }
  async function play(demo) {
    const id = ++run;
    tidy();
    finger.classList.remove('on');
    if (!demo) return;
    try {
      await wait(700, id);
      for (;;) { await demo(id); tidy(); await wait(800, id); }
    } catch (err) { if (err) throw err; }
  }

  // ---- what the finger shows on each step ----
  const clockHTML = ms => [...clockText(ms)].map(c => (c === ':' ? '<i>:</i>' : `<span>${c}</span>`)).join('');   // the way ui.js writes the time
  async function demoTap(id) {                                      // one tap starts, one more pauses
    const d = $('digits'), r = d.getBoundingClientRect(), on = timer.state.status === 'running', html = d.innerHTML;
    if (!on) undo.push(() => { d.innerHTML = html; });
    undo.push(drawState);
    await glide(r.left + r.width * 0.72, r.top + r.height * 0.64, 800, id);
    await tap(id);
    did(on ? 'tour.did.pause' : 'tour.did.start');
    stateLine.textContent = on ? t('state.paused') : '';
    for (let i = 1; i <= 3; i++) { await wait(650, id); if (!on) d.innerHTML = clockHTML(timer.state.remainingMs - i * 1000); }   // the time counts down
    await wait(300, id);
    await tap(id);
    did(on ? 'tour.did.start' : 'tour.did.pause');
    stateLine.textContent = on ? '' : t('state.paused');
    await wait(1900, id);
  }
  async function demoSides(id) {                                    // two quick taps: right is next, left starts again
    const y = Math.max(120, Math.min(innerHeight * 0.42, card.getBoundingClientRect().top - 100));
    for (const [side, key] of [['right', 'tour.did.next'], ['left', 'tour.did.again']]) {
      await glide(innerWidth * (side === 'right' ? 0.84 : 0.16), y, 850, id);
      await tap(id);
      await tap(id);
      sweep(side);
      did(key);
      await wait(1900, id);
    }
  }
  async function demoRing(id) {                                     // slide along an arc, then tap its icon off and on
    const g = dial.querySelector('.seg[data-k="rain"]') || dial.querySelectorAll('.seg')[1], k = g.dataset.k, fill = g.querySelector('.seg-fill');
    const r = dial.getBoundingClientRect(), u = r.width / 216, mid = +g.dataset.mid, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const on = (deg, rad) => { const [x, y] = pt(deg, rad * u); return [cx + x, cy + y]; };
    const set = v => {
      fill.style.strokeDasharray = `${(v * 100).toFixed(1)} 300`;
      g.classList.toggle('off', v < 0.01);
      say.textContent = `${nameOf(k)} · ${Math.round(v * 100)}`;
      face.classList.add('saying');
    };
    undo.push(() => { draw(); face.classList.remove('saying'); });
    await glide(...on(mid - SWEEP / 2 + 0.2 * SWEEP, R), 800, id);
    finger.classList.add('down');
    for (let v = 0.2; v < 0.87; v += 0.055) { set(v); await glide(...on(mid - SWEEP / 2 + v * SWEEP, R), 85, id); }
    finger.classList.remove('down');
    await wait(900, id);
    await glide(...on(mid, R + 12.5), 600, id);
    await press(id);
    set(0);
    await wait(1100, id);
    await press(id);
    set(0.85);
    await wait(1400, id);
  }
  async function demoHold(id) {                                     // keep a finger on the time
    const r = $('digits').getBoundingClientRect();
    await glide(r.left + r.width / 2, r.top + r.height * 0.6, 800, id);
    finger.classList.add('down', 'hold');
    await wait(900, id);
    finger.classList.remove('down', 'hold');
    did('tour.did.time');
    await wait(1900, id);
  }
  async function demoScenes(id) {                                   // a swipe across the picture, then a slide along the scene line
    const x = innerWidth * 0.64, y = innerHeight * 0.5;
    await glide(x, y, 800, id);
    finger.classList.add('down');
    await glide(x - Math.min(220, innerWidth * 0.36), y, 520, id);
    finger.classList.remove('down');
    did('tour.did.scene');
    await wait(1700, id);
    const r = scenes.querySelector('.pick input');
    if (!r || +r.max < 1) return;
    const from = +r.value, hop = Math.max(1, Math.ceil(+r.max / 3)), to = from + hop <= +r.max ? from + hop : from - hop;
    const spot = i => {                                              // where the thumb is for stop i (the line may lie flat or stand up)
      const b = r.getBoundingClientRect(), f = i / +r.max, pad = 8;
      return b.width >= b.height ? [b.left + pad + f * (b.width - 2 * pad), b.top + b.height / 2] : [b.left + b.width / 2, b.top + pad + f * (b.height - 2 * pad)];
    };
    undo.push(() => { r.value = from; fillOf(r); scenes.classList.remove('saying'); });
    await glide(...spot(from), 800, id);
    finger.classList.add('down');
    for (let n = 1; n <= 6; n++) {
      const i = Math.round(from + ((to - from) * n) / 6);
      r.value = i;
      fillOf(r);
      saySceneAt(i);
      await glide(...spot(i), 120, id);
    }
    finger.classList.remove('down');
    await wait(1600, id);
  }

  // ---- the card ----
  function show() {
    const hello = step < 0, s = STEPS[step] || {}, el = s.sel && document.querySelector(s.sel), r = el && el.getBoundingClientRect(), found = !!r && r.width > 0;
    tour.classList.toggle('hello', hello);
    tour.classList.toggle('wide', !hello && !found);                // nothing to point at: the whole picture stays in view
    const box = found ? { left: r.left - 10, top: r.top - 10, width: r.width + 20, height: r.height + 20 } : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    Object.assign(spot.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px', borderRadius: s.sel === '#dial' ? '50%' : '22px' });
    card.classList.toggle('top', !hello && found && r.top + r.height / 2 > innerHeight * 0.62);   // keep the card off what it points at
    if (!hello) {
      card.querySelector('.tour-count').textContent = `${step + 1} / ${STEPS.length}`;
      card.querySelector('.tour-step p').textContent = t(s.key);
      card.querySelector('.tour-dots').innerHTML = STEPS.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('');
      card.querySelector('.tour-back').hidden = step === 0;
      card.querySelector('.tour-next').textContent = t(step === STEPS.length - 1 ? 'tour.done' : 'tour.next');
    }
    play(hello ? null : s.demo);
  }
  function openTour(hello) {
    step = hello ? -1 : 0;
    tour.hidden = false;
    document.body.classList.add('touring');
    document.body.classList.remove('quiet');
    show();
  }
  function closeTour() {
    play(null);
    tour.hidden = true;
    document.body.classList.remove('touring');
    store.set('tourSeen', true);
    help.classList.add('nudge');                                    // shows where the tour lives from now on
    setTimeout(() => help.classList.remove('nudge'), 2600);
  }
  function go(d) {
    step = Math.max(step < 0 ? -1 : 0, step + d);
    if (step >= STEPS.length) closeTour(); else show();
  }
  tour.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.matches('.tour-later, .tour-skip')) closeTour(); else go(b.matches('.tour-back') ? -1 : 1);
  });
  addEventListener('keydown', e => {                                // capture: while the tour is up, keys only drive the tour
    if (tour.hidden || e.key === 'Tab') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Escape') closeTour(); else if (e.key === 'ArrowLeft') go(-1); else if (['Enter', ' ', 'ArrowRight'].includes(e.key)) go(1);
  }, true);
  addEventListener('resize', () => { if (!tour.hidden) show(); });
  help.addEventListener('click', e => { openTour(false); if (e.detail) help.blur(); });   // asked for: straight to the first step
  if (!store.get('tourSeen', false)) setTimeout(() => openTour(true), 1400);

  // ---------- keep everything in step ----------
  bus.on('settings', p => {
    draw();
    if ('music' in p || 'musicStyle' in p || 'vibe' in p || 'beatKit' in p || 'pianoKit' in p) drawTunes();
    if ('sceneKind' in p || 'vibe' in p) drawScenes();
  });
  bus.on('sound:mute', draw);
  bus.on('scene:change', drawScenes);
  bus.on('tracks', drawTunes);
  bus.on('timer', drawState);
  draw(); drawTunes(); drawScenes(); drawState();
}
