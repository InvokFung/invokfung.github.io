// Boot and wiring. Timer and alarm events come in here and go out as scene and sound moments.

import { bus, settings, saveSettings } from './bus.js';
import { t, tn, applyStatic } from './i18n.js';
import { timer } from './timer.js';
import { alarms, alarmTitle } from './alarms.js';
import { stage, VIBES } from './scenes/engine.js';
import { stats } from './stats.js';
import { initUI } from './ui.js';
import { youtube } from './youtube.js';
import { tracks } from './tracks.js';
import { initRing } from './ring.js';

// Sound is an extra. If it fails to load, the timer still works with this stand-in.
const silent = {
  unlock() {}, ready: false, setMaster() {}, mute() {}, muted: false, LAYERS: [], setLayer() {}, setMix() {}, attach: () => false,
  music: { play() {}, pause() {}, toggle() {}, playing: false, setStyle() {}, setVolume() {} },
  chime() {}, ringStart() {}, ringStop() {}, analyser: () => null
};
let sound = silent;
try { sound = (await import('./sound.js')).sound || silent; }
catch (err) { console.warn('./sound.js did not load, running without sound.', err); }
for (const id of ['cozy', 'lofi']) {
  try { stage.register((await import(`./scenes/${id}.js`)).default); }
  catch (err) { console.warn(`Vibe "${id}" did not load.`, err); }
}

const root = document.documentElement, body = document.body;
const $ = id => document.getElementById(id);
const vibe = () => VIBES[settings.vibe] || Object.values(VIBES)[0];
// The made-in-browser music style, or null when tracks or a YouTube link are the music.
const genStyle = () => (settings.musicStyle === 'youtube' || settings.musicStyle === 'tracks' ? null : settings.musicStyle || vibe().music);
const wantTracks = () => settings.music && settings.musicStyle === 'tracks';
const genMusic = () => settings.music && !!genStyle();

// ---------- vibe ----------
// The cursor: a soft dot in the vibe's own colours. CSS reads --cur, --cur-on and --cur-down (see app.css).
function drawCursor(ink, accent) {
  const rim = "stroke='rgba(20,12,18,.55)'";                      // a dark rim, so it reads on a bright sky too
  const dot = (c, r, core, fill) => `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'>`
    + `<circle cx='16' cy='16' r='${r}' fill='${c}' fill-opacity='${fill}' ${rim} stroke-width='3.5'/>`
    + `<circle cx='16' cy='16' r='${r}' fill='none' stroke='${c}' stroke-width='1.6'/>`
    + `<circle cx='16' cy='16' r='${core}' fill='${c}' ${rim} stroke-width='1'/></svg>`;
  const set = (name, svg, fallback) => root.style.setProperty(name, `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, ${fallback}`);
  set('--cur', dot(ink, 9, 2.6, 0), 'auto');                       // resting: a thin ring and a small dot
  set('--cur-on', dot(accent, 11, 4, 0.28), 'pointer');            // over something you can use: wider, in the vibe colour
  set('--cur-down', dot(accent, 8, 5.5, 0.5), 'grabbing');         // sliding along the ring: pressed in
}
function applyVibe(sceneIndex, first) {
  const v = vibe(), digits = $('digits');
  for (const k of ['accent', 'accent2', 'ink', 'shade']) root.style.setProperty('--' + k, v[k]);
  drawCursor(v.ink, v.accent);
  digits.classList.add('swap');                                    // fade the digits while the font changes
  setTimeout(() => {
    root.style.setProperty('--digits', v.digits);
    root.style.setProperty('--face', v.digits.replace(/,\s*[\w-]+\s*$/, ''));   // the same fonts without the last generic one, so CSS can add CJK fonts after it
    body.dataset.vibe = v.id;
    digits.classList.remove('swap');
  }, first ? 0 : 380);
  stage.setVibe(v.id, sceneIndex);
  sound.setMix({ ...v.mix, ...(settings.layers[v.id] || {}) });
  if (genStyle()) sound.music.setStyle(genStyle());
}

// ---------- story: the timer moves the scene ----------
function syncStory() {
  const s = timer.state, p = timer.progress();
  stage.setStory({ session: (s.planIndex + p) / timer.plan().length, round: p, mode: s.mode, running: s.status === 'running' });
}
bus.on('timer', syncStory);
bus.on('timer:tick', syncStory);
bus.on('scene:change', info => { settings.scene = info.index; });
bus.on('scene:videofail', clip => {                               // a clip did not load: go back to drawn scenes
  saveSettings({ sceneKind: 'drawn' });
  bus.emit('toast', { text: t('toast.videoFail', { name: tn('clip', clip.id, clip.name) }), ms: 6000 });
});

// ---------- helpers ----------
function notify(title, text) {
  if (!settings.notify || !document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body: text, tag: 'chilltimer' }); } catch { /* not allowed here */ }
}
let lock = null;
async function keepAwake(on) {
  try {
    if (on && !lock && navigator.wakeLock) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) { await lock.release(); lock = null; }
  } catch { /* the browser said no; not important */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && timer.state.status === 'running') keepAwake(true); });

