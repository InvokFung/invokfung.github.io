// Languages. Every text a person can see or hear comes from one dictionary in js/lang/.
// English (en.js) holds every key. A key missing from another language falls back to English.
// Imports cleanly in Node: the browser parts are guarded, so test.mjs can use the pure parts.

import { settings } from './bus.js';
import en from './lang/en.js';

export const LANGS = [
  { id: 'en', name: 'English' }, { id: 'zh-Hans', name: '简体中文' }, { id: 'zh-Hant', name: '繁體中文' },
  { id: 'ja', name: '日本語' }, { id: 'ko', name: '한국어' }
];

// One language code ("zh-TW", "ja-JP", "en") → one of our ids, or null when we do not have it.
function match(code) {
  const c = String(code || '').toLowerCase();
  if (/^zh\b/.test(c)) return /hant|-tw|-hk|-mo/.test(c) ? 'zh-Hant' : 'zh-Hans';
  for (const id of ['ja', 'ko', 'en']) if (c === id || c.startsWith(id + '-')) return id;
  return null;
}

// Pure. `wanted` is 'auto' or a code. With 'auto', the first browser language we have wins.
export function pickLang(wanted, browserLangs = []) {
  if (wanted && wanted !== 'auto') return match(wanted) || 'en';
  for (const b of browserLangs || []) { const id = match(b); if (id) return id; }
  return 'en';
}

const inBrowser = typeof document !== 'undefined';
const urlLang = inBrowser ? new URLSearchParams(location.search).get('lang') : null;     // ?lang=ja, for testing
const browserLangs = inBrowser && typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
export const lang = pickLang(urlLang || settings.lang || 'auto', browserLangs);

let dict = en;
if (lang !== 'en') {
  try { dict = (await import(`./lang/${lang}.js`)).default || en; }
  catch (err) { console.warn(`Language "${lang}" did not load, using English.`, err); }
}
if (inBrowser) document.documentElement.lang = lang;

// The command words of the language in use. A part the translator left out comes from English.
export const cmd = { ...en.cmd, ...(dict.cmd || {}) };

// Text for a key. {name} slots are filled from vars. A value may also be a function of vars.
export function t(key, vars) {
  let v = key in dict ? dict[key] : key in en ? en[key] : key;
  if (typeof v === 'function') v = v(vars || {});
  return vars ? String(v).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : v;
}

// Name of a thing (scene, vibe, mood, clip, layer): dictionary first, then the name in the data file.
export const tn = (prefix, id, fallback) => {
  const key = `${prefix}.${id}`;
  return key in dict ? dict[key] : key in en ? en[key] : fallback;
};

// 90 s → "2 min", 133 min → "2 h 13 min". `tr` is the translate function (tests pass their own).
export function fmtSpan(ms, tr = t) {
  if (ms < 6e4) return tr('span.s', { s: Math.round(ms / 1e3) });
  const total = Math.round(ms / 6e4), h = Math.floor(total / 60), m = total % 60;
  return h ? (m ? tr('span.hm', { h, m }) : tr('span.h', { h })) : tr('span.m', { m });
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const UNITS = 'hours|hour|hrs|hr|h|mins|min|m|secs|sec|s';
const DUR = `\\d+(?:\\.\\d+)?(?:(?:${UNITS})\\d*(?:\\.\\d+)?)*`;   // 30 · 30m · 1h30 · 1h30m (each part after the first starts with a unit)
const isDur = s => new RegExp(`^${DUR}$`, 'i').test(s);
const VALUE = /^(on|off|soft|bell|digital|auto)$/;                 // words that come after a setting: 音乐 关 → music off

// Pure. A command typed in the user's language → the English grammar parseCommand reads.
// `table` is a dictionary's `cmd` object, plus `names`: { 'shown name': 'english word' } (vibe names).
// The shape of `cmd` is explained at the top of the cmd section in js/lang/en.js.
export function normalizeCommand(text, table = {}) {
  let s = String(text).normalize('NFKC').trim();                  // full-width ３０分 → 30分
  if (!s) return s;

  // 1. unit words after a number: 30分钟 → 30m, 1小時30分 → 1h30m
  const units = Object.entries(table.units || {}).flatMap(([u, list]) => list.map(w => [w.toLowerCase(), u]))
    .sort((a, b) => b[0].length - a[0].length);
  if (units.length) {
    const unitOf = Object.fromEntries(units);
    s = s.replace(new RegExp(`(\\d)\\s*(${units.map(([w]) => esc(w)).join('|')})`, 'gi'), (_, d, w) => d + unitOf[w.toLowerCase()]);
  }

  // 2. "every", "in" and "track" patterns, with the number on either side: 每{d} · {d}ごと · {d} 후 · 第{d}首
  for (const kind of ['every', 'in', 'track']) {
    for (const p of table[kind] || []) {
      if (!p.includes('{d}')) continue;
      const body = p.split('{d}').map(part => part.trim().split(/\s+/).map(esc).join('\\s*')).join(`\\s*(${DUR})\\s*`);
      const m = new RegExp('^' + body, 'i').exec(s);
      if (m) return `${kind} ${m[1]} ${s.slice(m[0].length).trim()}`.trim();
    }
  }

  // 3. words: one native word → its English word
  const map = {};
  for (const [word, list] of Object.entries(table.words || {})) for (const w of list) map[w.toLowerCase()] = word;
  for (const [name, word] of Object.entries(table.names || {})) map[name.toLowerCase()] = word;
  const low = s.toLowerCase();
  if (map[low]) return map[low];

  // A word and a number or an on/off word, in either order, with or without a space:
  // 休息10m · 10m 休憩 · 音量 40 · 关雨声 · 音楽をオフ
  const natives = Object.keys(map).sort((a, b) => b.length - a.length);
  const value = r => { const v = map[r.toLowerCase()]; return v && VALUE.test(v) ? v : null; };
  for (const w of natives) {
    for (const rest of [low.startsWith(w) && s.slice(w.length).trim(), low.endsWith(w) && s.slice(0, -w.length).trim()]) {
      if (rest && isDur(rest)) return `${map[w]} ${rest}`;
      if (rest && !VALUE.test(map[w]) && value(rest)) return `${map[w]} ${value(rest)}`;
    }
  }

  // Otherwise swap only the first word, a vibe name after "vibe", a repeat word at the end, and an
  // on/off word after a setting ("音乐 关"). The words in between are a label, so they stay as typed.
  const parts = s.split(/\s+/);
  const swap = (i, ok) => { const w = map[parts[i].toLowerCase()]; if (w && ok(w)) parts[i] = w; };
  swap(0, () => true);
  if (parts.length === 2 && parts[0] === 'vibe') swap(1, () => true);
  if (parts.length > 1) swap(parts.length - 1, w => /^(daily|weekdays|once)$/.test(w) || (parts.length === 2 && !/\d/.test(parts[0]) && VALUE.test(w)));
  return parts.join(' ');
}

// Fills the static HTML: data-i18n="key" sets the text, data-i18n-attr="aria-label:key; data-tip:key" sets attributes.
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map(x => x.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}
