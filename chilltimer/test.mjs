// Self-check for the pure logic. Run: node test.mjs
import assert from 'node:assert/strict';
import { parseDuration, parseClock, parseCommand, describe, suggest, readSentence } from './js/command.js';
import { nextFire, alarms } from './js/alarms.js';
import { buildPlan, clockText, timer } from './js/timer.js';
import { saveSettings } from './js/bus.js';
import { pickLang, normalizeCommand, fmtSpan, t, lang } from './js/i18n.js';
import en from './js/lang/en.js';
import { readFileSync, readdirSync } from 'node:fs';
import { TRACKS } from './js/tracks.js';

const MIN = 60000;

// durations
assert.equal(parseDuration('25'), 25 * MIN);
assert.equal(parseDuration('45m'), 45 * MIN);
assert.equal(parseDuration('90s'), 90000);
assert.equal(parseDuration('1h30'), 90 * MIN);
assert.equal(parseDuration('1h 30m'), 90 * MIN);
assert.equal(parseDuration('1.5h'), 90 * MIN);
assert.equal(parseDuration('abc'), null);
assert.equal(parseDuration('0'), null);

// clocks
assert.deepEqual(parseClock('14:30'), { h: 14, m: 30 });
assert.deepEqual(parseClock('7pm'), { h: 19, m: 0 });
assert.deepEqual(parseClock('12am'), { h: 0, m: 0 });
assert.deepEqual(parseClock('12:05pm'), { h: 12, m: 5 });
assert.equal(parseClock('7'), null);
assert.equal(parseClock('25:00'), null);
assert.equal(parseClock('13pm'), null);

// commands
const V = ['cozy', 'lofi'];
assert.deepEqual(parseCommand('45', V), { type: 'focus', ms: 45 * MIN });
assert.deepEqual(parseCommand('focus', V), { type: 'focus', ms: undefined });
assert.deepEqual(parseCommand('break 10', V), { type: 'break', mode: 'short', ms: 10 * MIN });
assert.deepEqual(parseCommand('long', V), { type: 'break', mode: 'long', ms: undefined });
assert.deepEqual(parseCommand('14:30 standup', V), { type: 'alarmAt', h: 14, m: 30, repeat: 'once', label: 'standup' });
assert.deepEqual(parseCommand('at 9:00 gym daily', V), { type: 'alarmAt', h: 9, m: 0, repeat: 'daily', label: 'gym' });
assert.deepEqual(parseCommand('7 pm', V), { type: 'alarmAt', h: 19, m: 0, repeat: 'once', label: '' });
assert.deepEqual(parseCommand('every 30m drink water', V), { type: 'alarmEvery', ms: 30 * MIN, label: 'drink water' });
assert.deepEqual(parseCommand('in 10m tea', V), { type: 'alarmIn', ms: 10 * MIN, label: 'tea' });
assert.deepEqual(parseCommand('lofi', V), { type: 'vibe', id: 'lofi' });
assert.deepEqual(parseCommand('vol 40', V), { type: 'volume', v: 0.4 });
assert.deepEqual(parseCommand('pip', V), { type: 'action', name: 'mini' });
assert.equal(parseCommand('every', V), null);
assert.equal(parseCommand('banana', V), null);
assert.equal(parseCommand('', V), null);
assert.match(describe(parseCommand('every 30m water', V), t), /every 30 min — water/);
assert.equal(describe(parseCommand('break 10', V), t), 'Short break for 10 min, starts now');
assert.equal(describe(parseCommand('skip', V), t), 'Skip to the next block');
assert.equal(suggest('sk', V, t)[0].text, 'skip');
assert.equal(suggest('co', V, t)[0].text, 'cozy');
assert.equal(suggest('', V, t, { examples: en.cmd.examples }).length, 6);
assert.equal(suggest('跳', V, t, { words: { skip: '跳过' } })[0].text, '跳过');   // a word in the user's language is offered

