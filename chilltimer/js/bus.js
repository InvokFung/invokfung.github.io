// Event bus, saved state, and settings. Every module talks through these.

const handlers = {};
export const bus = {
  on(evt, fn) { (handlers[evt] ||= []).push(fn); },
  emit(evt, data) { (handlers[evt] || []).forEach(fn => fn(data)); }
};

// JSON in localStorage under a ct2_ prefix. Falls back to memory when storage is blocked.
const mem = {};
export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('ct2_' + key);
      return raw == null ? (key in mem ? mem[key] : fallback) : JSON.parse(raw);
    } catch { return key in mem ? mem[key] : fallback; }
  },
  set(key, value) {
    mem[key] = value;
    try { localStorage.setItem('ct2_' + key, JSON.stringify(value)); } catch { /* memory only */ }
  }
};

export const DEFAULTS = {
  focus: 25, short: 5, long: 15,   // minutes
  rounds: 4,                       // focus rounds before a long break
  autoFlow: false,                 // start the next block without a click
  vibe: 'cozy', scene: 0,
  sceneKind: 'drawn',              // 'drawn' (painted live), 'video' (real footage) or 'youtube' (your link)
  ytUrl: '',                       // the YouTube link, used as background and/or music
  autoScene: true,                 // change scene at each round change
  volume: 0.6,
  layers: {},                      // per vibe: { cozy: { rain: 0.5, … } }
  beatKit: 'mellow', pianoKit: 'felt',   // which beat and which piano (see BEATS and PIANOS in sound.js)
  music: true, musicStyle: null,   // null = the vibe's own live style; or 'piano', 'beat', 'tracks', 'youtube'
  track: 0,                        // which track of the list
  chime: 'soft', chimeVolume: 0.7,
  notify: true,
  wave: true, zen: false,
  goal: 120,                       // daily focus minutes
  lang: 'auto'                     // 'auto' (follow the browser) or a language id from i18n.js
};

export const settings = { ...DEFAULTS, ...store.get('settings', {}) };

export function saveSettings(patch) {
  Object.assign(settings, patch);
  store.set('settings', settings);
  bus.emit('settings', patch);
}
