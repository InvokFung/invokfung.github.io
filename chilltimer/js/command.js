// Parser for the "Just type" box. Pure: no DOM, no storage. Checked by test.mjs.
// It reads the English grammar only. Commands typed in other languages are turned into English first
// (normalizeCommand in i18n.js). The texts it shows come from the translate function `t` passed in.

import { fmtSpan, LANGS } from './i18n.js';
import en from './lang/en.js';

export const LAYERS = ['rain', 'fire', 'vinyl', 'wind', 'forest', 'ocean'];      // room sounds, the same list as sound.LAYERS
// Settings that take "on" / "off". The name of each is the dictionary key beside it.
const SWITCH = { zen: 'zen', wave: 'wave', notifications: 'notify', notify: 'notify', auto: 'autoFlow', music: 'music' };
export const SWITCH_NAME = { zen: 'pop.settings.zen', wave: 'pop.settings.wave', notify: 'pop.settings.notify', autoFlow: 'pop.settings.autoFlow', music: 'pop.sound.music' };
const ONOFF = { on: true, off: false };
const PRESETS = { '25/5': 15, '50/10': 20, '90/20': 30 };     // the presets of the Settings panel, with their long break
const langOf = (s, ids) => (LANGS.find(l => l.name.toLowerCase() === s || (ids && l.id.toLowerCase() === s)) || {}).id;

const UNIT = { s: 1e3, sec: 1e3, secs: 1e3, second: 1e3, seconds: 1e3, m: 6e4, min: 6e4, mins: 6e4, minute: 6e4, minutes: 6e4, h: 36e5, hr: 36e5, hrs: 36e5, hour: 36e5, hours: 36e5 };
const UNIT_RE = /^(\d+(?:\.\d+)?)(hours|hour|hrs|hr|h|minutes|minute|mins|min|m|seconds|second|secs|sec|s)/;

// "25" → 25 min · "90s" · "45m" · "1h30" · "1h 30m" · "1.5h"
export function parseDuration(str) {
  let rest = String(str).toLowerCase().replace(/\s+/g, '');
  if (/^\d+(\.\d+)?$/.test(rest)) return +rest > 0 ? +rest * 6e4 : null;
  let ms = 0, any = false, m;
  while ((m = UNIT_RE.exec(rest))) { ms += +m[1] * UNIT[m[2]]; rest = rest.slice(m[0].length); any = true; }
  if (any && /^\d+$/.test(rest)) { ms += +rest * 6e4; rest = ''; }   // "1h30"
  return any && rest === '' && ms > 0 ? ms : null;
}

// "14:30" · "7pm" · "7:05am". A bare "7" is a duration, not a clock.
export function parseClock(str) {
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/i.exec(String(str).replace(/\s+/g, ''));
  if (!m || (m[2] == null && !m[3])) return null;
  let h = +m[1];
  const min = +(m[2] || 0), ap = (m[3] || '').toLowerCase();
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === 'pm' ? 12 : 0); }
  return h < 24 && min < 60 ? { h, m: min } : null;
}

// Reads a clock from the front of a word list. Accepts "7 pm" as two words.
function takeClock(words) {
  if (words.length > 1 && /^(am|pm)$/i.test(words[1])) {
    const c = parseClock(words[0] + words[1]);
    if (c) return { clock: c, rest: words.slice(2) };
  }
  const c = words.length ? parseClock(words[0]) : null;
  return c ? { clock: c, rest: words.slice(1) } : null;
}

// The actions. Each one's description is the dictionary key `action.<name>`.
export const ACTIONS = [
  'start', 'pause', 'reset', 'skip', 'undo', 'next', 'prev', 'story', 'video', 'drawn', 'zen', 'mini', 'full',
  'tracks', 'mute', 'unmute', 'music', 'auto', 'alarms', 'sound', 'stats', 'settings', 'help',
  'piano', 'beat', 'wave', 'notify', 'tour'
];
const ALIAS = { go: 'start', play: 'start', stop: 'pause', fullscreen: 'full', pip: 'mini', scene: 'next', back: 'prev', '?': 'help', notifications: 'notify' };