// the settings, typed
const P = s => parseCommand(s, V);
const YT = 'https://youtu.be/dQw4w9WgXcQ';
assert.deepEqual(P(YT), { type: 'youtube', url: YT });
assert.deepEqual(P('youtube ' + YT), { type: 'youtube', url: YT });
assert.deepEqual(P('play ' + YT), { type: 'youtube', url: YT });
assert.deepEqual(P('youtube off'), { type: 'youtube', url: '' });
assert.equal(P('youtube'), null);                            // the word alone waits for a link
assert.deepEqual(P('play'), { type: 'action', name: 'start' });
assert.deepEqual(P('rain 60'), { type: 'layer', k: 'rain', v: 0.6 });
assert.deepEqual(P('fire off'), { type: 'layer', k: 'fire', v: 0 });
assert.deepEqual(P('wind'), { type: 'layer', k: 'wind' });
assert.equal(P('rain 140'), null);
assert.deepEqual(P('piano'), { type: 'action', name: 'piano' });
assert.deepEqual(P('music off'), { type: 'switch', key: 'music', on: false });
assert.deepEqual(P('next track'), { type: 'track', step: 1 });
assert.deepEqual(P('previous track'), { type: 'track', step: -1 });
assert.deepEqual(P('track 3'), { type: 'track', n: 3 });
assert.deepEqual(P('chime bell'), { type: 'chime', v: 'bell' });
assert.deepEqual(P('chime off'), { type: 'chime', v: 'none' });
assert.deepEqual(P('zen on'), { type: 'switch', key: 'zen', on: true });
assert.deepEqual(P('wave off'), { type: 'switch', key: 'wave', on: false });
assert.deepEqual(P('notifications on'), { type: 'switch', key: 'notify', on: true });
assert.deepEqual(P('auto off'), { type: 'switch', key: 'autoFlow', on: false });
assert.deepEqual(P('wave'), { type: 'action', name: 'wave' });
assert.deepEqual(P('25/5'), { type: 'plan', focus: 25, short: 5, long: 15 });
assert.deepEqual(P('90/20'), { type: 'plan', focus: 90, short: 20, long: 30 });
assert.deepEqual(P('rounds 6'), { type: 'rounds', n: 6 });
assert.deepEqual(P('goal 2h'), { type: 'goal', m: 120 });
assert.deepEqual(P('english'), { type: 'lang', id: 'en' });
assert.deepEqual(P('한국어'), { type: 'lang', id: 'ko' });
assert.deepEqual(P('language auto'), { type: 'lang', id: 'auto' });
assert.equal(P('ko'), null);                                 // a bare language code is not a language
assert.deepEqual(P('how to use'), { type: 'action', name: 'tour' });
assert.deepEqual(P('every 30 minutes water'), { type: 'alarmEvery', ms: 30 * MIN, label: 'water' });
assert.deepEqual(P('daily 7:00 run'), { type: 'alarmAt', h: 7, m: 0, repeat: 'daily', label: 'run' });
assert.equal(describe(P('rain 60'), t), 'Rain at 60%');
assert.equal(describe(P('wave off'), t), 'Sound wave: off');
assert.equal(describe(P('50/10'), t), 'Focus 50 min, break 10 min, long break 20 min');
assert.equal(describe(P('goal 2h'), t), 'Daily goal: 2 h');
assert.equal(describe(P('日本語'), t), 'Switch the language to 日本語');
assert.equal(suggest('ra', V, t)[0].text, 'rain');

// languages
assert.equal(lang, 'en');                                   // Node: no browser, so English
assert.equal(pickLang('auto', ['en-US']), 'en');
assert.equal(pickLang('auto', ['zh-CN']), 'zh-Hans');
assert.equal(pickLang('auto', ['zh-TW']), 'zh-Hant');
assert.equal(pickLang('auto', ['zh-HK']), 'zh-Hant');
assert.equal(pickLang('auto', ['zh-Hant-SG']), 'zh-Hant');
assert.equal(pickLang('auto', ['zh']), 'zh-Hans');
assert.equal(pickLang('auto', ['ja-JP']), 'ja');
assert.equal(pickLang('auto', ['ko']), 'ko');
assert.equal(pickLang('auto', ['fr-FR', 'de']), 'en');
assert.equal(pickLang('auto', ['fr-FR', 'ko-KR']), 'ko');   // the first language we have wins
assert.equal(pickLang('auto', []), 'en');
assert.equal(pickLang('ja', ['zh-CN']), 'ja');              // a saved choice beats the browser
assert.equal(pickLang('xx', ['ja']), 'en');
assert.equal(fmtSpan(133 * MIN), '2 h 13 min');
assert.equal(fmtSpan(30000), '30 s');
assert.equal(t('mode.focusRound', { n: 2, of: 4 }), 'Focus · round 2 of 4');
assert.equal(t('strip.stats.line', { min: 50, goal: 120, rounds: 1, streak: 3 }), '50 of 120 min · 1 round · 3-day streak');
assert.equal(t('no.such.key'), 'no.such.key');

