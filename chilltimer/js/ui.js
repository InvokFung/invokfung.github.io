// All DOM work: digits, plan strip, dock, popovers, right-click menu, command line, keys, toasts, sound wave.
// It changes settings and calls the timer; app.js turns those changes into scene and sound effects.

import { bus, store, settings, saveSettings } from './bus.js';
import { timer, clockText } from './timer.js';
import { alarms, alarmTitle } from './alarms.js';
import { parseCommand, parseDuration, describe, suggest, readSentence, LAYERS } from './command.js';
import { t, tn, LANGS, cmd as cmdTable, fmtSpan, normalizeCommand } from './i18n.js';
import { stage, VIBES } from './scenes/engine.js';
import { stats } from './stats.js';
import { mini } from './mini.js';
import { youtube, parseYouTube } from './youtube.js';
import { tracks, TRACKS } from './tracks.js';
import { MOODS, moodOf } from './moods.js';

const $ = id => document.getElementById(id);
const MIN = 60000;
const pad = n => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hhmm = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

const FLAME = 'M12 3.5c.6 3 4.8 4.8 4.8 9.6a4.8 4.8 0 0 1-9.6 0c0-1.9.9-3.2 2-4.2.1 1.7.8 2.7 1.8 2.9-.3-2.9-.6-5.4 1-8.3z';
const ICONS = {
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5L4.5 8.6"/><path d="M4.5 4.2v4.4h4.4"/>',
  skip: '<path d="M6 5.5l9 6.5-9 6.5z"/><path d="M18.5 5.5v13"/>',
  prev: '<path d="M18 5.5l-9 6.5 9 6.5z"/><path d="M5.5 5.5v13"/>',
  play: '<path d="M8 5.5l10.5 6.5L8 18.5z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  vibe: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M3.5 16l4.8-4.6 3.6 3.4 3-2.8 5.6 5.2"/><circle cx="15.6" cy="9.2" r="1.3"/>',
  // five bars that move while music plays
  sound: '<g class="eq"><path style="--d:0s" d="M4 10.5v3"/><path style="--d:-.5s" d="M8 7v10"/><path style="--d:-.2s" d="M12 9.5v5"/><path style="--d:-.8s" d="M16 5v14"/><path style="--d:-.35s" d="M20 10v4"/></g>',
  mute: '<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>',
  vol: '<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z"/><path d="M15 9a4 4 0 0 1 0 6M17.6 6.5a7.5 7.5 0 0 1 0 11"/>',
  bell: '<path d="M6.5 16.5v-5.2a5.5 5.5 0 0 1 11 0v5.2l1.5 1.8h-14z"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/>',
  // the flame fills up as today's goal is reached
  flame: `<path class="flame-fill" d="${FLAME}"/><path d="${FLAME}"/>`,
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14.2h8"/>',
  sliders: '<path d="M4 7.5h9M17.5 7.5H20M4 16.5h2.5M11 16.5h9"/><circle cx="15.2" cy="7.5" r="2.2"/><circle cx="8.8" cy="16.5" r="2.2"/>',
  mini: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><rect x="12" y="11.5" width="6.5" height="5" rx="1.2" fill="currentColor" stroke="none"/>',
  full: '<path d="M4.5 9V5.5H8M19.5 9V5.5H16M4.5 15v3.5H8M19.5 15v3.5H16"/>',
  x: '<path d="M7 7l10 10M17 7L7 17"/>',
  mood: '<path d="M7.5 14.5h9a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.7 1.1 3 3 0 0 0 .2 5.86z"/><path d="M9 17.5v2M12.5 17.5v2M16 17.5v2"/>',
  more: '<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>'
};
const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
// Shown names of things: from the dictionary, with the name in the data file as the fallback.
const vibeName = v => tn('vibe', v.id, v.name);
const sceneName = s => tn(s.url ? 'clip' : 'scene', s.id, s.name);   // a drawn scene, or a video clip
const moodName = m => tn('mood', m.id, m.name);
const modeName = mode => t(`mode.${mode}`);