export function parseCommand(text, vibeIds = []) {
  const t = String(text).trim();
  if (!t) return null;
  const words = t.split(/\s+/);
  const head = words[0].toLowerCase();
  const tail = words.slice(1);
  const one = tail.length === 1, arg = one ? tail[0].toLowerCase() : '';
  // "daily 7:00 wake up": the repeat word may also come first.
  if (/^(daily|weekdays|once)$/.test(head) && tail.length) {
    const c = parseCommand(tail.join(' ') + ' ' + head, vibeIds);
    return c && c.type === 'alarmAt' ? c : null;
  }

  // A YouTube link: alone, or after "youtube" or "play". "youtube off" stops it.
  const last = words[words.length - 1];
  if (/youtu(?:\.be|be\.com)\//i.test(last) && (words.length === 1 || (one && (head === 'youtube' || head === 'play')))) return { type: 'youtube', url: last };
  if (head === 'youtube' && (arg === 'off' || arg === 'stop')) return { type: 'youtube', url: '' };
  // A room sound: "rain" switches it on or off, "rain 60" sets it, "rain off".
  if (LAYERS.includes(head) && tail.length <= 1) {
    if (!one) return { type: 'layer', k: head };
    const v = arg === 'on' ? 50 : arg === 'off' ? 0 : /^\d+%?$/.test(arg) ? parseInt(arg) : -1;
    return v >= 0 && v <= 100 ? { type: 'layer', k: head, v: v / 100 } : null;
  }
  if (SWITCH[head] && arg in ONOFF) return { type: 'switch', key: SWITCH[head], on: ONOFF[arg] };
  if ((head === 'next' || head === 'prev' || head === 'previous') && (arg === 'track' || arg === 'song')) return { type: 'track', step: head === 'next' ? 1 : -1 };
  if (head === 'track' && /^\d+$/.test(arg) && +arg > 0) return { type: 'track', n: +arg };
  if (head === 'chime' && one) return ['soft', 'bell', 'digital', 'off'].includes(arg) ? { type: 'chime', v: arg === 'off' ? 'none' : arg } : null;
  // The plan: "25/5" (a preset), "45/10/20" (focus / break / long break).
  const plan = /^(\d+)\/(\d+)(?:\/(\d+))?$/.exec(t);
  if (plan) {
    const focus = +plan[1], short = +plan[2], long = plan[3] ? +plan[3] : PRESETS[`${focus}/${short}`];
    return focus >= 1 && focus <= 180 && short >= 1 && short <= 60 && !(long > 90) ? { type: 'plan', focus, short, ...(long && { long }) } : null;
  }
  if (head === 'rounds' && one) return /^\d+$/.test(arg) && +arg >= 1 && +arg <= 8 ? { type: 'rounds', n: +arg } : null;
  if (head === 'goal' && tail.length) {
    const m = Math.round((parseDuration(tail.join('')) || 0) / 6e4);
    return m >= 15 && m <= 600 ? { type: 'goal', m } : null;
  }
  // A language by its own name ("日本語"), or "language ja", "language auto".
  if (words.length === 1 && langOf(head)) return { type: 'lang', id: langOf(head) };
  if (head === 'language' && one) { const id = arg === 'auto' ? 'auto' : langOf(arg, true); return id ? { type: 'lang', id } : null; }
  if (t.toLowerCase() === 'how to use') return { type: 'action', name: 'tour' };

  if (head === 'every' || head === 'in') {
    const two = tail.length > 1 && /^[a-z]+$/i.test(tail[1]) ? parseDuration(tail[0] + tail[1]) : null;   // "every 30 minutes"
    const ms = two || (tail.length ? parseDuration(tail[0]) : null);
    if (!ms) return null;
    return { type: head === 'every' ? 'alarmEvery' : 'alarmIn', ms, label: tail.slice(two ? 2 : 1).join(' ') };
  }

  const tc = takeClock(head === 'at' || head === 'alarm' ? tail : words);
  if (tc) {
    let repeat = 'once';
    const last = (tc.rest[tc.rest.length - 1] || '').toLowerCase();
    if (last === 'daily' || last === 'weekdays' || last === 'once') { repeat = last; tc.rest.pop(); }
    return { type: 'alarmAt', h: tc.clock.h, m: tc.clock.m, repeat, label: tc.rest.join(' ') };
  }
  if (head === 'at' || head === 'alarm') return null;

  if (head === 'focus' || head === 'work') {
    const ms = tail.length ? parseDuration(tail.join('')) : undefined;
    return ms === null ? null : { type: 'focus', ms };
  }
  if (head === 'break' || head === 'short' || head === 'long') {
    const ms = tail.length ? parseDuration(tail.join('')) : undefined;
    return ms === null ? null : { type: 'break', mode: head === 'long' ? 'long' : 'short', ms };
  }
  if (head === 'vol' || head === 'volume') {
    const v = Number(tail[0]);
    return tail.length === 1 && v >= 0 && v <= 100 ? { type: 'volume', v: v / 100 } : null;
  }
  if (head === 'vibe' && tail.length === 1 && vibeIds.includes(tail[0].toLowerCase())) return { type: 'vibe', id: tail[0].toLowerCase() };

  if (words.length === 1) {
    if (vibeIds.includes(head)) return { type: 'vibe', id: head };
    const name = ALIAS[head] || head;
    if (ACTIONS.includes(name)) return { type: 'action', name };
  }
  const ms = parseDuration(t);
  return ms ? { type: 'focus', ms } : null;
}

const pad = n => String(n).padStart(2, '0');

// One line that says what Enter will do. `t` is the translate function.
export function describe(cmd, t, now = Date.now()) {
  const span = ms => fmtSpan(ms, t), L = cmd.label ? '.label' : '', label = cmd.label;
  switch (cmd.type) {
    case 'focus': return cmd.ms ? t('do.focusFor', { span: span(cmd.ms) }) : t('do.focus');
    case 'break': return t(`do.${cmd.mode}${cmd.ms ? 'For' : ''}`, { span: cmd.ms ? span(cmd.ms) : '' });
    case 'alarmAt': {
      const d = new Date(now); d.setHours(cmd.h, cmd.m, 0, 0);
      if (d.getTime() <= now) d.setDate(d.getDate() + 1);
      const rep = cmd.repeat === 'once' ? '' : '.' + cmd.repeat;
      return t(`do.alarmAt${rep}${L}`, { time: `${pad(cmd.h)}:${pad(cmd.m)}`, label, span: span(d.getTime() - now) });
    }
    case 'alarmEvery': return t(`do.alarmEvery${L}`, { span: span(cmd.ms), label });
    case 'alarmIn': return t(`do.alarmIn${L}`, { span: span(cmd.ms), label });
    case 'vibe': return t('do.vibe', { name: cmd.name || cmd.id });
    case 'volume': return t('do.volume', { n: Math.round(cmd.v * 100) });
    case 'action': return t(`action.${cmd.name}`);
    case 'youtube': return t(cmd.url ? 'cmd.read.youtube' : 'do.youtubeOff');
    case 'layer': {
      const name = t(`layer.${cmd.k}`);
      return cmd.v == null ? t('do.layerToggle', { name }) : cmd.v ? t('do.layer', { name, n: Math.round(cmd.v * 100) }) : t('do.off', { name });
    }
    case 'switch': return t(cmd.on ? 'do.on' : 'do.off', { name: t(SWITCH_NAME[cmd.key]) });
    case 'track': return cmd.n ? t('do.track', { n: cmd.n }) : t(cmd.step > 0 ? 'tracks.next' : 'tracks.prev');
    case 'chime': return cmd.v === 'none' ? t('do.chimeOff') : t('do.chime', { name: t(`pop.sound.chime.${cmd.v}`) });
    case 'plan': return t(cmd.long ? 'do.plan.long' : 'do.plan', cmd);
    case 'rounds': return t('do.rounds', { n: cmd.n });
    case 'goal': return t('do.goal', { span: span(cmd.m * 6e4) });
    case 'lang': return cmd.id === 'auto' ? t('do.langAuto') : t('do.lang', { name: LANGS.find(l => l.id === cmd.id).name });
  }
  return '';
}

// Completions for what is typed so far. Empty input → examples.
// local (all optional): examples [[text, hint]], words { action → word in the user's language },
// names { vibe id or room sound → shown name }. A word or name is offered instead of the English one when it differs.
export function suggest(text, vibeIds, t, local = {}) {
  const q = String(text).trim().toLowerCase(), ex = local.examples || [], words = local.words || {}, names = local.names || {};
  if (!q) return ex.map(([text, hint]) => ({ text, hint }));
  const out = [];
  const own = (en, word) => (word && word.toLowerCase() !== en ? word : en);
  for (const id of vibeIds) {
    const shown = own(id, names[id]);
    if (shown.toLowerCase().startsWith(q) || id.startsWith(q)) out.push({ text: shown, hint: t('cmd.hint.vibe') });
  }
  for (const k of LAYERS) {
    const shown = own(k, names[k]);
    if (shown.toLowerCase().startsWith(q) || k.startsWith(q)) out.push({ text: shown, hint: t('do.layerToggle', { name: t(`layer.${k}`) }).toLowerCase() });
  }
  for (const name of ACTIONS) {
    const shown = own(name, words[name]);
    if (shown.toLowerCase().startsWith(q) || name.startsWith(q)) out.push({ text: shown, hint: t(`action.${name}`).toLowerCase() });
  }
  for (const [text, hint] of ex) if (text.toLowerCase().startsWith(q) && text.toLowerCase() !== q) out.push({ text, hint });
  return out.slice(0, 6);
}

// ---------- plain sentences ----------
// Tried only when the exact forms above find nothing. It reads an everyday sentence and turns it into the
// exact forms: "help create 45mins alarm" → "in 45m", "turn off the rain" → "rain off", "关掉雨声" → "rain off".
// No model and no network: the word lists in `like` (in each cmd table; English always works too) and the
// rules in build(). It returns the exact forms the sentence could mean: one is the answer, two or more are
// choices to show, none means "not understood".
const KNOWN = new Set([...ACTIONS, ...LAYERS, ...Object.keys(SWITCH), ...Object.keys(ALIAS), 'every', 'in', 'at', 'alarm', 'focus', 'work',
  'break', 'short', 'long', 'vol', 'chime', 'soft', 'bell', 'digital', 'on', 'off', 'track', 'language', 'rounds', 'goal', 'youtube', 'daily', 'weekdays']);
const CJK = { 零: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const cjkNum = w => (w.includes('十') ? (CJK[w.split('十')[0]] ?? 1) * 10 + (CJK[w.split('十')[1]] || 0) : [...w].reduce((n, c) => n * 10 + CJK[c], 0));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = list => list.map(esc).join('|');
const kind = c => (/[a-z]/.test(c || '') ? 1 : /[\uac00-\ud7a3]/.test(c || '') ? 2 : 0);   // 1 latin, 2 Korean: words with spaces between them
const byLength = list => list.sort((a, b) => b[0].length - a[0].length);

export function readSentence(text, table = {}, vibeIds = []) {
  const a = en.cmd.like, b = table.like || {}, like = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) like[k] = Array.isArray(a[k] || b[k]) ? [...(a[k] || []), ...(b[k] || [])] : { ...a[k], ...b[k] };
  let s = ` ${String(text).normalize('NFKC').toLowerCase().replace(/[,!?;，。！？、]|\.(?!\d)/g, ' ')} `;

  // 1. numbers and times written in words: "half an hour" → 30m, 两个小时 → 2个小时, 下午3点半 → 15:30
  for (const [w, v] of byLength(Object.entries(like.nums || {}))) s = s.replace(new RegExp(`(?<![a-z])${esc(w)}(?![a-z])`, 'g'), ` ${v} `);
  s = s.replace(/[零一二两兩三四五六七八九十]+(?=\s*[个個]?\s*(?:小|分|秒|点|點|時|时|钟|鐘|半))/g, cjkNum);
  const ck = like.clock;
  if (ck && ck.h) {
    const re = new RegExp(`(${alt([...ck.am, ...ck.pm])})?\\s*(\\d{1,2})\\s*(?:${alt(ck.h)})(?![间間간])\\s*(?:(\\d{1,2})\\s*(?:${alt(ck.m)})?|(${alt(ck.half)}))?`, 'g');
    s = s.replace(re, (_, ap, h, m, half) => {
      h = +h;
      if (ck.pm.includes(ap) && h < 12) h += 12;
      if (ck.am.includes(ap) && h === 12) h = 0;
      return ` ${h}:${half ? '30' : String(m || 0).padStart(2, '0')} `;
    });
  }
  // 2. units: 45 minutes → 45m, 30分钟 → 30m, "1h 30m" → 1h30m
  const units = byLength(Object.entries(table.units || {}).flatMap(([u, list]) => list.map(w => [w.toLowerCase(), u])));
  if (units.length) s = s.replace(new RegExp(`(\\d)\\s*(${alt(units.map(([w]) => w))})`, 'g'), (_, d, w) => d + units.find(([x]) => x === w)[1]);
  s = s.replace(/(\d)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])/g, (_, d, u) => d + u[0]);
  s = s.replace(/(\d[hms])\s+(?=\d+(?:\.\d+)?[hms](?![a-z]))/g, '$1');

  // 3. the pieces: known words (t), lengths (d), clock times (c), numbers (n), and the words left over (label)
  const vocab = [];
  for (const [tok, list] of Object.entries(like)) if (Array.isArray(list)) for (const w of list) vocab.push([w.toLowerCase(), tok]);
  for (const [tok, list] of Object.entries(table.words || {})) for (const w of list) vocab.push([w.toLowerCase(), tok]);
  for (const [name, tok] of Object.entries(table.names || {})) vocab.push([name.toLowerCase(), tok]);
  byLength(vocab);
  const fits = (w, i) => s.startsWith(w, i) && !(kind(w[0]) && kind(w[0]) === kind(s[i - 1])) && !(kind(w.at(-1)) && kind(w.at(-1)) === kind(s[i + w.length]));
  const p = { t: [], d: [], c: [], n: [], label: [] };
  let chunk = '';
  const flush = () => { if (chunk) p.label.push(chunk); chunk = ''; };
  // A one-letter Chinese or Japanese word (关, を) counts only when it stands apart, so 开会 stays a name;
  // a filler one (我, に) may also open a name: 我泡茶 → 泡茶.
  const apart = j => j >= s.length || /[\s\d]/.test(s[j]) || kind(s[j]) || vocab.some(([w]) => fits(w, j));
  const split = w => { const out = []; for (let j = 0; j < w.length;) { const v = vocab.find(([x]) => w.startsWith(x, j)); if (!v) return null; out.push(v[1]); j += v[0].length; } return out; };
  for (let i = 0, m; i < s.length;) {
    const rest = s.slice(i);
    if ((m = /^(\d{1,2}:\d{2}(?:\s*[ap]m)?|\d{1,2}\s*[ap]m)(?![a-z\d])/.exec(rest))) { flush(); p.c.push(m[0].replace(/\s/g, '')); }
    else if ((m = /^\d+(?:\.\d+)?[hms](?:\d+(?:\.\d+)?[hms])*(?![a-z])/.exec(rest))) { flush(); p.d.push(m[0]); }
    else if ((m = /^\d+(?:\.\d+)?%?/.exec(rest))) { flush(); p.n.push(parseFloat(m[0])); }
    else if ((m = vocab.find(([w, v]) => fits(w, i) && (w.length > 1 || kind(w) || (!chunk && (apart(i + 1) || v === 'fill')))))) { flush(); p.t.push(...m[1].split(' ')); }
    else if (kind(s[i])) {                                         // an English or Korean word; Korean ones may end in 을, 를, 줘…
      m = [(kind(s[i]) === 1 ? /^[a-z'-]+/ : /^[\uac00-\ud7a3]+/).exec(rest)[0]];
      flush();
      const toks = KNOWN.has(m[0]) || vibeIds.includes(m[0]) ? [ALIAS[m[0]] || m[0]] : kind(s[i]) === 2 ? split(m[0]) : null;
      if (toks) p.t.push(...toks); else p.label.push(m[0]);
    } else { if (/\s/.test(s[i])) flush(); else chunk += s[i]; i++; continue; }
    i += m[0].length;
  }
  flush();
  const seen = new Set();
  return build(p, vibeIds).map(x => x.replace(/\s+/g, ' ').trim()).filter(x => {
    const c = parseCommand(x, vibeIds), key = JSON.stringify(c);
    return c && !seen.has(key) && seen.add(key);
  });
}

// The pieces → exact forms. Alarms first (their leftover words are the name), then breaks and focus,
// then settings and sounds, and plain actions last.
function build(p, vibeIds) {
  const has = k => p.t.includes(k), any = (...k) => k.some(has);
  const label = p.label.join(' '), rep = has('daily') ? ' daily' : has('weekdays') ? ' weekdays' : '';
  const n = p.n[0], d = p.d[0] || (n != null ? n + 'm' : '');
  const c = p.c[0] || (has('at') && n < 24 ? n + ':00' : '');
  const val = any('off', 'stop', 'pause', 'mute') ? 'off' : any('on', 'start') ? 'on' : '';
  const alarm = any('alarm', 'alarms');
  if (has('every') && d) return [`every ${d} ${label}`];
  if (c && (alarm || any('at', 'daily', 'weekdays') || p.t.every(x => x === 'fill'))) return [`${c} ${label}${rep}`];
  const named = p.d[0] && label && p.t.every(x => x === 'fill');   // "10m tea": a length, then a name
  if (((alarm && d) || (has('in') && p.d[0]) || named) && !any('focus', 'break', 'long')) return [`in ${d} ${label}`];
  if (p.label.length > 1) return [];                               // too many words we do not know: do not guess
  if (any('break', 'short', 'long')) return [`${has('long') ? 'long' : 'break'} ${p.d[0] || (n ? n + 'm' : '')}`];
  if (has('focus')) return [p.d[0] || n ? `focus ${d}` : any('stop', 'pause') ? 'pause' : has('start') ? 'start' : 'focus'];
  const out = [], lang = p.t.find(x => x.startsWith('lang:'));
  if (has('tour')) out.push('tour');
  if (lang) out.push('language ' + lang.slice(5));
  else if (has('language') && has('auto')) out.push('language auto');
  for (const k of LAYERS) if (has(k)) out.push(`${k} ${n != null ? n : val}`);
  if (has('vol') && n != null) out.push(`vol ${n}`);
  if (has('track') && n) out.push(`track ${n}`);
  else if (has('track') && any('next', 'prev')) out.push(has('next') ? 'next track' : 'previous track');
  for (const k of ['piano', 'beat', 'tracks']) if (has(k)) out.push(k);
  if (has('music') && !any('piano', 'beat', 'tracks', 'track')) out.push(`music ${val}`);
  if (has('youtube') && val === 'off') out.push('youtube off');
  for (const k of ['zen', 'wave', 'notify']) if (has(k)) out.push(`${k} ${val}`);
  if (has('auto') && !has('language')) out.push(`auto ${val}`);
  const chime = ['soft', 'bell', 'digital'].find(has) || (val === 'off' && 'off');
  if (has('chime') && chime) out.push('chime ' + chime);
  if (has('rounds') && n) out.push(`rounds ${n}`);
  if (has('goal') && d) out.push(`goal ${d}`);
  for (const id of vibeIds) if (has(id)) out.push(id);
  if (!out.length && alarm) out.push('alarms');
  if (!out.length && p.d[0]) out.push(`focus ${p.d[0]}`);          // "25 minutes please"
  if (!out.length && has('sound') && val) out.push(val === 'off' ? 'mute' : 'unmute');
  if (!out.length) {                                               // plain actions, the verbs last: "start again" → reset
    const acts = [...new Set(p.t.map(x => (x === 'stop' ? 'pause' : x === 'again' ? 'reset' : x)).filter(x => ACTIONS.includes(x)))];
    const plain = acts.filter(x => x !== 'start' && x !== 'pause');
    out.push(...(plain.length ? plain : acts));
  }
  return out;
}