// commands typed in another language: a made-up table, both word orders
const ZZ = {
  units: { h: ['hora'], m: ['minu', 'mi'], s: ['seku'] },
  every: ['kada {d}', '{d} ciklo'],
  in: ['post {d}', '{d} poste'],
  words: { skip: ['salti'], break: ['pauzo'], long: ['longa'], vol: ['laŭte'], daily: ['ĉiutage'], alarm: ['alarmo'] },
  names: { Komforta: 'cozy' }
};
const nc = s => normalizeCommand(s, ZZ);
assert.equal(nc('kada 30minu akvo'), 'every 30m akvo');      // keyword before the duration
assert.equal(nc('30mi ciklo akvo'), 'every 30m akvo');       // keyword after the duration
assert.equal(nc('post 10 teo'), 'in 10 teo');
assert.equal(nc('10minu poste teo'), 'in 10m teo');
assert.equal(nc('1hora30minu'), '1h30m');
assert.equal(nc('salti'), 'skip');
assert.equal(nc('pauzo 10'), 'break 10');
assert.equal(nc('10mi pauzo'), 'break 10m');
assert.equal(nc('longa20minu'), 'long 20m');
assert.equal(nc('laŭte 40'), 'vol 40');
assert.equal(nc('komforta'), 'cozy');
assert.equal(nc('vibe Komforta'), 'vibe cozy');
assert.equal(nc('14:30 kunveno ĉiutage'), '14:30 kunveno daily');
assert.equal(nc('alarmo 7pm salti'), 'alarm 7pm salti');     // words inside a label stay as typed
assert.equal(nc('１４：３０ teo'), '14:30 teo');              // full-width digits
assert.equal(nc('every 30m water'), 'every 30m water');      // English still passes through
assert.deepEqual(parseCommand(nc('kada 30minu akvo'), V), { type: 'alarmEvery', ms: 30 * MIN, label: 'akvo' });
assert.deepEqual(parseCommand(nc('10mi pauzo'), V), { type: 'break', mode: 'short', ms: 10 * MIN });
assert.equal(normalizeCommand('every 30m water', en.cmd), 'every 30m water');
assert.equal(normalizeCommand('in 3s tea', {}), 'in 3s tea');
for (const [text] of en.cmd.examples) assert.ok(parseCommand(normalizeCommand(text, en.cmd), V), text);