// ---------- timer moments ----------
bus.on('timer:start', () => {
  if (genMusic()) sound.music.play();
  if (wantTracks()) tracks.play();
  keepAwake(true);
});
bus.on('timer:pause', () => {
  sound.music.pause();
  tracks.pause();
  keepAwake(false);
});
bus.on('timer:complete', d => {
  const focus = d.mode === 'focus', flow = settings.autoFlow ? '.flow' : '';
  if (focus) stats.record(d.minutes);
  if (settings.chime !== 'none') sound.chime(settings.chime);
  if (focus) { body.classList.remove('cheer'); void body.offsetWidth; body.classList.add('cheer'); }
  notify(t(focus ? 'notify.focusDone' : 'notify.breakOver'), t(focus ? 'notify.focusDone.body' : 'notify.breakOver.body', { min: d.minutes }));
  bus.emit('toast', { text: t((focus ? 'toast.focusDone' : 'toast.breakOver') + flow, { min: d.minutes }), ms: 5000 });
  if (settings.autoScene) stage.nextScene(1, 7);
  keepAwake(false);
});

// ---------- alarm moments ----------
bus.on('alarm:ring', a => {
  sound.ringStart();
  notify(a.label ? t('notify.alarm.label', { label: a.label }) : t('notify.alarm'), alarmTitle(a));
});
bus.on('alarm:stop', () => sound.ringStop());
bus.on('alarm:missed', a => bus.emit('toast', { text: t(a.label ? 'toast.missed.label' : 'toast.missed', { title: alarmTitle(a), label: a.label }), ms: 8000 }));

// ---------- YouTube link: background, music, or both ----------
let coverTimer = 0;
function syncYouTube() {
  const show = settings.sceneKind === 'youtube', hear = settings.music && settings.musicStyle === 'youtube';
  if (!(show || hear) || !settings.ytUrl) youtube.stop();
  else if (youtube.link() !== settings.ytUrl) youtube.play(settings.ytUrl);
  youtube.setVisible(show);
  youtube.setAudible(hear && !sound.muted);
  youtube.setVolume(settings.volume);
  clearTimeout(coverTimer);
  if (!show || !youtube.playing()) stage.cover(false);
}
bus.on('yt:playing', () => {                                      // once the video has faded in, stop painting under it
  clearTimeout(coverTimer);
  if (settings.sceneKind === 'youtube') coverTimer = setTimeout(() => stage.cover(true), 3400);
});
bus.on('yt:fail', why => { stage.cover(false); bus.emit('toast', { text: t('toast.yt.' + why), ms: 6000 }); });
bus.on('sound:mute', syncYouTube);

// ---------- settings → effects ----------
bus.on('settings', patch => {
  if ('vibe' in patch) applyVibe(patch.scene || 0, false);
  if ('volume' in patch) sound.setMaster(settings.volume);
  if ('beatKit' in patch) sound.music.setKit('beat', settings.beatKit);
  if ('pianoKit' in patch) sound.music.setKit('piano', settings.pianoKit);
  if ('music' in patch || 'musicStyle' in patch) {
    if (genStyle()) sound.music.setStyle(genStyle());
    if (genMusic()) sound.music.play(); else sound.music.pause();
    if (wantTracks()) tracks.play(); else tracks.pause();
  }
  if (['music', 'musicStyle', 'sceneKind', 'ytUrl', 'volume'].some(k => k in patch)) syncYouTube();
  if ('sceneKind' in patch) stage.setKind(settings.sceneKind);
  if ('zen' in patch) body.classList.toggle('zen', settings.zen);
  if (['focus', 'short', 'long', 'rounds'].some(k => k in patch)) timer.refresh();
});

// Browsers only allow sound after a click or key. Capture phase, so sound is ready before the key acts.
const unlock = () => { sound.unlock(); sound.setMaster(settings.volume); };
addEventListener('pointerdown', unlock, { capture: true });
addEventListener('keydown', unlock, { capture: true });

// ---------- boot ----------
applyStatic();
stage.init($('sceneA'), $('sceneB'));
youtube.mount($('yt'));
tracks.use(sound, settings.track);
bus.on('tracks', () => { if (settings.track !== tracks.index()) saveSettings({ track: tracks.index() }); });
const ui = initUI({ sound });
initRing({ sound });
stage.setKind(settings.sceneKind);
sound.music.setKit('beat', settings.beatKit);                    // the beat and the piano picked last time
sound.music.setKit('piano', settings.pianoKit);
body.classList.toggle('zen', settings.zen);
applyVibe(settings.scene || 0, true);
timer.restore();
syncYouTube();

// One beat every 250 ms from a worker: background tabs slow page timers down, workers keep time.
function beat() {
  const now = Date.now();
  timer.tick(now);
  alarms.check(now);
  bus.emit('beat', now);
}
try {
  const worker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 250)'], { type: 'text/javascript' })));
  worker.onmessage = beat;
} catch { setInterval(beat, 250); }
beat();

requestAnimationFrame(() => body.classList.remove('booting'));

window.ct = { timer, alarms, stage, sound, settings, stats, ui, youtube, tracks };   // handy in the console