export function initUI({ sound }) {
  const body = document.body, root = document.documentElement;
  // A scene picked by hand (swipe, arrow keys, menu, a typed name) leaves the YouTube picture.
  // The video covers the scenes, so without this the pick would change nothing you can see.
  const leaveTube = () => { if (settings.sceneKind === 'youtube') saveSettings({ sceneKind: 'drawn' }); };
  const nextScene = dir => { leaveTube(); stage.nextScene(dir); }, goScene = i => { leaveTube(); stage.goScene(i); };
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  $('btnReset').innerHTML = icon('reset');
  $('btnSkip').innerHTML = icon('skip');
  $('btnToggle').innerHTML = `<span class="core"></span><span class="glyph play">${icon('play')}</span><span class="glyph pause">${icon('pause')}</span>`;
  $('chipMini').hidden = !mini.supported;
  $('hint').innerHTML = esc(t('hint.line')).replace('{space}', '<kbd>Space</kbd>').replaceAll(' · ', ' <i>·</i> ');
  const vibeIds = () => Object.keys(VIBES);
  const curVibe = () => VIBES[settings.vibe] || Object.values(VIBES)[0];
  // Commands typed in the user's language become English before parseCommand reads them.
  const shownVibes = Object.fromEntries(Object.values(VIBES).map(v => [v.id, vibeName(v)]));      // id → shown name
  const shownLayers = Object.fromEntries(LAYERS.map(k => [k, tn('layer', k, k)]));                // room sound → shown name
  const nativeTable = { ...cmdTable, names: Object.fromEntries(Object.entries({ ...shownLayers, ...shownVibes }).map(([id, n]) => [n, id])) };
  const firstWords = Object.fromEntries(Object.entries(cmdTable.words || {}).map(([k, list]) => [k, list[0]]));
  const native = text => normalizeCommand(text, nativeTable);
  // The exact forms first; only when they find nothing, an everyday sentence is read ("set an alarm for 45 minutes").
  // A sentence that could mean two things gives choices instead of a guess (see refreshCmd).
  const guess = text => readSentence(text, nativeTable, vibeIds());
  const parse = text => parseCommand(native(text), vibeIds()) || (g => (g.length === 1 ? parseCommand(g[0], vibeIds()) : null))(guess(text));
  const say = c => describe(c.type === 'vibe' ? { ...c, name: shownVibes[c.id] || c.id } : c, t);
  // Run fn on click; drop focus after a mouse click so Space goes back to the timer.
  const press = (el, fn) => el.addEventListener('click', e => { fn(e); if (e.detail) el.blur(); });

  // ---------- toasts ----------
  const toasts = $('toasts');
  function toast(text, { action, onAction, ms = 3600 } = {}) {
    const el = document.createElement('div');
    el.className = 'toast glass';
    el.append(Object.assign(document.createElement('span'), { textContent: text }));
    if (action) {
      const b = Object.assign(document.createElement('button'), { textContent: action });
      b.onclick = () => { onAction(); el.remove(); };
      el.append(b);
    }
    toasts.append(el);
    while (toasts.children.length > 3) toasts.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
  }
  bus.on('toast', t => toast(t.text, t));

  // ---------- quiet mode ----------
  let quietTimer = 0, popName = null, stripKey = null;
  const cmd = $('cmd'), menu = $('menu');
  function wake() {
    body.classList.remove('quiet');
    clearTimeout(quietTimer);
    if (timer.state.status === 'running' && !popName && !stripKey && cmd.hidden && menu.hidden && !alarms.ringing() && $('digitsEdit').hidden) {
      quietTimer = setTimeout(() => { hideTip(); body.classList.add('quiet'); }, 3000);
    }
  }
  for (const ev of ['pointermove', 'pointerdown', 'mousemove', 'keydown', 'touchstart', 'wheel']) addEventListener(ev, wake, { passive: true });

  // ---------- digits, mode, plan ----------
  const digits = $('digits'), modeEl = $('mode'), planEl = $('plan'), btnToggle = $('btnToggle'), live = $('live');
  let lastClock = '', planKey = '', lastSaid = '';
  const toggleLabel = () => { const s = timer.state; return t(s.status === 'running' ? 'toggle.pause' : s.status === 'paused' ? 'toggle.resume' : s.mode === 'focus' ? 'toggle.startFocus' : 'toggle.startBreak'); };

  function renderClock() {
    const s = timer.state, text = clockText(s.remainingMs), p = timer.progress();
    if (text !== lastClock) {
      lastClock = text;
      digits.innerHTML = [...text].map(c => (c === ':' ? '<i>:</i>' : `<span>${c}</span>`)).join('');
      digits.classList.toggle('long', text.length > 5);
      const said = text.slice(0, -3);                               // screen readers hear it once a minute
      if (said !== lastSaid && s.status === 'running') { lastSaid = said; live.textContent = t('aria.minutesLeft', { n: Math.ceil(s.remainingMs / MIN) }); }
    }
    const now = planEl.querySelector('.now');
    if (now) now.style.setProperty('--p', p.toFixed(4));
    $('zenFill').style.width = (p * 100).toFixed(2) + '%';
  }

  function renderTitle() {
    if (alarms.ringing()) return;
    const s = timer.state;
    document.title = s.status === 'idle' ? 'ChillTimer' : (s.status === 'paused' ? '⏸ ' : '') + t('title.running', { time: clockText(s.remainingMs), mode: modeName(s.mode) });
    drawFavicon();
  }

  function renderState() {
    const s = timer.state, p = timer.plan();
    body.classList.toggle('is-running', s.status === 'running');
    body.classList.toggle('is-paused', s.status === 'paused');
    body.classList.toggle('is-idle', s.status === 'idle');
    modeEl.dataset.mode = s.mode;
    modeEl.textContent = s.mode === 'focus' ? t('mode.focusRound', { n: Math.floor(s.planIndex / 2) + 1, of: settings.rounds }) : modeName(s.mode);
    btnToggle.setAttribute('aria-label', toggleLabel());
    const key = [p.length, s.planIndex, Math.round(s.totalMs / 1000), settings.focus, settings.short, settings.long].join();
    if (key !== planKey) {
      planKey = key;
      planEl.innerHTML = p.map((mode, i) => {
        const min = i === s.planIndex ? s.totalMs / MIN : settings[mode], label = min >= 1 ? Math.round(min) : '<1';
        const cls = (mode === 'focus' ? 'focus' : 'break') + (i < s.planIndex ? ' done' : '') + (i === s.planIndex ? ' now' : '');
        return `<button role="listitem" class="${cls}" style="--m:${Math.max(1, min).toFixed(2)}" data-i="${i}" data-min="${label}" aria-label="${esc(t(i === s.planIndex ? 'aria.planBlock.now' : 'aria.planBlock', { mode: modeName(mode), min: label }))}"></button>`;
      }).join('');
    }
    renderClock();
    renderTitle();
    renderDock();
    wake();
  }
  bus.on('timer', renderState);
  bus.on('timer:tick', () => { renderClock(); renderTitle(); });
  bus.on('timer:start', () => { hintGone(); askNotify(); });
  bus.on('timer:undoable', ({ what }) => {
    if (/^(Reset|Skipped|Jumped)$/.test(what)) toast(t('toast.' + what.toLowerCase()), { action: t('toast.undo'), onAction: () => timer.undo(), ms: 6000 });
  });

  planEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b && +b.dataset.i !== timer.state.planIndex) timer.jump(+b.dataset.i);
    if (b && e.detail) b.blur();
  });
  press(btnToggle, () => timer.toggle());
  press($('btnReset'), () => timer.reset());
  press($('btnSkip'), () => timer.skip());

  const hint = $('hint');
  if (store.get('hinted', false)) hint.classList.add('gone');
  function hintGone() { if (!hint.classList.contains('gone')) { hint.classList.add('gone'); store.set('hinted', true); } }

  // ±minutes with a small nudge so the change is felt, not just read
  const bump = $('bump');
  function adjust(min) {
    if (!timer.adjust(min * MIN)) return toast(t('toast.under10s'));
    bump.textContent = (min > 0 ? '+' : '−') + t('span.m', { m: Math.abs(min) });
    for (const [el, cls] of [[bump, 'go'], [digits, min > 0 ? 'up' : 'down']]) {
      el.classList.remove('go', 'up', 'down');
      void el.offsetWidth;
      el.classList.add(cls);
    }
    hintGone();
  }

  // click the digits to type an exact time
  const edit = $('digitsEdit');
  const parseEdit = v => {
    const m = /^(?:(\d+):)?(\d{1,3}):(\d{2})$/.exec(v.trim());
    return m ? ((+m[1] || 0) * 3600 + +m[2] * 60 + +m[3]) * 1000 : parseDuration(native(v));   // native(): 1小時30分 → 1h30m
  };
  function openEdit() {
    edit.hidden = false;
    edit.value = lastClock;
    digits.style.visibility = 'hidden';
    edit.focus();
    edit.select();
    hideTip();
    wake();
  }
  function closeEdit(apply) {
    if (edit.hidden) return;
    const text = edit.value.trim();
    edit.hidden = true;
    digits.style.visibility = '';
    if (!apply || !text || text === lastClock) return;
    const ms = parseEdit(text);
    if (ms) timer.setDuration(ms); else toast(t('toast.timeHelp'));
  }
  bus.on('ui:time', () => openStrip('time', digits));   // a long press on the time (ring.js). A tap starts or pauses.
  edit.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') closeEdit(true);
    else if (e.key === 'Escape') closeEdit(false);
  });
  edit.addEventListener('blur', () => closeEdit(true));

  // ---------- favicon: progress ring ----------
  const fav = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }), fg = fav.getContext('2d');
  let favKey = '';
  function drawFavicon() {
    const s = timer.state, v = curVibe(), p = timer.progress();
    const key = s.status + Math.round(p * 60) + v.id + s.mode;
    if (key === favKey) return;
    favKey = key;
    fg.clearRect(0, 0, 64, 64);
    fg.fillStyle = v.shade;
    fg.beginPath(); fg.arc(32, 32, 31, 0, Math.PI * 2); fg.fill();
    fg.lineWidth = 9; fg.lineCap = 'round';
    fg.strokeStyle = 'rgba(255,255,255,0.16)';
    fg.beginPath(); fg.arc(32, 32, 21, 0, Math.PI * 2); fg.stroke();
    fg.strokeStyle = s.mode === 'focus' ? v.accent : v.accent2;
    fg.beginPath(); fg.arc(32, 32, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, s.status === 'idle' ? 1 : 1 - p)); fg.stroke();
    $('favicon').href = fav.toDataURL('image/png');
  }

  // ---------- labels on hover: one capsule that glides from control to control ----------
  const tip = $('tip');
  const TIP = {
    toggle: toggleLabel,
    digits: () => t('tip.digits'),
    vibe: () => { const i = stage.info(); return i ? t('vibeScene', { vibe: vibeName(i.vibe), scene: sceneName(i.scene) }) : t('tip.vibe'); },
    sound: () => (sound.muted ? t('tip.sound.muted') : t(tracks.playing() ? 'tip.sound.track' : 'tip.sound', { n: Math.round(settings.volume * 100), track: tracks.playing() ? tracks.current().title : '' })),
    mood: () => { const i = moodIndex(); return i < 0 ? t('tip.mood.own') : t('tip.mood', { name: moodName(moods()[i]) }); },
    alarms: () => { const up = alarms.upcoming(); return up ? t('tip.alarms.next', { time: hhmm(up.next) }) : t('tip.alarms'); },
    stats: () => t('tip.stats', { min: stats.today().minutes, goal: settings.goal })
  };
  let tipEl = null, tipTimer = 0;
  function placeTip(el) {
    if (stripKey && el.dataset.k === stripKey) return hideTip();     // its row is open and says the same
    const key = el.dataset.tip, text = TIP[key] ? TIP[key]() : key;
    tip.innerHTML = `<span>${esc(text)}</span>` + (el.dataset.key ? `<kbd>${esc(el.dataset.key)}</kbd>` : '');
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.classList.toggle('jump', !tip.classList.contains('on'));     // first show: do not glide in from the old place
    const side = el.closest('.dock') && vertical();                 // on the side rail the label sits beside the icon
    tip.style.left = (side ? r.right + 14 : clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8)) + 'px';
    tip.style.top = (side ? r.top + r.height / 2 - h / 2 : r.top < h + 26 ? r.bottom + 10 : r.top - h - 10) + 'px';
    void tip.offsetWidth;
    tip.classList.add('on');
  }
  function hideTip() { clearTimeout(tipTimer); tipEl = null; tip.classList.remove('on'); }
  document.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest?.('[data-tip]') || null;
    if (el === tipEl) return;
    clearTimeout(tipTimer);
    if (!el) return hideTip();
    tipEl = el;
    tipTimer = setTimeout(() => placeTip(el), tip.classList.contains('on') ? 0 : 380);
  });
  document.addEventListener('pointerdown', hideTip);
  document.addEventListener('focusin', e => {
    const el = e.target.closest?.('[data-tip]');
    if (el && el.matches(':focus-visible')) { tipEl = el; placeTip(el); }
  });
  document.addEventListener('focusout', hideTip);

  // ---------- dock ----------
  // A side rail on wide screens, a bottom bar on phones. Same icons, same behaviour.
  const dock = $('dock'), pop = $('pop'), blob = dock.querySelector('.blob'), strip = $('strip');
  const chipFor = name => dock.querySelector(`[data-pop="${name}"]`) || dock.querySelector('[data-act="cmd"]');
  const chipOf = k => dock.querySelector(`[data-k="${k}"]`);
  const vertical = () => getComputedStyle(dock).flexDirection === 'column';
  const moods = () => MOODS[curVibe().id] || [];
  const moodIndex = () => moodOf(moods(), layerMix());
  let dockKey = '', blobAt = null;

  // The ring around a dial icon shows its value.
  function syncDials() {
    const info = stage.info(), list = moods(), mi = moodIndex();
    const set = (k, v) => { const c = chipOf(k); if (c) c.style.setProperty('--dial', clamp(v, 0, 1).toFixed(3)); };
    set('sound', sound.muted ? 0 : settings.volume);
    set('mood', mi < 0 || list.length < 2 ? 0 : mi / (list.length - 1));
    set('vibe', info ? (info.index + 1) / info.count : 0);
    set('stats', stats.today().minutes / settings.goal);
  }
  function renderDock() {
    syncDials();
    const info = stage.info(), up = alarms.upcoming(), today = stats.today();
    const playing = !sound.muted && (!!sound.music.playing || tracks.playing() || (youtube.playing() && settings.music && settings.musicStyle === 'youtube'));
    const key = [info?.vibe.id, info?.index, sound.muted, playing, up?.id, up?.next, up?.label, today.minutes, settings.goal].join('|');
    if (key === dockKey) return;
    dockKey = key;
    if (info) $('vibeLabel').textContent = t('vibeScene', { vibe: vibeName(info.vibe), scene: sceneName(info.scene) });
    $('icoSound').innerHTML = icon(sound.muted ? 'mute' : 'sound');
    chipOf('sound').classList.toggle('playing', playing);
    chipOf('alarms').classList.toggle('live', !!up);
    chipOf('stats').style.setProperty('--goal', Math.min(100, (today.minutes / settings.goal) * 100).toFixed(1) + '%');
    const na = $('nextAlarm');
    na.hidden = !up;
    if (up) na.innerHTML = icon('bell') + `<span>${hhmm(up.next)}${up.label ? ' · ' + esc(up.label) : ''}</span>`;
  }
  // The soft highlight behind the icon you point at. It stays one icon in size at all times.
  // Between neighbours it makes a short, quick slide; further than that it just appears in place,
  // so it never sweeps across other icons.
  function moveBlob(chip) {
    if (!chip) { blob.classList.remove('on'); blobAt = null; return; }
    const v = vertical(), x = chip.offsetLeft, y = chip.offsetTop, at = v ? y : x;
    const near = blobAt != null && Math.abs(at - blobAt) <= (v ? chip.offsetHeight : chip.offsetWidth) * 1.3;
    blob.classList.toggle('jump', !near);
    Object.assign(blob.style, { transform: `translate(${x}px, ${y}px)`, width: chip.offsetWidth + 'px', height: chip.offsetHeight + 'px' });
    blobAt = at;
    blob.classList.add('on');
  }
  const restBlob = () => moveBlob(stripKey && chipOf(stripKey) ? chipOf(stripKey) : popName ? chipFor(popName) : null);
  dock.addEventListener('pointerover', e => { const c = e.target.closest('.chip'); if (c) moveBlob(c); });
  dock.addEventListener('pointerleave', restBlob);
  dock.addEventListener('pointermove', e => {
    const r = dock.getBoundingClientRect();
    dock.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
    dock.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
  });
  dock.addEventListener('focusin', e => { const c = e.target.closest('.chip'); if (c && c.matches(':focus-visible')) moveBlob(c); });
  press($('nextAlarm'), () => openPop('alarms'));

  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.())?.catch?.(() => {});
  const toggleMini = () => { if (!mini.supported) toast(t('toast.miniUnsupported')); else mini.toggle().catch(() => toast(t('toast.miniFail'))); };
  // A tap on an icon unfolds its one small row. Icons without a row act at once.
  dock.addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    if (c.dataset.k) openStrip(c.dataset.k, c);
    else { closeStrip(); if (c.dataset.pop) openPop(c.dataset.pop); else ({ cmd: () => openCmd(''), mini: toggleMini, full: toggleFull })[c.dataset.act](); }
    if (e.detail) c.blur();
  });

  // First visit: show each icon's name for a few seconds, then fold the names away.
  let endIntro = () => {};
  if (!store.get('toured', false)) {
    dock.classList.add('intro');
    endIntro = () => { dock.classList.remove('intro'); store.set('toured', true); endIntro = () => {}; restBlob(); };
    setTimeout(() => endIntro(), 9000);
  }

  // ---------- strips: an icon unfolds into one small row, right beside it ----------
  // Works the same with a finger, a touchpad, a mouse or the keyboard. "…" opens everything else.
  function setMood(i) {
    const list = moods();
    if (!list.length) return;
    const m = list[clamp(i, 0, list.length - 1)], names = sound.LAYERS.length ? sound.LAYERS : Object.keys(layerMix());
    const mix = Object.fromEntries(names.map(n => [n, m.mix[n] || 0]));
    sound.setMix(mix);
    saveSettings({ layers: { ...settings.layers, [curVibe().id]: mix } });
  }
  function ringIn(min) {
    const a = alarms.add({ type: 'alarmIn', ms: min * MIN, label: '' });
    toast(t('toast.ringIn', { min }), { action: t('toast.undo'), onAction: () => alarms.remove(a.id), ms: 6000 });
    askNotify();
  }
  const more = () => '';   // a row never hides a second step behind a "more" button
  const STRIPS = {
    vibe: () => {
      const info = stage.info();
      return `<b>${t('strip.vibe')}</b>${stage.items(info.vibe.id).map((sc, i) => `<button class="thumb" data-scene="${i}" aria-label="${esc(sceneName(sc))}"></button>`).join('')}`
        + Object.values(VIBES).filter(v => v.id !== info.vibe.id).map(v => `<button class="soft" data-vibe="${v.id}">${esc(vibeName(v))}</button>`).join('') + more('vibe');
    },
    sound: () => `<b>${t('strip.sound')}</b><button class="round" data-act="mute" aria-label="${t('aria.mute')}"></button>${liq('data-range="volume"', settings.volume, t('pop.sound.volume'))}${more('sound')}`,
    mood: () => `<b>${t('strip.mood')}</b>${moods().map((m, i) => `<button class="soft" data-mood="${i}">${esc(moodName(m))}</button>`).join('')}${more('sound')}`,
    alarms: () => `<b>${t('strip.alarms')}</b>${[5, 15, 30, 60].map(n => `<button class="soft" data-ring="${n}">${t('span.m', { m: n })}</button>`).join('')}${more('alarms')}`,
    stats: () => {
      const d = stats.today();
      return `<b>${t('strip.stats')}</b><span class="strip-text">${t('strip.stats.line', { min: d.minutes, goal: settings.goal, rounds: d.rounds, streak: stats.streak() })}</span>${more('stats')}`;
    },
    time: () => `<b>${t('strip.time')}</b><button class="soft" data-adj="-5">−5</button><button class="soft" data-adj="-1">−1</button><button class="soft" data-type>${t('strip.time.type')}</button><button class="soft" data-adj="1">+1</button><button class="soft" data-adj="5">+5</button>`
  };
  let stripAnchor = null, stripTimer = 0;
  function drawStrip() {
    strip.innerHTML = STRIPS[stripKey]();
    if (stripKey === 'vibe') strip.querySelectorAll('.thumb').forEach(b => b.prepend(thumbFor(stage.info().vibe.id, +b.dataset.scene)));
    syncStrip();
  }
  function syncStrip() {
    if (!stripKey) return;
    const info = stage.info(), mi = moodIndex();
    strip.querySelectorAll('[data-mood]').forEach(b => b.classList.toggle('on', +b.dataset.mood === mi));
    strip.querySelectorAll('[data-scene]').forEach(b => b.classList.toggle('on', +b.dataset.scene === info.index));
    const mute = strip.querySelector('[data-act="mute"]');
    if (mute) mute.innerHTML = icon(sound.muted ? 'mute' : 'vol');
    const vol = strip.querySelector('[data-range="volume"]');
    if (vol && document.activeElement !== vol) setLiq(vol, Math.round(settings.volume * 100));
  }
  function placeStrip() {
    const a = stripAnchor, r = a.getBoundingClientRect(), w = strip.offsetWidth, h = strip.offsetHeight, d = dock.getBoundingClientRect();
    const midX = r.left + r.width / 2, midY = r.top + r.height / 2;
    let left, top, ox, oy;
    if (a.closest('.dock') && vertical()) { left = d.right + 12; top = clamp(midY - h / 2, 10, innerHeight - h - 10); ox = '-20px'; oy = midY - top + 'px'; }
    else if (a.closest('.dock')) { left = clamp(midX - w / 2, 8, innerWidth - w - 8); top = d.top - h - 12; ox = midX - left + 'px'; oy = 'calc(100% + 20px)'; }
    else { left = clamp(midX - w / 2, 8, innerWidth - w - 8); top = Math.min(r.bottom + 14, innerHeight - h - 10); ox = midX - left + 'px'; oy = '-20px'; }
    Object.assign(strip.style, { left: left + 'px', top: top + 'px' });
    strip.style.setProperty('--ox', ox);
    strip.style.setProperty('--oy', oy);
  }
  function openStrip(key, anchor) {
    if (stripKey === key) return closeStrip();
    closePop(); closeMenu(); closeCmd();
    clearTimeout(stripTimer);
    endIntro();
    stripKey = key;
    stripAnchor = anchor;
    strip.classList.remove('closing');
    strip.hidden = false;
    drawStrip();
    placeStrip();
    strip.style.animation = 'none'; void strip.offsetWidth; strip.style.animation = '';
    dock.classList.add('open');
    if (anchor.closest('.dock')) moveBlob(anchor);
    hideTip();
    wake();
  }
  function closeStrip() {
    if (!stripKey) return;
    stripKey = null;
    strip.classList.add('closing');
    stripTimer = setTimeout(() => { strip.hidden = true; strip.classList.remove('closing'); }, 130);
    if (!popName) dock.classList.remove('open');
    if (!dock.matches(':hover')) restBlob();
    wake();
  }
  strip.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const d = btn.dataset;
    if (d.more) { closeStrip(); openPop(d.more); }
    else if (d.act === 'mute') setMute(!sound.muted);
    else if (d.mood) setMood(+d.mood);
    else if (d.scene) goScene(+d.scene);
    else if (d.vibe) saveSettings({ vibe: d.vibe, scene: 0 });
    else if (d.ring) { closeStrip(); ringIn(+d.ring); }
    else if (d.adj) adjust(+d.adj);
    else if ('type' in d) { closeStrip(); openEdit(); }
    if (e.detail) btn.blur();
  });
  strip.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.range !== 'volume') return;
    setLiq(el, +el.value);
    if (sound.muted) setMute(false);
    saveSettings({ volume: el.value / 100 });
  });
  addEventListener('resize', () => { if (stripKey) placeStrip(); });

  // Bonus: scroll over a dial icon (or its open row) to turn it. A mouse wheel sends big steps,
  // a touchpad sends many small ones, so the movement is added up until it makes one step.
  const ROLL = {
    sound: d => { if (sound.muted) setMute(false); saveSettings({ volume: clamp(Math.round(settings.volume * 20 + d) / 20, 0, 1) }); },
    mood: d => { const i = moodIndex(); setMood(i < 0 ? 0 : i + d); },
    vibe: d => nextScene(d)
  };
  let rollSum = 0, rollAt = 0, sceneAt = 0, rollOff = 0;
  function onRoll(e, k) {
    if (!ROLL[k]) return;
    e.preventDefault();
    const now = performance.now();
    if (now - rollAt > 400) rollSum = 0;
    rollAt = now;
    rollSum += e.deltaY || e.deltaX;
    if (Math.abs(rollSum) < 60) return;
    const d = rollSum < 0 ? 1 : -1;
    rollSum = 0;
    if (k === 'vibe') { if (now - sceneAt < 800) return; sceneAt = now; }
    ROLL[k](d);
    const c = chipOf(k);
    c.classList.add('rolling');
    clearTimeout(rollOff);
    rollOff = setTimeout(() => c.classList.remove('rolling'), 1000);
    if (tipEl === c) placeTip(c);
  }
  dock.addEventListener('wheel', e => { const c = e.target.closest('.chip'); if (c && c.dataset.k) onRoll(e, c.dataset.k); }, { passive: false });
  strip.addEventListener('wheel', e => { if (stripKey) onRoll(e, stripKey); }, { passive: false });

  // Swipe the picture sideways to change scene: a finger, a pen, or a mouse drag.
  let swipe = null;
  addEventListener('pointerdown', e => {
    swipe = e.button || e.target.closest('button, input, a, .pop, .strip, .menu, .cmd, .ring, .dock, .plan, .digits-wrap') ? null : { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  addEventListener('pointerup', e => {
    if (!swipe || swipe.id !== e.pointerId) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) nextScene(dx < 0 ? 1 : -1);
  });

  const setMute = on => { sound.mute(on); renderDock(); syncPop(); syncStrip(); bus.emit('sound:mute', on); };

  // ---------- popovers ----------
  // Playlists from v1, kept as quick picks. The shown name is the key `yt.pick.<name>`.
  const YT_PICKS = [['lofi', 'PLOzDu-MXXLliO9fBNZOQTBDddoA3FzZUo'], ['jazz', 'PLgzTt0k8mXzEpH7-dOCHqRZOsakqXmzmG'], ['piano', 'PLLJhiB5FBGqzJYrenKCuql_j8FE7WVlB_'], ['synthwave', 'PLvlw_ICcAI4eJMNRqjzlsBMPIqJJ5ILgE'], ['nature', 'PL6NdkXsPL07KN01gH2vucrHCEkkz6YSEU']];
  const ytWanted = () => (popName === 'vibe' && settings.sceneKind === 'youtube') || (popName === 'sound' && settings.music && settings.musicStyle === 'youtube');
  const ytStatus = () => (!settings.ytUrl ? t('yt.empty') : youtube.playing() ? '▶  ' + (youtube.title() || t('yt.playing')) : t('yt.loading'));
  const ytBox = () => `<div class="yt-box">
      <input class="field" id="ytIn" placeholder="${esc(t('yt.placeholder'))}" value="${esc(settings.ytUrl)}" autocomplete="off" spellcheck="false" aria-label="${esc(t('yt.aria'))}">
      <div class="read" id="ytRead">${esc(ytStatus())}</div>
      <div class="quick">${YT_PICKS.map(([n, id]) => `<button class="soft" data-yt="https://www.youtube.com/playlist?list=${id}">${t('yt.pick.' + n)}</button>`).join('')}${settings.ytUrl ? `<button class="soft" data-yt="">${t('yt.stop')}</button>` : ''}</div>
    </div>`;
  const nowTitle = () => { const t = tracks.current(); return `<b>${esc(t.title)}</b><small>${esc(t.by)}</small>`; };
  const trackBox = () => `<div class="tracks">
      <div class="now"><button class="round" data-trk="prev" aria-label="${t('tracks.prev')}">${icon('prev')}</button><div class="now-title">${nowTitle()}</div><button class="round" data-trk="next" aria-label="${t('tracks.next')}">${icon('skip')}</button></div>
      <ul class="track-list">${TRACKS.map((t, i) => `<li><button data-track="${i}"><span>${esc(t.title)}</span><small>${esc(t.by)}</small></button></li>`).join('')}</ul>
    </div>`;
  const layerMix = () => ({ ...curVibe().mix, ...(settings.layers[curVibe().id] || {}) });
  const SEG = {                                                    // what each segmented choice shows now
    musicSrc: () => (!settings.music ? 'off' : settings.musicStyle === 'tracks' || settings.musicStyle === 'youtube' ? settings.musicStyle : 'live'),
    live: () => (settings.musicStyle === 'piano' || settings.musicStyle === 'beat' ? settings.musicStyle : curVibe().music),
    chime: () => settings.chime,
    preset: () => [settings.focus, settings.short, settings.long].join('-'),
    sceneKind: () => settings.sceneKind
  };
  const SEG_SET = {
    sceneKind: v => saveSettings({ sceneKind: v }),
    musicSrc: v => saveSettings(v === 'off' ? { music: false } : { music: true, musicStyle: v === 'live' ? null : v }),
    live: v => saveSettings({ music: true, musicStyle: v }),
    chime: v => { saveSettings({ chime: v }); if (v !== 'none') sound.chime(v); },
    preset: v => { const [focus, short, long] = v.split('-').map(Number); saveSettings({ focus, short, long }); },
  };
  const OUT = {
    focus: () => t('span.m', { m: settings.focus }), short: () => t('span.m', { m: settings.short }), long: () => t('span.m', { m: settings.long }),
    rounds: () => String(settings.rounds), goal: () => t('span.m', { m: settings.goal })
  };
  const STEP = { focus: [1, 180, 1], short: [1, 60, 1], long: [1, 90, 1], rounds: [1, 8, 1], goal: [15, 600, 15] };
  const sw = (key, label) => `<button class="switch" role="switch" aria-checked="${!!settings[key]}" data-sw="${key}" aria-label="${esc(label)}"></button>`;
  const liq = (attr, v, label) => {
    const n = Math.round(v * 100);
    return `<label class="liq" style="--v:${n}%"><span>${esc(label)}</span><input type="range" min="0" max="100" value="${n}" ${attr} aria-label="${esc(t('aria.volumeOf', { name: label }))}"><em>${n}</em></label>`;
  };
  const seg = (name, opts) => {
    const i = opts.findIndex(([v]) => String(v) === String(SEG[name]()));
    return `<div class="seg" role="group" data-name="${name}" style="--n:${opts.length};--i:${Math.max(0, i)}"${i < 0 ? ' data-none' : ''}>${opts.map(([v, l], k) => `<button data-seg="${name}" data-v="${v}" aria-pressed="${k === i}">${l}</button>`).join('')}</div>`;
  };
  const stepper = key => `<div class="stepper"><button class="round" data-step="${key}" data-d="-1" aria-label="${t('aria.less')}">−</button><output data-out="${key}">${OUT[key]()}</output><button class="round" data-step="${key}" data-d="1" aria-label="${t('aria.moreStep')}">+</button></div>`;
  const thumbs = {};
  const thumbFor = (id, i) => (thumbs[stage.kind() + id + i] ||= stage.thumb(id, i));
  const nextText = (a, now) => (a.on ? t('alarm.next', { time: hhmm(a.next), span: fmtSpan(Math.max(0, a.next - now)) }) : t('alarm.off'));
  const parseAlarm = text => {
    const n = native(text);
    let c = parseCommand(n, []);
    if (c && c.type.startsWith('alarm')) return c;
    c = parseCommand('in ' + n, []);
    return c && c.type === 'alarmIn' ? c : null;
  };

  const POPS = {
    vibe() {
      const video = stage.kind() === 'video', tube = settings.sceneKind === 'youtube';
      pop.innerHTML = `<h2>${t('pop.vibe')}</h2>${seg('sceneKind', [['drawn', t('pop.vibe.drawn')], ['video', t('pop.vibe.video')], ['youtube', 'YouTube']]).replace('class="seg"', 'class="seg wide"')}
        <p>${t(tube ? 'pop.vibe.aboutYoutube' : video ? 'pop.vibe.aboutVideo' : 'pop.vibe.aboutDrawn')}</p>${tube ? ytBox() : ''}` + Object.values(VIBES).map(v => `
        <section class="vibe" data-id="${v.id}">
          <header><b>${esc(vibeName(v))}</b><span>${esc(tn('vibe', v.id + '.tagline', v.tagline))}</span></header>
          <div class="thumbs">${stage.items(v.id).map((s, i) => `<button class="thumb" data-vibe="${v.id}" data-scene="${i}" aria-label="${esc(t('aria.thumb', { vibe: vibeName(v), scene: sceneName(s) }))}"><span>${esc(sceneName(s))}</span></button>`).join('')}</div>
        </section>`).join('') + `
        <div class="row"><span>${t('pop.vibe.autoScene')}<small>${t('pop.vibe.autoScene.note')}</small></span>${sw('autoScene', t('pop.vibe.autoScene'))}</div>
        ${video ? '' : `<button class="soft" data-act="story">${t('pop.vibe.story')}</button>`}`;
      pop.querySelectorAll('.thumb').forEach(b => b.prepend(thumbFor(b.dataset.vibe, +b.dataset.scene)));
    },
    sound() {
      const mix = layerMix(), names = sound.LAYERS.length ? sound.LAYERS : Object.keys(mix);
      pop.innerHTML = `<h2>${t('pop.sound')}</h2>
        <div class="row"><button class="round" data-act="mute" aria-label="${t('aria.mute')}"></button>${liq('data-range="volume"', settings.volume, t('pop.sound.volume'))}</div>
        <h3>${t('pop.sound.music')}</h3>
        ${seg('musicSrc', [['off', t('pop.sound.off')], ['live', t('pop.sound.live')], ['tracks', t('pop.sound.tracks')], ['youtube', 'YouTube']]).replace('class="seg"', 'class="seg wide"')}
        ${{ off: '', live: `<div class="row"><span>${t('pop.sound.madeLive')}<small>${t('pop.sound.madeLive.note')}</small></span>${seg('live', [['piano', t('pop.sound.piano')], ['beat', t('pop.sound.beat')]])}</div>`, tracks: trackBox(), youtube: ytBox() }[SEG.musicSrc()]}
        <h3>${t('pop.sound.room')}</h3>
        <div class="quick">${moods().map((m, i) => `<button class="soft" data-mood="${i}">${esc(moodName(m))}</button>`).join('')}</div>
        <div class="stack">${names.map(n => liq(`data-layer="${n}"`, mix[n] || 0, tn('layer', n, n))).join('')}</div>
        <h3>${t('pop.sound.endOfRound')}</h3>
        <div class="row"><span>${t('pop.sound.chime')}</span>${seg('chime', [['soft', t('pop.sound.chime.soft')], ['bell', t('pop.sound.chime.bell')], ['digital', t('pop.sound.chime.digital')], ['none', t('pop.sound.off')]])}</div>`;
    },
    alarms() {
      const list = alarms.all(), now = Date.now();
      pop.innerHTML = `<h2>${t('pop.alarms')}</h2>
        <input class="field" id="alarmIn" placeholder="${esc(t('pop.alarms.placeholder'))}" autocomplete="off" spellcheck="false" aria-label="${esc(t('pop.alarms.aria'))}">
        <div class="read" id="alarmRead"></div>
        <div class="quick">${[['in 5m', '+' + t('span.m', { m: 5 })], ['in 15m', '+' + t('span.m', { m: 15 })], ['in 30m', '+' + t('span.m', { m: 30 })], ['in 1h', '+' + t('span.h', { h: 1 })], ['every 30m', t('pop.alarms.every30')], ['every 1h', t('pop.alarms.everyHour')]].map(([c, l]) => `<button class="soft" data-quick="${c}">${l}</button>`).join('')}</div>
        ${list.length ? `<ul class="alarms">${list.map(a => `
          <li data-id="${a.id}">
            <div><b>${esc(alarmTitle(a))}</b>${a.label ? ' · ' + esc(a.label) : ''}<small>${nextText(a, now)}</small></div>
            <button class="switch" role="switch" aria-checked="${a.on}" data-alarm="${a.id}" aria-label="${t('pop.alarms.switch')}"></button>
            <button class="round" data-del="${a.id}" aria-label="${t('pop.alarms.delete')}">${icon('x')}</button>
          </li>`).join('')}</ul>` : `<div class="empty">${t('pop.alarms.empty')}</div>`}`;
    },
    stats() {
      const today = stats.today(), all = stats.total(), week = stats.week(), top = Math.max(settings.goal, ...week.map(d => d.minutes), 1);
      pop.innerHTML = `<h2>${t('pop.stats')}</h2>
        <div class="stat-big"><b>${today.minutes}</b><span>${t('pop.stats.minOf', { goal: settings.goal })}</span></div>
        <div class="bar"><i style="width:${Math.min(100, (today.minutes / settings.goal) * 100)}%"></i></div>
        <div class="stat-row">
          <div><b>${today.rounds}</b><span>${t('pop.stats.rounds')}</span></div>
          <div><b>${stats.streak()}</b><span>${t('pop.stats.streak')}</span></div>
          <div><b>${all.minutes >= 600 ? t('pop.stats.hours', { n: Math.round(all.minutes / 60) }) : t('pop.stats.mins', { n: all.minutes })}</b><span>${t('pop.stats.allTime')}</span></div>
        </div>
        <h3>${t('pop.stats.week')}</h3>
        <div class="week">${week.map((d, n) => `<div class="${d.today ? 'today' : ''}" title="${t('span.m', { m: d.minutes })}"><i style="--n:${n};height:${Math.max(4, (d.minutes / top) * 100)}%"></i>${[...t('pop.stats.days')][d.day]}</div>`).join('')}</div>
        <p style="margin-top:10px">${t('pop.stats.best', { best: stats.best(), rounds: all.rounds })}</p>
        <div class="row"><span>${t('pop.stats.goal')}</span>${stepper('goal')}</div>`;
    },
    settings() {
      const langs = [{ id: 'auto', name: t('pop.settings.langAuto') }, ...LANGS];
      pop.innerHTML = `<h2>${t('pop.settings')}</h2>
        <div class="row"><span>${t('pop.settings.preset')}</span>${seg('preset', [['25-5-15', '25 / 5'], ['50-10-20', '50 / 10'], ['90-20-30', '90 / 20']])}</div>
        <div class="row"><span>${t('pop.settings.focus')}</span>${stepper('focus')}</div>
        <div class="row"><span>${t('pop.settings.short')}</span>${stepper('short')}</div>
        <div class="row"><span>${t('pop.settings.long')}</span>${stepper('long')}</div>
        <div class="row"><span>${t('pop.settings.rounds')}</span>${stepper('rounds')}</div>
        <div class="row"><span>${t('pop.settings.autoFlow')}<small>${t('pop.settings.autoFlow.note')}</small></span>${sw('autoFlow', t('pop.settings.autoFlow'))}</div>
        <div class="row"><span>${t('pop.sound.chime')}</span>${seg('chime', [['soft', t('pop.sound.chime.soft')], ['bell', t('pop.sound.chime.bell')], ['digital', t('pop.sound.chime.digital')], ['none', t('pop.sound.off')]])}</div>
        <h3>${t('pop.settings.screen')}</h3>
        <div class="row"><span>${t('pop.settings.zen')}<small>${t('pop.settings.zen.note')}</small></span>${sw('zen', t('pop.settings.zen'))}</div>
        <div class="row"><span>${t('pop.settings.wave')}</span>${sw('wave', t('pop.settings.wave'))}</div>
        <div class="row"><span>${t('pop.settings.notify')}<small>${t('pop.settings.notify.note')}</small></span>${sw('notify', t('pop.settings.notify'))}</div>
        <h3>${t('pop.settings.language')}</h3>
        <div class="quick" role="group" aria-label="${t('pop.settings.language')}">${langs.map(l => `<button class="soft${(settings.lang || 'auto') === l.id ? ' on' : ''}" data-lang="${l.id}"${l.id === 'auto' ? '' : ` lang="${l.id}"`}>${esc(l.name)}</button>`).join('')}</div>
        <h3>${t('pop.settings.data')}</h3>
        <p>${t('pop.settings.data.note')}</p>
        <div class="two"><button class="soft" data-act="export">${t('pop.settings.export')}</button><button class="soft danger" data-act="clear">${t('pop.settings.clear')}</button></div>`;
    },
    help() {
      // Each row: what to press or type (key `help.<name>.keys`, or a key name that stays as it is) and what it does (`help.<name>`).
      const row = (name, keys) => [keys || t(`help.${name}.keys`), t(`help.${name}`)];
      const vibesShown = vibeIds().map(id => (shownVibes[id].toLowerCase() === id ? id : shownVibes[id])).join(' · ');
      const rows = [
        row('toggle', 'Space'), row('adjust'), row('arrows', '← →'), row('tapTime'), row('tapIcon'), row('scrollIcon'), row('swipe'), row('rightClick'),
        row('room'), row('focus'), row('break'), row('alarmAt'), row('every'), row('in'), row('vibe', vibesShown),
        row('plan'), row('scenes'), row('screen'), row('sound'), row('auto')
      ];
      pop.innerHTML = `<h2>${t('pop.help')}</h2><div class="help">${rows.map(([k, v]) => `<code>${esc(k)}</code><span>${v}</span>`).join('')}</div><p style="margin-top:12px">${t('pop.help.foot')}</p>`;
    }
  };

  // Bring the open popover up to date without rebuilding it, so its lights can slide instead of jump.
  let stepDir = 1;
  function syncPop() {
    if (!popName) return;
    const info = stage.info(), now = Date.now();
    pop.querySelectorAll('[data-sw]').forEach(b => b.setAttribute('aria-checked', !!settings[b.dataset.sw]));
    pop.querySelectorAll('.seg').forEach(s => {
      const btns = [...s.children], i = btns.findIndex(b => b.dataset.v === String(SEG[s.dataset.name]()));
      btns.forEach((b, k) => b.setAttribute('aria-pressed', k === i));
      s.toggleAttribute('data-none', i < 0);
      if (i >= 0) s.style.setProperty('--i', i);
    });
    pop.querySelectorAll('[data-out]').forEach(o => {
      const text = OUT[o.dataset.out]();
      if (o.textContent === text) return;
      o.textContent = text;
      o.style.setProperty('--dir', stepDir);
      o.classList.remove('tick'); void o.offsetWidth; o.classList.add('tick');
    });
    pop.querySelectorAll('.thumb').forEach(b => b.classList.toggle('on', b.dataset.vibe === info.vibe.id && +b.dataset.scene === info.index));
    pop.querySelectorAll('.vibe').forEach(v => v.classList.toggle('on', v.dataset.id === info.vibe.id));
    pop.querySelectorAll('[data-track]').forEach(b => b.classList.toggle('on', +b.dataset.track === tracks.index()));
    const nt = pop.querySelector('.now-title');
    if (nt) nt.innerHTML = nowTitle();
    const mute = pop.querySelector('[data-act="mute"]');
    if (mute) mute.innerHTML = icon(sound.muted ? 'mute' : 'vol');
    const vol = pop.querySelector('[data-range="volume"]');
    if (vol && document.activeElement !== vol) setLiq(vol, Math.round(settings.volume * 100));
    const mix = layerMix(), mi = moodIndex();
    pop.querySelectorAll('[data-layer]').forEach(inp => { if (document.activeElement !== inp) setLiq(inp, Math.round((mix[inp.dataset.layer] || 0) * 100)); });
    pop.querySelectorAll('[data-mood]').forEach(b => b.classList.toggle('on', +b.dataset.mood === mi));
    pop.querySelectorAll('.alarms li').forEach(li => {
      const a = alarms.all().find(x => x.id === li.dataset.id);
      if (!a) return;
      li.classList.toggle('off', !a.on);
      li.querySelector('.switch').setAttribute('aria-checked', a.on);
      li.querySelector('small').textContent = nextText(a, now);
    });
  }
  function setLiq(input, n) {
    input.value = n;
    input.parentElement.style.setProperty('--v', n + '%');
    input.parentElement.querySelector('em').textContent = n;
  }

  let popTimer = 0;
  function openPop(name) {
    if (popName === name) return closePop();
    closeCmd(); closeMenu(); closeStrip();
    clearTimeout(popTimer);
    pop.classList.remove('closing', 'still');
    pop.classList.toggle('jump', !popName);                         // already open: glide to the new icon instead
    popName = name;
    pop.classList.toggle('wide', name === 'settings');   // two columns, so it never needs to scroll
    pop.hidden = false;
    POPS[name]();
    syncPop();
    const chip = chipFor(name), r = chip.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    if (vertical()) {                                              // side rail: open beside it, level with the icon
      const mid = r.top + r.height / 2, top = clamp(mid - h / 2, 12, Math.max(12, innerHeight - h - 12));
      Object.assign(pop.style, { left: dock.getBoundingClientRect().right + 12 + 'px', top: top + 'px', bottom: 'auto' });
      pop.style.setProperty('--ox', '-30px');
      pop.style.setProperty('--oy', mid - top + 'px');
    } else {                                                       // bottom bar: open above it
      const mid = r.left + r.width / 2, left = clamp(mid - w / 2, 10, innerWidth - w - 10);
      Object.assign(pop.style, { left: left + 'px', top: '', bottom: '' });
      pop.style.setProperty('--ox', mid - left + 'px');
      pop.style.setProperty('--oy', 'calc(100% + 30px)');
    }
    pop.scrollTop = 0;
    dock.querySelectorAll('[data-pop]').forEach(c => c.setAttribute('aria-expanded', c.dataset.pop === name));
    dock.classList.add('open');
    moveBlob(chip);
    hideTip();
    wake();
  }
  function closePop() {
    if (!popName) return;
    popName = null;
    pop.classList.add('closing');
    popTimer = setTimeout(() => { pop.hidden = true; pop.classList.remove('closing'); }, 160);
    dock.querySelectorAll('[data-pop]').forEach(c => c.setAttribute('aria-expanded', false));
    if (!stripKey) dock.classList.remove('open');
    if (!dock.matches(':hover')) restBlob();
    wake();
  }
  // Rebuild the open popover (a list changed). Keeps scroll and what is typed in the alarm box.
  function refreshPop() {
    if (!popName) return;
    const y = pop.scrollTop, field = $('alarmIn'), text = field ? field.value : null, had = field && document.activeElement === field;
    pop.classList.add('still');
    POPS[popName]();
    syncPop();
    pop.scrollTop = y;
    const f = $('alarmIn');
    if (f && text != null) { f.value = text; if (had) f.focus(); }
  }
  bus.on('settings', patch => {
    renderDock();
    syncPop();
    syncStrip();
    // The YouTube box comes and goes with the choice. Rebuild after the light has finished sliding.
    const box = !!pop.querySelector('.yt-box');
    if (popName && ('ytUrl' in patch || ('sceneKind' in patch && popName === 'vibe') || (popName === 'sound' && ('music' in patch || 'musicStyle' in patch)) || box !== ytWanted())) setTimeout(refreshPop, 'ytUrl' in patch ? 0 : 420);
  });
  for (const ev of ['yt:playing', 'yt:fail']) bus.on(ev, () => { const r = $('ytRead'); if (r) r.textContent = ytStatus(); });
  bus.on('stats', () => { renderDock(); if (popName === 'stats') refreshPop(); });
  bus.on('tracks', () => { renderDock(); syncPop(); });
  bus.on('alarm:change', () => {
    renderDock();
    if (popName !== 'alarms') return;
    if (pop.querySelectorAll('.alarms li').length === alarms.all().length) syncPop(); else refreshPop();
  });

  let clearArmed = 0;
  pop.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const d = btn.dataset;
    if (d.sw) {
      saveSettings({ [d.sw]: !settings[d.sw] });
      if (d.sw === 'notify' && settings.notify) askNotify();
    } else if (d.seg) SEG_SET[d.seg](d.v);
    else if (d.step) {
      const [lo, hi, by] = STEP[d.step];
      stepDir = +d.d;
      saveSettings({ [d.step]: clamp(settings[d.step] + stepDir * by * (e.shiftKey ? 5 : 1), lo, hi) });
    } else if (d.vibe) {
      if (d.vibe === settings.vibe) goScene(+d.scene); else { leaveTube(); saveSettings({ vibe: d.vibe, scene: +d.scene }); }
    } else if (d.trk) { if (d.trk === 'next') tracks.next(); else tracks.prev(); }
    else if (d.track) tracks.select(+d.track, true);
    else if (d.mood) setMood(+d.mood);
    else if (d.quick) run(parseCommand(d.quick, []));
    else if (d.lang) setLang(d.lang);
    else if (d.alarm) alarms.toggle(d.alarm);
    else if (d.del) alarms.remove(d.del);
    else if (d.act === 'story') { closePop(); stage.preview(20); toast(t('toast.story')); }
    else if (d.act === 'mute') setMute(!sound.muted);
    else if ('yt' in d) saveSettings({ ytUrl: d.yt });
    else if (d.act === 'export') {
      const data = Object.fromEntries(['settings', 'timer', 'alarms', 'stats'].map(k => [k, store.get(k, null)]));
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: 'chilltimer-data.json' });
      a.click();
      URL.revokeObjectURL(a.href);
    } else if (d.act === 'clear') {
      if (Date.now() - clearArmed > 4000) { clearArmed = Date.now(); btn.textContent = t('pop.settings.clear.again'); return; }
      for (const k of ['settings', 'timer', 'alarms', 'stats', 'hinted']) localStorage.removeItem('ct2_' + k);
      location.reload();
    }
  });
  pop.addEventListener('input', e => {
    const el = e.target;
    if (el.type === 'range') {
      setLiq(el, +el.value);
      const v = el.value / 100;
      if (el.dataset.range === 'volume') { if (sound.muted) setMute(false); saveSettings({ volume: v }); }
      else if (el.dataset.layer) {
        sound.setLayer(el.dataset.layer, v);
        saveSettings({ layers: { ...settings.layers, [curVibe().id]: { ...layerMix(), [el.dataset.layer]: v } } });
      }
    } else if (el.id === 'alarmIn') {
      const c = parseAlarm(el.value);
      $('alarmRead').textContent = c ? '↵  ' + say(c) : el.value.trim() ? t('pop.alarms.help') : '';
    }
  });
  pop.addEventListener('keydown', e => {
    if (e.target.id !== 'alarmIn' && e.target.id !== 'ytIn') return;
    e.stopPropagation();
    if (e.key === 'Escape') return closePop();
    if (e.key !== 'Enter') return;
    if (e.target.id === 'ytIn') {
      const url = e.target.value.trim();
      if (url && !parseYouTube(url)) { $('ytRead').textContent = t('yt.bad'); return; }
      return saveSettings({ ytUrl: url });
    }
    const c = parseAlarm(e.target.value);
    if (!c) return;
    e.target.value = '';
    $('alarmRead').textContent = '';
    run(c);
  });

  addEventListener('pointerdown', e => {
    if (popName && !e.target.closest('.pop, .dock, .next-alarm, .menu')) closePop();
    if (stripKey && !e.target.closest('.strip, .dock, .digits-wrap, .menu')) closeStrip();
    if (!cmd.hidden && !e.target.closest('.cmd, .dock')) closeCmd();
    if (!menu.hidden && !e.target.closest('.menu')) closeMenu();
  });

  // ---------- running a command ----------
  const ACTIONS = {
    start: () => timer.start(), pause: () => timer.pause(), reset: () => timer.reset(), skip: () => timer.skip(),
    undo: () => { if (!timer.undo()) toast(t('toast.nothingToUndo')); },
    next: () => nextScene(1), prev: () => nextScene(-1),
    story: () => { if (stage.kind() === 'video') return toast(t('toast.storyDrawnOnly')); stage.preview(20); toast(t('toast.story')); },
    video: () => saveSettings({ sceneKind: 'video' }), drawn: () => saveSettings({ sceneKind: 'drawn' }),
    zen: () => { saveSettings({ zen: !settings.zen }); toast(t(settings.zen ? 'toast.zenOn' : 'toast.zenOff')); },
    mini: toggleMini, full: toggleFull,
    mute: () => { setMute(true); toast(t('toast.muted')); },
    unmute: () => { setMute(false); toast(t('toast.soundOn')); },
    music: () => { saveSettings({ music: !settings.music }); toast(t(settings.music ? 'toast.musicOn' : 'toast.musicOff')); },
    tracks: () => { saveSettings({ music: true, musicStyle: 'tracks' }); tracks.play(); toast(t('toast.playingTrack', { title: tracks.current().title })); },
    auto: () => { saveSettings({ autoFlow: !settings.autoFlow }); toast(t(settings.autoFlow ? 'toast.autoOn' : 'toast.autoOff')); },
    alarms: () => openPop('alarms'), sound: () => openPop('sound'), stats: () => openPop('stats'), settings: () => openPop('settings'), help: () => openPop('help'),
    piano: () => { saveSettings({ music: true, musicStyle: 'piano' }); toast(t('do.on', { name: t('pop.sound.piano') })); },
    beat: () => { saveSettings({ music: true, musicStyle: 'beat' }); toast(t('do.on', { name: t('pop.sound.beat') })); },
    wave: () => setSwitch('wave', !settings.wave), notify: () => setSwitch('notify', !settings.notify),
    tour: () => $('tourBtn').click()
  };
  function setSwitch(key, on) {
    saveSettings({ [key]: on });
    toast(say({ type: 'switch', key, on }));
    if (key === 'notify' && on) askNotify();
  }
  function setLang(id) {                                           // save it, then load the page again in it
    saveSettings({ lang: id });
    const url = new URL(location.href);
    url.searchParams.delete('lang');
    location.replace(url.href);
  }
  function run(c) {
    switch (c.type) {
      case 'focus':
        if (!c.ms && timer.state.mode === 'focus') timer.start(); else timer.startMode('focus', c.ms);
        break;
      case 'break': timer.startMode(c.mode, c.ms); break;
      case 'alarmAt': case 'alarmEvery': case 'alarmIn':
        alarms.add(c);
        toast(say(c));
        askNotify();
        break;
      case 'vibe': if (c.id !== settings.vibe) saveSettings({ vibe: c.id, scene: 0 }); break;
      case 'volume': setMute(false); saveSettings({ volume: c.v }); toast(say(c)); break;
      case 'action': ACTIONS[c.name](); break;
      case 'youtube':
        if (c.url) { if (parseYouTube(c.url)) useTube(c.url); else toast(t('yt.bad')); break; }
        saveSettings({ ytUrl: '', ...(settings.sceneKind === 'youtube' && { sceneKind: 'drawn' }), ...(settings.musicStyle === 'youtube' && { musicStyle: null }) });
        toast(say(c));
        break;
      case 'layer': {                                              // the same as the ring and the Sound panel
        const mix = layerMix(), v = c.v ?? ((mix[c.k] || 0) > 0.01 ? 0 : 0.5);
        sound.setLayer(c.k, v);
        saveSettings({ layers: { ...settings.layers, [curVibe().id]: { ...mix, [c.k]: v } } });
        toast(say({ ...c, v }));
        break;
      }
      case 'switch': setSwitch(c.key, c.on); break;
      case 'track':
        tracks.select(c.n ? Math.min(c.n, TRACKS.length) - 1 : tracks.index() + c.step, true);
        saveSettings({ music: true, musicStyle: 'tracks' });
        toast(t('toast.playingTrack', { title: tracks.current().title }));
        break;
      case 'chime': SEG_SET.chime(c.v); toast(say(c)); break;
      case 'plan': saveSettings({ focus: c.focus, short: c.short, ...(c.long && { long: c.long }) }); toast(say(c)); break;
      case 'rounds': saveSettings({ rounds: c.n }); toast(say(c)); break;
      case 'goal': saveSettings({ goal: c.m }); toast(say(c)); break;
      case 'lang': setLang(c.id); break;
    }
  }

  function askNotify() {
    if (settings.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }

  // ---------- right-click menu: our own, and it depends on what was clicked ----------
  let menuItems = [], menuTimer = 0;
  function buildMenu(target) {
    const s = timer.state, info = stage.info(), items = [];
    const add = (label, run, key, on) => items.push({ label, run, key, on });
    const sep = () => { if (items.length && items[items.length - 1] !== 'sep') items.push('sep'); };
    const chip = target.closest('.chip'), block = target.closest('.plan button');
    const zone = target.closest('.ring') ? 'ring' : target.closest('.digits-wrap') ? 'time' : block ? 'block'
      : target.closest('.next-alarm') ? 'alarms' : chip ? chip.dataset.k || chip.dataset.pop || chip.dataset.act
      : target.closest('.pop, .cmd, .toasts, .controls, .top, .dock') ? 'ui' : 'scene';
    let title = 'ChillTimer';

    if (zone === 'ring') {
      add(t('ring.dismiss'), () => alarms.dismiss(), '↵');
      add(t('ring.snooze'), () => alarms.snooze(5), 'S');
      add(t('menu.snooze15'), () => alarms.snooze(15));
      return { title: t('menu.title.ring'), items };
    }
    if (zone === 'time') {
      title = t('menu.title.time');
      add(t('menu.typeTime'), openEdit);
      add(t('menu.add1'), () => adjust(1), '↑');
      add(t('menu.take1'), () => adjust(-1), '↓');
      add(t('menu.add5'), () => adjust(5), '⇧ ↑');
      add(t('action.reset'), () => timer.reset());
    } else if (zone === 'block') {
      const i = +block.dataset.i;
      title = t('menu.title.block', { mode: modeName(timer.plan()[i]), min: block.dataset.min });
      if (i !== s.planIndex) {
        add(t('menu.jump'), () => timer.jump(i));
        add(t('menu.jumpStart'), () => { timer.jump(i); timer.start(); });
      } else add(t('action.reset'), () => timer.reset());
      add(t('menu.lengths'), () => openPop('settings'));
    } else if (zone === 'sound' || zone === 'mood') {
      title = t('menu.title.sound');
      add(t(sound.muted ? 'menu.unmute' : 'menu.mute'), sound.muted ? ACTIONS.unmute : ACTIONS.mute);
      add(t(settings.music ? 'menu.musicOff' : 'menu.musicOn'), ACTIONS.music);
      if (settings.music && settings.musicStyle === 'tracks') { add(t('tracks.next'), () => tracks.next()); add(t('tracks.prev'), () => tracks.prev()); }
      add(t(settings.wave ? 'menu.waveHide' : 'menu.waveShow'), () => saveSettings({ wave: !settings.wave }));
      add(t('menu.mixer'), () => openPop('sound'));
    } else if (zone === 'alarms') {
      title = t('menu.title.alarms');
      for (const [c, l] of [['in 5m', t('menu.ringIn', { min: 5 })], ['in 15m', t('menu.ringIn', { min: 15 })], ['in 30m', t('menu.ringIn', { min: 30 })], ['in 1h', t('menu.ringIn1h')]]) add(l, () => run(parseCommand(c, [])));
      const up = alarms.upcoming();
      if (up) add(t('menu.deleteNext', { time: hhmm(up.next) }), () => alarms.remove(up.id));
      add(t('menu.allAlarms'), () => openPop('alarms'));
    } else if (zone === 'stats') { title = t('menu.title.stats'); add(t('menu.openStats'), () => openPop('stats')); }
    else if (zone === 'settings') { title = t('menu.title.settings'); add(t('menu.openSettings'), () => openPop('settings')); }
    else if (zone === 'scene' || zone === 'vibe') {
      title = info ? t('vibeScene', { vibe: vibeName(info.vibe), scene: sceneName(info.scene) }) : t('menu.title.scene');
      add(t('action.next'), () => nextScene(1), '→');
      add(t('action.prev'), () => nextScene(-1), '←');
      for (const v of Object.values(VIBES)) if (v.id !== settings.vibe) add(t('menu.switchTo', { name: vibeName(v) }), () => saveSettings({ vibe: v.id, scene: 0 }));
      if (settings.sceneKind === 'youtube') { add(t('menu.ytStop'), ACTIONS.drawn); add(t('menu.ytChange'), () => openPop('vibe')); }
      else if (stage.kind() === 'video') add(t('action.drawn'), ACTIONS.drawn);
      else { add(t('action.video'), ACTIONS.video); add(t('menu.story'), ACTIONS.story); }
      if (settings.sceneKind !== 'youtube') add(t('menu.ytUse'), () => { saveSettings({ sceneKind: 'youtube' }); if (popName !== 'vibe') openPop('vibe'); });
      add(t('pop.vibe.autoScene'), () => saveSettings({ autoScene: !settings.autoScene }), '', settings.autoScene);
    }
    sep();
    add(toggleLabel(), () => timer.toggle(), 'Space');
    add(t('action.skip'), () => timer.skip());
    sep();
    add(t('pop.settings.zen'), ACTIONS.zen, '', settings.zen);
    add(t(document.fullscreenElement ? 'menu.fullLeave' : 'menu.full'), toggleFull);
    if (mini.supported) add(t('menu.mini'), toggleMini);
    sep();
    add(t('menu.cmd'), () => openCmd(''));
    add(t('pop.help'), () => openPop('help'));
    return { title, items };
  }
  function openMenu(x, y, target, byKey) {
    const m = buildMenu(target);
    menuItems = m.items;
    menu.innerHTML = `<i class="menu-blob"></i><h4>${esc(m.title)}</h4>` + m.items.map((it, i) => (it === 'sep' ? '<hr>'
      : `<button role="menuitem" data-i="${i}"${it.on != null ? ` aria-checked="${!!it.on}"` : ''}><span>${esc(it.label)}</span>${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}</button>`)).join('');
    clearTimeout(menuTimer);
    menu.classList.remove('closing');
    menu.hidden = false;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    const left = x + w + 8 > innerWidth ? Math.max(8, x - w) : x, top = y + h + 8 > innerHeight ? Math.max(8, innerHeight - h - 8) : y;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.setProperty('--ox', x - left + 'px');
    menu.style.setProperty('--oy', y - top + 'px');
    menu.style.animation = 'none'; void menu.offsetWidth; menu.style.animation = '';
    hideTip();
    wake();
    if (byKey) menu.querySelector('button')?.focus();
  }
  function closeMenu() {
    if (menu.hidden || menu.classList.contains('closing')) return;
    menu.classList.add('closing');
    menuTimer = setTimeout(() => { menu.hidden = true; menu.classList.remove('closing'); }, 120);
    wake();
  }
  const menuBlob = b => {
    const bl = menu.querySelector('.menu-blob');
    if (!bl) return;
    if (!b) return bl.classList.remove('on');
    bl.classList.toggle('jump', !bl.classList.contains('on'));
    bl.style.transform = `translateY(${b.offsetTop}px)`;
    bl.classList.add('on');
  };
  addEventListener('contextmenu', e => {
    if (e.target.closest('input, textarea')) return;               // text boxes keep the browser's menu, for paste
    e.preventDefault();
    const byKey = e.button < 0 || (!e.clientX && !e.clientY), r = byKey ? (document.activeElement || body).getBoundingClientRect() : null;
    openMenu(byKey ? r.left + r.width / 2 : e.clientX, byKey ? r.top + r.height / 2 : e.clientY, byKey ? document.activeElement || body : e.target, byKey);
  });
  menu.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const it = menuItems[+b.dataset.i];
    closeMenu();
    it.run();
  });
  menu.addEventListener('pointerover', e => menuBlob(e.target.closest('button')));
  menu.addEventListener('pointerleave', () => menuBlob(null));
  menu.addEventListener('focusin', e => menuBlob(e.target.closest('button')));
  menu.addEventListener('keydown', e => {
    e.stopPropagation();
    const btns = [...menu.querySelectorAll('button')], i = btns.indexOf(document.activeElement);
    if (e.key === 'Escape') closeMenu();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length].focus();
    }
  });
  for (const ev of ['resize', 'blur', 'wheel']) addEventListener(ev, closeMenu, { passive: true });

  // ---------- command line ----------
  // On a computer the command box always holds the keyboard, even while it is out of sight, so the
  // very first key already goes into it. Chinese, Japanese and Korean input methods need this: they
  // only work inside a text box, and a first key typed anywhere else would be lost or left in Latin.
  // On a touch screen nothing is focused by itself, so no on-screen keyboard pops up.
  const input = $('cmdInput'), read = $('cmdRead'), listEl = $('cmdList');
  const keysReady = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const rest = () => { if (keysReady && document.activeElement === body) input.focus({ preventScroll: true }); };
  document.addEventListener('focusout', () => setTimeout(rest, 0));
  let hits = [], sel = -1, choosing = false;
  // seed: the text to start with; null keeps what is already typed.
  function openCmd(seed) {
    closePop(); closeMenu(); closeStrip();
    cmd.hidden = false;
    body.classList.add('cmd-open');
    if (seed != null) input.value = seed;
    input.focus();
    refreshCmd();
    hideTip();
    wake();
  }
  function closeCmd() {
    if (cmd.hidden) return;
    cmd.hidden = true;
    body.classList.remove('cmd-open');
    input.value = '';
    if (!keysReady) input.blur();
    wake();
  }
  // A mood or a scene typed by name, in English or in the user's language.
  const named = (text, item, shown) => { const q = text.trim().toLowerCase(); return !!q && (item.name.toLowerCase() === q || shown.toLowerCase() === q); };
  const moodNamed = text => moods().findIndex(m => named(text, m, moodName(m)));
  const sceneNamed = text => {
    for (const id of [curVibe().id, ...vibeIds()]) {
      const i = stage.items(id).findIndex(sc => named(text, sc, sceneName(sc)));
      if (i >= 0) return { id, i, name: sceneName(stage.items(id)[i]) };
    }
    return null;
  };
  const goNamedScene = ({ id, i }) => { if (id === settings.vibe) goScene(i); else { leaveTube(); saveSettings({ vibe: id, scene: i }); } };
  const isTube = text => /youtu/i.test(text) && !!parseYouTube(text);
  // A YouTube link becomes the background and the music in one go.
  // A link has no spaces, so "youtube <link>" and "play <link>" keep only the link.
  const useTube = url => { saveSettings({ ytUrl: url.trim().split(/\s+/).pop(), sceneKind: 'youtube', music: true, musicStyle: 'youtube' }); toast(t('toast.youtubeSet')); };
  // While typing, the suggestions come from the examples, the group examples, actions and names.
  const chips = Object.values(cmdTable.groups || {}).flat().filter(x => !x.endsWith('…') && !cmdTable.examples.some(([e]) => e === x));
  const local = {
    examples: [...cmdTable.examples, ...[...chips, 'youtube off'].filter(x => parse(x)).map(x => [x, say(parse(x)).toLowerCase()])],
    words: firstWords, names: { ...shownLayers, ...shownVibes }
  };
  // The empty box shows examples in small groups. A tap runs one; one ending in "…" only goes into the box.
  const ideas = $('cmdIdeas');
  ideas.innerHTML = Object.entries(cmdTable.groups || {}).map(([g, list]) => `<div class="cmd-group"><small>${esc(t('cmd.group.' + g))}</small>${
    list.map(x => `<button class="soft" tabindex="-1" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>`).join('');
  ideas.addEventListener('pointerdown', e => { if (e.target.closest('[data-ex]')) e.preventDefault(); });   // the keyboard stays in the box
  ideas.addEventListener('click', e => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    const text = b.dataset.ex.replace(/\s*…$/, ' ');
    if (parse(text) || moodNamed(text) >= 0 || sceneNamed(text)) return submit(text);
    input.value = text;
    input.focus();
    refreshCmd();
  });
  // Pointing at an example says what it would do, in the line under the box.
  ideas.addEventListener('pointerover', e => {
    const b = e.target.closest('[data-ex]'), c = b && parse(b.dataset.ex);
    if (c) { read.classList.remove('no'); read.textContent = '↵  ' + say(c); }
  });
  ideas.addEventListener('pointerleave', () => { if (!input.value.trim()) refreshCmd(); });
  function refreshCmd() {
    const text = input.value, parsed = parse(text), scene = parsed ? null : sceneNamed(text);
    const sure = line => { hits = []; sel = -1; ideas.hidden = true; read.classList.remove('no'); read.textContent = '↵  ' + line; drawHits(); };
    if (isTube(text)) return sure(t('cmd.read.youtube'));
    if (moodNamed(text) >= 0) return sure(t('cmd.read.mood', { name: moodName(moods()[moodNamed(text)]) }));
    if (scene) return sure(t('cmd.read.scene', { name: scene.name }));
    const choices = parsed || !text.trim() ? [] : guess(text);
    choosing = choices.length > 1;
    hits = choosing ? choices.map(x => ({ text: x, hint: say(parseCommand(x, vibeIds())).toLowerCase() }))
      : text.trim() ? suggest(text, vibeIds(), t, local).filter(h => h.text.toLowerCase() !== text.trim().toLowerCase()) : [];
    ideas.hidden = !!text.trim();
    sel = -1;
    read.classList.toggle('no', !parsed);
    read.textContent = parsed ? '↵  ' + say(parsed)
      : t(!text.trim() ? 'cmd.read.empty' : choosing ? 'cmd.read.which' : /^(youtube|play)$/i.test(text.trim()) ? 'yt.placeholder' : hits.length ? 'cmd.read.partial' : 'cmd.read.unknown');
    drawHits();
  }
  function drawHits() {
    listEl.innerHTML = hits.map((h, i) => `<li class="${i === sel ? 'sel' : ''}" data-i="${i}"><b>${esc(h.text)}</b><span>${esc(h.hint)}</span></li>`).join('');
  }
  function submit(text) {
    if (isTube(text)) { closeCmd(); return useTube(text); }
    if (moodNamed(text) >= 0) { const m = moodNamed(text); closeCmd(); setMood(m); return toast(t('toast.mood', { name: moodName(moods()[m]) })); }
    const scene = parse(text) ? null : sceneNamed(text);
    if (scene) { closeCmd(); return goNamedScene(scene); }
    const c = parse(text) || (hits.length && !choosing ? parse(hits[0].text) : null);        // two meanings: the person picks
    if (!c) { cmd.classList.remove('shake'); void cmd.offsetWidth; cmd.classList.add('shake'); return; }
    closeCmd();
    run(c);
  }
  input.addEventListener('input', () => {
    if (!cmd.hidden) return refreshCmd();
    // Out of sight: the first typed text brings the box up. A lone space is the start / pause key.
    if (!input.value.trim()) { if (input.value) { input.value = ''; timer.toggle(); } return; }
    openCmd(null);
  });
  input.addEventListener('compositionstart', () => { if (cmd.hidden) openCmd(null); });
  input.addEventListener('keydown', e => {
    if (cmd.hidden) return;                                        // out of sight: keys are page shortcuts, handled below
    e.stopPropagation();
    if (e.isComposing || e.keyCode === 229) return;                // an input method is still putting the word together
    if (e.key === 'Escape') closeCmd();
    else if (e.key === 'Enter') submit(sel >= 0 ? hits[sel].text : input.value);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hits.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + hits.length + (sel < 0 && e.key === 'ArrowUp' ? 1 : 0)) % hits.length;
      drawHits();
    } else if (e.key === 'Tab' && hits.length) {
      e.preventDefault();
      input.value = hits[Math.max(0, sel)].text;
      refreshCmd();
    }
  });
  listEl.addEventListener('pointerdown', e => {
    const li = e.target.closest('li');
    if (li) { e.preventDefault(); submit(hits[+li.dataset.i].text); }
  });

  // Paste anywhere: a YouTube link is used at once, other text goes to the command line.
  addEventListener('paste', e => {
    const at = document.activeElement;
    if (at && /^(INPUT|TEXTAREA)$/.test(at.tagName) && !(at === input && cmd.hidden)) return;
    const text = ((e.clipboardData && e.clipboardData.getData('text')) || '').trim();
    if (!text) return;
    e.preventDefault();
    if (isTube(text)) useTube(text); else openCmd(text.slice(0, 120));
  });

  // ---------- keys ----------
  addEventListener('keydown', e => {
    hideTip();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement, waiting = el === input && cmd.hidden;      // the command box, out of sight
    const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !waiting;
    if (!menu.hidden) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); menu.querySelector('button')?.focus(); return; }
      closeMenu();
      if (e.key === 'Escape') return;
    }
    if (alarms.ringing()) {
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); alarms.dismiss(); }
      else if (e.key.toLowerCase() === 's') { e.preventDefault(); alarms.snooze(5); }
      return;
    }
    if (e.key === 'Escape') { if (stripKey) closeStrip(); else if (popName) closePop(); else if (settings.zen) saveSettings({ zen: false }); return; }
    if (typing) return;
    const onControl = el && el !== body && /^(BUTTON|A)$/.test(el.tagName);
    if (e.key === ' ') { if (!onControl) { e.preventDefault(); timer.toggle(); } return; }
    const dialK = el && el.classList && el.classList.contains('chip') ? el.dataset.k : null;      // arrows turn a focused dial
    if (dialK && ROLL[dialK] && /^Arrow/.test(e.key)) { e.preventDefault(); ROLL[dialK](e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); adjust((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 1)); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); nextScene(e.key === 'ArrowRight' ? 1 : -1); return; }
    if (waiting) return;                                           // the key goes straight into the command box, which shows itself
    if (e.key.length === 1) { e.preventDefault(); openCmd(e.key); }   // any character starts a command
    else if (e.key === 'Process' || e.keyCode === 229) openCmd('');  // an input method is on: give it the box
  });

  // ---------- alarm banner ----------
  const ring = $('ring');
  bus.on('alarm:ring', a => {
    closePop(); closeCmd(); closeMenu();
    $('ringLabel').textContent = a.label || t('ring.alarm');
    $('ringSub').textContent = `${alarmTitle(a)} · ${hhmm(Date.now())}`;
    ring.hidden = false;
    body.classList.add('ringing');
    wake();
  });
  bus.on('alarm:stop', () => { ring.hidden = true; body.classList.remove('ringing'); renderTitle(); wake(); });
  press($('ringSnooze'), () => { alarms.snooze(5); toast(t('toast.snoozed')); });
  press($('ringDismiss'), () => alarms.dismiss());

  // ---------- scene label + chapter title ----------
  const chapter = $('chapter');
  bus.on('scene:change', info => {
    renderDock();
    syncPop();
    if (stripKey === 'vibe') { drawStrip(); placeStrip(); }
    $('chapterNo').textContent = `${vibeName(info.vibe)} · ${ROMAN[info.index] || info.index + 1}`;
    $('chapterName').textContent = sceneName(info.scene);
    chapter.classList.remove('show');
    void chapter.offsetWidth;
    chapter.classList.add('show');
    favKey = '';
    drawFavicon();
  });

  // ---------- once a beat: clock, live signs, countdowns, title flash ----------
  let beatN = 0;
  bus.on('beat', now => {
    if (beatN++ % 4) return;                                       // about once a second
    const text = hhmm(now), clock = $('clock');
    if (clock.textContent !== text) clock.textContent = text;
    renderDock();
    if (popName === 'alarms') syncPop();
    const r = alarms.ringing();
    if (r) document.title = (beatN >> 2) % 2 ? `⏰ ${r.label || t('ring.alarm')}` : '· · ·';
  });

  // ---------- sound wave ----------
  // A line of water along the bottom. Four swells of different lengths travel across it, two one way and
  // two the other. How tall each swell stands comes from one part of the sound: the bass lifts the long
  // swell, the highs the fine ripple. Each part is measured against its own slow average, so steady rain
  // keeps the water low and a note or a beat lifts it. Because the swells keep moving, no bump stays in
  // one place (the old line had its lows fixed in the middle, and they bounced there).
  const wave = $('wave'), wg = wave.getContext('2d');
  const SWELL = [                                                   // from Hz, to Hz, crests across the screen, crests per second, share of the height
    [60, 160, 2.3, 0.06, 0.36], [160, 520, 4.1, -0.09, 0.3], [520, 2000, 7.3, 0.14, 0.2], [2000, 9000, 12.7, -0.22, 0.14]
  ];
  const amp = new Float32Array(4), calm = new Float32Array(4), phase = [0, 1.7, 3.1, 4.4], POINTS = 120;
  const stillWave = matchMedia('(prefers-reduced-motion: reduce)').matches;   // then the water rises and falls but does not travel
  let freq = null, waveClear = true, waveAt = 0;
  const sizeWave = () => { const r = Math.min(devicePixelRatio || 1, 2); wave.width = Math.round(wave.clientWidth * r); wave.height = Math.round(wave.clientHeight * r); waveClear = false; };
  addEventListener('resize', sizeWave);
  sizeWave();
  (function drawWave(ts = 0) {
    requestAnimationFrame(drawWave);
    const dt = Math.min(0.05, (ts - waveAt) / 1000);
    waveAt = ts;
    const an = settings.wave ? sound.analyser() : null;
    if (an) {
      if (!freq || freq.length !== an.frequencyBinCount) freq = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(freq);
    }
    let peak = 0;
    for (let k = 0; k < 4; k++) {
      let v = 0;
      if (an) {
        const binHz = an.context.sampleRate / an.fftSize, a = Math.max(1, Math.round(SWELL[k][0] / binHz)), b = Math.min(freq.length - 1, Math.round(SWELL[k][1] / binHz));
        let sum = 0;
        for (let i = a; i <= b; i++) sum += freq[i];
        const now = sum / (b - a + 1) / 255;                         // 0..1 across the analyser's loudness range
        calm[k] += (now - calm[k]) * 0.012;                          // this part's own average over the last second or two
        v = clamp(0.36 * clamp((calm[k] - 0.12) / 0.66, 0, 1) + 3.8 * (now - calm[k]), 0, 1);   // low when steady, plus what just changed
      }
      amp[k] += (v - amp[k]) * (v > amp[k] ? 0.4 : 0.08);
      if (!stillWave) phase[k] += SWELL[k][3] * dt * Math.PI * 2;
      peak = Math.max(peak, amp[k]);
    }
    const w = wave.width, h = wave.height;
    if (peak < 0.006) { if (!waveClear) { wg.clearRect(0, 0, w, h); waveClear = true; } return; }
    waveClear = false;
    const c = curVibe().accent, pts = [];
    for (let j = 0; j <= POINTS; j++) {
      const u = j / POINTS;
      let y = 0;
      for (let k = 0; k < 4; k++) y += amp[k] * SWELL[k][4] * (0.5 + 0.5 * Math.sin(u * SWELL[k][2] * Math.PI * 2 + phase[k]));
      pts.push([u * w, h - 2 - y * (h - 8)]);
    }
    const trace = () => {
      wg.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j <= POINTS; j++) wg.quadraticCurveTo(pts[j - 1][0], pts[j - 1][1], (pts[j - 1][0] + pts[j][0]) / 2, (pts[j - 1][1] + pts[j][1]) / 2);
      wg.lineTo(w, pts[POINTS][1]);
    };
    wg.clearRect(0, 0, w, h);
    const fill = wg.createLinearGradient(0, 0, 0, h);
    fill.addColorStop(0, hexA(c, 0.5)); fill.addColorStop(1, hexA(c, 0.03));
    wg.fillStyle = fill;
    wg.beginPath(); trace(); wg.lineTo(w, h); wg.lineTo(0, h); wg.closePath(); wg.fill();
    wg.strokeStyle = hexA(c, 0.95);
    wg.lineWidth = Math.max(1, h / 56);
    wg.beginPath(); trace(); wg.stroke();
  })();

  renderDock();
  rest();
  return { toast, openPop, run };
}