// every literal key used with t('…') or tn('…') in js/*.js is in en.js
const used = new Set();
for (const dir of ['js', 'js/scenes']) {
  const here = new URL(dir + '/', import.meta.url);                // next to this file, wherever the test is run from
  for (const f of readdirSync(here).filter(f => f.endsWith('.js'))) {
    const src = readFileSync(new URL(f, here), 'utf8');
    for (const m of src.matchAll(/(?<![\w.$])t\(\s*'([^'{}$]+)'\s*[,)]/g)) used.add(m[1]);
  }
}
const missing = [...used].filter(k => !(k in en));
assert.deepEqual(missing, [], 'keys missing from en.js: ' + missing.join(', '));
assert.ok(used.size > 150, 'the key scan found too few keys: ' + used.size);
// keys built from a name: every action, mode and toast reason
for (const k of ['start', 'pause', 'reset', 'skip', 'undo', 'next', 'prev', 'story', 'video', 'drawn', 'zen', 'mini', 'full',
  'tracks', 'mute', 'unmute', 'music', 'auto', 'alarms', 'sound', 'stats', 'settings', 'help', 'piano', 'beat', 'wave', 'notify', 'tour']) assert.ok('action.' + k in en, k);
for (const k of ['mode.focus', 'mode.short', 'mode.long', 'toast.yt.load', 'toast.yt.link', 'toast.yt.removed', 'toast.yt.owner', 'toast.yt.other']) assert.ok(k in en, k);
const { MOODS } = await import('./js/moods.js');
for (const list of Object.values(MOODS)) for (const m of list) assert.equal(en['mood.' + m.id], m.name);
// names used with tn(): vibes, scenes, clips, room sound layers
const { CLIPS } = await import('./js/scenes/video.js');
for (const id of ['cozy', 'lofi']) {
  const v = (await import(`./js/scenes/${id}.js`)).default;
  assert.equal(en['vibe.' + v.id], v.name);
  assert.equal(en[`vibe.${v.id}.tagline`], v.tagline);
  for (const sc of v.scenes) assert.equal(en['scene.' + sc.id], sc.name);
  for (const c of CLIPS[id]) assert.equal(en['clip.' + c.id], c.name);
}
for (const k of ['rain', 'fire', 'vinyl', 'wind', 'forest', 'ocean']) assert.ok('layer.' + k in en, k);
// the other dictionaries only hold keys that English has
for (const id of ['zh-Hans', 'zh-Hant', 'ja', 'ko']) {
  const d = (await import(`./js/lang/${id}.js`)).default;
  for (const k in d) assert.ok(k in en, `${id}.js has a key English does not: ${k}`);
}
// every example in the empty box works in its own language (room sound and vibe names come from the dictionary,
// as ui.js does it), and a few typed settings per language
const SENTENCES = {
  en: [
    ['help create 45mins alarm', 'in 45m'], ['set an alarm for 45 minutes', 'in 45m'], ['alarm in 45 min', 'in 45m'], ['10m tea', 'in 10m tea'],
    ['wake me up at 7:30', '7:30'], ['set alarm 7:30 am for gym', '7:30am gym'], ['remind me at 3pm to call mom', '3pm call mom'],
    ['remind me to drink water every 30 minutes', 'every 30m drink water'], ['every hour stretch', 'every 1h stretch'],
    ['remind me in half an hour to call mom', 'in 30m call mom'], ['wake me up at 6:45 every day', '6:45 daily'],
    ['start a 25 minute focus', 'focus 25'], ['set timer for 30 minutes', 'focus 30'], ['i want to focus for 50 min', 'focus 50'],
    ['take a 10 minute break', 'break 10'], ['long break', 'long'],
    ['turn off the rain', 'rain off'], ['rain off please', 'rain off'], ['make rain 60', 'rain 60'], ['set volume to 30', 'vol 30'], ['mute the sound', 'mute'],
    ['play some piano', 'piano'], ['play the next track', 'next track'], ['stop the music', 'music off'],
    ['turn on zen mode', 'zen on'], ['hide the sound wave', 'wave off'], ['turn notifications off', 'notifications off'],
    ['change language to japanese', 'language ja'], ['switch to english', 'english'],
    ['show me how to use this', 'tour'], ['open the tutorial', 'tour'],
    ['pause', 'pause'], ['stop the timer', 'pause'], ['skip this one', 'skip'], ['start again', 'reset'],
    ['hello there', null], ['what time is it', null], ['is it going to rain today', null], ['rain and zen', ['rain', 'zen']]
  ],
  'zh-Hans': [
    ['帮我定个45分钟的闹钟', 'in 45m'], ['下午3点开会', '15:00 开会'], ['每天早上7点叫我起床', '7:00 起床 daily'], ['每天 7:00 起床', '7:00 起床 daily'],
    ['半小时后提醒我泡茶', 'in 30m 泡茶'], ['每小时提醒我喝水', 'every 1h 喝水'], ['十点半提醒我开会', '10:30 开会'], ['把音乐关了', 'music off'],
    ['切换到日语', 'language ja'], ['你好', null]
  ],
  'zh-Hant': [
    ['幫我設一個45分鐘的鬧鐘', 'in 45m'], ['下午3點開會', '15:00 開會'], ['每天早上7點叫我起床', '7:00 起床 daily'], ['半小時後提醒我泡茶', 'in 30m 泡茶'],
    ['把音樂關掉', 'music off'], ['切換到日文', 'language ja'], ['你好', null]
  ],
  ja: [
    ['45分のアラームをセットして', 'in 45m'], ['7時半に起こして', '7:30'], ['14時30分 会議', '14:30 会議'], ['午後3時に薬を飲む', '15:00 薬を飲む'],
    ['雨を消して', 'rain off'], ['音楽を止めて', 'music off'], ['英語に切り替えて', 'language en'], ['25分集中したい', 'focus 25'], ['こんにちは', null]
  ],
  ko: [
    ['45분 알람 맞춰줘', 'in 45m'], ['오후 3시 회의', '15:00 회의'], ['1시간 30분 후 차', 'in 1h30m 차'], ['한 시간 뒤에 알려줘', 'in 1h'],
    ['매일 아침 7시 기상', '7:00 기상 daily'], ['비 꺼줘', 'rain off'], ['음악 멈춰', 'music off'], ['영어로 바꿔줘', 'language en'], ['안녕하세요', null]
  ]
};
const own = {
  en: [['rain 60', 'rain 60']],
  'zh-Hans': [['关雨声', 'rain off'], ['音乐 关', 'music off'], ['第3首', 'track 3'], ['6轮', 'rounds 6'], ['语言 自动', 'language auto']],
  'zh-Hant': [['聲波 關', 'wave off'], ['第2首', 'track 2'], ['下一首', 'next track'], ['提示音 鈴聲', 'chime bell']],
  ja: [['音楽をオフ', 'music off'], ['3曲目', 'track 3'], ['チャイム デジタル', 'chime digital'], ['使い方', 'tour']],
  ko: [['파형 끄기', 'wave off'], ['음악 꺼', 'music off'], ['다음 곡', 'next track'], ['목표 2시간', 'goal 2h']]
};
for (const id of ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko']) {
  const d = id === 'en' ? en : (await import(`./js/lang/${id}.js`)).default;
  const cmdT = { ...en.cmd, ...d.cmd }, name = k => d[k] || en[k];
  const names = Object.fromEntries([...['rain', 'fire', 'vinyl', 'wind', 'forest', 'ocean'].map(k => [name('layer.' + k), k]), ...V.map(v => [name('vibe.' + v), v])]);
  const nn = s => normalizeCommand(s, { ...cmdT, names });
  for (const g of Object.keys(en.cmd.groups)) assert.ok(cmdT.groups[g] && name('cmd.group.' + g), `${id}: group ${g}`);
  for (const x of Object.values(cmdT.groups).flat()) if (!x.endsWith('…')) assert.ok(parseCommand(nn(x), V), `${id}: example "${x}"`);
  for (const [typed, english] of own[id]) assert.equal(nn(typed), english, `${id}: ${typed}`);
  // everyday sentences, as the box reads them: the exact forms first, then the sentence reader.
  // The expected value is the exact form it must mean; null means "not understood"; a list means "choices".
  const T = { ...cmdT, names }, read = s => parseCommand(nn(s), V) || readSentence(s, T, V);
  for (const [typed, want] of SENTENCES[id]) {
    const got = read(typed);
    if (want === null) assert.deepEqual(got, [], `${id}: "${typed}" should not be understood`);
    else if (Array.isArray(want)) assert.deepEqual(got, want, `${id}: "${typed}" should give choices`);
    else assert.deepEqual(Array.isArray(got) ? (got.length === 1 ? parseCommand(got[0], V) : got) : got, parseCommand(want, V), `${id}: "${typed}"`);
  }
}

// alarm schedule. Wed 2026-11-11 10:00 local.
const wed10 = new Date(2026, 10, 11, 10, 0, 0).getTime();
const at = (h, m, repeat = 'once') => ({ kind: 'at', h, m, repeat });
assert.equal(nextFire(at(14, 30), wed10), new Date(2026, 10, 11, 14, 30).getTime());   // later today
assert.equal(nextFire(at(9, 0), wed10), new Date(2026, 10, 12, 9, 0).getTime());       // already past → tomorrow
assert.equal(nextFire(at(10, 0), wed10), new Date(2026, 10, 12, 10, 0).getTime());     // exactly now → tomorrow
const fri18 = new Date(2026, 10, 13, 18, 0).getTime();
assert.equal(nextFire(at(9, 0, 'weekdays'), fri18), new Date(2026, 10, 16, 9, 0).getTime()); // skips the weekend
assert.equal(nextFire({ kind: 'every', ms: 30 * MIN }, wed10), wed10 + 30 * MIN);

// alarm manager: ring, repeat, missed
const rang = [], missed = [];
const { bus } = await import('./js/bus.js');
bus.on('alarm:ring', a => rang.push(a.label));
bus.on('alarm:missed', a => missed.push(a.label));
alarms.add({ type: 'alarmIn', ms: MIN, label: 'tea' }, wed10);
alarms.add({ type: 'alarmEvery', ms: 10 * MIN, label: 'water' }, wed10);
alarms.check(wed10 + 30000);
assert.deepEqual(rang, []);
alarms.check(wed10 + MIN + 500);
assert.deepEqual(rang, ['tea']);
assert.equal(alarms.all().length, 1);                       // one-off is gone, repeating stays
alarms.check(wed10 + 10 * MIN + 1000);
assert.deepEqual(rang, ['tea', 'water']);
assert.equal(alarms.upcoming().next, wed10 + 10 * MIN + 1000 + 10 * MIN);
alarms.check(wed10 + 5 * 3600000);                          // page "closed" for hours
assert.deepEqual(missed, ['water']);
assert.deepEqual(rang, ['tea', 'water']);

// plan + timer
assert.equal(clockText(25 * MIN), '25:00');
assert.equal(clockText(59001), '01:00');
assert.equal(clockText(90 * MIN + 1000), '1:30:01');
assert.equal(clockText(-5), '00:00');
assert.deepEqual(buildPlan(2), ['focus', 'short', 'focus', 'long']);
assert.equal(buildPlan(4).length, 8);
saveSettings({ focus: 25, short: 5, long: 15, rounds: 2, autoFlow: false });
const done = [];
bus.on('timer:complete', d => done.push(d));
timer.restore();
assert.equal(timer.state.mode, 'focus');
assert.equal(timer.state.totalMs, 25 * MIN);
timer.start();
const t0 = timer.state.endAt - 25 * MIN;
assert.equal(timer.adjust(5 * MIN), true);
assert.equal(timer.state.totalMs, 30 * MIN);
assert.equal(timer.adjust(-31 * MIN), false);                // would drop under 10 s
timer.tick(t0 + 10 * MIN);
assert.equal(Math.round(timer.progress() * 100), 33);
timer.tick(timer.state.endAt + 5);                           // round ends
assert.deepEqual(done, [{ mode: 'focus', minutes: 30 }]);
assert.equal(timer.state.mode, 'short');
assert.equal(timer.state.status, 'idle');
timer.skip();
assert.equal(timer.state.planIndex, 2);
assert.equal(timer.undo(), true);
assert.equal(timer.state.planIndex, 1);
timer.startMode('long');
assert.equal(timer.state.planIndex, 3);
assert.equal(timer.state.status, 'running');
timer.tick(timer.state.endAt + 5);
assert.equal(timer.state.planIndex, 0);                      // cycle wraps

// tracks: each has its own mp3 url, a CC licence (CC0, CC BY or CC BY-SA) and a source page
for (const tr of TRACKS) {
  assert.ok(tr.title && tr.by);
  assert.match(tr.url, /^https:\/\/.+\.mp3$/);
  assert.match(tr.license, /^CC(0| BY)/);
  assert.match(tr.page, /^https:\/\//);
}
assert.equal(new Set(TRACKS.map(x => x.url)).size, TRACKS.length);   // no track twice

console.log('all checks passed');
